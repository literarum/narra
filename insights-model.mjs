/* Narra insights model: everything the Insights screen shows, computed as plain data. Pure and testable.
   Rules: at least 10 observations on each side, days as the unit, medians and ranks (the scales are ordinal), missing data stays missing,
   several comparisons are corrected (Benjamini–Hochberg), and the wording that goes with a result is associative — never causal. */
import {activeDimensions,dimLabel,dimValue,knownDimensions,EMOTION_GROUP_OF} from "./checkin.mjs?v=4.4.0";
import {dayKey,addDays,median,spread,distribution,dailySeries,rollingMedian,baselineCompare,pairedChange,dayStates,associate,cooccurrence,timeOfDay,TIME_BUCKETS,weeklyCounts,MIN_N,STRONG_N,METHOD_VERSION,benjaminiHochberg,daysBetween,quantile} from "./stats.mjs?v=4.4.0";
import {collectEntities,contextDayMap,labelFor,buildAliasMap,monthDistribution,listByType} from "./entities.mjs?v=4.4.0";
import {wordCount,pluralRu} from "./domain.mjs?v=4.4.0";

export const METHOD_ID="day-state-v1";
const plural={n:(n,a,b,c)=>pluralRu(n,a,b,c)};
export const checkinWord=n=>plural.n(n,"отметке","отметкам","отметкам"); // dative, used after «по»
export const dayWord=n=>plural.n(n,"дню","дням","дням");

/** Label for a possibly half-step median: «между „мало“ и „средне“». */
export function medianLabel(dim,v){
  if(v==null||!dim)return "";
  const vals=dim.values;
  if(vals.includes(v))return dimLabel(dim,v).toLocaleLowerCase("ru-RU");
  const lo=vals.filter(x=>x<v).pop(),hi=vals.find(x=>x>v);
  return `между «${dimLabel(dim,lo).toLocaleLowerCase("ru-RU")}» и «${dimLabel(dim,hi).toLocaleLowerCase("ru-RU")}»`;
}
const domainOf=d=>[Math.min(...d.values),Math.max(...d.values)];
const observations=(checks,d)=>checks.map(c=>({c,v:dimValue(c,d.key)})).filter(x=>x.v!=null);

/** One card per active dimension: what the check-ins say, how spread out they are, and the evidence behind it. */
export function stateCards(checkins,config,{today=dayKey(new Date().toISOString()),periodDays=null}={}){
  const standalone=checkins.filter(c=>c.phase==="standalone"||!c.phase);
  const pool=periodDays?standalone.filter(c=>dayKey(c.observedAt)>=addDays(today,-(periodDays-1))):standalone;
  return activeDimensions(config).map(d=>{
    const obs=observations(pool,d),n=obs.length,values=obs.map(o=>o.v);
    const base={dim:d,n,enough:n>=MIN_N,need:Math.max(0,MIN_N-n)};
    if(n<MIN_N)return base;
    const days=obs.map(o=>dayKey(o.c.observedAt)).sort(),med=median(values);
    const series=dailySeries(pool,d.key),rolling=rollingMedian(series,7);
    return {...base,median:med,label:medianLabel(d,med),spread:spread(values,d.values),distribution:distribution(values,d.values),series,rolling,
      period:{from:days[0],to:days[days.length-1]},baseline:baselineCompare(standalone,d.key,{today,periodDays:30,baselineDays:90}),strong:n>=STRONG_N};
  });
}

/** Context ↔ state associations for every label seen on enough days. Returns the ones that stay convincing after correction. */
export function contextAssociations(entries,checkins,config,notes=[],{labels=null}={}){
  const alias=buildAliasMap(notes),ctx=contextDayMap(entries,checkins,alias),ents=collectEntities(entries,notes);
  const dims=activeDimensions(config),keys=dims.map(d=>d.key),days=dayStates(checkins.filter(c=>c.phase==="standalone"||!c.phase),keys);
  const counts=new Map();
  for(const set of ctx.values())for(const l of set)counts.set(l,(counts.get(l)||0)+1);
  const candidates=[...counts.entries()].filter(([l,n])=>n>=MIN_N&&(!labels||labels.includes(l))).map(([l])=>l);
  const results=[];
  for(const label of candidates)for(const d of dims){
    const a=associate(days,ctx,label,d.key);
    if(a.ok)results.push({...a,dim:d,name:labelFor(label,ents),kind:label.split(":")[0]});
  }
  const keep=benjaminiHochberg(results.map(r=>r.p),.1);
  const shown=results.map((r,i)=>({...r,survives:keep[i]})).filter(r=>r.noteworthy&&r.survives).sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta));
  return {shown,tested:results.length,labelsTried:candidates.length,dayCount:days.length,method:METHOD_ID,version:METHOD_VERSION};
}
/** Fewer, clearer findings: the same name seen as a theme and as a context is one finding, and a result whose two typical values read the same is not worth a card. */
export function curateAssociations(list){
  const best=new Map();
  for(const r of list){
    if(medianLabel(r.dim,r.medianWith)===medianLabel(r.dim,r.medianWithout))continue;
    const key=`${String(r.name).toLocaleLowerCase("ru-RU")}|${r.dim.key}`,cur=best.get(key);
    if(!cur||Math.abs(r.delta)>Math.abs(cur.delta)||(Math.abs(r.delta)===Math.abs(cur.delta)&&r.n>cur.n))best.set(key,r);
  }
  return [...best.values()].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
}
export const SIZE_WORD={small:"небольшое",medium:"заметное",large:"выраженное"};
/** «Когда в записях есть „работа“, напряжение чаще выше» — descriptive, with the numbers and no cause. */
export function describeAssociation(r){
  const dir=r.direction==="higher"?"выше":"ниже",kindWord={person:"человек",place:"место",theme:"тема",project:"проект",kind:"тип записи",ctx:"контекст"}[r.kind]||"метка";
  return {
    title:`${r.dim.name}: в дни с «${r.name}» чаще ${dir}`,
    detail:`${kindWord[0].toLocaleUpperCase("ru-RU")+kindWord.slice(1)} «${r.name}». Обычно в такие дни — ${medianLabel(r.dim,r.medianWith)}, в остальные — ${medianLabel(r.dim,r.medianWithout)}.`,
    evidence:`По ${r.n} ${dayWord(r.n)} с этой меткой и ${r.rest} остальным. Различие ${SIZE_WORD[r.size]||"небольшое"}.`,
    caution:"Это совпадение в ваших записях, а не причина: на оба показателя могло влиять что-то третье.",
  };
}

