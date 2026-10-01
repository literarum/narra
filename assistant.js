/* Writing assistant in the editor (loads on first use). Everything goes through the consent gateway and the hub:
   the person sees what would be sent (and roughly what it costs), confirms it, and the result is a draft that changes nothing until accepted. */
import {state,ctx,$,escapeHtml,icon} from "./core.js?v=4.6.0";
import {canRun,REASON_TEXT,transcribeSupport,AI_FEATURES,FEATURE_GROUPS,FEATURE_PROMPTS,REWRITE_STYLES,createProvider,cleanAiState,providerById,featureById,parseAnalysis,parseTitles,parseTasks} from "./ai.mjs?v=4.6.0";
import * as store from "./store.js?v=4.6.0";
import * as hub from "./hub.js?v=4.6.0";
import {modalHeader} from "./kit.js?v=4.6.0";
import {compressText,estimateTokens,tierById,fmtTok,tokensToChars} from "./brain.mjs?v=4.6.0";
import {mdToPlain,strip} from "./text.mjs?v=4.6.0";
import {wordCount} from "./domain.mjs?v=4.6.0";

let job=null; // {controller, featureId}
const cfg=()=>cleanAiState(state.ai);
const connected=()=>hub.connected();
const CACHEABLE=new Set(["title","analyze","tasks","summarize","suggest","questions"]);
const VALID={title:t=>parseTitles(t).length>0,analyze:t=>Boolean(parseAnalysis(t)),tasks:t=>parseTasks(t).length>0};
const MIN_WORDS={decision:4,rewrite:1,continue:3,echoes:6,analyze:8,reframe:8,tasks:4,title:5,questions:6,summarize:10,suggest:6};

/* ---------- where the text comes from ---------- */
const decisionText=()=>{
  const d=state.editing?.decision||{},rows=[["Что решаю",d.decision],["Контекст",d.context],["Варианты",d.options],["Чего жду",d.expected],["Уверенность (1–5)",d.confidence],["Что получилось",d.outcome]].filter(([,v])=>v);
  const body=($("#entry-body")?.value||"").trim();
  return `${rows.map(([k,v])=>`${k}: ${v}`).join("\n")}${body?`\n\nЗапись:\n${body}`:""}`.trim();
};
function source(featureId){
  const body=$("#entry-body");if(!body)return null;
  if(featureId==="decision"){const t=decisionText();return t?{text:t,s:0,e:0,whole:true,virtual:true}:null;}
  const s=body.selectionStart,e=body.selectionEnd,sel=body.value.slice(s,e).trim();
  if(featureId==="rewrite"&&sel)return {text:body.value.slice(s,e),s,e,whole:false};
  const text=body.value.trim();
  return text?{text:body.value,s:0,e:body.value.length,whole:true}:null;
}
/** Long entries are sent in a compressed form (the most informative sentences): the main saving for the analysis-type functions. */
function shaped(featureId,src){
  if(featureId==="rewrite")return {text:src.text,compressed:false,original:src.text.length};
  const cap=Math.round(tokensToChars(tierById(cfg().tier).context*2.2));
  if(src.text.length<=cap)return {text:src.text,compressed:false,original:src.text.length};
  return {text:compressText(src.text,cap),compressed:true,original:src.text.length};
}
/** A few short samples of how the author writes (for «Продолжить мысль»): recent entries, never private ones. */
function voiceSample(){
  const cur=state.editing?.id;
  const list=hub.eligibleEntries().filter(e=>e.id!==cur&&wordCount(e.body)>=25).sort((a,b)=>new Date(b.happenedAt)-new Date(a.happenedAt)).slice(0,2);
  return list.map(e=>`— ${compressText(e.body,240)}`).join("\n");
}
function echoesContext(text){
  const cx=hub.diaryContext({query:text.slice(0,500),withProfile:false,notes:5,excludeIds:state.editing?.id?[state.editing.id]:[],useCheckins:false});
  return {context:cx.retrieved.map(i=>i.text).join("\n"),count:cx.retrieved.length};
}

