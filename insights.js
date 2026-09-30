/* Insights («Наблюдения»): what the check-ins and entries say, described — never diagnosed.
   Every number comes with how many observations it rests on and which period; every chart has a table with the same data;
   an association is only shown when at least 10 days stand on each side, and it is worded as a coincidence, not a cause. */
import {state,ctx,$,escapeHtml,icon,todayKey,checkinLabel,dayLabel,entryLabel,activeEntries,fmtDate,featureOn} from "./core.js?v=4.5.0";
import {pageHeader,emptyState,tabs,chip} from "./kit.js?v=4.5.0";
import {stateCards,contextAssociations,curateAssociations,describeAssociation,emotionStats,entityStats,rhythm,statePartOfDay,writingEffect,medianLabel,checkinWord} from "./insights-model.mjs?v=4.5.0";
import {lineChart,barChart,monthStrip,dataTable} from "./charts.mjs?v=4.5.0";
import {MIN_N,addDays,dayKey} from "./stats.mjs?v=4.5.0";
import {activeDimensions,EMOTION_GROUP_OF,EMOTION_GROUPS,dimLabel} from "./checkin.mjs?v=4.5.0";
import {ENTITY_TYPES} from "./entities.mjs?v=4.5.0";
import {pluralRu} from "./domain.mjs?v=4.5.0";

const TABS=[["overview","Обзор"],["states","Состояния"],["contexts","Что с чем совпадает"],["emotions","Эмоции"],["themes","Темы и люди"],["rhythm","Ритм письма"],["writing","Письмо"]];
const PERIODS=[[30,"30 дней"],[90,"90 дней"],[365,"Год"],[0,"Всё время"]];
let period=90,entityType="theme",showAllAssoc=false;
const dayText=key=>fmtDate(`${key}T12:00:00`,{year:"numeric"});

function scope(){
  const today=todayKey(),from=period?addDays(today,-(period-1)):null;
  return {today,from,entries:activeEntries().filter(e=>!from||dayKey(e.happenedAt)>=from),
    checkins:state.checkins.filter(c=>!from||dayKey(c.observedAt)>=from),
    label:period?`последние ${period} ${pluralRu(period,"день","дня","дней")}`:"всё время"};
}
const evidence=(n,noun,a,b)=>`По ${n} ${noun(n)}${a?` · ${dayText(a)} — ${dayText(b)}`:""}`;
const checkinsDative=n=>pluralRu(n,"отметке","отметкам","отметкам");
const meter=(value,max)=>`<span class="meter" aria-hidden="true"><span data-w="${Math.min(100,Math.round(value/max*100))}"></span></span>`;
const table=(details,summary)=>`<details class="data-details"><summary>${icon("table")}<span>${summary||"Показать таблицей"}</span></summary>${details}</details>`;

function periodBar(){
  return `<div class="period-bar" role="group" aria-label="Период">${PERIODS.map(([v,l])=>chip(l,`data-action="insights-period" data-value="${v}"`,{on:period===v})).join("")}</div>`;
}
function waiting(n,need,text){
  const shown=Math.min(n,need);
  return `<div class="collecting"><p>${text}</p><div class="collecting-bar">${meter(shown,need)}<span class="text-small subtle">Собрано ${shown} из ${need}</span></div></div>`;
}

