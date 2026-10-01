/* Today: quick capture, a short check-in, one memory, one question, recent entries, first-run welcome. */
import {talkAvailable,state,ctx,$,$$,escapeHtml,icon,uid,nowIso,fmtLong,fmtTime,relDay,activeEntries,sameDay,todayKey,safeStorageGet,safeStorageSet,featureOn,PREF_KEY} from "./core.js?v=4.6.0";
import {entryText} from "./text.mjs?v=4.6.0";
import {pageHeader,modalHeader} from "./kit.js?v=4.6.0";
import {entryRows} from "./entries-ui.js?v=4.6.0";
import {checkinCard} from "./checkin-ui.js?v=4.6.0";
import {memoryCard} from "./memories.js?v=4.6.0";
import * as store from "./store.js?v=4.6.0";

const PROMPTS=[
  "Что сегодня оказалось важнее, чем выглядело сначала?","Какой момент этого дня хочется запомнить?","О чём вы сегодня думали чаще всего?",
  "Что сегодня удивило?","За что сегодня хочется сказать «спасибо»?","Что вы отложили, а хотели бы сделать?","Какой разговор запомнился сегодня?",
  "Что сегодня далось легче, чем ожидалось?","Что бы вы рассказали себе через год об этом дне?","Какая мелочь сегодня порадовала?",
  "Что вас сегодня утомило, а что — наполнило?","Чему вы научились за последнюю неделю?","Что вы хотели бы услышать сейчас от близкого человека?",
  "Какое место сегодня показалось особенным?","Что сегодня было по-настоящему вашим решением?","Какой запах, звук или свет запомнился?",
  "Что из прошлого недавно вспомнилось без повода?","О чём вы сейчас не решаетесь написать?","Что хотелось бы сохранить прямо таким, как есть?",
  "С кем хочется поделиться этим днём?",
  "Что сегодня было трудным — и что помогло с этим справиться?","Кто сегодня был рядом, даже если вы не разговаривали?","Что вы сегодня сделали для себя?",
  "Какое решение вы сейчас обдумываете и что в нём самое важное?","Что бы вы изменили в сегодняшнем дне, если бы могли?","Какая мысль сегодня возвращалась снова и снова?",
  "Что сегодня было похоже на вчера, а что — совсем другим?","Чего вы ждёте от ближайшей недели?","Что сегодня заставило вас улыбнуться?",
  "О чём вы промолчали сегодня, хотя хотелось сказать?","Что вы сегодня заметили вокруг, чего раньше не замечали?","Какой маленький шаг вперёд вы сделали?",
  "Что помогает вам восстанавливаться, когда устаёте?","Что вы сейчас считаете лишним в своей жизни?","Какая привычка сегодня помогла, а какая мешала?",
  "О чём вы мечтали в детстве и что от этого осталось?","Что вы бы сказали себе вчерашнему?","Какой вопрос вы сегодня задавали себе?",
  "Что в вашем окружении сейчас поддерживает вас?","Что вы хотите не забыть об этой неделе?"
];
const USED_KEY="narra-prompts-used";
function usedPrompts(){try{const v=JSON.parse(safeStorageGet(USED_KEY)||"[]");return Array.isArray(v)?v.filter(Number.isInteger):[];}catch{return [];}}
function markPromptUsed(i){const u=usedPrompts().filter(x=>x!==i);u.push(i);safeStorageSet(USED_KEY,JSON.stringify(u.slice(-(PROMPTS.length-6))));}
function promptIndex(){
  const day=Math.floor((new Date()-new Date(new Date().getFullYear(),0,0))/86400000),used=new Set(usedPrompts());
  let i=(day+state.promptShift)%PROMPTS.length;
  for(let n=0;n<PROMPTS.length&&used.has(i);n++)i=(i+1)%PROMPTS.length;
  return i;
}
export function dailyPrompt(){return PROMPTS[promptIndex()];}
/** After a long pause: one kind sentence, no counters, no streaks. Shown once the diary has at least a few entries. */
export function pauseNote(entries,now=new Date()){
  const act=entries.filter(e=>!e.deletedAt);
  if(act.length<3)return "";
  const last=act.reduce((a,e)=>Math.max(a,new Date(e.createdAt||e.happenedAt).getTime()),0); // when it was written, not the date it is about
  const days=Math.floor((now.getTime()-last)/86400000);
  if(days<5)return "";
  const n=days>=60?"больше двух месяцев":days>=30?"больше месяца":`${days} ${days%10===1&&days%100!==11?"день":days%10>=2&&days%10<=4&&(days%100<12||days%100>14)?"дня":"дней"}`;
  return `<p class="pause-note">${icon("moon")}<span>С последней записи прошло ${n}. Ничего страшного — можно начать с одной фразы.</span></p>`;
}
const promptMarkup=()=>`<section class="section" id="prompt-section"><div class="section-heading"><h2>Вопрос для размышления</h2></div><article class="card prompt-card"><p>${escapeHtml(dailyPrompt())}</p><div class="prompt-actions"><button class="ghost button-with-icon" data-action="next-prompt" aria-label="Другой вопрос">${icon("refresh")}<span>Другой</span></button>${state.ai?.enabled?`<button class="ghost button-with-icon" data-action="prompt-ai" aria-label="Вопрос по моим записям">${icon("sparkle")}<span>По моим записям</span></button>`:""}<button class="secondary" data-action="use-prompt">Ответить</button></div></article></section>`;
export const greetingText=(now=new Date())=>{const h=now.getHours();return h<5?"Доброй ночи":h<12?"Доброе утро":h<18?"Добрый день":"Добрый вечер";};

