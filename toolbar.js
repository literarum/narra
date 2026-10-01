/* Arranging the formatting toolbar: press-and-hold a button in the editor and drag it; or use
   Settings → Editor → «Панель форматирования» (drag handles, arrow keys, add/remove, own tools). */
import {state,ctx,$,$$,escapeHtml,icon,uid} from "./core.js?v=4.6.0";
import {modalHeader} from "./kit.js?v=4.6.0";
import {TOOLS,SEP,DEFAULT_LAYOUT,PRESETS,CUSTOM_ICONS,MAX_CUSTOM,normalizeLayout,cleanCustomTools,toolInfo,unusedTools,moveTool,removeTool,addTool,customKey,reorderVisible} from "./tools.mjs?v=4.6.0";

const vibe=ms=>{if(state.prefs.haptics&&navigator.vibrate)try{navigator.vibrate(ms);}catch{}};

/* ---------- generic press-and-drag sorter (one axis, FLIP-style: neighbours slide, the DOM is reordered on drop) ---------- */
export function makeSorter({container,itemSel,axis="x",handleSel=null,hold=380,scrollEl=container,stateEl=container,onDrop}){
  const P=axis==="x"?{start:"left",size:"width",client:"clientX",scroll:"scrollLeft",tr:"translateX"}:{start:"top",size:"height",client:"clientY",scroll:"scrollTop",tr:"translateY"};
  let st=null;
  const swallow=e=>{e.stopPropagation();e.preventDefault();};
  function down(e){
    if((e.pointerType==="mouse"&&e.button!==0)||st)return;
    if(handleSel&&!e.target.closest(handleSel))return;
    const item=e.target.closest(itemSel);if(!item||!container.contains(item)||item.matches(".tool-sep"))return;
    st={item,id:e.pointerId,p0:e[P.client],q0:axis==="x"?e.clientY:e.clientX,s0:scrollEl[P.scroll],dragging:false,timer:0};
    if(hold>0)st.timer=setTimeout(begin,hold);else begin();
  }
  function begin(){
    if(!st)return;
    st.dragging=true;clearTimeout(st.timer);
    const items=[...container.querySelectorAll(itemSel)];
    st.items=items;st.idx=items.indexOf(st.item);st.to=st.idx;
    st.rects=items.map(el=>el.getBoundingClientRect());
    const r=st.rects[st.idx],next=st.rects[st.idx+1],prev=st.rects[st.idx-1];
    st.size=next?next[P.start]-r[P.start]:prev?r[P.start]-prev[P.start]:r[P.size];
    st.center=r[P.start]+r[P.size]/2;
    st.item.classList.add("is-lifted");stateEl.classList.add("is-reordering");
    try{st.item.setPointerCapture(st.id);}catch{}
    vibe(12);
  }
  function move(e){
    if(!st||e.pointerId!==st.id)return;
    if(!st.dragging){
      if(Math.hypot(e[P.client]-st.p0,(axis==="x"?e.clientY:e.clientX)-st.q0)>9){clearTimeout(st.timer);st=null;} // the finger is scrolling, not holding
      return;
    }
    e.preventDefault();
    // edge auto-scroll
    const sr=scrollEl.getBoundingClientRect(),near=44;
    if(e[P.client]>sr[P.start]+sr[P.size]-near)scrollEl[P.scroll]+=10;else if(e[P.client]<sr[P.start]+near)scrollEl[P.scroll]-=10;
    const d=(e[P.client]-st.p0)+(scrollEl[P.scroll]-st.s0);
    st.item.style.transform=`${P.tr}(${d}px) scale(1.12)`;
    const vc=st.center+d;
    let to=0;st.items.forEach((el,j)=>{if(j===st.idx)return;const c=st.rects[j][P.start]+st.rects[j][P.size]/2+(scrollEl[P.scroll]-st.s0)*0;if(c<vc)to++;});
    st.to=to;
    st.items.forEach((el,j)=>{
      if(j===st.idx)return;
      const k=j<st.idx?j:j-1;let shift=0;
      if(to>st.idx&&k>=st.idx&&k<to)shift=-st.size;else if(to<st.idx&&k>=to&&k<st.idx)shift=st.size;
      el.style.transform=shift?`${P.tr}(${shift}px)`:"";
    });
  }
  function up(e){
    if(!st||e.pointerId!==st.id)return;
    if(e.type==="pointercancel"&&st.dragging)st.to=st.idx; // the system took the touch away: put everything back, change nothing
    clearTimeout(st.timer);
    if(!st.dragging){st=null;return;}
    const {items,idx,to,item}=st;
    items.forEach(el=>{el.style.transform="";el.classList.remove("is-lifted");});
    stateEl.classList.remove("is-reordering");
    try{item.releasePointerCapture(st.id);}catch{}
    st=null;
    window.addEventListener("click",swallow,{capture:true,once:true});setTimeout(()=>window.removeEventListener("click",swallow,{capture:true}),350);
    if(to===idx)return;
    const rest=items.filter((_,j)=>j!==idx);rest.splice(to,0,item);
    container.append(...rest);
    onDrop?.(rest);
  }
  container.addEventListener("pointerdown",down);
  container.addEventListener("pointermove",move);container.addEventListener("pointerup",up);container.addEventListener("pointercancel",up);
  container.addEventListener("contextmenu",e=>{if(st)e.preventDefault();});
  container.addEventListener("touchmove",e=>{if(st?.dragging&&e.cancelable)e.preventDefault();},{passive:false});
  return ()=>{container.removeEventListener("pointerdown",down);container.removeEventListener("pointermove",move);container.removeEventListener("pointerup",up);container.removeEventListener("pointercancel",up);};
}