/* ---------- overview ---------- */
function overviewTab(sc){
  const cards=stateCards(sc.checkins,state.config,{today:sc.today,periodDays:period||null}),ready=cards.filter(c=>c.enabled!==false&&c.enough);
  const total=sc.checkins.filter(c=>c.phase==="standalone"||!c.phase).length;
  if(!activeEntries().length&&!state.checkins.length)return emptyState("Пока нечего показывать","Наблюдения появятся, когда накопятся записи и отметки состояния. Ничего не нужно настраивать.","","insights");
  const parts=[];
  parts.push(`<section class="card insight-hero"><p class="eyebrow">За ${escapeHtml(sc.label)}</p><h2>${sc.entries.length?`${sc.entries.length} ${entryLabel(sc.entries.length)}, ${total} ${checkinLabel(total)}`:`${total} ${checkinLabel(total)}`}</h2><p class="subtle">${ready.length?"Ниже — самое заметное. Подробности на соседних вкладках.":"Отметок пока мало для выводов. Достаточно нескольких отметок в неделю."}</p></section>`);
  if(ready.length){
    parts.push(`<section class="section"><div class="section-heading"><h2>Состояние</h2><button class="link-button" data-action="tab" data-tabs="insights" data-tab="states">Все графики</button></div><div class="insight-grid">${ready.slice(0,3).map(c=>stateCardCompact(c)).join("")}</div></section>`);
  }else if(cards.length){
    const best=cards.slice().sort((a,b)=>b.n-a.n)[0];
    parts.push(`<section class="section"><div class="section-heading"><h2>Состояние</h2></div>${waiting(best.n,MIN_N,"Чтобы показать, как меняется состояние, нужно хотя бы 10 отметок в выбранном периоде.")}</section>`);
  }
  const assoc=contextAssociations(sc.entries,sc.checkins,state.config,state.entityNotes);
  const top=curateAssociations(assoc.shown);
  if(top.length){
    parts.push(`<section class="section"><div class="section-heading"><h2>Совпадения</h2><button class="link-button" data-action="tab" data-tabs="insights" data-tab="contexts">Подробнее</button></div><div class="insight-list">${top.slice(0,2).map(r=>associationCard(r,3)).join("")}</div></section>`);
  }
  return parts.join("");
}
function stateCardCompact(c){
  return `<article class="card insight-card"><h3>${escapeHtml(c.dim.name)}</h3><p class="insight-value">Чаще всего — «${escapeHtml(c.label)}»</p><p class="subtle text-small">${escapeHtml(c.spread.label||"")}</p><p class="evidence">${escapeHtml(evidence(c.n,checkinsDative,c.period.from,c.period.to))}</p></article>`;
}

/* ---------- states ---------- */
function baselineText(c){
  const b=c.baseline;if(!b)return "";
  if(!b.ok)return `<p class="subtle text-small">Сравнить последние 30 дней с предыдущими 90 пока нельзя: нужно хотя бы по ${MIN_N} отметок в каждом периоде.</p>`;
  const cur=medianLabel(c.dim,b.current.median),prev=medianLabel(c.dim,b.baseline.median);
  return `<p class="baseline-line">Последние 30 дней: <strong>${escapeHtml(cur)}</strong> (по ${b.current.n} ${checkinsDative(b.current.n)}). Предыдущие 90 дней: <strong>${escapeHtml(prev)}</strong> (по ${b.baseline.n} ${checkinsDative(b.baseline.n)}).${b.direction==="same"?" Заметной разницы нет.":""}</p>`;
}
function statesTab(sc){
  const cards=stateCards(sc.checkins,state.config,{today:sc.today,periodDays:period||null});
  if(!cards.length)return emptyState("Поля отметок выключены","Включите хотя бы одно поле в настройках, в разделе «Отметки».",`<button class="secondary" data-action="go" data-to="settings">Открыть настройки</button>`,"state");
  return `<div class="insight-stack">${cards.map(c=>{
    if(!c.enough)return `<article class="card insight-block"><h2 class="h3">${escapeHtml(c.dim.name)}</h2>${waiting(c.n,MIN_N,`Отметок пока мало: график появится после ${MIN_N}.`)}</article>`;
    const domain=[Math.min(...c.dim.values),Math.max(...c.dim.values)],modeIdx=c.distribution.indexOf(Math.max(...c.distribution));
    const line=lineChart({points:c.series,line:c.rolling,domain,lowLabel:c.dim.low,highLabel:c.dim.high,summary:`${c.dim.name}: линия по дням, ${c.n} ${checkinLabel(c.n)}, ${dayText(c.period.from)} — ${dayText(c.period.to)}. Чаще всего — ${c.label}.`});
    const bars=barChart({items:c.dim.labels.map((l,i)=>({label:l,count:c.distribution[i],mark:i===modeIdx})),summary:`${c.dim.name}: сколько раз выбирали каждое значение.`});
    const t1=dataTable({caption:`${c.dim.name} по дням (медиана дня)`,headers:["День","Значение","Отметок в день"],rows:c.series.map(p=>[dayText(p.day),medianLabel(c.dim,p.value),String(p.count)])});
    const t2=dataTable({caption:`${c.dim.name}: сколько раз выбрано`,headers:["Значение","Раз"],rows:c.dim.labels.map((l,i)=>[l,String(c.distribution[i])])});
    return `<article class="card insight-block"><header class="insight-head"><div><h2 class="h3">${escapeHtml(c.dim.name)}</h2><p class="insight-value">Чаще всего — «${escapeHtml(c.label)}»</p></div><span class="status-pill status-neutral">${escapeHtml(c.spread.label||"")}</span></header>
      <p class="evidence">${escapeHtml(evidence(c.n,checkinsDative,c.period.from,c.period.to))}</p>
      <figure class="chart-figure"><figcaption>По дням. Тонкая линия — медиана за неделю; пропуски остаются пропусками.</figcaption>${line}</figure>
      <figure class="chart-figure"><figcaption>Как часто встречалось каждое значение</figcaption>${bars}</figure>
      ${baselineText(c)}${table(t1+t2)}</article>`;
  }).join("")}${partOfDayBlock()}</div>`;
}
function partOfDayBlock(){
  const rows=statePartOfDay(state.checkins,state.config,{periodDays:period||null});
  if(!rows.length)return "";
  const t=r=>dataTable({caption:`${r.dim.name} по времени суток`,headers:["Время суток","Отметок","Медиана"],rows:r.buckets.map(b=>[b.label,String(b.n),b.enough?medianLabel(r.dim,b.median):"мало данных"])});
  return `<article class="card insight-block"><header class="insight-head"><div><h2 class="h3">В какое время суток</h2><p class="subtle text-small">Показаны только те части дня, где не меньше ${MIN_N} отметок.</p></div></header>
    <ul class="insight-notes">${rows.map(r=>`<li>${escapeHtml(r.sentence)}</li>`).join("")}</ul>${table(rows.map(t).join(""))}</article>`;
}

