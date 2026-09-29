/* Journal: timeline with day headers, calendar, life chapters, trash; filters, bulk actions and paging. */
import {state,ctx,$,$$,escapeHtml,icon,fmtLong,fmtMonthYear,fmtDate,relDay,fmtTime,localDateKey,entryLabel,activeEntries,trashedEntries,kindOptions,kindLabels,capitalizeRu,featureOn,uid,nowIso,downloadBlob,isoStamp,mediaOf,checkinLabel,plural} from "./core.js?v=4.2.0";
import {entryText} from "./text.mjs?v=4.2.0";
import {nextRevision} from "./domain.mjs?v=4.2.0";
import {checkinSummary} from "./checkin.mjs?v=4.2.0";
import {chapterOf,chapterEntries,sortChapters} from "./entities.mjs?v=4.2.0";
import {entryToMarkdown} from "./importers.mjs?v=4.2.0";
import {dayKey} from "./stats.mjs?v=4.2.0";
import {pageHeader,emptyState,tabs,selectHtml,field,checkRow,modalHeader} from "./kit.js?v=4.2.0";
import {entryRows,entryRow} from "./entries-ui.js?v=4.2.0";
import {EMOTION_GROUPS} from "./checkin.mjs?v=4.2.0";
import * as store from "./store.js?v=4.2.0";

