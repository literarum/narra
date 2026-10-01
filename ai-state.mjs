/* Narra assistant — state, features, providers and consent rules (small; loads at start-up). The prompts, request builders and parsers live in ai.mjs (loaded on first use).
   Narra assistant gateway: provider-agnostic. One key is enough — the service is recognised from it.
   Policy: OFF until the user opts in; every feature needs its own consent; the user sees exactly what would be sent
   and confirms it; the result is a derived artifact that changes nothing until the user accepts it; logs hold metadata only.
   Requests go straight from the browser to the chosen service (no Narra server exists). Pure and dependency-free; fetch is injected. */

export const FEATURE_GROUPS=[
  {id:"write",name:"Письмо",icon:"pen"},
  {id:"diary",name:"Дневник",icon:"journal"},
  {id:"talk",name:"Собеседник",icon:"chat"},
  {id:"voice",name:"Голос",icon:"mic"},
];
/** role: «fast» = a cheap model is enough; «main» = the person's chosen model. out: the answer budget in tokens. */
export const AI_FEATURES=[
  {id:"rewrite",group:"write",name:"Править и переписывать текст",sends:"выделенный текст (или вся запись, если ничего не выделено)",kind:"selection",role:"main",out:900,icon:"wand",
    blurb:"Глаже, короче, теплее, деловым тоном, только исправить ошибки, развернуть в текст, свести в пункты."},
  {id:"continue",group:"write",name:"Продолжить мысль",sends:"текст текущей записи и 2–3 коротких выдержки из прошлых записей для голоса",kind:"entry",role:"main",out:400,icon:"pen",
    blurb:"Предложит продолжение в вашем стиле — вы решаете, вставлять или нет."},
  {id:"questions",group:"write",name:"Вопросы для размышления",sends:"текст текущей записи",kind:"entry",role:"fast",out:300,icon:"bulb",blurb:"3–5 вопросов, которые помогут копнуть глубже."},
  {id:"title",group:"write",name:"Заголовок записи",sends:"текст текущей записи",kind:"entry",role:"fast",out:120,icon:"type",blurb:"Три варианта заголовка."},
  {id:"analyze",group:"write",name:"Разбор записи одним запросом",sends:"текст текущей записи",kind:"entry",role:"fast",out:500,icon:"sparkle",
    blurb:"Тема, люди, места, состояние, задачи и вопросы — за один дешёвый запрос вместо нескольких."},
  {id:"tasks",group:"write",name:"Задачи из записи",sends:"текст текущей записи",kind:"entry",role:"fast",out:300,icon:"checklist",blurb:"Превратит намерения из текста в чек-лист."},
  {id:"reframe",group:"write",name:"Другой взгляд",sends:"текст текущей записи",kind:"entry",role:"main",out:500,icon:"eye",blurb:"Два-три бережных взгляда на ситуацию с других сторон."},
  {id:"echoes",group:"write",name:"Связать с прошлым",sends:"текст текущей записи и до 5 выдержек из похожих прошлых записей (подбираются на устройстве)",kind:"entry",role:"main",out:500,icon:"link",
    blurb:"Что в этой записи повторяется из прошлого — а что изменилось."},
  {id:"suggest",group:"write",name:"Предложения тем, людей и мест",sends:"текст текущей записи",kind:"entry",role:"fast",out:200,icon:"tag",blurb:"Подсказки тегов (устаревший вариант «Разбора записи»)."},
  {id:"summarize",group:"write",name:"Краткий пересказ записи",sends:"текст текущей записи",kind:"entry",role:"fast",out:250,icon:"list",blurb:"2–4 предложения."},
  {id:"ask",group:"diary",name:"Спросить дневник",sends:"ваш вопрос, портрет дневника (подсчитан на устройстве) и несколько подобранных выдержек из записей",kind:"chat",role:"main",out:700,icon:"search",
    blurb:"Вопросы по смыслу: «Что меня выматывало весной?», «Как я справлялась раньше?»."},
  {id:"period",group:"diary",name:"Рассказ о периоде",sends:"сводку обзора за выбранный период (заголовки, счётчики, темы) — без полного текста записей",kind:"digest",role:"main",out:700,icon:"reviews",
    blurb:"Связный рассказ по итогам недели, месяца, квартала или года."},
  {id:"daily",group:"diary",name:"Вопрос дня под вас",sends:"портрет дневника (без текстов записей)",kind:"digest",role:"fast",out:120,icon:"sparkle",blurb:"Личный вопрос для письма вместо общего."},
  {id:"decision",group:"diary",name:"Разбор решения",sends:"журнал одного решения и до 3 похожих прошлых решений",kind:"decision",role:"main",out:600,icon:"scale",blurb:"Ожидания против итога, что из этого следует."},
  {id:"talk",group:"talk",name:"Собеседник",sends:"ваши реплики, портрет дневника, несколько подобранных выдержек из записей и отметок, память прошлых бесед (можно ограничить в настройках)",kind:"chat",role:"main",out:900,icon:"chat",
    blurb:"Бережные беседы на основе ваших записей: слушание, разбор мыслей, чувства, ценности, решения."},
  {id:"transcribe",group:"voice",name:"Расшифровка голосовых записей",sends:"звук выбранной записи (по одной, после подтверждения)",kind:"audio",role:"main",out:0,icon:"mic"},
];
export const featureById=id=>AI_FEATURES.find(f=>f.id===id)||null;
/** Services the gateway speaks to. `format` decides the wire protocol; almost everything is OpenAI-compatible. */
export const PROVIDERS=[
  {id:"openai",name:"OpenAI",format:"openai",baseUrl:"https://api.openai.com/v1",model:"gpt-4o-mini",keyRe:/^sk-(?:proj-|svcacct-|[A-Za-z0-9]{20,}T3BlbkFJ)/,keyHelp:"platform.openai.com → API keys"},
  {id:"anthropic",name:"Anthropic Claude",format:"anthropic",baseUrl:"https://api.anthropic.com/v1",model:"claude-haiku-4-5",keyRe:/^sk-ant-/,keyHelp:"console.anthropic.com → API keys"},
  {id:"gemini",name:"Google Gemini",format:"gemini",baseUrl:"https://generativelanguage.googleapis.com/v1beta",model:"gemini-2.0-flash",keyRe:/^AIza/,keyHelp:"aistudio.google.com → Get API key"},
  {id:"openrouter",name:"OpenRouter (сотни моделей)",format:"openai",baseUrl:"https://openrouter.ai/api/v1",model:"openai/gpt-4o-mini",keyRe:/^sk-or-/,keyHelp:"openrouter.ai → Keys"},
  {id:"groq",name:"Groq",format:"openai",baseUrl:"https://api.groq.com/openai/v1",model:"llama-3.3-70b-versatile",keyRe:/^gsk_/,keyHelp:"console.groq.com → API Keys"},
  {id:"xai",name:"xAI Grok",format:"openai",baseUrl:"https://api.x.ai/v1",model:"grok-2-latest",keyRe:/^xai-/,keyHelp:"console.x.ai"},
  {id:"mistral",name:"Mistral",format:"openai",baseUrl:"https://api.mistral.ai/v1",model:"mistral-small-latest",keyRe:null,keyHelp:"console.mistral.ai"},
  {id:"deepseek",name:"DeepSeek",format:"openai",baseUrl:"https://api.deepseek.com/v1",model:"deepseek-chat",keyRe:null,keyHelp:"platform.deepseek.com"},
  {id:"ollama",name:"Ollama (на вашем компьютере)",format:"openai",baseUrl:"http://localhost:11434/v1",model:"llama3.2",keyRe:null,needsKey:false,local:true,keyHelp:"ключ не нужен"},
  {id:"lmstudio",name:"LM Studio (на вашем компьютере)",format:"openai",baseUrl:"http://localhost:1234/v1",model:"local-model",keyRe:null,needsKey:false,local:true,keyHelp:"ключ не нужен"},
  {id:"custom",name:"Другой сервис (совместимый с OpenAI)",format:"openai",baseUrl:"",model:"",keyRe:null,custom:true,keyHelp:"адрес и ключ из личного кабинета"},
];
export const providerById=id=>PROVIDERS.find(p=>p.id===id)||null;
/** Recognises the service from the key's shape; null when the key says nothing (Mistral, DeepSeek…). */
export function detectProvider(key=""){
  const k=String(key).trim();
  for(const p of PROVIDERS)if(p.keyRe&&p.keyRe.test(k))return p.id;
  return null;
}
export const TALK_DEFAULTS=Object.freeze({address:"vy",style:"warm",length:"medium",diary:true,checkins:true,memory:true,eval:true});
export const DEFAULT_AI_STATE=Object.freeze({enabled:false,provider:null,model:"",modelFast:"",baseUrl:"",features:{},consentVersion:1,log:[],tier:"balanced",dailyCap:0,cache:true,talk:TALK_DEFAULTS});
export class AiUnavailable extends Error{constructor(message="Помощник недоступен."){super(message);this.name="AiUnavailable";}}
/** The only provider in this build. It exists so the rest of the code has a single, testable seam. */
export const NullProvider={id:"none",name:"Не подключён",available:false,async run(){throw new AiUnavailable("Внешний помощник не подключён: эта версия работает только на вашем устройстве.");}};

