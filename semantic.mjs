/* Narra "search by meaning of words", on this device only.
   No neural network, no network access: a curated Russian concept lexicon + TF-IDF over word stems.
   It is honest about what it is — related words the user can see and switch off — and it never replaces exact search.
   Also parses time hints inside a query ("весной", "в марте 2025", "в прошлом году"). Pure and dependency-free. */
import {stemRu,foldRu,parseQuery,scoreEntry} from "./domain.mjs?v=4.6.0";

/** [id, label, words...]  Words are ordinary dictionary forms; matching is by stem prefix. */
const RAW=[
  ["work","работа","работа","работать","труд","офис","проект","коллега","начальник","босс","задача","дедлайн","клиент","смена","зарплата","карьера","команда","совещание","отчёт","должность","заказчик"],
  ["job-change","смена работы","уволился","уволилась","увольнение","собеседование","оффер","резюме","вакансия","новая работа","переход","повышение","отпуск без","уйти с работы","сокращение","испытательный","заявление","найти работу","искать работу"],
  ["travel","путешествия","поездка","путешествие","отпуск","дорога","билет","поезд","самолёт","аэропорт","вокзал","гостиница","отель","чемодан","экскурсия","маршрут","границ","виза","автобус","каникулы","командировка"],
  ["sea-mountains","море и горы","море","горы","пляж","берег","волна","озеро","река","лес","тропа","поход","палатка","вершина","закат","рассвет","костёр"],
  ["family","семья","семья","мама","папа","мать","отец","брат","сестра","бабушка","дедушка","дети","ребёнок","сын","дочь","родители","родные","племянник","тётя","дядя"],
  ["friends","друзья","друг","подруга","компания","вечеринка","гости","встреча","общение","разговор","созвон","приятель","знакомый"],
  ["love","отношения","любовь","отношения","свидание","партнёр","влюблённость","ссора","расставание","нежность","близость","поцелуй","жена","муж","девушка","парень","свадьба"],
  ["health","здоровье","здоровье","врач","больница","болезнь","простуда","боль","температура","лекарство","анализы","самочувствие","поликлиника","массаж","выздоровление"],
  ["body-sport","движение","спорт","тренировка","бег","зал","йога","плавание","велосипед","растяжка","шаги","пробежка","фитнес"],
  ["sleep","сон","сон","приснилось","кошмар","бессонница","засыпать","проснулся","ночь","дремота","высыпаться","кровать"],
  ["calm","спокойствие","спокойствие","тишина","умиротворение","покой","расслабление","безмятежность","уют","пауза","неспешность","штиль","отдохнул"],
  ["worry","беспокойство","тревога","беспокойство","волнение","страх","нервничать","напряжение","стресс","паника","переживать","опасение","суета"],
  ["joy","радость","радость","счастье","восторг","смех","улыбка","праздник","веселье","удовольствие","ликование","благодарность"],
  ["sadness","грусть","грусть","печаль","тоска","слёзы","одиночество","утрата","скучаю","разочарование","пустота"],
  ["anger","раздражение","злость","раздражение","обида","конфликт","ссора","крик","претензия","возмущение"],
  ["nature","природа","природа","лес","парк","поле","дерево","цветы","солнце","дождь","снег","ветер","небо","птицы","трава","туман"],
  ["seasons","времена года","осень","весна","зима","лето","листопад","оттепель","жара","мороз","первый снег"],
  ["food","еда","еда","завтрак","обед","ужин","кофе","чай","готовка","ресторан","кафе","рецепт","пирог","суп","булочка"],
  ["home","дом","дом","квартира","ремонт","переезд","уборка","кухня","комната","мебель","окно","балкон","коробки","новоселье"],
  ["money","деньги","деньги","зарплата","бюджет","покупка","долг","накопления","цена","расходы","кредит","дорого","подарок"],
  ["study","учёба","учёба","экзамен","лекция","курс","университет","школа","диплом","урок","студент","семинар","сессия","обучение"],
  ["reading","книги","книга","чтение","читал","роман","автор","глава","библиотека","стихи","рассказ","фильм","сериал","кино"],
  ["creativity","творчество","творчество","музыка","рисунок","писать","идея","вдохновение","фото","гитара","картина","песня","пианино","краски"],
  ["decision","решения","решение","выбор","сомнение","вариант","план","цель","мечта","решил","взвесить","компромисс","приоритет"],
  ["change","перемены","перемены","новый этап","начало","конец","рубеж","годовщина","впервые","перелом","поворот","изменения","прощание"],
  ["memory","прошлое","детство","прошлое","воспоминание","ностальгия","старые фото","юность","раньше","когда-то","школьные годы"],
  ["city","город","прогулка","улица","город","набережная","площадь","метро","двор","центр","кофейня","мост","трамвай"],
  ["pets","питомцы","кот","собака","питомец","кошка","щенок","котёнок","хомяк","ветеринар","корм"],
  ["time","время","время","расписание","режим","утро","вечер","выходной","выходные","будни","привычка","ритуал"],
  ["learning","опыт","урок","ошибка","понял","осознал","вывод","опыт","научился","открытие","инсайт"],
];
export const CONCEPTS=RAW.map(([id,label,...words])=>({id,label,words}));

