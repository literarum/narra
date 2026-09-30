/* Writing assistant in the editor (loads on first use). Everything goes through the consent gateway in ai.mjs:
   the person sees exactly what would be sent, confirms it, and the result is a draft that changes nothing until accepted. */
import {state,ctx,$,escapeHtml,icon} from "./core.js?v=4.5.0";
import {canRun,REASON_TEXT,transcribeSupport,AI_FEATURES,createProvider,runFeature,cleanAiState,providerById,payloadPreview} from "./ai.mjs?v=4.5.0";
import * as store from "./store.js?v=4.5.0";
import {modalHeader} from "./kit.js?v=4.5.0";

let job=null; // {controller, feature, source:{s,e,whole}}
const cfg=()=>cleanAiState(state.ai);
const connected=()=>{const a=cfg(),p=providerById(a.provider);return Boolean(a.enabled&&p&&(state.aiKey||p.needsKey===false));};

function source(featureId){
  const body=$("#entry-body");if(!body)return null;
  const s=body.selectionStart,e=body.selectionEnd,sel=body.value.slice(s,e).trim();
  if(featureId==="rewrite"&&sel)return {text:body.value.slice(s,e),s,e,whole:false};
  const text=body.value.trim();
  return text?{text:body.value,s:0,e:body.value.length,whole:true}:null;
}
function sheet(){
  const a=cfg(),feats=AI_FEATURES.filter(f=>f.kind!=="audio"&&a.features[f.id]);
  const p=providerById(a.provider);
  if(!connected()||!feats.length){
    const why=!a.enabled?"Помощник выключен.":!connected()?"Помощник ещё не подключён: нужен ключ доступа.":"Ни одна функция помощника не разрешена.";
    return ctx.sheetDialog(`${modalHeader("Помощник","Работает только по вашей просьбе","sparkle","close-dialog")}<div class="modal-body"><p>${why} Подключить его и выбрать, что разрешено, можно в настройках — это займёт минуту: достаточно вставить ключ.</p></div><footer class="modal-footer"><button class="secondary" data-action="close-dialog">Позже</button><button class="primary" data-action="ai-to-settings">Открыть настройки</button></footer>`,"Помощник");
  }
  return ctx.sheetDialog(`${modalHeader("Помощник",`${p.name} · ${a.model||p.model}`,"sparkle","close-dialog")}<div class="modal-body ai-menu"><p class="subtle">Выберите действие. Перед отправкой вы увидите, что именно уйдёт.</p>${feats.map(f=>`<button class="ai-choice" data-action="ai-run" data-feature="${f.id}"><strong>${escapeHtml(f.name)}</strong><span>${escapeHtml(f.sends)}</span></button>`).join("")}</div>`,"Помощник");
}
function start(featureId){
  const f=AI_FEATURES.find(x=>x.id===featureId),src=source(featureId);
  if(!f)return;
  if(!src){ctx.toast("В записи пока нет текста.");return;}
  const p=providerById(cfg().provider),pv=payloadPreview(featureId,[{id:state.editing?.id||"entry",title:state.editing?.title||"Запись",text:src.text}]);
  const excerpt=src.text.length>900?`${src.text.slice(0,900)}…`:src.text;
  ctx.confirmDialog({title:"Отправить текст помощнику?",iconName:"sparkle",confirmLabel:"Отправить",
    text:`${src.whole?"Вся запись":"Выделенный фрагмент"} (${pv.totalChars} зн.) уйдёт сервису «${p.name}». Больше ничего отправлено не будет.`,detail:excerpt},()=>setTimeout(()=>run(featureId,src),70));
}
async function run(featureId,src){
  const a=cfg(),f=AI_FEATURES.find(x=>x.id===featureId),controller=new AbortController();
  job={controller,featureId,src};
  ctx.sheetDialog(`${modalHeader(f.name,"","sparkle","ai-cancel")}<div class="modal-body ai-wait" role="status"><i class="ai-dots" aria-hidden="true"><b></b><b></b><b></b></i><p>Помощник читает и думает…</p></div><footer class="modal-footer"><button class="secondary" data-action="ai-cancel">Отмена</button></footer>`,"Помощник думает");
  const res=await runFeature({state:a,provider:createProvider(a,state.aiKey),featureId,items:[{id:state.editing?.id||"entry",title:state.editing?.title||"Запись",text:src.text}],confirmed:true});
  if(job?.controller!==controller)return; // cancelled meanwhile
  job=null;
  if(res.log){try{await store.saveAiState({...cfg(),log:[...cfg().log,res.log]});}catch{}}
  if(!res.ok){
    ctx.sheetDialog(`${modalHeader("Не получилось","","sparkle","close-dialog")}<div class="modal-body"><p>${escapeHtml(res.message||"Помощник недоступен.")}</p></div><footer class="modal-footer"><button class="secondary" data-action="close-dialog">Закрыть</button><button class="primary" data-action="ai-run" data-feature="${featureId}">Повторить</button></footer>`,"Ошибка помощника");
    return;
  }
  state.aiResult={featureId,text:res.output.text,src};
  const canReplace=featureId==="rewrite";
  ctx.sheetDialog(`${modalHeader(f.name,"Черновик: запись пока не изменена","sparkle","close-dialog")}<div class="modal-body"><div class="ai-result" tabindex="0">${escapeHtml(res.output.text)}</div></div><footer class="modal-footer"><button class="secondary" data-action="ai-copy">Копировать</button><button class="secondary" data-action="ai-insert">Вставить в конец</button>${canReplace?`<button class="primary" data-action="ai-replace">${src.whole?"Заменить текст":"Заменить фрагмент"}</button>`:""}</footer>`,"Ответ помощника");
}
function quoted(t){return t.split("\n").map(l=>`> ${l}`.trimEnd()).join("\n");}
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
      try{await store.saveAiState({...cfg(),log:[...cfg().log,{feature:"transcribe",status:"ok",at:new Date().toISOString(),chars:0}].slice(-100)});}catch{}
      state.aiResult={featureId:"transcribe",text,src:null};
      ctx.sheetDialog(`${modalHeader("Расшифровка","Проверьте текст: он мог распознаться неточно","mic","close-dialog")}<div class="modal-body"><div class="ai-result" tabindex="0">${escapeHtml(text)}</div></div><footer class="modal-footer"><button class="ghost" data-action="ai-copy">Скопировать</button><button class="primary" data-action="ai-insert-plain">Вставить в запись</button></footer>`,"Расшифровка");
    }catch(error){
      if(job?.controller!==controller)return;job=null;
      ctx.sheetDialog(`${modalHeader("Не получилось","","mic","close-dialog")}<div class="modal-body"><p>${escapeHtml(error?.friendly?error.message:"Не удалось расшифровать запись. Запись осталась как была.")}</p></div><footer class="modal-footer"><button class="secondary" data-action="close-dialog">Закрыть</button></footer>`,"Ошибка");
    }
  },60));
}
export const actions={
  "ai-transcribe":el=>transcribe(el.dataset.id),
  "ai-insert-plain":()=>{
    const r=state.aiResult,body=$("#entry-body");if(!r||!body)return;
    ctx.closeDialog();body.focus();body.setSelectionRange(body.value.length,body.value.length);
    ctx.insertAtCaret(`${body.value.trim()?"\n\n":""}${r.text}\n`);ctx.toast("Текст вставлен в конец записи.");
  },
  "ai-open":()=>sheet(),
  "ai-run":el=>start(el.dataset.feature),
  "ai-cancel":()=>{job?.controller.abort();job=null;ctx.closeDialog();},
  "ai-to-settings":async()=>{ctx.closeDialog();await ctx.ACTIONS["close-editor"]?.();setTimeout(()=>{ctx.goTo("settings");setTimeout(()=>ctx.ACTIONS["open-privacy"]?.(),120);},120);},
  "ai-copy":async()=>{try{await navigator.clipboard.writeText(state.aiResult?.text||"");ctx.toast("Скопировано.");}catch{ctx.toast("Не удалось скопировать. Выделите текст и скопируйте вручную.");}},
  "ai-insert":()=>{
    const r=state.aiResult,body=$("#entry-body");if(!r||!body)return;
    ctx.closeDialog();
    body.focus();body.setSelectionRange(body.value.length,body.value.length);
    ctx.insertAtCaret(`${body.value.trim()?"\n\n":""}${quoted(r.text)}\n`);
    ctx.toast("Вставлено в конец записи. Отменить можно как обычно.");
  },
  "ai-replace":()=>{
    const r=state.aiResult,body=$("#entry-body");if(!r||!body)return;
    ctx.closeDialog();
    body.focus();body.setSelectionRange(r.src.s,r.src.e);
    ctx.insertAtCaret(r.text);
    ctx.toast("Заменено. Вернуть прежний текст можно кнопкой «Отменить».");
  },
};
export const views={};
