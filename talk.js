/* «Собеседник» and «Спросить дневник»: the conversation screen (loads on first use).
   The thinking about what to send lives in brain.mjs / therapy.mjs / hub.js; this file is the conversation: screens, turns, summary, steps and memory. */
import {state,ctx,$,$$,escapeHtml,icon,uid,nowIso,activeEntries,talkAvailable} from "./core.js?v=4.6.0";
import {pageHeader,modalHeader,statusPill} from "./kit.js?v=4.6.0";
import * as store from "./store.js?v=4.6.0";
import * as hub from "./hub.js?v=4.6.0";
import {newEntry} from "./editor.js?v=4.6.0";
import {cleanAiState} from "./ai-state.mjs?v=4.6.0";
import {MODES,modeById,systemBlocks,CRISIS_ADDENDUM,screenRisk,detectDistortions,distortionStats,DISTORTIONS,parseReply,newSession,addTurn,trajectory,trajectoryWords,nextStepHint,HINT_TEXT,summaryPrompt,parseSummary,SUMMARY_SYSTEM,sessionToEntryBody,cleanMemory,rememberSession,memoryDigest,openHomework,startersFrom,emptyMemory,SUPPORT_CARD as SUPPORT} from "./therapy.mjs?v=4.6.0";
import {compactHistory,tierById,fmtTok} from "./brain.mjs?v=4.6.0";

const T={loaded:null,mode:null,memory:emptyMemory(),session:null,busy:false,controller:null,parts:null,draft:"",sessionTokens:{inTok:0,outTok:0,cached:0,calls:0}};
const ASK_IDEAS=["Что меня радовало этим летом?","Как я справлялась с тревогой раньше?","О чём я чаще всего пишу в последнее время?","Что я решила в прошлом месяце и чем это кончилось?","Когда мне было лучше всего — и что тогда происходило?"];
const vibe=ms=>{if(state.prefs.haptics&&navigator.vibrate)try{navigator.vibrate(ms);}catch{}};

/* ---------- storage ---------- */
async function ensure(){
  if(T.loaded&&T.mode===state.mode){await T.loaded;return;}
  T.mode=state.mode;
  T.loaded=(async()=>{try{T.memory=cleanMemory(await store.metaGetSecure("talk-memory",null));}catch{T.memory=emptyMemory();}})();
  await T.loaded;
}
let memTimer=0;
const saveMemory=()=>{clearTimeout(memTimer);memTimer=setTimeout(()=>store.metaSetSecure("talk-memory",T.memory).catch(()=>{}),150);};
const saveSession=s=>store.metaSetSecure(`talk-s-${s.id}`,s).catch(()=>{});
const readSession=id=>store.metaGetSecure(`talk-s-${id}`,null);
function upsertIndex(s,{title,summary}={}){
  const m=T.memory,row={id:s.id,at:s.startedAt,mode:s.mode,title:title||m.sessions.find(x=>x.id===s.id)?.title||modeLabel(s.mode),summary:summary??m.sessions.find(x=>x.id===s.id)?.summary??"",turns:trajectory(s).turns,risk:s.risk};
  const all=[...m.sessions.filter(x=>x.id!==s.id),row];
  for(const old of all.slice(0,-30))store.del(store.STORES.meta,`talk-s-${old.id}`).catch(()=>{});
  m.sessions=all.slice(-30);saveMemory();
}
const modeLabel=id=>id==="ask"?"Спросить дневник":modeById(id).name;
const ai=()=>cleanAiState(state.ai);

