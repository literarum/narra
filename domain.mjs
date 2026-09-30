/* Narra domain core: pure, deterministic, dependency-free.
   Everything here is testable in Node and is used by the browser UI unchanged. */

const RU_STOPWORDS = new Set([
  "это","как","что","для","или","был","была","были","было","быть","есть","мне","меня","мой","моя","мои","мы","вы","они",
  "его","ее","её","их","уже","ещё","еще","очень","просто","только","когда","где","который","которая","которые",
  "после","перед","через","сегодня","вчера","завтра","этот","эта","эти","это","этого","этой","этом","тоже","так","такой","такое","также",
  "если","чтобы","потому","может","него","над","под","про","при","без","между","более","менее","много","мало","все","всё","всех",
  "нужно","надо","хочу","хотел","хотела","снова","опять","затем","потом","тогда","здесь","там","сам","сама","себя","себе","свой","свою",
  "решил","решила","думал","думала","стало","было","были","будет","будто","около","чуть","даже","ещё","вот","ним","нее","неё",
  "with","the","and","that","this","from","have","was","were","about","into","when","then"
]);

const RU_SUFFIXES = [
  "иями","ями","ами","ого","его","ому","ему","ыми","ими","ешь","ете","ают","яют","ает","яет","ишь","ите","ись","ать","ять","еть","ить",
  "ией","ого","ой","ый","ий","ая","яя","ое","ее","ые","ие","ом","ем","ах","ях","ов","ев","ей","ию","ия","ью","ья","ам","ям","ую","юю",
  "ет","ут","ют","ит","ат","ят","ло","ла","ли","ть","ся","у","ю","а","я","о","е","ы","и","ь","й"
].sort((a,b)=>b.length-a.length);

/* ---------- small numeric / text helpers ---------- */
export function median(values){
  const v=values.filter(x=>x!=null && Number.isFinite(Number(x))).map(Number).sort((a,b)=>a-b);
  if(!v.length) return null;
  const m=Math.floor(v.length/2);
  return v.length%2?v[m]:(v[m-1]+v[m])/2;
}
export function nextRevision(previousRevision){ return (Number(previousRevision)||0)+1; }
export function insightEligible(sampleSize, minimum=10){ return Number(sampleSize)>=minimum; }
export function pluralRu(number, one, few, many){
  const n=Math.abs(Number(number))%100, n1=n%10;
  if(n>10&&n<20) return many;
  if(n1>1&&n1<5) return few;
  if(n1===1) return one;
  return many;
}
export function capitalizeRu(text=""){ return text? text.charAt(0).toLocaleUpperCase("ru-RU")+text.slice(1):text; }
export function wordCount(text=""){
  return (String(text).match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)||[]).length;
}
/** Signed number with a typographic minus and Russian decimal comma: -0.5 -> "−0,5", 1 -> "+1". */
export function formatSigned(n){
  const v=Number(n); if(!Number.isFinite(v)) return "";
  const body=String(Math.abs(v)).replace(".",",");
  return v>0?`+${body}`:v<0?`−${body}`:"0";
}
export function formatNumberRu(n){ return String(Number(n)).replace(".",","); }

const SCALES={
  mood:["очень низкое","низкое","нейтральное","хорошее","очень хорошее"],
  energy:["очень мало","мало","средне","много","очень много"],
  tension:["очень низкое","низкое","среднее","высокое","очень высокое"]
};
/** Human wording for an ordinal median. Half-steps are described as a range, never rounded silently. */
export function scaleLabel(kind, value){
  const labels=SCALES[kind]; if(!labels||value==null||!Number.isFinite(Number(value))) return "";
  const idx=kind==="mood"?Number(value)+2:Number(value)-1;
  if(Number.isInteger(idx)) return labels[Math.max(0,Math.min(4,idx))];
  const lo=Math.max(0,Math.min(4,Math.floor(idx))), hi=Math.max(0,Math.min(4,Math.ceil(idx)));
  return `${labels[lo]} — ${labels[hi]}`;
}