/* ---------- the editor's own bar ---------- */
const layoutNow=()=>normalizeLayout(state.prefs.toolbar,state.prefs.customTools);
function saveLayout(layout){ctx.setPref("toolbar",layout);ctx.refreshToolbar?.();}
let barSorter=null,barEl=null;
function attachBar(){
  const flow=$("#tool-flow");
  if(!flow){barSorter?.();barSorter=null;barEl=null;return;}
  if(flow===barEl)return;
  barSorter?.();barEl=flow;
  barSorter=makeSorter({container:flow,itemSel:".tool-button,.tool-sep",axis:"x",hold:380,scrollEl:flow.closest(".editor-tools")||flow,stateEl:flow.closest(".editor-tools")||flow,onDrop(order){
    const layout=layoutNow();
    const slots=order.map(()=>0); // placeholder, recomputed below from the old layout order
    const oldIndex=el=>el.matches(".tool-sep")?Number(el.dataset.sep):layout.indexOf(el.dataset.tool);
    const newTokens=order.map(el=>el.matches(".tool-sep")?SEP:el.dataset.tool);
    const oldSlots=order.map(oldIndex).sort((a,b)=>a-b);
    void slots;
    saveLayout(reorderVisible(layout,oldSlots,newTokens));
    ctx.toast("Порядок кнопок сохранён.",null,{duration:1800});
  }});
}

