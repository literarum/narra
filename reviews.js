/* Reviews («Обзоры»): week, month, quarter, year.
   The draft is assembled from the person's own entries and check-ins — no model writes anything. Every factual line can show its sources
   and can be hidden; the person's own words live in separate fields, so rebuilding a draft never destroys them.
   The yearly review can be printed as a small book. */
import {state,ctx,$,$$,escapeHtml,icon,uid,nowIso,downloadBlob,isoStamp,localDateKey,entryLabel,fmtDate,featureOn} from "./core.js?v=4.3.0";
import {pageHeader,emptyState,tabs} from "./kit.js?v=4.3.0";
import {PERIOD_KINDS,periodRange,shiftPeriod,buildReview,SECTION_TITLES,SECTION_ORDER,reviewToMarkdown,buildBook} from "./review.mjs?v=4.3.0";
import {entryText,plural} from "./text.mjs?v=4.3.0";
import {renderMarkdown} from "./md.mjs?v=4.3.0";
import {capitalizeRu} from "./domain.mjs?v=4.3.0";
import {dayKey} from "./stats.mjs?v=4.3.0";
import {reviewSheetHtml as sheetHtml,bookSheetHtml as bookPrint} from "./print.mjs?v=4.3.0";
import {aliasMap} from "./derived.js?v=4.3.0";
import * as store from "./store.js?v=4.3.0";
import * as media from "./media.js?v=4.3.0";

let showHidden=false,saveTimer=null,saveState="idle";
const range=()=>periodRange(state.reviewKind,state.reviewCursor);
const savedFor=id=>state.reviews.find(r=>r.id===id)||{id,sections:{},hidden:[],updatedAt:nowIso()};
const build=r=>buildReview({range:r,entries:state.entries,checkins:state.checkins,config:state.config,chapters:state.chapters,notes:state.entityNotes,now:new Date()});
const canNext=r=>r.to<localDateKey(new Date());

