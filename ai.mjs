import {AI_FEATURES,featureById,providerById,AiUnavailable,NullProvider,canRun,REASON_TEXT} from "./ai-state.mjs?v=4.6.0";
export * from "./ai-state.mjs?v=4.6.0";
/** Exactly what would leave the device — shown before anything is sent. */
export function payloadPreview(featureId,items){
  const f=AI_FEATURES.find(x=>x.id===featureId);
  const rows=(items||[]).map(i=>({id:String(i.id||""),title:String(i.title||"Без заголовка"),chars:String(i.text||"").length}));
  return {feature:f?.name||featureId,sends:f?.sends||"",rows,totalChars:rows.reduce((s,r)=>s+r.chars,0),text:(items||[]).map(i=>String(i.text||"")).join("\n\n---\n\n")};
}
/** Runs a feature through the gate. Never touches entries; on any failure the caller's text stays exactly as it was. */
export async function runFeature({state,provider=NullProvider,featureId,items,confirmed=false,options={},now=()=>new Date().toISOString()}){
  const gate=canRun(state,featureId,provider);
  const preview=payloadPreview(featureId,items);
  const record=status=>({feature:featureId,status,at:now(),chars:preview.totalChars,refs:(items||[]).map(i=>String(i.id||"")).filter(Boolean)}); // metadata only, never text
  if(!gate.ok) return {ok:false,reason:gate.reason,message:REASON_TEXT[gate.reason],log:record("blocked"),preview};
  if(!confirmed) return {ok:false,reason:"not-confirmed",message:"Подтвердите, что именно будет отправлено.",log:null,preview};
  try{
    const output=await provider.run(featureId,preview.text,options);
    return {ok:true,output:{derived:true,text:String(output||"")},log:record("ok"),preview};
  }catch(error){
    return {ok:false,reason:"failed",message:error?.friendly?`${error.message} Запись не изменена.`:"Запись не изменена. Попробуйте помощника позже.",log:record("failed"),preview};
  }
}


