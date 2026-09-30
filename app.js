/* Narra 4.3 — application shell: routing, overlays, dialogs, command palette, global listeners, start-up.
   Everything a section does lives in its own module (today, journal, editor, insights, …); this file wires them together. */
import {fuzzyScore,searchEntries,pluralRu,warmSearchIndex} from "./domain.mjs?v=4.3.0";
import {enhance,closePopovers,popoverOpen,setDateOptions} from "./ui.mjs?v=4.3.0";
import {entryText} from "./text.mjs?v=4.3.0";
import {state,ctx,$,$$,escapeHtml,icon,relDay,kindLabels,activeEntries,isTyping,safeStorageGet,safeStorageSet,PREF_KEY,PREF_DEFAULTS,VALID_ROUTES,ROUTE_TITLES,ROUTE_FEATURE,SECONDARY_ROUTES,routeAllowed,featureOn,APP_VERSION,nowIso} from "./core.js?v=4.3.0";
import {modalHeader,pageHeader,emptyState} from "./kit.js?v=4.3.0";
import * as store from "./store.js?v=4.3.0";
import * as today from "./today.js?v=4.3.0";
import * as journal from "./journal.js?v=4.3.0";
import * as search from "./search.js?v=4.3.0";
import * as memories from "./memories.js?v=4.3.0";
import * as editor from "./editor.js?v=4.3.0";
import * as privacy from "./privacy.js?v=4.3.0";
import * as media from "./media.js?v=4.3.0";
import * as checkinUi from "./checkin-ui.js?v=4.3.0";

const MODULES=[today,journal,search,memories,editor,privacy,media,checkinUi];
const VIEWS={},ACTIONS={};
for(const m of MODULES){Object.assign(VIEWS,m.views||{});Object.assign(ACTIONS,m.actions||{});}

/* Sections that are not needed to open the journal load on first use (keeps the start-up bundle small).
   A view loads before its first render; an action that is not registered yet loads all of them and retries. */
const LAZY_FILES={insights:"insights.js",lifemap:"lifemap.js",reviews:"reviews.js",settings:"settings.js",backup:"backup.js"};
const LAZY_ROUTES={insights:"insights",lifemap:"lifemap",reviews:"reviews",settings:"settings"};
const lazyLoaded=new Map();
const lazyPromises=new Map();
function loadLazy(name){
  if(lazyLoaded.has(name))return Promise.resolve(lazyLoaded.get(name));
  if(!lazyPromises.has(name)){
    lazyPromises.set(name,import(`./${LAZY_FILES[name]}?v=${APP_VERSION}`).then(m=>{
      lazyLoaded.set(name,m);MODULES.push(m);
      Object.assign(VIEWS,m.views||{});Object.assign(ACTIONS,m.actions||{});
      m.init?.(ctx);
      return m;
    }).catch(error=>{lazyPromises.delete(name);throw error;}));
  }
  return lazyPromises.get(name);
}
const loadAllLazy=()=>Promise.all(Object.keys(LAZY_FILES).map(loadLazy));
ACTIONS["reload-app"]=()=>location.reload();

/* ---------- preferences & theme ---------- */
function setPref(key,value){
  state.prefs[key]=value;
  safeStorageSet(PREF_KEY,JSON.stringify(state.prefs));
  applyPrefs();
}
function applyPrefs(){
  const b=document.body,p=state.prefs;
  b.dataset.density=p.density;b.dataset.editorFont=p.editorFont;b.dataset.editorWidth=p.editorWidth;
  b.dataset.motion=p.motion==="off"?"off":"on";b.dataset.kbd=p.shortcuts?"on":"off";b.dataset.mode=state.mode;
  setDateOptions({weekStart:p.weekStart});
  applyFeatures();
}
/** Sections whose feature is switched off disappear from every menu. */
function applyFeatures(){
  for(const [route,key] of Object.entries(ROUTE_FEATURE)){
    const off=!featureOn(key);
    $$(`[data-route="${route}"]`).forEach(b=>{b.hidden=off;});
  }
}
function resolveTheme(){return state.theme==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):state.theme;}
function applyTheme(){
  const theme=resolveTheme();
  document.documentElement.dataset.theme=theme;
  document.querySelector('meta[name="theme-color"]').content=theme==="dark"?"#1d1c19":"#f4f0e7";
  const use=$("[data-theme-icon]");if(use)use.setAttribute("href",theme==="dark"?"#icon-sun":"#icon-theme");
}
function reducedMotion(){return state.prefs.motion==="off"||matchMedia("(prefers-reduced-motion: reduce)").matches;}
function animateIn(el){
  if(!el||reducedMotion()||!el.animate)return;
  el.animate([{opacity:0,transform:"translateY(5px)"},{opacity:1,transform:"none"}],{duration:240,easing:"cubic-bezier(.2,.7,.2,1)"});
}
/** Fold a card away, then remove it. */
function collapseAndRemove(node){
  if(reducedMotion()||!node.animate){node.remove();return;}
  const h=node.offsetHeight;node.style.overflow="hidden";
  node.animate([{opacity:1,height:`${h}px`},{opacity:0,height:"0px",marginTop:"0px",marginBottom:"0px",paddingTop:"0px",paddingBottom:"0px"}],{duration:260,easing:"cubic-bezier(.2,.7,.2,1)"}).finished.then(()=>node.remove()).catch(()=>node.remove());
}

