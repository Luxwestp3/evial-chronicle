#!/usr/bin/env python3
"""
Локальная диаризация полной D&D-сессии через sherpa-onnx:
- сегментация: pyannote-segmentation-3.0
- голосовые эмбеддинги: NVIDIA NeMo TitaNet-Large (ONNX)
- сопоставление кластеров и сегментов с 6 проверенными референсами из private/voices/

Использование:
  private/diarizer/.venv/bin/python scripts/audio/diarize.py private/transcripts/session-000
"""
import itertools
import json
import os
import subprocess
import sys
import time
import numpy as np
import soundfile as sf
import sherpa_onnx

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
MODELS = os.path.join(ROOT, "private/diarizer/models")
VOICES_DIR = os.path.join(ROOT, "private/voices")
TMP_VOICES = os.path.join(ROOT, "private/diarizer/tmp-voices")
os.makedirs(TMP_VOICES, exist_ok=True)

SEG_MODEL = os.path.join(MODELS, "sherpa-onnx-pyannote-segmentation-3-0/model.onnx")
EMB_MODEL = os.path.join(MODELS, "nemo_en_titanet_large.onnx")
GIGAAM_DIR = os.path.join(MODELS, "giga-am-v3-punct")

VOICES = [
    ("ГМ", "01-vazgen-gm.m4a"),
    ("Бабалай", "02-ilya-babalai.m4a"),
    ("Геннадиус", "03-vanya-gennadius.m4a"),
    ("Каин", "04-serezha-kain.m4a"),
    ("Хаген", "05-petya-hagen.m4a"),
    ("Азгелас", "06-vadim-azgelos.m4a"),
]


def to_wav16k(src: str, out: str) -> str:
    if not os.path.exists(out):
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-ac", "1", "-ar", "16000", out],
            check=True,
        )
    return out