/* ---------- wire protocols ---------- */
const SYSTEM="Ты — бережный, тактичный помощник для личного дневника. Пиши по-русски, просто и тепло, без оценок и диагнозов. Никогда не выдумывай факты о жизни автора: опирайся только на присланный текст. Не давай медицинских, юридических и финансовых советов. Отвечай сразу по делу, без вступлений и без пересказа задания.";
export const REWRITE_STYLES=[
  ["smooth","Глаже и яснее","Перепиши фрагмент яснее и глаже, сохранив смысл, факты и голос автора (от первого лица). Ничего не добавляй от себя."],
  ["short","Короче","Сократи фрагмент примерно вдвое, сохранив главное, факты и голос автора. Ничего не добавляй."],
  ["warm","Теплее","Перепиши фрагмент мягче и теплее по тону, сохранив смысл и факты. Не добавляй новых событий и оценок."],
  ["formal","Деловым тоном","Перепиши фрагмент в ровном деловом тоне: без эмоциональных оборотов и сленга, смысл и факты сохрани."],
  ["fix","Только ошибки","Исправь только орфографию, пунктуацию и явные опечатки. Слова, порядок и стиль не меняй."],
  ["expand","Развернуть в текст","Разверни черновые пометки и обрывки в связный текст от первого лица, ничего не выдумывая сверх сказанного."],
  ["bullets","Свести в пункты","Сократи фрагмент до списка коротких пунктов Markdown («- …»), сохранив факты и порядок."],
];
const ANALYZE_SHAPE='{"summary":"1–2 предложения","themes":["до 4, по 1–2 слова"],"people":["только упомянутые имена"],"places":["только упомянутые"],"mood":{"valence":-2..2,"energy":1..5,"tension":1..5},"tasks":["намерения, которые можно сделать"],"questions":["до 3 коротких вопросов автору"]}';
/** One prompt per feature: (text, options) → the user message. Outputs are kept terse on purpose — every answer token costs money. */
export const FEATURE_PROMPTS={
  rewrite:(t,o={})=>{const st=REWRITE_STYLES.find(x=>x[0]===o.style)||REWRITE_STYLES[0];return `${st[2]} Верни только результат, без пояснений.\n\nФрагмент:\n${t}`;},
  continue:(t,o={})=>`Продолжи запись в том же голосе и времени (от первого лица), 2–4 предложения. Не подводи итогов, не давай советов, не выдумывай событий — лишь естественно продолжи мысль автора.${o.voice?`\n\nПримеры голоса автора из его прошлых записей (не пересказывай их):\n${o.voice}`:""}\n\nЗапись:\n${t}`,
  questions:t=>`Прочитай запись и задай 3–5 коротких наводящих вопросов, которые помогут автору глубже понять свои чувства и события. Только вопросы, списком, без вступления и без оценок.\n\nЗапись:\n${t}`,
  title:t=>`Придумай три коротких заголовка (2–6 слов) для записи. По одному в строке, без нумерации и кавычек. Заголовок — это суть, а не оценка.\n\nЗапись:\n${t}`,
  analyze:t=>`Разбери запись. Верни ТОЛЬКО JSON такой формы (пустые поля — пустые списки/строки; ничего не выдумывай, оценка настроения — только если оно видно из текста, иначе null): ${ANALYZE_SHAPE}\n\nЗапись:\n${t}`,
  tasks:t=>`Выпиши из записи намерения и дела, которые автор хочет или должен сделать. Список Markdown вида «- [ ] дело», по делу, без выдуманных пунктов. Если дел нет — одна строка: «Задач в записи нет.»\n\nЗапись:\n${t}`,
  reframe:t=>`Автор описывает ситуацию. Предложи 2–3 бережных альтернативных взгляда на неё (как это могли бы увидеть другой человек, время, более добрая версия себя). Не обесценивай чувства, не давай директив и не ставь диагнозов. Каждый взгляд — 1–2 предложения, по строке «— …».\n\nЗапись:\n${t}`,
  echoes:(t,o={})=>`Ниже — текущая запись и выдержки из прошлых записей того же автора. Скажи в 3–5 предложениях, что в текущей записи повторяет прошлое (темы, чувства, схемы) и что изменилось. Ссылайся на даты выдержек. Если связи слабые — так и скажи. Ничего не выдумывай, вывод формулируй осторожно («похоже», «возможно»).\n\n# Текущая запись\n${t}\n\n# Прошлые записи\n${o.context||"(нет)"}`,
  suggest:t=>`Из записи выпиши: «Темы:» (до 5, по одному-два слова), «Люди:» (только упомянутые имена), «Места:» (только упомянутые). Ничего не выдумывай. Формат — три строки.\n\nЗапись:\n${t}`,
  summarize:t=>`Кратко перескажи запись в 2–4 предложениях от третьего лица, нейтрально, без оценок.\n\nЗапись:\n${t}`,
  period:t=>`Ниже — сводка дневника автора за период (заголовки записей, темы, люди, состояния). Напиши от второго лица («вы») связный тёплый рассказ на 120–220 слов: что было главным, какие темы повторялись, как менялось состояние (если есть данные), что хочется забрать с собой. Опирайся только на сводку; если данных мало — скажи честно и коротко. Без списков и оценок.\n\n${t}`,
  daily:t=>`По портрету дневника предложи ОДИН личный вопрос для сегодняшней записи (до 18 слов): мягкий, конкретный, связанный с тем, что занимает автора. Без вступлений, только вопрос.\n\n${t}`,
  decision:t=>`Ниже — журнал решения автора и, возможно, похожие прошлые решения. Помоги сверить ожидания с итогом и извлечь урок: что сбылось, что нет, что это говорит о способе принимать решения. 4–6 предложений, по-доброму, без оценок «правильно/неправильно». Если итога ещё нет — предложи 2 вопроса, которые помогут проверить решение позже.\n\n${t}`,
};
const trimSlash=u=>String(u||"").replace(/\/+$/,"");
export function resolveConfig(cfg){
  const p=providerById(cfg?.provider);
  if(!p)return null;
  return {provider:p,format:p.format,baseUrl:trimSlash((p.custom||p.local)&&cfg.baseUrl?cfg.baseUrl:p.baseUrl),model:(cfg.model||p.model||"").trim()};
}
const sysText=system=>Array.isArray(system)?system.map(b=>b.text).join("\n\n"):String(system||"");
/** Builds a fetch() request. `system` is a string or blocks [{text,cache}] (cache → the provider may reuse that prefix: Anthropic explicit breakpoints,
    OpenAI and Gemini cache stable prefixes by themselves). `messages` = [{role:"user"|"assistant",content}] or a single `prompt`. Pure: nothing is sent here. */