/* ---------- the menu ---------- */
const CHIP_FEATURES=["continue","questions","title","analyze","reframe","echoes"];
function featureButton(f,{style=null,label=null}={}){
  const a=cfg(),allowed=a.features[f.id];
  return `<button type="button" class="ai-choice${allowed?"":" is-locked"}" data-action="ai-run" data-feature="${f.id}" ${style?`data-style="${style}"`:""}>${icon(allowed?f.icon:"lock")}<span><strong>${escapeHtml(label||f.name)}</strong>${label?"":`<small>${escapeHtml(f.blurb||"")}</small>`}</span></button>`;
}
function menu(){
  const a=cfg(),p=providerById(a.provider);
  if(!connected()){
    const why=!a.enabled?"Помощник выключен.":"Помощник ещё не подключён: нужен ключ доступа.";
    return ctx.sheetDialog(`${modalHeader("Помощник","Работает только по вашей просьбе","sparkle","close-dialog")}<div class="modal-body"><p>${why} Подключить его и выбрать, что разрешено, можно в настройках — это займёт минуту:</p><div class="modal-actions"><button class="primary" data-action="ai-to-settings">Открыть настройки</button></div></div>`,"Помощник");
  }
  const body=$("#entry-body"),sel=body?body.selectionEnd-body.selectionStart:0;
  const write=FEATURE_GROUPS.find(g=>g.id==="write"),get=id=>featureById(id);
  const styles=REWRITE_STYLES.map(([id,label])=>featureButton(get("rewrite"),{style:id,label})).join("");
  const others=id=>featureButton(get(id));
  return ctx.sheetDialog(`${modalHeader("Помощник",`${p.name} · ${a.model||p.model}`,"sparkle","close-dialog")}<div class="modal-body ai-menu">
    <p class="subtle">Перед отправкой вы увидите, что уйдёт и примерно сколько это стоит.${sel?` Выделено: ${sel} зн.`:""}</p>
    <h3 class="ai-h">Править ${sel?"выделенное":"текст"}</h3><div class="ai-styles">${styles}</div>
    <h3 class="ai-h">Продолжить и углубить</h3><div class="ai-list">${["continue","questions","reframe","echoes"].map(others).join("")}</div>
    <h3 class="ai-h">Оформить запись</h3><div class="ai-list">${["title","analyze","tasks","summarize"].map(others).join("")}</div>
    <p class="subtle text-small ai-foot">Заблокированные значком замка функции можно разрешить прямо здесь — перед первым запуском спросим. «Разбор записи» делает за один запрос то, что иначе потребовало бы три.</p>
    </div>`,"Помощник");
}