/* ---------- contexts ---------- */
function associationCard(r,level=3){
  const t=describeAssociation(r),days=r.days||[];
  return `<article class="card association"><h${level}${level===2?' class="h3"':""}>${escapeHtml(t.title)}</h${level}><p>${escapeHtml(t.detail)}</p><p class="evidence">${escapeHtml(t.evidence)}</p><p class="caution">${icon("info")}<span>${escapeHtml(t.caution)}</span></p>
    <details class="data-details"><summary>${icon("calendar")}<span>По каким дням</span></summary><ul class="days-list">${days.slice(0,60).map(d=>`<li>${escapeHtml(dayText(d))}</li>`).join("")}</ul>${days.length>60?`<p class="subtle text-small">И ещё ${days.length-60}.</p>`:""}<p class="subtle text-small">Метод: сравнение дней с этой меткой и без неё по медиане дня; выводится только устойчивое различие после поправки на множественные сравнения.</p></details></article>`;
}
function contextsTab(sc){
  const r=contextAssociations(sc.entries,sc.checkins,state.config,state.entityNotes);
  const intro=`<p class="subtle settings-lead">Здесь сопоставляются дни: с определённой темой, человеком, местом или занятием — и без них. Это помогает заметить закономерности, но не объясняет причины.</p>`;
  if(r.dayCount<MIN_N)return `${intro}${waiting(r.dayCount,MIN_N,`Пока отмечено только ${r.dayCount} ${dayLabel(r.dayCount)} за выбранный период. Нужно хотя бы ${MIN_N}.`)}`;
  if(!r.labelsTried)return `${intro}${emptyState("Пока нечего сопоставлять","Метка должна встретиться хотя бы в 10 днях с отметками. Помогают темы, люди, места и «Чем занимались» в развёрнутой отметке.","","insights")}`;
  const list=curateAssociations(r.shown);
  if(!list.length)return `${intro}${emptyState("Устойчивых совпадений нет","Проверено сочетаний: "+r.tested+". Ничего не выделяется настолько, чтобы говорить об этом: это тоже результат.","","insights")}`;
  const cut=showAllAssoc?list:list.slice(0,5);
  return `${intro}<div class="insight-list">${cut.map(r=>associationCard(r,2)).join("")}</div>${list.length>5?`<div class="load-more"><button class="secondary" data-action="insights-more">${showAllAssoc?"Показать меньше":`Показать ещё ${list.length-5}`}</button></div>`:""}<p class="subtle text-small">Проверено сочетаний: ${r.tested}. Показаны только те, что остаются заметными после поправки на множественные сравнения; дней с отметками: ${r.dayCount}.</p>`;
}

