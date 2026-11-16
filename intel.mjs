/* Narra on-device intelligence. Pure functions, no network, no model: classic, explainable text statistics.
   Principles (from what people object to in AI journals): nothing runs on its own in the background to judge the person,
   every result shows where it comes from, and the person's own words are quoted, never rewritten.
   - keyness: Dunning's log-likelihood G² (better than χ² for sparse counts) plus an effect size, so rare noise is not «news»;
   - near-duplicates: Jaccard resemblance of word 3-shingles (Broder); the threshold is a practical choice, shown as a percentage;
   - keywords: TF-IDF against the person's own diary (a word is distinctive for an entry if it is rare elsewhere);
   - key sentences: TextRank over sentence similarity — extractive, so the summary is made of the person's own sentences. */

const STOP=new Set(("и в во не что он на я с со как а то все всё она так его но да ты к у же вы за бы по только ее её мне было вот от меня еще ещё нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее неё сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это очень день сегодня вчера просто весь вся мои мою моё свой своё свои снова утром днем днём вечером ночью долго неделе неделю недели завтра было были буду будем есть нужно надо хочется кажется очень".split(" ")));
const fold=s=>String(s||"").toLocaleLowerCase("ru-RU").replace(/ё/g,"е");
const plain=s=>String(s||"").replace(/!?\[[^\]]*\]\([^)]*\)/g," ").replace(/https?:\/\/\S+/g," ").replace(/[`*_~=#>|]/g," ");
/** Content words of a text, folded; `stem` merges word forms (pass stemRu from domain.mjs). */
export function contentWords(text,{stem=w=>w,minLen=3}={}){
  return (fold(plain(text)).match(/\p{L}+/gu)||[]).filter(w=>w.length>=minLen&&!STOP.has(w)).map(stem);
}

/* ---------- 1. words that became more (or less) frequent: log-likelihood keyness ---------- */
const ll=(a,b,c,d)=>{ // a,b: counts of the word in recent/earlier; c,d: total words in recent/earlier
  const e1=c*(a+b)/(c+d),e2=d*(a+b)/(c+d);
  return 2*((a>0?a*Math.log(a/e1):0)+(b>0?b*Math.log(b/e2):0));
};
/** Compares the last `days` days with everything before. Returns rising and fading words with G² ≥ 6.63 (p < .01, 1 df),
    at least `minCount` uses, and a clear ratio of relative frequencies. `form` gives the most common spelling of each stem. */
export function shiftingWords(entries,{now=new Date(),days=30,stem=w=>w,minCount=4,limit=8}={}){
  const cut=now.getTime()-days*86400000,recent=new Map(),earlier=new Map(),forms=new Map();let nr=0,ne=0;
  for(const e of entries||[]){
    if(e.deletedAt)continue;
    const t=Date.parse(e.happenedAt);if(!Number.isFinite(t)||t>now.getTime())continue;
    const target=t>=cut?recent:earlier;
    for(const raw of (fold(plain(`${e.title||""} ${e.body||""}`)).match(/\p{L}+/gu)||[])){
      if(raw.length<4||STOP.has(raw))continue;
      const k=stem(raw);target.set(k,(target.get(k)||0)+1);
      const f=forms.get(k)||new Map();f.set(raw,(f.get(raw)||0)+1);forms.set(k,f);
      if(t>=cut)nr++;else ne++;
    }
  }
  if(nr<150||ne<300)return {rising:[],fading:[],enough:false,recentWords:nr,earlierWords:ne};
  const out=[];
  for(const k of new Set([...recent.keys(),...earlier.keys()])){
    const a=recent.get(k)||0,b=earlier.get(k)||0;if(a+b<minCount)continue;
    const g=ll(a,b,nr,ne),ratio=((a+.5)/nr)/((b+.5)/ne);
    if(g<6.63||(ratio<2.5&&ratio>1/2.5))continue;
    const form=[...forms.get(k).entries()].sort((x,y)=>y[1]-x[1])[0][0];
    out.push({word:form,stem:k,recent:a,earlier:b,g:Math.round(g*10)/10,ratio});
  }
  const rising=out.filter(x=>x.ratio>1&&x.recent>=minCount).sort((x,y)=>y.g-x.g).slice(0,limit);
  const fading=out.filter(x=>x.ratio<1&&x.earlier>=minCount).sort((x,y)=>y.g-x.g).slice(0,limit);
  return {rising,fading,enough:true,recentWords:nr,earlierWords:ne};
}

/* ---------- 2. near-duplicate entries: Jaccard over word 3-shingles ---------- */
export function shingles(text,w=3){
  const words=fold(plain(text)).match(/[\p{L}\p{N}]+/gu)||[],out=new Set();
  if(words.length<w){if(words.length)out.add(words.join(" "));return out;}
  for(let i=0;i+w<=words.length;i++)out.add(words.slice(i,i+w).join(" "));
  return out;
}
export function jaccard(a,b){if(!a.size||!b.size)return 0;let inter=0;const [s,l]=a.size<b.size?[a,b]:[b,a];for(const x of s)if(l.has(x))inter++;return inter/(a.size+b.size-inter);}
/** Pairs of entries that are almost the same text (pasted twice, saved twice, a copy that was never changed). */
export function nearDuplicates(entries,{threshold=.6,minShingles=10,dismissed=new Set(),limit=30}={}){
  const list=(entries||[]).filter(e=>!e.deletedAt).map(e=>({e,s:shingles(`${e.title||""} ${e.body||""}`)})).filter(x=>x.s.size>=minShingles);
  // candidate pairs share a rare shingle; this keeps the comparison far below n² on a real diary
  const index=new Map();
  list.forEach((x,i)=>{for(const sh of x.s){if(!index.has(sh))index.set(sh,[]);index.get(sh).push(i);}});
  const seen=new Set(),out=[];
  for(const ids of index.values()){
    if(ids.length<2||ids.length>40)continue;
    for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++){
      const key=`${ids[a]}|${ids[b]}`;if(seen.has(key))continue;seen.add(key);
      const x=list[ids[a]],y=list[ids[b]],pairKey=[x.e.id,y.e.id].sort().join("|");
      if(dismissed.has(pairKey))continue;
      const sim=jaccard(x.s,y.s);if(sim>=threshold)out.push({a:x.e,b:y.e,similarity:sim,key:pairKey});
    }
  }
  return out.sort((p,q)=>q.similarity-p.similarity).slice(0,limit);
}

/* ---------- 3. distinctive words of one entry: TF-IDF against the diary ---------- */
/** Builds document frequencies once; `keywordsFor` then ranks one text. */
export function buildDocFreq(entries,{stem=w=>w}={}){
  const df=new Map();let n=0;
  for(const e of entries||[]){if(e.deletedAt)continue;n++;for(const w of new Set(contentWords(`${e.title||""} ${e.body||""}`,{stem,minLen:4})))df.set(w,(df.get(w)||0)+1);}
  return {df,n};
}
/** Words that stand out in this text and also occur in at least `minOther` other entries (so a theme can connect entries). */
export function keywordsFor(text,docFreq,{stem=w=>w,limit=3,minOther=2,exclude=new Set()}={}){
  const words=(fold(plain(text)).match(/\p{L}+/gu)||[]).filter(w=>w.length>=4&&!STOP.has(w));
  const tf=new Map(),forms=new Map();
  for(const raw of words){const k=stem(raw);tf.set(k,(tf.get(k)||0)+1);const f=forms.get(k)||new Map();f.set(raw,(f.get(raw)||0)+1);forms.set(k,f);}
  const {df,n}=docFreq,out=[];
  for(const [k,c] of tf){
    const d=df.get(k)||0;if(d-1<minOther||d>n*.4)continue; // too rare to connect anything, or too common to mean anything
    const form=[...forms.get(k).entries()].sort((x,y)=>y[1]-x[1])[0][0];
    if(exclude.has(form)||exclude.has(k))continue;
    out.push({word:form,score:c*Math.log(n/d)});
  }
  return out.sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>x.word);
}

/* ---------- 4. key sentences of a period: TextRank (extractive) ---------- */
export function sentences(text){
  return (plain(text).replace(/\s+/g," ").match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)||[]).map(s=>s.trim()).filter(s=>s.split(" ").length>=5&&s.length<=320);
}
/** The `limit` most central sentences of a set of entries, in time order, each with the entry it came from. */
export function keySentences(entries,{limit=3,stem=w=>w,iterations=30,damping=.85}={}){
  const items=[];
  for(const e of entries||[])if(!e.deletedAt)for(const s of sentences(e.body||""))items.push({text:s,entry:e,words:new Set(contentWords(s,{stem}))});
  const n=items.length;if(!n)return [];
  if(n<=limit)return items.map(({text,entry})=>({text,entry}));
  const w=items.map(()=>new Float64Array(n)),out=new Float64Array(n);
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
    let inter=0;for(const x of items[i].words)if(items[j].words.has(x))inter++;
    if(!inter)continue;
    const v=inter/(Math.log(items[i].words.size+1)+Math.log(items[j].words.size+1));w[i][j]=w[j][i]=v;out[i]+=v;out[j]+=v;
  }
  let r=new Float64Array(n).fill(1/n);
  for(let it=0;it<iterations;it++){
    const next=new Float64Array(n).fill((1-damping)/n);
    for(let j=0;j<n;j++){if(!out[j])continue;const share=damping*r[j]/out[j];for(let i=0;i<n;i++)if(w[j][i])next[i]+=share*w[j][i];}
    r=next;
  }
  const picked=[...items.keys()].sort((a,b)=>r[b]-r[a]).filter((i,k,arr)=>{ // no two near-identical sentences
    return !arr.slice(0,k).some(j=>r[j]>=r[i]&&[...items[i].words].filter(x=>items[j].words.has(x)).length>=Math.min(items[i].words.size,items[j].words.size)*.7);
  }).slice(0,limit);
  return picked.sort((a,b)=>String(items[a].entry.happenedAt).localeCompare(String(items[b].entry.happenedAt))).map(i=>({text:items[i].text,entry:items[i].entry}));
}

/* ---------- 5. intentions the person wrote down and may want to look at again ---------- */
const INTENT=/(?:^|[\s,;:(—-])(хочу|хотела бы|хотел бы|надо бы|нужно|планирую|собираюсь|решила|решил|попробую|обязательно)\s+([^.!?\n]{6,140})/iu;
/** Sentences like «хочу записаться на курсы» from entries older than `minAgeDays`; never judged, only offered back. */
export function intentions(entries,{now=new Date(),minAgeDays=14,maxAgeDays=365,limit=8,dismissed=new Set()}={}){
  const out=[];
  for(const e of entries||[]){
    if(e.deletedAt)continue;
    const age=(now-Date.parse(e.happenedAt))/86400000;if(!(age>=minAgeDays&&age<=maxAgeDays))continue;
    for(const s of sentences(e.body||"")){
      const m=s.match(INTENT);if(!m)continue;
      const key=`${e.id}|${fold(s).slice(0,60)}`;if(dismissed.has(key))continue;
      if(/\?\s*$/.test(s)||/(?:^|[^\p{L}])не\s+(?:хочу|надо|нужно|собираюсь|планирую)(?![\p{L}])/iu.test(s))continue; // \b does not see Cyrillic letters
      out.push({entry:e,text:s,key,days:Math.round(age)});break; // one per entry is enough
    }
  }
  return out.sort((a,b)=>a.days-b.days).slice(0,limit);
}

/* ---------- 6. people the person has not written about for a while ---------- */
/** People mentioned at least `minMentions` times whose last mention is older than `quietDays`. Offered gently, never as a task. */
export function quietPeople(entityRows,{now=new Date(),quietDays=60,minMentions=3,limit=6}={}){
  return (entityRows||[]).filter(r=>r.type==="person"&&(r.count||0)>=minMentions&&r.last&&(now-Date.parse(r.last))/86400000>=quietDays)
    .map(r=>({...r,days:Math.round((now-Date.parse(r.last))/86400000)})).sort((a,b)=>b.count-a.count).slice(0,limit);
}
