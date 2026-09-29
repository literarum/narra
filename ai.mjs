/* Narra assistant gateway (P1 architecture, provider-agnostic).
   Policy: OFF until the user opts in; every feature needs its own consent; the user sees exactly what would be sent
   and confirms it; the result is a derived artifact that changes nothing until the user accepts it; logs hold metadata only.
   This build ships without any provider: connect-src 'self' in the Content-Security-Policy blocks every external call,
   so the gateway can only refuse — and it says so plainly. Pure and dependency-free. */

export const AI_FEATURES=[
  {id:"rewrite",name:"Переписать выделенный фрагмент",sends:"только выделенный текст",kind:"selection"},
  {id:"summarize",name:"Краткий пересказ выбранных записей или периода",sends:"выбранные записи целиком",kind:"entries"},
  {id:"questions",name:"Вопросы для размышления",sends:"текст текущей записи",kind:"entry"},
  {id:"suggest",name:"Предложения тем, людей и мест",sends:"текст текущей записи",kind:"entry"},
  {id:"semantic",name:"Поиск по смыслу (модель)",sends:"тексты записей для построения индекса",kind:"corpus"},
  {id:"synthesis",name:"Обзор периода со ссылками на записи",sends:"записи выбранного периода",kind:"entries"},
  {id:"transcribe",name:"Расшифровка голосовой заметки",sends:"аудиозапись",kind:"audio"},
];
export const DEFAULT_AI_STATE=Object.freeze({enabled:false,provider:null,features:{},consentVersion:1,log:[]});
export class AiUnavailable extends Error{constructor(message="Помощник недоступен."){super(message);this.name="AiUnavailable";}}
/** The only provider in this build. It exists so the rest of the code has a single, testable seam. */
export const NullProvider={id:"none",name:"Не подключён",available:false,async run(){throw new AiUnavailable("Внешний помощник не подключён: эта версия работает только на вашем устройстве.");}};

export function cleanAiState(raw){
  const r=raw&&typeof raw==="object"?raw:{};
  const features={};for(const f of AI_FEATURES)features[f.id]=r.features?.[f.id]===true;
  return {enabled:r.enabled===true,provider:typeof r.provider==="string"?r.provider.slice(0,40):null,features,consentVersion:1,
    log:(Array.isArray(r.log)?r.log:[]).slice(-50).map(l=>({feature:String(l.feature||"").slice(0,24),status:String(l.status||"").slice(0,16),at:String(l.at||"").slice(0,30),chars:Number.isFinite(l.chars)?l.chars:0,refs:Array.isArray(l.refs)?l.refs.slice(0,50).map(String):[]}))};
}
/** May this feature run right now? Returns the first reason it may not. */
export function canRun(state,featureId,provider=NullProvider){
  const s=cleanAiState(state),f=AI_FEATURES.find(x=>x.id===featureId);
  if(!f) return {ok:false,reason:"unknown-feature"};
  if(!s.enabled) return {ok:false,reason:"disabled"};
  if(!s.features[featureId]) return {ok:false,reason:"no-consent"};
  if(!provider||provider.available===false) return {ok:false,reason:"no-provider"};
  return {ok:true};
}
export const REASON_TEXT={disabled:"Помощник выключен. Включить его можно в настройках.","no-consent":"Для этой функции нет вашего согласия.","no-provider":"Внешний помощник не подключён.","unknown-feature":"Такой функции нет."};
/** Exactly what would leave the device — shown before anything is sent. */
export function payloadPreview(featureId,items){
  const f=AI_FEATURES.find(x=>x.id===featureId);
  const rows=(items||[]).map(i=>({id:String(i.id||""),title:String(i.title||"Без заголовка"),chars:String(i.text||"").length}));
  return {feature:f?.name||featureId,sends:f?.sends||"",rows,totalChars:rows.reduce((s,r)=>s+r.chars,0),text:(items||[]).map(i=>String(i.text||"")).join("\n\n---\n\n")};
}
/** Runs a feature through the gate. Never touches entries; on any failure the caller's text stays exactly as it was. */
export async function runFeature({state,provider=NullProvider,featureId,items,confirmed=false,now=()=>new Date().toISOString()}){
  const gate=canRun(state,featureId,provider);
  const preview=payloadPreview(featureId,items);
  const record=status=>({feature:featureId,status,at:now(),chars:preview.totalChars,refs:(items||[]).map(i=>String(i.id||"")).filter(Boolean)}); // metadata only, never text
  if(!gate.ok) return {ok:false,reason:gate.reason,message:REASON_TEXT[gate.reason],log:record("blocked"),preview};
  if(!confirmed) return {ok:false,reason:"not-confirmed",message:"Подтвердите, что именно будет отправлено.",log:null,preview};
  try{
    const output=await provider.run(featureId,preview.text);
    return {ok:true,output:{derived:true,text:String(output||"")},log:record("ok"),preview};
  }catch(error){
    return {ok:false,reason:"failed",message:"Запись не изменена. Попробуйте помощника позже.",log:record("failed"),preview};
  }
}
