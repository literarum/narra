/* Privacy: screen lock, inactivity timer and password re-entry before dangerous actions.
   The lock hides the diary and drops what was decrypted for display (text in memory, media links); it is a screen lock,
   not encryption of the data at rest — the settings screen says so in plain words. */
import {state,ctx,$,$$,escapeHtml,icon,safeStorageGet,safeStorageSet,safeStorageRemove} from "./core.js?v=4.2.0";
import {makeLock,verifyPasscode,retryDelayMs,passcodeProblem,INACTIVITY_OPTIONS} from "./lock.mjs?v=4.2.0";
import * as store from "./store.js?v=4.2.0";
import * as media from "./media.js?v=4.2.0";

const FAIL_KEY="narra-lock-fails";
const readFails=()=>{try{const v=JSON.parse(safeStorageGet(FAIL_KEY)||"{}");return {n:Number(v.n)||0,at:Number(v.at)||0};}catch{return {n:0,at:0};}};
const writeFails=v=>safeStorageSet(FAIL_KEY,JSON.stringify(v));
/** Milliseconds the person still has to wait before another attempt is accepted. */
export function waitLeft(now=Date.now()){const f=readFails();return Math.max(0,f.at+retryDelayMs(f.n)-now);}
async function attempt(pass){
  if(waitLeft()>0)return {ok:false,wait:waitLeft()};
  const ok=await verifyPasscode(pass,state.lock);
  if(ok){safeStorageRemove(FAIL_KEY);return {ok:true};}
  const f=readFails();writeFails({n:f.n+1,at:Date.now()});
  return {ok:false,wait:waitLeft()};
}
const waitText=ms=>{const s=Math.ceil(ms/1000);return s>=60?`${Math.ceil(s/60)} мин.`:`${s} с`;};

/* ---------- the lock screen ---------- */
const forgetLink=`<details class="lock-forgot"><summary>Забыли пароль?</summary><p>Пароль нельзя восстановить: у Narra нет сервера и нет способа его сбросить. Если у вас есть резервная копия, вы можете стереть дневник на этом устройстве и восстановить записи из копии.</p><button class="secondary danger" type="button" data-lock-wipe>Стереть дневник на этом устройстве</button></details>`;
function lockMarkup(){
  return `<div class="lock-card" role="dialog" aria-modal="true" aria-labelledby="lock-title" tabindex="-1">
    <span class="brand-mark" aria-hidden="true"><span>N</span></span>
    <h1 id="lock-title">Дневник закрыт</h1>
    <p class="subtle">Введите пароль, чтобы продолжить.</p>
    <form class="lock-form" novalidate>
      <label class="field"><span class="label">Пароль</span><span class="password-wrap"><input class="input" id="lock-input" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" aria-describedby="lock-error"><button type="button" class="icon-button icon-button-quiet" data-lock-peek aria-label="Показать пароль" aria-pressed="false">${icon("eye")}</button></span></label>
      <p class="form-error" id="lock-error" role="alert" hidden></p>
      <button class="primary" type="submit" id="lock-submit">Открыть</button>
    </form>${forgetLink}
  </div>`;
}
function ensureLockRoot(){
  let root=$("#lock-screen");
  if(!root){root=document.createElement("div");root.id="lock-screen";root.className="lock-screen";document.body.append(root);}
  return root;
}
let countdown=null;
function showError(text){const box=$("#lock-error");if(!box)return;box.textContent=text||"";box.hidden=!text;}
function runCountdown(){
  clearInterval(countdown);
  const btn=$("#lock-submit"),input=$("#lock-input");
  const tick=()=>{
    const left=waitLeft();
    if(left<=0){clearInterval(countdown);if(btn)btn.disabled=false;if(input)input.disabled=false;showError("");return;}
    if(btn)btn.disabled=true;
    showError(`Слишком много попыток. Подождите ${waitText(left)}.`);
  };
  tick();if(waitLeft()>0)countdown=setInterval(tick,1000);
}
function mountLock(){
  const root=ensureLockRoot();
  root.innerHTML=lockMarkup();
  const form=$(".lock-form",root),input=$("#lock-input",root);
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const pass=input.value;if(!pass){showError("Введите пароль.");return;}
    const btn=$("#lock-submit"),label=btn.textContent;btn.disabled=true;btn.textContent="Проверяем…";
    const res=await attempt(pass);
    btn.textContent=label;
    if(res.ok){input.value="";await unlock();return;}
    input.value="";btn.disabled=false;
    if(res.wait>0)runCountdown();else{showError("Пароль не подошёл. Попробуйте ещё раз.");input.focus();}
  });
  root.addEventListener("click",e=>{
    const peek=e.target.closest("[data-lock-peek]");
    if(peek){const show=input.type==="password";input.type=show?"text":"password";peek.setAttribute("aria-pressed",String(show));peek.setAttribute("aria-label",show?"Скрыть пароль":"Показать пароль");input.focus();return;}
    if(e.target.closest("[data-lock-wipe]"))wipeFromLockScreen(root);
  });
  runCountdown();
  requestAnimationFrame(()=>input.focus({preventScroll:true}));
}
function wipeFromLockScreen(root){
  const box=$(".lock-forgot",root);
  box.innerHTML=`<p><strong>Это удалит все записи, отметки и вложения на этом устройстве.</strong> Восстановить их можно только из резервной копии. Чтобы продолжить, введите «стереть».</p><input class="input" id="lock-wipe-input" autocomplete="off" aria-label="Подтверждение"><button class="primary danger" type="button" id="lock-wipe-go" disabled>Стереть дневник</button>`;
  const inp=$("#lock-wipe-input",box),go=$("#lock-wipe-go",box);
  inp.addEventListener("input",()=>{go.disabled=inp.value.trim().toLocaleLowerCase("ru-RU")!=="стереть";});
  go.addEventListener("click",async()=>{
    go.disabled=true;
    try{await store.eraseEverything();}catch(error){console.error(error);}
    location.replace(location.pathname);
  });
  inp.focus();
}