export function buildRequest(cfg,key,{system=SYSTEM,prompt,messages=null,maxTokens=900}){
  const c=resolveConfig(cfg);if(!c)throw new AiUnavailable("Сервис не выбран.");
  if(!c.baseUrl)throw new AiUnavailable("Не указан адрес сервиса.");
  if(!c.model)throw new AiUnavailable("Не указана модель.");
  const msgs=(messages&&messages.length?messages:[{role:"user",content:prompt}]).map(m=>({role:m.role==="assistant"?"assistant":"user",content:String(m.content||"")}));
  const json={"content-type":"application/json"};
  if(c.format==="anthropic"){
    const sys=Array.isArray(system)?system.map(b=>({type:"text",text:b.text,...(b.cache?{cache_control:{type:"ephemeral"}}:{})})):system;
    return {url:`${c.baseUrl}/messages`,init:{method:"POST",headers:{...json,"x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:c.model,max_tokens:maxTokens,system:sys,messages:msgs})}};
  }
  if(c.format==="gemini")return {url:`${c.baseUrl}/models/${encodeURIComponent(c.model)}:generateContent`,init:{method:"POST",headers:{...json,"x-goog-api-key":key},body:JSON.stringify({systemInstruction:{parts:[{text:sysText(system)}]},contents:msgs.map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]})),generationConfig:{maxOutputTokens:maxTokens}})}};
  const limit=c.provider.id==="openai"?{max_completion_tokens:maxTokens}:{max_tokens:maxTokens};
  const headers={...json};if(key)headers.authorization=`Bearer ${key}`;
  return {url:`${c.baseUrl}/chat/completions`,init:{method:"POST",headers,body:JSON.stringify({model:c.model,messages:[{role:"system",content:sysText(system)},...msgs],...limit})}};
}
/** Tokens the service says it counted: the meter's ground truth (falls back to estimates when a service does not report). */
export function parseUsage(format,data){
  const n=v=>Number.isFinite(v)&&v>=0?Math.round(v):0;
  if(format==="anthropic"){const u=data?.usage||{};return {inTok:n(u.input_tokens)+n(u.cache_read_input_tokens)+n(u.cache_creation_input_tokens),outTok:n(u.output_tokens),cachedIn:n(u.cache_read_input_tokens)};}
  if(format==="gemini"){const u=data?.usageMetadata||{};return {inTok:n(u.promptTokenCount),outTok:n(u.candidatesTokenCount)+n(u.thoughtsTokenCount),cachedIn:n(u.cachedContentTokenCount)};}
  const u=data?.usage||{};return {inTok:n(u.prompt_tokens),outTok:n(u.completion_tokens),cachedIn:n(u.prompt_tokens_details?.cached_tokens)};
}
export function parseResponse(format,data){
  if(format==="anthropic")return (data?.content||[]).filter(b=>b?.type==="text").map(b=>b.text).join("").trim();
  if(format==="gemini")return (data?.candidates?.[0]?.content?.parts||[]).map(p=>p?.text||"").join("").trim();
  const m=data?.choices?.[0]?.message?.content;
  return (typeof m==="string"?m:Array.isArray(m)?m.map(x=>x?.text||"").join(""):"").trim();
}
/** True when the service says the answer was cut off by the output limit. */
export function parseTruncated(format,data){
  if(format==="anthropic")return data?.stop_reason==="max_tokens";
  if(format==="gemini")return data?.candidates?.[0]?.finishReason==="MAX_TOKENS";
  return data?.choices?.[0]?.finish_reason==="length";
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
  const withModel=role=>role==="fast"&&cfg?.modelFast?{...cfg,model:cfg.modelFast}:cfg;
  return {id:c?.provider.id||"none",name:c?`${c.provider.name} · ${c.model}`:"Не подключён",available:Boolean(c&&(key||c.provider.needsKey===false)),
    /** The general entry: a conversation or a single prompt → {text,usage,model}. Nothing is stored here. */
    async chat({system,messages,prompt,maxTokens=900,role="main",signal,timeoutMs=90000}){
      const use=withModel(role),rc=resolveConfig(use);
      const data=await call(fetchImpl,buildRequest(use,key,{system,messages,prompt,maxTokens}),{timeoutMs,signal});
      const text=parseResponse(rc.format,data);
      if(!text)throw Object.assign(new Error("Сервис вернул пустой ответ."),{friendly:true});
      return {text,usage:parseUsage(rc.format,data),model:rc.model,truncated:parseTruncated(rc.format,data)};
    },
    async run(featureId,text,opts={}){
      const make=FEATURE_PROMPTS[featureId],f=featureById(featureId);if(!make)throw new AiUnavailable("Неизвестная функция.");
      const r=await this.chat({prompt:make(String(text||"").slice(0,24000),opts),maxTokens:opts.maxTokens||f?.out||900,role:opts.role||f?.role||"main",signal:opts.signal});
      opts.onUsage?.(r.usage,r.model);
      return r.text;
    },
    async transcribe(audio,opts){
      const sup=transcribeSupport(cfg);
      const data=await call(fetchImpl,buildTranscribeRequest(cfg,key,audio),{timeoutMs:180000,...opts});
      const out=parseTranscript(sup.kind,data);
      if(!out)throw Object.assign(new Error("В записи не удалось разобрать речь."),{friendly:true});
      return out;
    }};
}

