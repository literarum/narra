/* Narra check-in model: catalogue of dimensions, emotions and context, validation and plain-language summaries.
   Pure and dependency-free. Tracking serves storytelling: three dimensions by default, everything else is opt-in. */

const range=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);
export const MOOD_VALUES=[-2,-1,0,1,2],SCALE_VALUES=[1,2,3,4,5];

export const CORE_DIMENSIONS=[
  {key:"moodValence",name:"Настроение",values:MOOD_VALUES,labels:["Очень низкое","Низкое","Нейтральное","Хорошее","Очень хорошее"],low:"низкое",high:"хорошее",short:"настроение",core:true},
  {key:"energy",name:"Энергия",values:SCALE_VALUES,labels:["Очень мало","Мало","Средне","Много","Очень много"],low:"мало",high:"много",short:"энергия",core:true},
  {key:"tension",name:"Напряжение",values:SCALE_VALUES,labels:["Очень низкое","Низкое","Среднее","Высокое","Очень высокое"],low:"низкое",high:"высокое",short:"напряжение",core:true,note:"Внутреннее напряжение. Это не оценка и не диагноз."},
];
export const DEEP_DIMENSIONS=[
  {key:"clarity",name:"Ясность мыслей",labels:["Туман","Скорее туман","Средне","Скорее ясно","Ясно"],low:"туман",high:"ясно",short:"ясность мыслей"},
  {key:"focus",name:"Сосредоточенность",labels:["Очень рассеянно","Рассеянно","Средне","Собранно","Очень собранно"],low:"рассеянно",high:"собранно",short:"сосредоточенность"},
  {key:"motivation",name:"Желание действовать",labels:["Совсем нет","Мало","Средне","Есть","Сильное"],low:"нет",high:"сильное",short:"желание действовать"},
  {key:"social",name:"Силы на общение",labels:["Совсем нет","Мало","Средне","Есть","Много"],low:"мало",high:"много",short:"силы на общение"},
  {key:"body",name:"Комфорт в теле",labels:["Очень неуютно","Неуютно","Обычно","Уютно","Очень уютно"],low:"неуютно",high:"уютно",short:"комфорт в теле"},
  {key:"sleep",name:"Качество сна",labels:["Очень плохое","Плохое","Обычное","Хорошее","Очень хорошее"],low:"плохое",high:"хорошее",short:"качество сна"},
  {key:"meaning",name:"Ощущение смысла",labels:["Почти нет","Слабое","Среднее","Заметное","Сильное"],low:"слабое",high:"сильное",short:"ощущение смысла"},
].map(d=>({...d,values:SCALE_VALUES,deep:true}));

export const EMOTION_GROUPS=[
  {id:"joy",name:"Радость",items:["радость","восторг","благодарность","гордость","вдохновение"]},
  {id:"calm",name:"Спокойствие",items:["спокойствие","умиротворение","облегчение","уют"]},
  {id:"interest",name:"Интерес",items:["любопытство","увлечённость","предвкушение","надежда"]},
  {id:"warmth",name:"Близость",items:["нежность","любовь","доверие","тепло"]},
  {id:"sadness",name:"Грусть",items:["грусть","тоска","одиночество","усталость","разочарование"]},
  {id:"anger",name:"Раздражение",items:["раздражение","злость","обида","досада"]},
  {id:"worry",name:"Беспокойство",items:["тревога","беспокойство","страх","растерянность","стыд"]},
];
export const EMOTION_GROUP_OF=Object.fromEntries(EMOTION_GROUPS.flatMap(g=>g.items.map(i=>[i,g.id])));

export const CONTEXT_GROUPS=[
  {id:"needs",name:"Что сейчас нужно",items:["отдых","тишина","общение","движение","творчество","поддержка","ясность"]},
  {id:"triggers",name:"Что повлияло",items:["разговор","новости","срок","усталость","погода","воспоминание","дорога"]},
  {id:"activities",name:"Чем занимались",items:["работа","учёба","прогулка","спорт","чтение","готовка","встреча","творчество","уборка"]},
  {id:"social",name:"С кем",items:["один","с близкими","с друзьями","с коллегами","среди людей"]},
];
export const MODE_OPTIONS=[["work","работа"],["rest","отдых"],["travel","поездка"]];
export const WEATHER_OPTIONS=["ясно","облачно","дождь","снег","жарко","холодно","ветрено"];
export const PHASES=["standalone","before_writing","after_writing"];

