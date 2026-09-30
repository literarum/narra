/* Editor: a full-screen writing surface with Markdown tools, find, slash menu, focus mode, media, details, decisions,
   writing help and safe saving. Saving is atomic, versioned, and refuses to overwrite an entry edited elsewhere. */
import {validateCanonicalEntry,nextRevision,searchEntries,parseRussianDateHint} from "./domain.mjs?v=4.4.0";
import {applyFormat,activeFormats,continueList,shiftIndent,diffRange,renderMarkdown} from "./md.mjs?v=4.4.0";
import {state,ctx,$,$$,escapeHtml,icon,uid,nowIso,fmtLong,fmtTime,fmtDate,localDateInputValue,dateInputToIso,splitCsv,words,chars,wordLabel,pluralRu,featureOn,activeEntries,entryById,mediaOf,kindLabels,capitalizeRu} from "./core.js?v=4.4.0";
import {entryText,excerpt} from "./text.mjs?v=4.4.0";
import {cleanDecision,cleanLinks} from "./domain.mjs?v=4.4.0";
import {modalHeader,statusPill} from "./kit.js?v=4.4.0";
import {enhance} from "./ui.mjs?v=4.4.0";
import {STRUCTURE_TEMPLATE} from "./writing.mjs?v=4.4.0";
import {contextMarkup,assistMarkup,assistResult,suggestionsMarkup,contextSummaryText,decisionMarkup,linksMarkup,smartSuggestions,viewMetaMarkup} from "./editor-panels.js?v=4.4.0";
import {TextHistory} from "./history.mjs?v=4.4.0";
import * as media from "./media.js?v=4.4.0";
import * as store from "./store.js?v=4.4.0";

const FORMAT_GROUPS=[
  [["bold","bold","Полужирный","Ctrl+B"],["italic","italic","Курсив","Ctrl+I"],["strike","strike","Зачёркнутый",""],["code","code","Код",""]],
  [["h1","heading","Заголовок 1",""],["h2","heading2","Заголовок 2",""],["quote","quote","Цитата",""]],
  [["bullet","list","Маркированный список",""],["numbered","list-ordered","Нумерованный список",""],["checklist","checklist","Чек-лист",""]],
  [["link","link","Ссылка","Ctrl+K"],["divider","divider","Разделитель",""]],
];
const SLASH_ITEMS=[
  {format:"h1",icon:"heading",label:"Заголовок 1",kw:"заголовок h1 title"},{format:"h2",icon:"heading2",label:"Заголовок 2",kw:"подзаголовок h2"},
  {format:"quote",icon:"quote",label:"Цитата",kw:"quote"},{format:"bullet",icon:"list",label:"Список",kw:"маркированный пункты"},
  {format:"numbered",icon:"list-ordered",label:"Нумерованный список",kw:"номера"},{format:"checklist",icon:"checklist",label:"Чек-лист",kw:"задачи дела todo"},
  {format:"code",icon:"code",label:"Код",kw:"моноширинный"},{format:"divider",icon:"divider",label:"Разделитель",kw:"линия черта"},
];
export function newEntry({body="",date=null,prefill=""}={}){
  const at=date?dateInputToIso(date,nowIso()):nowIso();
  return {id:uid(),title:"",body,prefill,kind:"thought",happenedAt:at,createdAt:nowIso(),updatedAt:nowIso(),revision:0,favorite:false,sensitive:false,completedAt:null,deletedAt:null,people:[],themes:[],projects:[],location:"",dismissedSuggestions:[],happenedEnd:null,chapterId:null,links:[],decision:null};
}
const statsText=body=>{const wc=words(body),cc=chars(body);return [`${wc} ${wordLabel(wc)}`,`${cc} ${pluralRu(cc,"символ","символа","символов")}`];};
const toolButton=([format,iconName,label,shortcut])=>{
  const tip=shortcut&&state.prefs.shortcuts?`${label} (${shortcut})`:label;
  return `<button type="button" class="tool-button" data-format="${format}" aria-label="${label}" aria-pressed="false" title="${tip}">${icon(iconName)}</button>`;
};
function mediaTools(){
  if(!featureOn("featMedia"))return "";
  return `<div class="tool-group" role="group" aria-label="Вложения"><button type="button" class="tool-button" data-action="attach-photo" aria-label="Добавить фото" title="Добавить фото">${icon("image")}</button><button type="button" class="tool-button" data-action="attach-audio" aria-label="Добавить аудио" title="Добавить аудиофайл">${icon("paperclip")}</button>${media.canRecord()?`<button type="button" class="tool-button" data-action="record-toggle" aria-pressed="false" aria-label="Записать голос" title="Записать голос">${icon("mic")}</button>`:""}</div>
    <input type="file" id="attach-file-photo" accept="image/*" multiple hidden><input type="file" id="attach-file-audio" accept="audio/*" hidden>`;
}
function editorMarkup(entry,mode="edit"){
  const [wc,cc]=statsText(entry.body),p=state.prefs;
  return `<div class="editor-top"><div class="editor-top-left"><button type="button" class="icon-button icon-button-quiet" data-action="close-editor" aria-label="Закрыть редактор" title="Закрыть (Esc)">${icon("arrow-left")}</button><span class="save-state edit-only" id="editor-save" role="status"><i class="save-dot"></i><span>${escapeHtml(state.saveStatus)}</span></span></div>
    <div class="editor-top-right">
      <button type="button" class="icon-button icon-button-quiet only-desktop edit-only" data-action="editor-find" aria-label="Найти в записи" title="Найти в записи${p.shortcuts?" (Ctrl+F)":""}">${icon("search")}</button>
      <button type="button" class="icon-button icon-button-quiet edit-only" data-action="toggle-preview" id="preview-toggle" aria-pressed="false" aria-label="Показать, как выглядит текст" title="Просмотр">${icon("eye")}</button>
      <button type="button" class="icon-button icon-button-quiet only-desktop" data-action="entry-checkin" aria-label="Отметить состояние" title="Отметить состояние">${icon("state")}</button>
      <button type="button" class="icon-button icon-button-quiet only-desktop" data-action="versions" aria-label="История версий" title="История версий">${icon("history")}</button>
      <button type="button" class="icon-button icon-button-quiet favorite-button only-desktop${entry.favorite?" is-active":""}" data-action="favorite" aria-pressed="${entry.favorite}" aria-label="${entry.favorite?"Убрать из избранного":"Добавить в избранное"}" title="Избранное">${icon("star")}</button>
      <button type="button" class="icon-button icon-button-quiet danger-quiet only-desktop" data-action="trash-entry" id="trash-button" aria-label="Переместить в корзину" title="В корзину"${entry.revision>0?"":" hidden"}>${icon("trash")}</button>
      <button type="button" class="icon-button icon-button-quiet only-mobile" data-action="editor-more" aria-label="Ещё" aria-haspopup="dialog">${icon("more")}</button>
      <button type="button" class="icon-button icon-button-quiet focus-exit" data-action="toggle-focus" aria-label="Выйти из режима фокуса" title="Выйти из режима фокуса (Esc)">${icon("focus-off")}<span>Выйти из фокуса</span><kbd class="only-desktop">Esc</kbd></button>
      <button type="button" class="primary button-with-icon edit-only" data-action="finish-editing">${icon("check")}<span>Готово</span></button>
      <button type="button" class="primary button-with-icon view-only" data-action="edit-entry">${icon("pen")}<span>Изменить</span></button>
    </div></div>
    <div class="editor-tools edit-only" id="editor-tools" role="toolbar" aria-label="Форматирование текста">
      <div class="tool-group history-group" role="group" aria-label="История правок"><button type="button" class="tool-button" data-history="undo" aria-label="Отменить" title="Отменить${p.shortcuts?" (Ctrl+Z)":""}" disabled>${icon("undo")}</button><button type="button" class="tool-button" data-history="redo" aria-label="Повторить" title="Повторить${p.shortcuts?" (Ctrl+Shift+Z)":""}" disabled>${icon("undo","icon-flip")}</button></div>
      ${FORMAT_GROUPS.map(g=>`<div class="tool-group" role="group">${g.map(toolButton).join("")}</div>`).join("")}
      ${mediaTools()}
      <span class="tool-spacer"></span>
      <button type="button" class="secondary button-with-icon focus-toggle only-desktop" data-action="toggle-focus" aria-pressed="false">${icon("focus")}<span>Фокус</span></button>
    </div>
    <div class="recorder-status" id="recorder-status" role="status" hidden><i class="rec-dot"></i><span>Идёт запись</span><time>0:00</time><button type="button" class="secondary" data-action="record-toggle">Остановить</button></div>
    <div class="editor-findbar" id="editor-findbar" role="search" hidden><input id="editor-find-input" type="search" autocomplete="off" spellcheck="false" aria-label="Найти в записи" placeholder="Найти в записи"><span class="find-count" id="editor-find-count" aria-live="polite"></span><button type="button" class="icon-button icon-button-quiet" data-action="find-prev" aria-label="Предыдущее совпадение">${icon("chevron-up")}</button><button type="button" class="icon-button icon-button-quiet" data-action="find-next" aria-label="Следующее совпадение">${icon("chevron-down")}</button><button type="button" class="icon-button icon-button-quiet" data-action="close-find" aria-label="Закрыть поиск">${icon("x")}</button></div>
    <div class="editor-surface" id="editor-surface"><div class="editor-canvas">
      <textarea class="entry-title" id="entry-title" rows="1" maxlength="300" autocomplete="off" spellcheck="${p.spellcheck}" placeholder="Заголовок" aria-label="Заголовок записи"${mode==="view"?" readonly tabindex=\"-1\"":""}>${escapeHtml(entry.title||"")}</textarea>
      <div class="view-meta view-only" id="view-meta">${mode==="view"?viewMetaMarkup(entry):""}</div>
      ${contextMarkup(entry)}
      <div class="body-wrap"><div class="body-mirror" id="body-mirror" aria-hidden="true"></div><textarea class="entry-body" id="entry-body" autocomplete="off" spellcheck="${p.spellcheck}" placeholder="Начните с любого места…" aria-label="Текст записи">${escapeHtml(entry.body||"")}</textarea><div class="slash-menu card" id="editor-slash-menu" role="listbox" aria-label="Команды форматирования" hidden></div></div>
      <div class="md-preview" id="entry-preview" hidden></div>
      <div id="attach-strip" class="edit-only">${featureOn("featMedia")&&mode==="edit"?media.stripMarkup(entry.id):""}</div>
      <div id="view-attach" class="view-only">${featureOn("featMedia")&&mode==="view"?media.galleryMarkup(entry.id,entry.body||""):""}</div>
      ${assistMarkup()}
    </div></div>
    <div class="editor-bottom"><div id="editor-date">${escapeHtml(fmtLong(entry.happenedAt))}</div>${p.editorStats?`<div class="editor-stats" aria-label="Размер текста"><span id="word-count">${wc}</span><span id="char-count">${cc}</span></div>`:""}<span class="session-info edit-only" id="session-info" hidden></span></div>`;
}
export async function openEditor(id=null,opts={}){
  if(state.editing){
    const ok=await saveEditing("switch");
    if(!ok&&state.dirty&&state.editing.body.trim()){ctx.toast("Сначала нужно сохранить текущие изменения.");return null;}
  }
  let entry=id?entryById(id):null;
  if(!entry)entry=newEntry(opts);
  const existing=entry.revision>0;
  /* a finished entry opens for reading; a new one or an unfinished draft opens for writing */
  const mode=opts.mode||(existing&&entry.completedAt&&!opts.edit?"view":"edit");
  state.editing=structuredClone(entry);state.dirty=false;state.conflict=null;
  state.saveStatus=entry.revision?"Сохранено":"Новая запись";
  state.editorPreview=false;state.slash=null;state.find=null;
  state.editorMode=mode;state.editorOrigin=mode==="view"?"view":"direct";
  state.editorBaseline=existing?baselineOf(entry):null;
  state.sessionStart=Date.now();state.sessionBaseWords=words(entry.body||"");
  const box=ctx.overlay(editorMarkup(state.editing,mode),`modal editor-modal${mode==="view"?" is-viewing":""}`,mode==="view"?"Просмотр записи":"Редактор записи",{kind:"editor",focus:false});
  bindEditor(box,mode);
  return box;
}
export function markEditorDirty(source="autosave"){
  if(!state.editing)return;
  state.saveEpoch++;state.dirty=true;setSaveStatus("Сохраняется…","busy");
  clearTimeout(state.editorTimer);state.editorTimer=setTimeout(()=>saveEditing(source),380);
}
function setSaveStatus(text,tone=""){
  state.saveStatus=text;
  const wrap=$("#editor-save"),el=$("#editor-save span");
  if(el)el.textContent=text;
  if(wrap){wrap.classList.toggle("is-busy",tone==="busy");wrap.classList.toggle("is-error",tone==="error");}
}
/* Growing needs one layout read; shrinking (deleting text) needs the height reset, which doubles the layout cost on long
   texts — so it only happens when the last edit could have made the text shorter. */