/* ---------- Russian light stemming & folding ---------- */
export function foldRu(text=""){
  // Length-preserving fold: lower-case and ё→е. Length must not change so ranges map back to the original text.
  const src=String(text),fast=src.toLowerCase();
  if(fast.length===src.length)return fast.replace(/ё/g,"е");
  return src.replace(/[\s\S]/gu,ch=>{const l=ch.toLowerCase();return l.length===ch.length?l:ch;}).replace(/ё/g,"е");
}
export function stemRu(word=""){
  const w=foldRu(word);
  if(w.length<4||!/^[а-я]+$/u.test(w)) return w;
  for(const suffix of RU_SUFFIXES){
    if(w.endsWith(suffix)&&w.length-suffix.length>=3&&(w.length>4||suffix.length===1)) return w.slice(0,-suffix.length);
  }
  return w;
}
function wordsOf(text){ return foldRu(text).match(/[\p{L}\p{N}]+/gu)||[]; }

/* ---------- query parsing & search ---------- */
export function normalizeQuery(query=""){
  const q=query.trim();
  const pairs=[['"','"'],['«','»'],['“','”']];
  for(const [open,close] of pairs) if(q.length>=2&&q.startsWith(open)&&q.endsWith(close)&&!q.slice(1,-1).includes(open)) return {needle:q.slice(open.length,-close.length),exact:true};
  return {needle:q,exact:false};
}
/** "тихая улица" «пляж» дождь  ->  {phrases:["тихая улица","пляж"], tokens:["дождь"]} */
const STOP_WORDS=new Set(["в","во","на","и","с","со","к","ко","о","об","по","за","из","у","а","но","я","мы","он","она","что","это","не","от","до","для","же","бы","ли"]);
export function parseQuery(query=""){
  const phrases=[]; let rest=String(query);
  rest=rest.replace(/"([^"]+)"|«([^»]+)»|“([^”]+)”/gu,(_,a,b,c)=>{const p=(a||b||c||"").trim();if(p)phrases.push(p);return " ";});
  let tokens=[...new Set(wordsOf(rest))].filter(t=>t.length>0);
  const meaningful=tokens.filter(t=>t.length>1&&!STOP_WORDS.has(t));
  if(meaningful.length||phrases.length) tokens=meaningful; // "в горы" searches for "горы"; a lone "в" is left alone
  return {phrases,tokens,empty:!phrases.length&&!tokens.length};
}
function entryFields(entry,kindLabels={}){
  return {
    title:foldRu(entry.title||""),
    body:foldRu(entry.body||""),
    meta:foldRu(`${(entry.themes||[]).join(" ")} ${(entry.people||[]).join(" ")} ${entry.location||""} ${kindLabels[entry.kind]||""}`)
  };
}
/* Folded text and stems are computed once per entry version: the cache is keyed by the entry object and
   invalidated when its title, body or labelled fields change (strings compare by value, so this is cheap). */
const PREP=new WeakMap();
function prepared(entry,kindLabels){
  const metaKey=`${(entry.themes||[]).join(" ")}|${(entry.people||[]).join(" ")}|${entry.location||""}|${kindLabels[entry.kind]||""}`;
  const c=PREP.get(entry);
  if(c&&c.title===entry.title&&c.body===entry.body&&c.metaKey===metaKey)return c;
  const f=entryFields(entry,kindLabels),fresh={title:entry.title,body:entry.body,metaKey,f,ts:null,bs:null,ms:null,w:{}};
  PREP.set(entry,fresh);return fresh;
}
function stemsOf(text){ return wordsOf(text).map(stemRu); }
function withinOneEdit(a,b){
  if(Math.abs(a.length-b.length)>1) return false;
  let i=0,j=0,edits=0;
  while(i<a.length&&j<b.length){
    if(a[i]===b[j]){i++;j++;continue;}
    if(++edits>1) return false;
    if(a.length>b.length) i++; else if(a.length<b.length) j++; else {i++;j++;}
  }
  return edits+(a.length-i)+(b.length-j)<=1;
}
/* Exact-prefix matching without stemming every word: a stem is always a prefix of its word, so a field that does not even
   contain the query stem cannot match, and only words that start with it need to be stemmed to confirm. Fuzzy matching
   (used only when nothing matched exactly) still works on the full, cached stem list. */