/** Emotions from check-ins: how often each was named, how strongly, and what most often came with it. */
export function emotionStats(checkins){
  const rows=new Map(),sets=[];
  for(const c of checkins){
    const names=(c.emotions||[]).map(e=>e.name);
    if(names.length)sets.push(names);
    for(const e of c.emotions||[]){
      const r=rows.get(e.name)||{name:e.name,group:EMOTION_GROUP_OF[e.name]||"own",count:0,intensity:[],days:new Set()};
      r.count++;r.intensity.push(e.intensity);r.days.add(dayKey(c.observedAt));rows.set(e.name,r);
    }
  }
  const list=[...rows.values()].map(r=>({name:r.name,group:r.group,count:r.count,days:r.days.size,typical:median(r.intensity)})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,"ru"));
  return {list,together:cooccurrence(sets,{minSupport:3,limit:6}),checkinsWithEmotions:sets.length,total:checkins.length};
}
/** Themes, people, places: counts and where in time they cluster (empty months stay visible). */
export function entityStats(entries,notes,type,limit=12){
  const map=collectEntities(entries,notes),rows=listByType(map,type).slice(0,limit);
  return rows.map(r=>({...r,months:monthDistribution(entries.filter(e=>r.entryIds.includes(e.id)).map(e=>e.happenedAt))}));
}
export function rhythm(entries,today=dayKey(new Date().toISOString())){
  const active=entries.filter(e=>!e.deletedAt),isos=active.map(e=>e.happenedAt);
  const dow=["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(label=>({label,count:0}));
  for(const iso of isos)dow[(new Date(iso).getDay()+6)%7].count++;
  const wordsByMonth=new Map();
  for(const e of active){const k=dayKey(e.happenedAt).slice(0,7);wordsByMonth.set(k,(wordsByMonth.get(k)||0)+wordCount(e.body));}
  return {total:active.length,timeOfDay:timeOfDay(isos),weekday:dow,weeks:weeklyCounts(isos,today,12),activeDays:new Set(isos.map(dayKey)).size,
    span:active.length?daysBetween(dayKey(isos.reduce((a,b)=>a<b?a:b)),today)+1:0};
}
/** Before/after check-ins that were attached to the same entry. */
export function writingEffect(checkins,config){
  const by=new Map();
  for(const c of checkins){
    if(!c.entryId||!["before_writing","after_writing"].includes(c.phase))continue;
    const r=by.get(c.entryId)||{};r[c.phase==="before_writing"?"before":"after"]=c;by.set(c.entryId,r);
  }
  const pairs=[...by.entries()].filter(([,r])=>r.before&&r.after);
  return {pairCount:pairs.length,entryIds:pairs.map(([id])=>id),dims:activeDimensions(config).map(d=>{
    const res=pairedChange(pairs.map(([,r])=>({before:dimValue(r.before,d.key),after:dimValue(r.after,d.key)})));
    return {dim:d,...res};
  })};
}
export {MIN_N,quantile};

/** How each state signal looks at different times of day. A part of the day is reported only with at least MIN_N check-ins;
    a comparison sentence appears only when two parts of the day both qualify and their medians differ. Description, never a cause. */
export function statePartOfDay(checkins,config,{periodDays=null,today=dayKey(new Date().toISOString())}={}){
  const standalone=checkins.filter(c=>c.phase==="standalone"||!c.phase);
  const pool=periodDays?standalone.filter(c=>dayKey(c.observedAt)>=addDays(today,-(periodDays-1))):standalone;
  const out=[];
  for(const d of activeDimensions(config)){
    const buckets=TIME_BUCKETS.map(([label,a,b])=>{
      const vals=observations(pool,d).filter(o=>{const h=new Date(o.c.observedAt).getHours();return h>=a&&h<=b;}).map(o=>o.v);
      return {label,n:vals.length,enough:vals.length>=MIN_N,median:vals.length?median(vals):null};
    });
    const ok=buckets.filter(b=>b.enough);
    if(ok.length<2)continue;
    const hi=ok.reduce((x,y)=>y.median>x.median?y:x),lo=ok.reduce((x,y)=>y.median<x.median?y:x);
    if(hi.median===lo.median){out.push({dim:d,buckets,sentence:`«${d.name}»: в разное время суток заметной разницы нет.`});continue;}
    out.push({dim:d,buckets,high:hi.label,low:lo.label,
      sentence:`«${d.name}»: медиана выше ${hi.label} («${medianLabel(d,hi.median)}»), чем ${lo.label} («${medianLabel(d,lo.median)}»). Это описание ваших отметок, а не объяснение причин.`});
  }
  return out;
}
