/* Narra statistics core: pure, deterministic, dependency-free.
   Everything the "Наблюдения" screens say about the user's own data is computed here, so it can be tested in Node.
   Rules (from the product contract):
   - ordinal variables → rank-based methods and medians, never means;
   - missing data stays missing (no imputation);
   - a result below the minimum number of observations is reported as "not enough data", never as a weak finding;
   - nothing here says anything about causes. */

export const MIN_N=10;      // below this an association is never surfaced
export const STRONG_N=20;   // at or above this the wording may be a little firmer
export const METHOD_VERSION="narra-stats.v1";

const finite=v=>v!=null&&v!==""&&Number.isFinite(Number(v));
export const nums=values=>(values||[]).filter(finite).map(Number);

export function median(values){
  const v=nums(values).sort((a,b)=>a-b);
  if(!v.length) return null;
  const m=Math.floor(v.length/2);
  return v.length%2?v[m]:(v[m-1]+v[m])/2;
}
/** Linear-interpolation quantile (same definition as numpy's default). */
export function quantile(values,q){
  const v=nums(values).sort((a,b)=>a-b);
  if(!v.length) return null;
  if(v.length===1) return v[0];
  const pos=(v.length-1)*Math.min(1,Math.max(0,q)),lo=Math.floor(pos),hi=Math.ceil(pos);
  return v[lo]+(v[hi]-v[lo])*(pos-lo);
}
export function iqr(values){
  const q1=quantile(values,.25),q3=quantile(values,.75);
  return q1==null?null:q3-q1;
}
/** Counts per allowed value, in the order of `domain`. Values outside the domain are ignored. */
export function distribution(values,domain){
  const v=nums(values);
  return domain.map(d=>v.filter(x=>x===d).length);
}
/** How many entries of `domain` (ordinal scale points) actually occur — a plain-language measure of spread. */
export function spread(values,domain){
  const dist=distribution(values,domain),used=dist.filter(c=>c>0).length,n=dist.reduce((a,b)=>a+b,0);
  if(!n) return {label:null,used:0,iqr:null};
  const range=iqr(values);
  const label=used<=1?"почти без колебаний":range<=1?"небольшие колебания":range<=2?"заметные колебания":"широкий разброс";
  return {label,used,iqr:range};
}

/** Average ranks (ties share the mean rank), 1-based. */
export function ranks(values){
  const idx=values.map((v,i)=>[v,i]).sort((a,b)=>a[0]-b[0]);
  const out=new Array(values.length);
  for(let i=0;i<idx.length;){
    let j=i;while(j+1<idx.length&&idx[j+1][0]===idx[i][0])j++;
    const avg=(i+j)/2+1;
    for(let k=i;k<=j;k++)out[idx[k][1]]=avg;
    i=j+1;
  }
  return out;
}
/** Spearman rank correlation. Returns null when it is undefined (fewer than 3 pairs or a constant variable). */
export function spearman(x,y){
  const pairs=[];
  for(let i=0;i<Math.min(x.length,y.length);i++)if(finite(x[i])&&finite(y[i]))pairs.push([Number(x[i]),Number(y[i])]);
  const n=pairs.length;
  if(n<3) return null;
  const rx=ranks(pairs.map(p=>p[0])),ry=ranks(pairs.map(p=>p[1]));
  const mx=rx.reduce((a,b)=>a+b,0)/n,my=ry.reduce((a,b)=>a+b,0)/n;
  let sxy=0,sxx=0,syy=0;
  for(let i=0;i<n;i++){const dx=rx[i]-mx,dy=ry[i]-my;sxy+=dx*dy;sxx+=dx*dx;syy+=dy*dy;}
  if(sxx===0||syy===0) return null;
  return {rho:sxy/Math.sqrt(sxx*syy),n};
}
/** Cliff's delta: P(a>b) − P(a<b), in [−1, 1]. A rank-based effect size that needs no distribution assumptions. */
export function cliffsDelta(a,b){
  const A=nums(a),B=nums(b);
  if(!A.length||!B.length) return null;
  let gt=0,lt=0;
  for(const x of A)for(const y of B){if(x>y)gt++;else if(x<y)lt++;}
  return (gt-lt)/(A.length*B.length);
}
/** Standard normal survival function, Abramowitz–Stegun 7.1.26 via erf; accurate to ~1.5e-7. */
function normalCdf(z){
  const t=1/(1+.3275911*Math.abs(z)/Math.SQRT2);
  const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-z*z/2);
  return z>=0?.5*(1+y):.5*(1-y);
}
/** Two-sided Mann–Whitney U with tie correction and continuity correction (normal approximation). */
export function mannWhitney(a,b){
  const A=nums(a),B=nums(b),n1=A.length,n2=B.length;
  if(!n1||!n2) return null;
  const all=[...A,...B],r=ranks(all);
  let r1=0;for(let i=0;i<n1;i++)r1+=r[i];
  const u1=r1-n1*(n1+1)/2,u2=n1*n2-u1,u=Math.max(u1,u2),mu=n1*n2/2;
  const N=n1+n2,counts=new Map();
  for(const v of all)counts.set(v,(counts.get(v)||0)+1);
  let tie=0;for(const t of counts.values())tie+=t*t*t-t;
  const sigma=Math.sqrt(n1*n2/12*((N+1)-tie/(N*(N-1))));
  if(sigma===0) return {u:u1,p:1,n1,n2};
  const z=(u-mu-.5)/sigma;
  return {u:u1,p:Math.min(1,2*(1-normalCdf(Math.max(z,0)))),n1,n2};
}