function fieldHit(text,q,fuzzy,prep,slot){
  if(!fuzzy){
    if(!text.includes(q))return false;
    const words=prep.w[slot]||(prep.w[slot]=text.match(/[\p{L}\p{N}]+/gu)||[]);
    for(const w of words)if(w.startsWith(q)&&stemRu(w).startsWith(q))return true;
    return false;
  }
  return tokenHit(q,prep[slot]||(prep[slot]=stemsOf(text)),true);
}
function tokenHit(qstem,stems,fuzzy){
  for(const s of stems){
    if(s.startsWith(qstem)) return true;
    if(fuzzy&&qstem.length>=5&&withinOneEdit(qstem,s.slice(0,qstem.length))) return true;
  }
  return false;
}
/** Relevance of an entry for a parsed query; 0 means no match. AND semantics across tokens and phrases. */
/** Pre-computes the folded text of entries in small idle-time slices so the first search does not pay for all of it. */
export function warmSearchIndex(entries,kindLabels={},{sliceMs=8}={}){
  let i=0;const list=entries.slice();
  return new Promise(resolve=>{
    const step=()=>{
      const end=performance.now()+sliceMs;
      while(i<list.length&&performance.now()<end){prepared(list[i++],kindLabels);}
      if(i>=list.length)return resolve(i);
      (typeof requestIdleCallback==="function"?requestIdleCallback:cb=>setTimeout(cb,16))(step);
    };
    step();
  });
}
export function scoreEntry(entry,parsed,{fuzzy=false,kindLabels={}}={}){
  if(!parsed||parsed.empty) return 0;
  const prep=prepared(entry,kindLabels),f=prep.f;
  let score=0;
  for(const phrase of parsed.phrases){
    const p=foldRu(phrase);
    const inTitle=f.title.includes(p),inBody=f.body.includes(p),inMeta=f.meta.includes(p);
    if(!inTitle&&!inBody&&!inMeta) return 0;
    score+=(inTitle?12:0)+(inMeta?8:0)+(inBody?6:0);
  }
  for(const token of parsed.tokens){
    const q=token.length<3?token:stemRu(token);
    const t=fieldHit(f.title,q,fuzzy,prep,"ts"),m=fieldHit(f.meta,q,fuzzy,prep,"ms"),b=fieldHit(f.body,q,fuzzy,prep,"bs");
    if(!t&&!m&&!b) return 0;
    score+=(t?5:0)+(m?3:0)+(b?1:0);
  }
  return score;
}
export function matchesEntry(entry, query="", options){
  const parsed=parseQuery(query);
  return scoreEntry(entry,parsed,options)>0;
}
/** Character ranges of `text` that satisfy the query; used for safe highlighting on raw (unescaped) text. */
export function highlightRanges(text="",parsed,{fuzzy=false}={}){
  if(!parsed||parsed.empty||!text) return [];
  const folded=foldRu(text),ranges=[];
  for(const phrase of parsed.phrases){
    const p=foldRu(phrase); if(!p) continue;
    let pos=0; while((pos=folded.indexOf(p,pos))!==-1){ranges.push([pos,pos+p.length]);pos+=p.length;}
  }
  const qstems=parsed.tokens.map(t=>t.length<3?t:stemRu(t));
  if(qstems.length){
    for(const m of folded.matchAll(/[\p{L}\p{N}]+/gu)){
      const stem=stemRu(m[0]);
      if(qstems.some(q=>stem.startsWith(q)||(fuzzy&&q.length>=5&&withinOneEdit(q,stem.slice(0,q.length))))) ranges.push([m.index,m.index+m[0].length]);
    }
  }
  ranges.sort((a,b)=>a[0]-b[0]||b[1]-a[1]);
  const merged=[];
  for(const r of ranges){const last=merged[merged.length-1];if(last&&r[0]<=last[1])last[1]=Math.max(last[1],r[1]);else merged.push([...r]);}
  return merged;
}
/** Ranked search. Falls back to one-edit tolerance only when nothing matches strictly. */
export function searchEntries(entries,query,{kindLabels={},filter=()=>true}={}){
  const parsed=parseQuery(query);
  const pool=entries.filter(filter);
  if(parsed.empty) return {parsed,results:pool.slice(),fuzzy:false};
  const run=fuzzy=>pool.map(entry=>({entry,score:scoreEntry(entry,parsed,{fuzzy,kindLabels})})).filter(x=>x.score>0)
    .map(x=>(x.at=Date.parse(x.entry.happenedAt)||0,x)).sort((a,b)=>b.score-a.score||b.at-a.at).map(x=>x.entry);
  let results=run(false),fuzzy=false;
  if(!results.length){results=run(true);fuzzy=results.length>0;}
  return {parsed,results,fuzzy};
}