export const DEFAULT_CONFIG=Object.freeze({
  enabled:{moodValence:true,energy:true,tension:true},   // any dimension can be switched off, deep ones start off
  custom:[],                                             // [{id,name,low,high}]
  emotions:false,context:false,note:false,               // optional blocks inside the expanded check-in
  extra:{emotions:[],needs:[],triggers:[],activities:[],social:[]},
  pairing:false                                          // offer a short before/after check around writing (occasionally)
});
const str=(v,max)=>typeof v==="string"?v.trim().slice(0,max):"";
const list=(v,maxItems,maxLen)=>Array.isArray(v)?[...new Set(v.map(x=>str(x,maxLen)).filter(Boolean))].slice(0,maxItems):[];
export function cleanConfig(raw){
  const r=raw&&typeof raw==="object"?raw:{};
  const enabled={};
  for(const d of [...CORE_DIMENSIONS,...DEEP_DIMENSIONS]){
    const v=r.enabled&&typeof r.enabled==="object"?r.enabled[d.key]:undefined;
    enabled[d.key]=typeof v==="boolean"?v:Boolean(DEFAULT_CONFIG.enabled[d.key]);
  }
  const custom=(Array.isArray(r.custom)?r.custom:[]).map(c=>c&&typeof c==="object"?{id:/^[a-z0-9_]{1,24}$/.test(c.id||"")?c.id:null,name:str(c.name,32),low:str(c.low,20)||"мало",high:str(c.high,20)||"много"}:null)
    .filter(c=>c&&c.id&&c.name).slice(0,6);
  custom.forEach(c=>{enabled[`c_${c.id}`]=r.enabled&&typeof r.enabled[`c_${c.id}`]==="boolean"?r.enabled[`c_${c.id}`]:true;});
  const ex=r.extra&&typeof r.extra==="object"?r.extra:{};
  return {enabled,custom,emotions:Boolean(r.emotions),context:Boolean(r.context),note:Boolean(r.note),pairing:Boolean(r.pairing),
    extra:{emotions:list(ex.emotions,20,24),needs:list(ex.needs,12,24),triggers:list(ex.triggers,12,24),activities:list(ex.activities,16,24),social:list(ex.social,10,24)}};
}
/** All dimensions the user has switched on, in a stable order: core, deep, custom. Custom keys are stored as `c_<id>`. */
export function activeDimensions(config=DEFAULT_CONFIG){
  const c=cleanConfig(config),out=[];
  for(const d of [...CORE_DIMENSIONS,...DEEP_DIMENSIONS])if(c.enabled[d.key])out.push(d);
  for(const x of c.custom)if(c.enabled[`c_${x.id}`])out.push({key:`c_${x.id}`,name:x.name,values:SCALE_VALUES,labels:SCALE_VALUES.map(v=>v===1?x.low:v===5?x.high:`${v} из 5`),low:x.low,high:x.high,short:x.name.toLocaleLowerCase("ru-RU"),custom:true});
  return out;
}
/** Every dimension that may appear in stored data (enabled or not), so history stays readable after a switch-off. */
export function knownDimensions(config=DEFAULT_CONFIG){
  const c=cleanConfig(config);
  return [...CORE_DIMENSIONS,...DEEP_DIMENSIONS,...c.custom.map(x=>({key:`c_${x.id}`,name:x.name,values:SCALE_VALUES,labels:SCALE_VALUES.map(v=>v===1?x.low:v===5?x.high:`${v} из 5`),low:x.low,high:x.high,short:x.name.toLocaleLowerCase("ru-RU"),custom:true}))];
}
export function emotionGroups(config=DEFAULT_CONFIG){
  const extra=cleanConfig(config).extra.emotions;
  return extra.length?[...EMOTION_GROUPS,{id:"own",name:"Свои",items:extra}]:EMOTION_GROUPS;
}
export function contextGroups(config=DEFAULT_CONFIG){
  const extra=cleanConfig(config).extra;
  return CONTEXT_GROUPS.map(g=>({...g,items:[...g.items,...(extra[g.id]||[]).filter(x=>!g.items.includes(x))]}));
}