function storageNoticeMarkup(){
  if(!state.prefs.showStorageNotice||state.storagePersistent!==false)return "";
  if(Date.now()<=Number(safeStorageGet("narra-storage-notice-until")||0))return "";
  return `<aside class="card notice-card" role="note"><p><strong>Дневник хранится только в этом браузере.</strong> Браузер пока не гарантирует, что данные переживут нехватку места. Защитите хранилище и время от времени делайте резервную копию.</p><div class="notice-actions"><button class="ghost" data-action="snooze-storage-notice">Позже</button><button class="secondary" data-action="request-persistence">Защитить</button></div></aside>`;
}
function welcomeMarkup(){
  if(state.prefs.onboarded||state.mode==="demo")return "";
  return `<aside class="card welcome-card" role="note" aria-labelledby="welcome-title"><div><p class="eyebrow">Добро пожаловать</p><h2 id="welcome-title">Здесь можно просто начать писать</h2><p class="subtle">Всё остальное — отметки состояния, темы, обзоры — необязательно и включается в настройках. Дневник хранится только на этом устройстве.</p></div><div class="welcome-actions"><button class="ghost" data-action="onboard-skip">Пропустить</button><button class="secondary" data-action="onboard-open">Коротко о главном</button></div></aside>`;
}
function reminderMarkup(){
  const p=state.prefs;
  if(!p.reminderOn||safeStorageGet("narra-reminder-dismissed")===todayKey())return "";
  const [h,m]=p.reminderTime.split(":").map(Number),now=new Date();
  if(now.getHours()*60+now.getMinutes()<h*60+m)return "";
  if(activeEntries().some(e=>sameDay(new Date(e.happenedAt),now)))return "";
  return `<aside class="card reminder-card" role="note"><div>${icon("calendar")}<span>Вы собирались записать день. Хватит одной фразы.</span></div><div class="notice-actions"><button class="ghost" data-action="dismiss-reminder">Не сегодня</button><button class="secondary" data-action="quick-focus">Написать</button></div></aside>`;
}
export function todayView(){
  const now=new Date(),p=state.prefs;
  const unfinished=p.showContinue?activeEntries().filter(e=>!e.completedAt).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt))[0]:null;
  const recent=activeEntries().slice(0,4);
  const memory=p.showMemory&&featureOn("featMemories")?memoryCard():"";
  return `${pageHeader(fmtLong(now),greetingText(now),"Спокойное место для того, что хочется сохранить.")}${welcomeMarkup()}${pauseNote(state.entries)}${storageNoticeMarkup()}${reminderMarkup()}
    ${unfinished?`<article class="card continue-card"><div><p class="eyebrow">Продолжить</p><h3>${escapeHtml(entryText(unfinished).title)}</h3><p>Последнее изменение: ${escapeHtml(relDay(unfinished.updatedAt))}, ${escapeHtml(fmtTime(unfinished.updatedAt))}</p></div><button class="secondary" data-action="open-entry" data-id="${escapeHtml(unfinished.id)}">Продолжить</button></article>`:""}
    <div class="hero-grid${p.showCheckin?"":" is-single"}">
      <article class="card quick-card"><div><p class="eyebrow">Быстрая запись</p><h2>Что сейчас хочется запомнить?</h2></div>
        <textarea class="quick-capture" id="quick-capture" aria-label="Быстрая запись" autocomplete="off" spellcheck="${p.spellcheck}" placeholder="Достаточно одной фразы…"></textarea>
        <div class="quick-footer"><span class="save-state" id="quick-state" role="status"><i class="save-dot"></i><span>Начните писать</span></span><div class="quick-actions"><button class="ghost" data-action="expand-quick">Открыть в редакторе</button><button class="primary button-with-icon" id="save-quick" data-action="save-quick" disabled>${icon("check")}<span>Сохранить</span></button></div></div>
      </article>
      ${p.showCheckin?checkinCard():""}
    </div>
    ${memory}
    <div data-talk-slot hidden></div>
    ${p.showPrompt?promptMarkup():""}
    ${p.showRecent?`<section class="section"><div class="section-heading"><h2>Недавние записи</h2><button class="link-button" data-route="journal">Открыть дневник</button></div>${entryRows(recent)}</section>`:""}`;
}

