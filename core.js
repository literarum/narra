/* Narra core: shared state, preferences, formatting helpers and the `ctx` object that feature modules use.
   No storage, no rendering. Modules import from here; app.js fills `ctx` with the functions it owns. */
import {cleanCustomTools} from "./tools.mjs?v=4.7.0";
import {pluralRu,capitalizeRu,wordCount} from "./domain.mjs?v=4.7.0";
import {plural,strip} from "./text.mjs?v=4.7.0";
import {providerById} from "./ai-state.mjs?v=4.7.0";

export const APP_VERSION="4.7.0";
export const DB_NAME_MAIN="narra-prototype-v1",DB_NAME_DEMO="narra-demo-v1";
export const ROUTES=["today","journal","insights","lifemap","search","memories","reviews","talk","settings"];
export const VALID_ROUTES=new Set(ROUTES);
export const ROUTE_TITLES={today:"Сегодня",journal:"Дневник",insights:"Наблюдения",lifemap:"Карта жизни",search:"Поиск",memories:"Воспоминания",reviews:"Обзоры",talk:"Собеседник",settings:"Настройки"};
/** Which feature switch controls a route. Sections without a switch are always available. */
export const ROUTE_FEATURE={insights:"featInsights",lifemap:"featLifemap",memories:"featMemories",reviews:"featReviews"};
export const SECONDARY_ROUTES=new Set(["insights","lifemap","memories","reviews","talk","settings"]);

export function safeStorageGet(key){try{return localStorage.getItem(key);}catch{return null;}}
export function safeStorageSet(key,value){try{localStorage.setItem(key,value);return true;}catch{return false;}}
export function safeStorageRemove(key){try{localStorage.removeItem(key);return true;}catch{return false;}}

/* ---------- interface preferences (never contain diary text) ---------- */
export const PREF_KEY="narra-prefs";
export const PREF_DEFAULTS={
  density:"comfortable",startRoute:"today",weekStart:1,editorFont:"serif",editorWidth:"standard",
  editorStats:true,spellcheck:true,motion:"on",shortcuts:true,relativeDates:true,
  showStorageNotice:true,showCheckin:true,showMemory:true,showPrompt:true,showRecent:true,showContinue:true,
  /* feature switches: everything optional can be turned off, and its sections disappear */
  featInsights:true,featLifemap:true,featMemories:true,featReviews:true,featChapters:true,featDecisions:true,featMedia:true,
  featWritingAssist:true,featEntitySuggest:true,featSemantic:true,featEmotionsInJournal:true,
  onboarded:false,quickKey:"n",reminderOn:false,reminderTime:"21:00",notifyDaily:false,notifyWeekly:false,notifyWeeklyDay:0,notifyDecisions:false,notifyMemory:false,toolbar:[],customTools:[],autoBackup:false,keepAwake:true,secretInput:"compat",haptics:true,badge:true,lockMinutes:0,journalPage:40,hideDeleteHint:false
};
export const FEATURES=[
  {key:"featInsights",name:"Наблюдения",desc:"Сводки по отметкам и записям: состояния, контексты, эмоции, темы, ритм.",group:"Разделы"},
  {key:"featLifemap",name:"Карта жизни",desc:"Люди, места, темы и проекты, которые вы упоминали, и связи между ними.",group:"Разделы"},
  {key:"featReviews",name:"Обзоры",desc:"Неделя, месяц, квартал и год: факты из ваших записей и место для собственных выводов.",group:"Разделы"},
  {key:"featMemories",name:"Воспоминания",desc:"Подборки из прошлых записей: этот день, давние мысли, главы жизни.",group:"Разделы"},
  {key:"featChapters",name:"Главы жизни",desc:"Периоды с названием и датами; записи можно собирать по главам.",group:"Записи"},
  {key:"featDecisions",name:"Журнал решений",desc:"Поля для решения, вариантов, ожиданий и итога — у записей типа «решение».",group:"Записи"},
  {key:"featMedia",name:"Фото и аудио",desc:"Вложения в записях. Хранятся зашифрованными, метаданные фото удаляются.",group:"Записи"},
  {key:"featWritingAssist",name:"Помощь при письме",desc:"Наводящие вопросы, шаблон структуры, проверка ясности. Только по вашему нажатию.",group:"Записи"},
  {key:"featEntitySuggest",name:"Подсказки имён",desc:"Предлагает добавить людей и места, которых вы уже упоминали.",group:"Записи"},
  {key:"featSemantic",name:"Близость слов в поиске",desc:"Дополнительный поиск по родственным словам. Работает на устройстве, не нейросеть.",group:"Поиск"},
];
export function loadPrefs(){
  let stored={};
  try{const v=JSON.parse(safeStorageGet(PREF_KEY)||"{}");if(v&&typeof v==="object")stored=v;}catch{}
  const prefs={...PREF_DEFAULTS};
  // 4.4: smart search is on by default; switch it on once for people who never chose otherwise
  const migrated=safeStorageGet("narra-sem-default")==="1";
  if(!migrated){if(stored.featSemantic===undefined||stored.featSemantic===false)stored.featSemantic=true;safeStorageSet("narra-sem-default","1");try{safeStorageSet(PREF_KEY,JSON.stringify({...stored}));}catch{}}
  for(const key of Object.keys(PREF_DEFAULTS))if(key in stored&&typeof stored[key]===typeof PREF_DEFAULTS[key])prefs[key]=stored[key];
  if(!["comfortable","compact"].includes(prefs.density))prefs.density="comfortable";
  if(!["serif","sans"].includes(prefs.editorFont))prefs.editorFont="serif";
  if(!["standard","wide"].includes(prefs.editorWidth))prefs.editorWidth="standard";
  if(![0,1].includes(prefs.weekStart))prefs.weekStart=1;
  if(!["on","off"].includes(prefs.motion))prefs.motion="on";
  if(!VALID_ROUTES.has(prefs.startRoute))prefs.startRoute="today";
  if(!["n","c","off"].includes(prefs.quickKey))prefs.quickKey="n";
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(prefs.reminderTime))prefs.reminderTime="21:00";
  prefs.customTools=cleanCustomTools(prefs.customTools);
  prefs.toolbar=Array.isArray(prefs.toolbar)?prefs.toolbar.filter(k=>typeof k==="string").slice(0,120):[];
  if(![0,1,2,3,4,5,6].includes(prefs.notifyWeeklyDay))prefs.notifyWeeklyDay=0;
  if(![0,1,5,15,60].includes(prefs.lockMinutes))prefs.lockMinutes=0;
  if(![20,40,80].includes(prefs.journalPage))prefs.journalPage=40;
  return prefs;
}
/* Password-type fields make iOS show only its own keyboard. A text field whose characters are drawn as dots lets any installed keyboard work.
   Where the browser cannot draw dots (or the person chose «system»), the ordinary password field is used. */
