/* Narra "brain": the local context engine and the token economy behind every AI feature.
   Principle: the device does the thinking it can do for free (counting, ranking, compressing, remembering), and the paid model
   only sees what it needs — a compact portrait of the diary, a few relevant passages, and the question.
   Pure, deterministic and dependency-light: no network, no DOM, no storage. The clock is always passed in. */
import {foldRu,stemRu,wordCount} from "./domain.mjs?v=4.6.0";
import {mdToPlain,strip,openChecklistItems} from "./text.mjs?v=4.6.0";
import {dayKey,addDays,median,round1} from "./stats.mjs?v=4.6.0";
import {dimValue,knownDimensions,dimLabel,DEFAULT_CONFIG} from "./checkin.mjs?v=4.6.0";
import {similar,parseTimeHints} from "./semantic.mjs?v=4.6.0";

/* ---------- 1. counting ---------- */
/** A deliberately cautious estimate (real tokenizers differ by model): Russian text costs about 2.5 characters per token. */
export function estimateTokens(text=""){
  const s=String(text);if(!s)return 0;
  const cyr=(s.match(/[Ѐ-ӿ]/g)||[]).length,rest=s.length-cyr;
  return Math.ceil(cyr/2.5+rest/3.7)+2;
}
export const tokensToChars=t=>Math.floor(t*2.5);

/* ---------- 2. budgets: how much the person lets one request cost ---------- */
export const TIERS={
  eco:{id:"eco",name:"Экономный",context:1000,notes:3,history:4,out:450,hint:"Минимум текста в запросе, короткие ответы. Подходит для частых обращений."},
  balanced:{id:"balanced",name:"Сбалансированный",context:2600,notes:6,history:8,out:900,hint:"Золотая середина: достаточно контекста для умных ответов и разумная цена."},
  deep:{id:"deep",name:"Глубокий",context:6000,notes:12,history:14,out:1800,hint:"Больше записей и длиннее ответы. Дороже, зато внимательнее к деталям."},
};
export const tierById=id=>TIERS[id]||TIERS.balanced;

/* ---------- 3. compression ---------- */
export const queryStems=(q="")=>[...new Set((foldRu(q).match(/[\p{L}\p{N}]+/gu)||[]).filter(t=>t.length>=3).map(stemRu))];
const sentencesOf=t=>t.split(/(?<=[.!?…])\s+|\n+/).map(strip).filter(Boolean);
/** Keeps the most informative sentences of a text within `maxChars`, in their original order. Query words, the opening and the closing weigh most. */
export function compressText(text,maxChars,{query=""}={}){
  const plain=strip(mdToPlain(text));
  if(plain.length<=maxChars)return plain;
  const qs=new Set(queryStems(query)),sents=sentencesOf(mdToPlain(text)).map(s=>s.length>260?`${s.slice(0,257)}…`:s);
  if(!sents.length)return plain.slice(0,maxChars);
  const scored=sents.map((s,i)=>{
    let w=0;for(const t of foldRu(s).match(/[\p{L}\p{N}]+/gu)||[])if(qs.has(stemRu(t)))w+=3;
    if(i===0)w+=2.5;else if(i===sents.length-1)w+=1;
    if(s.length<14)w-=1;
    if(/[?!]/.test(s))w+=.4;
    return {i,s,w:w+(1/(1+i))*.3};
  });
  const picked=[];let used=0;
  for(const c of [...scored].sort((a,b)=>b.w-a.w||a.i-b.i)){
    if(used+c.s.length+3>maxChars){if(!picked.length){picked.push({...c,s:`${c.s.slice(0,Math.max(20,maxChars-1))}…`});used=maxChars;}continue;}
    picked.push(c);used+=c.s.length+3;
  }
  picked.sort((a,b)=>a.i-b.i);
  let out="",prev=-1;
  for(const p of picked){out+=(out?(p.i===prev+1?" ":" … "):"")+p.s;prev=p.i;}
  return out;
}
const KIND_RU={thought:"мысль",event:"событие",day:"день",memory:"воспоминание",dream:"сон",decision:"решение",milestone:"веха",letter:"письмо"};
/** One entry as a compact line for a prompt: date, kind, tags, then the gist. */
export function entryDigest(entry,{maxChars=400,query=""}={}){
  const head=[dayKey(entry.happenedAt),KIND_RU[entry.kind]||"мысль"];
  const tags=[...(entry.themes||[]).slice(0,3).map(t=>`#${t}`),...(entry.people||[]).slice(0,3)];
  if(tags.length)head.push(tags.join(" "));
  const title=(entry.title||"").trim();
  const body=compressText(entry.body||"",Math.max(60,maxChars-(title?title.length+4:0)),{query});
  return `[${entry.id.slice(0,6)}] ${head.join(" · ")}${title?` «${title}»`:""}: ${body}`;
}

