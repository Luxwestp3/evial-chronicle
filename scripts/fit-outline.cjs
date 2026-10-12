// Fit place outlines to a black line drawn over a mini-map screenshot.
// usage: NODE_PATH=node_modules node scripts/fit-outline.cjs image k ox oy R prefix  (screen = map*k + o)
// env: MINC (min line speck size), BRIDGES / CUTS ("x1,y1,x2,y2;..." in screenshot px)
const s=require("sharp"),fs=require("fs");const SP=(process.env.OUT_DIR||"/tmp")+"/";
const MINC=+(process.env.MINC||40);const [img,k,ox,oy,R,pre]=[process.argv[2],+process.argv[3],+process.argv[4],+process.argv[5],+process.argv[6],process.argv[7]];
(async()=>{
const up=await s(img).removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true});const W=up.info.width,H=up.info.height;
const L=Math.floor(-ox/k)-2,T=Math.floor(-oy/k)-2,mw=Math.ceil(W/k)+5,mh=Math.ceil(H/k)+5;
const RW=Math.round(mw*k),RH=Math.round(mh*k);
const ref=await s(require("path").join(__dirname,"../content/maps/evial.jpg")).extract({left:Math.max(L,0),top:Math.max(T,0),width:mw,height:mh}).resize(RW,RH).greyscale().raw().toBuffer();
const dx=L*k+ox,dy=T*k+oy;
const line=new Uint8Array(W*H);
const rgb=await s(img).removeAlpha().raw().toBuffer();
for(let i=0;i<W*H;i++){if(Math.max(rgb[i*3],rgb[i*3+1],rgb[i*3+2])<12)line[i]=1}
// drop specks
{const seen=new Uint8Array(W*H);for(let i=0;i<W*H;i++)if(line[i]&&!seen[i]){const q=[i],c=[i];seen[i]=1;while(q.length){const j=q.pop();const x=j%W,y=(j/W)|0;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const xx=x+a,yy=y+b;if(xx<0||yy<0||xx>=W||yy>=H)continue;const t=yy*W+xx;if(line[t]&&!seen[t]){seen[t]=1;q.push(t);c.push(t)}}}if(c.length<MINC)for(const t of c)line[t]=0}}
// manual bridges: "x1,y1,x2,y2;..." in screenshot px
for(const seg of (process.env.BRIDGES||"").split(";").filter(Boolean)){const [x1,y1,x2,y2]=seg.split(",").map(Number);const n=Math.ceil(Math.hypot(x2-x1,y2-y1));for(let t=0;t<=n;t++){const x=Math.round(x1+(x2-x1)*t/n),y=Math.round(y1+(y2-y1)*t/n);for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)line[(y+b)*W+x+a]=1}}
const P=[];for(let i=0;i<W*H;i++)if(line[i])P.push(i);
const disk=(arr,val,list)=>{for(const i of list){const x=i%W,y=(i/W)|0;for(let a=-R;a<=R;a++)for(let b=-R;b<=R;b++)if(a*a+b*b<=R*R){const xx=x+a,yy=y+b;if(xx>=0&&yy>=0&&xx<W&&yy<H)arr[yy*W+xx]=val}}};
const dil=new Uint8Array(W*H);disk(dil,1,P);
const ext=new Uint8Array(W*H);const st=[];for(let x=0;x<W;x++){st.push(x,(H-1)*W+x)}for(let y=0;y<H;y++){st.push(y*W,y*W+W-1)}
for(const i of st)if(!dil[i])ext[i]=1;const stack=st.filter(i=>ext[i]);
while(stack.length){const i=stack.pop();const x=i%W,y=(i/W)|0;for(const [a,b] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+a,yy=y+b;if(xx<0||yy<0||xx>=W||yy>=H)continue;const j=yy*W+xx;if(!ext[j]&&!dil[j]){ext[j]=1;stack.push(j)}}}
const E=[];for(let i=0;i<W*H;i++)if(ext[i]){const x=i%W,y=(i/W)|0;if((x>0&&!ext[i-1])||(x<W-1&&!ext[i+1])||(y>0&&!ext[i-W])||(y<H-1&&!ext[i+W]))E.push(i)}
const reg=new Uint8Array(W*H);for(let i=0;i<W*H;i++)reg[i]=ext[i]?0:1;disk(reg,0,E);
for(const seg of (process.env.CUTS||"").split(";").filter(Boolean)){const [x1,y1,x2,y2]=seg.split(",").map(Number);const n=Math.ceil(Math.hypot(x2-x1,y2-y1));for(let t=0;t<=n;t++){const x=Math.round(x1+(x2-x1)*t/n),y=Math.round(y1+(y2-y1)*t/n);for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)reg[(y+b)*W+x+a]=0}}
const out=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){out[i*3]=reg[i]?140:0;out[i*3+1]=line[i]?255:0}
await s(out,{raw:{width:W,height:H,channels:3}}).png().toFile(SP+pre+"-reg.png");
// components + contours
const lab=new Int32Array(W*H);let nl=0;const comps=[];
for(let i=0;i<W*H;i++)if(reg[i]&&!lab[i]){nl++;let c=0;const q=[i];lab[i]=nl;while(q.length){const j=q.pop();c++;const x=j%W,y=(j/W)|0;for(const [a,b] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+a,yy=y+b;if(xx<0||yy<0||xx>=W||yy>=H)continue;const t=yy*W+xx;if(reg[t]&&!lab[t]){lab[t]=nl;q.push(t)}}}comps.push([nl,c,i])}
const D=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
function rdp(p,e){if(p.length<3)return p;const [a,b]=[p[0],p[p.length-1]];let md=0,mi=0;const n=Math.hypot(b[1]-a[1],b[0]-a[0])||1e-9;for(let i=1;i<p.length-1;i++){const d=Math.abs((b[1]-a[1])*p[i][0]-(b[0]-a[0])*p[i][1]+b[0]*a[1]-b[1]*a[0])/n;if(d>md){md=d;mi=i}}return md>e?[...rdp(p.slice(0,mi+1),e).slice(0,-1),...rdp(p.slice(mi),e)]:[a,b]}
const polys=[];
for(const [id,c,start] of comps){if(c<200)continue;const at=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&lab[y*W+x]===id;
 const sx=start%W,sy=(start/W)|0;let cur=[sx,sy],dir=7,pts=[];
 do{pts.push(cur);let f=false;for(let kk=0;kk<8;kk++){const d=(dir+6+kk)%8;const n=[cur[0]+D[d][0],cur[1]+D[d][1]];if(at(n[0],n[1])){cur=n;dir=d;f=true;break}}if(!f)break}while((cur[0]!==sx||cur[1]!==sy)&&pts.length<200000);
 const n=pts.length,w=Math.max(3,Math.round(3*k));const sm=[];for(let i=0;i<n;i++){let x=0,y=0;for(let j=-w;j<=w;j++){const p=pts[(i+j+n)%n];x+=p[0];y+=p[1]}sm.push([x/(2*w+1),y/(2*w+1)])}
 const mp=sm.map(([x,y])=>[(x-ox)/k,(y-oy)/k]);const h=Math.floor(mp.length/2);
 const simp=[...rdp(mp.slice(0,h+1),0.35).slice(0,-1),...rdp([...mp.slice(h),mp[0]],0.35).slice(0,-1)];
 polys.push(simp.map(([x,y])=>[Math.round(x*10)/10,Math.round(y*10)/10]));console.log("component",id,"area",c,"points",simp.length)}
fs.writeFileSync(SP+pre+".json",JSON.stringify(polys));
const svg=`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${polys.map(p=>`<polygon points="${p.map(([x,y])=>`${x*k+ox},${y*k+oy}`).join(" ")}" fill="none" stroke="#00a0ff" stroke-width="3" stroke-linejoin="round"/>`).join("")}</svg>`;
const b=await s(img).composite([{input:Buffer.from(svg)}]).png().toBuffer();await s(b).toFile(SP+pre+"-cmp.png");
})()