/* ---------- emotions ---------- */
const INTENSITY=["слабо","слабо","средне","сильно","очень сильно"];
function emotionsTab(sc){
  const em=emotionStats(sc.checkins);
  if(!em.list.length)return emptyState("Эмоции пока не отмечались","Включите «Эмоции» в разделе «Отметки» настроек и выбирайте их в развёрнутой отметке. Это по желанию.",`<button class="secondary" data-action="go" data-to="settings">Открыть настройки</button>`,"insights");
  const max=em.list[0].count,groupName=id=>EMOTION_GROUPS.find(g=>g.id===id)?.name||"Свои";
  const t=dataTable({caption:"Эмоции",headers:["Эмоция","Раз отмечена","В скольких днях","Обычно"],rows:em.list.map(e=>[e.name,String(e.count),String(e.days),INTENSITY[Math.round(e.typical)-1]||""])});
  return `<p class="evidence">${em.checkinsWithEmotions} ${pluralRu(em.checkinsWithEmotions,"отметка","отметки","отметок")} с эмоциями из ${em.total}</p>
    <div class="card"><ul class="bar-list">${em.list.slice(0,12).map(e=>`<li><span class="bar-name">${escapeHtml(e.name)}<small>${escapeHtml(groupName(e.group))}</small></span>${meter(e.count,max)}<span class="bar-count">${e.count} ${pluralRu(e.count,"раз","раза","раз")}${e.typical?`<small>обычно ${INTENSITY[Math.round(e.typical)-1]}</small>`:""}</span></li>`).join("")}</ul></div>
    ${em.together.length?`<section class="section"><h3>Чаще всего вместе</h3><ul class="plain-list">${em.together.map(p=>`<li>«${escapeHtml(p.a)}» и «${escapeHtml(p.b)}» — ${p.count} ${pluralRu(p.count,"раз","раза","раз")}</li>`).join("")}</ul></section>`:""}
    ${table(t)}`;
}

/* ---------- themes & people ---------- */
function themesTab(sc){
  const type=ENTITY_TYPES.find(t=>t.type===entityType)||ENTITY_TYPES[0],rows=entityStats(sc.entries,state.entityNotes,type.type,12);
  const seg=`<div class="segmented" role="group" aria-label="Что показывать">${ENTITY_TYPES.map(t=>`<button data-action="insights-entity" data-value="${t.type}" aria-pressed="${t.type===type.type}" class="${t.type===type.type?"is-active":""}">${t.plural}</button>`).join("")}</div>`;
  if(!rows.length)return `${seg}${emptyState(`${type.plural} пока не упоминались`,"Добавляйте их к записям — и здесь появится, как они распределялись во времени.","","insights")}`;
  const max=rows[0].count;
  const t=dataTable({caption:type.plural,headers:[type.singular,"Записей","Первая","Последняя"],rows:rows.map(r=>[r.name,String(r.count),dayText(dayKey(r.first)),dayText(dayKey(r.last))])});
  return `${seg}<p class="evidence">${sc.entries.length} ${entryLabel(sc.entries.length)} — ${escapeHtml(sc.label)}</p><div class="card"><ul class="bar-list wide">${rows.map(r=>`<li><span class="bar-name"><button class="link-button" data-action="lifemap-open" data-key="${escapeHtml(r.key)}">${escapeHtml(r.name)}</button></span>${meter(r.count,max)}<span class="bar-count">${r.count}</span><span class="strip-wrap">${monthStrip({months:r.months,summary:`${r.name}: записи по месяцам`})}</span></li>`).join("")}</ul></div>${table(t)}`;
}