/* ---------- 4. the portrait of the diary (computed on the device, costs nothing to build) ---------- */
const topN=(arr,n)=>{const m=new Map();for(const x of arr)if(x)m.set(x,(m.get(x)||0)+1);return [...m].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),"ru")).slice(0,n);};
const fmtTop=list=>list.map(([k,c])=>c>1?`${k}×${c}`:k).join(", ");
const daysAgo=(iso,now)=>Math.max(0,Math.floor((now.getTime()-new Date(iso).getTime())/86400000));
function trendWord(recent,before){
  if(recent.length<4||before.length<6)return null;
  const a=median(recent),b=median(before),d=a-b;
  return {now:a,before:b,dir:Math.abs(d)<.5?"без заметных изменений":d>0?"выше обычного":"ниже обычного"};
}
/**
 * The compact "who is writing" card: facts counted locally from entries and check-ins. Stable within a day (dates, not clocks), so the
 * provider's prompt cache can reuse it. Lines are ordered by importance; the tail is dropped first when the budget is tight.
 */
export function buildProfile({entries,checkins=[],config=DEFAULT_CONFIG,chapters=[],notes=[],now=new Date(),maxTokens=700,includeState=true}){
  const act=entries.filter(e=>!e.deletedAt);
  if(!act.length)return {text:"",tokens:0,lines:[],empty:true};
  const today=dayKey(now.toISOString()),d30=addDays(today,-30),d90=addDays(today,-90);
  const sorted=act.slice().sort((a,b)=>new Date(a.happenedAt)-new Date(b.happenedAt));
  const last30=act.filter(e=>dayKey(e.happenedAt)>=d30),last90=act.filter(e=>dayKey(e.happenedAt)>=d90);
  const lines=[];
  lines.push(`Дневник: ${act.length} записей (${dayKey(sorted[0].happenedAt)} … ${dayKey(sorted[sorted.length-1].happenedAt)}); за 30 дней — ${last30.length}, активных дней — ${new Set(last30.map(e=>dayKey(e.happenedAt))).size}.`);
  const themes=topN(last90.flatMap(e=>[...(e.themes||[]),...(e.projects||[])]),6);
  if(themes.length)lines.push(`Частые темы (90 дней): ${fmtTop(themes)}.`);
  const people=topN(last90.flatMap(e=>e.people||[]),6);
  if(people.length)lines.push(`Люди в записях: ${fmtTop(people)}.`);
  const places=topN(last90.map(e=>e.location),3);
  if(places.length)lines.push(`Места: ${fmtTop(places)}.`);
  if(includeState){
    const c30=checkins.filter(c=>dayKey(c.observedAt)>=addDays(today,-14)),cBefore=checkins.filter(c=>{const k=dayKey(c.observedAt);return k<addDays(today,-14)&&k>=addDays(today,-74);});
    const st=[];
    for(const d of knownDimensions(config).slice(0,4)){
      const t=trendWord(c30.map(c=>dimValue(c,d.key)).filter(v=>v!=null),cBefore.map(c=>dimValue(c,d.key)).filter(v=>v!=null));
      if(t){const near=d.values.reduce((b,v)=>Math.abs(v-t.now)<Math.abs(b-t.now)?v:b,d.values[0]);st.push(`${d.short}: «${dimLabel(d,near).toLowerCase()}», ${t.dir}`);}
    }
    if(st.length)lines.push(`Самочувствие по отметкам за 2 недели (к предыдущим 2 месяцам): ${st.join("; ")}.`);
    const emo=topN(checkins.filter(c=>dayKey(c.observedAt)>=d30).flatMap(c=>(c.emotions||[]).map(e=>e.name)),4);
    if(emo.length)lines.push(`Чаще всего отмечаемые чувства (30 дней): ${fmtTop(emo)}.`);
    const trig=topN(checkins.filter(c=>dayKey(c.observedAt)>=d90).flatMap(c=>[...(c.context?.triggers||[]),...(c.context?.needs||[])]),4);
    if(trig.length)lines.push(`Триггеры и потребности в отметках: ${fmtTop(trig)}.`);
  }
  const open=act.filter(e=>e.kind==="decision"&&e.decision?.decision&&!e.decision.outcome).slice(0,3);
  if(open.length)lines.push(`Открытые решения: ${open.map(e=>`«${e.decision.decision.slice(0,70)}»${e.decision.revisitOn?` (вернуться ${e.decision.revisitOn})`:""}`).join("; ")}.`);
  const todo=act.reduce((s,e)=>s+openChecklistItems(e.body),0);
  if(todo)lines.push(`Невыполненных пунктов в чек-листах записей: ${todo}.`);
  const chapter=chapters.filter(c=>c.from&&c.from<=today&&(!c.to||c.to>=today)).sort((a,b)=>String(b.from).localeCompare(String(a.from)))[0];
  if(chapter)lines.push(`Сейчас «глава жизни»: ${chapter.name}.`);
  const latest=act.slice().sort((a,b)=>new Date(b.happenedAt)-new Date(a.happenedAt)).slice(0,3);
  const gap=daysAgo(latest[0].happenedAt,now);
  lines.push(`Последние записи: ${latest.map(e=>`${dayKey(e.happenedAt)} «${(e.title||mdToPlain(e.body).trim().slice(0,40)).replace(/\s+/g," ")}»`).join("; ")}.${gap>=4?` Пауза в письме: ${gap} дн.`:""}`);
  let text=lines.join("\n");
  while(lines.length>2&&estimateTokens(text)>maxTokens){lines.splice(lines.length-2,1);text=lines.join("\n");} // drop from the tail, keep the very first and the very last line
  return {text,tokens:estimateTokens(text),lines,empty:false};
}

