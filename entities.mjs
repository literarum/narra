/* Narra entities: people, places, themes, projects and life chapters, derived from what the user typed.
   Nothing here is scraped or guessed: an entity exists only because the user wrote its name on an entry.
   Pure and dependency-free. */
import {foldRu} from "./domain.mjs?v=4.2.0";
import {dayStates,associate,dayKey,addDays,median,MIN_N} from "./stats.mjs?v=4.2.0";
import {contextItems} from "./checkin.mjs?v=4.2.0";

export const ENTITY_TYPES=[
  {type:"person",plural:"Люди",singular:"Человек",field:"people"},
  {type:"place",plural:"Места",singular:"Место",field:"location"},
  {type:"theme",plural:"Темы",singular:"Тема",field:"themes"},
  {type:"project",plural:"Проекты",singular:"Проект",field:"projects"},
];
export const norm=s=>foldRu(String(s||"").trim()).replace(/\s+/g," ");
export const entityKey=(type,name)=>`${type}:${norm(name)}`;

/** notes: [{id:"person:аня", name, aliases[], note}] chosen by the user (rename / merge / annotate). */
export function buildAliasMap(notes=[]){
  const map=new Map();
  for(const n of notes){
    const type=n.id.split(":")[0];
    map.set(`${type}:${norm(n.name)}`,n.name);
    for(const a of n.aliases||[])map.set(`${type}:${norm(a)}`,n.name);
  }
  return map;
}
export function canonicalName(type,name,aliasMap){return aliasMap?.get(`${type}:${norm(name)}`)||String(name).trim();}

/** Every entity mentioned on an entry, with canonical names. */
export function entitiesOf(entry,aliasMap){
  const out=[],seen=new Set();
  const add=(type,raw)=>{
    const name=canonicalName(type,raw,aliasMap);if(!name) return;
    const key=entityKey(type,name);if(seen.has(key)) return;seen.add(key);out.push({type,name,key});
  };
  (entry.people||[]).forEach(x=>add("person",x));
  if(entry.location) add("place",entry.location);
  (entry.themes||[]).forEach(x=>add("theme",x));
  (entry.projects||[]).forEach(x=>add("project",x));
  return out;
}
/** key → {type,name,count,entryIds[],first,last} over active entries. */
export function collectEntities(entries,notes=[]){
  const alias=buildAliasMap(notes),map=new Map();
  for(const e of entries){
    if(e.deletedAt) continue;
    for(const en of entitiesOf(e,alias)){
      let row=map.get(en.key);
      if(!row){row={key:en.key,type:en.type,name:en.name,count:0,entryIds:[],first:e.happenedAt,last:e.happenedAt};map.set(en.key,row);}
      row.count++;row.entryIds.push(e.id);
      if(e.happenedAt<row.first)row.first=e.happenedAt;
      if(e.happenedAt>row.last)row.last=e.happenedAt;
    }
  }
  return map;
}
export function listByType(map,type,{sort="count"}={}){
  const rows=[...map.values()].filter(r=>r.type===type);
  return rows.sort((a,b)=>sort==="name"?a.name.localeCompare(b.name,"ru"):b.count-a.count||a.name.localeCompare(b.name,"ru"));
}

/** Month buckets between the first and last mention (inclusive), so gaps are visible as empty months. */
export function monthDistribution(isos){
  if(!isos.length) return [];
  const keys=isos.map(i=>dayKey(i).slice(0,7)).sort();
  const counts=new Map();for(const k of keys)counts.set(k,(counts.get(k)||0)+1);
  const [y0,m0]=keys[0].split("-").map(Number),[y1,m1]=keys[keys.length-1].split("-").map(Number);
  const out=[];
  for(let y=y0,m=m0;y<y1||(y===y1&&m<=m1);){
    const k=`${y}-${String(m).padStart(2,"0")}`;out.push({month:k,count:counts.get(k)||0});
    m++;if(m>12){m=1;y++;}
  }
  return out;
}

/** State of each entry: the check-ins made for that entry, otherwise the check-ins of the same day. Method id: "day-state-v1". */
export function contextDayMap(entries,checkins,aliasMap,{withCheckinContext=true}={}){
  const byDay=new Map();
  const add=(day,label)=>{if(!byDay.has(day))byDay.set(day,new Set());byDay.get(day).add(label);};
  for(const e of entries){
    if(e.deletedAt) continue;
    const day=dayKey(e.happenedAt);
    for(const en of entitiesOf(e,aliasMap))add(day,en.key);
    if(e.kind)add(day,`kind:${e.kind}`);
  }
  if(withCheckinContext)for(const c of checkins){const day=dayKey(c.observedAt);for(const item of contextItems(c))add(day,`ctx:${norm(item)}`);}
  return byDay;
}
export function labelFor(key,map,fallback=""){
  if(key.startsWith("ctx:")) return key.slice(4);
  if(key.startsWith("kind:")) return key.slice(5);
  return map?.get(key)?.name||fallback||key.slice(key.indexOf(":")+1);
}

