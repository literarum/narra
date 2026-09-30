/* Life map («Карта жизни»): people, places, themes, projects and life chapters — only what the user wrote on their entries.
   Each page shows the entries, the months they cluster in (empty months stay visible), neighbours, and state associations
   with the days behind them. Names can be renamed, merged and annotated without touching the entries themselves. */
import {state,ctx,$,escapeHtml,icon,fmtDate,relDay,activeEntries,entryLabel,dayLabel,featureOn} from "./core.js?v=4.3.0";
import {pageHeader,emptyState,tabs,chip,modalHeader} from "./kit.js?v=4.3.0";
import {ENTITY_TYPES,collectEntities,listByType,entityPage,norm,entityKey,sortChapters,chapterEntries,chapterOf} from "./entities.mjs?v=4.3.0";
import {entityMap} from "./derived.js?v=4.3.0";
import {describeAssociation} from "./insights-model.mjs?v=4.3.0";
import {monthStrip} from "./charts.mjs?v=4.3.0";
import {activeDimensions,dimLabel} from "./checkin.mjs?v=4.3.0";
import {benjaminiHochberg,dayKey,MIN_N} from "./stats.mjs?v=4.3.0";
import {cleanEntityNote} from "./domain.mjs?v=4.3.0";
import {entryRows} from "./entries-ui.js?v=4.3.0";
import * as store from "./store.js?v=4.3.0";

const TYPE_ICON={person:"users",place:"map",theme:"tag",project:"layout"};
let sort="count",filterText="";
const typeOf=key=>ENTITY_TYPES.find(t=>t.type===key.split(":")[0]);
const dayText=iso=>fmtDate(iso,{year:"numeric"});

/* ---------- list ---------- */
function listTab(type){
  const t=ENTITY_TYPES.find(x=>x.type===type),map=entityMap();
  let rows=listByType(map,type,{sort});
  const q=norm(filterText);if(q)rows=rows.filter(r=>norm(r.name).includes(q));
  const total=listByType(map,type).length;
  if(!total)return emptyState(`${t.plural} пока нет`,type==="place"?"Место появится, когда вы укажете его в записи.":type==="person"?"Люди появятся, когда вы добавите имена в записи.":type==="theme"?"Темы появятся, когда вы добавите их к записям.":"Проекты появятся, когда вы добавите их к записям.","","map");
  return `<div class="lm-tools"><input class="input" id="lm-filter" type="search" placeholder="Найти среди «${escapeHtml(t.plural.toLocaleLowerCase("ru-RU"))}»" aria-label="Фильтр по названию" value="${escapeHtml(filterText)}" autocomplete="off">
    <div class="segmented" role="group" aria-label="Порядок"><button data-action="lifemap-sort" data-value="count" aria-pressed="${sort==="count"}" class="${sort==="count"?"is-active":""}">По числу записей</button><button data-action="lifemap-sort" data-value="name" aria-pressed="${sort==="name"}" class="${sort==="name"?"is-active":""}">По алфавиту</button></div></div>
    <div id="lm-list">${listRows(rows)}</div>`;
}
function listRows(rows){
  if(!rows.length)return `<p class="subtle">Ничего не найдено.</p>`;
  return `<ul class="entity-list">${rows.map(r=>`<li><button class="entity-row" data-action="lifemap-open" data-key="${escapeHtml(r.key)}">${icon(TYPE_ICON[r.type])}<span class="entity-name">${escapeHtml(r.name)}</span><span class="entity-meta">${r.count} ${entryLabel(r.count)} · последний раз ${escapeHtml(relDay(r.last))}</span>${icon("chevron-right","entity-chevron")}</button></li>`).join("")}</ul>`;
}
function chaptersTab(){
  const chapters=sortChapters(state.chapters),all=activeEntries();
  if(!chapters.length)return emptyState("Глав жизни пока нет","Период с названием — «Переезд», «Новая работа». Создать главу можно в дневнике, на вкладке «Главы».",`<button class="secondary" data-action="lifemap-chapters-new">Создать главу</button>`,"book");
  return `<div class="chapter-list">${chapters.map(c=>{
    const list=chapterEntries(c,all,state.chapters),range=c.start?`${dayText(`${c.start}T12:00:00`)} — ${c.end?dayText(`${c.end}T12:00:00`):"по сегодня"}`:"Без дат";
    return `<article class="card chapter-card"><div><h3>${escapeHtml(c.name)}</h3><p class="subtle text-small">${escapeHtml(range)}</p>${c.description?`<p>${escapeHtml(c.description)}</p>`:""}<p class="chapter-count">${list.length} ${entryLabel(list.length)}</p></div><div class="chapter-actions"><button class="secondary" data-action="lifemap-chapter" data-id="${escapeHtml(c.id)}">Открыть записи</button></div></article>`;
  }).join("")}</div>`;
}