/* ---------- 5. retrieval: which entries deserve the model's attention ---------- */
/**
 * Picks the few entries that matter for this question: meaning-based similarity (local index), a small boost for recency and
 * for names the question mentions, time phrases («в прошлом месяце») as filters. Each pick is compressed around the question.
 */
export function retrieve({entries,index=null,query="",limit=6,budgetTokens=1200,now=new Date(),preferIds=[],excludeIds=[],minScore=.06}){
  const act=entries.filter(e=>!e.deletedAt&&!excludeIds.includes(e.id));
  if(!act.length||limit<=0)return {items:[],tokens:0,hints:[]};
  const {hints,rest}=parseTimeHints(query,now);
  const pool=hints.length?act.filter(e=>hints.every(h=>h.test(e.happenedAt))):act;
  const byId=new Map(pool.map(e=>[e.id,e]));
  const score=new Map();
  if(index&&rest){for(const s of similar(index,rest,{limit:limit*4,minScore}))if(byId.has(s.id))score.set(s.id,s.score);}
  const qs=new Set(queryStems(rest)),folded=foldRu(rest);
  for(const e of pool){ // names in the question pull their entries up; light lexical fallback when there is no index
    let b=score.get(e.id)||0;
    for(const n of [...(e.people||[]),...(e.themes||[]),...(e.projects||[])]){const f=foldRu(n);if(f.length>=3&&folded.includes(f))b+=.35;}
    if(!index&&qs.size){let hit=0;const f=foldRu(`${e.title||""} ${e.body||""}`);for(const t of f.match(/[\p{L}\p{N}]+/gu)||[])if(qs.has(stemRu(t)))hit++;if(hit)b+=Math.min(.6,hit*.08);}
    if(b>0)score.set(e.id,b);
  }
  for(const id of preferIds)if(byId.has(id))score.set(id,(score.get(id)||0)+.9);
  if(!score.size&&hints.length)for(const e of pool.slice().sort((a,b)=>new Date(b.happenedAt)-new Date(a.happenedAt)).slice(0,limit))score.set(e.id,.1); // «что было весной?» — no words, only a time
  const ranked=[...score].map(([id,s])=>{const e=byId.get(id),age=Math.max(0,(now-new Date(e.happenedAt))/86400000);return {e,s:s*(1+.25*Math.exp(-age/60))};}).sort((a,b)=>b.s-a.s||new Date(b.e.happenedAt)-new Date(a.e.happenedAt)).slice(0,limit);
  if(!ranked.length)return {items:[],tokens:0,hints:hints.map(h=>h.label)};
  const per=Math.max(120,Math.floor(tokensToChars(budgetTokens)/ranked.length));
  const items=ranked.map(({e,s})=>({id:e.id,at:e.happenedAt,score:round1(s*100)/100,text:entryDigest(e,{maxChars:per,query:rest})}));
  // restore chronology: the model reads a story, not a ranking
  items.sort((a,b)=>String(a.at).localeCompare(String(b.at)));
  return {items,tokens:items.reduce((s,i)=>s+estimateTokens(i.text),0),hints:hints.map(h=>h.label)};
}