/* ---------- running a feature ---------- */
function ensureConsent(f,then){
  if(cfg().features[f.id])return then();
  ctx.confirmDialog({title:`Разрешить «${f.name}»?`,iconName:"sparkle",confirmLabel:"Разрешить и продолжить",text:`Отправляется: ${f.sends}. Каждый запуск вы подтверждаете отдельно. Отозвать согласие можно в настройках помощника.`},async()=>{
    await store.saveAiState({...cfg(),features:{...cfg().features,[f.id]:true}});setTimeout(then,80);
  });
}
function start(featureId,style=null){
  const f=featureById(featureId);if(!f||f.kind==="audio"||f.kind==="chat")return;
  if(!connected()){menu();return;}
  ensureConsent(f,()=>prepare(f,style));
}
function prepare(f,style){
  const src=source(f.id);
  if(!src){ctx.toast("В записи пока нет текста.");return;}
  if(wordCount(src.text)<(MIN_WORDS[f.id]||1)){ctx.toast("Для этого действия нужно чуть больше текста.");return;}
  const a=cfg(),p=providerById(a.provider),sh=shaped(f.id,src);
  const opts={};
  let estText=sh.text;
  if(f.id==="continue")opts.voice=voiceSample();
  if(f.id==="echoes"){const e=echoesContext(sh.text);if(!e.count){ctx.toast("Похожих прошлых записей пока не нашлось — сравнивать не с чем.");return;}opts.context=e.context;}
  if(style)opts.style=style;
  const prompt=FEATURE_PROMPTS[f.id](sh.text,opts);
  const estIn=estimateTokens(prompt)+40,fast=f.role==="fast"&&a.modelFast;
  const which=fast?`быстрая модель ${a.modelFast}`:(a.model||p.model);
  const extra=f.id==="echoes"?` Кроме того, уйдёт ${opts.context.split("\n").length} коротких выдержек из похожих прошлых записей (подобраны на устройстве).`:f.id==="continue"&&opts.voice?" Плюс две короткие выдержки из прошлых записей — чтобы продолжить в вашем голосе.":"";
  const excerpt=(f.id==="echoes"?`${sh.text}\n\n— выдержки —\n${opts.context}`:sh.text);
  ctx.confirmDialog({title:`«${style?REWRITE_STYLES.find(x=>x[0]===style)[1]:f.name}»: отправить?`,iconName:"sparkle",confirmLabel:"Отправить",
    text:`${src.whole?"Вся запись":"Выделенный фрагмент"} (${sh.original} зн.${sh.compressed?`, отправится сжатая версия: ${sh.text.length} зн.`:""}) уйдёт сервису «${p.name}» (${which}). ≈ ${fmtTok(estIn)} токенов на входе.${extra}`,
    detail:excerpt.length>900?`${excerpt.slice(0,900)}…`:excerpt},()=>setTimeout(()=>run(f,src,sh,opts,style),70));
}
async function run(f,src,sh,opts,style){
  const controller=new AbortController();
  job={controller,featureId:f.id};
  const title=style?REWRITE_STYLES.find(x=>x[0]===style)[1]:f.name;
  ctx.sheetDialog(`${modalHeader(title,"","sparkle","ai-cancel")}<div class="modal-body ai-wait" role="status"><i class="ai-dots" aria-hidden="true"><b></b><b></b><b></b></i><p>Помощник читает и думает…</p></div><footer class="modal-footer"><button class="secondary" data-action="ai-cancel">Отмена</button></footer>`,title);
  try{
    const r=await hub.ask({feature:f.id,prompt:FEATURE_PROMPTS[f.id](sh.text,opts),options:opts,cacheable:CACHEABLE.has(f.id),signal:controller.signal,chars:sh.text.length,validate:VALID[f.id]||null,maxTokens:f.id==="rewrite"?Math.min(3200,Math.max(900,Math.round(sh.text.length/2)+250)):undefined});
    if(job?.controller!==controller)return;
    job=null;
    if(!$("#dialog-root .ai-wait"))return;
    state.aiResult={featureId:f.id,text:r.text,src,style,usage:r.usage,cached:r.cached};
    showResult(f,r,style);
  }catch(error){
    if(job?.controller!==controller)return;
    job=null;
    if(error?.name==="AbortError")return;
    ctx.sheetDialog(`${modalHeader("Не получилось","","sparkle","close-dialog")}<div class="modal-body"><p>${escapeHtml(error?.friendly?`${error.message} Запись не изменена.`:"Запись не изменена. Попробуйте помощника позже.")}</p></div><footer class="modal-footer"><button class="secondary" data-action="close-dialog">Закрыть</button><button class="primary" data-action="ai-open">Другое действие</button></footer>`,"Ошибка помощника");
  }
}

