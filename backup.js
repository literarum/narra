/* Backup, export, import, demo data and the self-check.
   Formats (schema-versioned): a full ZIP with manifest + JSON + media, a JSON file without media, a Markdown folder (ZIP), CSV.
   Nothing here talks to a network. Files are NOT encrypted; the interface says so before every export. */
import {state,ctx,$,$$,escapeHtml,icon,uid,nowIso,downloadBlob,isoStamp,safeStorageSet,safeStorageRemove,APP_VERSION,entryLabel,plural} from "./core.js?v=4.4.0";
import {SCHEMA,planImport,cleanEntry} from "./domain.mjs?v=4.4.0";
import {createZip,readZip,utf8,toBytes,safeSegment} from "./zip.mjs?v=4.4.0";
import {entryToMarkdown,entriesFromMarkdownFiles,MAX_MD_FILE} from "./importers.mjs?v=4.4.0";
import {knownDimensions,dimValue} from "./checkin.mjs?v=4.4.0";
import {chapterOf} from "./entities.mjs?v=4.4.0";
import {wordCount} from "./domain.mjs?v=4.4.0";
import {makeDemo} from "./demo.mjs?v=4.4.0";
import {modalHeader} from "./kit.js?v=4.4.0";
import {dayKey} from "./stats.mjs?v=4.4.0";
import * as store from "./store.js?v=4.4.0";
import * as media from "./media.js?v=4.4.0";
import * as privacy from "./privacy.js?v=4.4.0";

