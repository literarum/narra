/* Working with the device the app runs on: install, keep the screen awake while writing, haptics, share sheet,
   dictation, automatic copies into a folder, opening backup files from the file manager.
   Every feature checks that the browser has it and quietly does nothing otherwise. */
import {state,$,escapeHtml,icon,nowIso,isoStamp,safeStorageGet,safeStorageSet} from "./core.js?v=4.5.0";
import {kvGet,kvSet} from "./reminders.js?v=4.5.0";
import * as privacy from "./privacy.js?v=4.5.0";
let ctx=null,wake=null,rec=null,recWanted=false;

/* ---------- install ---------- */
export const installReady=()=>!!window.__narraInstall;
export const installed=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;

/* ---------- screen stays on while an entry is open ---------- */
let waking=false;
async function syncWake(){
  if(waking)return;waking=true;try{await syncWakeNow();}finally{waking=false;}
}
async function syncWakeNow(){
  const want=state.prefs.keepAwake&&!!state.editing&&document.visibilityState==="visible"&&!!navigator.wakeLock;
  if(want&&!wake){
    try{wake=await navigator.wakeLock.request("screen");wake.addEventListener("release",()=>{wake=null;});}catch{wake=null;}
  }else if(!want&&wake){try{await wake.release();}catch{}wake=null;}
}

/* ---------- haptics ---------- */
const vibe=ms=>{if(state.prefs.haptics&&navigator.vibrate&&!matchMedia("(prefers-reduced-motion: reduce)").matches)try{navigator.vibrate(ms);}catch{}};

/* ---------- dictation ---------- */
const Recognition=()=>globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
function setDictationUi(on){$$dict().forEach(b=>{b.classList.toggle("is-on",on);b.setAttribute("aria-pressed",String(on));});}
const $$dict=()=>[...document.querySelectorAll('[data-action="dictate"]')];
function stopDictation(){recWanted=false;try{rec?.stop();}catch{}rec=null;setDictationUi(false);}
function startDictation(){
  const R=Recognition();if(!R)return ctx.toast("Этот браузер не умеет распознавать речь.");
  const r=new R();r.lang="ru-RU";r.continuous=true;r.interimResults=false;
  r.onresult=e=>{
    for(let i=e.resultIndex;i<e.results.length;i++){
      if(!e.results[i].isFinal)continue;
      const t=e.results[i][0].transcript.trim();
      if(t){const body=$("#entry-body"),v=body?.value||"";const sep=v&&!/[\s\n]$/.test(body.value.slice(0,body.selectionStart))?" ":"";ctx.insertAtCaret(sep+t.charAt(0).toLocaleUpperCase("ru-RU")+t.slice(1)+" ");}
    }
  };
  r.onerror=e=>{if(e.error==="not-allowed"||e.error==="service-not-allowed"){ctx.toast("Нет доступа к микрофону. Разрешите его в настройках браузера.");stopDictation();}else if(e.error==="no-speech"||e.error==="aborted"){/* keep listening */}else{ctx.toast("Диктовка остановилась.");stopDictation();}};
  r.onend=()=>{if(r!==rec)return;if(recWanted&&state.editing){try{r.start();}catch{stopDictation();}}else stopDictation();};
  rec=r;recWanted=true;
  try{r.start();setDictationUi(true);vibe(12);}catch{stopDictation();}
}
function toggleDictation(){
  if(recWanted){stopDictation();return;}
  if(safeStorageGet("narra-dictation-ok")==="1"){startDictation();return;}
  ctx.confirmDialog({title:"Диктовать текст?",text:"Распознавание речи выполняет ваш браузер или система. В некоторых браузерах звук для этого отправляется на сервис распознавания. Narra сама ничего не отправляет и не сохраняет звук.",confirmLabel:"Начать диктовку",iconName:"mic"},()=>{safeStorageSet("narra-dictation-ok","1");startDictation();});
}

/* ---------- share ---------- */
async function shareEntry(){
  const ed=state.editing;if(!ed)return;
  const text=ed.body||"",title=ed.title||"";
  try{await navigator.share({title,text});}
  catch(e){if(e?.name!=="AbortError")ctx.toast("Не получилось открыть меню «Поделиться».");}
}