const stemOf=w=>{const parts=foldRu(w).match(/[\p{L}\p{N}]+/gu)||[];return parts.map(p=>p.length<3?p:stemRu(p));};
const CONCEPT_STEMS=CONCEPTS.map(c=>({...c,stems:[...new Set(c.words.filter(w=>!/\s/.test(w)).flatMap(stemOf))]}));
const STEM_TO_CONCEPTS=new Map();
for(const c of CONCEPT_STEMS)for(const s of c.stems){if(!STEM_TO_CONCEPTS.has(s))STEM_TO_CONCEPTS.set(s,[]);STEM_TO_CONCEPTS.get(s).push(c.id);}
const conceptById=Object.fromEntries(CONCEPT_STEMS.map(c=>[c.id,c]));
const wordsOf=text=>foldRu(text).match(/[\p{L}\p{N}]+/gu)||[];

/** Concepts whose vocabulary contains this stem (exact stem or a stem that starts with a ≥4-letter concept stem). */
function conceptsForStem(stem){
  const hit=new Set(STEM_TO_CONCEPTS.get(stem)||[]);
  if(stem.length>=5)for(const [s,ids] of STEM_TO_CONCEPTS)if(s.length>=5&&(stem.startsWith(s)||s.startsWith(stem)))ids.forEach(i=>hit.add(i));
  return [...hit];
}

/** For a query: which concepts each word points to, and which concept words would be searched additionally. */
export function expandQuery(query){
  const {tokens}=parseQuery(query);
  const groups=[];
  for(const t of tokens){
    if(t.length<3) continue;
    const ids=conceptsForStem(stemRu(t));
    for(const id of ids){
      const c=conceptById[id];
      if(!groups.some(g=>g.concept===id))groups.push({concept:id,label:c.label,via:t,words:c.words.filter(w=>!/\s/.test(w)).slice(0,12)});
    }
  }
  return {tokens,groups};
}

/* ---------- index ---------- */
function docTerms(e){
  const terms=new Map(),bump=(s,w)=>terms.set(s,(terms.get(s)||0)+w);
  const add=(text,w)=>{for(const word of wordsOf(text)){if(word.length<3) continue;bump(stemRu(word),w);}};
  add(e.title||"",3);add(e.body||"",1);add(`${(e.themes||[]).join(" ")} ${(e.people||[]).join(" ")} ${e.location||""}`,2);
  return terms;
}
export function buildIndex(entries){
  const docs=new Map(),df=new Map();
  for(const e of entries){
    if(e.deletedAt) continue;
    const terms=docTerms(e),concepts=new Map();
    for(const s of terms.keys())for(const id of conceptsForStem(s))concepts.set(id,(concepts.get(id)||0)+terms.get(s));
    docs.set(e.id,{terms,concepts});
    for(const s of terms.keys())df.set(s,(df.get(s)||0)+1);
    for(const id of concepts.keys())df.set(`#${id}`,(df.get(`#${id}`)||0)+1);
  }
  const N=Math.max(1,docs.size),idf=k=>Math.log(1+N/(1+(df.get(k)||0)));
  for(const d of docs.values()){
    const vec=new Map();let norm=0;
    for(const [s,tf] of d.terms){const w=(1+Math.log(tf))*idf(s);vec.set(s,w);norm+=w*w;}
    for(const [id,tf] of d.concepts){const w=.8*(1+Math.log(tf))*idf(`#${id}`);vec.set(`#${id}`,w);norm+=w*w;}
    d.vec=vec;d.norm=Math.sqrt(norm)||1;
  }
  return {docs,idf,df,size:docs.size};
}
function queryVector(index,query){
  const {tokens}=parseQuery(query),vec=new Map();let norm=0;
  for(const t of tokens){
    if(t.length<3) continue;
    const s=stemRu(t);
    // words that occur nowhere in the journal must not dilute the score of the words that do
    if(index.df.has(s)){const w=index.idf(s);vec.set(s,(vec.get(s)||0)+w);}
    for(const id of conceptsForStem(s)){if(!index.df.has(`#${id}`)) continue;const cw=.8*index.idf(`#${id}`);vec.set(`#${id}`,Math.max(vec.get(`#${id}`)||0,cw));}
  }
  for(const w of vec.values())norm+=w*w;
  return {vec,norm:Math.sqrt(norm)||1,tokens};
}
/** Cosine similarity of every indexed entry with the query, plus a human-readable reason. */
export function similar(index,query,{minScore=.1,limit=50}={}){
  const q=queryVector(index,query);
  if(!q.vec.size) return [];
  const out=[];
  for(const [id,d] of index.docs){
    let dot=0,shared=[];
    for(const [k,w] of q.vec){const dw=d.vec.get(k);if(dw){dot+=w*dw;shared.push(k);}}
    const score=dot/(q.norm*d.norm);
    if(score>=minScore&&shared.length)out.push({id,score,shared});
  }
  return out.sort((a,b)=>b.score-a.score).slice(0,limit);
}

