/* Reminders and app shortcuts. No server: the schedule lives in this browser, the page checks it while it is open,
   and the service worker checks it when the system wakes it (periodic sync, notification events).
   Notification text never contains diary text. */
import {state,routeAllowed} from "./core.js?v=4.5.0";
import "./notify-rules.js?v=4.5.0";
const N=()=>globalThis.NarraNotify;
const DB_NAME="narra-notify",STORE="kv";
let ctx=null,timer=0,lastCfg="";

function openKv(){
  return new Promise((resolve,reject)=>{
    if(!("indexedDB" in globalThis))return reject(new Error("no indexedDB"));
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>req.result.createObjectStore(STORE);
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
export async function kvGet(key){const db=await openKv();return new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).get(key);r.onsuccess=()=>{db.close();res(r.result);};r.onerror=()=>{db.close();rej(r.error);};});}
export async function kvSet(key,val){const db=await openKv();return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(val,key);tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();rej(tx.error);};});}

/** Read-modify-write of one key inside a single transaction (the service worker uses the same shape). */
async function kvUpdate(key,fn){
  const db=await openKv();
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,"readwrite"),st=tx.objectStore(STORE),g=st.get(key);
    g.onsuccess=()=>{st.put(fn(g.result),key);};
    tx.oncomplete=()=>{db.close();res();};tx.onerror=tx.onabort=()=>{db.close();rej(tx.error);};
  });
}
export const supported=()=>"Notification" in globalThis;
export const permission=()=>supported()?Notification.permission:"unsupported";
export const isStandalone=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
export const isIOS=()=>/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);

/** What the schedule looks like right now, from preferences and the journal. */
function currentConfig(prev){
  const p=state.prefs,live=!state.locked&&Array.isArray(state.entries)&&state.entries.length>=0&&!state.locked;
  const days=new Set(),decisions=[],nowD=new Date(),md=`${nowD.getMonth()}-${nowD.getDate()}`;let onThisDay=0;
  if(live)for(const e of state.entries){
    if(e.deletedAt)continue;
    days.add(N().dayKey(new Date(e.createdAt||e.happenedAt)));
    const hd=new Date(e.happenedAt);if(`${hd.getMonth()}-${hd.getDate()}`===md&&hd.getFullYear()<nowD.getFullYear())onThisDay++;
    const d=e.decision;if(d&&d.revisitOn&&!d.outcome)decisions.push(d.revisitOn);
  }
  const today=N().dayKey(new Date());
  return N().normalize({
    ...prev,
    dailyOn:!!p.notifyDaily,dailyTime:p.reminderTime,weeklyOn:!!p.notifyWeekly,weeklyDay:p.notifyWeeklyDay,weeklyTime:"19:00",decisionsOn:!!p.notifyDecisions,memoryOn:!!p.notifyMemory,onThisDay:live?onThisDay:(prev?.onThisDay||0),memoryDay:live?N().dayKey(nowD):(prev?.memoryDay||""),
    lastEntryDay:live?(days.has(today)?today:""):(prev?.lastEntryDay||""),
    decisionDates:live?decisions.sort():(prev?.decisionDates||[]),
    base:new URL("./",location.href).href
  });
}
async function firedMap(){try{return await kvGet("fired")||{};}catch{return {};}}
/** The saved schedule (without the "shown today" marks, which live under their own key so the page and the worker never overwrite each other). */
async function sync(){
  let prev={};try{prev=await kvGet("config")||{};}catch{}
  const {fired:_ignored,...clean}=currentConfig(prev),json=JSON.stringify(clean);
  if(json!==lastCfg){lastCfg=json;try{await kvSet("config",clean);}catch{}}
  return {...clean,fired:await firedMap()};
}
async function show(item){
  const opts={body:item.body,tag:`narra-${item.id}`,icon:"./icon-192.png",badge:"./icon-192.png",lang:"ru",data:{url:item.url}};
  try{
    const reg=await navigator.serviceWorker?.getRegistration?.();
    if(reg?.showNotification){await reg.showNotification(item.title,opts);return true;}
  }catch{}
  try{const n=new Notification(item.title,opts);n.onclick=()=>{focus(item.url);n.close();};return true;}catch{return false;}
}
async function updateBadge(cfg){
  if(!state.prefs.badge||!navigator.setAppBadge)return;
  try{const n=N().pending(cfg);if(n)await navigator.setAppBadge(n);else await navigator.clearAppBadge();}catch{}
}
async function tick(){
  if(state.prefs.badge||permission()==="granted"){const c=await sync();await updateBadge(c);}
  if(permission()!=="granted")return;
  const cfg=await sync();
  for(const item of N().due(cfg)){
    if(await show(item)){const day=N().dayKey(new Date());await kvUpdate("fired",f=>({...(f||{}),[item.id]:day})).catch(()=>{});}
  }
}
function focus(url){window.focus();handleIntent(url);}

