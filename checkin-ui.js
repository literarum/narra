/* Check-in: three quick signals by default; emotions, context, a note and deeper dimensions are opt-in and live in settings.
   Values are stored exactly as chosen. A skipped dimension stays empty — nothing is filled in or averaged. */
import {state,ctx,$,$$,escapeHtml,icon,uid,nowIso,fmtTime,sameDay,checkinLabel,safeStorageGet,safeStorageSet} from "./core.js?v=4.4.0";
import {activeDimensions,emotionGroups,contextGroups,MODE_OPTIONS,WEATHER_OPTIONS,checkinSummary,cleanCheckin,dimLabel,DEFAULT_CONFIG,cleanConfig,CORE_DIMENSIONS} from "./checkin.mjs?v=4.4.0";
import * as store from "./store.js?v=4.4.0";

const emptyDraft=()=>({values:{},emotions:[],context:{needs:[],triggers:[],activities:[],social:[],weather:"",mode:""},note:""});
state.checkinDraft=emptyDraft();
state.entryCheckin=null;
const cfg=()=>state.config||DEFAULT_CONFIG;
const optionalOn=()=>{const c=cfg();return c.emotions||c.context||c.note;};

function dimMarkup(d,draft,scope){
  const chosen=draft.values[d.key],idx=d.values.indexOf(chosen);
  return `<div class="metric${idx>=0?" has-value":""}" data-metric="${d.key}"><div class="metric-label"><span>${escapeHtml(d.name)}</span><span class="metric-value">${idx>=0?escapeHtml(d.labels[idx]):"Не выбрано"}</span></div>
    ${d.note?`<p class="metric-note">${escapeHtml(d.note)}</p>`:""}
    <div class="pips" role="radiogroup" aria-label="${escapeHtml(d.name)}">${d.values.map((v,i)=>`<button type="button" class="pip${i===idx?" is-selected":""}" role="radio" aria-checked="${i===idx}" data-action="pip" data-scope="${scope}" data-key="${d.key}" data-value="${v}" aria-label="${escapeHtml(d.name)}: ${escapeHtml(d.labels[i].toLowerCase())}, ${i+1} из 5">${i+1}</button>`).join("")}</div>
    <div class="pips-legend" aria-hidden="true"><span>${escapeHtml(d.low)}</span><span>${escapeHtml(d.high)}</span></div></div>`;
}
function emotionsMarkup(draft,scope){
  const chosen=new Map(draft.emotions.map(e=>[e.name,e.intensity]));
  const groups=emotionGroups(cfg());
  const own=draft.emotions.filter(e=>!groups.some(g=>g.items.includes(e.name)));
  return `<div class="checkin-block"><div class="block-heading"><strong>Эмоции</strong><span>можно выбрать несколько</span></div>
    ${groups.map(g=>`<div class="chip-row" role="group" aria-label="${escapeHtml(g.name)}"><span class="chip-row-label">${escapeHtml(g.name)}</span>${g.items.map(n=>`<button type="button" class="chip${chosen.has(n)?" is-on":""}" data-action="emotion" data-scope="${scope}" data-name="${escapeHtml(n)}" aria-pressed="${chosen.has(n)}">${escapeHtml(n)}</button>`).join("")}</div>`).join("")}
    ${own.length?`<div class="chip-row"><span class="chip-row-label">Ваши слова</span>${own.map(e=>`<button type="button" class="chip is-on" data-action="emotion" data-scope="${scope}" data-name="${escapeHtml(e.name)}" aria-pressed="true">${escapeHtml(e.name)}</button>`).join("")}</div>`:""}
    <div class="inline-add"><input class="input" id="own-emotion-${scope}" maxlength="32" placeholder="Своё слово" aria-label="Своё слово для эмоции" autocomplete="off"><button type="button" class="secondary" data-action="emotion-own" data-scope="${scope}">Добавить</button></div>
    ${draft.emotions.length?`<div class="intensity-list">${draft.emotions.map(e=>`<div class="intensity-row"><span>${escapeHtml(e.name)}</span><div class="segmented segmented-small" role="group" aria-label="Сила: ${escapeHtml(e.name)}">${[[1,"слабо"],[3,"средне"],[5,"сильно"]].map(([v,l])=>`<button type="button" data-action="emotion-level" data-scope="${scope}" data-name="${escapeHtml(e.name)}" data-value="${v}" aria-pressed="${e.intensity===v}" class="${e.intensity===v?"is-active":""}">${l}</button>`).join("")}</div></div>`).join("")}</div>`:""}</div>`;
}
function contextMarkup(draft,scope){
  const groups=contextGroups(cfg());
  return `<div class="checkin-block"><div class="block-heading"><strong>Контекст</strong><span>что происходило вокруг</span></div>
    ${groups.map(g=>`<div class="chip-row" role="group" aria-label="${escapeHtml(g.name)}"><span class="chip-row-label">${escapeHtml(g.name)}</span>${g.items.map(n=>{const on=(draft.context[g.id]||[]).includes(n);return `<button type="button" class="chip${on?" is-on":""}" data-action="ctx-chip" data-scope="${scope}" data-group="${g.id}" data-name="${escapeHtml(n)}" aria-pressed="${on}">${escapeHtml(n)}</button>`;}).join("")}</div>`).join("")}
    <div class="chip-row" role="group" aria-label="Режим дня"><span class="chip-row-label">Режим</span>${MODE_OPTIONS.map(([v,l])=>`<button type="button" class="chip${draft.context.mode===v?" is-on":""}" data-action="ctx-mode" data-scope="${scope}" data-value="${v}" aria-pressed="${draft.context.mode===v}">${l}</button>`).join("")}</div>
    <div class="chip-row" role="group" aria-label="Погода"><span class="chip-row-label">Погода</span>${WEATHER_OPTIONS.map(w=>`<button type="button" class="chip${draft.context.weather===w?" is-on":""}" data-action="ctx-weather" data-scope="${scope}" data-value="${w}" aria-pressed="${draft.context.weather===w}">${w}</button>`).join("")}</div></div>`;
}
const noteMarkup=(draft,scope)=>`<div class="checkin-block"><label class="field"><span class="label">Заметка к отметке</span><textarea class="input" id="checkin-note-${scope}" rows="2" maxlength="1000" placeholder="Пара слов о том, что сейчас происходит" data-scope="${scope}">${escapeHtml(draft.note||"")}</textarea></label></div>`;