/* ---------- Settings sheet ---------- */
function rowMarkup(key,{index,last}){
  if(key===SEP)return `<div class="tb-row is-sep" data-key="${SEP}" data-index="${index}"><button type="button" class="tb-handle" aria-label="Переместить разделитель" data-tb-handle>${icon("grip")}</button><span class="tb-label"><i class="tb-sep-line"></i><em>разделитель</em></span><button type="button" class="icon-button icon-button-quiet" data-action="tb-remove-at" data-index="${index}" aria-label="Убрать разделитель">${icon("x")}</button></div>`;
  const info=toolInfo(key,state.prefs.customTools);if(!info)return "";
  return `<div class="tb-row" data-key="${escapeHtml(key)}" data-index="${index}"><button type="button" class="tb-handle" aria-label="Переместить: ${escapeHtml(info.label)}. Стрелки вверх и вниз меняют порядок" data-tb-handle data-key="${escapeHtml(key)}">${icon("grip")}</button><span class="tb-icon">${icon(info.icon)}</span><span class="tb-label">${escapeHtml(info.label)}${info.shortcut&&state.prefs.shortcuts?`<small>${escapeHtml(info.shortcut)}</small>`:""}</span>${info.custom?`<button type="button" class="icon-button icon-button-quiet" data-action="tb-custom-edit" data-id="${escapeHtml(key.slice(2))}" aria-label="Изменить «${escapeHtml(info.label)}»">${icon("pen")}</button>`:""}<button type="button" class="icon-button icon-button-quiet" data-action="tb-remove" data-key="${escapeHtml(key)}" aria-label="Убрать с панели: ${escapeHtml(info.label)}">${icon("x")}</button></div>`;
}
function sheetMarkup(){
  const layout=layoutNow(),custom=state.prefs.customTools;
  const free=unusedTools(layout,custom).map(k=>toolInfo(k,custom)).filter(Boolean);
  const presets=PRESETS.filter(p=>!custom.some(c=>c.label===p.label));
  return `${modalHeader("Панель форматирования","Перетаскивайте за ручку или стрелками вверх/вниз. В редакторе кнопку тоже можно удержать и перетащить.","type","close-dialog")}
  <div class="modal-body tb-sheet">
    <div class="tb-preview" aria-hidden="true">${layout.map(k=>k===SEP?'<i class="tool-sep"></i>':(()=>{const i=toolInfo(k,custom);return i?`<span class="tb-chip">${icon(i.icon)}</span>`:"";})()).join("")}</div>
    <h3 class="tb-h">На панели</h3>
    <div class="tb-list" id="tb-list" role="list">${layout.map((k,i)=>rowMarkup(k,{index:i,last:i===layout.length-1})).join("")}</div>
    <div class="tb-actions"><button type="button" class="secondary" data-action="tb-sep-add">${icon("plus")}<span>Разделитель</span></button><button type="button" class="ghost" data-action="tb-reset">Сбросить к стандартной</button></div>
    ${free.length?`<h3 class="tb-h">Можно добавить</h3><div class="tb-free">${free.map(i=>`<button type="button" class="tb-add" data-action="tb-add" data-key="${escapeHtml(i.key)}">${icon(i.icon)}<span>${escapeHtml(i.label.length>26?i.label.slice(0,25)+"…":i.label)}</span></button>`).join("")}</div>`:""}
    <h3 class="tb-h">Свои инструменты <small>${custom.length} из ${MAX_CUSTOM}</small></h3>
    <p class="subtle text-small">Вставляют ваш текст вокруг выделенного или в место курсора. В тексте можно использовать {date}, {time} и {datetime}.</p>
    ${presets.length?`<div class="tb-free">${presets.map(p=>`<button type="button" class="tb-add" data-action="tb-preset" data-id="${p.id}">${icon(p.icon)}<span>${escapeHtml(p.label)}</span></button>`).join("")}</div>`:""}
    <button type="button" class="secondary button-with-icon" data-action="tb-custom-new" ${custom.length>=MAX_CUSTOM?"disabled":""}>${icon("plus")}<span>Создать свой инструмент</span></button>
  </div>`;
}
let listSorter=null;
function showSheet(){
  const keep=$("#dialog-root .sheet")?.scrollTop||0;
  ctx.sheetDialog(sheetMarkup(),"Панель форматирования");
  const sheet=$("#dialog-root .sheet");if(sheet)sheet.scrollTop=keep;
  const list=$("#tb-list");if(!list)return;
  listSorter?.();
  listSorter=makeSorter({container:list,itemSel:".tb-row",axis:"y",handleSel:"[data-tb-handle]",hold:0,scrollEl:sheet,stateEl:list,onDrop(order){
    const tokens=order.map(r=>r.dataset.key);
    saveLayout(tokens.length?normalizeLayoutKeep(tokens):layoutNow());showSheet();
  }});
  list.addEventListener("keydown",e=>{
    const h=e.target.closest("[data-tb-handle]");if(!h||!["ArrowUp","ArrowDown"].includes(e.key))return;
    e.preventDefault();
    const row=h.closest(".tb-row"),idx=Number(row.dataset.index),layout=layoutNow(),to=idx+(e.key==="ArrowUp"?-1:1);
    if(to<0||to>=layout.length)return;
    saveLayout(moveTool(layout,idx,to));showSheet();
    requestAnimationFrame(()=>$(`#tb-list .tb-row[data-index="${to}"] [data-tb-handle]`)?.focus());
  });
}
const normalizeLayoutKeep=t=>{const out=[];for(const k of t){if(k===SEP&&(!out.length||out[out.length-1]===SEP))continue;out.push(k);}while(out[out.length-1]===SEP)out.pop();return out.length?out:[...DEFAULT_LAYOUT];};