const HELP={
  happened:"Записи периода в порядке времени.",entities:"Кого, где и что вы упоминали чаще всего.",states:"Что говорят ваши отметки. Это описание, а не оценка.",
  moments:"Избранное или самые подробные записи.",loops:"Незавершённые записи, незакрытые пункты и решения, к которым пора вернуться.",
  surprised:"Что вас удивило? Напишите своими словами — это пространство только ваше.",questions:"Вопросы для следующего периода. Выберите те, что откликаются."
};
function sourcesMarkup(f){
  if(f.sourceIds?.length){
    const list=f.sourceIds.map(id=>state.entries.find(e=>e.id===id)).filter(e=>e&&!e.deletedAt);
    if(!list.length)return "";
    return `<details class="fact-sources"><summary>Откуда это</summary><ul>${list.slice(0,20).map(e=>`<li><button class="link-button" data-action="open-entry" data-id="${escapeHtml(e.id)}">${escapeHtml(entryText(e,80).title)}</button> <small>${escapeHtml(fmtDate(e.happenedAt,{year:"numeric"}))}</small></li>`).join("")}${list.length>20?`<li class="subtle">И ещё ${list.length-20}.</li>`:""}</ul></details>`;
  }
  if(f.days?.length)return `<details class="fact-sources"><summary>Откуда это</summary><p class="subtle text-small">Отметки за ${f.days.length} ${plural.day(f.days.length)}: с ${escapeHtml(fmtDate(`${f.days[0]}T12:00:00`,{year:"numeric"}))} по ${escapeHtml(fmtDate(`${f.days[f.days.length-1]}T12:00:00`,{year:"numeric"}))}.</p></details>`;
  return "";
}
function sectionMarkup(key,review,saved){
  const facts=review.sections[key]||[],hidden=new Set(saved.hidden||[]);
  const visible=facts.filter(f=>!hidden.has(f.id)),gone=facts.filter(f=>hidden.has(f.id));
  const own=saved.sections?.[key]||"";
  const note=key==="states"?(review.statesNote?`<p class="subtle text-small">${escapeHtml(review.statesNote)}</p>`:review.statesThin?`<p class="subtle text-small">Отметок пока мало, чтобы описывать состояние: нужно хотя бы 10 за период.</p>`:""):"";
  const list=(showHidden?facts:visible).map(f=>{
    const h=hidden.has(f.id);
    return `<li class="fact${h?" is-hidden":""}"><div class="fact-main"><span>${escapeHtml(f.text)}</span>${sourcesMarkup(f)}</div><button class="icon-button icon-button-quiet" data-action="review-${h?"unhide":"hide"}" data-id="${escapeHtml(f.id)}" aria-label="${h?"Вернуть строку":"Скрыть строку"}" title="${h?"Вернуть":"Скрыть"}">${icon(h?"refresh":"x")}</button></li>`;
  }).join("");
  return `<section class="card review-section" aria-labelledby="rs-${key}"><header><h2 id="rs-${key}">${SECTION_TITLES[key]}</h2><p class="subtle text-small">${escapeHtml(HELP[key])}</p></header>${note}
    ${list?`<ul class="fact-list">${list}</ul>`:facts.length?`<p class="subtle">Все строки скрыты.</p>`:key==="surprised"?"":`<p class="subtle">Пока пусто.</p>`}
    ${gone.length&&!showHidden?"":""}
    <details class="own-details" ${own||key==="surprised"?"open":""}><summary>${icon("pen")}<span>${own?"Ваши слова":"Добавить свои слова"}</span></summary><label class="field own-field"><span class="label">${key==="surprised"?"Что удивило":"Ваши слова"}</span><textarea class="input" rows="3" data-review-section="${key}" maxlength="6000" placeholder="${key==="surprised"?"Что оказалось неожиданным?":key==="questions"?"Ответы или свои вопросы…":"Что вы сами добавили бы?"}">${escapeHtml(own)}</textarea></label></details></section>`;
}
export function reviewsView(){
  const r=range(),review=build(r),saved=savedFor(r.id);
  const hiddenCount=(saved.hidden||[]).filter(id=>SECTION_ORDER.some(k=>(review.sections[k]||[]).some(f=>f.id===id))).length;
  const items=PERIOD_KINDS.map(([k,l])=>[k,l]);
  const s=review.stats;
  const isYear=r.kind==="year";
  return `${pageHeader("Оглядываясь назад","Обзоры","Черновик из ваших записей. Слова в нём — ваши; выводы — тоже ваши.",`<button class="secondary" data-action="review-export">${icon("download")}<span>Markdown</span></button>${isYear?`<button class="secondary" data-action="review-book">${icon("printer")}<span>Книга года</span></button>`:`<button class="secondary" data-action="review-print">${icon("printer")}<span>Печать</span></button>`}`)}
    ${tabs("reviews",items,state.reviewKind,{label:"Период обзора"})}<div id="panel-reviews" role="tabpanel" aria-labelledby="tab-reviews-${state.reviewKind}">
    <div class="period-nav"><button class="icon-button" data-action="review-prev" aria-label="Предыдущий период">${icon("chevron-left")}</button><div class="period-label" aria-live="polite"><strong>${escapeHtml(capitalizeRu(r.label))}</strong><span class="subtle text-small">${review.hasData?`${s.entries} ${plural.entry(s.entries)}, ${s.words} ${plural.word(s.words)}, дней с записями: ${s.activeDays} из ${r.days}`:"В этом периоде записей нет"}</span></div><button class="icon-button" data-action="review-next" aria-label="Следующий период" ${canNext(r)?"":"disabled"}>${icon("chevron-right")}</button>${localDateKey(state.reviewCursor)!==localDateKey(new Date())&&!(r.from<=localDateKey(new Date())&&r.to>=localDateKey(new Date()))?`<button class="link-button" data-action="review-now">К текущему</button>`:""}</div>
    ${!review.hasData&&!saved.sections?.surprised&&!Object.values(saved.sections||{}).some(Boolean)?emptyState("За этот период записей нет","Когда появятся записи или отметки, здесь соберётся черновик обзора. Пока можно перейти к другому периоду.","","reviews"):`
    <div class="review-status"><span id="review-save-status" class="text-small subtle" role="status">${saveState==="saved"?"Сохранено":""}</span>${hiddenCount?`<button class="link-button" data-action="review-toggle-hidden">${showHidden?"Скрыть спрятанное":`Показать спрятанные строки (${hiddenCount})`}</button>`:""}</div>
    <div class="review-sections">${SECTION_ORDER.map(k=>sectionMarkup(k,review,saved)).join("")}</div>`}</div>`;
}