/* ---------- results ---------- */
const usageLine=r=>r.truncated?"Ответ оборвался из-за ограничения длины: использовать его вместо текста нельзя, но можно скопировать или вставить в конец.":r.cached?"Ответ взят из кэша — токены не тратились.":r.usage?.inTok?`Израсходовано: ≈ ${fmtTok(r.usage.inTok+r.usage.outTok)} токенов${r.usage.cachedIn?` (из них ${fmtTok(r.usage.cachedIn)} по сниженной цене кэша сервиса)`:""}.`:"";
const resultShell=(title,sub,inner,buttons,r)=>ctx.sheetDialog(`${modalHeader(title,sub,"sparkle","close-dialog")}<div class="modal-body">${inner}<p class="subtle text-small ai-usage-line">${escapeHtml(usageLine(r||{}))}</p></div><footer class="modal-footer">${buttons}</footer>`,title);
const B=(action,label,cls="secondary",attrs="")=>`<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
function showResult(f,r,style){
  const text=r.text.trim(),draft="Черновик: запись пока не изменена";
  if(f.id==="rewrite"){
    const t=style?REWRITE_STYLES.find(x=>x[0]===style)[1]:f.name;
    return resultShell(t,draft,`<div class="ai-result" tabindex="0">${escapeHtml(text)}</div>`,`${B("ai-copy","Копировать","ghost")}${B("ai-insert","Вставить в конец","secondary")}${r.truncated?"":B("ai-replace","Заменить","primary")}`,r);
  }
  if(f.id==="title"){
    const titles=parseTitles(text);
    if(!titles.length)return resultShell(f.name,draft,`<div class="ai-result">${escapeHtml(text)}</div>`,B("ai-copy","Копировать","ghost"),r);
    state.aiResult.titles=titles;
    return resultShell(f.name,"Выберите вариант — заголовок подставится в запись",`<div class="ai-options">${titles.map((t,i)=>`<button type="button" class="ai-option" data-action="ai-apply-title" data-i="${i}">${escapeHtml(t)}</button>`).join("")}</div>`,B("close-dialog","Закрыть","secondary"),r);
  }
  if(f.id==="analyze"){
    const a=parseAnalysis(text);
    if(!a)return resultShell(f.name,draft,`<div class="ai-result">${escapeHtml(text)}</div>`,B("ai-copy","Копировать","ghost"),r);
    state.aiResult.analysis=a;
    const chips=(label,list)=>list.length?`<div class="ai-row"><span class="ai-k">${label}</span><span class="ai-chips">${list.map(x=>`<i>${escapeHtml(x)}</i>`).join("")}</span></div>`:"";
    const moodWords=a.mood?[a.mood.valence!=null?`настроение ${["очень низкое","низкое","нейтральное","хорошее","очень хорошее"][a.mood.valence+2]}`:"",a.mood.energy!=null?`энергия ${a.mood.energy} из 5`:"",a.mood.tension!=null?`напряжение ${a.mood.tension} из 5`:""].filter(Boolean).join(", "):"";
    const canTags=a.themes.length||a.people.length||a.places.length;
    return resultShell("Разбор записи",draft,`${a.summary?`<p class="ai-summary">${escapeHtml(a.summary)}</p>`:""}${chips("Темы",a.themes)}${chips("Люди",a.people)}${chips("Места",a.places)}${moodWords?`<div class="ai-row"><span class="ai-k">Состояние</span><span>${escapeHtml(moodWords)}<small class="subtle"> — оценка по тексту, а не ваша отметка</small></span></div>`:""}${a.tasks.length?`<div class="ai-row"><span class="ai-k">Задачи</span><ul class="ai-ul">${a.tasks.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></div>`:""}${a.questions.length?`<div class="ai-row"><span class="ai-k">Вопросы</span><ul class="ai-ul">${a.questions.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></div>`:""}`,
      `${canTags?B("ai-apply-tags","Добавить темы и людей","secondary"):""}${a.tasks.length?B("ai-insert-tasks","Вставить задачи","secondary"):""}${a.questions.length?B("ai-insert-questions","Вставить вопросы","secondary"):""}${B("close-dialog","Закрыть","ghost")}`,r);
  }
  if(f.id==="tasks"){
    const tasks=parseTasks(text);
    if(!tasks.length)return resultShell(f.name,"","<p>В записи нет явных дел — ничего не вставлено.</p>",B("close-dialog","Закрыть","secondary"),r);
    state.aiResult.analysis={tasks};
    return resultShell(f.name,draft,`<ul class="ai-ul">${tasks.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>`,`${B("ai-copy","Копировать","ghost")}${B("ai-insert-tasks","Вставить чек-лист","primary")}`,r);
  }
  if(f.id==="questions"){
    const qs=text.split(/\n+/).map(l=>l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/,"").trim()).filter(Boolean).slice(0,6);
    state.aiResult.analysis={questions:qs};
    return resultShell(f.name,draft,`<ul class="ai-ul">${qs.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>`,`${B("ai-copy","Копировать","ghost")}${B("ai-insert-questions","Вставить в запись","primary")}`,r);
  }
  if(f.id==="continue"){
    return resultShell(f.name,draft,`<div class="ai-result" tabindex="0">${escapeHtml(text)}</div>`,`${B("ai-copy","Копировать","ghost")}${B("ai-insert-plain","Дописать в конец","primary")}${B("ai-run","Другой вариант","secondary",`data-feature="continue"`)}`,r);
  }
  return resultShell(f.name,draft,`<div class="ai-result" tabindex="0">${escapeHtml(text)}</div>`,`${B("ai-copy","Копировать","ghost")}${B("ai-insert","Вставить в конец","primary")}`,r);
}
function quoted(t){return t.split("\n").map(l=>`> ${l}`.trimEnd()).join("\n");}
function insertEnd(text){
  const body=$("#entry-body");if(!body)return;
  ctx.closeDialog();body.focus();body.setSelectionRange(body.value.length,body.value.length);
  ctx.insertAtCaret(`${body.value.trim()?"\n\n":""}${text}\n`);
}
const setField=(id,value)=>{const n=$(id);if(!n)return;n.value=value;n.dispatchEvent(new Event("input",{bubbles:true}));};
const merge=(id,list,lower=false)=>{const n=$(id);if(!n)return;const cur=n.value.split(",").map(x=>x.trim()).filter(Boolean),add=list.map(x=>lower?x.toLocaleLowerCase("ru-RU"):x);setField(id,[...new Set([...cur,...add])].join(", "));};

/* ---------- audio → text (unchanged behaviour, now metered) ---------- */
async function transcribe(id){
  const a=cfg(),att=state.attachments.find(x=>x.id===id);
  if(!att)return;
  const gate=canRun(a,"transcribe",createProvider(a,state.aiKey));
  if(!gate.ok){ctx.toast(gate.reason==="no-consent"?"Включите «Расшифровка голосовых записей» в настройках помощника.":REASON_TEXT[gate.reason]||"Помощник недоступен.");return;}
  const sup=transcribeSupport(a);
  if(!sup.ok){ctx.toast(sup.reason);return;}
  const p=providerById(a.provider);
  ctx.confirmDialog({title:"Расшифровать запись?",iconName:"mic",confirmLabel:"Отправить и расшифровать",text:`Звук этой записи (${Math.round((att.size||0)/1024)} КБ) уйдёт сервису «${p.name}» и вернётся текстом. Больше ничего отправлено не будет.`},()=>setTimeout(async()=>{
    const controller=new AbortController();job={controller,featureId:"transcribe"};
    ctx.sheetDialog(`${modalHeader("Расшифровка","","mic","ai-cancel")}<div class="modal-body ai-wait" role="status"><i class="ai-dots" aria-hidden="true"><b></b><b></b><b></b></i><p>Слушаем запись…</p></div>`,"Расшифровка");
    try{
      const bytes=await store.readAttachmentBytes(id);
      if(!bytes)throw Object.assign(new Error("Файл записи недоступен."),{friendly:true});
      const text=await createProvider(a,state.aiKey).transcribe({bytes,mime:att.mime,name:att.name},{signal:controller.signal});
      if(job?.controller!==controller)return;job=null;
      try{await store.saveAiState({...cfg(),log:[...cfg().log,{feature:"transcribe",status:"ok",at:new Date().toISOString(),chars:0}].slice(-50)});}catch{}
      state.aiResult={featureId:"transcribe",text,src:null};
      ctx.sheetDialog(`${modalHeader("Расшифровка","Проверьте текст: он мог распознаться неточно","mic","close-dialog")}<div class="modal-body"><div class="ai-result" tabindex="0">${escapeHtml(text)}</div></div><footer class="modal-footer"><button class="ghost" data-action="ai-copy">Копировать</button><button class="primary" data-action="ai-insert-plain">Вставить в запись</button></footer>`,"Расшифровка");
    }catch(error){
      if(job?.controller!==controller)return;job=null;
      ctx.sheetDialog(`${modalHeader("Не получилось","","mic","close-dialog")}<div class="modal-body"><p>${escapeHtml(error?.friendly?error.message:"Не удалось расшифровать запись. Запись осталась как была.")}</p></div><footer class="modal-footer"><button class="secondary" data-action="close-dialog">Закрыть</button></footer>`,"Ошибка расшифровки");
    }
  },60));
}

/* ---------- from other screens: a period story, a question of the day ---------- */
export async function periodStory(digestText,label){
  const f=featureById("period");
  if(!connected()){ctx.toast("Помощник не подключён. Откройте настройки → «Помощник».");return;}
  ensureConsent(f,()=>{
    const p=providerById(cfg().provider);
    ctx.confirmDialog({title:"Рассказать этот период?",iconName:"sparkle",confirmLabel:"Отправить",text:`Сервису «${p.name}» уйдёт сводка периода «${label}»: заголовки записей, темы, люди и динамика отметок — без полного текста записей. ≈ ${fmtTok(estimateTokens(digestText)+60)} токенов.`,detail:digestText},()=>setTimeout(async()=>{
      const controller=new AbortController();job={controller,featureId:"period"};
      ctx.sheetDialog(`${modalHeader("Рассказ о периоде","","sparkle","ai-cancel")}<div class="modal-body ai-wait" role="status"><i class="ai-dots" aria-hidden="true"><b></b><b></b><b></b></i><p>Собираем рассказ…</p></div>`,"Рассказ о периоде");
      try{
        const r=await hub.ask({feature:"period",prompt:FEATURE_PROMPTS.period(digestText),cacheable:true,signal:controller.signal,chars:digestText.length});
        if(job?.controller!==controller)return;job=null;
        if(!$("#dialog-root .ai-wait"))return;
        state.aiResult={featureId:"period",text:r.text,src:null};
        resultShell(`Рассказ: ${label}`,"Черновик: ничего не сохранено",`<div class="ai-result" tabindex="0">${escapeHtml(r.text.trim())}</div>`,`${B("ai-copy","Копировать","ghost")}${B("ai-to-entry","В новую запись","primary")}`,r);
      }catch(error){
        if(job?.controller!==controller)return;job=null;if(error?.name==="AbortError")return;
        ctx.sheetDialog(`${modalHeader("Не получилось","","sparkle","close-dialog")}<div class="modal-body"><p>${escapeHtml(error?.friendly?error.message:"Помощник недоступен. Попробуйте позже.")}</p></div>`,"Ошибка");
      }
    },70));
  });
}
export async function dailyQuestion(){
  const f=featureById("daily");
  if(!connected())return null;
  if(!cfg().features.daily)return null;
  const cx=hub.diaryContext({query:"",withProfile:true,notes:0});
  if(!cx.profile)return null;
  try{
    const r=await hub.ask({feature:"daily",prompt:FEATURE_PROMPTS.daily(cx.profile),cacheable:true,chars:cx.profile.length,baselineTokens:cx.baseline});
    return strip(r.text).replace(/^["«]|["»]$/g,"").slice(0,200);
  }catch{return null;}
}

/** «Вопрос по моим записям» on the Today card: asks once for consent, then puts one personal question in place of the stock one. */
export function dailyQuestionFlow(){
  const f=featureById("daily");
  if(!connected()){menu();return;}
  ensureConsent(f,async()=>{
    const slot=$("#prompt-section .prompt-card p"),was=slot?.textContent||"";
    if(slot)slot.textContent="Подбираю вопрос по вашим записям…";
    const q=await dailyQuestion();
    if(!q){if(slot)slot.textContent=was;ctx.toast("Не получилось подобрать вопрос. Остался обычный.");return;}
    state.aiPrompt=q;if(slot){slot.textContent=q;ctx.animateIn(slot);}
  });
}
export const actions={
  "ai-transcribe":el=>transcribe(el.dataset.id),
  "ai-insert-plain":()=>{
    const r=state.aiResult,body=$("#entry-body");if(!r||!body)return;
    insertEnd(r.text.trim());ctx.toast("Текст вставлен в конец записи.");
  },
  "ai-open":()=>menu(),
  "ai-run":el=>start(el.dataset.feature,el.dataset.style||null),
  "ai-cancel":()=>{job?.controller.abort();job=null;ctx.closeDialog();},
  "ai-to-settings":async()=>{ctx.closeDialog();await ctx.ACTIONS["close-editor"]?.();setTimeout(()=>{ctx.goTo("settings");setTimeout(()=>ctx.ACTIONS["open-ai-settings"]?.(),120);},120);},
  "ai-copy":async()=>{try{await navigator.clipboard.writeText(state.aiResult?.text||"");ctx.toast("Скопировано.");}catch{ctx.toast("Не удалось скопировать. Выделите текст и скопируйте вручную.");}},
  "ai-insert":()=>{
    const r=state.aiResult;if(!r)return;
    insertEnd(quoted(r.text.trim()));ctx.toast("Вставлено в конец записи. Отменить можно как обычно.");
  },
  "ai-replace":()=>{
    const r=state.aiResult,body=$("#entry-body");if(!r||!body||!r.src)return;
    if(body.value.slice(r.src.s,r.src.e)!==r.src.text){ctx.toast("Текст записи изменился, пока помощник работал. Заменить нечего — вставьте результат в конец.");return;}
    ctx.closeDialog();
    const lead=r.src.text.match(/^\s*/)[0],tail=r.src.text.match(/\s*$/)[0];
    body.focus();body.setSelectionRange(r.src.s,r.src.e);
    ctx.insertAtCaret(`${lead}${r.text.trim()}${r.src.text.trim()?tail:""}`);
    ctx.toast("Заменено. Вернуть прежний текст можно кнопкой «Отменить».");
  },
  "ai-apply-title":el=>{
    const t=state.aiResult?.titles?.[Number(el.dataset.i)];if(!t)return;
    setField("#entry-title",t);ctx.closeDialog();ctx.toast("Заголовок подставлен.");
  },
  "ai-apply-tags":()=>{
    const a=state.aiResult?.analysis;if(!a)return;
    merge("#entry-themes",a.themes||[],true);merge("#entry-people",a.people||[]);
    if(a.places?.[0]&&!$("#entry-location")?.value)setField("#entry-location",a.places[0]);
    ctx.closeDialog();ctx.toast("Темы, люди и места добавлены в детали записи.");
  },
  "ai-insert-tasks":()=>{
    const t=state.aiResult?.analysis?.tasks;if(!t?.length)return;
    insertEnd(t.map(x=>`- [ ] ${x}`).join("\n"));ctx.toast("Чек-лист вставлен в конец записи.");
  },
  "ai-insert-questions":()=>{
    const q=state.aiResult?.analysis?.questions;if(!q?.length)return;
    insertEnd(quoted(q.map(x=>`— ${x}`).join("\n")));ctx.toast("Вопросы вставлены в конец записи.");
  },
  "ai-to-entry":()=>{
    const r=state.aiResult;if(!r)return;
    ctx.closeDialog();ctx.openEditor(null,{body:r.text.trim()});
  },
};
export const views={};
export {CHIP_FEATURES,AI_FEATURES};
