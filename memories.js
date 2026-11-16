/* Memories: a few explainable selections from the user's own entries. Nothing is invented and there is no endless feed.
   Every card says why it is shown; entries, people, places and themes can be muted. */
import {fmtDate,localDateKey,state,ctx,$,escapeHtml,icon,relDay,dayOffset,activeEntries,todayKey,safeStorageGet,safeStorageSet,featureOn,yearsLabel,pluralRu,kindLabels} from "./core.js?v=4.7.0";
import {relatedEntryScore,circularMonthDayDistance} from "./domain.mjs?v=4.7.0";
import {entryText,excerpt,openChecklistItems} from "./text.mjs?v=4.7.0";
import {pageHeader,emptyState,tabs,modalHeader} from "./kit.js?v=4.7.0";
import {entryRow,entryRows} from "./entries-ui.js?v=4.7.0";
import {entitiesOf,chapterOf,chapterEntries,sortChapters} from "./entities.mjs?v=4.7.0";
import {aliasMap,semanticIndex,hasMutedTopic,entityMap} from "./derived.js?v=4.7.0";
import {similar,whyRelated} from "./semantic.mjs?v=4.7.0";
import {dayKey} from "./stats.mjs?v=4.7.0";
import {keySentences,intentions,quietPeople} from "./intel.mjs?v=4.7.0";
import {stemRu} from "./domain.mjs?v=4.7.0";
import * as store from "./store.js?v=4.7.0";

