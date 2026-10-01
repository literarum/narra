/* Memories: a few explainable selections from the user's own entries. Nothing is invented and there is no endless feed.
   Every card says why it is shown; entries, people, places and themes can be muted. */
import {state,ctx,$,escapeHtml,icon,relDay,dayOffset,activeEntries,todayKey,safeStorageGet,safeStorageSet,featureOn,yearsLabel,pluralRu,kindLabels} from "./core.js?v=4.6.0";
import {relatedEntryScore,circularMonthDayDistance} from "./domain.mjs?v=4.6.0";
import {entryText,excerpt,openChecklistItems} from "./text.mjs?v=4.6.0";
import {pageHeader,emptyState,tabs,modalHeader} from "./kit.js?v=4.6.0";
import {entryRow,entryRows} from "./entries-ui.js?v=4.6.0";
import {entitiesOf,chapterOf,chapterEntries,sortChapters} from "./entities.mjs?v=4.6.0";
import {aliasMap,semanticIndex,hasMutedTopic,entityMap} from "./derived.js?v=4.6.0";
import {similar,whyRelated} from "./semantic.mjs?v=4.6.0";
import {dayKey} from "./stats.mjs?v=4.6.0";
import * as store from "./store.js?v=4.6.0";

export function memoryCandidates(){
  return activeEntries().filter(e=>!e.sensitive&&e.body?.trim()&&!state.mutedMemoryIds.includes(e.id)&&!hasMutedTopic(e));
}
export function relatedEntriesFor(source,limit=3){
  if(!source)return [];
  return memoryCandidates().filter(e=>e.id!==source.id).map(entry=>({entry,...relatedEntryScore(source,entry)})).filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score||new Date(b.entry.happenedAt)-new Date(a.entry.happenedAt)).slice(0,limit);
}
const today=()=>new Date();
export function onThisDay(pool){
  const t=today(),other=pool.filter(e=>new Date(e.happenedAt).getFullYear()!==t.getFullYear());
  const exact=other.filter(e=>circularMonthDayDistance(e.happenedAt,t)===0);
  const seen=new Set(exact.map(e=>e.id));
  const near=other.filter(e=>!seen.has(e.id)&&circularMonthDayDistance(e.happenedAt,t)<=14).sort((a,b)=>circularMonthDayDistance(a.happenedAt,t)-circularMonthDayDistance(b.happenedAt,t));
  return {exact,near};
}
/** Entries that were left open: never finished, an unchecked list, a decision whose date to look back has come. */
export function openThreads(pool,{minAgeDays=21}={}){
  const t=todayKey(),out=[];
  for(const e of pool){
    const age=dayOffset(e.happenedAt);
    if(age<minAgeDays)continue;
    if(e.decision&&e.decision.revisitOn&&e.decision.revisitOn<=t&&!e.decision.outcome)out.push({entry:e,reason:"Вы хотели вернуться к этому решению и записать, что получилось",weight:3});
    else if(!e.completedAt)out.push({entry:e,reason:"Запись осталась незавершённой",weight:2});
    else if(openChecklistItems(e.body)>0)out.push({entry:e,reason:`В записи остались незакрытые пункты: ${openChecklistItems(e.body)}`,weight:1});
  }
  return out.sort((a,b)=>b.weight-a.weight||new Date(a.entry.happenedAt)-new Date(b.entry.happenedAt));
}
export function chapterMemory(pool){
  if(!featureOn("featChapters"))return null;
  const chapters=sortChapters(state.chapters).filter(c=>chapterEntries(c,pool,state.chapters).length>=2);
  if(!chapters.length)return null;
  const dayNo=Math.floor((today()-new Date(today().getFullYear(),0,0))/86400000);
  const chapter=chapters[dayNo%chapters.length],list=chapterEntries(chapter,pool,state.chapters);
  const picks=[list[0],list.find(e=>e.favorite)||list[Math.floor(list.length/2)],list[list.length-1]].filter((e,i,a)=>e&&a.indexOf(e)===i);
  return {chapter,entries:picks,total:list.length};
}
/** Deterministic pick for the today screen: same date in an earlier year → within two weeks → a stable older entry. */
export function pickMemory(){
  const pool=memoryCandidates(),{exact,near}=onThisDay(pool);
  if(exact.length)return {entry:exact[0],why:"В этот день"};
  if(near.length)return {entry:near[0],why:"Примерно в это время"};
  const old=pool.filter(e=>dayOffset(e.happenedAt)>=30);
  if(old.length>=2){const day=Math.floor((today()-new Date(today().getFullYear(),0,0))/86400000);return {entry:old[day%old.length],why:"Из вашего дневника"};}
  return null;
}
export function memoryAgo(iso){
  const off=dayOffset(iso);
  if(off>=365){const y=Math.floor(off/365);return `${y} ${yearsLabel(y)} назад`;}
  if(off>=30){const m=Math.floor(off/30);return `${m} ${pluralRu(m,"месяц","месяца","месяцев")} назад`;}
  return relDay(iso);
}
export function memoryCard(){
  if(safeStorageGet("narra-memory-dismissed")===todayKey())return "";
  const pick=pickMemory();if(!pick)return "";
  const e=pick.entry,t=entryText(e,200);
  return `<section class="section" id="memory-section"><div class="section-heading"><h2>Воспоминание</h2><div class="link-group"><button class="link-button" data-route="memories">Все воспоминания</button></div></div>
    <article class="card memory-card"><div><p class="eyebrow">${escapeHtml(pick.why)} · ${escapeHtml(memoryAgo(e.happenedAt))}</p><blockquote>«${escapeHtml(e.title?.trim()?t.title:excerpt(e.body,180))}»</blockquote>${e.title?.trim()&&t.rest?`<p class="subtle text-small">${escapeHtml(excerpt(e.body,150))}</p>`:""}<div class="link-group memory-actions"><button class="link-button" data-action="dismiss-memory">Не сейчас</button><button class="link-button" data-action="mute-memory" data-id="${escapeHtml(e.id)}">Больше не показывать</button></div></div><button class="icon-button" data-action="open-entry" data-id="${escapeHtml(e.id)}" aria-label="Открыть воспоминание">${icon("arrow-right")}</button></article></section>`;
}