/* ---------- saving the person's words ---------- */
async function persist(record){
  try{
    await store.saveReview(record);
    const i=state.reviews.findIndex(r=>r.id===record.id);
    if(i>=0)state.reviews[i]=record;else state.reviews.push(record);
    saveState="saved";const el=$("#review-save-status");if(el)el.textContent="Сохранено";
  }catch(error){console.error(error);saveState="error";const el=$("#review-save-status");if(el)el.textContent="Не удалось сохранить";ctx.toast("Не удалось сохранить обзор. Текст остался на экране.");}
}
function scheduleSave(key,value){
  const r=range(),saved=structuredClone(savedFor(r.id));
  saved.sections={...saved.sections,[key]:value};saved.updatedAt=nowIso();
  saveState="saving";const el=$("#review-save-status");if(el)el.textContent="Сохраняем…";
  const i=state.reviews.findIndex(x=>x.id===saved.id);if(i>=0)state.reviews[i]=saved;else state.reviews.push(saved); // the screen always reads the newest words
  clearTimeout(saveTimer);saveTimer=setTimeout(()=>{const rec=pendingRecord;pendingRecord=null;if(rec)persist(rec);},700);
  pendingRecord=saved;
}
let pendingRecord=null;
async function flush(){if(pendingRecord&&saveState==="saving"){clearTimeout(saveTimer);const r=pendingRecord;pendingRecord=null;await persist(r);}}
async function toggleHidden(id,hide){
  await flush();
  const r=range(),saved=structuredClone(savedFor(r.id)),set=new Set(saved.hidden||[]);
  if(hide)set.add(id);else set.delete(id);
  saved.hidden=[...set];saved.updatedAt=nowIso();
  await persist(saved);ctx.render();
}
async function shift(delta){
  await flush();
  const next=shiftPeriod(range(),delta);
  state.reviewCursor=new Date(`${next.from}T12:00:00`);showHidden=false;ctx.render();
}

/* ---------- printing ---------- */
async function printRoot(html){
  $("#print-root")?.remove();
  const root=document.createElement("div");root.id="print-root";root.className="print-root";root.innerHTML=html;document.body.append(root);
  document.body.classList.add("print-mode");
  let finished=false;
  const done=()=>{if(finished)return;finished=true;root.remove();document.body.classList.remove("print-mode");window.removeEventListener("afterprint",done);};
  window.addEventListener("afterprint",done);
  setTimeout(done,180000); // some browsers (iOS home-screen apps) never report afterprint: do not leave the diary hidden
  media.hydrate(root);
  // pictures are decoded asynchronously: give them a moment (at most 4 s) so the printout is not missing them
  const pending=[...root.querySelectorAll("img")].filter(i=>!i.complete);
  if(pending.length)await Promise.race([Promise.all(pending.map(i=>new Promise(r=>{i.addEventListener("load",r,{once:true});i.addEventListener("error",r,{once:true});}))),new Promise(r=>setTimeout(r,4000))]);
  await new Promise(r=>setTimeout(r,350));
  window.print();
}
function reviewPrintHtml(r){
  const review=build(r),saved=savedFor(r.id),hidden=new Set(saved.hidden||[]),counts=new Map();
  for(const e of state.entries){if(e.deletedAt)continue;const k=dayKey(e.happenedAt);if(k>=r.from&&k<=r.to)counts.set(k,(counts.get(k)||0)+1);}
  return sheetHtml({review,saved,hidden,counts,label:capitalizeRu(r.label)});
}
function bookHtml(r){
  const book=buildBook({range:r,entries:state.entries,checkins:state.checkins,config:state.config,chapters:state.chapters,notes:state.entityNotes,saved:savedFor(r.id),includeAll:false,now:new Date()});
  const own=SECTION_ORDER.map(k=>({title:SECTION_TITLES[k],text:(book.saved.sections?.[k]||"").trim()})).filter(x=>x.text);
  const months=book.months.map(m=>({...m,entries:m.entries.map(e=>({...e,title:entryText(e,120).title,dateLabel:fmtDate(e.happenedAt,{year:"numeric"})}))}));
  return bookPrint({book:{...book,months},renderBody:e=>renderMarkdown(e.body),ownSections:own});
}

export const views={reviews:reviewsView};
export const actions={
  "review-prev":()=>shift(-1),"review-next":()=>shift(1),
  "review-now":async()=>{await flush();state.reviewCursor=new Date();showHidden=false;ctx.render();},
  "review-hide":el=>toggleHidden(el.dataset.id,true),
  "review-unhide":el=>toggleHidden(el.dataset.id,false),
  "review-toggle-hidden":()=>{showHidden=!showHidden;ctx.render();},
  "review-export":async()=>{
    await flush();
    const r=range(),review=build(r);
    downloadBlob(reviewToMarkdown(review,savedFor(r.id)),"text/markdown;charset=utf-8",`narra-review-${r.id.replace(":","-")}.md`);
    ctx.toast("Обзор сохранён как Markdown. Файл не зашифрован.");
  },
  "review-print":async()=>{await flush();printRoot(reviewPrintHtml(range()));},
  "review-book":async()=>{await flush();printRoot(bookHtml(range()));ctx.toast("В окне печати выберите «Сохранить как PDF».");},
};
export const on={
  input:e=>{
    const key=e.target.dataset?.reviewSection;
    if(!key)return false;
    scheduleSave(key,e.target.value);return true;
  },
};
export const beforeRender=()=>{if(saveState==="saving")flush();};
window.addEventListener("pagehide",()=>{if(pendingRecord&&saveState==="saving")persist(pendingRecord);});
export {uid,entryLabel,dayKey,aliasMap,featureOn,$$};