const EXT={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","audio/webm":"webm","audio/mp4":"m4a","audio/mpeg":"mp3","audio/ogg":"ogg","audio/wav":"wav","audio/x-m4a":"m4a"};
const extOf=mime=>EXT[String(mime||"").split(";")[0]]||"bin";
const MIME_OF={jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",webm:"audio/webm",m4a:"audio/mp4",mp3:"audio/mpeg",ogg:"audio/ogg",wav:"audio/wav"};
const kindOfMime=m=>m.startsWith("image/")?"image":m.startsWith("audio/")?"audio":null;

/* ---------- CSV ---------- */
/** Text cells that could be read as a formula by a spreadsheet get a leading apostrophe; numbers are left alone. */
export function csvCell(v){
  if(v==null)return "";
  if(typeof v==="number")return String(v);
  let s=String(v);
  if(/^[=+\-@\t\r]/.test(s))s="'"+s;
  return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;
}
export const csvRow=cells=>cells.map(csvCell).join(",");
export function entriesCsv(entries,chapters){
  const head=["id","date","time","kind","title","text","themes","people","projects","place","chapter","favorite","words","in_trash"];
  const rows=[...entries].sort((a,b)=>new Date(a.happenedAt)-new Date(b.happenedAt)).map(e=>{
    const d=new Date(e.happenedAt),ch=chapterOf(e,chapters);
    return [e.id,dayKey(e.happenedAt),`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`,e.kind,e.title,e.body,(e.themes||[]).join("|"),(e.people||[]).join("|"),(e.projects||[]).join("|"),e.location,ch?.name||"",e.favorite?1:0,wordCount(e.body),e.deletedAt?1:0];
  });
  return "﻿"+[csvRow(head),...rows.map(csvRow)].join("\r\n")+"\r\n";
}
export function checkinsCsv(checkins,config){
  const dims=knownDimensions(config).map(d=>d.key);
  const head=["id","observed_at","phase","entry_id",...dims,"emotions","needs","triggers","activities","social","weather","mode","note"];
  const rows=[...checkins].sort((a,b)=>new Date(a.observedAt)-new Date(b.observedAt)).map(c=>{
    const x=c.context||{};
    return [c.id,c.observedAt,c.phase||"standalone",c.entryId||"",...dims.map(k=>dimValue(c,k)),(c.emotions||[]).map(e=>`${e.name}:${e.intensity}`).join("|"),(x.needs||[]).join("|"),(x.triggers||[]).join("|"),(x.activities||[]).join("|"),(x.social||[]).join("|"),x.weather||"",x.mode||"",c.note||""];
  });
  return "﻿"+[csvRow(head),...rows.map(csvRow)].join("\r\n")+"\r\n";
}

/* ---------- building the payload ---------- */
async function buildPayload({withMediaIndex=true}={}){
  const versions=await store.readAllVersions();
  return {schema:SCHEMA,app:APP_VERSION,exportedAt:nowIso(),
    entries:state.entries,versions,checkins:state.checkins,chapters:state.chapters,reviews:state.reviews,entities:state.entityNotes,checkinConfig:state.config,
    attachments:withMediaIndex?state.attachments.map(a=>({id:a.id,entryId:a.entryId,kind:a.kind,mime:a.mime,name:a.name,caption:a.caption,width:a.width,height:a.height,duration:a.duration,size:a.size,createdAt:a.createdAt,file:`media/${a.id}.${extOf(a.mime)}`,thumb:a.hasThumb?`media/thumbs/${a.id}.jpg`:null})):[]};
}
const README_TEXT=`Резервная копия дневника Narra\r\n\r\nВ архиве:\r\n- manifest.json — версия формата и количество записей;\r\n- narra.json — записи, история версий, отметки, главы, обзоры, настройки отметок;\r\n- media/ — фото и голосовые записи.\r\n\r\nФайл НЕ зашифрован: любой, у кого он есть, может прочитать дневник. Храните его в надёжном месте.\r\nВосстановить: Narra → Настройки → Данные → «Восстановить из копии».\r\n`;
async function mediaFiles(list,{thumbs=true}={}){
  const files=[];
  for(const a of list){
    const b=await store.readBlobBundle(a.id);if(!b?.bytes)continue;
    files.push({name:`media/${a.id}.${extOf(a.mime)}`,data:new Uint8Array(b.bytes)});
    if(thumbs&&b.thumb)files.push({name:`media/thumbs/${a.id}.jpg`,data:new Uint8Array(b.thumb.bytes)});
  }
  return files;
}
export async function buildFullZip(){
  const payload=await buildPayload();
  const manifest={format:"narra-backup",schema:SCHEMA,app:APP_VERSION,createdAt:payload.exportedAt,encrypted:false,
    counts:{entries:payload.entries.length,versions:payload.versions.length,checkins:payload.checkins.length,chapters:payload.chapters.length,reviews:payload.reviews.length,attachments:payload.attachments.length}};
  const files=[{name:"manifest.json",data:JSON.stringify(manifest,null,2)},{name:"narra.json",data:JSON.stringify(payload)},{name:"README.txt",data:README_TEXT},...await mediaFiles(state.attachments)];
  return {zip:createZip(files),manifest};
}
export async function buildMarkdownZip(){
  const files=[],byEntry=new Map();
  for(const a of state.attachments){if(!byEntry.has(a.entryId))byEntry.set(a.entryId,[]);byEntry.get(a.entryId).push(a);}
  const mimeOf=new Map(state.attachments.map(a=>[a.id,a.mime]));
  let n=0;
  for(const e of [...state.entries].filter(x=>!x.deletedAt).sort((a,b)=>new Date(a.happenedAt)-new Date(b.happenedAt))){
    const body=e.body.replace(/\(narra-media:([A-Za-z0-9-]+)\)/g,(m,id)=>`(narra-media:${id}.${extOf(mimeOf.get(id))})`);
    const label=safeSegment(e.title||body.replace(/[#*_>\[\]!()`-]/g," ").split(/\s+/).slice(0,6).join(" "),"запись");
    files.push({name:`entries/${new Date(e.happenedAt).getFullYear()}/${dayKey(e.happenedAt)}-${label}.md`,data:entryToMarkdown({...e,body},{mediaPrefix:"../../media/"}),mtime:new Date(e.updatedAt)});n++;
  }
  files.push(...await mediaFiles(state.attachments.filter(a=>state.entries.some(e=>e.id===a.entryId&&!e.deletedAt)),{thumbs:false}));
  files.push({name:"README.txt",data:`Записи Narra в Markdown: ${n}.\r\nКаждая запись — отдельный файл со служебным блоком (дата, теги, люди). Фото и аудио лежат в папке media.\r\nФайлы не зашифрованы.\r\n`});
  return {zip:createZip(files),count:n};
}

/* ---------- export UI ---------- */
function exportMenu(){
  const opt=(action,iconName,title,text)=>`<button class="more-menu-item" data-action="${action}">${icon(iconName)}<span><strong>${title}</strong><small>${text}</small></span>${icon("chevron-right")}</button>`;
  ctx.overlay(`${modalHeader("Резервная копия и экспорт","Файлы сохраняются на это устройство. Они не зашифрованы.","backup")}<div class="modal-body more-menu">
    ${opt("export-zip","backup","Полная копия (ZIP)","Записи, история, отметки, главы, обзоры, фото и аудио. Лучший вариант для восстановления.")}
    ${opt("export-json","journal","Только данные (JSON)","Без фото и аудио. Полный текст и история версий.")}
    ${opt("export-md","pen","Markdown-папка (ZIP)","Отдельный файл для каждой записи; читается любым редактором.")}
    ${opt("export-csv-entries","table","Записи в CSV","Таблица для Excel и анализа.")}
    ${opt("export-csv-checkins","state","Отметки состояния в CSV","Числовые значения, эмоции и контекст по времени.")}
  </div><p class="setting-note modal-note">${icon("info")} В русском Excel CSV открывайте через «Данные → Из текста/CSV», кодировка UTF-8.</p>`,"modal","Резервная копия");
}
async function doExport(kind){
  if(!await privacy.reauth("Экспорт выгружает весь дневник открытым текстом. Подтвердите паролем."))return;
  ctx.closeOverlay({restoreFocus:false});
  ctx.toast("Готовим файл…",null,{duration:2500});
  try{
    const stamp=isoStamp();
    if(kind==="zip"){const {zip,manifest}=await buildFullZip();downloadBlob(zip,"application/zip",`narra-backup-${stamp}.zip`);ctx.toast(`Копия сохранена: записей ${manifest.counts.entries}, вложений ${manifest.counts.attachments}. Файл не зашифрован.`);}
    else if(kind==="json"){const p=await buildPayload({withMediaIndex:false});downloadBlob(JSON.stringify(p,null,2),"application/json",`narra-data-${stamp}.json`);ctx.toast("Данные сохранены без фото и аудио. Файл не зашифрован.");}
    else if(kind==="md"){const {zip,count}=await buildMarkdownZip();downloadBlob(zip,"application/zip",`narra-markdown-${stamp}.zip`);ctx.toast(`Markdown: записей ${count}. Файлы не зашифрованы.`);}
    else if(kind==="csv-entries"){downloadBlob(entriesCsv(state.entries,state.chapters),"text/csv;charset=utf-8",`narra-entries-${stamp}.csv`);ctx.toast("Таблица записей сохранена.");}
    else if(kind==="csv-checkins"){downloadBlob(checkinsCsv(state.checkins,state.config),"text/csv;charset=utf-8",`narra-checkins-${stamp}.csv`);ctx.toast("Таблица отметок сохранена.");}
    store.notifyChange("noop");
  }catch(error){console.error(error);ctx.toast(error?.message||"Не удалось создать файл. Данные не изменились.");}
}

/* ---------- import ---------- */
const readText=f=>f.text();
async function readAny(files){
  const list=[...files];
  if(!list.length)return null;
  const zips=list.filter(f=>/\.zip$/i.test(f.name)),jsons=list.filter(f=>/\.json$/i.test(f.name)),mds=list.filter(f=>/\.(md|markdown|txt)$/i.test(f.name));
  if(zips.length){
    const items=readZip(new Uint8Array(await zips[0].arrayBuffer())),byName=new Map(items.map(i=>[i.name,i]));
    const main=byName.get("narra.json");
    if(main){
      let payload;try{payload=JSON.parse(utf8(await main.read()));}catch{throw new Error("Файл narra.json в архиве повреждён.");}
      return {source:"zip",payload,zipItems:byName,name:zips[0].name};
    }
    const mdItems=items.filter(i=>/\.(md|markdown)$/i.test(i.name)&&!/(^|\/)README/i.test(i.name));
    if(mdItems.length){
      const files=[];for(const i of mdItems){if(i.size>MAX_MD_FILE)continue;files.push({name:i.name.split("/").pop(),text:utf8(await i.read()),path:i.name});}
      return {source:"markdown-zip",files,zipItems:byName,name:zips[0].name};
    }
    throw new Error("В архиве нет ни narra.json, ни файлов Markdown.");
  }
  if(jsons.length){
    let payload;try{payload=JSON.parse(await readText(jsons[0]));}catch{throw new Error("Файл не читается как JSON.");}
    return {source:"json",payload,name:jsons[0].name};
  }
  if(mds.length){
    const files=[];for(const f of mds){if(f.size>MAX_MD_FILE)continue;files.push({name:f.name,text:await readText(f),path:f.name});}
    return {source:"markdown",files,name:mds.length===1?mds[0].name:`${mds.length} файлов`};
  }
  throw new Error("Поддерживаются файлы .zip, .json и .md.");
}
const sameKey=e=>`${dayKey(e.happenedAt)}|${(e.title||"").trim()}|${e.body.trim()}`;
function planMarkdown(src){
  const have=new Set(state.entries.map(sameKey));
  const {entries,skipped}=entriesFromMarkdownFiles(src.files.map(f=>({name:f.name,text:f.text})),{makeId:uid});
  const fresh=entries.filter(e=>!have.has(sameKey(e)));
  return {ok:true,markdown:true,entries:fresh,checkins:[],versions:[],chapters:[],reviews:[],entities:[],config:null,fromSchema:"markdown",
    stats:{newEntries:fresh.length,updatedEntries:0,skippedEntries:entries.length-fresh.length,invalidEntries:skipped,conflictEntries:0,newCheckins:0,newVersions:0,newChapters:0,newReviews:0},nothingToDo:!fresh.length};
}
function previewMarkup(plan,src){
  const s=plan.stats,row=(n,text)=>n?`<li><strong>${n}</strong> ${text}</li>`:"";
  const mediaCount=src.payload?.attachments?.length||0;
  return `${modalHeader("Восстановление из файла",`Файл: ${src.name}`,"upload")}<div class="modal-body">
    ${plan.nothingToDo?(s.skippedEntries?`<p><strong>В этом файле нет ничего нового.</strong> Все записи уже есть в дневнике.</p>`:`<p><strong>В файле нет записей, которые можно восстановить.</strong> Он пуст или повреждён; дневник не изменится.</p>`):`<p>Вот что произойдёт. Существующие записи не будут перезаписаны.</p><ul class="preview-list">
    ${row(s.newEntries,`${entryLabel(s.newEntries)} будет добавлено`)}${row(s.updatedEntries,"записей в файле новее — они обновятся, старый текст останется в истории")}${row(s.conflictEntries,"записей отличаются от ваших — они добавятся отдельными копиями")}
    ${row(s.newCheckins,"отметок состояния")}${row(s.newVersions,"версий из истории")}${row(s.newChapters,"глав жизни")}${row(s.newReviews,"обзоров")}${mediaCount?row(mediaCount,"вложений (если записи будут добавлены)"):""}</ul>`}
    ${s.skippedEntries?`<p class="subtle text-small">Пропущено как уже имеющиеся: ${s.skippedEntries}.</p>`:""}${s.invalidEntries?`<p class="subtle text-small">Не удалось прочитать: ${s.invalidEntries}.</p>`:""}
    ${plan.fromSchema&&plan.fromSchema!==SCHEMA&&plan.fromSchema!=="markdown"?`<p class="subtle text-small">Формат файла: ${escapeHtml(plan.fromSchema)}. Он будет приведён к текущему автоматически.</p>`:""}
  </div><footer class="modal-footer"><button class="secondary" data-action="close-overlay">Отмена</button><button class="primary" data-action="import-apply" ${plan.nothingToDo?"disabled":""}>Восстановить</button></footer>`;
}
async function beginImport(files){
  try{
    const src=await readAny(files);if(!src)return;
    const plan=src.source.startsWith("markdown")?planMarkdown(src):planImport(src.payload,{entries:state.entries,checkins:state.checkins,versions:[],chapters:state.chapters,reviews:state.reviews});
    if(!plan.ok){ctx.toast(plan.error);return;}
    state.pendingImport={src,plan};
    ctx.overlay(previewMarkup(plan,src),"modal","Восстановление из файла");
  }catch(error){console.error(error);ctx.toast(error?.message||"Не удалось прочитать файл.");}
}
function pickFiles(){
  const input=document.createElement("input");input.type="file";input.multiple=true;input.accept=".zip,.json,.md,.markdown,.txt";input.hidden=true;
  input.addEventListener("change",()=>{const f=[...input.files];input.remove();if(f.length)beginImport(f);});
  input.addEventListener("cancel",()=>input.remove());
  document.body.append(input);input.click();
}
async function importMedia(plan,src,entryIdMap){
  const list=src.payload?.attachments||[],haveIds=new Set(state.attachments.map(a=>a.id));let done=0;
  const importedIds=new Set(plan.entries.map(e=>e.id)),rewrites=new Map();
  for(const a of list){
    if(!a||typeof a.id!=="string"||typeof a.entryId!=="string"||!a.file)continue;
    const targetEntry=entryIdMap.get(a.entryId)||a.entryId;
    if(!importedIds.has(targetEntry))continue;
    const item=src.zipItems?.get(a.file);if(!item)continue;
    const mime=String(a.mime||MIME_OF[a.file.split(".").pop()]||""),kind=kindOfMime(mime);if(!kind)continue;
    let id=a.id;if(haveIds.has(id)){id=uid();rewrites.set(targetEntry,[...(rewrites.get(targetEntry)||[]),[a.id,id]]);}
    const bytes=(await item.read()).buffer,thumbItem=a.thumb&&src.zipItems.get(a.thumb),thumb=thumbItem?{bytes:(await thumbItem.read()).buffer,mime:"image/jpeg"}:null;
    await store.putAttachmentWithId({id,entryId:targetEntry,kind,mime,bytes,thumb,createdAt:a.createdAt,meta:{name:String(a.name||"").slice(0,120),caption:String(a.caption||"").slice(0,300),width:a.width||0,height:a.height||0,duration:a.duration||0}});
    haveIds.add(id);done++;
  }
  return {done,rewrites};
}
async function applyImport(){
  const pending=state.pendingImport;if(!pending)return;
  const {plan,src}=pending;
  ctx.closeOverlay({restoreFocus:false});
  ctx.toast("Восстанавливаем…",null,{duration:2500});
  try{
    const entryIdMap=new Map();
    for(const e of plan.entries)if(e.id.endsWith("~file"))entryIdMap.set(e.id.slice(0,-5),e.id);
    let mediaResult={done:0,rewrites:new Map()};
    if(plan.markdown&&src.zipItems){
      /* Markdown folder: images are re-attached to the new entries and the links rewritten */
      let restored=0;
      for(const e of plan.entries){
        const links=[...e.body.matchAll(/\]\((?:\.\.\/)*media\/([^)\s/]+)\)/g)];
        if(!links.length)continue;
        let body=e.body;
        for(const [full,name] of links){
          const item=src.zipItems.get(`media/${name}`);if(!item)continue;
          const ext=name.split(".").pop().toLowerCase(),mime=MIME_OF[ext],kind=mime&&kindOfMime(mime);if(!kind)continue;
          const bytes=await item.read(),file=new File([bytes],name,{type:mime});
          const ids=await media.addFiles(e.id,[file]);
          if(ids[0]){body=body.replace(full,`](narra-media:${ids[0].id})`);restored++;}
        }
        e.body=body;
      }
      mediaResult.done=restored;
    }
    for(const e of plan.entries)await store.commitEntrySnapshot(e,"import");
    if(!plan.markdown)mediaResult=await importMedia(plan,src,entryIdMap);
    for(const [entryId,pairs] of mediaResult.rewrites){
      const e=plan.entries.find(x=>x.id===entryId);if(!e)continue;
      let body=e.body;for(const [from,to] of pairs)body=body.split(`narra-media:${from}`).join(`narra-media:${to}`);
      if(body!==e.body)await store.commitEntrySnapshot({...e,body,revision:e.revision+1},"import");
    }
    for(const v of plan.versions)await store.putVersionRecord(v);
    for(const c of plan.checkins)await store.saveCheckinRecord(c);
    for(const c of plan.chapters)await store.saveChapter(c);
    for(const r of plan.reviews)await store.saveReview(r);
    const haveNotes=new Set(state.entityNotes.map(n=>n.id));
    for(const n of plan.entities)if(!haveNotes.has(n.id))await store.saveEntityNote(n);
    if(plan.config&&!state.checkins.length)await store.saveConfig(plan.config);
    await store.loadData();store.notifyChange("import");
    ctx.render();
    ctx.toast(`Восстановлено: ${plan.entries.length} ${plural.entry(plan.entries.length)}${mediaResult.done?`, вложений ${mediaResult.done}`:""}.`);
  }catch(error){console.error(error);await store.loadData().catch(()=>{});ctx.render();ctx.toast(error?.message?`Восстановление остановлено: ${error.message}`:"Восстановление остановлено. Уже добавленное осталось в дневнике.");}
  finally{state.pendingImport=null;}
}

/* ---------- demo mode ---------- */
export async function ensureDemoData(){
  if(await store.metaGet("demo-seeded",false))return;
  const d=makeDemo();
  for(const e of d.entries)await store.commitEntrySnapshot(e,"demo");
  for(const c of d.checkins)await store.saveCheckinRecord(c);
  for(const c of d.chapters)await store.saveChapter(c);
  await store.saveConfig(d.config);
  await store.metaSet("demo-seeded",true);
}
function switchMode(mode){
  if(mode==="demo")safeStorageSet("narra-mode","demo");else safeStorageRemove("narra-mode");
  location.hash="#/today";location.reload();
}

/* ---------- self-check ---------- */
export async function diagnostics(){
  const rows=[],add=(ok,title,detail="",fix=null)=>rows.push({ok,title,detail,fix});
  try{
    const probe="проверка "+uid(),back=await store.decryptText(await store.encryptText(probe));
    add(back===probe,"Шифрование работает","Пробный текст зашифровался и расшифровался без потерь.");
  }catch(e){add(false,"Шифрование не работает",e.message);}
  add(Boolean(state.db),"Локальное хранилище открыто",state.db?`Версия структуры: ${store.DB_VERSION}.`:"Хранилище закрыто, перезагрузите страницу.");
  try{
    const [e,c,a,b]=await Promise.all([store.all(store.STORES.entries),store.all(store.STORES.checkins),store.all(store.STORES.attachments),store.all(store.STORES.blobs)]);
    add(e.length===state.entries.length,"Все записи читаются",`В хранилище: ${e.length}, в памяти: ${state.entries.length}.`);
    add(c.length===state.checkins.length,"Все отметки читаются",`В хранилище: ${c.length}, в памяти: ${state.checkins.length}.`);
    const ids=new Set(e.map(x=>x.id)),orphan=a.filter(x=>!ids.has(x.entryId));
    add(!orphan.length,"Нет лишних вложений",orphan.length?`Вложений без записи: ${orphan.length}.`:"Каждое фото и аудио привязано к записи.",orphan.length?{action:"clean-orphans",label:"Убрать лишние"}:null);
    const blobIds=new Set(b.map(x=>x.id)),lost=a.filter(x=>!blobIds.has(x.id));
    add(!lost.length,"Вложения не повреждены",lost.length?`Без содержимого: ${lost.length}.`:"У каждого вложения есть данные.");
    const known=new Set(a.map(x=>x.id));let dangling=0;
    for(const en of state.entries)for(const m of en.body.matchAll(/narra-media:([A-Za-z0-9-]+)/g))if(!known.has(m[1]))dangling++;
    add(!dangling,"Ссылки на вложения целы",dangling?`Ссылок на отсутствующие файлы: ${dangling}.`:"Все ссылки в тексте ведут на существующие файлы.");
  }catch(e){add(false,"Не удалось прочитать хранилище",e.message);}
  try{
    if(navigator.storage?.estimate){const est=await navigator.storage.estimate(),used=est.usage||0,quota=est.quota||1;add(used/quota<.8,"Достаточно места",`Занято ${(used/1048576).toFixed(1).replace(".",",")} МБ из доступных ${Math.round(quota/1048576)} МБ.`);}
  }catch{}
  await ctx.checkStoragePersistence?.();
  add(state.storagePersistent!==false,"Защита от автоочистки",state.storagePersistent===true?"Браузер подтвердил постоянное хранение.":state.storagePersistent===null?"Браузер не сообщает об этом. Делайте резервные копии.":"Браузер может очистить данные при нехватке места. Включите защиту в настройках и делайте копии.",state.storagePersistent===false?{action:"request-persistence",label:"Запросить защиту"}:null);
  add("serviceWorker" in navigator&&Boolean(await navigator.serviceWorker.getRegistration?.()),"Работа без сети","Приложение сохранено в браузере и откроется без интернета.");
  const result={at:nowIso(),rows,ok:rows.every(r=>r.ok)};
  state.diagnostics=result;return result;
}
function diagnosticsMarkup(r){
  return `${modalHeader("Самопроверка",r.ok?"Всё в порядке.":"Есть замечания — они отмечены ниже.","shield")}<div class="modal-body"><ul class="check-list">${r.rows.map(x=>`<li class="check-item ${x.ok?"is-ok":"is-warn"}">${icon(x.ok?"check":"info")}<div><strong>${escapeHtml(x.title)}</strong><span>${escapeHtml(x.detail)}</span>${x.fix?`<button class="link-button" data-action="${x.fix.action}">${escapeHtml(x.fix.label)}</button>`:""}</div></li>`).join("")}</ul></div><footer class="modal-footer"><button class="primary" data-action="close-overlay">Понятно</button></footer>`;
}

/* ---------- erase everything ---------- */
async function eraseAll(){
  if(!await privacy.reauth("Дневник будет удалён с этого устройства. Подтвердите паролем."))return;
  ctx.confirmDialog({title:"Удалить всё с этого устройства?",text:"Будут стёрты все записи, история, отметки, главы, обзоры, вложения, пароль и настройки Narra. Восстановить их можно только из резервной копии. Сначала скачайте копию, если она нужна.",confirmLabel:"Удалить всё",danger:true,iconName:"trash",requireText:"удалить"},async()=>{
    try{await store.eraseEverything();}catch(error){console.error(error);}
    location.replace(location.pathname);
  });
}

export const views={};
export const actions={
  "export":()=>exportMenu(),
  "export-zip":()=>doExport("zip"),"export-json":()=>doExport("json"),"export-md":()=>doExport("md"),
  "export-csv-entries":()=>doExport("csv-entries"),"export-csv-checkins":()=>doExport("csv-checkins"),
  "import":()=>pickFiles(),
  "import-apply":()=>applyImport(),
  "enter-demo":()=>ctx.confirmDialog({title:"Открыть демонстрацию?",text:"Это вымышленный дневник в отдельном хранилище: ваши записи не тронуты и не видны. Выйти можно в любой момент.",confirmLabel:"Открыть демонстрацию",iconName:"info"},()=>switchMode("demo")),
  "exit-demo":()=>switchMode("main"),
  "reset-demo":()=>ctx.confirmDialog({title:"Начать демонстрацию заново?",text:"Вымышленные данные вернутся к исходным. Ваш настоящий дневник это не затрагивает.",confirmLabel:"Сбросить демонстрацию",iconName:"refresh"},async()=>{await store.eraseEverything();safeStorageSet("narra-mode","demo");location.reload();}),
  "erase-all":()=>eraseAll(),
  "run-diagnostics":async()=>{const r=await diagnostics();ctx.overlay(diagnosticsMarkup(r),"modal","Самопроверка");},
  "clean-orphans":async()=>{
    const ids=new Set(state.entries.map(e=>e.id));
    for(const a of await store.all(store.STORES.attachments))if(!ids.has(a.entryId))await store.deleteAttachment(a.id);
    await store.loadData();const r=await diagnostics();ctx.overlay(diagnosticsMarkup(r),"modal","Самопроверка");ctx.toast("Лишние вложения убраны.");
  },
};
export {$,$$,cleanEntry};