/* ---------- routing ---------- */
function normalizeRoute(route){return VALID_ROUTES.has(route)&&routeAllowed(route)?route:"today";}
function routeTo(route,{scroll=true}={}){
  route=normalizeRoute(route);
  closePopovers();
  state.route=route;
  history.replaceState(null,"",`#/${route}`);
  document.title=`${ROUTE_TITLES[route]} — Narra`;
  render({enter:true});
  if(scroll)window.scrollTo({top:0,left:0,behavior:"instant"});
  requestAnimationFrame(()=>$("#main")?.focus({preventScroll:true}));
}
function goTo(route){
  if(overlayOpen())closeOverlay({restoreFocus:false});
  routeTo(route);
  if(route==="search")setTimeout(()=>$("#search-input")?.focus(),60);
}
function updateNav(){
  $$("[data-route]").forEach(b=>{const active=b.dataset.route===state.route;b.classList.toggle("is-active",active);if(active)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});
  const more=$('.mobile-nav [data-action="open-more"]');
  if(more)more.classList.toggle("is-active",SECONDARY_ROUTES.has(state.route));
}

/* ---------- toasts ---------- */
function toast(message,action=null,{duration}={}){
  const region=$("#toast-region");if(!region)return;
  const existing=$$(".toast",region).find(t=>t.dataset.message===message&&!t.classList.contains("is-leaving"));
  if(existing){clearTimeout(existing._timer);existing._timer=setTimeout(()=>dismissToast(existing),duration??(action?7000:4200));return;}
  const node=document.createElement("div");node.className="toast";node.dataset.message=message;
  const copy=document.createElement("span");copy.className="toast-copy";copy.textContent=message;node.append(copy);
  if(action?.label&&action?.action){
    const button=document.createElement("button");button.className="toast-action";button.textContent=action.label;button.dataset.action=action.action;
    if(action.id)button.dataset.id=action.id;
    button.dataset.dismissToast="1";node.append(button);
  }
  const close=document.createElement("button");close.className="toast-close";close.setAttribute("aria-label","Скрыть уведомление");close.innerHTML=icon("x");
  close.addEventListener("click",()=>dismissToast(node));node.append(close);
  region.append(node);
  while($$(".toast",region).length>3)dismissToast($$(".toast",region)[0],true);
  node._timer=setTimeout(()=>dismissToast(node),duration??(action?7000:4200));
}
function dismissToast(node,instant=false){
  if(!node||node.classList.contains("is-leaving"))return;
  clearTimeout(node._timer);
  if(instant){node.remove();return;}
  node.classList.add("is-leaving");setTimeout(()=>node.remove(),220);
}
function showFatal(title,details){
  document.body.classList.add("startup-error");
  const view=$("#view");if(!view)return;
  view.innerHTML=`<section class="startup-card card" role="alert"><p class="eyebrow">Narra остановилась безопасно</p><h1>${escapeHtml(title)}</h1><p class="subtle">${escapeHtml(details||"Устраните проблему с хранилищем и перезагрузите страницу.")}</p><div class="privacy-callout">${icon("shield")}<div><strong>Запись остановлена</strong><p>После этой ошибки Narra не предпринимала попыток перезаписать локальные данные.</p></div></div><button class="primary button-with-icon" data-action="reload-page">${icon("refresh")}<span>Перезагрузить Narra</span></button></section>`;
}
store.hooks.toast=toast;store.hooks.fatal=showFatal;

/* ---------- storage persistence ---------- */
async function checkStoragePersistence(){
  if(!navigator.storage?.persisted){state.storagePersistent=null;return;}
  try{state.storagePersistent=await navigator.storage.persisted();}catch{state.storagePersistent=null;}
}
async function requestStoragePersistence(){
  if(!navigator.storage?.persist){toast("Этот браузер не позволяет запросить защищённое хранилище.");return;}
  try{
    state.storagePersistent=await navigator.storage.persist();render();
    toast(state.storagePersistent?"Браузер подтвердил: дневник защищён от автоматической очистки.":"Браузер не дал гарантию. Делайте резервные копии — это надёжнее.");
  }catch{state.storagePersistent=null;toast("Не удалось изменить режим хранения данных браузера.");}
}