/* ---------- entry validation, hashtags, dates ---------- */
export function validateCanonicalEntry(entry){
  if(!entry || typeof entry.body!=="string" || !entry.body.trim()) return {ok:false, code:"BODY_REQUIRED"};
  return {ok:true};
}
export function extractHashtags(text=""){
  const result=[], seen=new Set();
  for(const match of text.matchAll(/#([\p{L}\p{N}_-]{2,40})/gu)){
    const value=match[1].toLocaleLowerCase("ru-RU");
    if(!seen.has(value)){seen.add(value);result.push(value);}
  }
  return result.slice(0,12);
}
function validDate(y,m,d){
  const date=new Date(y,m-1,d,12,0,0,0);
  return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d?date:null;
}
const NUM_WORDS={один:1,одну:1,два:2,две:2,три:3,четыре:4,пять:5,шесть:6,семь:7,восемь:8,девять:9,десять:10};
const WEEKDAYS={воскресенье:0,понедельник:1,вторник:2,среду:3,среда:3,четверг:4,пятницу:5,пятница:5,субботу:6,суббота:6};
const B="(?<![\\p{L}\\p{N}_])", E="(?![\\p{L}\\p{N}_])";
export function parseRussianDateHint(text="", referenceDate=new Date()){
  const source=text.toLocaleLowerCase("ru-RU").replace(/ё/g,"е"), ref=new Date(referenceDate); ref.setHours(12,0,0,0);
  const shift=(days)=>{const d=new Date(ref);d.setDate(d.getDate()+days);return d;};
  for(const [pattern,offset,label] of [[new RegExp(`${B}позавчера${E}`,"u"),-2,"позавчера"],[new RegExp(`${B}вчера${E}`,"u"),-1,"вчера"],[new RegExp(`${B}сегодня${E}`,"u"),0,"сегодня"],[new RegExp(`${B}завтра${E}`,"u"),1,"завтра"]]){
    if(pattern.test(source)){const date=shift(offset);return {iso:date.toISOString(),label:`Дата: ${label}`,source:label};}
  }
  const ago=source.match(new RegExp(`${B}(\\d{1,2}|${Object.keys(NUM_WORDS).join("|")})\\s+(день|дня|дней|неделю|недели|недель)\\s+назад${E}`,"u"));
  if(ago){
    const n=/^\d/.test(ago[1])?Number(ago[1]):NUM_WORDS[ago[1]],weeks=ago[2].startsWith("недел");
    if(n>0&&n<=(weeks?12:60)){const date=shift(-n*(weeks?7:1));return {iso:date.toISOString(),label:`Дата: ${ago[0]}`,source:ago[0]};}
  }
  const week=source.match(new RegExp(`${B}неделю назад${E}`,"u"));
  if(week){const date=shift(-7);return {iso:date.toISOString(),label:"Дата: неделю назад",source:week[0]};}
  const past=source.match(new RegExp(`${B}в прошл(?:ый|ую|ое)\\s+(${Object.keys(WEEKDAYS).join("|")})${E}`,"u"));
  if(past){
    const target=WEEKDAYS[past[1]];let back=(ref.getDay()-target+7)%7;if(back===0)back=7;
    const date=shift(-back);return {iso:date.toISOString(),label:`Дата: ${past[0].replace(/^в /,"")}`,source:past[0]};
  }
  const numeric=source.match(/(?<![\d.,/])(0?[1-9]|[12]\d|3[01])[./](0[1-9]|1[0-2])(?:[./](\d{4}|\d{2}))?(?![\d]|[.,]\d)/u);
  if(numeric){
    let year=numeric[3]?Number(numeric[3]):ref.getFullYear(); if(year<100)year+=2000;
    const date=validDate(year,Number(numeric[2]),Number(numeric[1]));
    if(date)return {iso:date.toISOString(),label:`Дата: ${numeric[1]}.${numeric[2]}.${year}`,source:numeric[0]};
  }
  const months={"января":1,"февраля":2,"марта":3,"апреля":4,"мая":5,"июня":6,"июля":7,"августа":8,"сентября":9,"октября":10,"ноября":11,"декабря":12};
  const named=source.match(new RegExp(`${B}([0-3]?\\d)\\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\\s+(\\d{4}))?${E}`,"u"));
  if(named){
    const year=named[3]?Number(named[3]):ref.getFullYear(), date=validDate(year,months[named[2]],Number(named[1]));
    if(date)return {iso:date.toISOString(),label:`Дата: ${named[1]} ${named[2]} ${year}`,source:named[0]};
  }
  return null;
}
export function suggestEntryKindRu(text=""){
  const s=text.toLocaleLowerCase("ru-RU").replace(/ё/g,"е");
  const rules=[
    ["decision",new RegExp(`${B}(решил|решила|решение|выбираю|выбрал|выбрала|вариант[а-я]*)${E}`,"u"),"решение"],
    ["dream",new RegExp(`${B}(сон|приснилось|приснился|приснилась|снилось|снился|снилась)${E}`,"u"),"сон"],
    ["letter",new RegExp(`(?:^\\s*(?:дорогой|дорогая|дорогие|дорогое)${E}|${B}(?:письмо|пишу тебе)${E})`,"u"),"письмо"],
    ["milestone",new RegExp(`${B}(впервые|годовщина|достиг|достигла|важная веха|рубеж)${E}`,"u"),"веха"],
    ["memory",new RegExp(`${B}(вспомнил|вспомнила|помню|воспоминание)${E}`,"u"),"воспоминание"],
    ["event",new RegExp(`${B}(встретил|встретила|поехал|поехала|сходил|сходила|произошло|случилось)${E}`,"u"),"событие"],
  ];
  for(const [kind,pattern,label] of rules)if(pattern.test(s))return {kind,label};
  return null;
}

/* ---------- related entries ---------- */
export function tokenizeForRelated(text=""){
  return [...new Set(wordsOf(text).filter(t=>t.length>=3&&!RU_STOPWORDS.has(t)))].slice(0,200);
}
export function relatedEntryScore(a,b){
  const norm=x=>String(x).toLocaleLowerCase("ru-RU");
  const at=(a.themes||[]).map(norm), bt=(b.themes||[]).map(norm);
  const surfaceA=new Map();
  for(const w of tokenizeForRelated(`${a.title||""} ${a.body||""}`)){const s=stemRu(w);if(!surfaceA.has(s))surfaceA.set(s,w);}
  const stemsB=new Set(tokenizeForRelated(`${b.title||""} ${b.body||""}`).map(stemRu));
  const themeShared=at.filter(x=>bt.includes(x));
  const words=[...surfaceA.entries()].filter(([s])=>stemsB.has(s)&&s.length>=4).map(([,w])=>w);
  const eligible=themeShared.length>0||words.length>=2;
  return {score:eligible?themeShared.length*4+words.length:0,sharedTerms:[...new Set([...themeShared,...words])].slice(0,5)};
}

/* ---------- command palette ---------- */
export function fuzzyScore(query,text,keywords=""){
  const q=foldRu(query.trim());
  if(!q)return 1;
  const one=(source)=>{
    const t=foldRu(source);
    if(!t) return 0;
    if(t.startsWith(q))return 100-q.length;
    const wordStart=t.split(/[\s,;/-]+/).findIndex(w=>w.startsWith(q));
    if(wordStart>=0) return 90-wordStart;
    const direct=t.indexOf(q); if(direct>=0)return 80-direct;
    let qi=0,score=0,last=-2;
    for(let i=0;i<t.length&&qi<q.length;i++)if(t[i]===q[qi]){score+=last===i-1?3:1;last=i;qi++;}
    return qi===q.length?score:0;
  };
  return Math.max(one(text),Math.floor(one(keywords)*.85));
}

export function circularMonthDayDistance(a, b){
  const da=new Date(a),db=new Date(b);
  if(Number.isNaN(da.getTime())||Number.isNaN(db.getTime()))return Infinity;
  const fixed=x=>Date.UTC(2000,x.getMonth(),x.getDate());
  const yearMs=Date.UTC(2001,0,1)-Date.UTC(2000,0,1);
  const raw=Math.abs(fixed(da)-fixed(db));
  return Math.min(raw,yearMs-raw)/86400000;
}

/* ---------- canonical entry model ---------- */
import {cleanCheckin as cleanCheckinRecord,cleanConfig} from "./checkin.mjs?v=4.4.0";
export const SCHEMA="narra.local-prototype.v4.2";
export const SCHEMA_PREFIX="narra.local-prototype.";
export const KINDS=["thought","event","day","memory","dream","decision","milestone","letter"];
const KIND_SET=new Set(KINDS);
export const LINK_TYPES=["related","continuation","decision_followup","custom"];
/** Fields that live in the encrypted `meta` blob of an entry (and of every version snapshot). */
export const ENTRY_META_DEFAULTS=Object.freeze({kind:"thought",sensitive:false,people:[],themes:[],projects:[],location:"",dismissedSuggestions:[],happenedEnd:null,chapterId:null,links:[],decision:null});
export function pickEntryMeta(entry={}){
  const out={};
  for(const [k,d] of Object.entries(ENTRY_META_DEFAULTS)){
    const v=entry[k];
    out[k]=v===undefined||v===null&&d!==null?structuredCloneSafe(d):structuredCloneSafe(v);
  }
  return out;
}
function structuredCloneSafe(v){return v==null||typeof v!=="object"?v:JSON.parse(JSON.stringify(v));}
const isIso=v=>typeof v==="string"&&!Number.isNaN(new Date(v).getTime());
const strArray=(v,max=24)=>Array.isArray(v)?[...new Set(v.filter(x=>typeof x==="string").map(x=>x.trim()).filter(Boolean))].slice(0,max):[];
const text=(v,max)=>typeof v==="string"?v.slice(0,max):"";
export function cleanDecision(raw){
  if(!raw||typeof raw!=="object") return null;
  const out={decision:text(raw.decision,600).trim(),context:text(raw.context,2000).trim(),options:text(raw.options,2000).trim(),expected:text(raw.expected,1200).trim(),
    confidence:Number.isInteger(raw.confidence)&&raw.confidence>=1&&raw.confidence<=5?raw.confidence:null,
    revisitOn:typeof raw.revisitOn==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(raw.revisitOn)&&!Number.isNaN(new Date(`${raw.revisitOn}T12:00:00`).getTime())?raw.revisitOn:"",
    outcome:text(raw.outcome,2000).trim(),outcomeAt:isIso(raw.outcomeAt)?raw.outcomeAt:null};
  const empty=!out.decision&&!out.context&&!out.options&&!out.expected&&out.confidence==null&&!out.revisitOn&&!out.outcome;
  return empty?null:out;
}
export function cleanLinks(raw){
  const seen=new Set(),out=[];
  for(const l of Array.isArray(raw)?raw:[]){
    if(!l||typeof l.to!=="string"||!l.to||l.to.length>80||seen.has(l.to)) continue;
    seen.add(l.to);out.push({to:l.to,type:LINK_TYPES.includes(l.type)?l.type:"related"});
  }
  return out.slice(0,50);
}
/** Cleans the meta blob that both entries and versions carry. Unknown or malformed fields fall back to defaults. */
export function cleanMeta(m,happenedAt=null){
  m=m&&typeof m==="object"?m:{};
  let end=isIso(m.happenedEnd)?m.happenedEnd:null;
  if(end&&happenedAt&&new Date(end)<new Date(happenedAt)) end=null;
  return {kind:KIND_SET.has(m.kind)?m.kind:"thought",sensitive:Boolean(m.sensitive),people:strArray(m.people),themes:strArray(m.themes),projects:strArray(m.projects,12),
    location:text(m.location,200),dismissedSuggestions:strArray(m.dismissedSuggestions,60),happenedEnd:end,
    chapterId:typeof m.chapterId==="string"&&m.chapterId&&m.chapterId.length<=80?m.chapterId:null,links:cleanLinks(m.links),decision:cleanDecision(m.decision)};
}
export function cleanEntry(raw){
  if(!raw||typeof raw!=="object") return null;
  if(typeof raw.id!=="string"||!raw.id||raw.id.length>80) return null;
  if(typeof raw.body!=="string"||!raw.body.trim()) return null;
  if(!isIso(raw.happenedAt)) return null;
  const at=raw.happenedAt;
  return {
    id:raw.id,title:text(raw.title,300),body:raw.body,...cleanMeta(raw,at),
    happenedAt:at,createdAt:isIso(raw.createdAt)?raw.createdAt:at,updatedAt:isIso(raw.updatedAt)?raw.updatedAt:at,
    revision:Math.max(1,Math.floor(Number(raw.revision))||1),favorite:Boolean(raw.favorite),
    completedAt:isIso(raw.completedAt)?raw.completedAt:null,deletedAt:isIso(raw.deletedAt)?raw.deletedAt:null
  };
}
export const cleanCheckin=cleanCheckinRecord;
function cleanVersion(raw){
  if(!raw||typeof raw!=="object"||typeof raw.id!=="string"||typeof raw.entryId!=="string"||typeof raw.body!=="string"||!isIso(raw.createdAt)) return null;
  return {id:raw.id,entryId:raw.entryId,revision:Math.max(1,Math.floor(Number(raw.revision))||1),createdAt:raw.createdAt,source:typeof raw.source==="string"?raw.source.slice(0,40):"import",
    title:text(raw.title,300),body:raw.body,meta:cleanMeta(raw.metadata)};
}
export function cleanChapter(raw){
  if(!raw||typeof raw!=="object"||typeof raw.id!=="string"||!raw.id||raw.id.length>80) return null;
  const name=text(raw.name,80).trim();if(!name) return null;
  const day=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:"";
  const start=day(raw.start),end=day(raw.end);
  return {id:raw.id,name,start,end:start&&end&&end<start?"":end,description:text(raw.description,600).trim(),sort:Number.isFinite(Number(raw.sort))?Number(raw.sort):0};
}
export const REVIEW_SECTIONS=["happened","entities","states","moments","loops","surprised","questions"];
export function cleanReview(raw){
  if(!raw||typeof raw!=="object"||typeof raw.id!=="string"||!/^(week|month|quarter|year):[0-9A-Za-z-]{4,12}$/.test(raw.id)) return null;
  const sections={};
  for(const k of REVIEW_SECTIONS)sections[k]=text(raw.sections?.[k],6000);
  return {id:raw.id,sections,hidden:strArray(raw.hidden,200),updatedAt:isIso(raw.updatedAt)?raw.updatedAt:new Date(0).toISOString()};
}
export function cleanEntityNote(raw){
  if(!raw||typeof raw!=="object"||!/^(person|place|theme|project):.{1,80}$/.test(raw.id||"")) return null;
  return {id:raw.id,type:raw.id.split(":")[0],name:text(raw.name,80).trim()||raw.id.slice(raw.id.indexOf(":")+1),aliases:strArray(raw.aliases,12),note:text(raw.note,1000).trim()};
}

/* ---------- backup import planning (pure) ---------- */
const sameContent=(a,b)=>a.title===b.title&&a.body===b.body;
/** Older exports carry the same structure minus newer fields; every cleaner fills defaults, so migration is explicit but tiny. */
export function migratePayload(payload){
  if(!payload||typeof payload!=="object"||typeof payload.schema!=="string"||!payload.schema.startsWith(SCHEMA_PREFIX)) return null;
  const from=payload.schema;
  return {from,payload:{...payload,schema:SCHEMA,chapters:payload.chapters||[],reviews:payload.reviews||[],entities:payload.entities||[],checkinConfig:payload.checkinConfig||null}};
}
/** Decide what an imported backup would change. Never touches storage; the caller applies the plan.
    Same id + same revision + different text is a conflict: the file's version is imported as a separate copy, nothing is overwritten. */
export function planImport(payload,existing={entries:[],checkins:[],versions:[],chapters:[],reviews:[]}){
  const migrated=migratePayload(payload);
  if(!migrated) return {ok:false,error:"Это не резервная копия Narra: не найден заголовок формата."};
  payload=migrated.payload;
  if(!Array.isArray(payload.entries)) return {ok:false,error:"В файле нет списка записей."};
  const haveEntry=new Map(existing.entries.map(e=>[e.id,e]));
  const haveCheckin=new Set(existing.checkins.map(c=>c.id)),haveVersion=new Set(existing.versions.map(v=>v.id));
  const haveChapter=new Set((existing.chapters||[]).map(c=>c.id)),haveReview=new Map((existing.reviews||[]).map(r=>[r.id,r]));
  const stats={newEntries:0,updatedEntries:0,skippedEntries:0,invalidEntries:0,conflictEntries:0,newCheckins:0,newVersions:0,newChapters:0,newReviews:0};
  const entries=[],idMap=new Map();
  for(const raw of payload.entries){
    const e=cleanEntry(raw);
    if(!e){stats.invalidEntries++;continue;}
    const cur=haveEntry.get(e.id);
    if(!cur){entries.push(e);stats.newEntries++;}
    else if(e.revision>(cur.revision||0)){entries.push(e);stats.updatedEntries++;}
    else if(e.revision===(cur.revision||0)&&typeof cur.body==='string'&&!sameContent(e,cur)){
      const copy={...e,id:`${e.id}~file`,title:e.title?`${e.title} (копия из файла)`:e.title,revision:1};
      idMap.set(e.id,copy.id);entries.push(copy);stats.conflictEntries++;
    }else stats.skippedEntries++;
  }
  const checkins=(Array.isArray(payload.checkins)?payload.checkins:[]).map(cleanCheckinRecord).filter(c=>c&&!haveCheckin.has(c.id));
  stats.newCheckins=checkins.length;
  const importedIds=new Set(entries.map(e=>e.id));
  const versions=(Array.isArray(payload.versions)?payload.versions:[]).map(cleanVersion).filter(v=>v&&!haveVersion.has(v.id)&&(importedIds.has(v.entryId)||haveEntry.has(v.entryId)));
  stats.newVersions=versions.length;
  const chapters=(Array.isArray(payload.chapters)?payload.chapters:[]).map(cleanChapter).filter(c=>c&&!haveChapter.has(c.id));
  stats.newChapters=chapters.length;
  const reviews=(Array.isArray(payload.reviews)?payload.reviews:[]).map(cleanReview).filter(r=>r&&(!haveReview.has(r.id)||new Date(r.updatedAt)>new Date(haveReview.get(r.id).updatedAt||0)));
  stats.newReviews=reviews.length;
  const entities=(Array.isArray(payload.entities)?payload.entities:[]).map(cleanEntityNote).filter(Boolean);
  const config=payload.checkinConfig?cleanConfig(payload.checkinConfig):null;
  return {ok:true,entries,checkins,versions,chapters,reviews,entities,config,fromSchema:migrated.from,stats,
    nothingToDo:!entries.length&&!checkins.length&&!versions.length&&!chapters.length&&!reviews.length&&!entities.length};
}