const autosize=(el,shrink=true)=>{
  if(!el)return;
  if(!shrink&&el.style.height){const need=el.scrollHeight;if(need>el.clientHeight+1)el.style.height=`${need}px`;return;}
  el.style.height="auto";el.style.height=`${el.scrollHeight}px`;
};

/* ----- deferred work: keystrokes only copy the text; everything else waits for a frame or a pause ----- */
let frameJob=0,idleJob=0;
let pendingShrink=false;
function scheduleFrameWork(hint,shrink=true){
  if(hint)pendingCaret=pendingCaret||hint;
  if(shrink)pendingShrink=true;
  if(frameJob)return;
  frameJob=requestAnimationFrame(()=>{
    frameJob=0;
    const title=$("#entry-title"),body=$("#entry-body");if(!body)return;
    const sh=pendingShrink;pendingShrink=false;
    autosize(title);autosize(body,sh);
    if(pendingCaret){pendingCaret=false;ensureCaretVisible();}
    syncToolbar();
  });
}
/** «+124 слова · 6 мин»: what this sitting added. Neutral, no goals; hidden until something was actually written. */
function updateSessionInfo(text){
  const el=$("#session-info");if(!el)return;
  const added=words(text)-(state.sessionBaseWords||0),mins=Math.floor((Date.now()-(state.sessionStart||Date.now()))/60000);
  if(added<=0){el.hidden=true;return;}
  el.hidden=false;el.textContent=`+${added} ${wordLabel(added)}${mins>=1?` · ${mins} мин`:""}`;
}
let pendingCaret=false;
function scheduleIdleWork(){
  clearTimeout(idleJob);
  idleJob=setTimeout(()=>{
    const body=$("#entry-body");if(!body||!state.editing)return;
    const [w,c]=statsText(body.value),wn=$("#word-count"),cn=$("#char-count");
    if(wn)wn.textContent=w;if(cn)cn.textContent=c;
    updateSessionInfo(body.value);
    refreshEditorMeta();
    if(state.find)findRun(true);
  },160);
}
export function refreshEditorMeta(){
  const s=$("#context-summary");if(s&&state.editing)s.textContent=contextSummaryText(state.editing);
  const node=$("#suggestions");if(node&&state.editing)node.innerHTML=suggestionsMarkup(state.editing);
  const d=$("#editor-date");if(d&&state.editing)d.textContent=fmtLong(state.editing.happenedAt);
}

/* caret helpers: keep the caret clear of the bottom edge without relying on browser heuristics */
const caretCache={key:"",prefix:"",top:0};
function caretMetrics(body,pos){
  let m=$("#caret-measure");
  if(!m){m=document.createElement("div");m.id="caret-measure";m.setAttribute("aria-hidden","true");document.body.append(m);}
  const cs=getComputedStyle(body),width=body.clientWidth,styleKey=`${width}|${cs.font}|${cs.letterSpacing}|${cs.lineHeight}|${cs.tabSize}`;
  if(m.dataset.k!==styleKey){
    Object.assign(m.style,{position:"absolute",visibility:"hidden",left:"-9999px",top:"0",whiteSpace:"pre-wrap",overflowWrap:"break-word",boxSizing:"border-box",padding:"0",border:"0",width:`${width}px`,font:cs.font,letterSpacing:cs.letterSpacing,lineHeight:cs.lineHeight,tabSize:cs.tabSize});
    m.dataset.k=styleKey;
  }
  const text=body.value,ls=text.lastIndexOf("\n",pos-1)+1,prefix=text.slice(0,ls);
  const mark=document.createElement("span");mark.textContent="\u200b";
  /* lines above the caret's own line never change while typing, so their height is measured once and reused;
     only the current line is laid out on each keystroke (keeps typing fast in very long entries) */
  if(caretCache.key!==styleKey||caretCache.prefix!==prefix){
    m.textContent=prefix;m.append(mark);caretCache.top=prefix?mark.offsetTop:0;caretCache.key=styleKey;caretCache.prefix=prefix;
  }
  m.textContent=text.slice(ls,pos);m.append(mark);
  const lh=parseFloat(cs.lineHeight)||body.clientHeight,top=caretCache.top+mark.offsetTop;m.textContent="";
  return {top,lh};
}
let caretFrame=0;
function ensureCaretVisible(){
  cancelAnimationFrame(caretFrame);
  caretFrame=requestAnimationFrame(()=>{
    const body=$("#entry-body"),surface=$("#editor-surface");
    if(!body||!surface||document.activeElement!==body||state.editorPreview)return;
    const {top,lh}=caretMetrics(body,body.selectionEnd);
    const sr=surface.getBoundingClientRect(),br=body.getBoundingClientRect();
    const y=br.top-sr.top+surface.scrollTop+top;
    const bottomGap=$("#editor-slash-menu")&&!$("#editor-slash-menu").hidden?270:96,topGap=28;
    if(y+lh+bottomGap>surface.scrollTop+surface.clientHeight)surface.scrollTop=y+lh+bottomGap-surface.clientHeight;
    else if(y-topGap<surface.scrollTop)surface.scrollTop=Math.max(0,y-topGap);
  });
}