export const secretCompat=()=>state.prefs.secretInput!=="system"&&typeof CSS!=="undefined"&&!!CSS.supports&&CSS.supports("-webkit-text-security","disc");
export const secretAttrs=(autocomplete="off")=>secretCompat()?'type="text" data-secret="1" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go"':`type="password" autocomplete="${autocomplete}" autocapitalize="off" spellcheck="false"`;
export const secretShown=input=>input.dataset.secret==="1"?input.classList.contains("is-revealed"):input.type==="text";
export function secretShow(input,show){if(input.dataset.secret==="1")input.classList.toggle("is-revealed",show);else input.type=show?"text":"password";}
export const featureOn=(key,prefs)=>(prefs||state.prefs)[key]!==false;
/** «Собеседник» exists only while the assistant is connected and the person allowed this function. */
export const talkAvailable=()=>{const a=state.ai;if(!a?.enabled||!a.features?.talk||!a.provider)return false;const p=providerById(a.provider);return Boolean(p&&(state.aiKey||p.needsKey===false));};
export const routeAllowed=(route,prefs)=>{if(route==="talk")return talkAvailable();const f=ROUTE_FEATURE[route];return !f||featureOn(f,prefs);};

const now=new Date();
export const state={
  prefs:loadPrefs(),route:"today",mode:safeStorageGet("narra-mode")==="demo"?"demo":"main",
  entries:[],checkins:[],attachments:[],chapters:[],reviews:[],entityNotes:[],
  config:null,ai:null,aiKey:"",templates:[],lock:null,locked:false,mutedMemoryIds:[],mutedTopics:[],
  journalView:"timeline",journalLimit:40,journalFilters:{},journalSelect:false,journalSelected:new Set(),
  calendarCursor:new Date(now.getFullYear(),now.getMonth(),1),calendarSelectedDate:null,
  reviewKind:"month",reviewCursor:new Date(now.getFullYear(),now.getMonth(),1),
  insightsTab:"overview",lifemapType:"person",lifemapKey:null,lifemapView:"list",settingsTab:"basic",memoriesMode:"day",
  searchQuery:"",searchKind:"all",searchFavoriteOnly:false,searchTheme:"",searchFrom:"",searchTo:"",searchPerson:"",searchPlace:"",searchEmotion:"",searchMedia:false,searchChapter:"",searchNear:true,searchTimeHints:[],
  smartSuggestionsEnabled:safeStorageGet("narra-smart-suggestions")!=="off",
  quickSaving:false,quickDraft:"",checkinDraft:{},checkinExpanded:false,checkinAgain:false,promptShift:0,
  theme:safeStorageGet("narra-theme")||"system",quickTimer:null,
  editing:null,editorPreview:false,overlayKind:null,editorTimer:null,saveStatus:"Сохранено",saveEpoch:0,dirty:false,saveChain:Promise.resolve(true),
  previousFocus:null,checkinSaving:false,storagePersistent:null,diagnostics:null,pendingImport:null,confirmCb:null,db:null,cryptoKey:null,
};
state.journalLimit=state.prefs.journalPage;
state.route=VALID_ROUTES.has(location.hash.replace("#/","").split("?")[0])?location.hash.replace("#/","").split("?")[0]:state.prefs.startRoute;

