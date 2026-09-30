/* Narra UI kit: custom select and date picker that replace native popups so every control
   follows one design language. Progressive enhancement: the native <select>/<input type=date> stay in the DOM
   (visually hidden) as the single source of truth, so existing form code and change events keep working. */

import { capitalizeRu } from "./domain.mjs?v=4.5.0";

const icon=(name,cls="")=>`<svg class="icon ${cls}" aria-hidden="true" focusable="false"><use href="#icon-${name}"></use></svg>`;
const MONTHS=["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const WEEKDAYS_MON=["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
const dateOptions={weekStart:1};
export function setDateOptions(next){Object.assign(dateOptions,next);}

let active=null; // the one open popover: {el, anchor, close}

export function closePopovers(){ if(active) active.close(); }
export function popoverOpen(){ return Boolean(active); }

function place(anchor,el,{minWidth=0,matchWidth=false}={}){
  const r=anchor.getBoundingClientRect(),vw=document.documentElement.clientWidth,vh=window.innerHeight;
  el.style.minWidth=Math.max(minWidth,matchWidth?r.width:0)+"px";
  el.style.maxHeight="";
  el.style.left="0px";el.style.top="0px";
  const h=Math.min(el.offsetHeight,el.scrollHeight),w=el.offsetWidth;
  const below=vh-r.bottom-10,above=r.top-10;
  let top,maxH=null;
  if(h<=below||below>=above){top=r.bottom+6;if(h>below)maxH=Math.max(140,below-6);}
  else{maxH=h>above?Math.max(140,above-6):null;top=Math.max(10,r.top-6-Math.min(h,maxH||h));}
  let left=r.left;if(left+w>vw-10)left=Math.max(10,vw-10-w);
  if(maxH)el.style.maxHeight=maxH+"px";
  el.style.left=Math.round(left)+"px";el.style.top=Math.round(top)+"px";
}
function openPopover(anchor,el,opts={}){
  closePopovers();
  el.classList.add("popover");
  document.body.append(el);
  place(anchor,el,opts);
  requestAnimationFrame(()=>el.classList.add("is-open"));
  const onDown=e=>{if(!el.contains(e.target)&&!anchor.contains(e.target))close();};
  const onScroll=e=>{if(!el.contains(e.target))close();};
  const onResize=()=>close();
  let closed=false;
  function close({restoreFocus=false}={}){
    if(closed)return;closed=true;
    document.removeEventListener("pointerdown",onDown,true);
    window.removeEventListener("scroll",onScroll,true);
    window.removeEventListener("resize",onResize);
    anchor.setAttribute("aria-expanded","false");
    el.classList.remove("is-open");
    el.remove();
    if(active&&active.el===el)active=null;
    opts.onClose?.();
    if(restoreFocus)anchor.focus({preventScroll:true});
  }
  document.addEventListener("pointerdown",onDown,true);
  window.addEventListener("scroll",onScroll,true);
  window.addEventListener("resize",onResize);
  anchor.setAttribute("aria-expanded","true");
  active={el,anchor,close};
  return close;
}

/* ============================== custom select ============================== */
export function enhanceSelects(root=document){
  root.querySelectorAll("select[data-select]:not([data-enhanced])").forEach(buildSelect);
}
function buildSelect(sel){
  sel.dataset.enhanced="1";
  const wrap=document.createElement("div");wrap.className="select";
  sel.before(wrap);
  const trigger=document.createElement("button");
  trigger.type="button";trigger.className="select-trigger";
  trigger.setAttribute("role","combobox");trigger.setAttribute("aria-haspopup","listbox");trigger.setAttribute("aria-expanded","false");
  const labelText=sel.getAttribute("aria-label")||sel.closest("label")?.childNodes[0]?.textContent?.trim()||"";
  if(labelText)trigger.setAttribute("aria-label",labelText);
  trigger.innerHTML=`<span class="select-value"></span>${icon("chevron-down","select-chevron")}`;
  wrap.append(trigger,sel);
  sel.classList.add("select-native");sel.tabIndex=-1;sel.setAttribute("aria-hidden","true");
  const valueEl=trigger.querySelector(".select-value");
  const sync=()=>{
    const o=sel.selectedOptions[0];valueEl.textContent=o?o.textContent:"";
    trigger.disabled=sel.disabled;
    valueEl.classList.toggle("is-placeholder",!sel.value&&Boolean(sel.dataset.placeholderValue));
  };
  sync();
  sel.addEventListener("change",sync);
  const commit=(value)=>{if(sel.value!==value){sel.value=value;sel.dispatchEvent(new Event("change",{bubbles:true}));}else sync();};

  let typed="",typedTimer=0;
  const options=()=>[...sel.options].filter(o=>!o.disabled);
  const typeahead=(key)=>{
    typed+=key.toLocaleLowerCase("ru-RU");clearTimeout(typedTimer);typedTimer=setTimeout(()=>typed="",650);
    const list=options(),start=Math.max(0,list.findIndex(o=>o.value===sel.value));
    const found=[...list.slice(start+(typed.length===1?1:0)),...list.slice(0,start+1)].find(o=>o.textContent.toLocaleLowerCase("ru-RU").startsWith(typed));
    return found||null;
  };
  const open=()=>{
    if(trigger.disabled)return;
    const list=options(),menu=document.createElement("div");
    menu.className="select-menu";menu.setAttribute("role","listbox");menu.tabIndex=-1;
    if(labelText)menu.setAttribute("aria-label",labelText);
    const id=`opt-${Math.random().toString(36).slice(2,8)}`;
    menu.innerHTML=list.map((o,i)=>`<div class="select-option${o.value===sel.value?" is-selected":""}" role="option" id="${id}-${i}" data-value="${o.value.replace(/"/g,"&quot;")}" aria-selected="${o.value===sel.value}"><span>${o.textContent.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}</span>${icon("check","select-check")}</div>`).join("");
    let index=Math.max(0,list.findIndex(o=>o.value===sel.value));
    const nodes=()=>[...menu.querySelectorAll(".select-option")];
    const setActive=(i,{scroll=true}={})=>{
      index=(i+list.length)%list.length;
      nodes().forEach((n,k)=>n.classList.toggle("is-active",k===index));
      menu.setAttribute("aria-activedescendant",`${id}-${index}`);
      if(scroll)nodes()[index]?.scrollIntoView({block:"nearest"});
    };
    const close=openPopover(trigger,menu,{minWidth:180,matchWidth:true,onClose:()=>menu.removeEventListener("keydown",onKey)});
    const pick=i=>{const v=list[i]?.value;close({restoreFocus:true});if(v!=null)commit(v);};
    const onKey=e=>{
      const k=e.key;
      if(k==="ArrowDown"){e.preventDefault();setActive(index+1);}
      else if(k==="ArrowUp"){e.preventDefault();setActive(index-1);}
      else if(k==="Home"){e.preventDefault();setActive(0);}
      else if(k==="End"){e.preventDefault();setActive(list.length-1);}
      else if(k==="PageDown"){e.preventDefault();setActive(Math.min(list.length-1,index+6));}
      else if(k==="PageUp"){e.preventDefault();setActive(Math.max(0,index-6));}
      else if(k==="Enter"||k===" "){e.preventDefault();pick(index);}
      else if(k==="Escape"){e.preventDefault();e.stopPropagation();close({restoreFocus:true});}
      else if(k==="Tab"){e.preventDefault();close({restoreFocus:true});}
      else if(k.length===1&&!e.ctrlKey&&!e.metaKey){const f=typeahead(k);if(f)setActive(list.indexOf(f));}
    };
    menu.addEventListener("keydown",onKey);
    menu.addEventListener("pointermove",e=>{const n=e.target.closest(".select-option");if(n){const i=nodes().indexOf(n);if(i!==index)setActive(i,{scroll:false});}});
    menu.addEventListener("click",e=>{const n=e.target.closest(".select-option");if(n)pick(nodes().indexOf(n));});
    setActive(index);
    menu.focus({preventScroll:true});
  };
  trigger.addEventListener("click",()=>{ if(active?.anchor===trigger)closePopovers(); else open(); });
  trigger.addEventListener("keydown",e=>{
    if(["ArrowDown","ArrowUp","Enter"," "].includes(e.key)){e.preventDefault();open();}
    else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){const f=typeahead(e.key);if(f)commit(f.value);}
  });
}