/** Wording for an effect size; below "small" nothing is reported at all. */
export function effectLabel(delta){
  const d=Math.abs(delta);
  if(d<.147) return null;
  return d<.33?"small":d<.474?"medium":"large";
}
export function eligibility(n){return n>=STRONG_N?"strong":n>=MIN_N?"tentative":"insufficient";}

/* ---------- time helpers ---------- */
export const dayKey=iso=>{const d=new Date(iso);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
export const dayNumber=key=>{const [y,m,d]=key.split("-").map(Number);return Math.round(Date.UTC(y,m-1,d)/86400000);};
export function addDays(key,n){const [y,m,d]=key.split("-").map(Number),t=new Date(Date.UTC(y,m-1,d+n));return `${t.getUTCFullYear()}-${String(t.getUTCMonth()+1).padStart(2,"0")}-${String(t.getUTCDate()).padStart(2,"0")}`;}
export function daysBetween(a,b){return dayNumber(b)-dayNumber(a);}

/** Daily medians of one metric. `items` are check-ins; days without a value simply do not appear (no interpolation). */
export function dailySeries(items,key){
  const byDay=new Map();
  for(const it of items){
    const raw=key in it?it[key]:it.custom?.[key];
    if(!finite(raw)) continue;
    const k=dayKey(it.observedAt);
    if(!byDay.has(k))byDay.set(k,[]);
    byDay.get(k).push(Number(raw));
  }
  return [...byDay.entries()].map(([day,v])=>({day,value:median(v),count:v.length})).sort((a,b)=>a.day<b.day?-1:1);
}
/** Rolling median over a calendar window (in days, inclusive). A point is produced only when the window holds enough days. */
export function rollingMedian(series,windowDays,{minPoints=3}={}){
  const out=[];
  for(const p of series){
    const start=addDays(p.day,-(windowDays-1));
    const inWin=series.filter(q=>q.day>=start&&q.day<=p.day);
    if(inWin.length>=minPoints)out.push({day:p.day,value:median(inWin.map(q=>q.value)),count:inWin.length});
  }
  return out;
}
/** Current period vs the user's own earlier baseline. Both sides must be eligible or the answer is "insufficient". */
export function baselineCompare(items,key,{today,periodDays=30,baselineDays=90}){
  const cur0=addDays(today,-(periodDays-1)),base1=addDays(cur0,-1),base0=addDays(base1,-(baselineDays-1));
  const pick=(a,b)=>items.filter(it=>{const d=dayKey(it.observedAt);return d>=a&&d<=b;}).map(it=>key in it?it[key]:it.custom?.[key]).filter(finite).map(Number);
  const cur=pick(cur0,today),base=pick(base0,base1);
  const period={from:cur0,to:today},baseline={from:base0,to:base1};
  if(cur.length<MIN_N||base.length<MIN_N) return {ok:false,current:{n:cur.length,median:median(cur)},baseline:{n:base.length,median:median(base)},period,baseline_period:baseline};
  const mc=median(cur),mb=median(base),diff=mc-mb;
  return {ok:true,current:{n:cur.length,median:mc},baseline:{n:base.length,median:mb},diff,direction:diff>0?"up":diff<0?"down":"same",period,baseline_period:baseline};
}

/** Pre/post pairs of the same writing session: median observed change, plus how many went each way. */
export function pairedChange(pairs){
  const d=pairs.filter(p=>finite(p.before)&&finite(p.after)).map(p=>Number(p.after)-Number(p.before));
  const n=d.length;
  if(!n) return {n:0,ok:false};
  return {n,ok:n>=MIN_N,median:median(d),q1:quantile(d,.25),q3:quantile(d,.75),up:d.filter(x=>x>0).length,down:d.filter(x=>x<0).length,same:d.filter(x=>x===0).length};
}

/** Pairs of labels that occur together in the same record, with support counts. */
export function cooccurrence(sets,{minSupport=3,limit=8}={}){
  const counts=new Map();
  for(const s of sets){
    const u=[...new Set(s)].sort();
    for(let i=0;i<u.length;i++)for(let j=i+1;j<u.length;j++){const k=`${u[i]}\u0000${u[j]}`;counts.set(k,(counts.get(k)||0)+1);}
  }
  return [...counts.entries()].filter(([,c])=>c>=minSupport).map(([k,c])=>{const [a,b]=k.split("\u0000");return {a,b,count:c};})
    .sort((x,y)=>y.count-x.count||x.a.localeCompare(y.a,"ru")||x.b.localeCompare(y.b,"ru")).slice(0,limit);
}

export const TIME_BUCKETS=[["ночью",0,5],["утром",6,11],["днём",12,17],["вечером",18,23]];
export function timeOfDay(isos){
  const counts=TIME_BUCKETS.map(()=>0);
  for(const iso of isos){const h=new Date(iso).getHours();const i=TIME_BUCKETS.findIndex(([,a,b])=>h>=a&&h<=b);if(i>=0)counts[i]++;}
  return TIME_BUCKETS.map(([label],i)=>({label,count:counts[i]}));
}
/** Entries per ISO-like week (Monday start) for the last `weeks` weeks ending at `today`. */
export function weeklyCounts(isos,today,weeks=12){
  const t=new Date(`${today}T12:00:00`),dow=(t.getDay()+6)%7,end=addDays(today,6-dow);
  const rows=[];
  for(let w=weeks-1;w>=0;w--){
    const start=addDays(end,-(w*7+6)),stop=addDays(end,-(w*7));
    rows.push({from:start,to:stop,count:isos.filter(iso=>{const k=dayKey(iso);return k>=start&&k<=stop;}).length});
  }
  return rows;
}

/* ---------- day-level state ↔ context association ---------- */
/** One row per local day that has at least one state value: the day's median per metric. */
export function dayStates(checkins,metricKeys){
  const days=new Map();
  for(const c of checkins){
    const k=dayKey(c.observedAt);
    if(!days.has(k))days.set(k,{day:k,values:Object.fromEntries(metricKeys.map(m=>[m,[]])),checkinIds:[]});
    const row=days.get(k);
    for(const m of metricKeys){const raw=m in c?c[m]:c.custom?.[m];if(finite(raw))row.values[m].push(Number(raw));}
    row.checkinIds.push(c.id);
  }
  return [...days.values()].map(r=>({day:r.day,checkinIds:r.checkinIds,...Object.fromEntries(metricKeys.map(m=>[m,median(r.values[m])]))}));
}
/**
 * Association between a context label and one metric, on the level of days.
 * `contextByDay`: Map(day → Set(label)). Returns only findings that pass the evidence rules.
 * Wording is the caller's job, but `direction` is descriptive ("higher"/"lower" than on other days).
 */
export function associate(days,contextByDay,label,metric){
  const withCtx=[],without=[];
  for(const d of days){
    if(!finite(d[metric]))continue;
    (contextByDay.get(d.day)?.has(label)?withCtx:without).push(d);
  }
  const n=withCtx.length,rest=without.length;
  const base={label,metric,n,rest,level:eligibility(Math.min(n,rest))};
  if(n<MIN_N||rest<MIN_N) return {...base,ok:false};
  const a=withCtx.map(d=>d[metric]),b=without.map(d=>d[metric]);
  const delta=cliffsDelta(a,b),size=effectLabel(delta);
  return {...base,ok:true,delta,size,noteworthy:size!=null,direction:delta>0?"higher":"lower",medianWith:median(a),medianWithout:median(b),p:mannWhitney(a,b)?.p??null,
    days:withCtx.map(d=>d.day)};
}

/** Human numbers: "12 отметок" phrasing lives in the UI; here only rounding helpers. */
export const round1=v=>Math.round(v*10)/10;

/** Benjamini–Hochberg: which of many p-values survive when several comparisons are looked at at once. Returns a boolean per input, same order. */
export function benjaminiHochberg(ps,q=.1){
  const idx=ps.map((p,i)=>[p,i]).filter(([p])=>Number.isFinite(p)).sort((a,b)=>a[0]-b[0]),m=idx.length;
  let cut=-1;
  idx.forEach(([p],k)=>{if(p<=((k+1)/m)*q)cut=k;});
  const keep=new Array(ps.length).fill(false);
  for(let k=0;k<=cut;k++)keep[idx[k][1]]=true;
  return keep;
}