/* ---------- reading what the model returned (defensive: models wrap JSON in prose or fences) ---------- */
const cleanList=(v,n,len)=>(Array.isArray(v)?v:[]).map(x=>typeof x==="string"?x.replace(/\s+/g," ").trim():"").filter(Boolean).map(x=>x.slice(0,len)).filter((x,i,a)=>a.indexOf(x)===i).slice(0,n);
/** JSON from «Разбор записи» → a safe structure; null when nothing usable came back. */
export function parseAnalysis(raw=""){
  const m=String(raw).match(/\{[\s\S]*\}/);if(!m)return null;
  let o;try{o=JSON.parse(m[0]);}catch{return null;}
  if(!o||typeof o!=="object")return null;
  const num=(v,lo,hi)=>{const n=Number(v);return Number.isFinite(n)&&Number.isInteger(n)&&n>=lo&&n<=hi?n:null;};
  const mood=o.mood&&typeof o.mood==="object"?{valence:num(o.mood.valence,-2,2),energy:num(o.mood.energy,1,5),tension:num(o.mood.tension,1,5)}:null;
  const out={summary:typeof o.summary==="string"?o.summary.replace(/\s+/g," ").trim().slice(0,400):"",themes:[...new Set(cleanList(o.themes,8,40).map(t=>t.replace(/^#/,"")))].slice(0,5),people:cleanList(o.people,6,60),places:cleanList(o.places,4,80),
    mood:mood&&(mood.valence!=null||mood.energy!=null||mood.tension!=null)?mood:null,tasks:cleanList(o.tasks,8,200),questions:cleanList(o.questions,3,200)};
  return out.summary||out.themes.length||out.people.length||out.places.length||out.tasks.length||out.questions.length||out.mood?out:null;
}
/** Up to three headline options, one per line, without numbering or quotes. */
export function parseTitles(raw=""){
  return [...new Set(String(raw).split(/\n+/).map(l=>l.replace(/^\s*(?:[-–—*•]|\d+[.)])\s*/,"").replace(/^[«"“„']+|[»"”“'.]+$/g,"").trim()).filter(l=>l&&l.length<=90))].slice(0,3);
}
/** A markdown checklist out of the model's task list (accepts «- [ ] …», «- …», «1. …»). */
export function parseTasks(raw=""){
  const items=String(raw).split(/\n+/).map(l=>l.replace(/^\s*(?:[-*•]\s*(?:\[[ xX]?\]\s*)?|\d+[.)]\s*)/,"").trim()).filter(Boolean).filter(l=>!/^задач\s+в\s+записи\s+нет/i.test(l));
  return items.slice(0,12);
}
