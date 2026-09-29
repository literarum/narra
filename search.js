/* Search: words, phrases and filters over the whole diary, on this device only.
   Understands time phrases («весной 2025», «в марте», «на прошлой неделе») and shows them as removable chips.
   Optional «близость слов» (feature switch) adds entries with related words and says why each was included. */
import {state,ctx,$,escapeHtml,icon,kindOptions,kindLabels,capitalizeRu,featureOn,activeEntries,mediaOf,entryLabel,matchLabel} from "./core.js?v=4.2.0";
import {searchEntries} from "./domain.mjs?v=4.2.0";
import {parseTimeHints,hybridSearch} from "./semantic.mjs?v=4.2.0";
import {EMOTION_GROUPS} from "./checkin.mjs?v=4.2.0";
import {chapterOf,sortChapters} from "./entities.mjs?v=4.2.0";
import {dayKey} from "./stats.mjs?v=4.2.0";
import {pageHeader,emptyState,selectHtml,field,checkRow,chip} from "./kit.js?v=4.2.0";
import {entryRow} from "./entries-ui.js?v=4.2.0";
import {entityMap,semanticIndex} from "./derived.js?v=4.2.0";
import {listByType} from "./entities.mjs?v=4.2.0";
import * as media from "./media.js?v=4.2.0";

const norm=s=>String(s||"").toLocaleLowerCase("ru-RU");
const PAGE=30;
let shown=PAGE;

