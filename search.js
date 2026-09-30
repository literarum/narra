/* Search: words, phrases and filters over the whole diary, on this device only.
   Understands time phrases («весной 2025», «в марте», «на прошлой неделе») and shows them as removable chips.
   Optional «близость слов» (feature switch) adds entries with related words and says why each was included. */
import {state,ctx,$,escapeHtml,icon,kindOptions,kindLabels,capitalizeRu,featureOn,activeEntries,mediaOf,entryLabel,matchLabel} from "./core.js?v=4.4.0";
import {searchEntries,foldRu,stemRu} from "./domain.mjs?v=4.4.0";
import {parseTimeHints,hybridSearch,expandQuery} from "./semantic.mjs?v=4.4.0";
import {EMOTION_GROUPS} from "./checkin.mjs?v=4.4.0";
import {chapterOf,sortChapters} from "./entities.mjs?v=4.4.0";
import {dayKey} from "./stats.mjs?v=4.4.0";
import {pageHeader,emptyState,selectHtml,field,checkRow,chip} from "./kit.js?v=4.4.0";
import {entryRow} from "./entries-ui.js?v=4.4.0";
import {entityMap,semanticIndex} from "./derived.js?v=4.4.0";
import {listByType} from "./entities.mjs?v=4.4.0";
import * as media from "./media.js?v=4.4.0";