/** Reasons in plain Russian for a similar (non-literal) match. */
export function whyRelated(entry,sharedKeys,query){
  const {tokens}=parseQuery(query),reasons=[];
  const body=foldRu(`${entry.title||""} ${entry.body||""}`);
  const stemToWord=new Map();for(const w of body.match(/[\p{L}\p{N}]+/gu)||[])if(w.length>=3&&!stemToWord.has(stemRu(w)))stemToWord.set(stemRu(w),w);
  for(const k of sharedKeys){
    if(k.startsWith("#")){
      const c=conceptById[k.slice(1)];
      const found=c.stems.map(s=>stemToWord.get(s)).filter(Boolean).filter(w=>!tokens.some(t=>stemRu(t)===stemRu(w))).slice(0,2);
      reasons.push(found.length?`по теме «${c.label}»: ${found.map(w=>`«${w}»`).join(", ")}`:`по теме «${c.label}»`);
    }
  }
  return [...new Set(reasons)].slice(0,2);
}

/** Reciprocal-rank fusion of literal results and similar ones. Literal matches keep their reason; similar ones get theirs. */
export function hybridSearch(index,entries,query,{lexical=[],kindLabels={},filter=()=>true,limit=80}={}){
  const byId=new Map(entries.map(e=>[e.id,e]));
  const sim=similar(index,query,{limit:limit*2}).filter(s=>byId.has(s.id)&&filter(byId.get(s.id)));
  const K=60,score=new Map(),info=new Map();
  lexical.forEach((e,i)=>{score.set(e.id,(score.get(e.id)||0)+1/(K+i));info.set(e.id,{literal:true,related:false,reasons:[]});});
  sim.forEach((s,i)=>{
    score.set(s.id,(score.get(s.id)||0)+.8/(K+i));
    const cur=info.get(s.id)||{literal:false,related:true,reasons:[]};
    cur.related=true;cur.reasons=whyRelated(byId.get(s.id),s.shared,query);info.set(s.id,cur);
  });
  return [...score.entries()].sort((a,b)=>b[1]-a[1]||new Date(byId.get(b[0]).happenedAt)-new Date(byId.get(a[0]).happenedAt)).slice(0,limit)
    .map(([id])=>({entry:byId.get(id),...info.get(id)}));
}
export {scoreEntry};