function customForm(existing){
  ctx.formDialog({title:existing?"Изменить инструмент":"Новый инструмент",iconName:"type",confirmLabel:existing?"Сохранить":"Создать",
    text:"Например: название «Важное», начало «**Важно:** », конец пустой. Пробелы в начале и конце сохраняются.",
    fields:[
      {id:"label",label:"Название кнопки",type:"text",max:28,value:existing?.label||""},
      {id:"before",label:"Вставить перед",type:"text",max:160,value:existing?.before||"",hint:"Можно {date}, {time}, {datetime}."},
      {id:"after",label:"Вставить после",type:"text",max:160,value:existing?.after||""},
      {id:"line",label:"Куда вставлять",type:"select",options:[["no","Вокруг выделенного или в место курсора"],["yes","В начало каждой выбранной строки"]],value:existing?.line?"yes":"no"},
      {id:"icon",label:"Значок",type:"select",options:CUSTOM_ICONS.map(i=>[i,{star:"звезда",bulb:"лампочка",check:"галочка",bell:"колокольчик",clock:"часы",tag:"метка",users:"люди",map:"место",pen:"перо",sparkle:"искра",info:"вопрос",calendar:"календарь",wave:"волна",moon:"луна",sun:"солнце",book:"книга",key:"ключ",link:"ссылка",quote:"цитата",state:"состояние"}[i]||i]),value:existing?.icon||"pen"}
    ]},v=>{
      const label=v.label.trim();if(!label)return "Дайте кнопке название.";
      if(!v.before&&!v.after)return "Заполните хотя бы одно из полей «перед» или «после».";
      const tool={id:existing?.id||`t${uid().replace(/[^\w]/g,"").slice(0,8)}`,label,before:v.before,after:v.after,line:v.line==="yes",icon:v.icon};
      const list=existing?state.prefs.customTools.map(c=>c.id===existing.id?tool:c):[...state.prefs.customTools,tool];
      const clean=cleanCustomTools(list);if(!clean.some(c=>c.id===tool.id))return "Не получилось сохранить: проверьте поля.";
      ctx.setPref("customTools",clean);
      if(!existing)saveLayout(addTool(layoutNow(),customKey(tool.id)));else ctx.refreshToolbar?.();
      setTimeout(showSheet,30);return "";
    });
}

export const actions={
  "toolbar-settings":()=>showSheet(),
  "tb-remove":el=>{saveLayout(removeTool(layoutNow(),el.dataset.key));showSheet();},
  "tb-remove-at":el=>{const l=layoutNow();l.splice(Number(el.dataset.index),1);saveLayout(normalizeLayoutKeep(l));showSheet();},
  "tb-add":el=>{saveLayout(addTool(layoutNow(),el.dataset.key));showSheet();},
  "tb-sep-add":()=>{const l=layoutNow();if(l[l.length-1]!==SEP)l.push(SEP);saveLayout(l.length?l:[...DEFAULT_LAYOUT]);showSheet();
    const list=$("#tb-list");if(list)list.lastElementChild?.scrollIntoView({block:"nearest"});},
  "tb-reset":()=>{ctx.setPref("toolbar",[]);ctx.refreshToolbar?.();showSheet();ctx.toast("Панель вернулась к стандартной.");},
  "tb-preset":el=>{
    const p=PRESETS.find(x=>x.id===el.dataset.id);if(!p)return;
    const tool={id:p.id.replace(/^p-/,"p"),label:p.label,before:p.before,after:p.after,icon:p.icon,line:p.line};
    const clean=cleanCustomTools([...state.prefs.customTools,tool]);ctx.setPref("customTools",clean);
    if(clean.some(c=>c.id===tool.id))saveLayout(addTool(layoutNow(),customKey(tool.id)));showSheet();
  },
  "tb-custom-new":()=>customForm(null),
  "tb-custom-edit":el=>{const t=state.prefs.customTools.find(c=>c.id===el.dataset.id);if(t)customForm(t);},
  "tb-custom-delete":el=>{const id=el.dataset.id;ctx.setPref("customTools",state.prefs.customTools.filter(c=>c.id!==id));saveLayout(removeTool(layoutNow(),customKey(id)));showSheet();},
};
export function init(c){
  // the bar is re-created with every editor; watch for it
  new MutationObserver(attachBar).observe($("#overlay-root"),{childList:true,subtree:true});
  attachBar();
}