const section=(title,subtitle,inner)=>inner?`<section class="section"><div class="section-heading"><div><h2>${title}</h2><p class="subtle text-small">${subtitle}</p></div></div>${inner}</section>`:"";
function modeTabs(){
  const items=[["day","В этот день"],["old","Давние мысли"]];
  if(featureOn("featChapters"))items.push(["chapter","Главы"]);
  items.push(["related","Перекликается"]);
  if(featureOn("featSemantic"))items.push(["near","По близости слов"]);
  if(!items.some(i=>i[0]===state.memoriesMode))state.memoriesMode="day";
  return tabs("memories",items,state.memoriesMode,{label:"Виды воспоминаний"});
}
function panel(pool){
  const mode=state.memoriesMode;
  if(mode==="day"){
    const {exact,near}=onThisDay(pool);
    return section("В этот день","Та же дата в прошлые годы.",exact.length?entryRows(exact.slice(0,4),null,{reason:"Та же дата в другой год"}):"")
      +section("Примерно в это время","Записи в пределах двух недель от этой даты в другие годы.",near.length?entryRows(near.slice(0,4)):"")
      ||emptyState("Пока нечего вспоминать","Подборки появятся, когда в дневнике накопятся записи за разные годы.","","memories");
  }
  if(mode==="old"){
    const threads=openThreads(pool).slice(0,6);
    return threads.length?section("Давние мысли, которые остались открытыми","Записи старше трёх недель: без завершения, с незакрытыми пунктами или с решением, к которому вы хотели вернуться.",
      `<div class="entry-list">${threads.map(t=>entryRow(t.entry,{reason:t.reason})).join("")}</div>`)
      :emptyState("Открытых нитей нет","Здесь появляются старые записи, к которым вы, возможно, захотите вернуться.","","memories");
  }
  if(mode==="chapter"){
    const cm=chapterMemory(pool);
    return cm?section(`Из главы «${escapeHtml(cm.chapter.name)}»`,`Три записи из ${cm.total}. Глава выбирается по дню и не повторяется бесконечно.`,entryRows(cm.entries))
      :emptyState("Пока нет глав с записями","Создайте главу жизни в разделе «Дневник» и отнесите к ней хотя бы две записи.","","memories");
  }
  if(mode==="near"){
    const source=pool[0];if(!source)return emptyState("Пока нечего сравнивать","Нужна хотя бы одна запись.","","memories");
    const q=`${source.title||""} ${excerpt(source.body,400)}`;
    const found=similar(semanticIndex(),q,{limit:8}).filter(s=>s.id!==source.id).map(s=>({e:pool.find(x=>x.id===s.id),s})).filter(x=>x.e).slice(0,4);
    return found.length?section("Похоже по словам","Записи с близкими по смыслу словами (по словарю, а не нейросети).",`<div class="entry-list">${found.map(x=>entryRow(x.e,{reason:whyRelated(x.e,x.s.shared,q)[0]||"Близкие по смыслу слова"})).join("")}</div>`):emptyState("Ничего похожего","Пока в дневнике нет записей, близких по словам к последней.","","memories");
  }
  const source=pool[0],related=relatedEntriesFor(source,4);
  return related.length?section("Связанная нить",`Что перекликается с вашей последней записью «${escapeHtml(entryText(source).title)}» — по общим темам и словам. Это не вывод о вас.`,`<div class="entry-list">${related.map(x=>entryRow(x.entry,{reason:`Общее: ${x.sharedTerms.join(", ")}`})).join("")}</div>`)
    :emptyState("Пока нечего сопоставлять","Связи появятся, когда у записей будут общие темы или слова.","","memories");
}
export function memoriesView(){
  const pool=memoryCandidates();
  const head=pageHeader("Бережное возвращение","Воспоминания","Никакой бесконечной ленты: несколько объяснимых подборок.");
  if(!pool.length)return `${head}${emptyState("Пока нечего возвращать","Пишите в своём ритме — Narra не будет создавать искусственные воспоминания.","","memories")}`;
  return `${head}${modeTabs()}<div id="panel-memories" role="tabpanel" aria-labelledby="tab-memories-${state.memoriesMode}">${panel(pool)}</div>`;
}

