/* Privacy: screen lock, inactivity timer and password re-entry before dangerous actions.
   The lock hides the diary and drops what was decrypted for display (text in memory, media links); it is a screen lock,
   not encryption of the data at rest — the settings screen says so in plain words. */
import {state,ctx,$,$$,escapeHtml,icon,safeStorageGet,safeStorageSet,safeStorageRemove} from "./core.js?v=4.3.0";
import {makeLock,verifyPasscode,retryDelayMs,passcodeProblem,INACTIVITY_OPTIONS,makeRecoveryCode,makeRecovery,verifyRecovery,hintProblem,HINT_MAX} from "./lock.mjs?v=4.3.0";
import {modalHeader} from "./kit.js?v=4.3.0";
import * as store from "./store.js?v=4.3.0";
import * as media from "./media.js?v=4.3.0";

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
const wipeButton=`<button class="secondary danger" type="button" data-lock-wipe>Стереть дневник на этом устройстве</button>`;
function forgotMarkup(){
  const l=state.lock||{};
  const code=l.recovery?`<div class="lock-recover-step"><strong>Есть код восстановления?</strong><p>Введите его и задайте новый пароль — записи останутся на месте.</p><button class="secondary" type="button" data-lock-recover>Восстановить по коду</button></div>`:`<div class="lock-recover-step"><p>Код восстановления для этого пароля не создавался.</p></div>`;
  return `<details class="lock-forgot"><summary>Забыли пароль?</summary>${l.hint?`<div class="lock-recover-step"><p>Подсказка появится после двух неверных попыток.</p></div>`:""}${code}<div class="lock-recover-step"><strong>Ничего не помогло</strong><p>Можно стереть дневник на этом устройстве и вернуть записи из резервной копии, если она у вас есть.</p>${wipeButton}</div></details>`;
}
function lockMarkup(){
  return `<div class="lock-card" role="dialog" aria-modal="true" aria-labelledby="lock-title" tabindex="-1">
    <span class="brand-mark" aria-hidden="true"><span>N</span></span>
    <h1 id="lock-title">Дневник закрыт</h1>
    <p class="subtle">Введите пароль, чтобы продолжить.</p>
    <form class="lock-form" novalidate>
      <label class="field"><span class="label">Пароль</span><span class="password-wrap"><input class="input" id="lock-input" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" aria-describedby="lock-error"><button type="button" class="icon-button icon-button-quiet" data-lock-peek aria-label="Показать пароль" aria-pressed="false">${icon("eye")}</button></span></label>
      <p class="form-error" id="lock-error" role="alert" hidden></p>
      <button class="primary" type="submit" id="lock-submit">Открыть</button>
    </form><p class="lock-hint" id="lock-hint" hidden></p>${forgotMarkup()}
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
function showHintAfterFails(){
  const box=$("#lock-hint");if(!box||!state.lock?.hint)return;
  if(readFails().n>=2){box.hidden=false;box.innerHTML=`${icon("bulb")}<span><strong>Подсказка:</strong> ${escapeHtml(state.lock.hint)}</span>`;}
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
    showHintAfterFails();
  });
  root.addEventListener("click",e=>{
    const peek=e.target.closest("[data-lock-peek]");
    if(peek){const show=input.type==="password";input.type=show?"text":"password";peek.setAttribute("aria-pressed",String(show));peek.setAttribute("aria-label",show?"Скрыть пароль":"Показать пароль");input.focus();return;}
    if(e.target.closest("[data-lock-wipe]"))wipeFromLockScreen(root);
    if(e.target.closest("[data-lock-recover]"))recoverFromLockScreen(root);
  });
  runCountdown();showHintAfterFails();
  requestAnimationFrame(()=>input.focus({preventScroll:true}));
}
/** Recovery by code: the code is checked against its stored hash (same retry limits as the password), then a new password is set. */
function recoverFromLockScreen(root){
  const box=$(".lock-forgot",root);
  box.innerHTML=`<form class="lock-form lock-recover" novalidate><p><strong>Восстановление по коду</strong></p>
    <label class="field"><span class="label">Код восстановления</span><input class="input mono" id="rc-code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"></label>
    <label class="field"><span class="label">Новый пароль</span><input class="input" id="rc-p1" type="password" autocomplete="new-password"></label>
    <label class="field"><span class="label">Повторите пароль</span><input class="input" id="rc-p2" type="password" autocomplete="new-password"></label>
    <p class="form-error" id="rc-error" role="alert" hidden></p>
    <button class="primary" type="submit">Сменить пароль и открыть</button><button class="ghost" type="button" data-lock-recover-cancel>Назад</button></form>`;
  const err=t=>{const e=$("#rc-error",box);e.textContent=t||"";e.hidden=!t;};
  $("[data-lock-recover-cancel]",box).addEventListener("click",()=>{box.outerHTML=forgotMarkup();$(".lock-forgot",root).open=true;});
  $("form",box).addEventListener("submit",async e=>{
    e.preventDefault();
    if(waitLeft()>0){err(`Слишком много попыток. Подождите ${waitText(waitLeft())}.`);return;}
    const code=$("#rc-code",box).value,p1=$("#rc-p1",box).value,p2=$("#rc-p2",box).value;
    const problem=passcodeProblem(p1);if(problem){err(problem);return;}
    if(p1!==p2){err("Пароли не совпадают.");return;}
    const btn=$("button[type=submit]",box);btn.disabled=true;
    const ok=await verifyRecovery(code,state.lock?.recovery);
    if(!ok){const f=readFails();writeFails({n:f.n+1,at:Date.now()});btn.disabled=false;err(waitLeft()>0?`Код не подошёл. Подождите ${waitText(waitLeft())}.`:"Код не подошёл. Проверьте буквы и цифры.");return;}
    try{
      const fresh=makeRecoveryCode();
      await store.saveLock({...await makeLock(p1),hint:"",recovery:await makeRecovery(fresh)});
      safeStorageRemove(FAIL_KEY);
      await unlock();
      showRecoveryCode(fresh,{after:"reset"});
    }catch(error){console.error(error);btn.disabled=false;err("Не удалось сохранить новый пароль. Ничего не изменилось — попробуйте ещё раз.");}
  });
  $("#rc-code",box).focus();
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
    if(state.editing){
      let saved=false;try{saved=(await ctx.editorSave?.("lock"))!==false;}catch(error){console.error(error);}
      // never hide a page whose text could not be written: closing it would lose what was typed
      if(!saved&&String(state.editing?.body||"").trim()){ctx.toast("Не удалось сохранить запись, поэтому дневник пока не закрыт. Сохраните запись и заблокируйте снова.");return;}
    }
    ctx.closeDialog?.({restoreFocus:false});
    ctx.closeOverlay?.({restoreFocus:false});
  }
  state.locked=true;
  document.body.classList.add("is-locked");
  $("#app").hidden=true;
  $("#view").innerHTML="";
  for(const id of ["overlay-root","dialog-root","toast-region"]){const n=$("#"+id);if(n)n.innerHTML="";}
  store.revokeMediaUrls();
  Object.assign(state,{entries:[],checkins:[],attachments:[],chapters:[],reviews:[],entityNotes:[],journalSelected:new Set(),pendingImport:null});
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
    if(state.lock&&!state.locked&&min>0&&Date.now()-lastActivity>=min*60000&&!$("#dialog-root .recovery-dialog"))lockNow();
  };
  setInterval(check,5000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)check();});
}

/* ---------- password re-entry before dangerous actions ---------- */
/** Resolves true when there is no lock, or when the right password was entered; false when the person cancelled. */
export function reauth(reason="Это действие необратимо. Подтвердите паролем."){
  if(!state.lock)return Promise.resolve(true);
  return new Promise(resolve=>{
    let done=false,passed=false;
    const finish=v=>{if(done)return;done=true;obs.disconnect();resolve(v);};
    // resolve only once the password dialog has really closed, so the next dialog is not wiped by its closing
    const root=$("#dialog-root"),obs=new MutationObserver(()=>{if(!root.firstElementChild)finish(passed);});
    ctx.formDialog({title:"Введите пароль",text:reason,iconName:"lock",confirmLabel:"Подтвердить",fields:[{id:"pass",label:"Пароль",type:"password",autocomplete:"current-password",max:200}]},async v=>{
      const res=await attempt(v.pass);
      if(res.ok){passed=true;return "";}
      return res.wait>0?`Слишком много попыток. Подождите ${waitText(res.wait)}.`:"Пароль не подошёл.";
    });
    obs.observe(root,{childList:true});
  });
}

/* ---------- setting, changing and removing the password ---------- */
const hintField=(value="")=>({id:"hint",label:"Подсказка к паролю (необязательно)",type:"text",max:HINT_MAX,value,hint:"Её увидите вы на экране входа после двух неверных попыток. Не пишите сам пароль."});
const passFields=[{id:"p1",label:"Новый пароль",type:"password",autocomplete:"new-password",max:200,hint:"От 4 символов."},{id:"p2",label:"Повторите пароль",type:"password",autocomplete:"new-password",max:200},hintField()];
async function setPassword(){
  const isNew=!state.lock;
  ctx.formDialog({title:isNew?"Защитить паролем":"Новый пароль",text:"Пароль скрывает дневник на экране. Он не шифрует данные на диске: полную защиту даёт шифрование диска устройства. Сразу после сохранения вы получите код восстановления.",iconName:"lock",confirmLabel:"Сохранить",fields:passFields},async v=>{
    const problem=passcodeProblem(v.p1);if(problem)return problem;
    if(v.p1!==v.p2)return "Пароли не совпадают.";
    const hp=hintProblem(v.hint,v.p1);if(hp)return hp;
    const code=makeRecoveryCode();
    await store.saveLock({...await makeLock(v.p1),hint:String(v.hint||"").trim(),recovery:await makeRecovery(code)});
    safeStorageRemove(FAIL_KEY);
    ctx.render();
    setTimeout(()=>showRecoveryCode(code,{after:isNew?"new":"change"}),80); // after the form dialog has closed itself
  });
}
/** The recovery code is shown once; the person must confirm they have kept it before the window can be closed. */
export function showRecoveryCode(code,{after="new"}={}){
  const root=$("#dialog-root");
  const lead={new:"Пароль установлен.",change:"Пароль изменён. Прежний код больше не действует.",reset:"Пароль заменён, дневник открыт. Прежний код использован — вот новый.",fresh:"Прежний код больше не действует."}[after]||"";
  root.innerHTML=`<div class="overlay" data-action="close-dialog-backdrop-locked"><div class="modal confirm recovery-dialog" role="alertdialog" aria-modal="true" aria-label="Код восстановления" tabindex="-1" data-code="${escapeHtml(code)}">${modalHeader("Код восстановления","","key","").replace(/<button class="icon-button[\s\S]*?<\/button>(?=<\/header>)/,"")}
    <div class="modal-body"><p>${escapeHtml(lead)} Если забудете пароль, этот код позволит задать новый — <strong>записи останутся на месте</strong>.</p>
    <p class="recovery-code" id="recovery-code" tabindex="-1" aria-label="Код восстановления">${escapeHtml(code)}</p>
    <div class="recovery-actions"><button type="button" class="secondary button-with-icon" data-action="recovery-copy">${icon("copy")}<span>Скопировать</span></button><button type="button" class="secondary button-with-icon" data-action="recovery-download">${icon("download")}<span>Сохранить файлом</span></button></div>
    <p class="subtle text-small">Храните код отдельно от устройства: в менеджере паролей или на бумаге. Он показывается один раз, в Narra хранится только его отпечаток. Кто знает код — может сменить пароль.</p>
    <label class="check confirm-ack"><input type="checkbox" data-ack><span class="check-box"></span><span>Я сохранил(а) код в надёжном месте</span></label></div>
    <footer class="modal-footer"><button class="primary" data-action="confirm-dialog" disabled>Готово</button></footer></div></div>`;
  state.confirmCb=null;state.dialogPrev=document.activeElement;
  requestAnimationFrame(()=>$("#recovery-code")?.focus?.({preventScroll:true}));
}
function recoveryText(code){
  return `Narra — код восстановления пароля\n\n${code}\n\nЭтот код позволяет задать новый пароль на экране входа, не теряя записей.\nХраните его отдельно от устройства. Код действует один раз.\n`;
}
async function copyText(text){
  try{await navigator.clipboard.writeText(text);return true;}catch{
    const t=document.createElement("textarea");t.value=text;t.setAttribute("readonly","");t.style.position="fixed";t.style.opacity="0";document.body.append(t);t.select();
    let ok=false;try{ok=document.execCommand("copy");}catch{}t.remove();return ok;
  }
}
export const actions={
  "lock-now":()=>lockNow(),
  "lock-setup":()=>setPassword(),
  "lock-change":async()=>{if(await reauth("Чтобы сменить пароль, введите текущий."))setPassword();},
  "lock-hint":async()=>{
    if(!await reauth("Чтобы изменить подсказку, введите пароль."))return;
    ctx.formDialog({title:"Подсказка к паролю",text:"Подсказка видна на экране входа после двух неверных попыток. Оставьте поле пустым, чтобы убрать её.",iconName:"bulb",confirmLabel:"Сохранить",fields:[hintField(state.lock?.hint||"")]},async v=>{
      const raw=String(v.hint||"").trim();
      // the password itself is not known here; guard against the obvious mistake by checking the answer against the lock
      if(raw&&await verifyPasscode(raw,state.lock))return "Подсказка не должна быть самим паролем.";
      const hp=hintProblem(raw,"");if(hp)return hp;
      await store.saveLock({...state.lock,hint:raw});ctx.render();ctx.toast(raw?"Подсказка сохранена.":"Подсказка убрана.");
    });
  },
  "lock-recovery-new":async()=>{
    if(!await reauth("Чтобы выпустить новый код восстановления, введите пароль."))return;
    const code=makeRecoveryCode();
    await store.saveLock({...state.lock,recovery:await makeRecovery(code)});
    ctx.render();setTimeout(()=>showRecoveryCode(code,{after:"fresh"}),120);
  },
  "recovery-copy":async el=>{const c=el.closest("[data-code]")?.dataset.code;if(!c)return;const ok=await copyText(c);ctx.toast(ok?"Код скопирован.":"Не удалось скопировать. Выделите код и скопируйте вручную.");},
  "recovery-download":el=>{
    const c=el.closest("[data-code]")?.dataset.code;if(!c)return;
    const url=URL.createObjectURL(new Blob([recoveryText(c)],{type:"text/plain;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;a.download="narra-recovery-code.txt";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
  },
  "lock-remove":async()=>{
    if(!await reauth("Чтобы убрать пароль, введите текущий."))return;
    await store.saveLock(null);state.prefs.lockMinutes=0;ctx.setPref("lockMinutes",0);safeStorageRemove(FAIL_KEY);
    ctx.render();ctx.toast("Пароль убран. Дневник открывается сразу.");
  },
};
export const views={};
export const lockOptions=INACTIVITY_OPTIONS;
export {escapeHtml};