/* ---------- small text helpers ---------- */
const fmtBubble=text=>escapeHtml(text).split(/\n{2,}/).map(p=>`<p>${p.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/\n/g,"<br>")}</p>`).join("");
const dayWord=iso=>{const d=new Date(iso);return new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long"}).format(d);};
const timeWord=iso=>new Intl.DateTimeFormat("ru-RU",{hour:"2-digit",minute:"2-digit"}).format(new Date(iso));

/* ---------- the home screen of the section ---------- */
function statusRow(){
  const a=ai(),t=tierById(a.tier);
  return `<div class="talk-status">${statusPill(hub.modelLabel()||"ИИ не подключён","good","sparkle")}${statusPill(`Расход: ${t.name.toLowerCase()}`,"neutral","coins")}${statusPill(a.talk.diary?"Дневник используется":"Дневник не используется",a.talk.diary?"neutral":"warning","shield")}</div>`;
}
function modeCard(m){
  return `<button type="button" class="talk-mode" data-action="talk-start" data-mode="${m.id}">${icon(m.icon)}<span class="talk-mode-text"><strong>${escapeHtml(m.name)}</strong><small>${escapeHtml(m.blurb)}</small></span></button>`;
}
function startersMarkup(){
  const list=startersFrom({entries:hub.eligibleEntries(),checkins:state.checkins,memory:T.memory});
  return `<section class="section"><div class="section-heading"><h2>Для начала</h2></div><div class="talk-starters">${list.map(s=>`<button type="button" class="talk-starter" data-action="talk-start" data-mode="${s.mode}" data-seed="${encodeURIComponent(s.seed||"")}" ${s.entryId?`data-entry="${escapeHtml(s.entryId)}"`:""}>${icon(modeById(s.mode).icon)}<span>${escapeHtml(s.text)}</span>${icon("arrow-right","talk-go")}</button>`).join("")}</div></section>`;
}
function stepsMarkup(){
  const list=openHomework(T.memory).slice(0,6);
  if(!list.length)return "";
  return `<section class="section"><div class="section-heading"><h2>Мои шаги</h2></div><ul class="talk-steps">${list.map(h=>`<li class="${h.overdue?"is-overdue":""}"><label class="check"><input type="checkbox" data-action="talk-hw-toggle" data-id="${escapeHtml(h.id)}"><span class="check-box"></span><span>${escapeHtml(h.text)}${h.due?`<small>${h.overdue?"Срок был ":"До "}${escapeHtml(dayWord(h.due))}</small>`:""}</span></label><button type="button" class="icon-button icon-button-quiet" data-action="talk-hw-delete" data-id="${escapeHtml(h.id)}" aria-label="Убрать шаг">${icon("x")}</button></li>`).join("")}</ul></section>`;
}
function sessionsMarkup(){
  const list=[...T.memory.sessions].reverse().slice(0,12);
  if(!list.length)return "";
  return `<section class="section"><div class="section-heading"><h2>Прошлые беседы</h2></div><ul class="talk-sessions">${list.map(s=>`<li><button type="button" class="talk-session" data-action="talk-open-session" data-id="${escapeHtml(s.id)}"><span class="talk-session-text"><strong>${escapeHtml(s.title||modeLabel(s.mode))}</strong><small>${escapeHtml(dayWord(s.at))} · ${escapeHtml(modeLabel(s.mode))}${s.turns?` · ${s.turns} ${s.turns%10===1&&s.turns%100!==11?"реплика":"реплик"}`:""}</small></span>${icon("chevron-right")}</button><button type="button" class="icon-button icon-button-quiet" data-action="talk-delete-session" data-id="${escapeHtml(s.id)}" aria-label="Удалить беседу «${escapeHtml(s.title||modeLabel(s.mode))}»">${icon("trash")}</button></li>`).join("")}</ul></section>`;
}
function noticedMarkup(){
  const st=distortionStats(hub.eligibleEntries(),{days:90,min:3}).slice(0,3),ins=T.memory.insights.slice(-3).reverse();
  if(!st.length&&!ins.length)return "";
  return `<section class="section"><div class="section-heading"><h2>Что видно в записях</h2></div><article class="card talk-noticed">
    ${ins.length?`<div><h3>Ваши выводы из бесед</h3><ul>${ins.map(i=>`<li>${escapeHtml(i.text)}<small>${escapeHtml(dayWord(i.at))}</small></li>`).join("")}</ul></div>`:""}
    ${st.length?`<div><h3>Повторяющиеся обороты</h3><ul>${st.map(s=>`<li>${escapeHtml(s.name)} — в ${s.n} ${s.n%10>=2&&s.n%10<=4&&(s.n%100<12||s.n%100>14)?"записях":"записях"} за 90 дней <button type="button" class="link-button" data-action="open-entry" data-id="${escapeHtml(s.entryId)}">пример</button></li>`).join("")}</ul><p class="subtle text-small">Это подсказка по словам, которые встречаются в тексте, а не оценка вас и не диагноз. Считается на устройстве.</p></div>`:""}
  </article></section>`;
}
function homeMarkup(){
  return `${pageHeader("Собеседник","Поговорить о том, что на душе","Беседы опираются на ваши записи и отметки, но решаете вы: что обсуждать и что сохранить.",`<button type="button" class="secondary button-with-icon" data-action="talk-how">${icon("info")}<span>Как это устроено</span></button>`)}
    <aside class="card talk-note" role="note">${icon("shield")}<p>Это собеседник для размышлений, а не психотерапевт и не экстренная помощь. Если вам очень тяжело или вы в опасности, обратитесь к специалисту или в экстренную службу (в России и странах ЕС — 112).</p></aside>
    ${statusRow()}
    ${startersMarkup()}
    <section class="section"><div class="section-heading"><h2>Как поговорить</h2></div><div class="talk-modes">${MODES.filter(m=>m.id!=="entry").map(modeCard).join("")}<button type="button" class="talk-mode is-ask" data-action="talk-start" data-mode="ask">${icon("search")}<span class="talk-mode-text"><strong>Спросить дневник</strong><small>Вопросы по смыслу: что, когда и как вы писали о чём-то. Без психологии — только ваши записи.</small></span></button></div></section>
    ${stepsMarkup()}${noticedMarkup()}${sessionsMarkup()}`;
}
export function talkView(){
  if(!talkAvailable())return `<div class="card empty"><h2>Собеседник выключен</h2><p class="subtle">Подключите помощника и разрешите «Собеседника» в настройках.</p><button class="primary" data-action="open-ai-settings">Открыть настройки</button></div>`;
  if(!T.loaded||T.mode!==state.mode)return `<div class="boot" role="status"><span class="boot-mark" aria-hidden="true">N</span><span>Открываем беседы…</span></div>`;
  return homeMarkup();
}
export const views={talk:talkView};

/* ---------- the conversation window ---------- */
function msgMarkup(m,i,s){
  if(m.role==="user")return `<div class="talk-msg is-user" data-i="${i}"><div class="talk-bubble">${fmtBubble(m.content)}</div></div>`;
  const ins=m.meta?.insight?`<div class="talk-insight">${icon("bulb")}<span>${escapeHtml(m.meta.insight)}</span></div>`:"";
  return `<div class="talk-msg is-ai${m.error?" is-error":""}" data-i="${i}"><div class="talk-bubble">${fmtBubble(m.content)}</div>${ins}</div>`;
}
function supportMarkup(){return `<aside class="talk-support" role="alert">${icon("shield")}<div><strong>${escapeHtml(SUPPORT.title)}</strong><p>${escapeHtml(SUPPORT.text)}</p><small>${escapeHtml(SUPPORT.note)}</small></div></aside>`;}
function moodDots(s){
  const v=trajectory(s).valence;if(v.length<2)return "";
  return `<span class="talk-mood" role="img" aria-label="Как менялось состояние в беседе">${v.map(x=>`<i class="m${x+2}"></i>`).join("")}</span>`;
}
function chatMarkup(s){
  const isAsk=s.mode==="ask",m=isAsk?{name:"Спросить дневник",opener:"Что вы хотите узнать о своих записях?"}:modeById(s.mode);
  const hint=!isAsk?HINT_TEXT[nextStepHint(s)]:"";
  const ideas=isAsk&&s.messages.length<=1?`<div class="talk-ideas">${ASK_IDEAS.map(t=>`<button type="button" class="chip" data-action="talk-idea" data-text="${encodeURIComponent(t)}">${escapeHtml(t)}</button>`).join("")}</div>`:"";
  return `<div class="talk-head"><button type="button" class="icon-button icon-button-quiet" data-action="talk-close" aria-label="Свернуть беседу">${icon("chevron-left")}</button>
      <div class="talk-head-text"><strong>${escapeHtml(m.name)}</strong><small id="talk-sub">${escapeHtml(s.focus?`Фокус: ${s.focus}`:isAsk?"Ответы — только по вашим записям":modeById(s.mode).method)}</small></div>${moodDots(s)}
      <button type="button" class="icon-button icon-button-quiet" data-action="talk-inspect" aria-label="Что видит ИИ" title="Что видит ИИ">${icon("eye")}</button>
      <button type="button" class="secondary talk-finish" data-action="talk-finish">${isAsk?"Закрыть":"Итог"}</button></div>
    <div class="talk-log" id="talk-log" role="log" aria-live="polite" aria-label="Беседа">${s.messages.map((x,i)=>msgMarkup(x,i,s)).join("")}${s.risk==="high"?supportMarkup():""}${T.busy?typingMarkup():""}</div>
    <div class="talk-foot">${ideas}${hint?`<p class="talk-hint" id="talk-hint">${escapeHtml(hint)}</p>`:`<p class="talk-hint" id="talk-hint" hidden></p>`}
      <form class="talk-form" id="talk-form" novalidate><textarea id="talk-input" class="talk-input" rows="1" maxlength="4000" placeholder="${isAsk?"Задайте вопрос о своих записях…":"Напишите, что на душе…"}" aria-label="Ваше сообщение" autocomplete="off" enterkeyhint="send"></textarea>
      <button type="submit" class="primary talk-send" id="talk-send" aria-label="Отправить">${icon("send")}</button></form>
      <p class="talk-meter subtle" id="talk-meter">${meterText()}</p></div>`;
}
const typingMarkup=()=>`<div class="talk-msg is-ai is-typing" id="talk-typing" role="status" aria-label="Собеседник пишет"><div class="talk-bubble"><i class="ai-dots" aria-hidden="true"><b></b><b></b><b></b></i></div><button type="button" class="link-button" data-action="talk-stop">Остановить</button></div>`;
function meterText(){
  const t=T.sessionTokens;if(!t.calls)return "Запросы идут напрямую выбранному сервису. Расход токенов показывается здесь.";
  return `В этой беседе потрачено ≈ ${fmtTok(t.inTok+t.outTok)} токенов${t.cached?` (из них ${fmtTok(t.cached)} взято из кэша сервиса по сниженной цене)`:""}.`;
}
function openChat(s){
  T.session=s;T.parts=null;T.finishing=false;
  const box=ctx.overlay(`<div class="talk-chat" data-mode="${escapeHtml(s.mode)}">${chatMarkup(s)}</div>`,"modal editor-modal talk-modal","Беседа",{kind:"talk",focus:false});
  wire(box);scrollLog(false);
  requestAnimationFrame(()=>{if(!s.messages.some(m=>m.role==="user")||true)$("#talk-input")?.focus({preventScroll:true});});
  return box;
}
function repaint({keepInput=true}={}){
  const s=T.session,host=$(".talk-chat");if(!s||!host)return;
  const draft=$("#talk-input")?.value||"";
  host.innerHTML=chatMarkup(s);
  const inp=$("#talk-input");if(inp&&keepInput){inp.value=draft;autosize(inp);}
  scrollLog(false);
}
function scrollLog(smooth=true){const l=$("#talk-log");if(l)l.scrollTo({top:l.scrollHeight,behavior:smooth&&!ctx.reducedMotion?.()?"smooth":"instant"});}
function autosize(t){if(!t)return;t.style.height="auto";t.style.height=`${Math.min(t.scrollHeight,Math.round(window.innerHeight*.28))}px`;}
function wire(box){
  box.addEventListener("input",e=>{if(e.target.id==="talk-input")autosize(e.target);});
  box.addEventListener("keydown",e=>{if(e.target.id==="talk-input"&&e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();send();}});
  box.addEventListener("submit",e=>{if(e.target.id==="talk-form"){e.preventDefault();send();}});
}
/** Called by the shell when the window goes away: stop waiting, keep what was said. */
function onClosed(){
  T.controller?.abort();T.controller=null;T.busy=false;
  const s=T.session;T.session=null;
  if(s&&s.messages.some(m=>m.role==="user"))saveSession(s);
  if(state.route==="talk")setTimeout(()=>ctx.render(),30);
}

/* ---------- a turn ---------- */
const TEXT_TOKENS={short:260,medium:480,long:800};
function normalizeTurns(list){
  const out=[];
  for(const m of list){
    const last=out[out.length-1];
    if(last&&last.role===m.role){last.content+=`\n\n${m.content}`;last.at=m.at;}else out.push({role:m.role,content:m.content,at:m.at});
  }
  while(out.length&&out[0].role!=="user")out.shift();
  return out;
}
/** Builds the request for one turn: stable context (cacheable) → history → fresh context + the person's words. */
function buildTurn(s,text){
  const a=ai(),tier=tierById(a.tier),talk=a.talk,isAsk=s.mode==="ask";
  const lastMeta=(s.metaLog||[]).slice(-2);
  const localRisk=screenRisk(text).level,crisis=!isAsk&&(localRisk==="high"||s.risk==="high"||lastMeta.some(x=>x.risk==="high"));
  const prev=[...s.messages].reverse().find(m=>m.role==="user"&&m.content!==text);
  const query=`${text}${text.split(/\s+/).length<7&&prev?` ${prev.content}`:""}`.slice(0,600);
  const prefer=s.entryId?[s.entryId]:[];
  const use=isAsk||talk.diary;
  const cx=use?hub.diaryContext({query,tierId:a.tier,preferIds:prefer,useCheckins:isAsk||talk.checkins,notes:isAsk?tier.notes+2:tier.notes}):{profile:"",retrieved:[],hints:[],baseline:0,tokens:0};
  const mem=!isAsk&&talk.memory?memoryDigest(T.memory):"";
  const opener=!isAsk&&s.messages[0]?.local?`Беседа началась вопросом: «${s.messages[0].content}»`:"";
  const stable=[cx.profile?`# Портрет дневника (подсчитан на устройстве)\n${cx.profile}`:"",mem,s.summary?`# Ранее в этой беседе (сжато)\n${s.summary}`:"",s.focus?`# Фокус беседы\n${s.focus}`:"",opener].filter(Boolean).join("\n\n");
  const sys=isAsk?systemBlocks({mode:"ask"}):systemBlocks({mode:s.mode,prefs:talk,crisis:false});
  if(stable)sys.push({text:stable,cache:true});
  if(crisis)sys.push({text:CRISIS_ADDENDUM,cache:false});
  // local evaluation → small directions for the model (no tokens spent on working them out)
  const notes=[];
  if(!isAsk){
    const d=detectDistortions(text);if(d.length)notes.push(`Локально в реплике заметны обороты: ${d.map(x=>DISTORTIONS[x].name).join(", ")} (это подсказка, проверь по смыслу и не навешивай).`);
    if(localRisk==="watch")notes.push("В реплике тревожные слова: будь внимателен к состоянию человека и бережно проверь, как он.");
    const step=nextStepHint(s);
    if(step==="ground")notes.push("Человек сильно взволнован: сначала короткое заземление, вопросов меньше.");
    else if(step==="slow-down")notes.push("Продвижения нет, человек немногословен: не дави, сократи вопросы, можно предложить паузу или другую тему.");
    else if(step==="action")notes.push("Человек открыт и сдвинулся: можно предложить один маленький конкретный шаг.");
    const turns=trajectory(s).turns;if(turns>=12)notes.push("Беседа длится долго: мягко предложи подвести итог и сделать паузу, если человек устал.");
  }
  const fresh=[cx.retrieved.length?`Записи под эту реплику:\n${cx.retrieved.map(i=>i.text).join("\n")}`:(use?"Записей, подходящих к реплике, не нашлось.":""),notes.length?`Наблюдения и подсказки:\n${notes.map(n=>`— ${n}`).join("\n")}`:""].filter(Boolean).join("\n\n");
  const all=normalizeTurns(s.messages.filter(m=>!m.local&&!m.error&&(!s.foldedAt||String(m.at)>s.foldedAt)).map(m=>({role:m.role,content:m.content,at:m.at})));
  const cut=compactHistory(all,{keep:tier.history*2,summary:s.summary});
  const folded=all.length-cut.messages.length;
  const hist=cut.messages.map(m=>({role:m.role,content:m.content}));
  if(!hist.length||hist[hist.length-1].role!=="user")hist.push({role:"user",content:text});
  hist[hist.length-1]={role:"user",content:`${fresh?`<свежий_контекст>\n${fresh}\n</свежий_контекст>\n\n`:""}${hist[hist.length-1].content}`};
  const out=isAsk?tier.out:(TEXT_TOKENS[talk.length]||320)+(talk.eval?170:0);
  T.parts={stable,fresh,crisis,history:hist.length,baseline:cx.baseline,system:sys.map(b=>b.text).slice(0,2).join("\n\n"),mode:s.mode};
  return {system:sys,messages:hist,maxTokens:out,feature:isAsk?"ask":"talk",cacheable:isAsk&&hist.length===1,baseline:cx.baseline,foldedTo:folded>0?{foldedAt:all[folded-1].at,summary:cut.summary}:null,crisis,localRisk};
}
async function send(textOverride=null){
  const s=T.session,inp=$("#talk-input");if(!s||T.busy)return;
  const text=(textOverride??inp?.value??"").trim();if(!text)return;
  const risk=screenRisk(text).level;
  if(!hub.connected()){
    if(risk==="high"&&s.mode!=="ask"){T.session={...addTurn(s,{role:"user",content:text}),risk:"high"};if(inp)inp.value="";repaint({keepInput:false});}
    ctx.toast("Помощник не подключён. Откройте настройки.");return;
  }
  T.busy=true;
  let req;
  try{
    req=buildTurn(s,text);
  }catch(e){console.error(e);T.busy=false;ctx.toast("Не получилось подготовить запрос.");return;}
  let next=addTurn(s,{role:"user",content:text});
  if(risk==="high"&&s.mode!=="ask")next={...next,risk:"high"};
  T.session=next;if(inp)inp.value="";
  repaint({keepInput:false});vibe(8);
  T.controller=new AbortController();
  try{
    const r=await hub.ask({feature:req.feature,system:req.system,messages:req.messages,maxTokens:req.maxTokens,cacheable:req.cacheable,baselineTokens:req.baseline,signal:T.controller.signal,chars:text.length});
    if(T.session?.id!==s.id)return;
    T.sessionTokens.calls++;T.sessionTokens.inTok+=r.usage.inTok;T.sessionTokens.outTok+=r.usage.outTok;T.sessionTokens.cached+=r.usage.cachedIn;
    const parsed=s.mode==="ask"?{text:r.text.trim(),meta:null}:parseReply(r.text);
    let n=addTurn(T.session,{role:"assistant",content:(parsed.text||"…")+(r.truncated&&parsed.text?" …":""),meta:parsed.meta});
    if(req.foldedTo)n={...n,foldedAt:req.foldedTo.foldedAt,summary:req.foldedTo.summary};
    T.session=n;
    if(parsed.meta?.risk==="high")T.session={...T.session,risk:"high"};
    T.busy=false;T.controller=null;
    saveSession(T.session);upsertIndex(T.session);
    repaint({keepInput:true});$("#talk-input")?.focus({preventScroll:true});
  }catch(error){
    T.busy=false;T.controller=null;
    if(T.session?.id!==s.id)return;
    if(error?.name==="AbortError"||/отменён/.test(error?.message||"")){if(!T.finishing)repaint();return;}
    const msg=error?.friendly?error.message:"Не получилось получить ответ. Ваше сообщение сохранено — можно попробовать ещё раз.";
    T.session=addTurn(T.session,{role:"assistant",content:msg,meta:null});
    T.session.messages[T.session.messages.length-1].error=true;
    saveSession(T.session);repaint();
  }
}

/* ---------- starting, opening, finishing ---------- */
async function start({mode,seed="",entryId=null}){
  await ensure();
  if(!hub.connected()){ctx.toast("Сначала подключите помощника в настройках.");return;}
  const isAsk=mode==="ask",m=isAsk?null:modeById(mode);
  let s=newSession({id:uid(),mode,focus:"",entryId});
  T.sessionTokens={inTok:0,outTok:0,cached:0,calls:0};
  s={...s,messages:[{role:"assistant",content:isAsk?"Что вы хотите узнать о своих записях? Я отвечу только по ним.":(entryId?modeById("entry").opener:m.opener),at:nowIso(),meta:null,local:true}],folded:0};
  T.session=s;
  openChat(s);
  if(seed){const inp=$("#talk-input");if(inp){inp.value=seed;autosize(inp);inp.setSelectionRange(seed.length,seed.length);}}
}
async function openSession(id){
  await ensure();
  const s=await readSession(id);
  if(!s){ctx.toast("Беседа не найдена.");T.memory.sessions=T.memory.sessions.filter(x=>x.id!==id);saveMemory();ctx.render();return;}
  T.sessionTokens={inTok:0,outTok:0,cached:0,calls:0};
  openChat({...s,closed:false});
}
function finish(){
  const s=T.session;if(!s)return;
  const turns=trajectory(s).turns;
  if(s.mode==="ask"||turns<2){ctx.closeOverlay();return;}
  T.finishing=true;T.controller?.abort();
  const host=$(".talk-chat");
  if(host)host.innerHTML=`<div class="talk-head"><div class="talk-head-text"><strong>Подводим итог</strong><small>Короткая сводка беседы</small></div></div><div class="talk-summary-wait" role="status"><i class="ai-dots" aria-hidden="true"><b></b><b></b><b></b></i><p>Собираем главное из беседы…</p><button type="button" class="secondary" data-action="talk-summary-skip">Закрыть без итога</button></div>`;
  summarize(s);
}
async function summarize(s){
  const a=ai();
  try{
    const r=await hub.ask({feature:"talk",system:SUMMARY_SYSTEM,prompt:summaryPrompt(s,{address:a.talk.address}),role:"fast",maxTokens:520,cacheable:true,chars:s.messages.length*200,validate:x=>Boolean(parseSummary(x))});
    const res=parseSummary(r.text);
    if(T.session?.id!==s.id)return;
    if(!res)throw Object.assign(new Error("Итог получился нечитаемым."),{friendly:true});
    T.session={...T.session,result:res};showSummary(T.session,res);
  }catch(error){
    if(T.session?.id!==s.id)return;
    const host=$(".talk-chat");if(!host)return;
    host.innerHTML=`<div class="talk-head"><div class="talk-head-text"><strong>Итог не получился</strong></div></div><div class="talk-summary-wait"><p>${escapeHtml(error?.friendly?error.message:"Не удалось подвести итог.")}</p><button type="button" class="primary" data-action="talk-finish">Попробовать снова</button><button type="button" class="secondary" data-action="talk-summary-skip">Закрыть без итога</button></div>`;
  }
}
function showSummary(s,res){
  const host=$(".talk-chat");if(!host)return;
  const traj=trajectoryWords(s);
  host.innerHTML=`<div class="talk-head"><div class="talk-head-text"><strong>${escapeHtml(res.title)}</strong><small>${escapeHtml(dayWord(s.startedAt))} · ${escapeHtml(modeLabel(s.mode))}</small></div></div>
    <div class="talk-log talk-result">
      ${res.summary?`<p class="talk-summary-text">${escapeHtml(res.summary)}</p>`:""}
      ${traj?`<p class="subtle">${escapeHtml(traj)}</p>`:""}
      ${res.insights.length?`<h3>Что стало яснее</h3><ul class="talk-list">${res.insights.map(i=>`<li>${escapeHtml(i)}</li>`).join("")}</ul>`:""}
      ${res.homework.length?`<h3>Шаги, которые можно себе назначить</h3><div class="talk-hw">${res.homework.map((h,i)=>`<label class="check"><input type="checkbox" data-hw="${i}" checked><span class="check-box"></span><span>${escapeHtml(h.text)}</span></label>`).join("")}</div>`:""}
      ${res.carry?`<h3>С каким вопросом побыть</h3><p class="talk-carry">${escapeHtml(res.carry)}</p>`:""}
      ${s.risk==="high"?supportMarkup():""}
    </div>
    <div class="talk-foot talk-result-actions"><button type="button" class="secondary button-with-icon" data-action="talk-save-entry">${icon("pen")}<span>Сохранить итог в дневник</span></button><button type="button" class="primary" data-action="talk-done">Готово</button></div>`;
}
async function done({save=true}={}){
  const s=T.session;if(!s)return;
  const res=s.result;
  if(save&&res){
    const chosen=[...$$(".talk-hw input[data-hw]")].filter(i=>i.checked).map(i=>res.homework[Number(i.dataset.hw)]).filter(Boolean);
    const use={...res,homework:chosen};
    T.memory=rememberSession(T.memory,{...s,closed:true},use,{uid});
    upsertIndex({...s,closed:true},{title:res.title,summary:res.summary});
    saveMemory();
  }
  T.session={...s,closed:true};saveSession(T.session);
  ctx.closeOverlay();
  if(state.route==="today")ctx.render();
}
async function saveEntry(){
  const s=T.session;if(!s?.result||T.saving)return;
  T.saving=true;
  const chosen=[...$$(".talk-hw input[data-hw]")].filter(i=>i.checked).map(i=>s.result.homework[Number(i.dataset.hw)]).filter(Boolean);
  const b=sessionToEntryBody(s,{...s.result,homework:chosen});
  try{
    const e={...newEntry({body:b.body}),title:b.title,themes:b.themes,kind:"thought",sensitive:true,completedAt:nowIso()};
    await store.commitEntrySnapshot(e,"talk_session");await store.loadData();store.notifyChange("entry");
    ctx.toast("Итог сохранён в дневник как личная запись: в воспоминания и к ИИ она не попадёт, пока вы не снимете отметку.",{label:"Открыть",action:"open-entry",id:e.id});
    const btn=$('[data-action="talk-save-entry"]');if(btn){btn.disabled=true;btn.querySelector("span").textContent="Сохранено в дневник";}
  }catch(error){console.error(error);ctx.toast("Не получилось сохранить итог. Текст остался на экране.");}
  finally{T.saving=false;}
}

/* ---------- sheets ---------- */
function howSheet(){
  const a=ai(),t=tierById(a.tier);
  ctx.sheetDialog(`${modalHeader("Как это устроено","Коротко и честно","info","close-dialog")}<div class="modal-body talk-how">
    <h3>Что уходит сервису ИИ</h3><p>Ваши реплики; инструкции Собеседника; «портрет дневника» — короткая сводка, которую Narra считает на вашем устройстве (темы, люди, динамика отметок); несколько подобранных выдержек из записей, похожих на ваш вопрос; и, если включено, короткая память прошлых бесед. Целиком дневник не отправляется никогда.</p>
    <h3>Что не уходит</h3><p>Записи, помеченные как личные, и записи из скрытых тем — если вы сами не открыли такую запись для беседы. Пароль, ключ и фото тоже не отправляются.</p>
    <h3>Как экономятся токены</h3><p>Запрос строится локально и остаётся маленьким: портрет ≈ несколько сотен токенов, записей — не больше ${t.notes}, старые реплики сворачиваются в краткую сводку без вызова ИИ, одинаковые запросы берутся из кэша, итоги и подсказки делает более дешёвая модель (если вы её указали), а сервисы сами дешевле считают повторяющуюся часть запроса. Посмотреть, что именно ушло, можно кнопкой с глазом в беседе.</p>
    <h3>Что хранится у вас</h3><p>Беседы, выводы и шаги хранятся только на этом устройстве в зашифрованном виде и намеренно не входят в резервные копии и экспорт дневника (итоговые записи, сохранённые в дневник, входят). Удалить их можно в настройках помощника.</p>
    <h3>Чего ждать не стоит</h3><p>Собеседник не ставит диагнозов, не заменяет психотерапевта и может ошибаться. Его мысли — гипотезы, которые вы вправе отвергнуть.</p></div>`,"Как это устроено");
}
function inspectSheet(){
  const last=hub.lastRequest(),p=T.parts;
  if(!last||!p){ctx.sheetDialog(`${modalHeader("Что видит ИИ","","eye","close-dialog")}<div class="modal-body"><p>Пока ничего не отправлялось: после первого сообщения здесь появится точная копия запроса.</p></div>`,"Что видит ИИ");return;}
  const u=last.usage;
  ctx.sheetDialog(`${modalHeader("Что видит ИИ","Точная копия последнего запроса","eye","close-dialog")}<div class="modal-body talk-inspect">
    <p class="subtle">${escapeHtml(last.model)} · роль: ${last.role==="fast"?"быстрая модель":"основная модель"} · ≈ ${fmtTok(last.estIn)} токенов на входе${u?` · по данным сервиса: ${fmtTok(u.inTok)} на входе${u.cachedIn?` (из них из кэша ${fmtTok(u.cachedIn)})`:""}, ${fmtTok(u.outTok)} на выходе`:""}${last.cached?" · ответ взят из кэша, ничего не тратилось":""}.</p>
    ${p.stable?`<h3>Ваши данные (стабильная часть)</h3><pre class="talk-pre">${escapeHtml(p.stable)}</pre>`:"<p>Данные дневника в этот запрос не входили.</p>"}
    ${p.fresh?`<h3>Подобрано под последнюю реплику</h3><pre class="talk-pre">${escapeHtml(p.fresh)}</pre>`:""}
    <details><summary>Инструкции Собеседника</summary><pre class="talk-pre">${escapeHtml(p.system)}</pre></details>
    <p class="subtle text-small">В запросе ${p.history} ${p.history===1?"сообщение":"сообщений"} истории; более ранние свернуты в сводку на устройстве. Ключ доступа в запрос не входит.</p></div>`,"Что видит ИИ");
}

/* ---------- Today: steps and a gentle invitation (filled after render) ---------- */
export async function paintToday(){
  const slot=$("[data-talk-slot]");if(!slot)return;
  if(!talkAvailable()){slot.hidden=true;return;}
  await ensure();
  const steps=openHomework(T.memory).slice(0,3),st=startersFrom({entries:hub.eligibleEntries(),checkins:state.checkins,memory:T.memory})[0];
  if(!$("[data-talk-slot]"))return;
  slot.innerHTML=`<section class="section"><div class="section-heading"><h2>Собеседник</h2><button class="link-button" data-route="talk">Открыть</button></div>
    <div class="talk-today">
      <button type="button" class="card talk-invite" data-action="talk-start" data-mode="${st.mode}" data-seed="${encodeURIComponent(st.seed||"")}" ${st.entryId?`data-entry="${escapeHtml(st.entryId)}"`:""}>${icon(modeById(st.mode).icon)}<span>${escapeHtml(st.text)}</span>${icon("arrow-right","talk-go")}</button>
      ${steps.length?`<ul class="card talk-steps">${steps.map(h=>`<li class="${h.overdue?"is-overdue":""}"><label class="check"><input type="checkbox" data-action="talk-hw-toggle" data-id="${escapeHtml(h.id)}"><span class="check-box"></span><span>${escapeHtml(h.text)}${h.due?`<small>${h.overdue?"Срок был ":"До "}${escapeHtml(dayWord(h.due))}</small>`:""}</span></label></li>`).join("")}</ul>`:""}
    </div></section>`;
  slot.hidden=false;
}

export const actions={
  "talk-start":el=>start({mode:el.dataset.mode,seed:el.dataset.seed?decodeURIComponent(el.dataset.seed):"",entryId:el.dataset.entry||null}),
  "talk-open-session":el=>openSession(el.dataset.id),
  "talk-delete-session":el=>{
    const id=el.dataset.id,row=T.memory.sessions.find(x=>x.id===id);
    ctx.confirmDialog({title:"Удалить беседу?",text:`«${row?.title||"Беседа"}» будет удалена с этого устройства. Записи дневника не затрагиваются.`,confirmLabel:"Удалить",danger:true,iconName:"trash"},async()=>{
      T.memory.sessions=T.memory.sessions.filter(x=>x.id!==id);T.memory.homework=T.memory.homework.filter(h=>h.sessionId!==id||h.done);T.memory.insights=T.memory.insights.filter(i=>i.sessionId!==id);saveMemory();
      try{await store.del(store.STORES.meta,`talk-s-${id}`);}catch{}
      ctx.render();ctx.toast("Беседа удалена.");
    });
  },
  "talk-close":()=>ctx.closeOverlay(),
  "talk-stop":()=>{T.controller?.abort();},
  "talk-finish":()=>finish(),
  "talk-summary-skip":()=>{const s=T.session;if(s){T.session={...s,closed:true};saveSession(T.session);}ctx.closeOverlay();},
  "talk-done":()=>done({save:true}),
  "talk-save-entry":()=>saveEntry(),
  "talk-inspect":()=>inspectSheet(),
  "talk-how":()=>howSheet(),
  "talk-idea":el=>{const t=decodeURIComponent(el.dataset.text||"");const inp=$("#talk-input");if(inp){inp.value=t;autosize(inp);inp.focus();}},
  "talk-hw-toggle":async el=>{
    const h=T.memory.homework.find(x=>x.id===el.dataset.id);if(!h)return;
    h.done=el.checked!==false;h.doneAt=h.done?nowIso():null;saveMemory();vibe(10);
    const li=el.closest("li");if(li&&h.done){ctx.collapseAndRemove?.(li);}
    if(h.done)ctx.toast("Шаг отмечен.");
    return true;
  },
  "talk-hw-delete":el=>{T.memory.homework=T.memory.homework.filter(x=>x.id!==el.dataset.id);saveMemory();const li=el.closest("li");if(li)ctx.collapseAndRemove?.(li);},
  "talk-wipe":()=>ctx.confirmDialog({title:"Стереть беседы и память?",text:"Будут удалены все беседы, выводы и шаги Собеседника с этого устройства. Записи дневника останутся.",confirmLabel:"Стереть",danger:true,iconName:"trash"},async()=>{
    await ensure();
    for(const s of T.memory.sessions){try{await store.del(store.STORES.meta,`talk-s-${s.id}`);}catch{}}
    T.memory=emptyMemory();try{await store.del(store.STORES.meta,"talk-memory");}catch{}
    ctx.render();ctx.toast("Беседы и память Собеседника стёрты.");
  }),
  "talk-about-entry":el=>start({mode:"entry",entryId:el.dataset.id,seed:""}),
  "talk-ask":el=>start({mode:"ask",seed:decodeURIComponent(el.dataset.q||"")}),
};
export function beforeRender(){T.draft=$("#talk-input")?.value||"";}
export function afterRender(route){
  if(route==="talk"&&talkAvailable()&&(!T.loaded||T.mode!==state.mode)){ensure().then(()=>{if(state.route==="talk")ctx.render();});}
}
export function init(c){c.talkClosed=onClosed;c.talkPaintToday=paintToday;}
