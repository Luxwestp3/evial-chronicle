import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import style from "./styles/contentMeta.scss"

// Sessions carry the real play date, in-world days, and locations in frontmatter,
// rendered above the tags instead of git modification dates.
const SessionDate: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
  const fm = fileData.frontmatter
  if (!fm) {
    return null
  }
  const dateReal = fm.date_real ? String(fm.date_real) : ""
  const dayStart = typeof fm.day_start === "number" ? fm.day_start : null
  const dayEnd = typeof fm.day_end === "number" ? fm.day_end : null
  const dateWorld = fm.date_world ? String(fm.date_world) : ""
  const world =
    dayStart !== null
      ? (() => {
          const dayStr =
            dayEnd !== null && dayEnd !== dayStart
              ? `Дни ${dayStart}–${dayEnd}`
              : `День ${dayStart}`
          return dateWorld ? `${dayStr} · ${dateWorld}` : dayStr
        })()
      : dateWorld
  const location = fm.location ? String(fm.location) : ""

  if (!dateReal && !world && !location) {
    return null
  }

  return (
    <div class={classNames(displayClass, "chronicle-dates", "session-meta")}>
      {dateReal && <span>🗓 {dateReal}</span>}
      {world && <span>⏳ {world}</span>}
      {location && <span>📍 {location}</span>}
    </div>
  )
}

SessionDate.css = style

export default (() => SessionDate) satisfies QuartzComponentConstructor