function updateQuickState(){
  const quick=$("#quick-capture"),label=$("#quick-state span"),save=$("#save-quick"),dot=$("#quick-state");
  if(!quick||!label)return;
  const has=Boolean(quick.value.trim());
  label.textContent=has?"Ещё не сохранено":"Начните писать";
  dot?.classList.toggle("is-busy",has);
  if(save)save.disabled=!has;
}
/** Grows with the text up to a comfortable ceiling, then scrolls inside; the card never turns into a long sheet. */
function autosizeQuick(q){
  if(!q||!q.offsetParent)return;
  const max=Math.min(220,Math.round(window.innerHeight*0.32));
  q.style.height="auto";
  const want=Math.min(max,Math.max(q.scrollHeight,0));
  q.style.height=`${want}px`;
  q.classList.toggle("is-capped",q.scrollHeight>max&&q.scrollTop+q.clientHeight<q.scrollHeight-2);
}
function clearQuick(){state.quickDraft="";const q=$("#quick-capture");if(q){q.value="";updateQuickState();autosizeQuick(q);}}
async function quickToEntry(expand=false){
  if(state.quickSaving)return;
  const q=$("#quick-capture")?.value.trim()||"";
  if(expand){clearQuick();ctx.openEditor(null,{body:q});if(q)ctx.markEditorDirty("quick_expand");return;}
  if(!q){ctx.toast("Сначала напишите хотя бы одну фразу.");return;}
  state.quickSaving=true;
  try{
    const recent=activeEntries().find(e=>e.body.trim()===q&&Date.now()-new Date(e.createdAt).getTime()<10000);
    if(recent){ctx.toast("Такая запись только что уже сохранена.");return;}
    const at=nowIso();
    const entry={id:uid(),title:"",body:q,kind:"thought",happenedAt:at,createdAt:at,updatedAt:at,revision:1,favorite:false,sensitive:false,completedAt:at,deletedAt:null,people:[],themes:[],projects:[],location:"",dismissedSuggestions:[],happenedEnd:null,chapterId:null,links:[],decision:null};
    await store.commitEntrySnapshot(entry,"quick_capture");await store.loadData();store.notifyChange("entry");
    clearQuick();ctx.render();
    ctx.toast("Запись сохранена.",{label:"Открыть",action:"open-entry",id:entry.id});
  }catch(error){console.error("Ошибка быстрой записи",error);ctx.toast("Запись не сохранена. Текст остался на экране.");}
  finally{state.quickSaving=false;}
}
export function beforeRender(){const q=$("#quick-capture");if(q)state.quickDraft=q.value;}
export function afterRender(route){
  if(route!=="today")return;
  if(talkAvailable())ctx.loadLazy?.("talk")?.then(m=>m.paintToday?.()).catch(()=>{});
  const quick=$("#quick-capture");
  if(quick){
    if(state.quickDraft){quick.value=state.quickDraft;updateQuickState();}
    autosizeQuick(quick);
    quick.addEventListener("input",()=>{state.quickDraft=quick.value;updateQuickState();autosizeQuick(quick);});
    quick.addEventListener("scroll",()=>autosizeQuick(quick),{passive:true});
    window.addEventListener("resize",()=>autosizeQuick($("#quick-capture")),{passive:true});
    quick.addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key==="Enter"){e.preventDefault();quickToEntry(false);}});
  }
}