export const $=(sel,root=document)=>root.querySelector(sel);
export const $$=(sel,root=document)=>[...root.querySelectorAll(sel)];
/** crypto.randomUUID exists only in secure contexts (https, localhost); fall back to getRandomValues so ids never fail. */
export const uid=()=>{
  if(typeof crypto!=="undefined"&&typeof crypto.randomUUID==="function")return crypto.randomUUID();
  const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;
  const h=[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
export const nowIso=()=>new Date().toISOString();
export const fmtDate=(iso,opts={})=>new Intl.DateTimeFormat("ru-RU",{month:"short",day:"numeric",...opts}).format(new Date(iso));
export const fmtLong=iso=>new Intl.DateTimeFormat("ru-RU",{weekday:"long",month:"long",day:"numeric",year:"numeric"}).format(new Date(iso));
export const fmtTime=iso=>new Intl.DateTimeFormat("ru-RU",{hour:"numeric",minute:"2-digit"}).format(new Date(iso));
/** A range of day keys ("2026-08-20", "2026-09-29") without repeating the year: «20 авг. — 29 сент. 2026 г.». */
export function fmtDayRange(fromKey,toKey){
  const a=new Date(`${fromKey}T12:00:00`),b=new Date(`${toKey||fromKey}T12:00:00`);
  if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime()))return "";
  if(fromKey===toKey||!toKey)return fmtDate(a.toISOString(),{year:"numeric"});
  return a.getFullYear()===b.getFullYear()?`${fmtDate(a.toISOString())} — ${fmtDate(b.toISOString(),{year:"numeric"})}`:`${fmtDate(a.toISOString(),{year:"numeric"})} — ${fmtDate(b.toISOString(),{year:"numeric"})}`;
}
export const fmtMonthYear=date=>`${capitalizeRu(new Intl.DateTimeFormat("ru-RU",{month:"long"}).format(date))} ${date.getFullYear()}`;
export const escapeHtml=(s="")=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
export const words=wordCount;
export const chars=(s="")=>s.length;
export {strip,plural,pluralRu,capitalizeRu};
export const icon=(name,className="")=>`<svg class="icon ${className}" aria-hidden="true" focusable="false"><use href="#icon-${escapeHtml(name)}"></use></svg>`;
export const sameDay=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
export function dayOffset(iso){const d=new Date(iso),t=new Date();d.setHours(12,0,0,0);t.setHours(12,0,0,0);return Math.round((t-d)/86400000);}
/** "Сегодня" / "Вчера" / "29 сент." (+ год, если не текущий). Absolute when the preference is off. */
export function relDay(iso){
  const d=new Date(iso),off=dayOffset(iso),sameYear=d.getFullYear()===new Date().getFullYear();
  if(state.prefs.relativeDates){if(off===0)return "Сегодня";if(off===1)return "Вчера";}
  return fmtDate(iso,sameYear?{}:{year:"numeric"});
}
export const kindLabels={thought:"мысль",event:"событие",day:"день",memory:"воспоминание",dream:"сон",decision:"решение",milestone:"веха",letter:"письмо"};
export const kindOptions=Object.entries(kindLabels);
export const wordLabel=plural.word,entryLabel=plural.entry,checkinLabel=plural.checkin,dayLabel=plural.day,yearsLabel=plural.year;
export const matchLabel=n=>pluralRu(n,"совпадение","совпадения","совпадений");
export function localDateInputValue(iso){const d=new Date(iso);return Number.isNaN(d.getTime())?"":`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
export function dateInputToIso(value,fallbackIso=nowIso()){if(!value)return fallbackIso;const [y,m,d]=value.split("-").map(Number),f=new Date(fallbackIso),n=new Date(y,m-1,d,f.getHours(),f.getMinutes(),f.getSeconds(),0);return Number.isNaN(n.getTime())?fallbackIso:n.toISOString();}
export const splitCsv=(value="")=>[...new Set(value.split(",").map(x=>x.trim()).filter(Boolean))].slice(0,24);
export const todayKey=()=>localDateInputValue(nowIso());
export const localDateKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
export const isTyping=el=>el&&(el.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
/** Changes to the diary since a backup: number of entries and check-ins and the newest edit. */
export const diaryFingerprint=()=>{let last="";for(const e of state.entries)if((e.updatedAt||"")>last)last=e.updatedAt||"";return `${state.entries.length}|${state.checkins.length}|${last}`;};
/** When a new backup is due: never made with 10+ entries, or older than 30 days with changes since. */
export function backupDue(){
  if(state.mode==="demo")return null;
  const n=state.entries.filter(e=>!e.deletedAt).length,b=state.lastBackup;
  if(!b?.at)return n>=10?{never:true,days:null}:null;
  const days=Math.floor((Date.now()-Date.parse(b.at))/86400000);
  return days>=30&&b.fingerprint!==diaryFingerprint()?{never:false,days}:null;
}
/** Entries that may be shown and analysed: not in the trash and not a time capsule that is still sealed. */
export const activeEntries=()=>{const t=todayKey();return state.entries.filter(e=>!e.deletedAt&&!(e.openOn&&e.openOn>t));};
/** Still-sealed time capsules (shown only as a closed envelope). */
export const sealedCapsules=()=>{const t=todayKey();return state.entries.filter(e=>!e.deletedAt&&e.openOn&&e.openOn>t);};
export const trashedEntries=()=>state.entries.filter(e=>Boolean(e.deletedAt));
export const entryById=id=>state.entries.find(e=>e.id===id);
export function mediaOf(entryId){return state.attachments.filter(a=>a.entryId===entryId);}

/** The browser refused a write because the storage it allows this site is full. */
export const isQuotaError=e=>Boolean(e)&&(e.name==="QuotaExceededError"||e.cause?.name==="QuotaExceededError"||/quota/i.test(String(e.message||"")));
export const QUOTA_TEXT="Место для дневника в браузере закончилось. Текст остаётся в редакторе. Сохраните резервную копию и освободите место: удалите крупные фото или аудио, очистите корзину или освободите память устройства.";
/* ---------- flight recorder ----------
   The last unexpected errors of this session, for the self-check and a copyable report. Only the error text and where it
   happened are kept — never diary text — and only in memory. */
export const flightLog=[];
export function recordError(kind,error,source=""){
  const msg=String(error?.message||error||"").slice(0,300),stack=String(error?.stack||"").split("\n").slice(0,4).join(" | ").slice(0,500);
  flightLog.push({at:new Date().toISOString(),kind,msg,where:String(source).slice(0,200),stack});
  if(flightLog.length>30)flightLog.shift();
}
/** Filled in by app.js (render, toast, dialogs, …) so feature modules never import app.js. */
export const ctx={state};
export function downloadBlob(content,type,filename){
  const blob=content instanceof Blob?content:new Blob([content],{type}),a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
/** Keyboard labels follow the platform: ⌘ on Apple devices, Ctrl elsewhere. */
export const IS_APPLE=typeof navigator!=="undefined"&&/Mac|iPhone|iPad|iPod/.test(navigator.userAgentData?.platform||navigator.platform||navigator.userAgent||"");
export const MOD_KEY=IS_APPLE?"⌘":"Ctrl";
/** "Ctrl+Shift+Z" → "⇧⌘Z" on Apple devices, unchanged elsewhere. */
export const kbdLabel=s=>IS_APPLE?String(s).replace(/Ctrl\+/g,"⌘").replace(/Alt\+/g,"⌥").replace(/Shift\+/g,"⇧"):String(s);
/** The shortcuts that really work with the current preferences (the quick-note key can be changed or switched off). */
export function shortcutList(){
  const m=MOD_KEY,q=state.prefs.quickKey;
  return [
    ["Везде",[[`${m} K`,"Палитра команд"],...(q!=="off"?[[q.toUpperCase(),"Новая запись"]]:[]),["/","Поиск"],[`${m} F`,"Поиск (в редакторе — найти в тексте)"],["?","Эта подсказка"],["Esc","Закрыть окно"]]],
    ["В редакторе",[[`${m} S`,"Сохранить сейчас"],[`${m} Enter`,"Готово, закрыть запись"],[`${m} B`,"Жирный"],[`${m} I`,"Курсив"],[`${m} E`,"Код"],[`${m} K`,"Ссылка"],[`${m} Z`,"Отменить"],[`${m} G`,"Следующее совпадение"]]],
  ];
}
export const isoStamp=()=>localDateKey(new Date()); // local date: a backup made at 00:30 is named after today, not after yesterday in UTC