const FILTER_KEYS=["searchKind","searchTheme","searchPerson","searchPlace","searchEmotion","searchChapter","searchFrom","searchTo"];
export function filtersCount(){
  return FILTER_KEYS.filter(k=>state[k]&&!(k==="searchKind"&&state[k]==="all")).length+(state.searchMedia?1:0)+(state.searchFavoriteOnly?1:0);
}
function emotionDays(name){
  const days=new Set();
  for(const c of state.checkins)if((c.emotions||[]).some(e=>e.name===name))days.add(dayKey(c.observedAt));
  return days;
}
function predicate(){
  const from=state.searchFrom?new Date(`${state.searchFrom}T00:00:00`):null,to=state.searchTo?new Date(`${state.searchTo}T23:59:59.999`):null;
  const emo=state.searchEmotion?emotionDays(state.searchEmotion):null,withMedia=state.searchMedia?new Set(state.attachments.map(a=>a.entryId)):null;
  const person=norm(state.searchPerson),place=norm(state.searchPlace),theme=norm(state.searchTheme).replace(/^#/,"");
  return e=>{
    if(state.searchKind!=="all"&&e.kind!==state.searchKind)return false;
    if(state.searchFavoriteOnly&&!e.favorite)return false;
    if(theme&&!(e.themes||[]).some(x=>norm(x).includes(theme)))return false;
    if(person&&!(e.people||[]).some(x=>norm(x).includes(person)))return false;
    if(place&&!norm(e.location).includes(place))return false;
    if(emo&&!emo.has(dayKey(e.happenedAt)))return false;
    if(withMedia&&!withMedia.has(e.id))return false;
    if(state.searchChapter&&chapterOf(e,state.chapters)?.id!==state.searchChapter)return false;
    const t=new Date(e.happenedAt);if(from&&t<from)return false;if(to&&t>to)return false;
    return true;
  };
}
/** Everything the results panel needs: the ordered rows, the time chips and the wording for the header. */
export function compute(){
  const q=state.searchQuery.trim(),pool=activeEntries(),base=predicate();
  const parsedTime=parseTimeHints(q,new Date());
  const dismissed=parsedTime.hints.some(h=>state.searchTimeHints.includes(h.id));
  const hints=dismissed?[]:parsedTime.hints,lexQuery=dismissed?q:parsedTime.rest;
  const filter=e=>base(e)&&hints.every(h=>h.test(e.happenedAt));
  const noQuery=!lexQuery&&!hints.length;
  const active=filtersCount()>0;
  if(noQuery&&!active)return {idle:true,hints:[],rows:[],total:0};
  const lex=searchEntries(pool,lexQuery,{kindLabels,filter});
  let rows=lex.results.map(entry=>({entry,reason:""}));
  if(state.searchNear&&featureOn("featSemantic")&&lexQuery.length>=2){
    const mixed=hybridSearch(semanticIndex(),pool,lexQuery,{lexical:lex.results,kindLabels,filter,limit:120});
    rows=mixed.map(m=>({entry:m.entry,reason:!m.literal&&m.reasons.length?`Близко по смыслу: ${m.reasons.join("; ")}`:!m.literal?"Близко по смыслу слов":""}));
  }
  return {idle:false,hints,rows,total:rows.length,parsed:lex.parsed,fuzzy:lex.fuzzy,lexQuery,poolSize:pool.length};
}
function periodWords(hints){return hints.length?hints.map(h=>h.label).join(", "):"за всё время";}
function resultsMarkup(){
  const r=compute();
  if(r.idle)return idleMarkup();
  const head=`<p class="result-count" role="status">${r.total?`Найдено ${r.total} ${entryLabel(r.total)} — ${escapeHtml(periodWords(r.hints))}${r.hints.length||filtersCount()?"":` (из ${r.poolSize})`}`:"Ничего не найдено"}${r.fuzzy?`. Показаны похожие написания`:""}</p>`;
  if(!r.total)return `${head}${emptyState("Ничего не нашлось","Проверьте написание, уберите часть слов или сбросьте фильтры. Поиск идёт по заголовкам, тексту, темам, людям и местам.",`<button class="secondary" data-action="search-reset">Сбросить поиск</button>`,"search")}`;
  const list=r.rows.slice(0,shown),more=r.rows.length>shown;
  return `${head}<div class="entry-list">${list.map(x=>entryRow(x.entry,{parsed:r.parsed,fuzzy:r.fuzzy,showReason:true,reason:x.reason})).join("")}</div>${more?`<div class="load-more"><button class="secondary" data-action="search-more">Показать ещё</button><span class="subtle text-small">Показано ${list.length} из ${r.rows.length}</span></div>`:""}`;
}
function idleMarkup(){
  const map=entityMap(),themes=listByType(map,"theme").slice(0,8),people=listByType(map,"person").slice(0,6);
  const chips=(kind,rows)=>rows.map(r=>chip(escapeHtml(kind==="theme"?"#"+r.name:r.name),`data-action="search-chip" data-kind="${kind}" data-value="${escapeHtml(r.name)}"`)).join("");
  return `<div class="search-idle">${icon("search","empty-icon")}<h2>Что вы ищете?</h2><p class="subtle">Слово, фраза в кавычках или период: «весной», «в марте 2025», «на прошлой неделе».</p>
    ${themes.length||people.length?`<div class="chip-group"><span class="label">Быстрый переход</span><div class="chips">${chips("theme",themes)}${chips("person",people)}</div></div>`:""}</div>`;
}
function hintChips(){
  const r=compute();
  if(!r.hints?.length)return "";
  return `<div class="chips hint-chips" aria-label="Распознанные периоды">${r.hints.map(h=>`<span class="chip is-on">${icon("calendar")}<span>${escapeHtml(capitalizeRu(h.label))}</span><button class="chip-x" data-action="search-dismiss-hint" data-id="${escapeHtml(h.id)}" aria-label="Искать это слово буквально: ${escapeHtml(h.label)}">${icon("x")}</button></span>`).join("")}</div>`;
}
function filtersMarkup(){
  const chapters=sortChapters(state.chapters),emotions=EMOTION_GROUPS.flatMap(g=>g.items),n=filtersCount();
  return `<details class="filters-panel" ${n?"open":""}><summary>${icon("filter")}<span>Фильтры</span>${n?`<span class="filter-count">${n}</span>`:""}</summary><div class="filters-grid">
    ${field("Тип",selectHtml("sf-kind",[["all","Все типы"],...kindOptions.map(([k,v])=>[k,capitalizeRu(v)])],state.searchKind,{label:"Тип записи"}))}
    ${field("С даты",`<input type="date" data-datepicker data-clearable data-placeholder="Любая дата" id="sf-from" value="${escapeHtml(state.searchFrom)}">`)}
    ${field("По дату",`<input type="date" data-datepicker data-clearable data-placeholder="Любая дата" id="sf-to" value="${escapeHtml(state.searchTo)}">`)}
    ${field("Тема",`<input class="input" id="sf-theme" autocomplete="off" value="${escapeHtml(state.searchTheme)}" placeholder="тема">`)}
    ${field("Человек",`<input class="input" id="sf-person" autocomplete="off" value="${escapeHtml(state.searchPerson)}" placeholder="имя">`)}
    ${field("Место",`<input class="input" id="sf-place" autocomplete="off" value="${escapeHtml(state.searchPlace)}" placeholder="место">`)}
    ${featureOn("featChapters")&&chapters.length?field("Глава",selectHtml("sf-chapter",[["","Любая"],...chapters.map(c=>[c.id,c.name])],state.searchChapter,{label:"Глава жизни"})):""}
    ${state.checkins.some(c=>(c.emotions||[]).length)?field("Эмоция в тот день",selectHtml("sf-emotion",[["","Любая"],...emotions.map(x=>[x,x])],state.searchEmotion,{label:"Эмоция в тот день"})):""}
    ${featureOn("featMedia")?checkRow("sf-media","Только с фото и аудио",state.searchMedia):""}
    ${checkRow("sf-favorite","Только избранное",state.searchFavoriteOnly)}
    ${n?`<button class="ghost" data-action="search-filters-reset">Сбросить фильтры</button>`:""}
  </div></details>`;
}
export function searchView(){
  const semantic=featureOn("featSemantic");
  return `${pageHeader("Найдите нужное","Поиск","Всё ищется на этом устройстве, ничего не отправляется.")}
  <div class="search-box"><span class="search-box-icon">${icon("search")}</span><input id="search-input" class="input search-input" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Слово, фраза или период" aria-label="Поиск по дневнику" value="${escapeHtml(state.searchQuery)}"><button class="icon-button icon-button-quiet search-clear" data-action="search-clear-input" aria-label="Очистить запрос" ${state.searchQuery?"":"hidden"}>${icon("x")}</button></div>
  <div id="search-hints">${hintChips()}</div>
  ${semantic?`<div class="search-near">${checkRow("sf-near","Искать и по близким словам",state.searchNear)}<span class="hint-text">Работает на устройстве по списку родственных слов. Это не нейросеть; каждая такая находка подписана.</span></div>`:""}
  ${filtersMarkup()}
  <div id="search-results" aria-live="polite">${resultsMarkup()}</div>`;
}
function refresh(){
  shown=PAGE;
  const box=$("#search-results");if(!box)return;
  box.innerHTML=resultsMarkup();
  const hints=$("#search-hints");if(hints)hints.innerHTML=hintChips();
  const clear=$(".search-clear");if(clear)clear.hidden=!state.searchQuery;
  media.hydrate(box);
}
export const views={search:searchView};
export const actions={
  "search-reset":()=>{Object.assign(state,{searchQuery:"",searchKind:"all",searchFavoriteOnly:false,searchTheme:"",searchFrom:"",searchTo:"",searchPerson:"",searchPlace:"",searchEmotion:"",searchMedia:false,searchChapter:"",searchTimeHints:[]});shown=PAGE;ctx.render();$("#search-input")?.focus();},
  "search-filters-reset":()=>{Object.assign(state,{searchKind:"all",searchFavoriteOnly:false,searchTheme:"",searchFrom:"",searchTo:"",searchPerson:"",searchPlace:"",searchEmotion:"",searchMedia:false,searchChapter:""});shown=PAGE;ctx.render();},
  "search-clear-input":()=>{state.searchQuery="";state.searchTimeHints=[];const i=$("#search-input");if(i){i.value="";i.focus();}refresh();},
  "search-more":()=>{shown+=PAGE;const box=$("#search-results");if(box){box.innerHTML=resultsMarkup();media.hydrate(box);}},
  "search-chip":el=>{
    const map={theme:"searchTheme",person:"searchPerson",place:"searchPlace"};
    state[map[el.dataset.kind]]=el.dataset.value;shown=PAGE;ctx.render();
  },
  "search-dismiss-hint":el=>{state.searchTimeHints=[...state.searchTimeHints,el.dataset.id];refresh();},
};
let timer=null;
export const on={
  input:e=>{
    const t=e.target;
    if(t.id==="search-input"){state.searchQuery=t.value;state.searchTimeHints=[];clearTimeout(timer);timer=setTimeout(refresh,110);return true;}
    const map={"sf-theme":"searchTheme","sf-person":"searchPerson","sf-place":"searchPlace"};
    if(map[t.id]){state[map[t.id]]=t.value;clearTimeout(timer);timer=setTimeout(refresh,160);return true;}
    return false;
  },
  change:e=>{
    const t=e.target,map={"sf-kind":"searchKind","sf-from":"searchFrom","sf-to":"searchTo","sf-chapter":"searchChapter","sf-emotion":"searchEmotion"};
    if(map[t.id]){state[map[t.id]]=t.value;shown=PAGE;ctx.render();return true;}
    if(t.id==="sf-media"||t.id==="sf-favorite"||t.id==="sf-near"){
      if(t.id==="sf-media")state.searchMedia=t.checked;else if(t.id==="sf-favorite")state.searchFavoriteOnly=t.checked;else state.searchNear=t.checked;
      shown=PAGE;ctx.render();return true;
    }
    return false;
  },
};
export {mediaOf};