const TOUR=[
  ["pen","Пишите как удобно","Достаточно одной фразы на главной странице. Заголовок, темы и тип записи можно добавить потом — или никогда."],
  ["state","Отметки — по желанию","Три быстрых сигнала о самочувствии. Если их накопится достаточно, Narra покажет, что вы сами отметили. Причин и диагнозов она не выдумывает."],
  ["shield","Всё остаётся у вас","Записи лежат в этом браузере в зашифрованном виде и никуда не отправляются. Раз в какое-то время сохраняйте резервную копию в настройках."],
];
function tourSheet(step){
  const [ic,title,text]=TOUR[step],last=step===TOUR.length-1;
  return `${modalHeader("Коротко о главном",`Шаг ${step+1} из ${TOUR.length}`,ic,"close-dialog")}<div class="modal-body tour-body"><h3>${title}</h3><p>${text}</p><div class="tour-dots" aria-hidden="true">${TOUR.map((_,i)=>`<i class="${i===step?"is-on":""}"></i>`).join("")}</div></div><footer class="modal-footer">${step>0?`<button class="secondary" data-action="onboard-step" data-step="${step-1}">Назад</button>`:`<button class="secondary" data-action="onboard-skip">Пропустить</button>`}<button class="primary" data-action="${last?"onboard-done":"onboard-step"}" data-step="${step+1}">${last?"Начать":"Дальше"}</button></footer>`;
}
const finishOnboarding=()=>{ctx.setPref("onboarded",true);ctx.closeDialog({restoreFocus:false});ctx.render();};
export const views={today:todayView};
export const actions={
  "save-quick":()=>quickToEntry(false),
  "expand-quick":()=>quickToEntry(true),
  "quick-focus":()=>{ctx.goTo("today");setTimeout(()=>$("#quick-capture")?.focus(),80);},
  "prompt-ai":async()=>{const m=await ctx.loadLazy("assistant");m.dailyQuestionFlow();},
  "use-prompt":()=>{const i=promptIndex(),text=`${state.aiPrompt||PROMPTS[i]}\n\n`;markPromptUsed(i);state.aiPrompt=null;state.promptShift++;ctx.openEditor(null,{body:text,prefill:text});},
  "next-prompt":()=>{if(state.aiPrompt)state.aiPrompt=null;else{markPromptUsed(promptIndex());state.promptShift++;}const p=$("#prompt-section .prompt-card p");if(p){p.textContent=dailyPrompt();ctx.animateIn(p);}},
  "dismiss-reminder":el=>{safeStorageSet("narra-reminder-dismissed",todayKey());const n=el.closest(".reminder-card");if(n)ctx.collapseAndRemove(n);},
  "onboard-open":()=>ctx.sheetDialog(tourSheet(0),"Коротко о главном"),
  "onboard-step":el=>{const s=Number(el.dataset.step);const box=$("#dialog-root .sheet");if(box)box.innerHTML=tourSheet(Math.max(0,Math.min(TOUR.length-1,s)));},
  "onboard-skip":finishOnboarding,
  "onboard-done":finishOnboarding,
};
export {PROMPTS,PREF_KEY};