/* ---------- entity page ---------- */
function neighbourMap(center,groups){
  const nodes=groups.flatMap(g=>g.items.map(i=>({...i,type:g.type}))).slice(0,12);
  if(!nodes.length)return "";
  const W=560,H=300,cx=W/2,cy=H/2,rx=W/2-70,ry=H/2-34,max=Math.max(...nodes.map(n=>n.count));
  const cut=(s,n)=>s.length>n?s.slice(0,n-1)+"…":s;
  const items=nodes.map((n,i)=>{
    const a=(i/nodes.length)*Math.PI*2-Math.PI/2,x=cx+Math.cos(a)*rx,y=cy+Math.sin(a)*ry,w=1+Math.round(n.count/max*3);
    return `<line class="map-edge w${w}" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/><g class="map-node t-${n.type}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(7+n.count/max*7).toFixed(1)}"/><text x="${x.toFixed(1)}" y="${(y+(y<cy?-16:24)).toFixed(1)}" text-anchor="middle">${escapeHtml(cut(n.name,16))}</text></g>`;
  }).join("");
  const words=String(center).split(/\s+/).filter(Boolean),lines=[];
  for(const w of words){const last=lines[lines.length-1];if(last&&(last+" "+w).length<=9)lines[lines.length-1]=last+" "+w;else lines.push(w);}
  const shown=lines.slice(0,2).map(l=>cut(l,9)),longest=Math.max(...shown.map(l=>l.length),3),R=Math.min(46,Math.max(26,longest*3.5+11));
  const tspans=shown.map((l,i)=>`<tspan x="${cx}" y="${(cy+4-(shown.length-1)*6+i*12).toFixed(1)}">${escapeHtml(l)}</tspan>`).join("");
  return `<svg class="chart map-chart" viewBox="0 0 ${W} ${H}" aria-hidden="true" preserveAspectRatio="xMidYMid meet">${items}<g class="map-center"><circle cx="${cx}" cy="${cy}" r="${R.toFixed(1)}"/><text text-anchor="middle">${tspans}</text></g></svg>`;
}
function associationBlock(page){
  const dims=activeDimensions(state.config),rows=page.associations.map((a,i)=>({a,dim:dims.find(d=>d.key===a.metric)})).filter(x=>x.dim);
  const ok=rows.filter(x=>x.a.ok);
  if(!ok.length)return `<p class="subtle">${page.daysWithState<MIN_N?`Дней с отметками и этой меткой пока ${page.daysWithState}: нужно хотя бы ${MIN_N}, чтобы сопоставлять.`:"Заметных совпадений с состоянием нет."}</p>`;
  const keep=benjaminiHochberg(ok.map(x=>x.a.p),.1);
  const shown=ok.filter((x,i)=>keep[i]&&x.a.noteworthy);
  if(!shown.length)return `<p class="subtle">Совпадений с состоянием не найдено — это тоже результат (по ${ok[0].a.n} ${dayLabel(ok[0].a.n)} с этой меткой).</p>`;
  return shown.map(x=>{
    const t=describeAssociation({...x.a,dim:x.dim,name:page.entity.name,kind:page.entity.type});
    return `<article class="association compact"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.detail)}</p><p class="evidence">${escapeHtml(t.evidence)}</p><p class="caution">${icon("info")}<span>${escapeHtml(t.caution)}</span></p></article>`;
  }).join("");
}
function entityView(key){
  const page=entityPage(key,state.entries,state.checkins,state.entityNotes);
  if(!page){state.lifemapKey=null;return `${pageHeader("Карта жизни","Карта жизни")}${emptyState("Такого элемента больше нет","Возможно, все записи с ним удалены или он объединён с другим.",`<button class="secondary" data-action="lifemap-back">Назад к списку</button>`,"map")}`;}
  const e=page.entity,t=typeOf(key),muted=state.mutedTopics.includes(key);
  const neigh=[{type:"person",items:page.people},{type:"place",items:page.places},{type:"theme",items:page.themes},{type:"project",items:page.projects}].filter(g=>g.items.length);
  const aliases=page.note?.aliases||[];
  return `<div class="entity-page">
    <button class="link-button back-link" data-action="lifemap-back">${icon("chevron-left")}<span>${escapeHtml(t.plural)}</span></button>
    <header class="entity-head"><div><p class="eyebrow">${escapeHtml(t.singular)}</p><h1>${escapeHtml(e.name)}</h1><p class="subtle">${e.count} ${entryLabel(e.count)} · с ${escapeHtml(dayText(e.first))} по ${escapeHtml(dayText(e.last))}</p>${aliases.length?`<p class="subtle text-small">Тоже встречается как: ${aliases.map(escapeHtml).join(", ")}</p>`:""}</div>
      <div class="page-actions"><button class="secondary" data-action="lifemap-show-entries" data-key="${escapeHtml(key)}">${icon("journal")}<span>Все записи</span></button><button class="secondary" data-action="lifemap-menu" data-key="${escapeHtml(key)}" aria-haspopup="dialog">${icon("more")}<span>Ещё</span></button></div></header>
    ${page.note?.note?`<section class="card entity-note"><h2>Ваша заметка</h2><p>${escapeHtml(page.note.note).replace(/\n/g,"<br>")}</p></section>`:""}
    <section class="section"><h2>Когда упоминалось</h2><div class="card">${monthStrip({months:page.distribution,summary:`${e.name}: записи по месяцам`})}<p class="subtle text-small">Каждый квадрат — месяц; чем темнее, тем больше записей. Пустые месяцы видны.</p></div></section>
    ${neigh.length?`<section class="section"><h2>Что рядом</h2><div class="card">${neighbourMap(e.name,neigh)}<div class="neighbour-groups">${neigh.map(g=>`<div><h3>${escapeHtml(ENTITY_TYPES.find(x=>x.type===g.type).plural)}</h3><div class="chips">${g.items.map(i=>chip(`${escapeHtml(i.name)} <small>${i.count}</small>`,`data-action="lifemap-open" data-key="${escapeHtml(i.key)}"`)).join("")}</div></div>`).join("")}</div></div></section>`:""}
    <section class="section"><h2>Состояние в эти дни</h2><div class="card">${associationBlock(page)}</div></section>
    <section class="section"><div class="section-heading"><h2>Недавние записи</h2>${page.entries.length>8?`<button class="link-button" data-action="lifemap-show-entries" data-key="${escapeHtml(key)}">Все ${page.entries.length}</button>`:""}</div>${entryRows(page.entries.slice(0,8))}</section>
    ${muted?`<p class="subtle text-small">${icon("info")} Скрыто из воспоминаний.</p>`:""}</div>`;
}

