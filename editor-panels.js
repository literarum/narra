/* Editor side panels: entry details, links, decision journal, suggestions and writing help. Markup only; editor.js binds them. */
import {state,ctx,escapeHtml,icon,localDateInputValue,fmtDate,fmtLong,kindOptions,kindLabels,capitalizeRu,featureOn,activeEntries,entryById} from "./core.js?v=4.2.0";
import {parseRussianDateHint,extractHashtags,suggestEntryKindRu} from "./domain.mjs?v=4.2.0";
import {entryText} from "./text.mjs?v=4.2.0";
import {suggestKnownEntities,chapterOf,sortChapters} from "./entities.mjs?v=4.2.0";
import {detailQuestions,reflectiveQuestions,clarityFindings} from "./writing.mjs?v=4.2.0";
import {relatedEntriesFor} from "./memories.js?v=4.2.0";
import {entityMap} from "./derived.js?v=4.2.0";
import {selectHtml} from "./kit.js?v=4.2.0";
import {LINK_TYPES} from "./domain.mjs?v=4.2.0";

export const LINK_LABELS={related:"Связана",continuation:"Продолжение",decision_followup:"Итог решения",custom:"Другое"};
const CONFIDENCE=[[0,"Не указано"],[1,"Совсем не уверен"],[2,"Скорее не уверен"],[3,"Сомневаюсь"],[4,"Скорее уверен"],[5,"Уверен"]];

export function smartSuggestions(entry){
  if(!state.smartSuggestionsEnabled)return [];
  const dismissed=new Set(entry.dismissedSuggestions||[]),out=[];
  const date=parseRussianDateHint(entry.body||"",new Date());
  if(date){
    const key=`date:${date.iso.slice(0,10)}`;
    if(!dismissed.has(key)&&localDateInputValue(entry.happenedAt)!==localDateInputValue(date.iso))out.push({key,type:"date",value:date.iso,label:date.label});
  }
  for(const theme of extractHashtags(entry.body||"")){
    const key=`theme:${theme}`;
    if(!dismissed.has(key)&&!(entry.themes||[]).includes(theme))out.push({key,type:"theme",value:theme,label:`Тема: #${theme}`});
  }
  const kind=suggestEntryKindRu(entry.body||"");
  if(kind&&kind.kind!==entry.kind){const key=`kind:${kind.kind}`;if(!dismissed.has(key))out.push({key,type:"kind",value:kind.kind,label:`Тип: ${kind.label}`});}
  if(featureOn("featEntitySuggest")){
    const known=[...entityMap().values()].filter(r=>r.count>=1&&r.type!=="theme"&&!(r.type==="place"&&entry.location));
    for(const s of suggestKnownEntities(entry,known,{limit:3})){
      const key=`ent:${s.key}`;
      if(!dismissed.has(key))out.push({key,type:s.type,value:s.name,label:`${s.type==="person"?"Человек":s.type==="place"?"Место":"Проект"}: ${s.name}`});
    }
  }
  return out.slice(0,7);
}
export function suggestionsMarkup(entry){
  if(!state.smartSuggestionsEnabled)return `<p class="subtle text-small">Умные подсказки выключены в настройках.</p>`;
  const list=smartSuggestions(entry);
  if(!list.length)return `<p class="subtle text-small">Подсказок нет. Они появляются, если в тексте есть дата, #тема, узнаваемый тип записи или знакомое имя.</p>`;
  return `<div class="suggestion-list">${list.map(s=>`<span class="suggestion-chip"><button type="button" data-action="accept-suggestion" data-key="${escapeHtml(s.key)}" data-type="${s.type}" data-value="${encodeURIComponent(s.value)}">${escapeHtml(s.label)}</button><button type="button" data-action="dismiss-suggestion" data-key="${escapeHtml(s.key)}" aria-label="Скрыть подсказку">${icon("x")}</button></span>`).join("")}</div>`;
}
export function contextSummaryText(entry){
  const parts=[capitalizeRu(kindLabels[entry.kind]||"мысль"),fmtDate(entry.happenedAt,{year:new Date(entry.happenedAt).getFullYear()===new Date().getFullYear()?undefined:"numeric"})];
  if(entry.happenedEnd)parts[1]+=` — ${fmtDate(entry.happenedEnd)}`;
  if((entry.themes||[]).length)parts.push(entry.themes.slice(0,2).map(t=>"#"+t).join(" "));
  if(smartSuggestions(entry).length)parts.push("есть подсказки");
  return parts.join(" · ");
}