/* ---------- render pipeline ---------- */
function applyMeters(){
  const bars=$$("[data-w],[data-h]");if(!bars.length)return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>bars.forEach(el=>{
    if(el.dataset.w!=null)el.style.width=`${el.dataset.w}%`;
    if(el.dataset.h!=null)el.style.height=`${el.dataset.h}%`;
  })));
}
function render({enter=false}={}){
  closePopovers();
  if(state.locked)return;
  const need=LAZY_ROUTES[state.route];
  if(need&&!lazyLoaded.has(need)){
    loadLazy(need).then(()=>{if(LAZY_ROUTES[state.route]===need)render({enter});}).catch(error=>{console.error(error);$("#view").innerHTML=`<div class="card"><h2>Не получилось открыть раздел</h2><p class="subtle">Записи в безопасности. Проверьте соединение и попробуйте ещё раз.</p><button class="secondary" data-action="reload-app">Обновить страницу</button></div>`;});
    return;
  }
  for(const m of MODULES)m.beforeRender?.();
  updateNav();applyFeatures();
  if(!routeAllowed(state.route))state.route="today";
  const view=$("#view");
  view.classList.toggle("no-enter",!enter);
  view.innerHTML=(VIEWS[state.route]||VIEWS.today)();
  enhance(view);applyMeters();
  const activeTab=view.querySelector(".tabs .tab.is-active");
  if(activeTab){const t=activeTab.parentElement;t.scrollLeft=Math.max(0,activeTab.offsetLeft-(t.clientWidth-activeTab.offsetWidth)/2);}
  for(const m of MODULES)m.afterRender?.(state.route,view);
  media.hydrate(view);
  renderBanner();
}
/** A single quiet strip under the header: demo mode, or changes made in another tab. */
function renderBanner(){
  let bar=$("#app-banner");
  const demo=state.mode==="demo",remote=state.remoteChanged&&!state.editing;
  if(!demo&&!remote){bar?.remove();return;}
  if(!bar){bar=document.createElement("div");bar.id="app-banner";bar.className="app-banner";bar.setAttribute("role","status");$("#main").prepend(bar);}
  bar.innerHTML=demo?`<span>${icon("info")}<span>Демонстрация: вымышленные данные в отдельном хранилище. Ваши записи не затронуты.</span></span><button class="link-button" data-action="exit-demo">Выйти из демонстрации</button>`
    :`<span>${icon("refresh")}<span>Дневник изменился в другой вкладке.</span></span><button class="link-button" data-action="reload-data">Обновить</button>`;
}