export function lifemapView(){
  if(state.lifemapKey)return entityView(state.lifemapKey);
  const items=[...ENTITY_TYPES.map(t=>[t.type,t.plural]),...(featureOn("featChapters")?[["chapter","Главы"]]:[])];
  if(!items.some(i=>i[0]===state.lifemapType))state.lifemapType="person";
  const type=state.lifemapType;
  return `${pageHeader("Ваш мир","Карта жизни","Люди, места, темы и проекты из ваших записей. Ничего не угадывается: только то, что вы сами указали.")}${tabs("lifemap",items,type,{label:"Разделы карты жизни"})}<div id="panel-lifemap" role="tabpanel" aria-labelledby="tab-lifemap-${type}">${type==="chapter"?chaptersTab():listTab(type)}</div>`;
}

/* ---------- editing names (never touches the entries) ---------- */
async function saveNote(note){
  const clean=cleanEntityNote(note);if(!clean)throw new Error("bad-note");
  await store.saveEntityNote(clean);await store.loadData();
}
function currentNote(key){const e=entityMap().get(key);return state.entityNotes.find(n=>n.id===key)||{id:key,name:e?.name||key.slice(key.indexOf(":")+1),aliases:[],note:""};}
function menu(key){
  const muted=state.mutedTopics.includes(key),item=(a,ic,title,sub,extra="")=>`<button class="more-menu-item" data-action="${a}" data-key="${escapeHtml(key)}" ${extra}>${icon(ic)}<span><strong>${title}</strong><small>${sub}</small></span>${icon("chevron-right")}</button>`;
  ctx.overlay(`${modalHeader(entityMap().get(key)?.name||"Элемент","Что можно сделать с этим элементом.","more")}<div class="modal-body more-menu">
    ${item("lifemap-rename","pen","Переименовать","Новое название; в самих записях текст не меняется.")}
    ${item("lifemap-aliases","tag","Другие названия","Например, «Аня» и «Анюта» — одна и та же.")}
    ${item("lifemap-merge","layout","Объединить с другим","Записи двух названий станут одним элементом.")}
    ${item("lifemap-note","journal","Заметка","Несколько слов об этом элементе — только для вас.")}
    ${item("lifemap-mute","eye",muted?"Показывать в воспоминаниях":"Скрыть из воспоминаний","Записи с этим элементом не будут появляться как воспоминания.")}
    ${state.entityNotes.some(n=>n.id===key)?item("lifemap-reset","refresh","Сбросить имена и заметку","Вернуть всё как в записях."):""}
  </div>`,"sheet","Действия с элементом");
}
export const views={lifemap:lifemapView};
export const actions={
  "lifemap-open":el=>{state.lifemapKey=el.dataset.key;if(state.route!=="lifemap")ctx.routeTo("lifemap");else{ctx.render();window.scrollTo({top:0});}},
  "lifemap-back":()=>{state.lifemapKey=null;ctx.render();},
  "lifemap-sort":el=>{sort=el.dataset.value;ctx.render();},
  "lifemap-menu":el=>menu(el.dataset.key),
  "lifemap-chapter":el=>{state.journalFilters={chapter:el.dataset.id};state.journalView="timeline";state.journalLimit=state.prefs.journalPage;ctx.routeTo("journal");},
  "lifemap-chapters-new":()=>{state.journalView="chapters";ctx.routeTo("journal");},
  "lifemap-show-entries":el=>{
    const key=el.dataset.key,type=key.split(":")[0],name=entityMap().get(key)?.name||"";
    const aliasNames=[name,...(state.entityNotes.find(n=>n.id===key)?.aliases||[])];
    if(type==="project"||aliasNames.length>1){state.searchQuery=name;Object.assign(state,{searchKind:"all",searchTheme:"",searchPerson:"",searchPlace:""});ctx.routeTo("search");return;}
    state.journalFilters={[type]:name};state.journalView="timeline";state.journalLimit=state.prefs.journalPage;ctx.routeTo("journal");
  },
  "lifemap-rename":el=>{
    const key=el.dataset.key,n=currentNote(key),type=key.split(":")[0];
    ctx.closeOverlay({restoreFocus:false});
    ctx.formDialog({title:"Переименовать",text:"Записи не изменятся: старое название станет альтернативным.",iconName:"pen",confirmLabel:"Сохранить",fields:[{id:"name",label:"Название",value:n.name,max:80}]},async v=>{
      const name=v.name.trim();if(!name)return "Введите название.";
      const newKey=entityKey(type,name);
      if(newKey!==key&&entityMap().has(newKey))return "Такое название уже есть. Используйте «Объединить».";
      const aliases=[...new Set([...(n.aliases||[]),...(norm(n.name)!==norm(name)?[n.name]:[])])].filter(a=>norm(a)!==norm(name));
      if(newKey!==key)await store.deleteEntityNote(key);
      await saveNote({id:newKey,name,aliases,note:n.note});
      state.lifemapKey=newKey;ctx.render();ctx.toast("Название изменено.");
    });
  },
  "lifemap-aliases":el=>{
    const key=el.dataset.key,n=currentNote(key);
    ctx.closeOverlay({restoreFocus:false});
    ctx.formDialog({title:"Другие названия",text:"Через запятую. В записях с любым из них будет один и тот же элемент.",iconName:"tag",confirmLabel:"Сохранить",fields:[{id:"aliases",label:"Названия",value:(n.aliases||[]).join(", "),placeholder:"Анюта, Анна",max:300}]},async v=>{
      const aliases=v.aliases.split(",").map(s=>s.trim()).filter(Boolean);
      await saveNote({...n,aliases});ctx.render();ctx.toast("Сохранено.");
    });
  },
  "lifemap-note":el=>{
    const key=el.dataset.key,n=currentNote(key);
    ctx.closeOverlay({restoreFocus:false});
    ctx.formDialog({title:"Заметка",iconName:"journal",confirmLabel:"Сохранить",fields:[{id:"note",label:"Несколько слов",type:"textarea",rows:4,value:n.note||"",max:1000}]},async v=>{
      await saveNote({...n,note:v.note.trim()});ctx.render();ctx.toast("Заметка сохранена.");
    });
  },
  "lifemap-merge":el=>{
    const key=el.dataset.key,type=key.split(":")[0],n=currentNote(key);
    const options=listByType(entityMap(),type,{sort:"name"}).filter(r=>r.key!==key).map(r=>[r.key,`${r.name} (${r.count})`]);
    ctx.closeOverlay({restoreFocus:false});
    if(!options.length){ctx.toast("Больше нет элементов такого же типа.");return;}
    ctx.formDialog({title:"Объединить с…",text:`Записи «${n.name}» станут частью выбранного элемента. Сами записи не меняются.`,iconName:"layout",confirmLabel:"Объединить",fields:[{id:"target",label:"Объединить с",type:"select",options,value:options[0][0]}]},async v=>{
      const target=currentNote(v.target);if(!target)return "Выберите элемент.";
      const aliases=[...new Set([...(target.aliases||[]),n.name,...(n.aliases||[])])].filter(a=>norm(a)!==norm(target.name));
      await store.deleteEntityNote(key);
      await saveNote({...target,aliases,note:[target.note,n.note].filter(Boolean).join("\n\n")});
      state.lifemapKey=v.target;ctx.render();ctx.toast("Элементы объединены.");
    });
  },
  "lifemap-mute":async el=>{
    const key=el.dataset.key,list=state.mutedTopics.includes(key)?state.mutedTopics.filter(x=>x!==key):[...state.mutedTopics,key];
    await store.saveMutedTopics(list);ctx.closeOverlay({restoreFocus:false});ctx.render();ctx.toast(list.includes(key)?"Скрыто из воспоминаний.":"Снова показывается в воспоминаниях.");
  },
  "lifemap-reset":async el=>{await store.deleteEntityNote(el.dataset.key);await store.loadData();ctx.closeOverlay({restoreFocus:false});state.lifemapKey=null;ctx.render();ctx.toast("Имена и заметка сброшены.");},
};
export const on={
  input:e=>{
    if(e.target.id!=="lm-filter")return false;
    filterText=e.target.value;
    const box=$("#lm-list");if(!box)return true;
    const map=entityMap(),q=norm(filterText);
    let rows=listByType(map,state.lifemapType,{sort});if(q)rows=rows.filter(r=>norm(r.name).includes(q));
    box.innerHTML=listRows(rows);return true;
  },
};
export const beforeRender=()=>{};
export {collectEntities,chapterOf,dimLabel,dayKey};
