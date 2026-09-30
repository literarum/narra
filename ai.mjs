/* Narra assistant gateway: provider-agnostic. One key is enough — the service is recognised from it.
   Policy: OFF until the user opts in; every feature needs its own consent; the user sees exactly what would be sent
   and confirms it; the result is a derived artifact that changes nothing until the user accepts it; logs hold metadata only.
   Requests go straight from the browser to the chosen service (no Narra server exists). Pure and dependency-free; fetch is injected. */

export const AI_FEATURES=[
  {id:"rewrite",name:"Переписать выделенный фрагмент",sends:"только выделенный текст (или вся запись, если ничего не выделено)",kind:"selection"},
  {id:"questions",name:"Вопросы для размышления",sends:"текст текущей записи",kind:"entry"},
  {id:"suggest",name:"Предложения тем, людей и мест",sends:"текст текущей записи",kind:"entry"},
  {id:"summarize",name:"Краткий пересказ записи",sends:"текст текущей записи",kind:"entry"},
  {id:"transcribe",name:"Расшифровка голосовых записей",sends:"звук выбранной записи (по одной, после подтверждения)",kind:"audio"},
];
/** Services the gateway speaks to. `format` decides the wire protocol; almost everything is OpenAI-compatible. */
export const PROVIDERS=[
  {id:"openai",name:"OpenAI",format:"openai",baseUrl:"https://api.openai.com/v1",model:"gpt-4o-mini",keyRe:/^sk-(?!ant-|or-)/,keyHelp:"platform.openai.com → API keys"},
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
export const DEFAULT_AI_STATE=Object.freeze({enabled:false,provider:null,model:"",baseUrl:"",features:{},consentVersion:1,log:[]});
export class AiUnavailable extends Error{constructor(message="Помощник недоступен."){super(message);this.name="AiUnavailable";}}
/** The only provider in this build. It exists so the rest of the code has a single, testable seam. */
export const NullProvider={id:"none",name:"Не подключён",available:false,async run(){throw new AiUnavailable("Внешний помощник не подключён: эта версия работает только на вашем устройстве.");}};

export function cleanAiState(raw){
  const r=raw&&typeof raw==="object"?raw:{};
  const features={};for(const f of AI_FEATURES)features[f.id]=r.features?.[f.id]===true;
  return {enabled:r.enabled===true,provider:typeof r.provider==="string"&&providerById(r.provider)?r.provider:null,model:typeof r.model==="string"?r.model.trim().slice(0,120):"",baseUrl:typeof r.baseUrl==="string"?r.baseUrl.trim().slice(0,300):"",features,consentVersion:1,
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
    return {ok:false,reason:"failed",message:error?.friendly?`${error.message} Запись не изменена.`:"Запись не изменена. Попробуйте помощника позже.",log:record("failed"),preview};
  }
}


/* ---------- wire protocols ---------- */
const SYSTEM="Ты — бережный, тактичный помощник для личного дневника. Пиши по-русски, просто и тепло, без оценок и диагнозов. Никогда не выдумывай факты о жизни автора: опирайся только на присланный текст. Не давай медицинских, юридических и финансовых советов.";
export const FEATURE_PROMPTS={
  rewrite:t=>`Перепиши фрагмент яснее и глаже, сохранив смысл, факты и голос автора (от первого лица). Ничего не добавляй от себя. Верни только переписанный текст без пояснений.\n\nФрагмент:\n${t}`,
  questions:t=>`Прочитай запись и задай 3–5 коротких наводящих вопросов, которые помогут автору глубже понять свои чувства и события. Только вопросы, списком, без комментариев.\n\nЗапись:\n${t}`,
  suggest:t=>`Из записи выпиши: «Темы:» (до 5, по одному-два слова), «Люди:» (только упомянутые имена), «Места:» (только упомянутые). Ничего не выдумывай. Формат — три строки.\n\nЗапись:\n${t}`,
  summarize:t=>`Кратко перескажи запись в 2–4 предложениях от третьего лица, нейтрально, без оценок.\n\nЗапись:\n${t}`,
};
const trimSlash=u=>String(u||"").replace(/\/+$/,"");
export function resolveConfig(cfg){
  const p=providerById(cfg?.provider);
  if(!p)return null;
  return {provider:p,format:p.format,baseUrl:trimSlash(cfg.baseUrl||p.baseUrl),model:(cfg.model||p.model||"").trim()};
}
/** Builds a fetch() request for one prompt. Pure: nothing is sent here. */
export function buildRequest(cfg,key,{system=SYSTEM,prompt,maxTokens=900}){
  const c=resolveConfig(cfg);if(!c)throw new AiUnavailable("Сервис не выбран.");
  if(!c.baseUrl)throw new AiUnavailable("Не указан адрес сервиса.");
  if(!c.model)throw new AiUnavailable("Не указана модель.");
  const json={"content-type":"application/json"};
  if(c.format==="anthropic")return {url:`${c.baseUrl}/messages`,init:{method:"POST",headers:{...json,"x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:c.model,max_tokens:maxTokens,system,messages:[{role:"user",content:prompt}]})}};
  if(c.format==="gemini")return {url:`${c.baseUrl}/models/${encodeURIComponent(c.model)}:generateContent`,init:{method:"POST",headers:{...json,"x-goog-api-key":key},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:maxTokens}})}};
  const limit=c.provider.id==="openai"?{max_completion_tokens:maxTokens}:{max_tokens:maxTokens};
  const headers={...json};if(key)headers.authorization=`Bearer ${key}`;
  return {url:`${c.baseUrl}/chat/completions`,init:{method:"POST",headers,body:JSON.stringify({model:c.model,messages:[{role:"system",content:system},{role:"user",content:prompt}],...limit})}};
}
export function parseResponse(format,data){
  if(format==="anthropic")return (data?.content||[]).filter(b=>b?.type==="text").map(b=>b.text).join("").trim();
  if(format==="gemini")return (data?.candidates?.[0]?.content?.parts||[]).map(p=>p?.text||"").join("").trim();
  const m=data?.choices?.[0]?.message?.content;
  return (typeof m==="string"?m:Array.isArray(m)?m.map(x=>x?.text||"").join(""):"").trim();
}
export function buildModelsRequest(cfg,key){
  const c=resolveConfig(cfg);if(!c)throw new AiUnavailable("Сервис не выбран.");
  if(c.format==="anthropic")return {url:`${c.baseUrl}/models?limit=100`,init:{method:"GET",headers:{"x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"}}};
  if(c.format==="gemini")return {url:`${c.baseUrl}/models?pageSize=100`,init:{method:"GET",headers:{"x-goog-api-key":key}}};
  const headers={};if(key)headers.authorization=`Bearer ${key}`;
  return {url:`${c.baseUrl}/models`,init:{method:"GET",headers}};
}
const CHATTY=/(gpt-4o-mini|gpt-4\.1-mini|haiku|flash|small|mini|instruct|llama|chat)/i,NOT_CHAT=/(embed|whisper|tts|dall|image|moderation|audio|realtime|transcribe|vision-preview|guard)/i;
export function parseModels(format,data){
  let ids=[];
  if(format==="gemini")ids=(data?.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes("generateContent")).map(m=>String(m.name||"").replace(/^models\//,""));
  else ids=(data?.data||data?.models||[]).map(m=>String(m.id||m.name||""));
  return [...new Set(ids.filter(Boolean).filter(id=>!NOT_CHAT.test(id)))].slice(0,200);
}
/** From the list the service returned, the cheapest sensible default. */
export function pickModel(ids,preferred=""){
  if(preferred&&ids.includes(preferred))return preferred;
  return ids.find(id=>CHATTY.test(id))||ids[0]||preferred||"";
}
/** Human wording for what went wrong; never contains the key or the text. */
export function explainFailure(status,{network=false,timeout=false}={}){
  if(timeout)return "Сервис слишком долго не отвечает. Попробуйте ещё раз.";
  if(network)return "Не удалось связаться с сервисом. Проверьте интернет и адрес; для локальной модели — что она запущена и разрешает запросы из браузера.";
  if(status===401||status===403)return "Ключ не подошёл или у него нет доступа. Проверьте, что он скопирован целиком.";
  if(status===404)return "Сервис не нашёл такую модель или адрес. Проверьте название модели.";
  if(status===429)return "Слишком много запросов или закончился лимит на стороне сервиса. Подождите и повторите.";
  if(status===402)return "На счёте сервиса нет средств.";
  if(status>=500)return "У сервиса сейчас сбой. Повторите позже.";
  return "Сервис вернул ошибку. Запись не изменена.";
}
class HttpFailure extends Error{constructor(status,opts){super(explainFailure(status,opts));this.status=status;this.friendly=true;}}
async function call(fetchImpl,{url,init},{timeoutMs=60000,signal}={}){
  const ctl=new AbortController();let timedOut=false;
  const t=setTimeout(()=>{timedOut=true;ctl.abort();},timeoutMs);
  const onAbort=()=>ctl.abort();signal?.addEventListener?.("abort",onAbort);
  try{
    const res=await fetchImpl(url,{...init,signal:ctl.signal,credentials:"omit",referrerPolicy:"no-referrer",cache:"no-store"});
    if(!res.ok)throw new HttpFailure(res.status);
    return await res.json();
  }catch(error){
    if(error instanceof HttpFailure)throw error;
    if(timedOut)throw Object.assign(new Error(explainFailure(0,{timeout:true})),{friendly:true});
    if(error?.name==="AbortError")throw Object.assign(new Error("Запрос отменён."),{friendly:true});
    throw Object.assign(new Error(explainFailure(0,{network:true})),{friendly:true});
  }finally{clearTimeout(t);signal?.removeEventListener?.("abort",onAbort);}
}
/** Asks the service what models the key can use — doubles as a cheap "does this key work" check. */
export async function listModels(cfg,key,fetchImpl=globalThis.fetch,opts){
  const c=resolveConfig(cfg);
  const data=await call(fetchImpl,buildModelsRequest(cfg,key),opts);
  return parseModels(c.format,data);
}
/* ---------- audio → text ---------- */
const TRANSCRIBE_MODELS={openai:"whisper-1",groq:"whisper-large-v3-turbo",mistral:"voxtral-mini-latest"};
export const TRANSCRIBE_LIMIT={openai:25*1024*1024,gemini:14*1024*1024};
const cleanMime=m=>String(m||"audio/webm").split(";")[0].trim()||"audio/webm";
export function transcribeSupport(cfg){
  const c=resolveConfig(cfg);
  if(!c)return {ok:false,reason:"Сервис не выбран."};
  if(c.format==="gemini")return {ok:true,kind:"gemini",limit:TRANSCRIBE_LIMIT.gemini};
  if(c.format==="openai"&&(TRANSCRIBE_MODELS[c.provider.id]||c.provider.custom))return {ok:true,kind:"openai",limit:TRANSCRIBE_LIMIT.openai};
  return {ok:false,reason:`«${c.provider.name}» не расшифровывает звук. Для этого подойдут OpenAI, Groq, Mistral или Gemini.`};
}
const EXT_OF={"audio/webm":"webm","audio/mp4":"m4a","audio/x-m4a":"m4a","audio/m4a":"m4a","audio/mpeg":"mp3","audio/mp3":"mp3","audio/ogg":"ogg","audio/wav":"wav","audio/x-wav":"wav","audio/flac":"flac"};
const toB64=bytes=>{let s="";for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(s);};
/** Pure: builds the request that turns one audio file into text. */
export function buildTranscribeRequest(cfg,key,{bytes,mime,name="audio"}){
  const sup=transcribeSupport(cfg);if(!sup.ok)throw new AiUnavailable(sup.reason);
  const c=resolveConfig(cfg),type=cleanMime(mime),u8=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  if(!c.baseUrl)throw new AiUnavailable("Не указан адрес сервиса.");
  if(!c.model&&sup.kind==="gemini")throw new AiUnavailable("Не указана модель.");
  if(u8.length>sup.limit)throw new AiUnavailable("Запись слишком большая для этого сервиса.");
  if(sup.kind==="gemini")return {url:`${c.baseUrl}/models/${encodeURIComponent(c.model)}:generateContent`,init:{method:"POST",headers:{"content-type":"application/json","x-goog-api-key":key},body:JSON.stringify({contents:[{role:"user",parts:[{text:"Расшифруй эту запись речи дословно, на языке говорящего. Верни только текст, без пояснений."},{inlineData:{mimeType:type,data:toB64(u8)}}]}]})}};
  const fd=new FormData();
  fd.append("file",new Blob([u8],{type:type}),`audio.${EXT_OF[type]||"webm"}`);
  fd.append("model",TRANSCRIBE_MODELS[c.provider.id]||"whisper-1");fd.append("language","ru");fd.append("response_format","json");
  const headers={};if(key)headers.authorization=`Bearer ${key}`;
  return {url:`${c.baseUrl}/audio/transcriptions`,init:{method:"POST",headers,body:fd}};
}
export function parseTranscript(kind,data){return kind==="gemini"?parseResponse("gemini",data):String(data?.text||"").trim();}
/** The provider object the gateway runs features through. */
export function createProvider(cfg,key,fetchImpl=globalThis.fetch){
  const c=resolveConfig(cfg);
  return {id:c?.provider.id||"none",name:c?`${c.provider.name} · ${c.model}`:"Не подключён",available:Boolean(c&&(key||c.provider.needsKey===false)),
    async run(featureId,text,opts){
      const make=FEATURE_PROMPTS[featureId];if(!make)throw new AiUnavailable("Неизвестная функция.");
      const data=await call(fetchImpl,buildRequest(cfg,key,{prompt:make(String(text||"").slice(0,24000))}),opts);
      const out=parseResponse(c.format,data);
      if(!out)throw Object.assign(new Error("Сервис вернул пустой ответ."),{friendly:true});
      return out;
    },
    async transcribe(audio,opts){
      const sup=transcribeSupport(cfg);
      const data=await call(fetchImpl,buildTranscribeRequest(cfg,key,audio),{timeoutMs:180000,...opts});
      const out=parseTranscript(sup.kind,data);
      if(!out)throw Object.assign(new Error("В записи не удалось разобрать речь."),{friendly:true});
      return out;
    }};
}