/* ============================== date picker ============================== */
export function isoDay(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function parseDay(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v||""))return null;const [y,m,d]=v.split("-").map(Number);const dt=new Date(y,m-1,d,12);return dt.getMonth()===m-1?dt:null;}
export function formatDay(v){
  const d=parseDay(v);if(!d)return "";
  return new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric"}).format(d).replace(/\s*г\.$/,"");
}
export function enhanceDates(root=document){
  root.querySelectorAll("input[type=date][data-datepicker]:not([data-enhanced])").forEach(buildDate);
}
function buildDate(input){
  input.dataset.enhanced="1";
  const clearable=input.hasAttribute("data-clearable");
  const wrap=document.createElement("div");wrap.className="select date-field";
  input.before(wrap);
  const trigger=document.createElement("button");
  trigger.type="button";trigger.className="select-trigger date-trigger";
  trigger.setAttribute("aria-haspopup","dialog");trigger.setAttribute("aria-expanded","false");
  const labelText=input.getAttribute("aria-label")||input.closest("label")?.childNodes[0]?.textContent?.trim()||"Дата";
  trigger.setAttribute("aria-label",labelText);
  trigger.innerHTML=`${icon("calendar","date-icon")}<span class="select-value"></span>`;
  wrap.append(trigger,input);
  input.classList.add("select-native");input.tabIndex=-1;input.setAttribute("aria-hidden","true");
  let clear=null;
  if(clearable){
    clear=document.createElement("button");clear.type="button";clear.className="date-clear";clear.setAttribute("aria-label","Очистить дату");
    clear.innerHTML=icon("x");wrap.append(clear);
    clear.addEventListener("click",()=>{commit("");trigger.focus({preventScroll:true});});
  }
  const valueEl=trigger.querySelector(".select-value");
  const sync=()=>{
    const text=formatDay(input.value);
    valueEl.textContent=text||input.dataset.placeholder||"Выберите дату";
    valueEl.classList.toggle("is-placeholder",!text);
    if(clear)clear.hidden=!text;
    wrap.classList.toggle("has-clear",Boolean(clear&&text));
  };
  sync();
  input.addEventListener("change",sync);
  const commit=v=>{if(input.value!==v){input.value=v;input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));}else sync();};
  const open=()=>{
    const min=parseDay(input.min),max=parseDay(input.max),today=new Date();today.setHours(12,0,0,0);
    let selected=parseDay(input.value),cursor=new Date((selected||today).getTime());cursor.setDate(1);
    let focusDay=new Date((selected||today).getTime());
    const pop=document.createElement("div");pop.className="datepop";pop.setAttribute("role","dialog");pop.setAttribute("aria-label","Выбор даты");
    const ws=dateOptions.weekStart===0?0:1;
    const heads=(ws===1?WEEKDAYS_MON:["Вс",...WEEKDAYS_MON.slice(0,6)]);
    const inRange=d=>(!min||d>=min)&&(!max||d<=max);
    const draw=()=>{
      const y=cursor.getFullYear(),m=cursor.getMonth(),first=new Date(y,m,1,12),lead=(first.getDay()-ws+7)%7;
      const start=new Date(y,m,1-lead,12);
      let cells="";
      for(let i=0;i<42;i++){
        const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i,12),key=isoDay(d);
        const cls=["datepop-day",d.getMonth()!==m?"is-outside":"",selected&&isoDay(selected)===key?"is-selected":"",isoDay(today)===key?"is-today":""].filter(Boolean).join(" ");
        cells+=`<button type="button" class="${cls}" data-day="${key}" tabindex="${isoDay(focusDay)===key?0:-1}" ${inRange(d)?"":"disabled"} aria-label="${new Intl.DateTimeFormat("ru-RU",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(d)}" ${selected&&isoDay(selected)===key?'aria-pressed="true"':""}>${d.getDate()}</button>`;
      }
      pop.innerHTML=`<div class="datepop-head"><button type="button" class="icon-button icon-button-quiet" data-nav="-1" aria-label="Предыдущий месяц">${icon("chevron-left")}</button><div class="datepop-title" aria-live="polite">${MONTHS[m]} ${y}</div><button type="button" class="icon-button icon-button-quiet" data-nav="1" aria-label="Следующий месяц">${icon("chevron-right")}</button></div>
        <div class="datepop-weekdays" aria-hidden="true">${heads.map(h=>`<span>${h}</span>`).join("")}</div><div class="datepop-grid">${cells}</div>
        <div class="datepop-foot"><button type="button" class="link-button" data-today>Сегодня</button>${clearable?'<button type="button" class="link-button" data-clear>Очистить</button>':""}</div>`;
    };
    draw();
    const close=openPopover(trigger,pop,{});
    const pick=d=>{close({restoreFocus:true});commit(isoDay(d));};
    const focusCell=()=>{pop.querySelector(`[data-day="${isoDay(focusDay)}"]`)?.focus({preventScroll:true});};
    const moveFocus=(days,months=0)=>{
      const d=new Date(focusDay.getFullYear(),focusDay.getMonth()+months,focusDay.getDate()+days,12);
      if(months&&d.getMonth()!==((focusDay.getMonth()+months)%12+12)%12)d.setDate(0); // clamp to month end
      focusDay=d;
      if(d.getMonth()!==cursor.getMonth()||d.getFullYear()!==cursor.getFullYear()){cursor=new Date(d.getFullYear(),d.getMonth(),1,12);draw();}
      else{pop.querySelectorAll(".datepop-day").forEach(b=>b.tabIndex=b.dataset.day===isoDay(d)?0:-1);}
      focusCell();
    };
    pop.addEventListener("click",e=>{
      const nav=e.target.closest("[data-nav]"),day=e.target.closest("[data-day]");
      if(nav){cursor=new Date(cursor.getFullYear(),cursor.getMonth()+Number(nav.dataset.nav),1,12);focusDay=new Date(cursor);draw();return;}
      if(day&&!day.disabled){const d=parseDay(day.dataset.day);if(d)pick(d);return;}
      if(e.target.closest("[data-today]")){if(inRange(today))pick(today);else{cursor=new Date(today.getFullYear(),today.getMonth(),1,12);draw();}return;}
      if(e.target.closest("[data-clear]")){close({restoreFocus:true});commit("");}
    });
    pop.addEventListener("keydown",e=>{
      const k=e.key;
      if(k==="Escape"){e.preventDefault();e.stopPropagation();close({restoreFocus:true});return;}
      if(k==="Tab"&&!e.shiftKey&&document.activeElement?.closest(".datepop-foot")&&!document.activeElement.nextElementSibling){e.preventDefault();close({restoreFocus:true});return;}
      if(!e.target.closest?.(".datepop-day"))return;
      const map={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[-7,0],ArrowDown:[7,0],PageUp:[0,e.shiftKey?-12:-1],PageDown:[0,e.shiftKey?12:1]};
      if(map[k]){e.preventDefault();moveFocus(...map[k]);}
      else if(k==="Home"){e.preventDefault();moveFocus(-((focusDay.getDay()-ws+7)%7));}
      else if(k==="End"){e.preventDefault();moveFocus(6-((focusDay.getDay()-ws+7)%7));}
    });
    focusCell();
  };
  trigger.addEventListener("click",()=>{ if(active?.anchor===trigger)closePopovers(); else open(); });
  trigger.addEventListener("keydown",e=>{if(e.key==="ArrowDown"){e.preventDefault();open();}});
}

export function enhance(root=document){enhanceSelects(root);enhanceDates(root);}
export {capitalizeRu};
