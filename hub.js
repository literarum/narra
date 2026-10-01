/* The AI hub: the single door every AI request goes through (loads on first use).
   It does what the paid model should not have to: checks consent and limits, builds a lean context from the diary on this device,
   reuses answers it already has, routes cheap tasks to the cheap model, counts real tokens, and remembers what the person can inspect.
   Nothing here decides anything about the diary — it only prepares, sends and accounts. */
import {state,ctx,activeEntries} from "./core.js?v=4.6.0";
import * as store from "./store.js?v=4.6.0";
import {cleanAiState,createProvider,canRun,featureById,REASON_TEXT,providerById} from "./ai.mjs?v=4.6.0";
import {tierById,outputBudget,estimateTokens,checkLimit,recordUsage,cleanUsage,emptyUsage,AnswerCache,cacheKey,buildProfile,retrieve,naiveTokens,usageWindow,fmtTok} from "./brain.mjs?v=4.6.0";
import {semanticIndex,hasMutedTopic} from "./derived.js?v=4.6.0";

let usage=emptyUsage(),cache=new AnswerCache(),loadedFor=null,loading=null,last=null,saveTimer=0;
const friendly=message=>Object.assign(new Error(message),{friendly:true});

async function load(){
  const mode=state.mode;
  if(loadedFor===mode)return;
  if(!loading||loading.mode!==mode){
    loading={mode,p:(async()=>{
      try{usage=cleanUsage(await store.metaGet("ai-usage",null));}catch{usage=emptyUsage();}
      try{cache=new AnswerCache({rows:await store.metaGetSecure("ai-cache",[])});}catch{cache=new AnswerCache();}
      loadedFor=mode;
    })()};
  }
  await loading.p;
}
function persist(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{store.metaSet("ai-usage",usage).catch(()=>{});store.metaSetSecure("ai-cache",cache.toJSON()).catch(()=>{});},700);
}
export const flushSoon=persist;
const flushNow=()=>{clearTimeout(saveTimer);if(loadedFor===null)return;store.metaSet("ai-usage",usage).catch(()=>{});store.metaSetSecure("ai-cache",cache.toJSON()).catch(()=>{});};
if(typeof document!=="undefined"){document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")flushNow();});addEventListener("pagehide",flushNow);}
export async function usageNow(){await load();return cleanUsage(usage);}
export async function cacheInfo(){await load();return {size:cache.size};}
export async function resetUsage(){await load();usage=emptyUsage();persist();}
export async function clearCache(){await load();cache.clear();persist();}
/** What the last request contained, exactly: for the «what does the AI see» window. The key is never part of it. */
export const lastRequest=()=>last;

/* ---------- context from the diary ---------- */
/** Entries the assistant may read: not in the trash, not marked personal, not in a muted topic — unless the person opened that entry on purpose. */
export function eligibleEntries(preferIds=[]){
  const keep=new Set(preferIds);
  return activeEntries().filter(e=>keep.has(e.id)||(!e.sensitive&&!hasMutedTopic(e)));
}
/** A lean context for one request: portrait + relevant excerpts. Everything is computed here, locally. */
export function diaryContext({query="",tierId=null,preferIds=[],excludeIds=[],useCheckins=true,withProfile=true,notes=null,profileShare=.38}={}){
  const ai=cleanAiState(state.ai),tier=tierById(tierId||ai.tier),now=new Date();
  const pool=eligibleEntries(preferIds);
  const prof=withProfile?buildProfile({entries:pool,checkins:useCheckins?state.checkins:[],config:state.config,chapters:state.chapters,now,maxTokens:Math.round(tier.context*profileShare),includeState:useCheckins}):{text:"",tokens:0};
  const got=retrieve({entries:pool,index:semanticIndex(),query,limit:notes??tier.notes,budgetTokens:Math.max(200,tier.context-prof.tokens),now,preferIds,excludeIds});
  return {profile:prof.text,retrieved:got.items,hints:got.hints,tokens:prof.tokens+got.tokens,baseline:naiveTokens(pool,now,90),poolSize:pool.length};
}

/* ---------- the door ---------- */
/**
 * One request. `system` = string or blocks, `messages` or `prompt`. Returns {text,usage,cached,model}.
 * Throws an Error with .friendly = true and a message fit for the person.
 */
export async function ask({feature,system,messages,prompt,options={},maxTokens,role,signal,cacheable=false,baselineTokens=0,chars=0,validate=null}){
  await load();
  const ai=cleanAiState(state.ai),f=featureById(feature);
  if(!f)throw friendly("Такой функции нет.");
  const provider=createProvider(ai,state.aiKey),gate=canRun(ai,feature,provider);
  if(!gate.ok)throw friendly(REASON_TEXT[gate.reason]||"Помощник недоступен.");
  const tier=tierById(ai.tier),useRole=role||f.role,out=maxTokens||outputBudget(f,tier);
  const msgs=messages&&messages.length?messages:[{role:"user",content:String(prompt||"")}];
  const sysText=Array.isArray(system)?system.map(b=>b.text).join("\n\n"):String(system||"");
  const estIn=estimateTokens(sysText)+msgs.reduce((s,m)=>s+estimateTokens(m.content)+4,0);
  const lim=checkLimit(usage,{dailyCap:ai.dailyCap},estIn,out);
  if(!lim.ok)throw friendly(lim.message);
  const p=providerById(ai.provider),model=(useRole==="fast"&&ai.modelFast)||ai.model||p?.model||"";
  const key=cacheable&&ai.cache?cacheKey(feature,model,sysText,msgs,options?.style||""):null;
  last={feature,role:useRole,model,system:sysText,messages:msgs.map(m=>({role:m.role,content:m.content})),at:new Date().toISOString(),estIn,out,cached:false};
  if(key){
    const hit=cache.get(key);
    if(hit){usage=recordUsage(usage,{feature,hit:true,saved:hit.tok||estIn+out});persist();last.cached=true;return {text:hit.v,usage:{inTok:0,outTok:0,cachedIn:0},cached:true,model};}
  }
  const log=status=>{const a=cleanAiState(state.ai);return store.saveAiState({...a,log:[...a.log,{feature,status,at:new Date().toISOString(),chars:chars||sysText.length+msgs.reduce((s,m)=>s+m.content.length,0),refs:[]}].slice(-50)}).catch(()=>{});};
  try{
    const r=await provider.chat({system,messages:msgs,maxTokens:out,role:useRole,signal});
    const u=(r.usage.inTok||r.usage.outTok)?r.usage:{inTok:estIn,outTok:estimateTokens(r.text),cachedIn:0};
    usage=recordUsage(usage,{feature,inTok:u.inTok,outTok:u.outTok,cachedIn:u.cachedIn,saved:Math.max(0,baselineTokens-u.inTok)});
    if(key&&!r.truncated&&(!validate||validate(r.text)))cache.set(key,r.text,{tok:u.inTok+u.outTok});
    last.usage=u;persist();log("ok");
    return {text:r.text,usage:u,cached:false,model:r.model,truncated:Boolean(r.truncated)};
  }catch(error){
    if(error?.name!=="AbortError"&&!/отменён/.test(error?.message||""))log("failed");
    throw error;
  }
}
export const connected=()=>{const a=cleanAiState(state.ai),p=providerById(a.provider);return Boolean(a.enabled&&p&&(state.aiKey||p.needsKey===false));};
export const modelLabel=()=>{const a=cleanAiState(state.ai),p=providerById(a.provider);return p?`${p.name} · ${a.model||p.model}`:"";};
export async function usageSummary(){
  const u=await usageNow(),now=new Date();
  return {today:usageWindow(u,1,now),week:usageWindow(u,7,now),month:usageWindow(u,30,now),total:u.total,byFeature:u.byFeature,cache:cache.size};
}
export {fmtTok,tierById};