const F=()=>state.journalFilters;
const norm=s=>String(s||"").toLocaleLowerCase("ru-RU");
export function filtersActive(f=F()){return Boolean(f.kind||f.person||f.place||f.theme||f.emotion||f.media||f.favorite||f.chapter||f.from||f.to);}
function emotionDays(emotion){
  const days=new Set();
  for(const c of state.checkins)if((c.emotions||[]).some(e=>e.name===emotion))days.add(dayKey(c.observedAt));
  return days;
}
export function applyFilters(entries,f=F()){
  if(!filtersActive(f))return entries;
  const from=f.from?new Date(`${f.from}T00:00:00`):null,to=f.to?new Date(`${f.to}T23:59:59.999`):null;
  const emoDays=f.emotion?emotionDays(f.emotion):null,mediaIds=f.media?new Set(state.attachments.map(a=>a.entryId)):null;
  const person=norm(f.person),place=norm(f.place),theme=norm(f.theme);
  return entries.filter(e=>{
    if(f.kind&&e.kind!==f.kind)return false;
    if(f.favorite&&!e.favorite)return false;
    if(person&&!(e.people||[]).some(x=>norm(x).includes(person)))return false;
    if(place&&!norm(e.location).includes(place))return false;
    if(theme&&!(e.themes||[]).some(x=>norm(x).includes(theme)))return false;
    if(emoDays&&!emoDays.has(dayKey(e.happenedAt)))return false;
    if(mediaIds&&!mediaIds.has(e.id))return false;
    if(f.chapter&&chapterOf(e,state.chapters)?.id!==f.chapter)return false;
    const t=new Date(e.happenedAt);if(from&&t<from)return false;if(to&&t>to)return false;
    return true;
  });
}
function dayHint(day){
  const list=state.checkins.filter(c=>dayKey(c.observedAt)===day&&c.phase==="standalone");
  if(!list.length)return "";
  const last=list[list.length-1];return checkinSummary(featureOn("featEmotionsInJournal")?last:{...last,emotions:[]},state.config,{max:3});
}
const weekdayLong=iso=>capitalizeRu(new Intl.DateTimeFormat("ru-RU",{weekday:"long",day:"numeric",month:"long"}).format(new Date(iso)));
function timelineMarkup(entries){
  if(!entries.length)return filtersActive()?emptyState("Ничего не найдено","Попробуйте убрать часть фильтров.",`<button class="secondary" data-action="journal-filters-reset">Сбросить фильтры</button>`,"journal"):entryRows(entries);
  const limit=state.journalLimit,shown=entries.slice(0,limit),select=state.journalSelect;
  const months=new Map();
  for(const e of shown){const k=dayKey(e.happenedAt).slice(0,7);if(!months.has(k))months.set(k,new Map());const m=months.get(k),d=dayKey(e.happenedAt);if(!m.has(d))m.set(d,[]);m.get(d).push(e);}
  const html=[...months.entries()].map(([k,days])=>`<section class="timeline-group"><h2>${fmtMonthYear(new Date(`${k}-01T12:00:00`))}</h2>${[...days.entries()].map(([d,list])=>{
    const hint=state.prefs.showCheckin?dayHint(d):"";
    return `<div class="day-block"><div class="day-head"><h3>${escapeHtml(weekdayLong(list[0].happenedAt))}</h3>${hint?`<span class="day-hint" title="Отметки этого дня">${escapeHtml(hint)}</span>`:""}</div>${entryRows(list,null,{select})}</div>`;}).join("")}</section>`).join("");
  const more=entries.length>limit?`<div class="load-more"><button class="secondary" data-action="journal-more">Показать ещё ${Math.min(state.prefs.journalPage,entries.length-limit)}</button><span class="subtle text-small">Показано ${limit} из ${entries.length}</span></div>`:"";
  return html+more;
}
function filtersMarkup(){
  const f=F(),chapters=sortChapters(state.chapters),emotions=EMOTION_GROUPS.flatMap(g=>g.items);
  const count=[f.kind,f.person,f.place,f.theme,f.emotion,f.media,f.favorite,f.chapter,f.from,f.to].filter(Boolean).length;
  return `<details class="filters-panel" ${filtersActive()?"open":""}><summary>${icon("filter")}<span>Фильтры</span>${count?`<span class="filter-count">${count}</span>`:""}</summary><div class="filters-grid">
    ${field("С даты",`<input type="date" data-datepicker data-clearable data-placeholder="Любая дата" id="jf-from" value="${escapeHtml(f.from||"")}">`)}
    ${field("По дату",`<input type="date" data-datepicker data-clearable data-placeholder="Любая дата" id="jf-to" value="${escapeHtml(f.to||"")}">`)}
    ${field("Тип",selectHtml("jf-kind",[["","Все типы"],...kindOptions.map(([k,v])=>[k,capitalizeRu(v)])],f.kind||"",{label:"Тип записи"}))}
    ${featureOn("featChapters")&&chapters.length?field("Глава",selectHtml("jf-chapter",[["","Любая"],...chapters.map(c=>[c.id,c.name])],f.chapter||"",{label:"Глава жизни"})):""}
    ${field("Человек",`<input class="input" id="jf-person" autocomplete="off" value="${escapeHtml(f.person||"")}" placeholder="имя">`)}
    ${field("Место",`<input class="input" id="jf-place" autocomplete="off" value="${escapeHtml(f.place||"")}" placeholder="место">`)}
    ${field("Тема",`<input class="input" id="jf-theme" autocomplete="off" value="${escapeHtml(f.theme||"")}" placeholder="тема">`)}
    ${state.checkins.some(c=>(c.emotions||[]).length)?field("Эмоция в тот день",selectHtml("jf-emotion",[["","Любая"],...emotions.map(x=>[x,x])],f.emotion||"",{label:"Эмоция в тот день"})):""}
    ${featureOn("featMedia")?checkRow("jf-media","Только с фото и аудио",f.media):""}
    ${checkRow("jf-favorite","Только избранное",f.favorite)}
    ${filtersActive()?`<button class="ghost" data-action="journal-filters-reset">Сбросить фильтры</button>`:""}
  </div></details>`;
}
function bulkBar(){
  if(!state.journalSelect)return "";
  const n=state.journalSelected.size;
  return `<div class="bulk-bar" role="region" aria-label="Действия с выбранными записями"><span class="bulk-count">${n?`Выбрано: ${n}`:"Отметьте записи"}</span><div class="bulk-actions">
    <button class="secondary" data-action="bulk-export" ${n?"":"disabled"}>${icon("download")}<span>Экспорт</span></button>
    <button class="secondary" data-action="bulk-theme" ${n?"":"disabled"}>${icon("tag")}<span>Тема</span></button>
    ${featureOn("featChapters")&&state.chapters.length?`<button class="secondary" data-action="bulk-chapter" ${n?"":"disabled"}>${icon("book")}<span>В главу</span></button>`:""}
    <button class="secondary danger" data-action="bulk-trash" ${n?"":"disabled"}>${icon("trash")}<span>В корзину</span></button>
    <button class="ghost" data-action="bulk-all">Все показанные</button><button class="ghost" data-action="bulk-done">Готово</button></div></div>`;
}
function trashMarkup(){
  const entries=trashedEntries().sort((a,b)=>new Date(b.deletedAt)-new Date(a.deletedAt));
  if(!entries.length)return emptyState("Корзина пуста","Удалённые записи остаются здесь, пока вы не решите восстановить их или удалить навсегда.","","trash");
  return `<p class="trash-note">Записи из корзины не показываются в дневнике, поиске, обзорах и воспоминаниях.</p><div>${entries.map(e=>{const t=entryText(e,180);return `<article class="trash-row"><time class="entry-date" datetime="${escapeHtml(e.deletedAt)}"><strong>${escapeHtml(relDay(e.deletedAt))}</strong><span>${escapeHtml(fmtTime(e.deletedAt))}</span></time><div><h3>${escapeHtml(t.title)}</h3>${t.rest?`<p class="entry-excerpt">${escapeHtml(t.rest)}</p>`:""}</div><div class="trash-actions"><button class="secondary" data-action="restore-trash" data-id="${escapeHtml(e.id)}">Восстановить</button><button class="ghost danger-quiet" data-action="purge-entry" data-id="${escapeHtml(e.id)}">Удалить навсегда</button></div></article>`;}).join("")}</div>
    <div class="section"><button class="secondary danger button-with-icon" data-action="purge-all">${icon("trash")}<span>Очистить корзину</span></button></div>`;
}
function calendarMarkup(){
  const ref=new Date(state.calendarCursor),year=ref.getFullYear(),month=ref.getMonth(),ws=state.prefs.weekStart;
  const first=new Date(year,month,1),last=new Date(year,month+1,0),todayStr=localDateKey(new Date());
  const monthEntries=applyFilters(activeEntries()).filter(e=>{const d=new Date(e.happenedAt);return d.getFullYear()===year&&d.getMonth()===month;});
  const byDay=new Map();monthEntries.forEach(e=>{const d=new Date(e.happenedAt).getDate();if(!byDay.has(d))byDay.set(d,[]);byDay.get(d).push(e);});
  const pad=(first.getDay()-ws+7)%7,cells=[];
  for(let i=0;i<pad;i++)cells.push(`<div class="day" aria-hidden="true"></div>`);
  const dayLabel=date=>new Intl.DateTimeFormat("ru-RU",{month:"long",day:"numeric"}).format(date);
  for(let d=1;d<=last.getDate();d++){
    const entries=byDay.get(d)||[],date=new Date(year,month,d),key=localDateKey(date),selected=state.calendarSelectedDate===key,today=key===todayStr;
    if(entries.length)cells.push(`<button class="day has-entry${selected?" is-selected":""}${today?" is-today":""}" data-action="calendar-day" data-date="${key}" aria-pressed="${selected}" aria-label="${dayLabel(date)}, ${entries.length} ${entryLabel(entries.length)}"><span>${d}</span><span class="density" aria-hidden="true">${Array.from({length:Math.min(entries.length,3)},()=>"<i></i>").join("")}</span></button>`);
    else cells.push(`<button class="day${selected?" is-selected":""}${today?" is-today":""}" data-action="calendar-day" data-date="${key}" aria-pressed="${selected}" aria-label="${dayLabel(date)}, записей нет"><span>${d}</span></button>`);
  }
  const selectedEntries=state.calendarSelectedDate?monthEntries.filter(e=>localDateKey(new Date(e.happenedAt))===state.calendarSelectedDate):[];
  const selDate=state.calendarSelectedDate?new Date(`${state.calendarSelectedDate}T12:00:00`):null;
  const heads=ws===1?["Пн","Вт","Ср","Чт","Пт","Сб","Вс"]:["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
  const sameMonthNow=year===new Date().getFullYear()&&month===new Date().getMonth();
  return `<div class="calendar"><div class="calendar-toolbar"><h2>${fmtMonthYear(ref)}</h2><div class="calendar-toolbar-actions">${sameMonthNow?"":`<button class="link-button" data-action="calendar-today">Сегодня</button>`}<button class="icon-button" data-action="calendar-prev" aria-label="Предыдущий месяц">${icon("chevron-left")}</button><button class="icon-button" data-action="calendar-next" aria-label="Следующий месяц">${icon("chevron-right")}</button></div></div>
    <div class="calendar-head" aria-hidden="true">${heads.map(x=>`<span>${x}</span>`).join("")}</div><div class="calendar-grid">${cells.join("")}</div>
    ${selDate?`<section class="calendar-selection"><div class="section-heading"><h2>${escapeHtml(capitalizeRu(fmtLong(selDate.toISOString())))}</h2><div class="link-group"><button class="link-button" data-action="new-entry-on-date" data-date="${state.calendarSelectedDate}">Добавить запись</button><button class="link-button" data-action="calendar-clear">Снять выбор</button></div></div>${selectedEntries.length?entryRows(selectedEntries):`<p class="subtle">В этот день записей нет.</p>`}</section>`:""}</div>`;
}
/* ----- chapters ----- */
const rangeText=c=>c.start?`${fmtDate(`${c.start}T12:00:00`,{year:"numeric"})} — ${c.end?fmtDate(`${c.end}T12:00:00`,{year:"numeric"}):"по сегодня"}`:"Без дат: записи назначаются вручную";
function chaptersMarkup(){
  const chapters=sortChapters(state.chapters),all=activeEntries();
  const loose=all.filter(e=>!chapterOf(e,state.chapters)).length;
  return `<div class="chapters"><div class="section-heading"><div><h2>Главы жизни</h2><p class="subtle text-small">Периоды с названием: «Переезд», «Новая работа», «Учёба». Запись попадает в главу по вашему выбору или по датам.</p></div><button class="secondary button-with-icon" data-action="chapter-new">${icon("plus")}<span>Новая глава</span></button></div>
    ${chapters.length?`<div class="chapter-list">${chapters.map(c=>{const n=chapterEntries(c,all,state.chapters).length;return `<article class="card chapter-card"><div><h3>${escapeHtml(c.name)}</h3><p class="subtle text-small">${escapeHtml(rangeText(c))}</p>${c.description?`<p>${escapeHtml(c.description)}</p>`:""}<p class="chapter-count">${n} ${entryLabel(n)}</p></div><div class="chapter-actions"><button class="secondary" data-action="chapter-open" data-id="${escapeHtml(c.id)}">Открыть записи</button><button class="ghost" data-action="chapter-edit" data-id="${escapeHtml(c.id)}">Изменить</button><button class="ghost danger-quiet" data-action="chapter-delete" data-id="${escapeHtml(c.id)}">Удалить</button></div></article>`;}).join("")}</div>${loose?`<p class="subtle text-small">Записей вне глав: ${loose}.</p>`:""}`
      :emptyState("Глав пока нет","Создайте первую главу — записи будут собираться по ней автоматически или вручную.",`<button class="secondary button-with-icon" data-action="chapter-new">${icon("plus")}<span>Новая глава</span></button>`,"book")}</div>`;
}
function chapterForm(existing){
  ctx.formDialog({title:existing?"Изменить главу":"Новая глава",iconName:"book",confirmLabel:existing?"Сохранить":"Создать",
    fields:[{id:"name",label:"Название",value:existing?.name||"",placeholder:"Например, Переезд",max:80},{id:"start",label:"Начало (необязательно)",type:"date",value:existing?.start||""},{id:"end",label:"Конец (пусто — идёт сейчас)",type:"date",value:existing?.end||""},{id:"description",label:"Коротко о главе",type:"textarea",value:existing?.description||"",max:600}]},
    async v=>{
      const name=v.name.trim();if(!name)return "Дайте главе название.";
      if(v.start&&v.end&&v.end<v.start)return "Конец главы не может быть раньше начала.";
      const rec={id:existing?.id||uid(),name,start:v.start||"",end:v.end||"",description:v.description.trim(),sort:existing?.sort??state.chapters.length};
      await store.saveChapter(rec);await store.loadData();ctx.render();ctx.toast(existing?"Глава обновлена.":"Глава создана.");
    });
}
/* ----- bulk ----- */
async function bulkUpdate(ids,patch,source){
  for(const id of ids){
    const e=state.entries.find(x=>x.id===id);if(!e)continue;
    const next={...e,...patch(e),updatedAt:nowIso(),revision:nextRevision(e.revision)};
    await store.commitEntrySnapshot(next,source);
  }
  await store.loadData();store.notifyChange("entry");
}
const selected=()=>[...state.journalSelected].filter(id=>state.entries.some(e=>e.id===id));

export function journalView(){
  const trashCount=trashedEntries().length;
  const items=[["timeline","Лента"],["calendar","Календарь"]];
  if(featureOn("featChapters"))items.push(["chapters","Главы"]);
  items.push(["trash",`Корзина${trashCount?` · ${trashCount}`:""}`]);
  if(!items.some(i=>i[0]===state.journalView))state.journalView="timeline";
  const v=state.journalView,filtered=v==="timeline"?applyFilters(activeEntries()):null;
  const content=v==="calendar"?calendarMarkup():v==="trash"?trashMarkup():v==="chapters"?chaptersMarkup():timelineMarkup(filtered);
  const showTools=v==="timeline"||v==="calendar";
  const summary=v==="timeline"&&filtersActive()?`<p class="filter-summary" role="status">Найдено: ${filtered.length} из ${activeEntries().length}</p>`:"";
  return `${pageHeader("Ваша история","Дневник","Хронология без оценок и давления.")}
  <div class="journal-controls">${tabs("journal",items,v,{label:"Вид дневника"})}
    <div class="journal-tools">${v==="timeline"?`<button class="secondary button-with-icon" data-action="bulk-toggle" aria-pressed="${state.journalSelect}">${icon("check")}<span>${state.journalSelect?"Выбор включён":"Выбрать"}</span></button>`:""}<button class="secondary button-with-icon" data-action="export">${icon("backup")}<span>Резервная копия</span></button></div></div>
  ${showTools?filtersMarkup():""}${summary}${v==="timeline"?bulkBar():""}<div id="panel-journal" role="tabpanel" aria-labelledby="tab-journal-${v}">${content}</div>`;
}
export const views={journal:journalView};
export const actions={
  "calendar-prev":()=>{state.calendarCursor=ctx.shiftMonth(state.calendarCursor,-1);state.calendarSelectedDate=null;ctx.render();},
  "calendar-next":()=>{state.calendarCursor=ctx.shiftMonth(state.calendarCursor,1);state.calendarSelectedDate=null;ctx.render();},
  "calendar-today":()=>{const n=new Date();state.calendarCursor=new Date(n.getFullYear(),n.getMonth(),1);state.calendarSelectedDate=localDateKey(n);ctx.render();},
  "calendar-day":el=>{state.calendarSelectedDate=state.calendarSelectedDate===el.dataset.date?null:el.dataset.date;ctx.render();},
  "calendar-clear":()=>{state.calendarSelectedDate=null;ctx.render();},
  "go-date":()=>ctx.overlay(`${modalHeader("Перейти к дате","Откроем календарь дневника на выбранном дне.","calendar")}<div class="modal-body"><label class="field"><span class="label">Дата</span><input id="jump-date-input" type="date" data-datepicker value="${localDateKey(new Date())}"></label></div><footer class="modal-footer"><button class="secondary" data-action="close-overlay">Отмена</button><button class="primary button-with-icon" data-action="confirm-date-jump">${icon("calendar")}<span>Открыть календарь</span></button></footer>`,"sheet","Переход к дате"),
  "confirm-date-jump":()=>{
    const value=$("#jump-date-input")?.value;if(!value)return;
    const [y,m]=value.split("-").map(Number);
    state.calendarCursor=new Date(y,m-1,1);state.calendarSelectedDate=value;state.journalView="calendar";
    ctx.closeOverlay();ctx.routeTo("journal");
  },
  "open-trash":()=>{state.journalView="trash";ctx.routeTo("journal");},
  "journal-more":()=>{state.journalLimit+=state.prefs.journalPage;ctx.render();},
  "journal-filters-reset":()=>{state.journalFilters={};state.journalLimit=state.prefs.journalPage;ctx.render();},
  "purge-entry":el=>{
    const id=el.dataset.id;
    ctx.confirmDialog({title:"Удалить навсегда?",text:"Запись, вся её история версий и вложения будут стёрты без возможности восстановления.",confirmLabel:"Удалить навсегда",danger:true,iconName:"trash"},async()=>{
      try{await store.purgeEntries([id]);await store.loadData();ctx.render();ctx.toast("Запись удалена навсегда.");}catch(error){console.error(error);ctx.toast("Не удалось удалить запись.");}
    });
  },
  "purge-all":()=>{
    const ids=trashedEntries().map(e=>e.id);if(!ids.length)return;
    ctx.confirmDialog({title:"Очистить корзину?",text:`Будет удалено записей: ${ids.length}. Вместе с историей версий и вложениями — без возможности восстановления.`,confirmLabel:"Очистить корзину",danger:true,iconName:"trash"},async()=>{
      try{await store.purgeEntries(ids);await store.loadData();ctx.render();ctx.toast("Корзина очищена.");}catch(error){console.error(error);ctx.toast("Не удалось очистить корзину.");}
    });
  },
  "bulk-toggle":()=>{state.journalSelect=!state.journalSelect;state.journalSelected=new Set();ctx.render();},
  "bulk-done":()=>{state.journalSelect=false;state.journalSelected=new Set();ctx.render();},
  "bulk-all":()=>{const shown=applyFilters(activeEntries()).slice(0,state.journalLimit);state.journalSelected=new Set(shown.map(e=>e.id));ctx.render();},
  "bulk-export":()=>{
    const list=selected().map(id=>state.entries.find(e=>e.id===id)).sort((a,b)=>new Date(a.happenedAt)-new Date(b.happenedAt));
    downloadBlob(list.map(e=>entryToMarkdown(e)).join("\n---\n\n"),"text/markdown;charset=utf-8",`narra-selected-${isoStamp()}.md`);
    ctx.toast(`Выгружено записей: ${list.length}. Файл не зашифрован.`);
  },
  "bulk-theme":()=>ctx.formDialog({title:"Добавить тему",text:`Тема добавится к выбранным записям (${selected().length}).`,iconName:"tag",confirmLabel:"Добавить",fields:[{id:"theme",label:"Тема",placeholder:"Например, поездка",max:40}]},async v=>{
    const t=v.theme.trim().replace(/^#/,"").toLocaleLowerCase("ru-RU");if(!t)return "Введите тему.";
    await bulkUpdate(selected(),e=>({themes:[...new Set([...(e.themes||[]),t])].slice(0,24)}),"bulk_theme");
    state.journalSelected=new Set();ctx.render();ctx.toast("Тема добавлена.");
  }),
  "bulk-chapter":()=>ctx.formDialog({title:"Переместить в главу",text:`Записей: ${selected().length}.`,iconName:"book",confirmLabel:"Переместить",fields:[{id:"chapter",label:"Глава",type:"select",options:sortChapters(state.chapters).map(c=>[c.id,c.name]),value:sortChapters(state.chapters)[0]?.id}]},async v=>{
    const c=state.chapters.find(x=>x.id===v.chapter);if(!c)return "Выберите главу.";
    await bulkUpdate(selected(),()=>({chapterId:c.id}),"bulk_chapter");state.journalSelected=new Set();ctx.render();ctx.toast(`Записи перемещены в главу «${c.name}».`);
  }),
  "bulk-trash":()=>{
    const ids=selected();if(!ids.length)return;
    ctx.confirmDialog({title:"Переместить в корзину?",text:`Записей: ${ids.length}. Их можно будет восстановить из корзины.`,confirmLabel:"В корзину",danger:true,iconName:"trash"},async()=>{
      await bulkUpdate(ids,()=>({deletedAt:nowIso()}),"bulk_trash");state.journalSelected=new Set();state.journalSelect=false;ctx.render();ctx.toast(`В корзине: ${ids.length}.`);
    });
  },
  "chapter-new":()=>chapterForm(null),
  "chapter-edit":el=>chapterForm(state.chapters.find(c=>c.id===el.dataset.id)),
  "chapter-open":el=>{state.journalFilters={chapter:el.dataset.id};state.journalView="timeline";state.journalLimit=state.prefs.journalPage;ctx.render();},
  "chapter-delete":el=>{
    const c=state.chapters.find(x=>x.id===el.dataset.id);if(!c)return;
    ctx.confirmDialog({title:`Удалить главу «${c.name}»?`,text:"Записи останутся в дневнике, они просто перестанут быть привязаны к этой главе.",confirmLabel:"Удалить главу",danger:true,iconName:"trash"},async()=>{
      await store.deleteChapter(c.id);await store.loadData();ctx.render();ctx.toast("Глава удалена. Записи не тронуты.");
    });
  },
};
export const on={
  change:e=>{
    const t=e.target,f=F();
    const map={"jf-from":"from","jf-to":"to","jf-kind":"kind","jf-chapter":"chapter","jf-emotion":"emotion"};
    if(map[t.id]){f[map[t.id]]=t.value;state.journalLimit=state.prefs.journalPage;ctx.render();return true;}
    if(t.id==="jf-media"||t.id==="jf-favorite"){f[t.id==="jf-media"?"media":"favorite"]=t.checked;state.journalLimit=state.prefs.journalPage;ctx.render();return true;}
    if(t.dataset?.selectEntry){if(t.checked)state.journalSelected.add(t.dataset.selectEntry);else state.journalSelected.delete(t.dataset.selectEntry);ctx.render();return true;}
    return false;
  },
  input:e=>{
    const map={"jf-person":"person","jf-place":"place","jf-theme":"theme"},t=e.target;
    if(map[t.id]){F()[map[t.id]]=t.value;clearTimeout(state.jfTimer);state.jfTimer=setTimeout(()=>{const pos=t.selectionStart;ctx.render();const n=$("#"+t.id);if(n){n.focus();n.setSelectionRange(pos,pos);}},260);return true;}
    return false;
  },
};
export {entryRow,checkinLabel,plural,mediaOf,kindLabels};