/* ---------- time hints in a query ---------- */
const MONTH_NOM=["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const MONTH_NAMES=["январе","феврале","марте","апреле","мае","июне","июле","августе","сентябре","октябре","ноябре","декабре"];
const SEASONS={весн:{months:[3,4,5],label:"весна"},лет:{months:[6,7,8],label:"лето"},осен:{months:[9,10,11],label:"осень"},зим:{months:[12,1,2],label:"зима"}};
const pad=n=>String(n).padStart(2,"0");
const keyOf=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
/**
 * Extracts time phrases. Returns {hints:[{id,label,test(iso)}], rest}.
 * `test` receives an ISO date string. Years that are not given mean "any year".
 */
export function parseTimeHints(query="",now=new Date()){
  let rest=String(query);const hints=[];
  const yNow=now.getFullYear();
  const take=(re,build)=>{rest=rest.replace(re,(...m)=>{const h=build(m);if(h)hints.push(h);return h?" ":m[0];});};
  const yearRe="(?:\\s+(20\\d{2}|19\\d{2}))?";
  // seasons: «весной», «весной 2025», «прошлой весной»
  take(new RegExp(`(?<![\\p{L}\\d])(?:(?:в\\s+)?(прошл[а-я]+|эт[а-я]+)\\s+)?(весн[а-я]*|лет[оа-я]*|осен[а-я]*|зим[а-я]*)${yearRe}(?![\\p{L}\\d])`,"giu"),m=>{
    const key=Object.keys(SEASONS).find(k=>foldRu(m[2]).startsWith(k));if(!key) return null;
    if(key==="лет"&&!/^(лето|летом|лета|лету|летний)$/i.test(foldRu(m[2]))) return null; // «летел», «летом» — only real summer words
    const s=SEASONS[key],rel=m[1]?foldRu(m[1]):"",year=m[3]?Number(m[3]):rel.startsWith("прошл")?yNow-1:rel.startsWith("эт")?yNow:null;
    const label=`${s.label}${year?` ${year}`:""}`;
    const seasonYear=iso=>{const d=new Date(iso);return d.getMonth()===11?d.getFullYear()+1:d.getFullYear();};
    return {id:`season:${s.label}:${year||"any"}`,label,test:iso=>{const d=new Date(iso);return s.months.includes(d.getMonth()+1)&&(year==null||seasonYear(iso)===year);}};
  });
  // «в марте», «в марте 2025»
  take(new RegExp(`(?<![\\p{L}\\d])в\\s+(${MONTH_NAMES.join("|")})${yearRe}(?![\\p{L}\\d])`,"giu"),m=>{
    const idx=MONTH_NAMES.indexOf(foldRu(m[1]));if(idx<0) return null;const year=m[2]?Number(m[2]):null;
    return {id:`month:${idx+1}:${year||"any"}`,label:`${MONTH_NOM[idx]}${year?` ${year}`:""}`,
      test:iso=>{const d=new Date(iso);return d.getMonth()===idx&&(year==null||d.getFullYear()===year);}};
  });
  // «в 2024», «за 2024 год»
  take(/(?<![\p{L}\d])(?:в|за)\s+(20\d{2}|19\d{2})(?:\s+год[уа]?)?(?![\p{L}\d])/giu,m=>{const y=Number(m[1]);return {id:`year:${y}`,label:`${y} год`,test:iso=>new Date(iso).getFullYear()===y};});
  take(/(?<![\p{L}\d])(?:в\s+)?(прошлом|этом)\s+году(?![\p{L}\d])/giu,m=>{const y=/прошл/i.test(m[1])?yNow-1:yNow;return {id:`year:${y}`,label:`${y} год`,test:iso=>new Date(iso).getFullYear()===y};});
  // «на прошлой неделе», «в прошлом месяце»
  take(/(?<![\p{L}\d])(?:на\s+)?(прошлой|этой)\s+неделе(?![\p{L}\d])/giu,m=>{
    const t=new Date(now);t.setHours(12,0,0,0);const dow=(t.getDay()+6)%7;t.setDate(t.getDate()-dow-(/прошл/i.test(m[1])?7:0));
    const from=keyOf(t);t.setDate(t.getDate()+6);const to=keyOf(t);
    return {id:`week:${from}`,label:/прошл/i.test(m[1])?"прошлая неделя":"эта неделя",test:iso=>{const k=keyOf(new Date(iso));return k>=from&&k<=to;}};
  });
  take(/(?<![\p{L}\d])(?:в\s+)?(прошлом|этом)\s+месяце(?![\p{L}\d])/giu,m=>{
    const t=new Date(now.getFullYear(),now.getMonth()-(/прошл/i.test(m[1])?1:0),1),y=t.getFullYear(),mo=t.getMonth();
    return {id:`m:${y}-${mo}`,label:/прошл/i.test(m[1])?"прошлый месяц":"этот месяц",test:iso=>{const d=new Date(iso);return d.getFullYear()===y&&d.getMonth()===mo;}};
  });
  return {hints,rest:rest.replace(/\s+/g," ").trim()};
}