/* ---------- 6. the context block of a request ---------- */
/** Static part first (stable → eligible for provider-side prompt caching), volatile part last. */
export function assembleContext({profile="",retrieved=[],extra="",focus=""}){
  const parts=[];
  if(profile)parts.push(`# Портрет дневника (подсчитан на устройстве)\n${profile}`);
  if(focus)parts.push(`# Над чем человек работает сейчас\n${focus}`);
  if(retrieved.length)parts.push(`# Записи, подобранные под этот вопрос\n${retrieved.map(i=>i.text).join("\n")}`);
  if(extra)parts.push(extra);
  const text=parts.join("\n\n");
  return {text,tokens:estimateTokens(text)};
}
/** What a naive "send the lot" approach would have cost — used only to show the person what was saved. */
export function naiveTokens(entries,now=new Date(),days=90){
  const from=addDays(dayKey(now.toISOString()),-days);
  return entries.filter(e=>!e.deletedAt&&dayKey(e.happenedAt)>=from).reduce((s,e)=>s+estimateTokens(`${e.title||""}\n${e.body||""}`),0);
}

/* ---------- 7. memory of a conversation without paying for it ---------- */
const firstSentence=(t,n=150)=>{const s=(sentencesOf(mdToPlain(t))[0]||"").trim();return s.length>n?`${s.slice(0,n-1)}…`:s;};
/** Folds old turns into a short running summary on the device (no API call). Keeps what the person said and what was found out. */
export function rollSummary(prev,dropped,maxChars=1100){
  const add=[];
  for(const m of dropped){
    if(m.role==="user"){const s=firstSentence(m.content);if(s)add.push(`Человек: ${s}`);}
    else if(m.meta?.insight)add.push(`Вывод: ${String(m.meta.insight).slice(0,160)}`);
    else if(m.meta?.focus)add.push(`Фокус: ${String(m.meta.focus).slice(0,140)}`);
  }
  let text=[prev,...add].filter(Boolean).join("\n");
  if(text.length>maxChars){const lines=text.split("\n");while(lines.join("\n").length>maxChars&&lines.length>3)lines.splice(1,1);text=lines.join("\n");} // oldest context goes first, the opening line stays
  return text.slice(0,maxChars+200);
}
/** Keeps the last `keep` messages verbatim (starting on a person's turn) and folds the rest into the summary. */
export function compactHistory(messages,{keep=8,summary="",maxSummary=1100}={}){
  if(messages.length<=keep)return {messages:messages.slice(),summary,changed:false};
  let cut=messages.length-keep;
  while(cut<messages.length&&messages[cut].role!=="user")cut++;
  if(cut>=messages.length)cut=messages.length-1;
  return {messages:messages.slice(cut),summary:rollSummary(summary,messages.slice(0,cut),maxSummary),changed:cut>0};
}

/* ---------- 8. cache of answers: the same question about the same text is never paid for twice ---------- */
/** cyrb53: a small, fast, well-distributed non-cryptographic hash. */
export function hashText(str,seed=0){
  let h1=0xdeadbeef^seed,h2=0x41c6ce57^seed;
  for(let i=0;i<str.length;i++){const ch=str.charCodeAt(i);h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677);}
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
  h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return (4294967296*(2097151&h2)+(h1>>>0)).toString(36);
}
export const cacheKey=(...parts)=>hashText(JSON.stringify(parts));
export class AnswerCache{
  constructor({ttlMs=14*86400000,maxEntries=40,maxChars=160000,rows=[]}={}){this.ttl=ttlMs;this.max=maxEntries;this.maxChars=maxChars;this.map=new Map();for(const r of rows)if(r&&typeof r.k==="string"&&typeof r.v==="string")this.map.set(r.k,r);}
  get(key,now=Date.now()){const r=this.map.get(key);if(!r)return null;if(now-r.t>this.ttl){this.map.delete(key);return null;}r.t2=now;return r;}
  set(key,value,meta={},now=Date.now()){
    this.map.set(key,{k:key,v:String(value),t:now,t2:now,...meta});
    let total=0;for(const r of this.map.values())total+=r.v.length;
    const order=()=>[...this.map.values()].sort((a,b)=>(a.t2||a.t)-(b.t2||b.t));
    while(this.map.size>this.max||total>this.maxChars){const o=order()[0];if(!o||o.k===key)break;total-=o.v.length;this.map.delete(o.k);}
  }
  clear(){this.map.clear();}
  get size(){return this.map.size;}
  toJSON(){return [...this.map.values()];}
}