/* ---------- overlays & dialogs ---------- */
const overlayOpen=()=>Boolean($("#overlay-root .overlay"));
const dialogOpen=()=>Boolean($("#dialog-root .overlay"));
function focusFirst(box){
  const preferred=box.querySelector("input:not([type='hidden']):not([hidden]), textarea, .select-trigger, button.primary:not(:disabled), button.secondary:not([data-action^='close']):not(:disabled)")||box.querySelector("button:not([data-action^='close']):not(:disabled)");
  (preferred||box).focus({preventScroll:true});
}
function overlay(content,className="modal",label="Диалог",{kind="modal",focus=true}={}){
  if(!overlayOpen()){state.previousFocus=state.focusCarry||document.activeElement;state.focusCarry=null;}
  closePopovers();
  document.body.classList.add("modal-open");
  const root=$("#overlay-root");
  root.innerHTML=`<div class="overlay" data-action="close-overlay-backdrop"><div class="${className}" role="dialog" aria-modal="true" aria-label="${escapeHtml(label)}" tabindex="-1">${content}</div></div>`;
  state.overlayKind=kind;
  const box=root.firstElementChild.firstElementChild;
  enhance(box);media.hydrate(box);
  if(focus)focusFirst(box);
  return box;
}
function closeOverlay({restoreFocus=true}={}){
  clearTimeout(state.editorTimer);closePopovers();
  $("#overlay-root").innerHTML="";
  editor.onOverlayClosed?.();
  state.editing=null;state.overlayKind=null;state.editorPreview=false;state.slash=null;state.find=null;state.pendingImport=null;
  document.body.classList.remove("modal-open");
  const prev=state.previousFocus;state.previousFocus=null;
  if(restoreFocus&&prev?.isConnected&&prev!==document.body)prev.focus({preventScroll:true});
}
function confirmDialog({title,text,detail="",ack="",confirmLabel="Подтвердить",cancelLabel="Отмена",danger=false,iconName="info",requireText=""},onConfirm){
  const root=$("#dialog-root");
  state.dialogPrev=document.activeElement;state.confirmCb=onConfirm;
  const gate=requireText?`<label class="field"><span class="label">Чтобы продолжить, введите «${escapeHtml(requireText)}»</span><input class="input" id="confirm-gate" autocomplete="off" autocapitalize="off" spellcheck="false" data-gate="${escapeHtml(requireText)}"></label>`:"";
  root.innerHTML=`<div class="overlay" data-action="close-dialog-backdrop"><div class="modal confirm" role="alertdialog" aria-modal="true" aria-label="${escapeHtml(title)}" tabindex="-1">${modalHeader(title,"",iconName,"close-dialog")}<div class="modal-body"><p>${escapeHtml(text)}</p>${detail?`<p class="confirm-detail">${escapeHtml(detail)}</p>`:""}${ack?`<label class="check confirm-ack"><input type="checkbox" data-ack><span class="check-box"></span><span>${escapeHtml(ack)}</span></label>`:""}${gate}</div><footer class="modal-footer"><button class="secondary" data-action="close-dialog">${escapeHtml(cancelLabel)}</button><button class="primary${danger?" danger":""}" data-action="confirm-dialog" ${requireText||ack?"disabled":""}>${escapeHtml(confirmLabel)}</button></footer></div></div>`;
  if(requireText)requestAnimationFrame(()=>$("#confirm-gate")?.focus({preventScroll:true}));
  else requestAnimationFrame(()=>$('#dialog-root [data-action="close-dialog"].secondary')?.focus({preventScroll:true}));
}
/** Small form in a dialog. `onSubmit(values)` may return an error string: the dialog then stays open and shows it. */
function formDialog({title,text="",fields=[],confirmLabel="Сохранить",cancelLabel="Отмена",iconName="info",danger=false},onSubmit){
  const root=$("#dialog-root");
  state.dialogPrev=document.activeElement;
  const inputs=fields.map(f=>`<label class="field"><span class="label">${escapeHtml(f.label)}</span>${f.type==="select"?`<select data-select id="fd-${f.id}" aria-label="${escapeHtml(f.label)}">${f.options.map(([v,l])=>`<option value="${escapeHtml(v)}" ${String(f.value||"")===String(v)?"selected":""}>${escapeHtml(l)}</option>`).join("")}</select>`:f.type==="textarea"?`<textarea class="input" id="fd-${f.id}" rows="${f.rows||3}" placeholder="${escapeHtml(f.placeholder||"")}" maxlength="${f.max||2000}">${escapeHtml(f.value||"")}</textarea>`:`<input class="input" id="fd-${f.id}" type="${f.type||"text"}" value="${escapeHtml(f.value||"")}" placeholder="${escapeHtml(f.placeholder||"")}" autocomplete="${f.autocomplete||"off"}" maxlength="${f.max||200}" ${f.type==="date"?"data-datepicker data-clearable":""}>`}${f.hint?`<span class="hint-text">${escapeHtml(f.hint)}</span>`:""}</label>`).join("");
  root.innerHTML=`<div class="overlay" data-action="close-dialog-backdrop"><form class="modal confirm form-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" tabindex="-1" novalidate>${modalHeader(title,"",iconName,"close-dialog")}<div class="modal-body">${text?`<p>${escapeHtml(text)}</p>`:""}${inputs}<p class="form-error" id="fd-error" role="alert" hidden></p></div><footer class="modal-footer"><button type="button" class="secondary" data-action="close-dialog">${escapeHtml(cancelLabel)}</button><button type="submit" class="primary${danger?" danger":""}">${escapeHtml(confirmLabel)}</button></footer></form></div>`;
  const form=root.querySelector("form");enhance(form);
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const values={};for(const f of fields)values[f.id]=form.querySelector(`#fd-${f.id}`).value;
    const btn=form.querySelector('[type="submit"]');btn.disabled=true;
    let err;try{err=await onSubmit(values);}catch(error){console.error(error);err="Не получилось. Данные не изменились.";}
    btn.disabled=false;
    if(err){const box=$("#fd-error",form);box.textContent=err;box.hidden=false;}
    else closeDialog({restoreFocus:true});
  });
  requestAnimationFrame(()=>form.querySelector("input,textarea")?.focus({preventScroll:true}));
}
function closeDialog({restoreFocus=true}={}){
  $("#dialog-root").innerHTML="";state.confirmCb=null;
  const prev=state.dialogPrev;state.dialogPrev=null;
  if(restoreFocus&&prev?.isConnected)prev.focus({preventScroll:true});
}
/** A calm "it worked" window after something was removed: what happened, where it went, how to get it back. */
function resultDialog({title,text,hint="",actions=[],iconName="check",hidePref=""}){
  if(hidePref&&state.prefs[hidePref]){toast(text,actions.find(a=>a.toast)?{label:actions.find(a=>a.toast).label,action:actions.find(a=>a.toast).action,id:actions.find(a=>a.toast).id}:null);return;}
  state.dialogPrev=document.activeElement;
  const btns=actions.map(a=>`<button class="${a.primary?"primary":"secondary"}" data-action="${a.action}"${a.id?` data-id="${escapeHtml(a.id)}"`:""}${a.to?` data-to="${escapeHtml(a.to)}"`:""}>${escapeHtml(a.label)}</button>`).join("");
  $("#dialog-root").innerHTML=`<div class="overlay" data-action="close-dialog-backdrop"><div class="modal confirm result-dialog" role="alertdialog" aria-modal="true" aria-label="${escapeHtml(title)}" tabindex="-1">${modalHeader(title,"",iconName,"close-dialog")}<div class="modal-body"><p>${escapeHtml(text)}</p>${hint?`<p class="result-hint">${icon("info")}<span>${escapeHtml(hint)}</span></p>`:""}${hidePref?`<label class="check confirm-ack"><input type="checkbox" data-hide-pref="${hidePref}"><span class="check-box"></span><span>Больше не показывать это окно</span></label>`:""}</div><footer class="modal-footer">${btns}<button class="${actions.some(a=>a.primary)?"ghost":"primary"}" data-action="close-dialog">Понятно</button></footer></div></div>`;
  requestAnimationFrame(()=>$('#dialog-root .modal-footer button:last-child')?.focus({preventScroll:true}));
}
/** Bottom sheet rendered in #dialog-root. */
function sheetDialog(content,label){
  state.dialogPrev=document.activeElement;
  $("#dialog-root").innerHTML=`<div class="overlay" data-action="close-dialog-backdrop"><div class="sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(label)}" tabindex="-1">${content}</div></div>`;
  const box=$("#dialog-root .sheet");enhance(box);media.hydrate(box);
  requestAnimationFrame(()=>focusFirst(box));
  return box;
}