export function todayCheckin(){const now=new Date();return state.checkins.find(c=>sameDay(new Date(c.observedAt),now)&&c.phase==="standalone")||null;}

/** Suggest hiding a dimension that has stayed empty across the last 15 check-ins. A suggestion only; nothing is hidden on its own. */
export function ignoredDimension(){
  const dismissed=new Set(JSON.parse(safeStorageGet("narra-adapt-dismissed")||"[]"));
  const recent=state.checkins.filter(c=>c.phase==="standalone").slice(0,15);
  if(recent.length<15)return null;
  const dims=activeDimensions(cfg());
  if(dims.length<=1)return null;
  for(const d of dims){
    if(dismissed.has(d.key))continue;
    const filled=recent.filter(c=>{const v=d.core?c[d.key]:c.custom?.[d.key];return v!=null;}).length;
    if(filled===0)return d;
  }
  return null;
}
export function checkinCard(){
  const c=cfg(),done=!state.checkinAgain?todayCheckin():null;
  if(done)return `<article class="card checkin-card" aria-labelledby="checkin-title"><h2 id="checkin-title">Короткая отметка</h2><div class="checkin-done">${icon("check")}<p><strong>Отмечено в ${escapeHtml(fmtTime(done.observedAt))}.</strong><br>${escapeHtml(checkinSummary(done,c,{max:4}))}</p><div class="checkin-done-actions"><button class="secondary" data-action="checkin-again">Добавить ещё одну</button><button class="ghost danger-quiet" data-action="delete-checkin" data-id="${escapeHtml(done.id)}">Удалить</button></div></div></article>`;
  const draft=state.checkinDraft,dims=activeDimensions(c),count=Object.keys(draft.values).length;
  const optional=optionalOn();
  const ign=ignoredDimension();
  const blocks=state.checkinExpanded?`${c.emotions?emotionsMarkup(draft,"today"):""}${c.context?contextMarkup(draft,"today"):""}${c.note?noteMarkup(draft,"today"):""}`:"";
  return `<article class="card checkin-card" aria-labelledby="checkin-title">
    <h2 id="checkin-title">Короткая отметка</h2><p class="subtle text-small">Необязательно. ${optional?"Выберите сигналы и сохраните — остальное можно добавить, если хочется.":"Выберите три сигнала — отметка сохранится сама."}</p>
    ${dims.map(d=>dimMarkup(d,draft,"today")).join("")}
    ${optional?`<button type="button" class="expand-toggle" data-action="checkin-expand" aria-expanded="${state.checkinExpanded}">${icon(state.checkinExpanded?"chevron-up":"plus")}<span class="et-full">${state.checkinExpanded?"Свернуть":"Добавить эмоции, контекст, заметку"}</span><span class="et-short">${state.checkinExpanded?"Свернуть":"Эмоции, контекст, заметка"}</span></button>`:""}
    ${blocks}
    ${ign?`<div class="adapt-hint" role="note"><span>Вы давно не отмечали «${escapeHtml(ign.name.toLocaleLowerCase("ru-RU"))}». Скрыть это поле?</span><span class="adapt-actions"><button class="link-button" data-action="adapt-hide" data-key="${ign.key}">Скрыть</button><button class="link-button" data-action="adapt-keep" data-key="${ign.key}">Оставить</button></span></div>`:""}
    <div class="checkin-actions"><button class="secondary" id="save-checkin" data-action="save-checkin" ${count||draft.emotions.length?"":"disabled"}>Сохранить отметку</button></div>
  </article>`;
}