/* formatting: every change goes through the browser's edit pipeline so Ctrl+Z keeps working */
function setBodyValue(result){
  const body=$("#entry-body");if(!body)return;
  hist?.seal();
  const d=diffRange(body.value,result.value);
  body.focus({preventScroll:true});
  if(d.from!==d.to||d.text){
    body.setSelectionRange(d.from,d.to);
    let ok=false;
    try{ok=d.text?document.execCommand("insertText",false,d.text):document.execCommand("delete");}catch{}
    if(!ok||body.value!==result.value){body.value=result.value;body.dispatchEvent(new Event("input",{bubbles:true}));}
  }
  body.setSelectionRange(result.start,result.end);
  syncToolbar();ensureCaretVisible();
}
export function insertAtCaret(text){
  const body=$("#entry-body");if(!body||state.editorMode==='view')return;
  if(state.editorPreview)setPreview(false);
  const v=body.value,s=body.selectionStart,e=body.selectionEnd,next=v.slice(0,s)+text+v.slice(e);
  setBodyValue({value:next,start:s+text.length,end:s+text.length});
}
function runFormat(format){
  const body=$("#entry-body");if(!body||state.editorPreview)return;
  hideSlash();
  setBodyValue(applyFormat(body.value,body.selectionStart,body.selectionEnd,format));
}
function syncToolbar(){
  const body=$("#entry-body"),tools=$("#editor-tools");if(!body||!tools)return;
  syncHistoryButtons();
  const active=state.editorPreview?new Set():activeFormats(body.value,body.selectionStart,body.selectionEnd);
  $$("[data-format]",tools).forEach(b=>{const on=active.has(b.dataset.format);if(b.classList.contains("is-on")!==on){b.classList.toggle("is-on",on);b.setAttribute("aria-pressed",String(on));}});
}
const slashMatches=query=>{const q=query.toLocaleLowerCase("ru-RU");return SLASH_ITEMS.filter(i=>!q||i.label.toLocaleLowerCase("ru-RU").includes(q)||i.kw.includes(q));};
function renderSlash(){
  const menu=$("#editor-slash-menu"),s=state.slash;if(!menu)return;
  if(!s||!s.items.length){hideSlash();return;}
  menu.innerHTML=s.items.map((i,n)=>`<button type="button" role="option" class="${n===s.index?"is-active":""}" aria-selected="${n===s.index}" data-slash="${i.format}">${icon(i.icon)}<span>${i.label}</span></button>`).join("");
  const body=$("#entry-body");
  if(menu.hidden){menu.hidden=false;ctx.animateIn(menu);}
  if(body){const {top,lh}=caretMetrics(body,body.selectionEnd);menu.style.top=`${Math.round(top+lh+6)}px`;}
  menu.querySelector(".is-active")?.scrollIntoView({block:"nearest"});
  ensureCaretVisible();
}
function hideSlash(){state.slash=null;const m=$("#editor-slash-menu");if(m&&!m.hidden){m.hidden=true;m.innerHTML="";}}
function detectSlash(){
  const body=$("#entry-body");if(!body||state.editorPreview)return hideSlash();
  const pos=body.selectionStart;
  if(body.selectionEnd!==pos)return hideSlash();
  const ls=body.value.lastIndexOf("\n",pos-1)+1;
  if(pos-ls>40)return hideSlash();
  const line=body.value.slice(ls,pos),m=line.match(/^(\s*)\/([\p{L}\d]*)$/u),nextChar=body.value[pos];
  if(!m||(nextChar&&nextChar!=="\n"))return hideSlash();
  const items=slashMatches(m[2]),prev=state.slash;
  state.slash={from:ls+m[1].length,to:pos,items,index:prev&&prev.items.length&&prev.index<items.length?prev.index:0};
  renderSlash();
}
function applySlash(format){
  const s=state.slash,body=$("#entry-body");if(!s||!body)return;
  const chosen=format||s.items[s.index]?.format;if(!chosen)return;
  const from=s.from,to=s.to;hideSlash();
  setBodyValue({value:body.value.slice(0,from)+body.value.slice(to),start:from,end:from});
  runFormat(chosen);
}
function setPreview(on,{focus=true}={}){
  const modal=$(".editor-modal"),body=$("#entry-body"),pv=$("#entry-preview");if(!modal||!pv)return;
  state.editorPreview=on;hideSlash();
  modal.classList.toggle("is-previewing",on);
  $(".body-wrap")?.toggleAttribute("hidden",on);
  pv.hidden=!on;
  if(on){pv.innerHTML=renderMarkdown(body.value,{collapsible:true})||`<p class="md-empty">Пока нечего показывать — напишите что-нибудь.</p>`;ctx.animateIn(pv);media.hydrate(pv);}
  $("#editor-tools")?.classList.toggle("is-disabled",on);
  const btn=$("#preview-toggle");
  if(btn){btn.setAttribute("aria-pressed",String(on));btn.setAttribute("aria-label",on?"Вернуться к редактированию":"Показать, как выглядит текст");btn.title=on?"Редактировать":"Просмотр";btn.innerHTML=icon(on?"pen":"eye");}
  if(!on)requestAnimationFrame(()=>{if(focus)body.focus({preventScroll:true});autosize(body);});
  syncToolbar();
}
export function toggleFocusMode(){
  const modal=$(".editor-modal");if(!modal)return;
  const active=modal.classList.toggle("is-focus-mode");
  $$('.focus-toggle[data-action="toggle-focus"]',modal).forEach(b=>b.setAttribute("aria-pressed",String(active)));
  if(active){const t=$(".focus-exit",modal);t?.classList.add("is-hinted");setTimeout(()=>t?.classList.remove("is-hinted"),3200);}
  requestAnimationFrame(()=>{autosize($("#entry-title"));autosize($("#entry-body"));$("#entry-body")?.focus({preventScroll:true});});
}

/* find in entry: matches are painted on a transparent mirror behind the textarea, so focus stays in the search field */
function findRun(keep=false){
  const input=$("#editor-find-input"),body=$("#entry-body"),mirror=$("#body-mirror"),count=$("#editor-find-count");
  if(!input||!body||!mirror)return;
  const q=input.value,src=body.value,f=state.find||(state.find={matches:[],index:-1});
  const prevStart=f.matches[f.index]??-1;f.matches=[];
  if(q){
    let hay=src.toLocaleLowerCase("ru-RU"),needle=q.toLocaleLowerCase("ru-RU");
    if(hay.length!==src.length){hay=src.toLowerCase();needle=q.toLowerCase();}
    let pos=0;while((pos=hay.indexOf(needle,pos))!==-1){f.matches.push(pos);pos+=Math.max(needle.length,1);}
  }
  f.len=q.length;
  if(!f.matches.length)f.index=-1;
  else if(keep&&prevStart>=0){const i=f.matches.findIndex(m=>m>=prevStart);f.index=i===-1?0:i;}
  else f.index=-1;
  findPaint(false);
  count.textContent=!q?"":f.matches.length?`${Math.max(f.index+1,1)} из ${f.matches.length}`:"Нет совпадений";
}
function findPaint(scroll){
  const mirror=$("#body-mirror"),body=$("#entry-body"),f=state.find;if(!mirror||!body)return;
  if(!f||!f.matches.length){mirror.innerHTML="";return;}
  const src=body.value;let out="",pos=0;
  f.matches.forEach((start,i)=>{out+=escapeHtml(src.slice(pos,start))+`<mark${i===f.index?' class="is-current"':""}>${escapeHtml(src.slice(start,start+f.len))}</mark>`;pos=start+f.len;});
  mirror.innerHTML=out+escapeHtml(src.slice(pos))+"\n";
  if(scroll){
    const cur=mirror.querySelector("mark.is-current"),surface=$("#editor-surface");
    if(cur&&surface){const cr=cur.getBoundingClientRect(),sr=surface.getBoundingClientRect();if(cr.top<sr.top+60||cr.bottom>sr.bottom-90)surface.scrollTop+=cr.top-sr.top-sr.height/2+cr.height/2;}
  }
}
function findJump(delta){
  const f=state.find,body=$("#entry-body");
  if(!f||!f.matches.length){findRun();return;}
  f.index=(f.index+delta+f.matches.length)%f.matches.length;
  findPaint(true);$("#editor-find-count").textContent=`${f.index+1} из ${f.matches.length}`;
  body.setSelectionRange(f.matches[f.index],f.matches[f.index]+f.len);
}
function showEditorFind(){
  const bar=$("#editor-findbar"),input=$("#editor-find-input");if(!bar||!input||state.editorPreview)return;
  hideSlash();bar.hidden=false;ctx.animateIn(bar);
  state.find=state.find||{matches:[],index:-1};
  const sel=$("#entry-body");
  const picked=sel&&sel.selectionEnd>sel.selectionStart&&sel.selectionEnd-sel.selectionStart<80?sel.value.slice(sel.selectionStart,sel.selectionEnd):"";
  if(picked&&!/\n/.test(picked))input.value=picked;
  findRun();input.focus();input.select();
}
function closeFind({focusBody=true}={}){
  const bar=$("#editor-findbar");if(!bar||bar.hidden)return false;
  bar.hidden=true;state.find=null;
  const mirror=$("#body-mirror");if(mirror)mirror.innerHTML="";
  if(focusBody)$("#entry-body")?.focus({preventScroll:true});
  return true;
}