/* ---------- more sheet (phones) ---------- */
function moreMenu(){
  const item=(iconName,title,sub,attrs)=>`<button class="more-menu-item" ${attrs}>${icon(iconName)}<span><strong>${title}</strong><small>${sub}</small></span>${icon("chevron-right")}</button>`;
  const on=k=>featureOn(k);
  overlay(`${modalHeader("Ещё","Дополнительные разделы и действия.","more")}<div class="modal-body more-menu">
    ${on("featInsights")?item("insights","Наблюдения","Сводки по отметкам и записям",'data-action="go" data-to="insights"'):""}
    ${on("featLifemap")?item("map","Карта жизни","Люди, места, темы и проекты",'data-action="go" data-to="lifemap"'):""}
    ${on("featMemories")?item("memories","Воспоминания","Бережное возвращение к прошлому",'data-action="go" data-to="memories"'):""}
    ${on("featReviews")?item("reviews","Обзоры","Неделя, месяц, квартал, год",'data-action="go" data-to="reviews"'):""}
    <div class="more-menu-sep" role="separator"></div>
    ${item("settings","Настройки","Функции, отметки, приватность, данные",'data-action="go" data-to="settings"')}
    ${item("backup","Резервная копия","Полная копия, Markdown или CSV",'data-action="export"')}
    ${state.lock?item("lock","Заблокировать","Скрыть дневник до ввода пароля",'data-action="lock-now"'):""}
    ${item("theme","Сменить тему","Светлая или тёмная",'data-action="toggle-theme"')}
  </div>`,"sheet","Дополнительные разделы");
}

/* ---------- command palette ---------- */
const recentCommandKeys=()=>{try{const v=JSON.parse(safeStorageGet("narra-recent-commands")||"[]");return Array.isArray(v)?v.slice(0,8):[];}catch{return [];}};
const noteRecentCommand=key=>safeStorageSet("narra-recent-commands",JSON.stringify([key,...recentCommandKeys().filter(x=>x!==key)].slice(0,8)));
function commandItems(){
  const nav=[["today","home","Сегодня","главная старт"],["journal","journal","Дневник","лента записи календарь главы"],["insights","insights","Наблюдения","сводка статистика состояния"],["lifemap","map","Карта жизни","люди места темы проекты"],["search","search","Поиск","найти искать"],["memories","memories","Воспоминания","прошлое"],["reviews","reviews","Обзоры","итоги неделя месяц год"],["settings","settings","Настройки","параметры оформление функции"]].filter(([r])=>routeAllowed(r));
  const base=[
    {key:"new",group:"Действия",icon:"plus",label:"Новая запись",kw:"создать написать добавить",action:"new-entry"},
    {key:"quick",group:"Действия",icon:"pen",label:"Быстрая запись",kw:"заметка мысль фраза",action:"quick-focus"},
    {key:"checkin",group:"Действия",icon:"state",label:"Отметить состояние",kw:"настроение энергия напряжение",action:"start-checkin"},
    {key:"date",group:"Действия",icon:"calendar",label:"Перейти к дате",kw:"календарь день",action:"go-date"},
    {key:"random",group:"Действия",icon:"random",label:"Случайное воспоминание",kw:"вспомнить прошлое",action:"random-memory"},
    {key:"focus",group:"Действия",icon:"focus",label:"Режим фокуса",kw:"писать без отвлечений тишина",action:"focus-new"},
    ...nav.map(([r,i,l,k])=>({key:"go-"+r,group:"Разделы",icon:i,label:l,kw:k,action:"go",to:r})),
    {key:"theme",group:"Система",icon:"theme",label:"Сменить тему",kw:"тёмная светлая оформление",action:"toggle-theme"},
    {key:"export",group:"Система",icon:"backup",label:"Экспорт и резервная копия",kw:"скачать сохранить архив",action:"export"},
    {key:"import",group:"Система",icon:"upload",label:"Восстановить из копии",kw:"импорт загрузить файл markdown",action:"import"},
    {key:"diagnostics",group:"Система",icon:"shield",label:"Самопроверка",kw:"диагностика хранилище",action:"run-diagnostics"},
  ];
  if(state.lock)base.push({key:"lock",group:"Система",icon:"lock",label:"Заблокировать",kw:"пароль скрыть закрыть замок",action:"lock-now"});
  return base;
}
function paletteModel(q){
  const all=commandItems(),query=q.trim();
  if(!query){
    const recent=recentCommandKeys().slice(0,3),rest=all.filter(i=>!recent.includes(i.key)),groups=[];
    const rec=recent.map(k=>all.find(i=>i.key===k)).filter(Boolean);
    if(rec.length)groups.push(["Недавние",rec]);
    for(const g of ["Действия","Разделы","Система"]){const items=rest.filter(i=>i.group===g);if(items.length)groups.push([g,items]);}
    return groups;
  }
  const cmds=all.map(i=>({i,s:fuzzyScore(query,i.label,i.kw)})).filter(x=>x.s>=50).sort((a,b)=>b.s-a.s).map(x=>x.i);
  const groups=[];
  if(cmds.length)groups.push(["Команды",cmds]);
  if(query.length>=2){
    const found=searchEntries(activeEntries(),query,{kindLabels}).results.slice(0,5);
    if(found.length)groups.push(["Записи",found.map(e=>({key:"e-"+e.id,group:"Записи",icon:"journal",label:entryText(e).title,hint:relDay(e.happenedAt),action:"open-entry",id:e.id}))]);
  }
  return groups;
}
function paletteMarkup(groups){
  if(!groups.length)return `<div class="command-empty">Ничего не найдено. Попробуйте другое слово.</div>`;
  let idx=0;
  return groups.map(([name,items])=>`<div class="command-group" role="presentation">${name}</div>`+items.map(i=>{
    const n=idx++;
    return `<button class="command-item${n===0?" is-active":""}" role="option" id="cmd-${n}" aria-selected="${n===0}" data-action="${i.action}" data-command-key="${escapeHtml(i.key)}"${i.to?` data-to="${i.to}"`:""}${i.id?` data-id="${escapeHtml(i.id)}"`:""}><span class="command-icon">${icon(i.icon)}</span><span>${escapeHtml(i.label)}</span><small>${escapeHtml(i.hint||"")}</small></button>`;
  }).join("")).join("");
}
function commandPalette(){
  const box=overlay(`<div class="command-search">${icon("search")}<input id="command-input" role="combobox" aria-expanded="true" aria-controls="command-list" aria-autocomplete="list" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Команда или слово из записи…" aria-label="Палитра команд"><kbd class="only-desktop">Esc</kbd></div><div class="command-list" id="command-list" role="listbox" aria-label="Результаты">${paletteMarkup(paletteModel(""))}</div>`,"command","Палитра команд",{kind:"command"});
  const input=$("#command-input",box),list=$("#command-list",box),items=()=>$$(".command-item",list);
  const setActive=i=>{
    const a=items();if(!a.length)return;i=(i+a.length)%a.length;
    a.forEach((b,n)=>{b.classList.toggle("is-active",n===i);b.setAttribute("aria-selected",String(n===i));});
    input.setAttribute("aria-activedescendant",a[i].id);a[i].scrollIntoView({block:"nearest"});
  };
  const current=()=>Math.max(0,items().findIndex(b=>b.classList.contains("is-active")));
  input.addEventListener("input",()=>{list.innerHTML=paletteMarkup(paletteModel(input.value));list.scrollTop=0;});
  input.addEventListener("keydown",e=>{
    if(e.key==="ArrowDown"){e.preventDefault();setActive(current()+1);}
    else if(e.key==="ArrowUp"){e.preventDefault();setActive(current()-1);}
    else if(e.key==="Home"){e.preventDefault();setActive(0);}
    else if(e.key==="End"){e.preventDefault();setActive(items().length-1);}
    else if(e.key==="Enter"&&!e.isComposing){e.preventDefault();items()[current()]?.click();}
  });
  list.addEventListener("mousemove",e=>{const b=e.target.closest(".command-item");if(b&&!b.classList.contains("is-active"))setActive(items().indexOf(b));});
}