function muteSheet(id){
  const e=state.entries.find(x=>x.id===id);if(!e)return;
  const ents=entitiesOf(e,aliasMap()).filter(x=>x.type!=="place"||true);
  const label={person:"человека",place:"место",theme:"тему",project:"проект"};
  return `${modalHeader("Больше не показывать","Что скрыть из воспоминаний? Сами записи останутся в дневнике.","memories","close-dialog")}<div class="modal-body more-menu">
    <button class="more-menu-item" data-action="mute-entry" data-id="${escapeHtml(id)}">${icon("eye")}<span><strong>Только эту запись</strong></span>${icon("chevron-right")}</button>
    ${ents.map(x=>`<button class="more-menu-item" data-action="mute-topic" data-key="${escapeHtml(x.key)}">${icon("eye")}<span><strong>Всё, где ${label[x.type]} «${escapeHtml(x.name)}»</strong><small>Скрыть записи с этим упоминанием</small></span>${icon("chevron-right")}</button>`).join("")}</div>`;
}
export const views={memories:memoriesView};
export const actions={
  "dismiss-memory":el=>{safeStorageSet("narra-memory-dismissed",todayKey());const s=el.closest(".section");if(s)ctx.collapseAndRemove(s);},
  "mute-memory":el=>ctx.sheetDialog(muteSheet(el.dataset.id),"Скрыть воспоминание"),
  "mute-entry":async el=>{
    try{if(!state.mutedMemoryIds.includes(el.dataset.id))state.mutedMemoryIds.push(el.dataset.id);await store.metaSet("muted-memory-ids",state.mutedMemoryIds);ctx.closeDialog({restoreFocus:false});ctx.render();ctx.toast("Эта запись больше не появится среди воспоминаний.");}
    catch(error){console.error(error);ctx.toast("Не удалось сохранить настройку.");}
  },
  "mute-topic":async el=>{
    try{await store.saveMutedTopics([...state.mutedTopics,el.dataset.key]);ctx.closeDialog({restoreFocus:false});ctx.render();ctx.toast("Эта тема скрыта из воспоминаний. Вернуть её можно в настройках.");}
    catch(error){console.error(error);ctx.toast("Не удалось сохранить настройку.");}
  },
  "unmute-memories":async()=>{
    try{state.mutedMemoryIds=[];await store.metaSet("muted-memory-ids",[]);await store.saveMutedTopics([]);ctx.render();ctx.toast("Скрытые воспоминания снова доступны.");}
    catch(error){console.error(error);ctx.toast("Не удалось сохранить настройку.");}
  },
  "random-memory":()=>{
    const c=memoryCandidates();
    if(!c.length){ctx.closeOverlay();ctx.toast("Пока нет подходящих записей для воспоминаний.");return;}
    const b=new Uint32Array(1);crypto.getRandomValues(b);ctx.openEditor(c[b[0]%c.length].id);
  },
};
export {dayKey,entityMap,kindLabels};