export function entryCheckinSheet(){
  const d=state.entryCheckin,c=cfg(),dims=activeDimensions(c).filter(x=>x.core||x.deep||x.custom);
  const phases=[["standalone","Сейчас"],["before_writing","До письма"],["after_writing","После письма"]];
  return `<header class="modal-header"><div class="modal-heading">${icon("state","modal-heading-icon")}<div><h2>Состояние и запись</h2><p>Отметка привяжется к этой записи. Так со временем видно, меняет ли письмо самочувствие.</p></div></div><button class="icon-button icon-button-quiet" data-action="close-dialog" aria-label="Закрыть">${icon("x")}</button></header>
    <div class="modal-body"><div class="segmented" role="group" aria-label="Когда отмечаете">${phases.map(([v,l])=>`<button type="button" data-action="entry-checkin-phase" data-value="${v}" aria-pressed="${d.phase===v}" class="${d.phase===v?"is-active":""}">${l}</button>`).join("")}</div>
    ${dims.map(x=>dimMarkup(x,d,"entry")).join("")}${c.emotions?emotionsMarkup(d,"entry"):""}</div>
    <footer class="modal-footer"><button class="secondary" data-action="close-dialog">Отмена</button><button class="primary" data-action="save-entry-checkin">Сохранить отметку</button></footer>`;
}
function draftFor(scope){return scope==="entry"?state.entryCheckin:state.checkinDraft;}
function repaint(scope){
  if(scope==="entry"){const box=$("#dialog-root .sheet");if(box){box.innerHTML=entryCheckinSheet();ctx.animateIn?.(null);}}
  else{const card=$(".checkin-card");if(card){const wrap=document.createElement("div");wrap.innerHTML=checkinCard();card.replaceWith(wrap.firstElementChild);}}
}
export async function saveCheckin({auto=false,entryId=null,phase="standalone",draft=null}={}){
  if(state.checkinSaving)return false;
  const d=draft||state.checkinDraft;
  const values=d.values,record={id:uid(),observedAt:nowIso(),phase,entryId,custom:{},emotions:d.emotions,context:d.context,note:d.note||""};
  for(const [k,v] of Object.entries(values)){if(["moodValence","energy","tension"].includes(k))record[k]=v;else record.custom[k]=v;}
  const clean=cleanCheckin(record);
  if(!clean){ctx.toast("Выберите хотя бы один сигнал.");return false;}
  clearTimeout(state.checkinTimer);state.checkinSaving=true;
  // Optimistic: the card switches to "done" at once; the database write follows and is rolled back visibly if it fails.
  const before=state.checkins,prevDraft=state.checkinDraft,prevExpanded=state.checkinExpanded,prevAgain=state.checkinAgain;
  state.checkins=[clean,...before].sort((a,b)=>new Date(b.observedAt)-new Date(a.observedAt));
  if(!draft){state.checkinDraft=emptyDraft();state.checkinAgain=false;state.checkinExpanded=false;}
  ctx.render();
  try{
    await store.saveCheckinRecord(clean);
    ctx.toast(entryId?"Отметка привязана к записи.":"Отметка сохранена.");
    return true;
  }catch(error){
    console.error("Ошибка сохранения отметки",error);
    state.checkins=before;if(!draft){state.checkinDraft=prevDraft;state.checkinExpanded=prevExpanded;state.checkinAgain=prevAgain;}
    ctx.render();ctx.toast("Отметка не сохранена. Ваш выбор остаётся на экране.");return false;
  }
  finally{state.checkinSaving=false;}
}