/* ---------- shared actions ---------- */
function shiftMonth(cursor,delta){return new Date(cursor.getFullYear(),cursor.getMonth()+delta,1);}
function setSegmentedActive(el){
  const group=el.closest(".segmented");if(!group)return;
  $$("button",group).forEach(b=>{const on=b===el;b.classList.toggle("is-active",on);b.setAttribute("aria-pressed",String(on));});
}
const warmSearch=()=>{if(!state.lock||state.entries.length)warmSearchIndex(state.entries.filter(e=>!e.deletedAt),kindLabels).catch(()=>{});};
async function reloadData(){await store.loadData();state.remoteChanged=false;render();warmSearch();}

const CORE_ACTIONS={
  "reload-page":()=>location.reload(),
  "go-today":()=>goTo("today"),
  "go":el=>goTo(el.dataset.to),
  "open-command":()=>commandPalette(),
  "open-more":()=>moreMenu(),
  "reload-data":()=>reloadData(),
  "toggle-theme":el=>{state.theme=resolveTheme()==="dark"?"light":"dark";safeStorageSet("narra-theme",state.theme);applyTheme();if(state.route==="settings")render();if(el?.closest(".more-menu"))closeOverlay();},
  "set-theme":el=>{state.theme=el.dataset.theme;safeStorageSet("narra-theme",state.theme);applyTheme();setSegmentedActive(el);},
  "set-pref":el=>{
    const key=el.dataset.key,raw=el.dataset.value;
    setPref(key,typeof PREF_DEFAULTS[key]==="number"?Number(raw):raw);setSegmentedActive(el);
  },
  "request-persistence":()=>requestStoragePersistence(),
  "snooze-storage-notice":el=>{safeStorageSet("narra-storage-notice-until",String(Date.now()+7*86400000));const n=el.closest(".notice-card");if(n)collapseAndRemove(n);},
  "close-overlay":()=>closeOverlay(),
  "close-overlay-backdrop":async(el,event)=>{
    if(event&&el===event.target&&state.pointerTarget===el){
      if(state.overlayKind==="versions")await ACTIONS["close-versions"]?.(el,event);
      else if(state.editing)await editor.closeEditor();
      else closeOverlay();
    }
  },
  "close-dialog":()=>closeDialog(),
  "close-dialog-backdrop":(el,event)=>{if(event&&el===event.target&&state.pointerTarget===el)closeDialog();},
  "confirm-dialog":async()=>{const cb=state.confirmCb;closeDialog({restoreFocus:false});if(cb)await cb();},
  "tab":el=>{const name=el.dataset.tabs,id=el.dataset.tab;const map={insights:"insightsTab",settings:"settingsTab",memories:"memoriesMode",lifemap:"lifemapType",reviews:"reviewKind",journal:"journalView"};const key=map[name];if(key){state[key]=id;render();$(`#tab-${name}-${id}`)?.focus({preventScroll:true});}},
};
Object.assign(ACTIONS,CORE_ACTIONS);