const norm=s=>String(s||"").toLocaleLowerCase("ru-RU");
const PAGE=30;
let shown=PAGE;
/* recent queries live in memory only (never written to disk), so they cannot leak diary words into storage */
const recent=[];
const rememberQuery=q=>{q=String(q||"").trim();if(q.length<3)return;const i=recent.findIndex(x=>norm(x)===norm(q));if(i>=0)recent.splice(i,1);recent.unshift(q);recent.length=Math.min(recent.length,6);};
const SORTS=[["relevance","Подходящие"],["new","Новые"],["old","Старые"]];
const TYPE_LABEL={person:"человек",place:"место",theme:"тема"};
const TYPE_KEY={person:"searchPerson",place:"searchPlace",theme:"searchTheme"};
const wordsIn=t=>foldRu(t).match(/[\p{L}\p{N}]+/gu)||[];
/** Names from the Life map that the query already mentions: offered as one-tap filters, never applied silently. */
function recognizedEntities(q){
  if(!q||q.length<2)return [];
  const qw=wordsIn(q),qs=new Set(qw.map(w=>stemRu(w)));
  const out=[];
  for(const r of entityMap().values()){
    if(!TYPE_KEY[r.type]||state[TYPE_KEY[r.type]])continue;
    const nw=wordsIn(r.name).filter(w=>w.length>=2);
    if(!nw.length)continue;
    if(nw.every(w=>qs.has(stemRu(w))||qw.includes(w)))out.push({type:r.type,name:r.name,count:r.count||0,words:nw});
  }
  return out.sort((a,b)=>b.words.length-a.words.length||b.count-a.count).slice(0,3);
}
function stripWords(q,words){
  const stems=new Set(words.map(w=>stemRu(w)));
  return q.replace(/[\p{L}\p{N}]+/gu,m=>stems.has(stemRu(m))?"":m).replace(/\s{2,}/g," ").trim();
}
/** Live suggestions under the input: names and titles that start like the word being typed. */
function suggestions(q){
  const last=(q.match(/[\p{L}\p{N}#]+$/u)||[""])[0].replace(/^#/,""),f=foldRu(last);
  if(f.length<1)return [];
  const out=[];
  for(const r of entityMap().values()){
    if(!TYPE_KEY[r.type]||state[TYPE_KEY[r.type]])continue;
    if(wordsIn(r.name).some(w=>w.startsWith(f)))out.push({kind:"entity",type:r.type,name:r.name,count:r.count||0});
  }
  out.sort((a,b)=>b.count-a.count);
  const res=out.slice(0,5);
  if(f.length>=3){
    const t=activeEntries().filter(e=>e.title&&foldRu(e.title).includes(foldRu(q.trim()))).slice(0,3);
    for(const e of t)res.push({kind:"entry",id:e.id,name:e.title});
  }
  return res;
}
let suggestList=[],suggestIndex=-1;
function suggestMarkup(){
  if(!suggestList.length)return "";
  return suggestList.map((x,i)=>`<div tabindex="-1" role="option" id="sg-${i}" class="suggest-item${i===suggestIndex?" is-active":""}" aria-selected="${i===suggestIndex}" data-action="search-suggest-pick" data-i="${i}">${icon(x.kind==="entry"?"journal":x.type==="person"?"users":x.type==="place"?"map":"tag")}<span class="suggest-name">${escapeHtml(x.kind==="theme"||x.type==="theme"?"#"+x.name:x.name)}</span><small>${x.kind==="entry"?"запись":TYPE_LABEL[x.type]}</small></div>`).join("");
}
function paintSuggest(){
  const box=$("#search-suggest"),input=$("#search-input");if(!box)return;
  box.innerHTML=suggestMarkup();box.hidden=!suggestList.length;
  if(input){input.setAttribute("aria-expanded",String(Boolean(suggestList.length)));if(suggestIndex>=0)input.setAttribute("aria-activedescendant",`sg-${suggestIndex}`);else input.removeAttribute("aria-activedescendant");}
}

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
let memo=null;
export function compute(){
  const key=JSON.stringify([state.searchQuery,FILTER_KEYS.map(k=>state[k]),state.searchMedia,state.searchFavoriteOnly,state.searchNear,state.searchSort,state.searchTimeHints,state.checkins.length,state.attachments.length,state.chapters.length]);
  if(memo&&memo.key===key&&memo.entries===state.entries&&memo.n===activeEntries().length)return memo.value;
  const value=computeNow();memo={key,value,entries:state.entries,n:activeEntries().length};return value;
}
export function clearSearchMemory(){memo=null;recent.length=0;suggestList=[];suggestIndex=-1;state.searchQuery="";state.searchTimeHints=[];}
function computeNow(){
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
  let anyOf=false;
  if(!rows.length&&lex.parsed.tokens.length>1&&lex.parsed.tokens.length<=6&&!lex.parsed.phrases.length){
    // nothing has all the words: fall back to entries with at least one, the more words the higher
    const hit=new Map();
    for(const t of lex.parsed.tokens)for(const e of searchEntries(pool,t,{kindLabels,filter}).results){const h=hit.get(e.id)||{entry:e,n:0};h.n++;hit.set(e.id,h);}
    rows=[...hit.values()].sort((a,b)=>b.n-a.n||Date.parse(b.entry.happenedAt)-Date.parse(a.entry.happenedAt)).map(h=>({entry:h.entry,reason:`Совпало слов: ${h.n} из ${lex.parsed.tokens.length}`}));
    anyOf=rows.length>0;
  }
  const sort=state.searchSort||"relevance";
  if(sort==="new")rows=[...rows].sort((a,b)=>Date.parse(b.entry.happenedAt)-Date.parse(a.entry.happenedAt));
  else if(sort==="old")rows=[...rows].sort((a,b)=>Date.parse(a.entry.happenedAt)-Date.parse(b.entry.happenedAt));
  const related=!rows.length?expandQuery(lexQuery).groups.flatMap(g=>g.words.filter(w=>foldRu(w)!==foldRu(g.via))).slice(0,6):[];
  return {idle:false,hints,rows,total:rows.length,parsed:lex.parsed,fuzzy:lex.fuzzy,lexQuery,poolSize:pool.length,anyOf,related,recognized:recognizedEntities(lexQuery)};
}
function periodWords(hints){return hints.length?hints.map(h=>h.label).join(", "):"за всё время";}
function resultsMarkup(){
  const r=compute();
  if(r.idle)return idleMarkup();
  const sortBar=r.total>1?`<div class="search-sort" role="group" aria-label="Порядок">${SORTS.map(([k,l])=>`<button type="button" class="sort-chip${(state.searchSort||"relevance")===k?" is-on":""}" data-action="search-sort" data-value="${k}" aria-pressed="${(state.searchSort||"relevance")===k}">${l}</button>`).join("")}</div>`:"";
  const head=`<div class="result-bar"><p class="result-count" role="status">${r.total?`Найдено ${r.total} ${entryLabel(r.total)} — ${escapeHtml(periodWords(r.hints))}${r.hints.length||filtersCount()?"":` (из ${r.poolSize})`}`:"Ничего не найдено"}${r.fuzzy?`. Показаны похожие написания`:""}${r.anyOf?`. Ни в одной записи нет всех слов сразу — показаны записи хотя бы с одним из них`:""}</p>${sortBar}</div>${entityChips(r)}`;
  if(!r.total){
    const rel=r.related.length?`<div class="chip-group"><span class="label">Попробуйте близкие слова</span><div class="chips">${r.related.map(w=>chip(escapeHtml(w),`data-action="search-try" data-value="${escapeHtml(w)}"`)).join("")}</div></div>`:"";
    return `${head}${emptyState("Ничего не нашлось","Проверьте написание, уберите часть слов или сбросьте фильтры. Поиск идёт по заголовкам, тексту, темам, людям и местам.",`<button class="secondary" data-action="search-reset">Сбросить поиск</button>`,"search")}${rel}`;
  }
  const list=r.rows.slice(0,shown),more=r.rows.length>shown;
  return `${head}<div class="entry-list">${list.map(x=>entryRow(x.entry,{parsed:r.parsed,fuzzy:r.fuzzy,showReason:true,reason:x.reason})).join("")}</div>${more?`<div class="load-more"><button class="secondary" data-action="search-more">Показать ещё</button><span class="subtle text-small">Показано ${list.length} из ${r.rows.length}</span></div>`:""}`;
}
function entityChips(r){
  if(!r.recognized?.length)return "";
  return `<div class="entity-hint" role="note"><span class="label">Уточнить:</span><div class="chips">${r.recognized.map(x=>chip(`${icon(x.type==="person"?"users":x.type==="place"?"map":"tag")}<span>только ${escapeHtml(TYPE_LABEL[x.type])}: ${escapeHtml(x.type==="theme"?"#"+x.name:x.name)}</span>`,`data-action="search-apply-entity" data-kind="${x.type}" data-value="${escapeHtml(x.name)}"`)).join("")}</div></div>`;
}
function idleMarkup(){
  const map=entityMap(),themes=listByType(map,"theme").slice(0,8),people=listByType(map,"person").slice(0,6);
  const chips=(kind,rows)=>rows.map(r=>chip(escapeHtml(kind==="theme"?"#"+r.name:r.name),`data-action="search-chip" data-kind="${kind}" data-value="${escapeHtml(r.name)}"`)).join("");
  return `<div class="search-idle">${icon("search","empty-icon")}<h2>Что вы ищете?</h2><p class="subtle">Слово, фраза в кавычках или период: «весной», «в марте 2025», «на прошлой неделе».</p>
    ${recent.length?`<div class="chip-group"><span class="label">Недавно искали <button type="button" class="link-button" data-action="search-recent-clear">очистить</button></span><div class="chips">${recent.map(q=>chip(`${icon("clock")}<span>${escapeHtml(q)}</span>`,`data-action="search-try" data-value="${escapeHtml(q)}"`)).join("")}</div></div>`:""}
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
  <div class="search-box"><span class="search-box-icon">${icon("search")}</span><input id="search-input" class="input search-input" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Слово, фраза или период" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="search-suggest" aria-label="Поиск по дневнику" value="${escapeHtml(state.searchQuery)}"><button class="icon-button icon-button-quiet search-clear" data-action="search-clear-input" aria-label="Очистить запрос" ${state.searchQuery?"":"hidden"}>${icon("x")}</button><div id="search-suggest" class="search-suggest" role="listbox" aria-label="Подсказки" hidden></div></div>
  <div id="search-hints">${hintChips()}</div>
  ${semantic?`<div class="search-near">${checkRow("sf-near","Искать и по смыслу",state.searchNear)}<span class="hint-text">Находит записи с близкими по смыслу словами: «устала» найдёт и «нет сил». Всё считается на устройстве, каждая такая находка подписана.</span></div>`:""}
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
  "search-sort":el=>{state.searchSort=el.dataset.value;shown=PAGE;refresh();},
  "search-try":el=>{state.searchQuery=el.dataset.value;state.searchTimeHints=[];const i=$("#search-input");if(i){i.value=state.searchQuery;i.focus();}refresh();rememberQuery(state.searchQuery);},
  "search-recent-clear":()=>{recent.length=0;refresh();},
  "search-apply-entity":el=>{
    const r=recognizedEntities(state.searchQuery.trim()).find(x=>x.type===el.dataset.kind&&x.name===el.dataset.value);
    state[TYPE_KEY[el.dataset.kind]]=el.dataset.value;
    if(r)state.searchQuery=stripWords(state.searchQuery,r.words);
    shown=PAGE;ctx.render();
  },
  "search-suggest-pick":el=>pickSuggest(Number(el.dataset.i)),
  "search-dismiss-hint":el=>{state.searchTimeHints=[...state.searchTimeHints,el.dataset.id];refresh();},
};
function pickSuggest(i){
  const x=suggestList[i];if(!x)return;
  suggestList=[];suggestIndex=-1;
  if(x.kind==="entry"){paintSuggest();rememberQuery(state.searchQuery);ctx.ACTIONS?.["open-entry"]?.({dataset:{id:x.id}});return;}
  state[TYPE_KEY[x.type]]=x.name;
  state.searchQuery=state.searchQuery.replace(/[\p{L}\p{N}#]+$/u,"").trim();
  shown=PAGE;ctx.render();setTimeout(()=>$("#search-input")?.focus(),30);
}
export function afterRender(route){
  if(route!=="search")return;
  const input=$("#search-input"),box=$("#search-suggest");if(!input||!box)return;
  suggestList=[];suggestIndex=-1;
  box.addEventListener("mousedown",e=>e.preventDefault()); // keep focus in the field while picking
  input.addEventListener("keydown",e=>{
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){
      if(!suggestList.length)return;
      e.preventDefault();suggestIndex=(suggestIndex+(e.key==="ArrowDown"?1:-1)+suggestList.length)%suggestList.length;paintSuggest();
    }else if(e.key==="Enter"){
      if(e.isComposing||e.keyCode===229)return;
      if(suggestIndex>=0){e.preventDefault();pickSuggest(suggestIndex);}
      else{rememberQuery(input.value);suggestList=[];paintSuggest();}
    }else if(e.key==="Escape"&&suggestList.length){e.preventDefault();e.stopPropagation();suggestList=[];suggestIndex=-1;paintSuggest();}
  });
  input.addEventListener("blur",()=>setTimeout(()=>{suggestList=[];suggestIndex=-1;paintSuggest();},120));
}
let timer=null,rememberTimer=null;
const rememberQueryLater=()=>{clearTimeout(rememberTimer);const q=state.searchQuery;rememberTimer=setTimeout(()=>{if(state.searchQuery===q)rememberQuery(q);},2500);};
export const on={
  input:e=>{
    const t=e.target;
    if(t.id==="search-input"){state.searchQuery=t.value;state.searchTimeHints=[];suggestList=suggestions(t.value);suggestIndex=-1;paintSuggest();clearTimeout(timer);timer=setTimeout(()=>{refresh();if(state.searchQuery.trim().length>=3&&compute().total)rememberQueryLater();},110);return true;}
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
export function init(c){c.clearSearchMemory=clearSearchMemory;}
export {mediaOf};