/** Hides the diary. Whatever is unsaved in the editor is saved first; nothing decrypted stays on screen or in memory. */
export async function lockNow({initial=false}={}){
  if(!state.lock||state.locked)return;
  if(!initial){
    try{media.stopRecordingIfAny?.();}catch{}
    try{if(state.editing)await ctx.editorSave?.("lock");}catch(error){console.error(error);}
    ctx.closeDialog?.({restoreFocus:false});
    ctx.closeOverlay?.({restoreFocus:false});
  }
  state.locked=true;
  document.body.classList.add("is-locked");
  $("#app").hidden=true;
  $("#view").innerHTML="";
  for(const id of ["overlay-root","dialog-root","toast-region"]){const n=$("#"+id);if(n)n.innerHTML="";}
  store.revokeMediaUrls();
  Object.assign(state,{entries:[],checkins:[],attachments:[],chapters:[],reviews:[],entityNotes:[],quickDraft:"",journalSelected:new Set(),pendingImport:null});
  document.title="Narra — дневник закрыт";
  mountLock();
}
async function unlock(){
  clearInterval(countdown);
  await store.loadData();
  state.locked=false;lastActivity=Date.now();
  $("#lock-screen")?.remove();
  document.body.classList.remove("is-locked");
  $("#app").hidden=false;
  ctx.render({enter:true});
  requestAnimationFrame(()=>$("#main")?.focus({preventScroll:true}));
}
export function onLockedKey(e){
  if(e.key!=="Tab")return;
  const root=$("#lock-screen");if(!root)return;
  const f=$$("button:not([disabled]),input:not([disabled]),summary",root).filter(x=>x.offsetParent!==null);
  if(!f.length)return;
  const first=f[0],last=f[f.length-1];
  if(!root.contains(document.activeElement)){e.preventDefault();first.focus();}
  else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
}

/* ---------- inactivity ---------- */
let lastActivity=Date.now(),watching=false;
export function startIdleWatch(){
  if(watching)return;watching=true;
  const bump=()=>{lastActivity=Date.now();};
  for(const ev of ["pointerdown","keydown","touchstart","wheel"])window.addEventListener(ev,bump,{passive:true,capture:true});
  const check=()=>{
    const min=state.prefs.lockMinutes;
    if(state.lock&&!state.locked&&min>0&&Date.now()-lastActivity>=min*60000)lockNow();
  };
  setInterval(check,5000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)check();});
}

/* ---------- password re-entry before dangerous actions ---------- */
/** Resolves true when there is no lock, or when the right password was entered; false when the person cancelled. */
export function reauth(reason="Это действие необратимо. Подтвердите паролем."){
  if(!state.lock)return Promise.resolve(true);
  return new Promise(resolve=>{
    let done=false;
    const finish=v=>{if(done)return;done=true;obs.disconnect();resolve(v);};
    const root=$("#dialog-root"),obs=new MutationObserver(()=>{if(!root.firstElementChild)finish(false);});
    ctx.formDialog({title:"Введите пароль",text:reason,iconName:"lock",confirmLabel:"Подтвердить",fields:[{id:"pass",label:"Пароль",type:"password",autocomplete:"current-password",max:200}]},async v=>{
      const res=await attempt(v.pass);
      if(res.ok){finish(true);return "";}
      return res.wait>0?`Слишком много попыток. Подождите ${waitText(res.wait)}.`:"Пароль не подошёл.";
    });
    obs.observe(root,{childList:true});
  });
}

/* ---------- setting, changing and removing the password ---------- */
const passFields=[{id:"p1",label:"Новый пароль",type:"password",autocomplete:"new-password",max:200,hint:"От 4 символов. Восстановить пароль нельзя."},{id:"p2",label:"Повторите пароль",type:"password",autocomplete:"new-password",max:200}];
async function setPassword(){
  ctx.formDialog({title:state.lock?"Новый пароль":"Защитить паролем",text:"Пароль скрывает дневник на экране. Он не шифрует данные на диске: полную защиту даёт шифрование диска устройства.",iconName:"lock",confirmLabel:"Сохранить",fields:passFields},async v=>{
    const problem=passcodeProblem(v.p1);if(problem)return problem;
    if(v.p1!==v.p2)return "Пароли не совпадают.";
    await store.saveLock(await makeLock(v.p1));
    safeStorageRemove(FAIL_KEY);
    ctx.render();ctx.toast(state.lock?"Пароль сохранён.":"Пароль не сохранён.");
  });
}
export const actions={
  "lock-now":()=>lockNow(),
  "lock-setup":()=>setPassword(),
  "lock-change":async()=>{if(await reauth("Чтобы сменить пароль, введите текущий."))setPassword();},
  "lock-remove":async()=>{
    if(!await reauth("Чтобы убрать пароль, введите текущий."))return;
    await store.saveLock(null);state.prefs.lockMinutes=0;ctx.setPref("lockMinutes",0);safeStorageRemove(FAIL_KEY);
    ctx.render();ctx.toast("Пароль убран. Дневник открывается сразу.");
  },
};
export const views={};
export const lockOptions=INACTIVITY_OPTIONS;
export {escapeHtml};