/* ---------- 9. the meter ---------- */
const MAX_DAYS=62;
export const emptyUsage=()=>({v:1,days:{},total:{calls:0,inTok:0,outTok:0,cachedIn:0,hits:0,saved:0},byFeature:{}});
export function cleanUsage(raw){
  const u=emptyUsage();if(!raw||typeof raw!=="object")return u;
  const n=v=>Number.isFinite(v)&&v>=0?Math.round(v):0;
  for(const [k,d] of Object.entries(raw.days||{}).slice(-MAX_DAYS))if(/^\d{4}-\d{2}-\d{2}$/.test(k)&&d&&typeof d==="object")u.days[k]={calls:n(d.calls),inTok:n(d.inTok),outTok:n(d.outTok),cachedIn:n(d.cachedIn),hits:n(d.hits),saved:n(d.saved)};
  for(const k of Object.keys(u.total))u.total[k]=n(raw.total?.[k]);
  for(const [k,d] of Object.entries(raw.byFeature||{}).slice(0,60))if(/^[\w-]{1,30}$/.test(k)&&d&&typeof d==="object")u.byFeature[k]={calls:n(d.calls),inTok:n(d.inTok),outTok:n(d.outTok)};
  return u;
}
/** Adds one request to the meter. `hit` = answered from the cache (no tokens spent), `saved` = estimated tokens that were not sent. */
export function recordUsage(usage,{feature,inTok=0,outTok=0,cachedIn=0,hit=false,saved=0,now=new Date()}){
  const u=cleanUsage(usage),k=dayKey(now.toISOString());
  const d=u.days[k]||(u.days[k]={calls:0,inTok:0,outTok:0,cachedIn:0,hits:0,saved:0});
  const f=u.byFeature[feature]||(u.byFeature[feature]={calls:0,inTok:0,outTok:0});
  const add=(o,keys)=>{for(const [key,v] of keys)o[key]+=Math.max(0,Math.round(v));};
  if(hit){add(d,[["hits",1],["saved",saved]]);add(u.total,[["hits",1],["saved",saved]]);}
  else{
    add(d,[["calls",1],["inTok",inTok],["outTok",outTok],["cachedIn",cachedIn],["saved",saved]]);
    add(u.total,[["calls",1],["inTok",inTok],["outTok",outTok],["cachedIn",cachedIn],["saved",saved]]);
    add(f,[["calls",1],["inTok",inTok],["outTok",outTok]]);
  }
  const keys=Object.keys(u.days).sort();while(keys.length>MAX_DAYS)delete u.days[keys.shift()];
  return u;
}
export function usageWindow(usage,days,now=new Date()){
  const u=cleanUsage(usage),from=addDays(dayKey(now.toISOString()),-(days-1)),out={calls:0,inTok:0,outTok:0,cachedIn:0,hits:0,saved:0};
  for(const [k,d] of Object.entries(u.days))if(k>=from)for(const key of Object.keys(out))out[key]+=d[key]||0;
  return out;
}
/** May this request go out? `cap` = tokens per day (input+output), 0 = no cap. */
export function checkLimit(usage,{dailyCap=0},estIn,estOut,now=new Date()){
  if(!dailyCap)return {ok:true};
  const day=usageWindow(usage,1,now),spent=day.inTok+day.outTok,need=estIn+estOut;
  if(spent>=dailyCap)return {ok:false,reason:"cap",spent,cap:dailyCap,message:`Дневной лимит (${fmtTok(dailyCap)}) исчерпан. Его можно поменять в настройках помощника.`};
  if(spent+need>dailyCap)return {ok:false,reason:"would-exceed",spent,cap:dailyCap,message:`Этот запрос (≈${fmtTok(need)}) выйдет за дневной лимит: сегодня уже потрачено ${fmtTok(spent)} из ${fmtTok(dailyCap)}.`};
  return {ok:true,spent,cap:dailyCap};
}
export function fmtTok(n){n=Math.round(n);return n>=1e6?`${(n/1e6).toFixed(1).replace(".",",")} млн`:n>=10000?`${Math.round(n/1000)} тыс.`:n>=1000?`${(n/1000).toFixed(1).replace(".",",")} тыс.`:String(n);}
/** Optional money estimate; the person types the price of a million tokens once. */
export function costOf(window,{priceIn=0,priceOut=0}){return (window.inTok*priceIn+window.outTok*priceOut)/1e6;}

/* ---------- 10. planning a request ---------- */
/** Output limit per feature and tier; one place decides how much we are willing to read back. */
export function outputBudget(feature,tier){return Math.max(120,Math.min(feature?.out||tier.out,Math.round(tier.out*2)));}
/** Wordcount helper used by callers that need to skip trivial requests. */
export const isTrivial=(text,min=12)=>wordCount(String(text||""))<min;