async function handleAction(action,el,event){
  // a button inside the "done" window (undo, open the trash) closes that window before it acts
  if(el?.closest?.("#dialog-root .result-dialog")&&action!=="close-dialog")closeDialog({restoreFocus:false});
  const fromPalette=el?.closest?.(".command");
  if(fromPalette){
    if(el.dataset.commandKey)noteRecentCommand(el.dataset.commandKey);
    state.focusCarry=state.previousFocus;closeOverlay({restoreFocus:false});
  }
  try{
    let fn=ACTIONS[action];
    if(!fn){try{await loadAllLazy();}catch(error){console.error(error);toast("Не получилось загрузить раздел. Записи в безопасности.");return;}fn=ACTIONS[action];}
    if(fn)await fn(el,event);
  }
  finally{state.focusCarry=null;}
}

/* ---------- global listeners ---------- */
document.addEventListener("pointerdown",e=>{state.pointerTarget=e.target;},true);
document.addEventListener("click",async event=>{
  const route=event.target.closest("[data-route]");
  if(route){if(route.dataset.route==='lifemap')state.lifemapKey=null;routeTo(route.dataset.route);return;}
  const pickCard=event.target.closest(".entry-card.has-select");
  if(pickCard&&!event.target.closest("input,label.row-check")){pickCard.querySelector("[data-select-entry]")?.click();return;}
  const card=event.target.closest(".entry-card[data-entry-id]");
  if(card&&!event.target.closest("a,button,input,label,summary,select,textarea,[data-action]")&&!getSelection()?.toString()){
    try{await handleAction("open-entry",{dataset:{id:card.dataset.entryId},closest:()=>null},event);}catch(error){console.error(error);}
    return;
  }
  const el=event.target.closest("[data-action]");
  if(!el)return;
  if(el.dataset.dismissToast)dismissToast(el.closest(".toast"));
  try{await handleAction(el.dataset.action,el,event);}
  catch(error){console.error("Ошибка действия",el.dataset.action,error);toast("Что-то пошло не так. Данные не изменились.");}
});
document.addEventListener("change",e=>{
  const t=e.target;
  if(t?.dataset?.hidePref){setPref(t.dataset.hidePref,t.checked);return;}
  if(t?.dataset?.ack!==undefined){const b=$("#dialog-root [data-action=confirm-dialog]");if(b)b.disabled=!t.checked;return;}
  if(t?.dataset?.pref){
    const key=t.dataset.pref;
    if(key==="motion_on")setPref("motion",t.checked?"on":"off");
    else if(t.type==="checkbox")setPref(key,t.checked);
    else if(key==="weekStart"||key==="lockMinutes"||key==="journalPage")setPref(key,Number(t.value));
    else setPref(key,t.value);
    if(FEATURE_KEYS.has(key)||key==="onboarded")render();
    return;
  }
  for(const m of MODULES)if(m.on?.change?.(e)===true)return;
});
document.addEventListener("input",e=>{
  const g=e.target?.dataset?.gate;
  if(g!==undefined){const b=$("#dialog-root [data-action=confirm-dialog]");if(b)b.disabled=e.target.value.trim().toLocaleLowerCase("ru-RU")!==g.toLocaleLowerCase("ru-RU");return;}
  for(const m of MODULES)if(m.on?.input?.(e)===true)return;
});
const FEATURE_KEYS=new Set(["featInsights","featLifemap","featMemories","featReviews","featChapters","featDecisions","featMedia","featWritingAssist","featEntitySuggest","featSemantic","featEmotionsInJournal","showCheckin","showMemory","showPrompt","showRecent","showContinue","reminderOn"]);
/* content of a closed <details> stays laid out in some browsers, but cannot receive focus */
function inClosedDetails(x){
  for(let d=x.closest("details:not([open])");d;d=d.parentElement?.closest("details:not([open])")){
    const sm=d.querySelector(":scope > summary");
    if(!(sm&&(sm===x||sm.contains(x))))return true;
  }
  return false;
}
function trapTab(e,root){
  const focusable=$$("button:not([disabled]),input:not([disabled]):not([type='hidden']),textarea:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex='-1'])",root).filter(x=>!x.closest("[hidden]")&&x.offsetParent!==null&&!x.classList.contains("select-native")&&!inClosedDetails(x));
  if(!focusable.length){e.preventDefault();return;}
  const first=focusable[0],last=focusable[focusable.length-1],active=document.activeElement;
  if(!root.contains(active)){e.preventDefault();first.focus();}
  else if(e.shiftKey&&active===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&active===last){e.preventDefault();first.focus();}
}
document.addEventListener("keydown",async e=>{
  if(state.locked){privacy.onLockedKey?.(e);return;}
  const mod=e.metaKey||e.ctrlKey;
  const tab=e.target.closest?.('[role="tab"]');
  if(tab&&["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){
    const list=$$('[role="tab"]',tab.parentElement),i=list.indexOf(tab);
    const next=e.key==="Home"?0:e.key==="End"?list.length-1:(i+(e.key==="ArrowRight"?1:-1)+list.length)%list.length;
    e.preventDefault();list[next].click();return;
  }
  if(e.key==="Escape"){
    if(popoverOpen()){e.preventDefault();closePopovers();return;}
    if(dialogOpen()){e.preventDefault();if(!$("#dialog-root .recovery-dialog"))closeDialog();return;}
    if(overlayOpen()){
      e.preventDefault();
      if(state.overlayKind==="editor"){if(await editor.onEscape())return;await editor.closeEditor();}
      else if(state.overlayKind==="versions")await ACTIONS["close-versions"]?.(null,null);
      else closeOverlay();
      return;
    }
    const s=$("#search-input");if(s&&document.activeElement===s&&!s.value)s.blur();
    return;
  }
  if(e.key==="Tab"){
    if(dialogOpen())trapTab(e,$("#dialog-root"));else if(overlayOpen())trapTab(e,$("#overlay-root"));
    return;
  }
  if(mod&&e.code==="KeyK"&&!e.shiftKey){
    if(state.editing&&document.activeElement===$("#entry-body"))return;
    e.preventDefault();
    if(dialogOpen())return;
    if(state.overlayKind==="command")closeOverlay();else if(!state.editing)commandPalette();
    return;
  }
  if(state.editing&&!dialogOpen()){await editor.onKey(e,mod);return;}
  if(mod&&e.code==="KeyF"&&!e.shiftKey&&!overlayOpen()){e.preventDefault();goTo("search");return;}
  const plain=!mod&&!e.altKey&&!e.shiftKey&&!isTyping(document.activeElement)&&!overlayOpen()&&!dialogOpen();
  if(e.key==="/"&&plain){e.preventDefault();goTo("search");return;}
  if(plain&&state.prefs.quickKey!=="off"&&e.key.toLowerCase()===state.prefs.quickKey){e.preventDefault();ctx.openEditor();}
});
window.addEventListener("hashchange",()=>{
  const route=location.hash.replace("#/","").split("?")[0],next=normalizeRoute(route);
  if(next!==state.route){state.route=next;document.title=`${ROUTE_TITLES[next]} — Narra`;render({enter:true});}
});
window.addEventListener("online",()=>toast("Сеть снова доступна. Дневник по-прежнему хранится только на этом устройстве."));
window.addEventListener("offline",()=>toast("Сети нет. Можно продолжать писать — сохранение локальное."));
document.addEventListener("visibilitychange",()=>{if(document.hidden&&state.dirty&&state.editing)editor.saveEditing("visibility");});
window.addEventListener("pagehide",()=>{if(state.dirty&&state.editing)editor.saveEditing("pagehide");});
window.addEventListener("beforeunload",e=>{
  const quickPending=Boolean(state.quickDraft?.trim())&&!state.editing;
  if(state.dirty||quickPending){e.preventDefault();e.returnValue="";}
});
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change",()=>{if(state.theme==="system")applyTheme();});
window.addEventListener("resize",()=>{editor.onResize?.();});
function syncViewportHeight(){
  const vv=window.visualViewport;
  document.documentElement.style.setProperty("--vvh",`${Math.round(vv?vv.height:window.innerHeight)}px`);
  document.documentElement.style.setProperty("--vvt",`${Math.max(0,Math.round(vv?vv.offsetTop:0))}px`);
  editor.onViewport?.();
}
if(window.visualViewport){window.visualViewport.addEventListener("resize",syncViewportHeight);window.visualViewport.addEventListener("scroll",()=>{syncViewportHeight();if(state.editing||overlayOpen())window.scrollTo(0,0);});}
syncViewportHeight();

/* ---------- expose to modules ---------- */
Object.assign(ctx,{render,routeTo,goTo,toast,overlay,closeOverlay,confirmDialog,resultDialog,formDialog,closeDialog,sheetDialog,animateIn,reducedMotion,collapseAndRemove,setPref,applyPrefs,applyTheme,commandPalette,reloadData,showFatal,overlayOpen,dialogOpen,checkStoragePersistence,requestStoragePersistence,handleAction,ACTIONS,VIEWS,setSegmentedActive,shiftMonth});
for(const m of MODULES)m.init?.(ctx);

/* ---------- start ---------- */
async function init(){
  if(location.protocol!=="http:"&&location.protocol!=="https:")throw new Error("Для Narra нужен запуск через HTTP(S).");
  if(!("indexedDB" in window))throw new Error("IndexedDB недоступна в этом браузере.");
  if(!crypto?.subtle)throw new Error("Web Crypto недоступен в этом контексте браузера.");
  applyPrefs();applyTheme();
  state.db=await store.openDB();await store.ensureCryptoKey();
  if(state.mode==="demo")await (await loadLazy("backup")).ensureDemoData();
  await store.loadData();await checkStoragePersistence();
  document.title=`${ROUTE_TITLES[state.route]} — Narra`;
  store.onRemoteChange(async()=>{
    if(state.locked)return;
    if(state.editing){state.remoteChanged=true;renderBanner();return;}
    await store.loadData();render();
  });
  if(!routeAllowed(state.route))state.route="today";
  if(state.lock&&state.prefs.lockMinutes!==undefined&&state.lock.enabled!==false){await privacy.lockNow({initial:true});}
  else render({enter:true});
  privacy.startIdleWatch?.();
  warmSearch();
  if("serviceWorker" in navigator&&window.isSecureContext){
    try{
      const registration=await navigator.serviceWorker.register(`./sw.js?v=${APP_VERSION}`,{updateViaCache:"none"});
      registration?.update?.()?.catch?.(()=>{});
    }catch(error){console.warn("Не удалось зарегистрировать service worker",error);}
  }
  window.__narraReady=true;
}
init().catch(err=>{console.error(err);showFatal("Не удалось открыть локальный дневник",err?.message||"Браузер заблокировал необходимую возможность локального хранения.");});