export function linksMarkup(entry){
  const links=(entry.links||[]).filter(l=>entryById(l.to)&&!entryById(l.to).deletedAt);
  const back=activeEntries().filter(e=>e.id!==entry.id&&(e.links||[]).some(l=>l.to===entry.id));
  return `<div class="context-block" id="entry-links"><div class="context-heading"><strong>Связанные записи</strong><span>вручную, без догадок</span></div>
    ${links.length?`<ul class="link-list">${links.map(l=>{const t=entryById(l.to);return `<li><button type="button" class="link-button" data-action="open-linked" data-id="${escapeHtml(l.to)}">${escapeHtml(entryText(t).title)}</button><span class="link-date">${escapeHtml(fmtDate(t.happenedAt,{year:"numeric"}))}</span>${selectHtml(`link-type-${l.to}`,LINK_TYPES.map(k=>[k,LINK_LABELS[k]]),l.type,{label:"Тип связи"}).replace("<select ",`<select data-link-type="${escapeHtml(l.to)}" `)}<button type="button" class="icon-button icon-button-quiet" data-action="unlink" data-id="${escapeHtml(l.to)}" aria-label="Убрать связь">${icon("x")}</button></li>`;}).join("")}</ul>`:`<p class="subtle text-small">Связей нет.</p>`}
    ${back.length?`<p class="subtle text-small">Ссылаются на эту запись: ${back.slice(0,4).map(e=>`<button type="button" class="link-button" data-action="open-linked" data-id="${escapeHtml(e.id)}">${escapeHtml(entryText(e).title)}</button>`).join(", ")}${back.length>4?` и ещё ${back.length-4}`:""}</p>`:""}
    <button type="button" class="secondary button-with-icon" data-action="link-pick">${icon("link")}<span>Связать с записью</span></button></div>`;
}

export function decisionMarkup(entry){
  if(!featureOn("featDecisions")||entry.kind!=="decision")return `<div id="decision-panel" hidden></div>`;
  const d=entry.decision||{};
  return `<div class="context-block" id="decision-panel"><div class="context-heading"><strong>Журнал решения</strong><span>чтобы потом честно сверить ожидания и итог</span></div>
    <div class="context-grid">
      <label class="field context-wide"><span class="label">Что решаете</span><input class="input" data-decision="decision" maxlength="600" value="${escapeHtml(d.decision||"")}" placeholder="Одной фразой" autocomplete="off"></label>
      <label class="field context-wide"><span class="label">Контекст</span><textarea class="input" data-decision="context" rows="2" maxlength="2000" placeholder="Что происходит вокруг">${escapeHtml(d.context||"")}</textarea></label>
      <label class="field context-wide"><span class="label">Варианты</span><textarea class="input" data-decision="options" rows="2" maxlength="2000" placeholder="Какие есть варианты">${escapeHtml(d.options||"")}</textarea></label>
      <label class="field context-wide"><span class="label">Чего вы ждёте</span><textarea class="input" data-decision="expected" rows="2" maxlength="1200" placeholder="Что должно получиться">${escapeHtml(d.expected||"")}</textarea></label>
      <label class="field"><span class="label">Уверенность</span>${selectHtml("dec-confidence",CONFIDENCE,d.confidence||0,{label:"Уверенность в решении"}).replace("<select ",'<select data-decision-select="confidence" ')}</label>
      <label class="field"><span class="label">Вернуться к решению</span><input type="date" id="dec-revisit" data-datepicker data-clearable data-placeholder="Без даты" value="${escapeHtml(d.revisitOn||"")}"></label>
      <label class="field context-wide"><span class="label">Что получилось</span><textarea class="input" data-decision="outcome" rows="2" maxlength="2000" placeholder="Заполните позже, когда станет ясно">${escapeHtml(d.outcome||"")}</textarea></label>
    </div></div>`;
}