/* ---------- rhythm ---------- */
function rhythmTab(sc){
  const r=rhythm(sc.entries,sc.today);
  if(!r.total)return emptyState("Записей за этот период нет","Ритм письма появится после первых записей.","","insights");
  const tod=barChart({items:r.timeOfDay.map(x=>({label:x.label,count:x.count})),summary:"Когда вы обычно пишете: ночью, утром, днём, вечером"});
  const wd=barChart({items:r.weekday.map(x=>({label:x.label,count:x.count})),summary:"Записей по дням недели"});
  const wk=barChart({items:r.weeks.map(x=>({label:fmtDate(`${x.from}T12:00:00`),count:x.count})),width:640,summary:"Записей по неделям за последние 12 недель"});
  const t=dataTable({caption:"Записи по неделям",headers:["Неделя с","Записей"],rows:r.weeks.map(w=>[dayText(w.from),String(w.count)])});
  return `<p class="evidence">${r.total} ${entryLabel(r.total)}, дней с записями: ${r.activeDays} — ${escapeHtml(sc.label)}</p>
    <div class="insight-grid two"><figure class="card chart-figure"><figcaption>Время суток</figcaption>${tod}</figure><figure class="card chart-figure"><figcaption>Дни недели</figcaption>${wd}</figure></div>
    <figure class="card chart-figure"><figcaption>Последние 12 недель</figcaption>${wk}</figure>${table(t)}
    <p class="subtle text-small">Это описание привычек, а не оценка. Пропущенные недели — просто пропущенные недели.</p>`;
}

/* ---------- writing effect ---------- */
function writingTab(){
  const w=writingEffect(state.checkins,state.config);
  const need=`<p class="subtle settings-lead">Если включить «Отметку до и после письма», Narra будет иногда предлагать две короткие отметки вокруг записи. Тогда здесь видно, как письмо связано с состоянием — по вашим собственным парам.</p>`;
  if(w.pairCount<MIN_N)return `${need}${waiting(w.pairCount,MIN_N,`Пар «до и после» пока ${w.pairCount}. Нужно хотя бы ${MIN_N}.`)}${state.config?.pairing?"":`<button class="secondary" data-action="go" data-to="settings">Включить в настройках</button>`}`;
  return `${need}<p class="evidence">По ${w.pairCount} ${pluralRu(w.pairCount,"паре","парам","парам")} отметок до и после письма</p><div class="insight-list">${w.dims.filter(d=>d.ok).map(d=>`<article class="card association"><h3>${escapeHtml(d.dim.name)}</h3><p>После письма: выше — в ${d.up} из ${d.n}, так же — в ${d.same}, ниже — в ${d.down}.</p><p class="caution">${icon("info")}<span>Это совпадение по вашим отметкам, а не доказательство, что письмо что-то вызвало.</span></p></article>`).join("")||`<p class="subtle">По отдельным полям пар пока недостаточно.</p>`}</div>`;
}

export function insightsView(){
  const items=TABS.filter(t=>t[0]!=="writing"||true);
  if(!items.some(t=>t[0]===state.insightsTab))state.insightsTab="overview";
  const sc=scope(),tab=state.insightsTab;
  const body={overview:overviewTab,states:statesTab,contexts:contextsTab,emotions:emotionsTab,themes:themesTab,rhythm:rhythmTab,writing:writingTab}[tab](sc);
  return `${pageHeader("Что видно со стороны","Наблюдения","Спокойные сводки по вашим записям и отметкам. Без оценок и диагнозов.")}${tabs("insights",items,tab,{label:"Разделы наблюдений"})}${tab==="writing"?"":periodBar()}<div id="panel-insights" role="tabpanel" aria-labelledby="tab-insights-${tab}" class="insights-panel">${body}</div>`;
}
export const views={insights:insightsView};
export const actions={
  "insights-period":el=>{period=Number(el.dataset.value);ctx.render();$(`[data-action="insights-period"][data-value="${period}"]`)?.focus({preventScroll:true});},
  "insights-more":()=>{showAllAssoc=!showAllAssoc;ctx.render();},
  "insights-entity":el=>{entityType=el.dataset.value;ctx.render();$(`[data-action="insights-entity"][data-value="${entityType}"]`)?.focus({preventScroll:true});},
};
export {featureOn,activeDimensions,EMOTION_GROUP_OF,dimLabel,checkinWord};
