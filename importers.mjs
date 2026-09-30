/* Narra Markdown import: turns .md files into entry drafts. Pure. Nothing is saved here; the caller shows a preview first. */
import {cleanEntry,KINDS} from "./domain.mjs?v=4.3.0";
import {strip} from "./text.mjs?v=4.3.0";

export const MAX_MD_FILE=2*1024*1024,MAX_MD_FILES=3000;
const list=v=>(Array.isArray(v)?v:String(v||"").split(",")).map(x=>String(x).trim().replace(/^#/,"")).filter(Boolean);
function frontMatter(text){
  const m=text.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if(!m) return {meta:{},body:text.replace(/^﻿/,"")};
  const meta={};
  for(const line of m[1].split(/\r?\n/)){
    const kv=line.match(/^([A-Za-zА-Яа-я_]+)\s*:\s*(.*)$/);
    if(!kv) continue;
    let v=kv[2].trim();
    if(/^\[.*\]$/.test(v))v=splitList(v.slice(1,-1));
    else v=unquote(v);
    meta[kv[1].toLowerCase()]=v;
  }
  return {meta,body:text.slice(m[0].length)};
}
const unquote=v=>{v=v.trim();const m=v.match(/^"(.*)"$/s)||v.match(/^'(.*)'$/s);return m?m[1].replace(/\\"/g,'"'):v;};
/** Comma list that respects quotes: ["а, б", "в"] → ["а, б","в"]. */
function splitList(inner){
  const out=[];let cur="",q=null;
  for(let i=0;i<inner.length;i++){
    const ch=inner[i];
    if(q){if(ch==="\\"&&inner[i+1]===q){cur+=q;i++;}else if(ch===q)q=null;else cur+=ch;}
    else if(ch==='"'||ch==="'")q=ch;
    else if(ch===","){out.push(cur.trim());cur="";}
    else cur+=ch;
  }
  out.push(cur.trim());return out.filter(Boolean);
}
const dayFrom=s=>{const m=String(s||"").match(/(\d{4})-(\d{2})-(\d{2})/);return m?`${m[1]}-${m[2]}-${m[3]}`:null;};
/** One file → a validated entry, or null when there is no text. `id` is supplied by the caller (crypto.randomUUID in the browser). */
export function entryFromMarkdown(name,text,{id,now=new Date()}={}){
  if(typeof text!=="string"||text.length>MAX_MD_FILE) return null;
  const {meta,body:rawBody}=frontMatter(text);
  let body=rawBody.replace(/\r\n?/g,"\n").trim(),title=typeof meta.title==="string"?meta.title:"";
  if(!title){const h=body.match(/^#\s+(.+)\n?/);if(h){title=strip(h[1]);body=body.slice(h[0].length).trim();}}
  if(!body) return null;
  const day=dayFrom(meta.date||meta.happened||meta.дата)||dayFrom(name);
  const at=day?new Date(`${day}T12:00:00`):now;
  const iso=at.toISOString();
  return cleanEntry({id:id||`md-${Math.abs([...name].reduce((h,c)=>(h*31+c.charCodeAt(0))|0,7))}`,title,body,happenedAt:iso,createdAt:iso,updatedAt:iso,revision:1,favorite:/^(true|да|1)$/i.test(String(meta.favorite||"")),
    completedAt:iso,kind:KINDS.includes(meta.kind)?meta.kind:"thought",themes:list(meta.tags||meta.themes||meta.темы).map(t=>t.toLocaleLowerCase("ru-RU")),people:list(meta.people||meta.люди),location:typeof meta.location==="string"?meta.location:typeof meta.место==="string"?meta.место:""});
}
export function entriesFromMarkdownFiles(files,{makeId,now}={}){
  const entries=[];let skipped=0;
  for(const f of files.slice(0,MAX_MD_FILES)){
    const e=entryFromMarkdown(f.name,f.text,{id:makeId?makeId():undefined,now});
    if(e)entries.push(e);else skipped++;
  }
  return {entries,skipped:skipped+Math.max(0,files.length-MAX_MD_FILES)};
}
/** Markdown for one entry with a small front matter block, so a folder export can be imported back losslessly. */
export function entryToMarkdown(e,{mediaPrefix="../media/"}={}){
  const q=s=>`"${String(s).replace(/"/g,'\\"')}"`;
  const fm=["---",`id: ${q(e.id)}`,e.title?`title: ${q(e.title)}`:null,`date: ${e.happenedAt}`,e.happenedEnd?`end: ${e.happenedEnd}`:null,`kind: ${e.kind||"thought"}`,
    (e.themes||[]).length?`tags: [${e.themes.map(q).join(", ")}]`:null,(e.people||[]).length?`people: [${e.people.map(q).join(", ")}]`:null,(e.projects||[]).length?`projects: [${e.projects.map(q).join(", ")}]`:null,
    e.location?`location: ${q(e.location)}`:null,e.favorite?"favorite: true":null,"---",""].filter(x=>x!==null).join("\n");
  const body=String(e.body||"").replace(/\]\(narra-media:([A-Za-z0-9-]+)\)/g,(m,id)=>`](${mediaPrefix}${id})`);
  return `${fm}\n${e.title?`# ${e.title}\n\n`:""}${body}\n`;
}