/** The context panel that sits under the title. */
export function contextMarkup(entry){
  const chapters=sortChapters(state.chapters),auto=chapterOf({...entry,chapterId:null},state.chapters);
  const chapterOpts=[["",auto?`Автоматически: «${auto.name}»`:"Без главы"],...chapters.map(c=>[c.id,c.name])];
  return `<details class="entry-context" id="entry-context"><summary>${icon("layout")}<span>Детали записи</span><span class="context-summary" id="context-summary">${escapeHtml(contextSummaryText(entry))}</span></summary><div class="context-grid">
      <label class="field"><span class="label">Дата</span><input id="entry-date" type="date" data-datepicker value="${localDateInputValue(entry.happenedAt)}"></label>
      <label class="field"><span class="label">Конец периода</span><input id="entry-end" type="date" data-datepicker data-clearable data-placeholder="Один день" value="${entry.happenedEnd?localDateInputValue(entry.happenedEnd):""}"></label>
      <label class="field"><span class="label">Тип записи</span><select id="entry-kind" data-select aria-label="Тип записи">${kindOptions.map(([k,v])=>`<option value="${k}" ${entry.kind===k?"selected":""}>${capitalizeRu(v)}</option>`).join("")}</select></label>
      ${featureOn("featChapters")&&chapters.length?`<label class="field"><span class="label">Глава жизни</span>${selectHtml("entry-chapter",chapterOpts,entry.chapterId||"",{label:"Глава жизни"})}</label>`:""}
      <label class="field"><span class="label">Люди</span><input class="input" id="entry-people" autocomplete="off" value="${escapeHtml((entry.people||[]).join(", "))}" placeholder="Через запятую"></label>
      <label class="field"><span class="label">Темы</span><input class="input" id="entry-themes" autocomplete="off" value="${escapeHtml((entry.themes||[]).join(", "))}" placeholder="Например, работа, поездка"></label>
      <label class="field"><span class="label">Проекты</span><input class="input" id="entry-projects" autocomplete="off" value="${escapeHtml((entry.projects||[]).join(", "))}" placeholder="Через запятую"></label>
      <label class="field"><span class="label">Место</span><input class="input" id="entry-location" autocomplete="off" value="${escapeHtml(entry.location||"")}" placeholder="Где это было"></label>
      <label class="check context-wide"><input id="entry-sensitive" type="checkbox" ${entry.sensitive?"checked":""}><span class="check-box"></span><span>Личная запись — не показывать среди воспоминаний</span></label>
    </div>${linksMarkup(entry)}${decisionMarkup(entry)}<div class="smart-suggestions"><div class="context-heading"><strong>Подсказки</strong><span>только по тексту этой записи</span></div><div id="suggestions">${suggestionsMarkup(entry)}</div></div></details>`;
}

/* ---------- writing help: every item is a button the user presses; nothing runs on its own ---------- */
export function assistMarkup(){
  if(!featureOn("featWritingAssist"))return "";
  return `<details class="assist-panel" id="assist-panel"><summary>${icon("sparkle")}<span>Помощь при письме</span><span class="context-summary">по вашей просьбе</span></summary><div class="assist-body">
    <p class="subtle text-small">Ничего не вставляется и не меняется само. Вопросы и подсказки строятся по тексту прямо на вашем устройстве.</p>
    <div class="assist-actions">
      <button type="button" class="secondary" data-action="assist" data-kind="structure">Шаблон структуры</button>
      <button type="button" class="secondary" data-action="assist" data-kind="details">Вспомнить детали</button>
      <button type="button" class="secondary" data-action="assist" data-kind="reflect">Вопросы для размышления</button>
      <button type="button" class="secondary" data-action="assist" data-kind="clarity">Проверить ясность</button>
      <button type="button" class="secondary" data-action="assist" data-kind="related">Похожие записи</button>
    </div><div id="assist-result" aria-live="polite"></div></div></details>`;
}
export function assistResult(kind,entry){
  const q=list=>`<ul class="assist-list">${list.map(t=>`<li><span>${escapeHtml(t)}</span><button type="button" class="link-button" data-action="assist-insert" data-text="${encodeURIComponent(t)}">Вставить в текст</button></li>`).join("")}</ul>`;
  if(kind==="details")return `<h4>Что ещё можно вспомнить</h4>${q(detailQuestions(entry))}`;
  if(kind==="reflect")return `<h4>Вопросы для размышления</h4>${q(reflectiveQuestions(entry))}`;
  if(kind==="clarity"){
    const f=clarityFindings(entry.body||"");
    return f.length?`<h4>Что можно перечитать</h4><ul class="assist-list">${f.map((x,i)=>`<li><span>${escapeHtml(x.message)}</span><button type="button" class="link-button" data-action="assist-goto" data-from="${x.from}" data-to="${x.to}">Показать</button></li>`).join("")}</ul>`:`<p class="subtle">Замечаний нет: длинных предложений и плотных абзацев не найдено.</p>`;
  }
  if(kind==="related"){
    const rel=relatedEntriesFor(entry,4);
    return rel.length?`<h4>Похоже по темам и словам</h4><ul class="assist-list">${rel.map(x=>`<li><span>${escapeHtml(entryText(x.entry).title)} <small>· ${escapeHtml(fmtDate(x.entry.happenedAt,{year:"numeric"}))} · общее: ${escapeHtml(x.sharedTerms.join(", "))}</small></span><button type="button" class="link-button" data-action="open-linked" data-id="${escapeHtml(x.entry.id)}">Открыть</button></li>`).join("")}</ul>`:`<p class="subtle">Похожих записей пока нет — нужны общие темы или слова.</p>`;
  }
  return "";
}