/* ----- binding ----- */
function refreshAttachments(){const n=$("#attach-strip");if(n&&state.editing){n.innerHTML=featureOn("featMedia")?media.stripMarkup(state.editing.id):"";media.hydrate(n);}}
async function attachFiles(files){
  const ed=state.editing;if(!ed||state.editorMode==='view')return; // attachments are added only while editing
  const added=await media.addFiles(ed.id,files);
  afterMediaAdded(added);
}
function afterMediaAdded(added){
  if(!added.length||!state.editing)return;
  const refs=added.map(a=>{const m=state.attachments.find(x=>x.id===a.id);return m?media.refMarkdown(m):"";}).filter(Boolean).join("\n\n");
  refreshAttachments();
  if(refs)insertAtCaret(`\n\n${refs}\n\n`);
  ctx.toast(added.length===1?"Вложение добавлено.":`Добавлено вложений: ${added.length}.`);
}
export function removeMediaRefs(id){
  const body=$("#entry-body");if(!body||!state.editing)return;
  const re=new RegExp(`\\n*!\\[[^\\]\\n]*\\]\\(narra-media:${id}\\)\\n*`,"g");
  const next=body.value.replace(re,"\n\n").replace(/^\n+/,"").replace(/\n{3,}/g,"\n\n");
  if(next!==body.value){hist?.seal();body.value=next;state.editing.body=next;hist?.record(next,[next.length,next.length]);syncHistoryButtons();autosize(body);markEditorDirty("media");scheduleIdleWork();}
}
let hist=null,histApplying=false;
function syncHistoryButtons(){
  const u=$('[data-history="undo"]'),r=$('[data-history="redo"]');
  if(u)u.disabled=!hist?.canUndo();if(r)r.disabled=!hist?.canRedo();
}
function stepHistory(dir){
  const body=$("#entry-body");if(!body||!hist||state.editorMode==="view")return false;
  if(state.editorPreview)setPreview(false);
  const res=dir<0?hist.undo():hist.redo();
  if(!res){syncHistoryButtons();return false;}
  histApplying=true;
  body.value=res.value;body.focus({preventScroll:true});body.setSelectionRange(res.sel[0],res.sel[1]);
  body.dispatchEvent(new Event("input",{bubbles:true}));
  histApplying=false;
  ensureCaretVisible();syncHistoryButtons();
  return true;
}
/* reading mode <-> writing mode of one open entry */
function enterView(){
  const modal=$(".editor-modal"),ed=state.editing;if(!modal||!ed)return;
  try{media.stopRecordingIfAny?.();}catch{}
  state.editorMode="view";modal.classList.add("is-viewing");
  modal.setAttribute("aria-label","Просмотр записи");
  const t=$("#entry-title");if(t){t.readOnly=true;t.tabIndex=-1;t.value=ed.title||"";}
  const vm=$("#view-meta");if(vm)vm.innerHTML=viewMetaMarkup(ed);
  const va=$("#view-attach");if(va){va.innerHTML=featureOn("featMedia")?media.galleryMarkup(ed.id,ed.body||""):"";media.hydrate(va);}
  const sa=$("#attach-strip");if(sa)sa.innerHTML="";
  hideSlash();closeFind({focusBody:false});
  setPreview(true,{focus:false});
  requestAnimationFrame(()=>{autosize(t);const s=$("#editor-surface");if(s)s.scrollTop=0;$('[data-action="edit-entry"]')?.focus({preventScroll:true});});
}
function enterEdit(){
  const modal=$(".editor-modal"),ed=state.editing,body=$("#entry-body");if(!modal||!ed||!body)return;
  state.editorMode="edit";modal.classList.remove("is-viewing");
  modal.setAttribute("aria-label","Редактор записи");
  const t=$("#entry-title");if(t){t.readOnly=false;t.tabIndex=0;}
  const sa=$("#attach-strip");if(sa){sa.innerHTML=featureOn("featMedia")?media.stripMarkup(ed.id):"";media.hydrate(sa);}
  const va=$("#view-attach");if(va)va.innerHTML="";
  hist=new TextHistory(body.value);histApplying=false;syncHistoryButtons();
  setPreview(false,{focus:false});
  requestAnimationFrame(()=>{autosize(t);autosize(body);body.focus({preventScroll:true});body.setSelectionRange(body.value.length,body.value.length);ensureCaretVisible();syncToolbar();});
}
function bindEditor(box,mode="edit"){
  const title=$("#entry-title",box),body=$("#entry-body",box),surface=$("#editor-surface",box);
  hist=new TextHistory(body.value);histApplying=false;
  const onInput=ev=>{
    const ed=state.editing;if(!ed)return;
    ed.title=title.value.replace(/\s*\n\s*/g," ");ed.body=body.value;
    if(ev?.target===body&&!histApplying){hist.record(body.value,[body.selectionStart,body.selectionEnd]);syncHistoryButtons();}
    detectSlash();
    markEditorDirty();
    scheduleFrameWork(ev?.inputType==="insertLineBreak"||body.value.length-body.selectionEnd<400,!/^insert(Text|CompositionText)$/.test(ev?.inputType||""));
    scheduleIdleWork();
  };
  title.addEventListener("input",ev=>{if(/\n/.test(title.value))title.value=title.value.replace(/\s*\n\s*/g," ");onInput(ev);});
  title.addEventListener("keydown",e=>{
    if(e.key==="Enter"&&!e.isComposing){e.preventDefault();body.focus();body.setSelectionRange(0,0);surface.scrollTop=0;}
    if(e.key==="ArrowDown"&&title.selectionStart===title.value.length&&!e.shiftKey){e.preventDefault();body.focus();body.setSelectionRange(0,0);}
  });
  body.addEventListener("input",onInput);
  /* our own history replaces the browser's: same result on every device, and it survives scripted edits */
  body.addEventListener("beforeinput",e=>{
    if(e.inputType==="historyUndo"){e.preventDefault();stepHistory(-1);}
    else if(e.inputType==="historyRedo"){e.preventDefault();stepHistory(1);}
  });
  body.addEventListener("keyup",e=>{if(["ArrowLeft","ArrowRight","Home","End","PageUp","PageDown"].includes(e.key)){hist.seal();detectSlash();syncToolbar();}});
  body.addEventListener("click",()=>{hist.seal();detectSlash();syncToolbar();});
  body.addEventListener("focus",()=>syncToolbar());
  body.addEventListener("paste",e=>{
    const files=[...(e.clipboardData?.files||[])].filter(f=>f.type.startsWith("image/"));
    if(files.length&&featureOn("featMedia")){e.preventDefault();attachFiles(files);}
  });
  surface.addEventListener("dragover",e=>{if(featureOn("featMedia")&&e.dataTransfer?.types?.includes("Files")){e.preventDefault();surface.classList.add("is-drop");}});
  surface.addEventListener("dragleave",()=>surface.classList.remove("is-drop"));
  surface.addEventListener("drop",e=>{
    surface.classList.remove("is-drop");
    const files=[...(e.dataTransfer?.files||[])].filter(f=>f.type.startsWith("image/")||f.type.startsWith("audio/"));
    if(files.length&&featureOn("featMedia")){e.preventDefault();attachFiles(files);}
  });
  body.addEventListener("keydown",e=>{
    if(e.isComposing)return;
    const mod=e.metaKey||e.ctrlKey;
    if(state.slash&&!$("#editor-slash-menu").hidden){
      const s=state.slash;
      if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();s.index=(s.index+(e.key==="ArrowDown"?1:-1)+s.items.length)%s.items.length;renderSlash();return;}
      if(e.key==="Enter"||e.key==="Tab"){e.preventDefault();applySlash();return;}
      if(e.key==="Escape"){e.preventDefault();e.stopPropagation();hideSlash();return;}
    }
    if(mod&&!e.altKey){
      if(e.code==="KeyZ"){e.preventDefault();stepHistory(e.shiftKey?1:-1);return;}
      if(!e.shiftKey&&e.code==="KeyY"){e.preventDefault();stepHistory(1);return;}
      if(!e.shiftKey&&e.code==="KeyB"){e.preventDefault();runFormat("bold");return;}
      if(!e.shiftKey&&e.code==="KeyI"){e.preventDefault();runFormat("italic");return;}
      if(!e.shiftKey&&e.code==="KeyK"){e.preventDefault();runFormat("link");return;}
      if(e.shiftKey&&e.code==="KeyX"){e.preventDefault();runFormat("strike");return;}
    }
    if(e.key==="Enter"&&!mod&&!e.shiftKey&&!e.altKey&&body.selectionStart===body.selectionEnd){const r=continueList(body.value,body.selectionStart);if(r){e.preventDefault();setBodyValue(r);return;}}
    if(e.key==="Tab"&&!mod&&!e.altKey){const r=shiftIndent(body.value,body.selectionStart,body.selectionEnd,e.shiftKey);if(r){e.preventDefault();setBodyValue(r);}}
  });
  title.addEventListener("focus",()=>hideSlash());
  // details
  const ed=()=>state.editing;
  const meta=fn=>e=>{if(!ed())return;fn(e);refreshEditorMeta();markEditorDirty("metadata");};
  $("#entry-date",box)?.addEventListener("change",meta(e=>{
    ed().happenedAt=dateInputToIso(e.target.value,ed().happenedAt);
    if(ed().happenedEnd&&new Date(ed().happenedEnd)<new Date(ed().happenedAt)){ed().happenedEnd=null;const n=$("#entry-end");if(n){n.value="";n.dispatchEvent(new Event("input",{bubbles:true}));}}
  }));
  $("#entry-end",box)?.addEventListener("change",meta(e=>{
    if(!e.target.value){ed().happenedEnd=null;return;}
    const end=dateInputToIso(e.target.value,ed().happenedAt);
    if(new Date(end)<new Date(localDateInputValue(ed().happenedAt)+"T00:00:00")){ctx.toast("Конец периода не может быть раньше начала.");e.target.value="";ed().happenedEnd=null;e.target.dispatchEvent(new Event("input",{bubbles:true}));return;}
    ed().happenedEnd=end;
  }));
  $("#entry-kind",box)?.addEventListener("change",meta(e=>{ed().kind=e.target.value;const p=$("#decision-panel");if(p){const w=document.createElement("div");w.innerHTML=decisionMarkup(ed());const fresh=w.firstElementChild;p.replaceWith(fresh);enhance(fresh);}}));
  $("#entry-chapter",box)?.addEventListener("change",meta(e=>{ed().chapterId=e.target.value||null;}));
  $("#entry-people",box)?.addEventListener("input",meta(e=>{ed().people=splitCsv(e.target.value);}));
  $("#entry-themes",box)?.addEventListener("input",meta(e=>{ed().themes=splitCsv(e.target.value).map(x=>x.replace(/^#/,"").toLocaleLowerCase("ru-RU"));}));
  $("#entry-projects",box)?.addEventListener("input",meta(e=>{ed().projects=splitCsv(e.target.value).slice(0,12);}));
  $("#entry-location",box)?.addEventListener("input",meta(e=>{ed().location=e.target.value.trim();}));
  $("#entry-sensitive",box)?.addEventListener("change",meta(e=>{ed().sensitive=e.target.checked;}));
  const ctxBox=$("#entry-context",box);
  const decisionField=e=>{
    const t=e.target,d=ed();if(!d)return;
    const cur=d.decision||{decision:"",context:"",options:"",expected:"",confidence:null,revisitOn:"",outcome:"",outcomeAt:null};
    if(t.dataset.decision)cur[t.dataset.decision]=t.value;
    else if(t.dataset.decisionSelect==="confidence")cur.confidence=Number(t.value)||null;
    else if(t.id==="dec-revisit")cur.revisitOn=t.value||"";
    else return;
    if(cur.outcome.trim()&&!cur.outcomeAt)cur.outcomeAt=nowIso();
    if(!cur.outcome.trim())cur.outcomeAt=null;
    d.decision=cleanDecision(cur)||cur;markEditorDirty("decision");
  };
  ctxBox?.addEventListener("input",decisionField);ctxBox?.addEventListener("change",e=>{
    decisionField(e);
    const lt=e.target.dataset?.linkType;
    if(lt&&ed()){ed().links=ed().links.map(l=>l.to===lt?{...l,type:e.target.value}:l);markEditorDirty("links");}
  });
  // toolbar: keep the caret in the text while tapping buttons
  const tools=$("#editor-tools",box),slash=$("#editor-slash-menu",box);
  tools.addEventListener("mousedown",e=>{if(e.target.closest("button"))e.preventDefault();});
  slash.addEventListener("mousedown",e=>{if(e.target.closest("button"))e.preventDefault();});
  tools.addEventListener("click",e=>{
    const f=e.target.closest("[data-format]");if(f){runFormat(f.dataset.format);return;}
    const h=e.target.closest("[data-history]");
    if(h){stepHistory(h.dataset.history==="undo"?-1:1);}
  });
  slash.addEventListener("click",e=>{const b=e.target.closest("[data-slash]");if(b)applySlash(b.dataset.slash);});
  const fi=$("#editor-find-input",box);
  fi.addEventListener("input",()=>{findRun();if(state.find?.matches.length)findJump(1);});
  fi.addEventListener("keydown",e=>{
    if(e.key==="Enter"&&!e.isComposing){e.preventDefault();findJump(e.shiftKey?-1:1);}
    else if(e.key==="Escape"){e.preventDefault();e.stopPropagation();closeFind();}
  });
  document.addEventListener("selectionchange",onSelectionChange);
  media.hydrate(box);
  if(mode==="view"){enterView();return;}
  requestAnimationFrame(()=>{
    autosize(title);autosize(body);
    if(state.editing.revision||state.editing.body){body.focus({preventScroll:true});body.setSelectionRange(body.value.length,body.value.length);ensureCaretVisible();}
    else title.focus({preventScroll:true});
    syncToolbar();
  });
}
let selectionFrame=0;
function onSelectionChange(){
  if(!state.editing){document.removeEventListener("selectionchange",onSelectionChange);return;}
  cancelAnimationFrame(selectionFrame);
  selectionFrame=requestAnimationFrame(()=>{if(document.activeElement===$("#entry-body"))syncToolbar();});
}

/* ----- suggestions ----- */
function acceptSuggestion(el){
  const d=state.editing;if(!d)return;
  const type=el.dataset.type,value=decodeURIComponent(el.dataset.value||"");
  if(type==="date"){d.happenedAt=value;const n=$("#entry-date");if(n){n.value=localDateInputValue(value);n.dispatchEvent(new Event("input",{bubbles:true}));}}
  else if(type==="theme"&&!d.themes.includes(value)){d.themes.push(value);const n=$("#entry-themes");if(n)n.value=d.themes.join(", ");}
  else if(type==="kind"){d.kind=value;const n=$("#entry-kind");if(n){n.value=value;n.dispatchEvent(new Event("change",{bubbles:true}));}}
  else if(type==="person"&&!d.people.includes(value)){d.people.push(value);const n=$("#entry-people");if(n)n.value=d.people.join(", ");}
  else if(type==="project"&&!d.projects.includes(value)){d.projects.push(value);const n=$("#entry-projects");if(n)n.value=d.projects.join(", ");}
  else if(type==="place"&&!d.location){d.location=value;const n=$("#entry-location");if(n)n.value=value;}
  // an accepted suggestion must not come back as a suggestion
  d.dismissedSuggestions=[...new Set([...(d.dismissedSuggestions||[]),el.dataset.key])];
  refreshEditorMeta();markEditorDirty("accepted_suggestion");
  ctx.toast("Подсказка применена.");
}
function dismissSuggestion(el){
  if(!state.editing)return;
  state.editing.dismissedSuggestions=[...new Set([...(state.editing.dismissedSuggestions||[]),el.dataset.key])];
  refreshEditorMeta();markEditorDirty("dismissed_suggestion");
}

/* ----- persistence of the open entry ----- */
const isPrefillOnly=e=>!e.revision&&e.prefill&&e.body.trim()===e.prefill.trim();
const META_KEYS=["title","body","favorite","completedAt","deletedAt","happenedAt","kind","sensitive","location","people","themes","projects","dismissedSuggestions","happenedEnd","chapterId","links","decision"];
const sameValue=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const baselineOf=e=>{const o={};for(const k of META_KEYS)o[k]=structuredClone(e[k]??null);return o;};
/* what counts as "you changed this entry" when leaving; favourites and dismissed hints are not worth a question */
const GUARD_KEYS=["title","body","kind","happenedAt","happenedEnd","location","people","themes","projects","chapterId","decision","links","sensitive"];
function changedSinceOpen(){
  const ed=state.editing,b=state.editorBaseline;
  if(!ed)return false;
  if(!b)return Boolean(ed.body.trim())&&!isPrefillOnly(ed);
  return GUARD_KEYS.some(k=>!sameValue(ed[k],b[k]));
}
async function persistEditingSnapshot(snapshot,source,epoch){
  const current=()=>state.editing?.id===snapshot.id&&state.saveEpoch===epoch;
  if(state.conflict){if(!$('#dialog-root .conflict-body'))showConflictSheet();return false;}
  if(isPrefillOnly(snapshot)){if(current())setSaveStatus("Начните с ответа");return false;}
  if(!validateCanonicalEntry(snapshot).ok){if(current())setSaveStatus(snapshot.title.trim()?"Добавьте текст, чтобы сохранить":"Пока пусто",snapshot.title.trim()?"error":"");return false;}
  const prev=entryById(snapshot.id);
  const unchanged=prev&&META_KEYS.every(k=>sameValue(prev[k],snapshot[k]));
  if(unchanged){if(current()){state.dirty=false;setSaveStatus("Сохранено");}return true;}
  try{
    const {prefill,...clean}=snapshot;
    // a snapshot cloned while an earlier save was still running carries an old revision; our own saves advance state.editing.revision
    const expect=Math.max(snapshot.revision||0,state.editing?.id===snapshot.id?state.editing.revision||0:0);
    const next={...clean,updatedAt:nowIso(),revision:nextRevision(expect)};
    await store.commitEntrySnapshot(next,source,{expectRevision:prev||expect>0?expect:null});
    await store.trimVersions(next.id,100);
    // refresh only what changed instead of decrypting the whole diary after every keystroke pause
    const i=state.entries.findIndex(e=>e.id===next.id);
    if(i>=0)state.entries[i]={...state.entries[i],...next};else state.entries.unshift(next);
    state.entries=[...state.entries].sort((a,b)=>new Date(b.happenedAt)-new Date(a.happenedAt));
    store.notifyChange("entry");
    if(state.editing?.id===snapshot.id){
      state.editing.revision=next.revision;state.editing.updatedAt=next.updatedAt;
      const tb=$("#trash-button");if(tb)tb.hidden=false;
      state.saveRetries=0;clearTimeout(state.saveRetryTimer);
      if(state.saveEpoch===epoch){state.dirty=false;setSaveStatus("Сохранено");}
    }
    return true;
  }catch(err){
    if(err?.name==="ConflictError"){await handleConflict(snapshot,err.current);return false;}
    console.error("Ошибка локального сохранения",err);
    if(state.editing?.id===snapshot.id){
      /* bounded retries with exponential backoff and jitter; the text never leaves the editor */
      const n=state.saveRetries=(state.saveRetries||0)+1;
      if(n<=5){
        setSaveStatus("Пока не сохранено. Текст остаётся здесь, пробуем ещё раз…","error");
        clearTimeout(state.saveRetryTimer);
        state.saveRetryTimer=setTimeout(()=>{if(state.editing?.id===snapshot.id&&state.dirty)saveEditing("retry");},Math.min(30000,1000*2**n)+Math.random()*400);
      }else setSaveStatus("Не сохранено. Текст остаётся в редакторе — скопируйте его и проверьте свободное место","error");
    }
    return false;
  }
}
export function saveEditing(source="autosave"){
  if(!state.editing)return Promise.resolve(false);
  clearTimeout(state.editorTimer);
  const snapshot=structuredClone(state.editing),epoch=state.saveEpoch;
  state.saveChain=state.saveChain.catch(()=>false).then(()=>persistEditingSnapshot(snapshot,source,epoch));
  return state.saveChain;
}
/* An entry that changed elsewhere is never overwritten: the person decides, and both versions are kept in the history. */
async function handleConflict(mine,rawTheirs){
  const theirs=await store.unpackEntry(rawTheirs);
  state.conflict={mine,theirs};
  setSaveStatus("Запись изменилась в другой вкладке","error");
  showConflictSheet();
}
/** Also shown again when the person tries to save or close while the conflict is still open (the sheet can be dismissed by mistake). */
function showConflictSheet(){
  const {mine,theirs}=state.conflict||{};if(!mine||!theirs)return;
  const t=entryText(theirs);
  ctx.sheetDialog(`${modalHeader("Запись изменилась в другом окне","Ничего не потеряется: вторая версия сохранится в истории.","info","close-dialog")}<div class="modal-body conflict-body">
    <p>Пока вы писали здесь, эту запись изменили в другой вкладке Narra. Выберите, как поступить.</p>
    <div class="conflict-compare"><div><strong>Ваша версия</strong><p>${words(mine.body)} ${wordLabel(words(mine.body))} · ${escapeHtml(excerpt(mine.body,110))}</p></div><div><strong>Версия из другого окна</strong><p>${words(theirs.body)} ${wordLabel(words(theirs.body))} · ${escapeHtml(excerpt(theirs.body,110))}</p></div></div>
    <div class="more-menu"><button class="more-menu-item" data-action="conflict-both">${icon("plus")}<span><strong>Сохранить обе версии</strong><small>Ваш текст станет отдельной записью «${escapeHtml(t.title)} (копия)»</small></span>${icon("chevron-right")}</button>
    <button class="more-menu-item" data-action="conflict-mine">${icon("pen")}<span><strong>Оставить мою версию</strong><small>Версия из другого окна останется в истории</small></span>${icon("chevron-right")}</button>
    <button class="more-menu-item" data-action="conflict-theirs">${icon("refresh")}<span><strong>Взять версию из другого окна</strong><small>Мой текст сохранится в истории</small></span>${icon("chevron-right")}</button></div></div>`,"Конфликт правок");
}
async function resolveConflict(kind){
  const c=state.conflict;if(!c)return;
  try{
    const {prefill,...mine}=c.mine;
    if(kind==="mine"){
      const next={...mine,updatedAt:nowIso(),revision:nextRevision(c.theirs.revision)};
      await store.commitEntrySnapshot(next,"conflict_mine");
      state.editing.revision=next.revision;
    }else if(kind==="theirs"){
      await store.saveVersionOnly({...mine,revision:c.theirs.revision},"conflict_discarded");
      state.editing=structuredClone(c.theirs);
    }else{
      const id=uid(),map=await store.cloneAttachments(mine.id,id);
      let body=mine.body;for(const [from,to] of map)body=body.replaceAll(from,to);
      const copy={...mine,id,body,title:`${mine.title||entryText(mine).title} (копия)`,revision:1,createdAt:nowIso(),updatedAt:nowIso(),links:[]};
      await store.commitEntrySnapshot(copy,"conflict_copy");
      await store.reloadAttachments();
      state.editing=structuredClone(copy);
    }
    state.conflict=null;state.dirty=false;
    await store.loadData();store.notifyChange("entry");
    ctx.closeDialog({restoreFocus:false});
    state.editorMode="edit";state.editorBaseline=baselineOf(state.editing);
    const box=ctx.overlay(editorMarkup(state.editing,"edit"),"modal editor-modal","Редактор записи",{kind:"editor",focus:false});
    bindEditor(box,"edit");
    ctx.toast(kind==="both"?"Ваша версия сохранена отдельной записью.":kind==="mine"?"Оставлена ваша версия.":"Загружена версия из другого окна.");
  }catch(error){console.error(error);ctx.toast("Не удалось разрешить конфликт. Ничего не потеряно.");}
}
export async function closeEditor({finish=false,force=false}={}){
  const ed=state.editing;
  if(!ed){ctx.closeOverlay();return true;}
  clearTimeout(state.editorTimer);
  if(!finish&&!force&&state.editorMode==="edit"&&!state.conflict&&changedSinceOpen()&&ed.body.trim()&&!isPrefillOnly(ed)){
    await saveEditing("close").catch(()=>false); // the sheet says the text is already on the device — make that true first
    if(state.conflict)return false;
    askBeforeLeaving();return false;
  }
  const empty=!ed.body.trim()||isPrefillOnly(ed);
  const discard=async()=>{if(!ed.revision)await store.deleteAttachmentsFor(ed.id).catch(()=>{});await store.reloadAttachments().catch(()=>{});ctx.closeOverlay();ctx.render();};
  if(empty){
    if(ed.revision>0&&state.dirty){setSaveStatus("Текст не может быть пустым","error");ctx.toast("Верните текст записи или переместите её в корзину.");return false;}
    if(ed.title.trim()&&!ed.revision){
      ctx.confirmDialog({title:"Закрыть без сохранения?",text:"Запись без текста не сохраняется, а здесь есть только заголовок. Добавьте хотя бы одну строку.",confirmLabel:"Закрыть без сохранения",cancelLabel:"Продолжить писать",danger:true,iconName:"info"},discard);
      return false;
    }
    await discard();return true;
  }
  if(!ed.completedAt){ed.completedAt=nowIso();state.saveEpoch++;state.dirty=true;}
  const ok=await saveEditing(finish?"complete":"close");
  if(!ok){ctx.toast(state.conflict?"Сначала выберите, как сохранить запись.":"Не удалось сохранить запись. Редактор остаётся открытым.");return false;}
  ctx.closeOverlay();ctx.render();
  if(finish)ctx.toast("Запись сохранена.");
  return true;
}
function askBeforeLeaving(){
  const isNew=!state.editorBaseline;
  const item=(iconName,title,sub,action,cls="")=>`<button type="button" class="more-menu-item${cls}" data-action="${action}">${icon(iconName)}<span><strong>${title}</strong><small>${sub}</small></span>${icon("chevron-right")}</button>`;
  ctx.sheetDialog(`${modalHeader(isNew?"Закрыть запись?":"Закрыть без потери правок?",isNew?"Текст уже записан на этом устройстве как черновик.":"Правки уже записаны на этом устройстве.","pen","close-dialog")}<div class="modal-body more-menu">
    ${item("check",isNew?"Сохранить и закрыть":"Сохранить правки","Запись останется в дневнике","guard-save")}
    ${item("pen","Продолжить писать","Вернуться в редактор","close-dialog")}
    <div class="more-menu-sep" role="separator"></div>
    ${item("trash",isNew?"Не сохранять":"Отменить правки",isNew?"Черновик уйдёт в корзину — оттуда его можно вернуть":"Запись станет такой, какой была при открытии; правки сохранятся в истории версий","guard-discard"," is-danger")}
  </div>`,"Закрыть запись");
}
async function discardSession(){
  const ed=state.editing;if(!ed)return;
  ctx.closeDialog({restoreFocus:false});
  clearTimeout(state.editorTimer);
  try{
    await state.saveChain.catch(()=>false);
    const b=state.editorBaseline,current=entryById(ed.id);
    if(!b){
      if(current&&!current.deletedAt){
        const next={...current,deletedAt:nowIso(),updatedAt:nowIso(),revision:nextRevision(current.revision)};
        await store.commitEntrySnapshot(next,"trash");await store.loadData();store.notifyChange("entry");
      }
      ctx.closeOverlay();ctx.render();
      ctx.toast(current?"Черновик перемещён в корзину.":"Черновик закрыт без сохранения.",current?{label:"Вернуть",action:"undo-trash",id:ed.id}:null);
    }else{
      if(current){
        const patch={};for(const k of META_KEYS)if(!["completedAt","deletedAt"].includes(k))patch[k]=b[k];
        const next={...current,...patch,updatedAt:nowIso(),revision:nextRevision(current.revision)};
        await store.commitEntrySnapshot(next,"revert");await store.trimVersions(next.id,100);await store.loadData();store.notifyChange("entry");
      }
      ctx.closeOverlay();ctx.render();ctx.toast("Правки отменены. Запись такая же, как была.");
    }
  }catch(error){console.error(error);ctx.toast("Не удалось отменить правки. Запись осталась как есть.");}
}
async function trashCurrentEntry(){
  const ed=state.editing;if(!ed)return;
  if(!ed.revision){
    if(ed.body.trim()&&!isPrefillOnly(ed)){
      ctx.confirmDialog({title:"Отбросить черновик?",text:"Эта запись ещё не сохранена. Она будет удалена без возможности вернуть.",confirmLabel:"Отбросить",cancelLabel:"Отмена",danger:true,iconName:"trash"},async()=>{const id=ed.id;await store.deleteAttachmentsFor(id).catch(()=>{});await store.reloadAttachments().catch(()=>{});ctx.closeOverlay();ctx.render();ctx.toast("Черновик отброшен.");});
      return;
    }
    ctx.closeOverlay();ctx.render();return;
  }
  const label=entryText(ed).title;
  ctx.confirmDialog({title:"Переместить запись в корзину?",text:`«${label}» исчезнет из дневника, но останется в корзине.`,detail:"Оттуда её можно вернуть в любой момент — пока вы сами не удалите её навсегда.",confirmLabel:"В корзину",cancelLabel:"Оставить",danger:true,iconName:"trash"},async()=>{
    const cur=state.editing;if(!cur||cur.id!==ed.id)return;
    cur.deletedAt=nowIso();state.saveEpoch++;state.dirty=true;
    const id=cur.id,ok=await saveEditing("trash");
    if(ok){
      ctx.closeOverlay();ctx.render();
      ctx.resultDialog({title:"Запись в корзине",text:`«${label}» перемещена в корзину.`,hint:"Найти её можно в разделе «Дневник» → «Корзина». Там же её можно вернуть.",actions:[{label:"Вернуть запись",action:"undo-trash",id,toast:true},{label:"Открыть корзину",action:"open-trash"}],hidePref:"hideDeleteHint"});
    }else{cur.deletedAt=null;ctx.toast("Не удалось переместить запись в корзину. Она осталась на месте.");}
  });
}
export async function restoreTrashedEntry(id){
  const current=state.entries.find(e=>e.id===id&&e.deletedAt);if(!current){ctx.toast("Эта запись уже не в корзине.");return;}
  try{
    const restored={...current,deletedAt:null,updatedAt:nowIso(),revision:nextRevision(current.revision)};
    await store.commitEntrySnapshot(restored,"restore_trash");await store.trimVersions(restored.id,100);await store.loadData();store.notifyChange("entry");ctx.render();ctx.toast("Запись восстановлена.");
  }catch(error){console.error("Ошибка восстановления из корзины",error);ctx.toast("Не удалось восстановить запись.");}
}
function toggleFavorite(el){
  if(!state.editing)return;
  const on=!state.editing.favorite;state.editing.favorite=on;
  if(el){el.classList.toggle("is-active",on);el.setAttribute("aria-pressed",String(on));el.setAttribute("aria-label",on?"Убрать из избранного":"Добавить в избранное");}
  markEditorDirty("favorite");
}

/* ----- versions ----- */
async function versionsFor(entryId){
  const versions=(await store.all(store.STORES.versions)).filter(v=>v.entryId===entryId).sort((a,b)=>b.revision-a.revision||new Date(b.createdAt)-new Date(a.createdAt));
  return Promise.all(versions.map(async v=>({...v,title:await store.decryptText(v.titleEnc),body:await store.decryptText(v.bodyEnc)})));
}
const SOURCE_LABEL={autosave:"автосохранение",complete:"завершение",close:"закрытие",manual:"вручную",restore:"восстановление",conflict_mine:"после конфликта",conflict_copy:"копия при конфликте",conflict_discarded:"сохранено при конфликте",trash:"корзина",restore_trash:"из корзины",quick_capture:"быстрая запись",metadata:"детали"};
async function showVersions(){
  if(!state.editing)return;
  const ok=await saveEditing("before_versions");
  if(!ok&&state.dirty&&state.editing.body.trim()){ctx.toast("Сначала нужно сохранить текущие изменения.");return;}
  const id=state.editing.id,versions=await versionsFor(id),latest=versions[0]?.revision;
  const rows=versions.slice(0,30).map(v=>`<div class="version-row"><div class="version-copy"><strong>${escapeHtml(fmtLong(v.createdAt))}, ${escapeHtml(fmtTime(v.createdAt))}${v.revision===latest?statusPill("Текущая","good","check"):""}</strong><p>${words(v.body)} ${wordLabel(words(v.body))}${SOURCE_LABEL[v.source]?` · ${SOURCE_LABEL[v.source]}`:""}</p><p class="version-excerpt">${escapeHtml(excerpt(v.body,160))}</p></div>${v.revision===latest?"":`<button class="secondary button-with-icon" data-action="restore-version" data-id="${escapeHtml(v.id)}">${icon("undo")}<span>Восстановить</span></button>`}</div>`).join("");
  ctx.overlay(`${modalHeader("История версий","Восстановление создаёт новую версию — текущая не теряется.","history","close-versions")}<div class="version-list">${rows||`<div class="empty compact-empty">${icon("history","empty-icon")}<h3>Версий пока нет</h3><p>Первая версия появится после сохранения текста.</p></div>`}</div>`,"sheet","История версий",{kind:"versions"});
}
async function restoreVersion(versionId){
  const raw=await store.getRecord(store.STORES.versions,versionId);if(!raw)return;
  const current=entryById(raw.entryId);if(!current){ctx.toast("Текущая запись больше не существует.");return;}
  try{
    const meta=raw.metaEnc?await store.decryptJson(raw.metaEnc,{}):{};
    const restored={...current,...meta,title:await store.decryptText(raw.titleEnc),body:await store.decryptText(raw.bodyEnc),updatedAt:nowIso(),revision:nextRevision(current.revision)};
    await store.commitEntrySnapshot(restored,"restore");await store.trimVersions(restored.id,100);await store.loadData();store.notifyChange("entry");
    state.editing=null;await openEditor(restored.id,{mode:"view"});ctx.toast("Версия восстановлена как новая.");
  }catch(error){console.error("Ошибка восстановления версии",error);ctx.toast("Не удалось восстановить версию.");}
}

/* ----- more sheet on phones ----- */
function showEditorMore(){
  const ed=state.editing;if(!ed)return;
  const view=state.editorMode==="view";
  const item=(iconName,title,run,sub="")=>`<button type="button" class="more-menu-item" data-action="editor-run" data-run="${run}">${icon(iconName)}<span><strong>${title}</strong>${sub?`<small>${sub}</small>`:""}</span>${icon("chevron-right")}</button>`;
  ctx.sheetDialog(`${modalHeader("Запись","","pen","close-dialog")}<div class="modal-body more-menu">
    ${view?"":item("search","Найти в записи","find")}
    ${item("state","Отметить состояние","checkin")}
    ${item("history","История версий","versions")}
    ${item("star",ed.favorite?"Убрать из избранного":"Добавить в избранное","favorite")}
    ${item("copy","Скопировать текст","copy")}
    ${item("download","Сохранить как файл Markdown","export-md")}
    ${view?"":item("focus","Режим фокуса","focus")}
    ${ed.revision?`<div class="more-menu-sep" role="separator"></div>${item("trash","Переместить в корзину","trash")}`:""}</div>`,"Действия с записью");
}
async function copyEntryText(){
  const ed=state.editing;if(!ed)return;
  const text=`${ed.title?ed.title+"\n\n":""}${ed.body}`;
  try{await navigator.clipboard.writeText(text);ctx.toast("Текст скопирован.");}
  catch{
    const ta=document.createElement("textarea");ta.value=text;ta.setAttribute("readonly","");ta.className="sr-only";document.body.append(ta);ta.select();
    let ok=false;try{ok=document.execCommand("copy");}catch{}ta.remove();ctx.toast(ok?"Текст скопирован.":"Не удалось скопировать. Выделите текст вручную.");
  }
}
function exportEntryMarkdown(){
  const ed=state.editing;if(!ed)return;
  const front=`---\ndate: ${localDateInputValue(ed.happenedAt)}\nkind: ${ed.kind}\n${ed.themes?.length?`tags: [${ed.themes.join(", ")}]\n`:""}---\n\n`;
  const md=`${front}${ed.title?`# ${ed.title}\n\n`:""}${ed.body}\n`;
  const name=(ed.title||localDateInputValue(ed.happenedAt)).replace(/[\\/:*?"<>|\n]/g," ").trim().slice(0,60)||"запись";
  const url=URL.createObjectURL(new Blob([md],{type:"text/markdown;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download=`${name}.md`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
  ctx.toast("Файл сохранён.");
}
async function runEditorAction(run){
  ctx.closeDialog({restoreFocus:false});
  if(run==="find")showEditorFind();
  else if(run==="versions")await showVersions();
  else if(run==="favorite")toggleFavorite($(".favorite-button"));
  else if(run==="focus")toggleFocusMode();
  else if(run==="checkin")await ctx.ACTIONS["entry-checkin"]();
  else if(run==="trash")await trashCurrentEntry();
  else if(run==="copy")await copyEntryText();
  else if(run==="export-md")exportEntryMarkdown();
}

/* ----- link picker ----- */
function linkPickerMarkup(q=""){
  const ed=state.editing,taken=new Set((ed.links||[]).map(l=>l.to));
  let list=activeEntries().filter(e=>e.id!==ed.id&&!taken.has(e.id));
  list=q.trim()?searchEntries(list,q,{kindLabels}).results:list;
  list=list.slice(0,12);
  return list.length?list.map(e=>`<button type="button" class="more-menu-item" data-action="link-add" data-id="${escapeHtml(e.id)}">${icon("journal")}<span><strong>${escapeHtml(entryText(e).title)}</strong><small>${escapeHtml(fmtDate(e.happenedAt,{year:"numeric"}))}</small></span>${icon("plus")}</button>`).join(""):`<p class="subtle">Ничего не найдено.</p>`;
}
const LINK_PICKER=`${modalHeader("Связать с записью","Выберите запись, которая продолжает эту или связана с ней.","link","close-dialog")}<div class="modal-body"><label class="field"><span class="label">Найти запись</span><input class="input" id="link-search" autocomplete="off" placeholder="Слово из заголовка или текста"></label><div class="more-menu" id="link-results"></div></div>`;

/* ----- exports to the shell ----- */
export function onOverlayClosed(){
  media.stopRecordingIfAny();clearTimeout(idleJob);cancelAnimationFrame(frameJob);frameJob=0;
  document.removeEventListener("selectionchange",onSelectionChange);
  store.revokeMediaUrls();
}
export async function onEscape(){
  if(state.slash&&!$("#editor-slash-menu")?.hidden){hideSlash();return true;}
  if(closeFind())return true;
  if(state.editorPreview&&state.editorMode!=="view"){setPreview(false);return true;}
  if($(".editor-modal.is-focus-mode")){toggleFocusMode();return true;}
  return false;
}
export async function onKey(e,mod){
  if(mod&&e.shiftKey&&e.code==="KeyF"){e.preventDefault();toggleFocusMode();return;}
  if(mod&&!e.shiftKey&&e.code==="KeyF"){e.preventDefault();showEditorFind();return;}
  if(mod&&e.key==="Enter"){e.preventDefault();if(state.editorMode==="view")return;await ctx.ACTIONS["finish-editing"]();return;}
  if(mod&&e.code==="KeyS"){e.preventDefault();const ok=await saveEditing("manual");if(ok)ctx.toast("Сохранено.");return;}
  if(e.key==="F3"||(mod&&e.code==="KeyG")){e.preventDefault();if(!$("#editor-findbar")||$("#editor-findbar").hidden)showEditorFind();else findJump(e.shiftKey?-1:1);}
}
export const onResize=()=>{if(state.editing){autosize($("#entry-title"));autosize($("#entry-body"));}};
export const onViewport=()=>{if(state.editing&&document.activeElement===$("#entry-body"))ensureCaretVisible();};
export function init(c){
  Object.assign(c,{openEditor,markEditorDirty,insertAtCaret,removeMediaRefs,refreshAttachments,attachFiles,afterMediaAdded,editorSave:saveEditing});
}
export const views={};
export const actions={
  "new-entry":()=>openEditor(),
  "new-entry-on-date":el=>openEditor(null,{date:el.dataset.date}),
  "open-entry":el=>openEditor(el.dataset.id),
  "open-linked":async el=>{await openEditor(el.dataset.id);},
  "focus-new":async()=>{await openEditor();toggleFocusMode();},
  "close-editor":()=>closeEditor(),
  "finish-editing":async()=>{
    if(state.editorOrigin==="view"&&state.editing?.revision>0&&state.editing.body.trim()){
      const ed=state.editing;if(!ed.completedAt){ed.completedAt=nowIso();state.saveEpoch++;state.dirty=true;}
      const ok=await saveEditing("complete");
      if(ok){state.editorBaseline=baselineOf(state.editing);enterView();ctx.toast("Сохранено.");}
      else ctx.toast("Не удалось сохранить запись. Она осталась в редакторе.");
      return;
    }
    await closeEditor({finish:true});
  },
  "edit-entry":()=>enterEdit(),
  "guard-save":async()=>{ctx.closeDialog({restoreFocus:false});await closeEditor({finish:true});},
  "guard-discard":()=>discardSession(),
  "editor-find":()=>showEditorFind(),
  "close-find":()=>closeFind(),
  "find-next":()=>findJump(1),
  "find-prev":()=>findJump(-1),
  "toggle-preview":()=>setPreview(!state.editorPreview),
  "toggle-focus":()=>toggleFocusMode(),
  "favorite":el=>toggleFavorite(el),
  "trash-entry":()=>trashCurrentEntry(),
  "versions":()=>showVersions(),
  "close-versions":async()=>{const id=state.editing?.id,mode=state.editorMode;if(id&&entryById(id)){state.editing=null;await openEditor(id,{mode});}else ctx.closeOverlay();},
  "restore-version":el=>restoreVersion(el.dataset.id),
  "accept-suggestion":el=>acceptSuggestion(el),
  "dismiss-suggestion":el=>dismissSuggestion(el),
  "editor-more":()=>showEditorMore(),
  "editor-run":el=>runEditorAction(el.dataset.run),
  "restore-trash":el=>restoreTrashedEntry(el.dataset.id),
  "undo-trash":el=>restoreTrashedEntry(el.dataset.id),
  "conflict-both":()=>resolveConflict("both"),
  "conflict-mine":()=>resolveConflict("mine"),
  "conflict-theirs":()=>resolveConflict("theirs"),
  "assist":el=>{
    const ed=state.editing,box=$("#assist-result");if(!ed||!box)return;
    const kind=el.dataset.kind;
    if(kind==="structure"){
      const body=$("#entry-body");
      insertAtCaret(body.value.trim()?`\n\n${STRUCTURE_TEMPLATE}`:STRUCTURE_TEMPLATE);
      box.innerHTML=`<p class="subtle">Шаблон добавлен. Его можно менять как угодно.</p>`;return;
    }
    box.innerHTML=assistResult(kind,ed);ctx.animateIn(box);
  },
  "assist-insert":el=>{const t=decodeURIComponent(el.dataset.text||"");insertAtCaret(`\n\n> ${t}\n\n`);},
  "assist-goto":el=>{
    const body=$("#entry-body");if(!body)return;
    if(state.editorPreview)setPreview(false);
    body.focus({preventScroll:true});body.setSelectionRange(Number(el.dataset.from),Number(el.dataset.to));ensureCaretVisible();
  },
  "link-pick":()=>{
    ctx.sheetDialog(LINK_PICKER,"Связать с записью");
    const box=$("#link-results");if(box)box.innerHTML=linkPickerMarkup();
  },
  "link-add":el=>{
    const ed=state.editing;if(!ed)return;
    ed.links=cleanLinks([...(ed.links||[]),{to:el.dataset.id,type:"related"}]);
    ctx.closeDialog({restoreFocus:false});
    const n=$("#entry-links");if(n){const w=document.createElement("div");w.innerHTML=linksMarkup(ed);const fresh=w.firstElementChild;n.replaceWith(fresh);enhance(fresh);}
    markEditorDirty("links");
  },
  "unlink":el=>{
    const ed=state.editing;if(!ed)return;
    ed.links=(ed.links||[]).filter(l=>l.to!==el.dataset.id);
    const n=$("#entry-links");if(n){const w=document.createElement("div");w.innerHTML=linksMarkup(ed);n.replaceWith(w.firstElementChild);}
    markEditorDirty("links");
  },
};
export const on={
  input:e=>{
    if(e.target.id==="link-search"){const box=$("#link-results");if(box)box.innerHTML=linkPickerMarkup(e.target.value);return true;}
    return false;
  },
};
export {parseRussianDateHint,capitalizeRu};
