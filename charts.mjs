/* Narra charts: thin SVG built as strings (no DOM), colours come from CSS classes so both themes work and the strict CSP is respected.
   Every chart carries an accessible summary, and the interface offers the same numbers as a table. Gaps in the data stay gaps. */
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const num=v=>Math.round(v*10)/10;
const dayNo=key=>{const [y,m,d]=key.split("-").map(Number);return Math.round(Date.UTC(y,m-1,d)/86400000);};
const MONTHS_SHORT=["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

/** Daily points as faint dots plus a rolling median line that breaks wherever there is no data. */
export function lineChart({points,line=[],domain,lowLabel="",highLabel="",summary="",width=640,height=190}){
  if(!points.length)return "";
  const pad={l:44,r:12,t:12,b:26},w=width-pad.l-pad.r,h=height-pad.t-pad.b;
  const days=points.map(p=>dayNo(p.day)),min=Math.min(...days),max=Math.max(...days,min+1);
  const [lo,hi]=domain,X=d=>pad.l+((dayNo(d)-min)/(max-min))*w,Y=v=>pad.t+(1-(v-lo)/(hi-lo||1))*h;
  const dots=points.map(p=>`<circle class="chart-dot" cx="${num(X(p.day))}" cy="${num(Y(p.value))}" r="3"/>`).join("");
  let path="",prev=null;
  for(const p of line){
    const gap=prev?dayNo(p.day)-dayNo(prev.day):0;
    path+=`${!prev||gap>4?"M":"L"}${num(X(p.day))} ${num(Y(p.value))} `;prev=p;
  }
  const ticks=[],seen=new Set();
  for(const p of points){const [y,m]=p.day.split("-").map(Number),k=`${y}-${m}`;if(!seen.has(k)){seen.add(k);ticks.push({x:X(p.day),label:MONTHS_SHORT[m-1]});}}
  const step=Math.ceil(ticks.length/6);
  const xt=ticks.filter((_,i)=>i%step===0).map(t=>`<text class="chart-tick" x="${num(t.x)}" y="${height-8}" text-anchor="middle">${t.label}</text>`).join("");
  return `<svg class="chart chart-line" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(summary)}" preserveAspectRatio="xMidYMid meet">
    <line class="chart-axis" x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t+h}"/><line class="chart-axis" x1="${pad.l}" y1="${pad.t+h}" x2="${width-pad.r}" y2="${pad.t+h}"/>
    <line class="chart-grid" x1="${pad.l}" y1="${num(Y((lo+hi)/2))}" x2="${width-pad.r}" y2="${num(Y((lo+hi)/2))}"/>
    <text class="chart-tick" x="${pad.l-6}" y="${pad.t+8}" text-anchor="end">${esc(highLabel)}</text><text class="chart-tick" x="${pad.l-6}" y="${pad.t+h}" text-anchor="end">${esc(lowLabel)}</text>
    ${dots}${path?`<path class="chart-path" d="${path.trim()}"/>`:""}${xt}</svg>`;
}
/** counts: [{label,count,mark?}] → horizontal-free vertical bars with the value above each bar. */
export function barChart({items,summary="",width=520,height=150}){
  if(!items.length)return "";
  const pad={l:8,r:8,t:18,b:28},w=width-pad.l-pad.r,h=height-pad.t-pad.b,max=Math.max(...items.map(i=>i.count),1);
  const bw=w/items.length,gap=Math.min(10,bw*.25);
  const bars=items.map((it,i)=>{
    const bh=(it.count/max)*h,x=pad.l+i*bw+gap/2,y=pad.t+h-bh;
    return `<rect class="chart-bar${it.mark?" is-mark":""}" x="${num(x)}" y="${num(y)}" width="${num(bw-gap)}" height="${num(Math.max(bh,it.count?1.5:0))}" rx="3"/><text class="chart-value" x="${num(x+(bw-gap)/2)}" y="${num(y-4)}" text-anchor="middle">${it.count}</text><text class="chart-tick" x="${num(x+(bw-gap)/2)}" y="${height-9}" text-anchor="middle">${esc(it.label)}</text>`;
  }).join("");
  return `<svg class="chart chart-bars" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(summary)}" preserveAspectRatio="xMidYMid meet"><line class="chart-axis" x1="${pad.l}" y1="${pad.t+h}" x2="${width-pad.r}" y2="${pad.t+h}"/>${bars}</svg>`;
}
/** Small month-by-month strip: a square per month, opacity by count. */
export function monthStrip({months,summary=""}){
  if(!months.length)return "";
  const max=Math.max(...months.map(m=>m.count),1),size=16,gap=4,width=months.length*(size+gap);
  const cells=months.map((m,i)=>{const level=m.count?Math.max(1,Math.ceil((m.count/max)*4)):0;return `<rect class="strip-cell level-${level}" x="${i*(size+gap)}" y="0" width="${size}" height="${size}" rx="4"><title>${esc(m.month)}: ${m.count}</title></rect>`;}).join("");
  return `<svg class="chart chart-strip" width="${Math.round(width*1.35)}" height="${Math.round(size*1.35)}" viewBox="0 0 ${width} ${size}" role="img" aria-label="${esc(summary)}" preserveAspectRatio="xMinYMid meet">${cells}</svg>`;
}
/** Every chart has a table with the same numbers. */
export function dataTable({headers,rows,caption=""}){
  return `<div class="table-wrap"><table class="data-table">${caption?`<caption>${esc(caption)}</caption>`:""}<thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>i===0?`<th scope="row">${esc(c)}</th>`:`<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
export {esc as escapeChart};