export const actions={
  pip:el=>{
    const scope=el.dataset.scope,d=draftFor(scope);if(!d)return;
    const key=el.dataset.key,v=Number(el.dataset.value);
    if(d.values[key]===v)delete d.values[key];else d.values[key]=v;
    // repaint only this metric, so focus and scroll stay where they are
    const metric=el.closest(".metric"),dim=activeDimensions(cfg()).find(x=>x.key===key);
    if(metric&&dim){const w=document.createElement("div");w.innerHTML=dimMarkup(dim,d,scope);const fresh=w.firstElementChild;metric.replaceWith(fresh);fresh.querySelector(`[data-value="${v}"]`)?.focus({preventScroll:true});}
    if(scope==="today"){
      const save=$("#save-checkin");if(save)save.disabled=!Object.keys(d.values).length&&!d.emotions.length;
      clearTimeout(state.checkinTimer);
      const need=activeDimensions(cfg()).length;
      if(!optionalOn()&&Object.keys(d.values).length===need)state.checkinTimer=setTimeout(()=>{if(!state.checkinSaving)saveCheckin({auto:true});},650);
    }
  },
  "emotion":el=>{
    const d=draftFor(el.dataset.scope),name=el.dataset.name,i=d.emotions.findIndex(e=>e.name===name);
    if(i>=0)d.emotions.splice(i,1);else if(d.emotions.length<12)d.emotions.push({name,intensity:3});
    repaint(el.dataset.scope);
  },
  "emotion-own":el=>{
    const scope=el.dataset.scope,input=$(`#own-emotion-${scope}`),name=input?.value.trim().slice(0,32);if(!name)return;
    const d=draftFor(scope);if(!d.emotions.some(e=>e.name===name)&&d.emotions.length<12)d.emotions.push({name,intensity:3});
    repaint(scope);
  },
  "emotion-level":el=>{const d=draftFor(el.dataset.scope),e=d.emotions.find(x=>x.name===el.dataset.name);if(e)e.intensity=Number(el.dataset.value);repaint(el.dataset.scope);},
  "ctx-chip":el=>{
    const d=draftFor(el.dataset.scope),g=el.dataset.group,n=el.dataset.name,list=d.context[g]||(d.context[g]=[]),i=list.indexOf(n);
    if(i>=0)list.splice(i,1);else if(list.length<10)list.push(n);
    repaint(el.dataset.scope);
  },
  "ctx-mode":el=>{const d=draftFor(el.dataset.scope);d.context.mode=d.context.mode===el.dataset.value?"":el.dataset.value;repaint(el.dataset.scope);},
  "ctx-weather":el=>{const d=draftFor(el.dataset.scope);d.context.weather=d.context.weather===el.dataset.value?"":el.dataset.value;repaint(el.dataset.scope);},
  "checkin-expand":()=>{state.checkinExpanded=!state.checkinExpanded;repaint("today");},
  "save-checkin":()=>saveCheckin(),
  "checkin-again":()=>{state.checkinAgain=true;state.checkinDraft=emptyDraft();ctx.render();},
  "delete-checkin":el=>ctx.confirmDialog({title:"Удалить отметку?",text:"Отметка будет удалена вместе с эмоциями и контекстом. Это нельзя отменить.",confirmLabel:"Удалить",danger:true,iconName:"trash"},async()=>{
    try{await store.deleteCheckin(el.dataset.id);await store.loadData();ctx.render();ctx.toast("Отметка удалена.");}catch(e){console.error(e);ctx.toast("Не удалось удалить отметку.");}
  }),
  "adapt-hide":async el=>{
    const c=cleanConfig({...cfg(),enabled:{...cfg().enabled,[el.dataset.key]:false}});
    await store.saveConfig(c);ctx.render();ctx.toast("Поле скрыто. Вернуть его можно в настройках, в разделе «Отметки».");
  },
  "adapt-keep":el=>{const l=JSON.parse(safeStorageGet("narra-adapt-dismissed")||"[]");l.push(el.dataset.key);safeStorageSet("narra-adapt-dismissed",JSON.stringify(l));const n=el.closest(".adapt-hint");if(n)ctx.collapseAndRemove(n);},
  "start-checkin":()=>{
    ctx.goTo("today");
    requestAnimationFrame(()=>{const t=$(".metric .pip");if(t){t.scrollIntoView({block:"center",behavior:ctx.reducedMotion()?"auto":"smooth"});t.focus({preventScroll:true});}});
  },
  "entry-checkin":async()=>{
    if(!state.editing)return;
    if(!state.editing.revision){const ok=await ctx.editorSave?.("before_checkin");if(!ok){ctx.toast("Сначала напишите хотя бы одну строку — отметка привяжется к записи.");return;}}
    state.entryCheckin={...emptyDraft(),phase:state.editing.completedAt?"after_writing":"before_writing"};
    ctx.sheetDialog(entryCheckinSheet(),"Состояние и запись");
  },
  "entry-checkin-phase":el=>{state.entryCheckin.phase=el.dataset.value;repaint("entry");},
  "save-entry-checkin":async()=>{
    const d=state.entryCheckin;if(!d||!state.editing)return;
    const ok=await saveCheckin({entryId:state.editing.id,phase:d.phase,draft:d});
    if(ok)ctx.closeDialog();
  },
};
export const on={
  input:e=>{
    const t=e.target;
    if(t.id?.startsWith("checkin-note-")){draftFor(t.dataset.scope).note=t.value;const save=$("#save-checkin");if(save&&t.dataset.scope==="today")save.disabled=false;return true;}
    return false;
  },
};
export const beforeRender=()=>{};
export {emptyDraft,DEFAULT_CONFIG,CORE_DIMENSIONS,checkinLabel};