def norm(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v / n if n > 0 else v


def extract_emb(extractor, samples: np.ndarray, sr: int) -> np.ndarray:
    stream = extractor.create_stream()
    stream.accept_waveform(sr, samples)
    stream.input_finished()
    assert extractor.is_ready(stream)
    return norm(np.array(extractor.compute(stream), dtype=np.float32))


def fmt_ts(sec: float) -> str:
    s = max(0, int(round(sec)))
    h, rem = divmod(s, 3600)
    m, sec_i = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{sec_i:02d}"


def main():
    if len(sys.argv) < 2:
        print("usage: diarize.py <private/transcripts/session-NNN> [num_clusters=6]", file=sys.stderr)
        sys.exit(2)

    session_dir = os.path.abspath(sys.argv[1])
    num_clusters = int(sys.argv[2]) if len(sys.argv) > 2 else 6

    wav_path = os.path.join(session_dir, "audio-16k.wav")
    chunks_meta_path = os.path.join(session_dir, "chunks.json")
    if not os.path.exists(wav_path):
        print(f"нет файла: {wav_path} (сначала запусти scripts/audio/chunk.sh)", file=sys.stderr)
        sys.exit(1)

    emb_cfg = sherpa_onnx.SpeakerEmbeddingExtractorConfig(
        model=EMB_MODEL,
        num_threads=8,
        debug=False,
        provider="cpu",
    )
    extractor = sherpa_onnx.SpeakerEmbeddingExtractor(emb_cfg)

    ref_names = []
    ref_embs = []
    for label, fname in VOICES:
        src = os.path.join(VOICES_DIR, fname)
        out = os.path.join(TMP_VOICES, fname.replace(".m4a", ".wav"))
        to_wav16k(src, out)
        samples_v, sr_v = sf.read(out, dtype="float32")
        ref_names.append(label)
        ref_embs.append(extract_emb(extractor, samples_v, sr_v))
    ref_embs = np.stack(ref_embs)

    samples, sr = sf.read(wav_path, dtype="float32")
    dur_total = len(samples) / sr
    print(f"Диаризация {wav_path} ({dur_total:.1f}s, clusters={num_clusters})...", flush=True)

    t0 = time.time()
    sd_cfg = sherpa_onnx.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(model=SEG_MODEL),
            num_threads=8,
            debug=False,
            provider="cpu",
        ),
        embedding=emb_cfg,
        clustering=sherpa_onnx.FastClusteringConfig(num_clusters=num_clusters, threshold=0.5),
        min_duration_on=0.3,
        min_duration_off=0.3,
    )
    assert sd_cfg.validate(), "Invalid diarization config"
    sd = sherpa_onnx.OfflineSpeakerDiarization(sd_cfg)

    last_pct = [-1]

    def on_progress(done: int, total: int) -> int:
        pct = int(100 * done / max(1, total))
        if pct >= last_pct[0] + 10:
            last_pct[0] = pct
            print(f"  progress: {pct}% ({time.time() - t0:.1f}s)", flush=True)
        return 0

    result = sd.process(samples, callback=on_progress)
    segs = list(result.sort_by_start_time())
    print(f"Готово за {time.time() - t0:.1f}s -> {len(segs)} сегментов", flush=True)

    # Центроиды кластеров (взвешенные по длительности сегментов >= 1.2s)
    clusters = sorted({s.speaker for s in segs})
    cluster_embs = {}
    cluster_dur = {}
    for c in clusters:
        embs = []
        tot = 0.0
        for s in segs:
            if s.speaker != c:
                continue
            dur = s.end - s.start
            tot += dur
            if dur >= 1.2:
                a = max(0, int(s.start * sr))
                b = min(len(samples), int(s.end * sr))
                embs.append(extract_emb(extractor, samples[a:b], sr) * dur)
        cluster_dur[c] = tot
        cluster_embs[c] = norm(np.sum(embs, axis=0)) if embs else np.zeros(ref_embs.shape[1], dtype=np.float32)

    print("\n=== Матрица кластер -> голосовой референс (TitaNet-Large) ===")
    print(f"{'Cluster (dur)':20s}" + "".join(f"{n:>11s}" for n in ref_names))
    sim_mat = np.zeros((len(clusters), len(ref_names)))
    for ci, c in enumerate(clusters):
        for ri in range(len(ref_names)):
            sim_mat[ci, ri] = float(cluster_embs[c] @ ref_embs[ri])
        print(f"SPK_{c} ({cluster_dur[c]:6.1f}s)  "[:20].ljust(20) + "".join(f"{sim_mat[ci, ri]:11.3f}" for ri in range(len(ref_names))))

    best_score = -1e9
    best_perm = None
    for perm in itertools.permutations(range(len(ref_names)), min(len(clusters), len(ref_names))):
        sc = sum(sim_mat[ci, perm[ci]] for ci in range(len(perm)))
        if sc > best_score:
            best_score = sc
            best_perm = perm

    cluster_map = {}
    print("\n=== Маппинг кластеров ===")
    for ci, c in enumerate(clusters):
        if ci < len(best_perm):
            name = ref_names[best_perm[ci]]
            sim = sim_mat[ci, best_perm[ci]]
        else:
            name = f"SPK_{c}"
            sim = 0.0
        cluster_map[c] = name
        print(f"  SPK_{c} ({cluster_dur[c]:6.1f}s) -> {name:12s} (sim={sim:.3f})")

    # Прямое косинусное совпадение для каждого сегмента >= 0.8s
    enriched = []
    for s in segs:
        dur = s.end - s.start
        direct_name = None
        direct_score = 0.0
        if dur >= 0.8:
            a = max(0, int(s.start * sr))
            b = min(len(samples), int(s.end * sr))
            e = extract_emb(extractor, samples[a:b], sr)
            scores = ref_embs @ e
            bi = int(np.argmax(scores))
            direct_name = ref_names[bi]
            direct_score = float(scores[bi])
        enriched.append({
            "start": round(float(s.start), 2),
            "end": round(float(s.end), 2),
            "abs_start": fmt_ts(s.start),
            "abs_end": fmt_ts(s.end),
            "cluster": int(s.speaker),
            "speaker": cluster_map[s.speaker],
            "direct": direct_name,
            "direct_score": round(direct_score, 3),
        })

    # Локальные текстовые якоря GigaAM-v3-punct поверх сегментов TitaNet-Large (0% квоты API)
    has_gigaam = os.path.exists(os.path.join(GIGAAM_DIR, "encoder.int8.onnx"))
    if has_gigaam:
        print("\nЗапускаю GigaAM-v3-punct поверх сегментов TitaNet-Large...", flush=True)
        t_asr0 = time.time()
        recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
            encoder=os.path.join(GIGAAM_DIR, "encoder.int8.onnx"),
            decoder=os.path.join(GIGAAM_DIR, "decoder.onnx"),
            joiner=os.path.join(GIGAAM_DIR, "joiner.onnx"),
            tokens=os.path.join(GIGAAM_DIR, "tokens.txt"),
            num_threads=8,
            sample_rate=16000,
            feature_dim=64,
            decoding_method="greedy_search",
            model_type="nemo_transducer",
            provider="cpu",
        )
        pad = 0.15
        max_slice = 20.0
        for idx_s, seg in enumerate(enriched):
            dur = seg["end"] - seg["start"]
            if dur < 0.35:
                seg["asr_text"] = ""
                continue
            parts = []
            cur = seg["start"]
            while cur < seg["end"]:
                nxt = min(seg["end"], cur + max_slice)
                a = max(0, int((cur - pad) * sr))
                b = min(len(samples), int((nxt + pad) * sr))
                if b - a >= int(0.3 * sr):
                    st = recognizer.create_stream()
                    st.accept_waveform(sr, samples[a:b])
                    recognizer.decode_stream(st)
                    t = st.result.text.strip()
                    if t:
                        parts.append(t)
                cur = nxt
            seg["asr_text"] = " ".join(parts)
            if (idx_s + 1) % 300 == 0:
                print(f"  GigaAM: {idx_s + 1}/{len(enriched)} ({time.time() - t_asr0:.1f}s)", flush=True)
        print(f"GigaAM готов за {time.time() - t_asr0:.1f}s", flush=True)

    out_json = os.path.join(session_dir, "diarization.json")
    with open(out_json, "w") as f:
        json.dump(
            {
                "duration": round(dur_total, 2),
                "cluster_map": {str(k): v for k, v in cluster_map.items()},
                "cluster_durations": {str(k): round(v, 1) for k, v in cluster_dur.items()},
                "segments": enriched,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
    print(f"\nСохранено: {out_json}")

    # Генерируем per-chunk .diar.txt и .anchored.txt для субагентов
    if os.path.exists(chunks_meta_path):
        with open(chunks_meta_path) as f:
            meta = json.load(f)
        for ch in meta["chunks"]:
            s0, s1 = ch["start_sec"], ch["end_sec"]
            diar_lines = [
                f"# Диаризация TitaNet-Large ({ch['name']}: {fmt_ts(s0)} – {fmt_ts(s1)})",
                "# Формат: [старт - конец] (длительность) Кластер [direct=Имя скор, если >= 0.45]",
            ]
            anch_lines = [
                f"# Якоря TitaNet-Large + черновой текст GigaAM-v3 ({ch['name']}: {fmt_ts(s0)} – {fmt_ts(s1)})",
                "# ВНИМАНИЕ: текст GigaAM черновой (путает имена мира и наложения), но [таймкод] и direct=Имя (>= 0.50) сняты точно с этого файла.",
            ]
            for seg in enriched:
                if seg["end"] < s0 or seg["start"] > s1:
                    continue
                dur = seg["end"] - seg["start"]
                if dur < 0.4:
                    continue
                extra = ""
                if seg["direct"] and seg["direct_score"] >= 0.45:
                    extra = f" (direct={seg['direct']} {seg['direct_score']:.2f})"
                diar_lines.append(f"[{seg['abs_start']} - {seg['abs_end']}] ({dur:.1f}s) {seg['speaker']}{extra}")
                if has_gigaam:
                    txt = seg.get("asr_text", "").strip()
                    if txt:
                        anch_lines.append(f"[{seg['abs_start']} - {seg['abs_end']}] {seg['speaker']}{extra}: {txt}")
            out_txt = os.path.join(session_dir, "chunks", f"{ch['name']}.diar.txt")
            with open(out_txt, "w") as f:
                f.write("\n".join(diar_lines) + "\n")
            if has_gigaam:
                out_anch = os.path.join(session_dir, "chunks", f"{ch['name']}.anchored.txt")
                with open(out_anch, "w") as f:
                    f.write("\n".join(anch_lines) + "\n")
        msg = "*.diar.txt и *.anchored.txt" if has_gigaam else "*.diar.txt"
        print(f"Сгенерировано {len(meta['chunks'])} пар {msg} в {os.path.join(session_dir, 'chunks')}")


if __name__ == "__main__":
    main()