export function memoryCandidates(){
  const muted=new Set(state.mutedMemoryIds);
  return activeEntries().filter(e=>!e.sensitive&&e.body?.trim()&&!muted.has(e.id)&&!hasMutedTopic(e));
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
  if((state.quotes||[]).length)items.push(["quotes","Цитаты"]);
  if(intentionsList().length)items.push(["intentions","Намерения"]);
  if(quietList().length)items.push(["people","Давно не писали"]);
  if(state.entries.some(e=>!e.deletedAt&&e.openOn))items.push(["capsules","Письма в будущее"]);
  if(featureOn("featSemantic"))items.push(["near","По близости слов"]);
  if(!items.some(i=>i[0]===state.memoriesMode))state.memoriesMode="day";
  return tabs("memories",items,state.memoriesMode,{label:"Виды воспоминаний"});
}
/* Intentions once written down («хочу…», «собираюсь…») from 2 weeks to a year ago — offered back, never as a to-do list. */
const intentDismissed=()=>{try{return new Set(JSON.parse(safeStorageGet("narra-intent-dismissed")||"[]"));}catch{return new Set();}};
const intentionsList=()=>intentions(memoryCandidates(),{dismissed:intentDismissed()});
const quietList=()=>quietPeople([...entityMap().values()].filter(r=>!state.mutedTopics.includes(r.key)));
function intentionsPanel(){
  const list=intentionsList();
  if(!list.length)return emptyState("Намерений не нашлось","Здесь появляются фразы вроде «хочу…» или «собираюсь…» из записей двухнедельной давности и старше.","","memories");
  return section("Вы собирались","Фразы о намерениях из ваших записей. Это не список дел: может, всё уже сделано, а может, передумалось — и это тоже ответ.",`<div class="quote-list">${list.map(x=>`<figure class="card quote-card"><blockquote>${escapeHtml(x.text)}</blockquote><figcaption><button class="link-button" data-action="open-entry" data-id="${escapeHtml(x.entry.id)}">${escapeHtml(entryText(x.entry).title)}</button><span class="subtle">${x.days} ${pluralRu(x.days,"день","дня","дней")} назад</span><span class="intent-actions"><button class="ghost" data-action="intent-write" data-id="${escapeHtml(x.entry.id)}">Написать, как вышло</button><button class="icon-button icon-button-quiet" data-action="intent-dismiss" data-key="${escapeHtml(x.key)}" aria-label="Больше не показывать">${icon("x")}</button></span></figcaption></figure>`).join("")}</div>`);
}
function peoplePanel(){
  const list=quietList();
  if(!list.length)return emptyState("Все на виду","Здесь появляются люди, о которых вы писали часто, но давно — больше двух месяцев.","","memories");
  return section("Давно не писали о…","Люди, которых вы упоминали много раз, но не в последние два месяца. Просто напоминание — без выводов.",`<div class="entity-quiet-list">${list.map(r=>`<div class="card quiet-row"><span><strong>${escapeHtml(r.name)}</strong><small>${r.count} ${pluralRu(r.count,"запись","записи","записей")} · последний раз ${escapeHtml(fmtDate(r.last,{year:"numeric"}))}</small></span><span class="quiet-actions"><button class="ghost" data-action="lifemap-open" data-key="${escapeHtml(r.key)}">Все записи</button><button class="secondary" data-action="quiet-write" data-name="${escapeHtml(r.name)}">Написать</button></span></div>`).join("")}</div>`);
}
function quotesPanel(){
  const live=new Map(activeEntries().map(e=>[e.id,e]));
  const list=[...(state.quotes||[])].filter(q=>live.has(q.entryId)).reverse();
  if(!list.length)return emptyState("Цитат пока нет","Выделите фрагмент при чтении записи и выберите «…» → «Сохранить цитату».","","memories");
  return section("Ваши цитаты","Фрагменты, которые вы сохранили из своих записей.",`<div class="quote-list">${list.map(q=>{const e=live.get(q.entryId);return `<figure class="card quote-card"><blockquote>${escapeHtml(q.text)}</blockquote><figcaption><button class="link-button" data-action="open-entry" data-id="${escapeHtml(e.id)}">${escapeHtml(entryText(e).title)}</button><span class="subtle">${escapeHtml(relDay(e.happenedAt))}</span><button class="icon-button icon-button-quiet" data-action="quote-delete" data-id="${escapeHtml(q.id)}" aria-label="Удалить цитату">${icon("x")}</button></figcaption></figure>`;}).join("")}</div>`);
}
function capsulesPanel(){
  const t=todayKey(),all=state.entries.filter(e=>!e.deletedAt&&e.openOn).sort((a,b)=>a.openOn.localeCompare(b.openOn));
  const sealed=all.filter(e=>e.openOn>t),opened=all.filter(e=>e.openOn<=t).reverse();
  const when=k=>new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric"}).format(new Date(`${k}T12:00:00`));
  const env=e=>`<button type="button" class="card capsule-row" data-action="open-entry" data-id="${escapeHtml(e.id)}"><span class="capsule-envelope" aria-hidden="true">${icon("mail")}</span><span><strong>Откроется ${escapeHtml(when(e.openOn))}</strong><small>Написано ${escapeHtml(relDay(e.createdAt||e.happenedAt))}</small></span></button>`;
  return (sealed.length?section("Ждут своего дня","Текст скрыт до даты открытия.",`<div class="capsule-list">${sealed.map(env).join("")}</div>`):"")
    +(opened.length?section("Уже открылись","",entryRows(opened.slice(0,12),null,{reason:"Письмо в будущее"})):"");
}
function panel(pool){
  const mode=state.memoriesMode;
  if(mode==="quotes")return quotesPanel();
  if(mode==="intentions")return intentionsPanel();
  if(mode==="people")return peoplePanel();
  if(mode==="capsules")return capsulesPanel();
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
  if(!pool.length&&!(state.quotes||[]).length&&!state.entries.some(e=>!e.deletedAt&&e.openOn))return `${head}${emptyState("Пока нечего возвращать","Пишите в своём ритме — Narra не будет создавать искусственные воспоминания.","","memories")}`;
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
/* «The week in your own words»: the most central sentences of a period (TextRank), quoted as written, each with its entry.
   Only on request — nothing is summarised behind the person's back. */
export function showKeySentences({from=null,to=null,label="За последние 7 дней"}={}){
  const t=todayKey(),f=from||localDateKey(new Date(Date.now()-6*86400000)),e=to||t;
  const list=activeEntries().filter(x=>{const k=localDateKey(new Date(x.happenedAt));return k>=f&&k<=e&&!x.sensitive;});
  const picks=keySentences(list,{limit:3,stem:stemRu});
  ctx.sheetDialog(`${modalHeader("Своими словами",label,"quote","close-dialog")}<div class="modal-body key-sentences">${picks.length?`<p class="subtle text-small">Три самые «центральные» фразы из ваших записей за период — те, что больше всего перекликаются с остальными. Ни одно слово не изменено. Личные записи не используются.</p>${picks.map(p=>`<figure class="quote-card card"><blockquote>${escapeHtml(p.text)}</blockquote><figcaption><button class="link-button" data-action="open-entry" data-id="${escapeHtml(p.entry.id)}">${escapeHtml(entryText(p.entry).title)}</button><span class="subtle">${escapeHtml(relDay(p.entry.happenedAt))}</span></figcaption></figure>`).join("")}`:`<p>За этот период ${list.length?"предложений слишком мало":"записей нет"}, чтобы что-то выбрать.</p>`}</div>`,"Своими словами");
}
export const actions={
  "intent-dismiss":el=>{const s=intentDismissed();s.add(el.dataset.key);safeStorageSet("narra-intent-dismissed",JSON.stringify([...s].slice(-500)));ctx.render();},
  "intent-write":async el=>{const src=state.entries.find(e=>e.id===el.dataset.id);if(!src)return;await ctx.openEditor(null,{body:"",edit:true});if(state.editing){state.editing.links=[{to:src.id,type:"continuation"}];ctx.markEditorDirty?.("intent");}ctx.toast("Новая запись связана с той, где было намерение.");},
  "quiet-write":async el=>{const name=el.dataset.name;await ctx.openEditor(null,{body:"",people:[name],edit:true});},
  "key-sentences":el=>showKeySentences(el?.dataset?.from?{from:el.dataset.from,to:el.dataset.to,label:el.dataset.label}:{}),
  "quote-delete":async el=>{try{await store.saveQuotes((state.quotes||[]).filter(q=>q.id!==el.dataset.id));ctx.render();ctx.toast("Цитата удалена.");}catch(error){console.error(error);ctx.toast("Не удалось удалить цитату.");}},
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