export function cleanTalk(t){
  t=t&&typeof t==="object"?t:{};
  return {address:["vy","ty"].includes(t.address)?t.address:"vy",style:["warm","balanced","direct","socratic"].includes(t.style)?t.style:"warm",length:["short","medium","long"].includes(t.length)?t.length:"medium",
    diary:t.diary!==false,checkins:t.checkins!==false,memory:t.memory!==false,eval:t.eval!==false};
}
export function cleanAiState(raw){
  const r=raw&&typeof raw==="object"?raw:{};
  const features={};for(const f of AI_FEATURES)features[f.id]=r.features?.[f.id]===true;
  return {enabled:r.enabled===true,provider:typeof r.provider==="string"&&providerById(r.provider)?r.provider:null,model:typeof r.model==="string"?r.model.trim().slice(0,120):"",modelFast:typeof r.modelFast==="string"?r.modelFast.trim().slice(0,120):"",tier:["eco","balanced","deep"].includes(r.tier)?r.tier:"balanced",dailyCap:Number.isFinite(r.dailyCap)&&r.dailyCap>0?Math.min(50000000,Math.round(r.dailyCap)):0,cache:r.cache!==false,talk:cleanTalk(r.talk),baseUrl:typeof r.baseUrl==="string"?r.baseUrl.trim().slice(0,300):"",features,consentVersion:1,
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
export const REASON_TEXT={disabled:"Помощник выключен. Включить его можно в настройках.","no-consent":"Для этой функции нет вашего согласия.","no-provider":"Помощник не подключён: добавьте ключ в настройках.","unknown-feature":"Такой функции нет."};