/** Read a dimension value from a check-in regardless of where it is stored (core fields or `custom`). */
export function dimValue(checkin,key){
  if(!checkin) return null;
  const v=key in checkin&&!["custom","emotions","context"].includes(key)?checkin[key]:checkin.custom?.[key];
  return v==null||v===""||!Number.isFinite(Number(v))?null:Number(v);
}
export function dimLabel(dim,value){
  if(value==null||!dim) return "";
  const i=dim.values.indexOf(Number(value));
  return i>=0?dim.labels[i]:"";
}
/** "Настроение: хорошее · Энергия: много" — plain language, no numbers. */
export function checkinSummary(checkin,config=DEFAULT_CONFIG,{max=3}={}){
  const parts=[];
  for(const d of knownDimensions(config)){
    const v=dimValue(checkin,d.key);
    if(v!=null&&parts.length<max)parts.push(`${d.short[0].toLocaleUpperCase("ru-RU")+d.short.slice(1)}: ${dimLabel(d,v).toLocaleLowerCase("ru-RU")}`);
  }
  const emo=(checkin?.emotions||[]).map(e=>e.name);
  if(emo.length&&parts.length<max+1)parts.push(emo.slice(0,3).join(", ")+(emo.length>3?"…":""));
  return parts.join(" · ");
}
export function hasAnyValue(c){
  return Boolean(c&&([...CORE_DIMENSIONS].some(d=>dimValue(c,d.key)!=null)||Object.keys(c.custom||{}).length||(c.emotions||[]).length));
}

/** Validation for stored or imported check-ins. Unknown fields are dropped; out-of-range values are discarded, never clamped. */
export function cleanCheckin(raw){
  if(!raw||typeof raw!=="object"||typeof raw.id!=="string"||!raw.id||raw.id.length>80) return null;
  const t=raw.observedAt;if(typeof t!=="string"||Number.isNaN(new Date(t).getTime())) return null;
  const pick=(k,lo,hi)=>{const v=raw[k];return Number.isInteger(v)&&v>=lo&&v<=hi?v:null;};
  const custom={};
  if(raw.custom&&typeof raw.custom==="object")for(const [k,v] of Object.entries(raw.custom))if(/^[a-z0-9_]{1,28}$/.test(k)&&Number.isInteger(v)&&v>=1&&v<=5)custom[k]=v;
  const emotions=(Array.isArray(raw.emotions)?raw.emotions:[]).map(e=>e&&typeof e==="object"?{name:str(e.name,32),intensity:Number.isInteger(e.intensity)&&e.intensity>=1&&e.intensity<=5?e.intensity:3}:null).filter(e=>e&&e.name).slice(0,12);
  const ctx=raw.context&&typeof raw.context==="object"?raw.context:{};
  const context={needs:list(ctx.needs,10,24),triggers:list(ctx.triggers,10,24),activities:list(ctx.activities,12,24),social:list(ctx.social,8,24),weather:str(ctx.weather,24),mode:["work","rest","travel"].includes(ctx.mode)?ctx.mode:""};
  const out={id:raw.id,observedAt:t,phase:PHASES.includes(raw.phase)?raw.phase:"standalone",entryId:typeof raw.entryId==="string"&&raw.entryId&&raw.entryId.length<=80?raw.entryId:null,
    moodValence:pick("moodValence",-2,2),energy:pick("energy",1,5),tension:pick("tension",1,5),custom,emotions,context,note:str(raw.note,1000)};
  return hasAnyValue(out)?out:null;
}
export function contextItems(c){
  const x=c?.context||{};
  return [...(x.needs||[]),...(x.triggers||[]),...(x.activities||[]),...(x.social||[]),...(x.weather?[x.weather]:[]),...(x.mode?[MODE_OPTIONS.find(m=>m[0]===x.mode)?.[1]].filter(Boolean):[])];
}