let pending=null,pendingTimer=0;
/** ?quick=1, ?new=1, ?go=<route>, shared text — from shortcuts, notifications and the system share sheet.
    While the diary is locked the request waits in memory and is carried out right after unlocking. */
export function handleIntent(search){
  const q=new URLSearchParams(String(search||"").replace(/^[^?]*\?/,""));
  const go=q.get("go"),shared=[q.get("title"),q.get("text"),q.get("url")].filter(Boolean).join("\n\n").slice(0,20000);
  if(!shared&&!q.has("new")&&!q.has("quick")&&!(go&&routeAllowed(go)))return false;
  if(state.locked){
    pending=search;
    if(!pendingTimer)pendingTimer=setInterval(()=>{if(!state.locked&&pending){const s=pending;pending=null;clearInterval(pendingTimer);pendingTimer=0;handleIntent(s);}},700);
    return true;
  }
  if(shared){ctx.openEditor(null,{body:shared}).then(()=>ctx.markEditorDirty?.("share"));return true;}
  if(q.has("new")){ctx.openEditor();return true;}
  if(q.has("quick")){ctx.handleAction?.("quick-focus");return true;}
  ctx.goTo(go);return true;
}
async function requestPermission(){
  if(!supported())return "unsupported";
  let result=Notification.permission;
  if(result==="default"){try{result=await Notification.requestPermission();}catch{result="default";}}
  if(result==="granted"){registerPeriodic();await tick();}
  return result;
}
async function registerPeriodic(){
  try{
    const reg=await Promise.race([navigator.serviceWorker?.ready,new Promise(r=>setTimeout(r,4000))]);
    if(reg?.periodicSync&&(await navigator.permissions?.query?.({name:"periodic-background-sync"}))?.state==="granted")await reg.periodicSync.register("narra-remind",{minInterval:60*60*1000});
  }catch{}
}
export function statusText(){
  const perm=permission();
  if(perm==="unsupported")return isIOS()&&!isStandalone()?"На iPhone уведомления работают, когда Narra добавлена на экран «Домой»: «Поделиться» → «На экран Домой».":"Этот браузер не поддерживает уведомления. Напоминание появится карточкой на экране «Сегодня».";
  if(perm==="denied")return "Уведомления запрещены в настройках браузера или системы. Разрешите их для этого сайта — или пользуйтесь карточкой на экране «Сегодня».";
  if(perm==="granted")return "Уведомления разрешены. Показываются, пока Narra открыта или свёрнута; если система разрешает фоновую работу приложения — и когда закрыта.";
  return "Уведомления ещё не разрешены. Браузер спросит разрешение при включении.";
}

export const actions={
  "notify-enable":async el=>{
    const key=el.dataset.key||"notifyDaily";
    const result=await requestPermission();
    if(result==="granted"||result==="unsupported"||result==="default"||result==="denied"){
      ctx.setPref(key,true);
      if(result==="denied")ctx.toast("Уведомления запрещены в браузере. Напоминание останется на экране «Сегодня».");
      else if(result==="unsupported")ctx.toast(statusText());
      await sync();ctx.render();
    }
  },
  "notify-test":async()=>{
    const result=await requestPermission();
    if(result!=="granted"){ctx.toast(result==="denied"?"Уведомления запрещены в браузере.":statusText());return;}
    const ok=await show({id:"test",title:"Narra",body:"Так будут выглядеть напоминания. Текста дневника в них нет.",url:"./"});
    ctx.toast(ok?"Проверочное уведомление отправлено.":"Не получилось показать уведомление.");
  }
};
export function init(c){
  ctx=c;
  const start=()=>{
    tick();
    clearInterval(timer);timer=setInterval(tick,30000);
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")tick();else sync();});
    window.addEventListener("focus",tick);
    navigator.serviceWorker?.addEventListener?.("message",e=>{if(e.data?.type==="narra-open")handleIntent(e.data.url);});
  };
  start();
}