/** Page for one entity: entries, neighbours, timeline and state associations with their evidence. */
export function entityPage(key,entries,checkins,notes,{metricKeys=["moodValence","energy","tension"]}={}){
  const alias=buildAliasMap(notes),all=collectEntities(entries,notes),row=all.get(key);
  if(!row) return null;
  const mine=entries.filter(e=>!e.deletedAt&&row.entryIds.includes(e.id)).sort((a,b)=>new Date(b.happenedAt)-new Date(a.happenedAt));
  const neighbours=new Map();
  for(const e of mine)for(const en of entitiesOf(e,alias))if(en.key!==key){const r=neighbours.get(en.key)||{...en,count:0};r.count++;neighbours.set(en.key,r);}
  const near=type=>[...neighbours.values()].filter(x=>x.type===type).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,"ru")).slice(0,6);
  const days=dayStates(checkins,metricKeys),ctx=contextDayMap(entries,checkins,alias,{withCheckinContext:false});
  const associations=metricKeys.map(m=>associate(days,ctx,key,m));
  const daysWithState=days.filter(d=>ctx.get(d.day)?.has(key)).length;
  return {entity:row,entries:mine,places:near("place"),themes:near("theme"),people:near("person"),projects:near("project"),distribution:monthDistribution(mine.map(e=>e.happenedAt)),associations,daysWithState,
    note:notes.find(n=>n.id===key)||null};
}

const ENDINGS={я:["я","и","е","ю","ей","ею"],а:["а","ы","и","е","у","ой","ою"],ь:["ь","я","ю","е","ем"],й:["й","я","ю","е","ем"],о:["о","а","у","ом","е"],е:["е","я","ю","ем","и"]};
/** Russian case forms of a single-word name, for suggestions only («Аня» → Ани, Ане, Аню, Аней). Exact form is always included. */
export function nameForms(name){
  const n=norm(name);if(!n||/\s/.test(n)) return [n];
  const last=n.at(-1),set=ENDINGS[last];
  if(set) return set.map(e=>n.slice(0,-1)+e);
  return [n,...["а","у","ом","е","ем"].map(e=>n+e)];
}
/** Suggest existing entities that the text names but the entry does not list yet. Suggestions only; the user accepts or dismisses. */
export function suggestKnownEntities(entry,known,{limit=4}={}){
  const folded=foldRu(`${entry.title||""} ${entry.body||""}`).replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ");
  const words=new Set(folded.split(" ").filter(Boolean)),padded=` ${folded} `;
  const have=new Set(entitiesOf(entry,null).map(e=>e.key));
  const out=[];
  for(const row of known){
    if(row.type==="theme"||have.has(row.key)) continue;
    const name=norm(row.name);
    if(name.length<3) continue;
    const hit=/\s/.test(name)?padded.includes(` ${name} `):nameForms(name).some(f=>words.has(f));
    if(hit)out.push({type:row.type,name:row.name,key:row.key});
    if(out.length>=limit) break;
  }
  return out;
}

/** Rewrite one name to another across entries (pure): returns only the entries that changed. */
export function renameInEntries(entries,type,from,to){
  const f=norm(from),changed=[];
  for(const e of entries){
    let hit=false;const next={...e};
    const swap=list=>{const out=[];for(const x of list||[]){if(norm(x)===f){hit=true;if(!out.some(y=>norm(y)===norm(to)))out.push(to);}else out.push(x);}return out;};
    if(type==="person")next.people=swap(e.people);
    else if(type==="theme")next.themes=swap(e.themes).map(x=>x.toLocaleLowerCase("ru-RU"));
    else if(type==="project")next.projects=swap(e.projects);
    else if(type==="place"&&e.location&&norm(e.location)===f){next.location=to;hit=true;}
    if(hit)changed.push(next);
  }
  return changed;
}

/** Chapters: which entries belong to which life period. Explicit chapterId wins; otherwise a date range may claim the entry. */
export function chapterOf(entry,chapters){
  if(entry.chapterId&&chapters.some(c=>c.id===entry.chapterId)) return chapters.find(c=>c.id===entry.chapterId);
  const day=dayKey(entry.happenedAt);
  const hit=chapters.filter(c=>c.start&&day>=c.start&&(!c.end||day<=c.end));
  return hit.length===1?hit[0]:null; // an entry inside two overlapping ranges is not silently assigned
}
export function chapterEntries(chapter,entries,chapters){
  return entries.filter(e=>!e.deletedAt&&chapterOf(e,chapters)?.id===chapter.id).sort((a,b)=>new Date(a.happenedAt)-new Date(b.happenedAt));
}
export function sortChapters(chapters){
  return [...chapters].sort((a,b)=>(b.start||"").localeCompare(a.start||"")||a.sort-b.sort||a.name.localeCompare(b.name,"ru"));
}
export {MIN_N,addDays,median};