/* ---------- automatic copies into a folder ---------- */
export const folderSupported=()=>typeof window.showDirectoryPicker==="function";
const KEEP=7;
async function dirHandle(){try{return await kvGet("backupDir");}catch{return null;}}
export async function folderStatus(){
  const h=await dirHandle();if(!h)return {state:"off"};
  let perm="prompt";try{perm=await h.queryPermission({mode:"readwrite"});}catch{}
  const last=await kvGet("backupLast").catch(()=>null);
  return {state:perm==="granted"?"ready":"needs-permission",name:h.name,last};
}
async function writeBackup(h){
  const {buildFullZip}=await import("./backup.js?v=4.5.0");
  const {zip,manifest}=await buildFullZip();
  const name=`narra-auto-${isoStamp()}.zip`;
  const f=await h.getFileHandle(name,{create:true}),w=await f.createWritable();
  await w.write(zip);await w.close();
  const mine=[];for await(const [n,e] of h.entries())if(e.kind==="file"&&/^narra-auto-.*\.zip$/.test(n))mine.push(n);
  mine.sort().reverse();for(const n of mine.slice(KEEP)){try{await h.removeEntry(n);}catch{}}
  await kvSet("backupLast",{at:nowIso(),name,entries:manifest.counts.entries}).catch(()=>{});
  return manifest.counts.entries;
}
async function chooseFolder(){
  if(!folderSupported())return ctx.toast("Этот браузер не позволяет выбрать папку. Используйте «Резервная копия» вручную.");
  const proceed=async()=>{
    let h;try{h=await window.showDirectoryPicker({id:"narra-backup",mode:"readwrite",startIn:"documents"});}catch{return;}
    await kvSet("backupDir",h);ctx.setPref("autoBackup",true);
    try{const n=await writeBackup(h);ctx.toast(`Папка «${h.name}» подключена. Сохранено записей: ${n}.`);}catch(e){console.error(e);ctx.toast("Папка выбрана, но сохранить в неё не удалось.");}
    ctx.render();
  };
  ctx.confirmDialog({title:"Копии в папку",text:`Narra будет сохранять полную копию раз в сутки при открытии и хранить последние ${KEEP}. Копии в папке не зашифрованы — выбирайте папку, к которой доступ только у вас.`,confirmLabel:"Выбрать папку",iconName:"backup"},proceed);
}
async function backupNow({silent=false}={}){
  const h=await dirHandle();if(!h){if(!silent)ctx.toast("Папка не выбрана.");return;}
  let perm="prompt";try{perm=await h.queryPermission({mode:"readwrite"});if(perm!=="granted"&&!silent)perm=await h.requestPermission({mode:"readwrite"});}catch{}
  if(perm!=="granted"){if(!silent)ctx.toast("Нет доступа к папке. Разрешите его или выберите папку заново.");return;}
  if(state.locked)return;
  if(!silent&&!await privacy.reauth("Копия содержит весь дневник. Подтвердите паролем."))return;
  try{const n=await writeBackup(h);if(!silent){ctx.toast(`Копия сохранена в «${h.name}»: записей ${n}.`);ctx.render();}}
  catch(e){console.error(e);if(!silent)ctx.toast("Не удалось сохранить копию в папку.");}
}
async function autoBackup(){
  if(!state.prefs.autoBackup||state.locked||!folderSupported())return;
  const last=await kvGet("backupLast").catch(()=>null);
  if(last&&Date.now()-new Date(last.at).getTime()<22*3600*1000)return;
  const h=await dirHandle();if(!h)return;
  let perm="prompt";try{perm=await h.queryPermission({mode:"readwrite"});}catch{}
  if(perm==="granted")await backupNow({silent:true});
  else if(safeStorageGet("narra-backup-nag")!==isoStamp().slice(0,10)){safeStorageSet("narra-backup-nag",isoStamp().slice(0,10));ctx.toast("Пора сохранить копию дневника в папку.",{label:"Сохранить",action:"autobackup-now"});}
}

/* ---------- backup files opened from the file manager ---------- */
function watchLaunch(){
  if(!("launchQueue" in window))return;
  launchQueue.setConsumer(async params=>{
    if(!params.files?.length)return;
    try{
      const files=await Promise.all(params.files.map(h=>h.getFile()));
      if(state.locked){ctx.toast("Сначала откройте дневник, затем откройте файл ещё раз.");return;}
      (await import("./backup.js?v=4.5.0")).beginImport(files);
    }catch(e){console.error(e);}
  });
}

export const actions={
  "install-app":async()=>{
    const ev=window.__narraInstall;
    if(!ev){ctx.toast(/iP(hone|ad|od)/.test(navigator.userAgent)?"На iPhone: «Поделиться» → «На экран Домой».":"Установка доступна в меню браузера («Установить приложение»).");return;}
    ev.prompt();const {outcome}=await ev.userChoice.catch(()=>({}));window.__narraInstall=null;
    if(outcome==="accepted")ctx.toast("Narra установлена.");ctx.render();
  },
  "share-entry":()=>shareEntry(),
  "dictate":()=>toggleDictation(),
  "autobackup-choose":()=>chooseFolder(),
  "autobackup-now":()=>backupNow(),
  "autobackup-off":async()=>{await kvSet("backupDir",null).catch(()=>{});ctx.setPref("autoBackup",false);ctx.toast("Копии в папку отключены. Уже сохранённые файлы остались на месте.");ctx.render();}
};
export function init(c){
  ctx=c;
  setInterval(()=>{syncWake();if(recWanted&&!state.editing)stopDictation();},2500);
  document.addEventListener("visibilitychange",()=>{syncWake();if(document.visibilityState!=="visible"&&recWanted)stopDictation();});
  document.addEventListener("click",e=>{if(e.target.closest?.(".pip,.switch,.tool-button,.chip,.segmented button,.mobile-nav-item,.tab"))vibe(6);},{passive:true});
  window.addEventListener("appinstalled",()=>{window.__narraInstall=null;});
  watchLaunch();
  setTimeout(autoBackup,4000);
  setInterval(()=>{if(!state.locked&&document.visibilityState==="visible")autoBackup();},10*60*1000); // also after an unlock later in the session
}
