/* Narra storage: IndexedDB v2, AES-GCM encryption of everything the user wrote, atomic writes.
   Diary text, titles, tags, check-in details, chapters, review notes and media are encrypted with a non-extractable key
   kept next to the data (protects against casual reading of the database, not against someone who has the whole browser profile —
   the interface says so). Dates and ids stay readable so the database can be indexed. */
import {state,uid,nowIso,DB_NAME_MAIN,DB_NAME_DEMO} from "./core.js?v=4.2.0";
import {pickEntryMeta,cleanMeta,cleanChapter,cleanReview,cleanEntityNote,ENTRY_META_DEFAULTS} from "./domain.mjs?v=4.2.0";
import {cleanConfig,DEFAULT_CONFIG} from "./checkin.mjs?v=4.2.0";
import {cleanAiState} from "./ai.mjs?v=4.2.0";

export const DB_VERSION=2;
export const STORES={entries:"entries",versions:"versions",checkins:"checkins",meta:"meta",attachments:"attachments",blobs:"blobs",reviews:"reviews",chapters:"chapters",entities:"entities"};
export const hooks={toast:()=>{},fatal:()=>{}};
export const dbName=()=>state.mode==="demo"?DB_NAME_DEMO:DB_NAME_MAIN;
export class ConflictError extends Error{constructor(current){super("Запись изменилась в другой вкладке.");this.name="ConflictError";this.current=current;}}

export function openDB(){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const req=indexedDB.open(dbName(),DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORES.entries))db.createObjectStore(STORES.entries,{keyPath:"id"});
      if(!db.objectStoreNames.contains(STORES.versions)){const st=db.createObjectStore(STORES.versions,{keyPath:"id"});st.createIndex("entryId","entryId",{unique:false});}
      if(!db.objectStoreNames.contains(STORES.checkins))db.createObjectStore(STORES.checkins,{keyPath:"id"});
      if(!db.objectStoreNames.contains(STORES.meta))db.createObjectStore(STORES.meta,{keyPath:"key"});
      if(!db.objectStoreNames.contains(STORES.attachments)){const st=db.createObjectStore(STORES.attachments,{keyPath:"id"});st.createIndex("entryId","entryId",{unique:false});}
      for(const name of [STORES.blobs,STORES.reviews,STORES.chapters,STORES.entities])if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:"id"});
    };
    req.onblocked=()=>{if(!settled){settled=true;reject(new Error("Обновление локального хранилища заблокировано другой вкладкой Narra. Закройте другие вкладки и перезагрузите страницу."));}};
    req.onsuccess=()=>{
      if(settled){req.result.close();return;}
      settled=true;
      const db=req.result;
      db.onversionchange=()=>{db.close();hooks.fatal("Narra была обновлена в другой вкладке.","Перезагрузите эту вкладку, прежде чем продолжать, чтобы структура дневника оставалась согласованной.");};
      db.onclose=()=>{if(state.db===db){state.db=null;hooks.toast("Соединение с локальным хранилищем закрыто. Перезагрузите Narra перед редактированием.");}};
      resolve(db);
    };
    req.onerror=()=>{if(!settled){settled=true;reject(req.error||new Error("Не удалось открыть локальное хранилище дневника."));}};
  });
}
export const reqP=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error("Ошибка запроса к локальному хранилищу."));});
export function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||new Error("Транзакция локального хранилища была прервана."));tx.onerror=()=>{};});}
export function openTx(stores,mode="readonly",durability="default"){
  if(!state.db)throw new Error("Локальное хранилище закрыто. Перезагрузите Narra.");
  const names=Array.isArray(stores)?stores:[stores];
  if(mode==="readonly")return state.db.transaction(names,mode);
  try{return state.db.transaction(names,mode,{durability});}catch{return state.db.transaction(names,mode);}
}
export const getRecord=(store,key)=>reqP(openTx(store).objectStore(store).get(key));
export const all=store=>reqP(openTx(store).objectStore(store).getAll());
export async function put(store,value,durability="strict"){const tx=openTx(store,"readwrite",durability),done=txDone(tx),r=await reqP(tx.objectStore(store).put(value));await done;return r;}
export async function del(store,key,durability="strict"){const tx=openTx(store,"readwrite",durability),done=txDone(tx);tx.objectStore(store).delete(key);await done;}

/* ---------- encryption ---------- */
export async function ensureCryptoKey(){
  const stored=await getRecord(STORES.meta,"local-key");
  if(stored?.value){state.cryptoKey=stored.value;return;}
  const [e,v,c]=await Promise.all([all(STORES.entries),all(STORES.versions),all(STORES.checkins)]);
  if(e.length||v.length||c.some(x=>x.payloadEnc))throw new Error("Локальный ключ шифрования отсутствует, хотя зашифрованные данные ещё существуют. Narra не станет создавать новый ключ или перезаписывать эти данные.");
  const key=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  await put(STORES.meta,{key:"local-key",value:key});
  state.cryptoKey=key;
}
export async function encryptText(value=""){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv},state.cryptoKey,new TextEncoder().encode(value));
  return {iv:[...iv],data:[...new Uint8Array(ciphertext)]};
}
export async function decryptText(payload){
  if(!payload)return "";
  if(!state.cryptoKey)throw new Error("Локальный ключ шифрования недоступен.");
  try{return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:new Uint8Array(payload.iv)},state.cryptoKey,new Uint8Array(payload.data)));}
  catch(error){throw new Error("Не удалось расшифровать запись дневника. Narra остановилась до попытки что-либо перезаписать.",{cause:error});}
}
export const encryptJson=value=>encryptText(JSON.stringify(value));
export async function decryptJson(payload,fallback){if(!payload)return fallback;try{return JSON.parse(await decryptText(payload));}catch(error){throw new Error("Не удалось расшифровать защищённые метаданные записи.",{cause:error});}}
/** Binary payloads (photos, audio) are kept as ArrayBuffers; IndexedDB stores them natively. */
export async function encryptBytes(buffer){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  return {iv,data:await crypto.subtle.encrypt({name:"AES-GCM",iv},state.cryptoKey,buffer)};
}
export async function decryptBytes(payload){return crypto.subtle.decrypt({name:"AES-GCM",iv:payload.iv},state.cryptoKey,payload.data);}

/* ---------- entries ---------- */
export async function packEntry(entry){
  const {prefill,...rest}=entry;
  const meta=pickEntryMeta(entry);
  const stripped={};for(const k of Object.keys(ENTRY_META_DEFAULTS))stripped[k]=undefined;
  return {...rest,...stripped,sensitive:undefined,titleEnc:await encryptText(entry.title||""),bodyEnc:await encryptText(entry.body||""),metaEnc:await encryptJson(meta),title:undefined,body:undefined};
}
export async function unpackEntry(entry){
  const legacy={kind:entry.kind,sensitive:entry.sensitive,people:entry.people,themes:entry.themes,location:entry.location,dismissedSuggestions:entry.dismissedSuggestions};
  const raw=entry.metaEnc?await decryptJson(entry.metaEnc,legacy):legacy;
  const {titleEnc,bodyEnc,metaEnc,...plain}=entry;
  return {...plain,...cleanMeta(raw,entry.happenedAt),title:await decryptText(titleEnc),body:await decryptText(bodyEnc)};
}
export async function packCheckin(checkin){const {id,observedAt,phase,...priv}=checkin;return {id,observedAt,phase,payloadEnc:await encryptJson(priv)};}
export async function unpackCheckin(checkin){if(checkin.payloadEnc){const {payloadEnc,...plain}=checkin;return {...plain,...await decryptJson(payloadEnc,{})};}return checkin;}

/** Writes the entry and its version snapshot in one transaction.
    With `expectRevision` the write is refused when the stored entry has moved on (edited elsewhere); nothing is overwritten. */
export async function commitEntrySnapshot(entry,source,{expectRevision=null}={}){
  const packed=await packEntry(entry);
  const version={id:uid(),entryId:entry.id,revision:entry.revision,titleEnc:packed.titleEnc,bodyEnc:packed.bodyEnc,metaEnc:packed.metaEnc,createdAt:nowIso(),source};
  const tx=openTx([STORES.entries,STORES.versions],"readwrite","strict"),done=txDone(tx);
  const entries=tx.objectStore(STORES.entries);
  if(expectRevision!=null){
    const cur=await reqP(entries.get(entry.id));
    if(cur&&(cur.revision||0)!==expectRevision){try{tx.abort();}catch{}done.catch(()=>{});throw new ConflictError(cur);}
  }
  entries.put(packed);
  tx.objectStore(STORES.versions).put(version);
  await done;
  return version;
}
export async function commitEntryFlags(entry){
  const packed=await packEntry(entry);
  const tx=openTx(STORES.entries,"readwrite","strict"),done=txDone(tx);
  tx.objectStore(STORES.entries).put(packed);
  await done;
}
/** Removes entries with their history and media in one transaction. */
export async function purgeEntries(ids){
  const tx=openTx([STORES.entries,STORES.versions,STORES.attachments,STORES.blobs,STORES.checkins],"readwrite","strict"),done=txDone(tx);
  const entries=tx.objectStore(STORES.entries),versions=tx.objectStore(STORES.versions),vi=versions.index("entryId"),atts=tx.objectStore(STORES.attachments),ai=atts.index("entryId"),blobs=tx.objectStore(STORES.blobs);
  const checks=tx.objectStore(STORES.checkins),idSet=new Set(ids);
  for(const c of state.checkins)if(c.entryId&&idSet.has(c.entryId)&&c.phase&&c.phase!=="standalone")checks.delete(c.id); // check-ins made around writing this entry go with it
  for(const id of ids){
    entries.delete(id);
    for(const key of await reqP(vi.getAllKeys(id)))versions.delete(key);
    for(const key of await reqP(ai.getAllKeys(id))){atts.delete(key);blobs.delete(key);}
  }
  await done;
  notifyChange("purge");
}
export async function trimVersions(entryId,limit){
  const versions=(await all(STORES.versions)).filter(v=>v.entryId===entryId).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)),stale=versions.slice(limit);
  if(!stale.length)return;
  const tx=openTx(STORES.versions,"readwrite","relaxed"),done=txDone(tx),store=tx.objectStore(STORES.versions);stale.forEach(v=>store.delete(v.id));await done;
}

/* ---------- small encrypted records: chapters, review notes, entity notes ---------- */
async function packSecure(record){const {id,...rest}=record;return {id,payloadEnc:await encryptJson(rest)};}
async function unpackSecure(row){return {id:row.id,...await decryptJson(row.payloadEnc,{})};}
export const saveChapter=async c=>put(STORES.chapters,await packSecure(c));
export const saveReview=async r=>put(STORES.reviews,await packSecure(r));
export const saveEntityNote=async n=>put(STORES.entities,await packSecure(n));
export const deleteChapter=id=>del(STORES.chapters,id);
export const deleteEntityNote=id=>del(STORES.entities,id);

/* ---------- settings kept in `meta` ---------- */
export async function metaGet(key,fallback=null){const r=await getRecord(STORES.meta,key);return r?r.value:fallback;}
export const metaSet=(key,value)=>put(STORES.meta,{key,value});
export async function metaGetSecure(key,fallback){const r=await getRecord(STORES.meta,key);return r?.payloadEnc?decryptJson(r.payloadEnc,fallback):fallback;}
export async function metaSetSecure(key,value){return put(STORES.meta,{key,payloadEnc:await encryptJson(value)});}
export const saveConfig=async cfg=>{state.config=cleanConfig(cfg);await metaSetSecure("checkin-config",state.config);};
export const saveAiState=async s=>{state.ai=cleanAiState(s);await metaSet("ai-state",state.ai);};
export const saveLock=async lock=>{state.lock=lock||null;if(lock)await metaSet("lock",lock);else await del(STORES.meta,"lock");};
export const saveMutedTopics=async list=>{state.mutedTopics=[...new Set(list)];await metaSet("muted-topics",state.mutedTopics);};

export async function loadData(){
  const [entries,checkins,atts,chapters,reviews,entities]=await Promise.all([all(STORES.entries),all(STORES.checkins),all(STORES.attachments),all(STORES.chapters),all(STORES.reviews),all(STORES.entities)]);
  state.entries=(await Promise.all(entries.map(unpackEntry))).sort((a,b)=>new Date(b.happenedAt)-new Date(a.happenedAt));
  state.checkins=(await Promise.all(checkins.map(unpackCheckin))).sort((a,b)=>new Date(b.observedAt)-new Date(a.observedAt));
  state.attachments=(await Promise.all(atts.map(unpackAttachmentMeta))).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  state.chapters=(await Promise.all(chapters.map(async r=>cleanChapter(await unpackSecure(r))))).filter(Boolean);
  state.reviews=(await Promise.all(reviews.map(async r=>cleanReview(await unpackSecure(r))))).filter(Boolean);
  state.entityNotes=(await Promise.all(entities.map(async r=>cleanEntityNote(await unpackSecure(r))))).filter(Boolean);
  state.config=cleanConfig(await metaGetSecure("checkin-config",DEFAULT_CONFIG));
  state.ai=cleanAiState(await metaGet("ai-state",null));
  state.lock=await metaGet("lock",null);
  state.mutedMemoryIds=await metaGet("muted-memory-ids",[]);
  state.mutedTopics=await metaGet("muted-topics",[]);
}

/* ---------- attachments ---------- */
async function unpackAttachmentMeta(row){
  const {metaEnc,thumbEnc,...plain}=row;
  const meta=await decryptJson(metaEnc,{});
  return {...plain,name:String(meta.name||"").slice(0,120),caption:String(meta.caption||"").slice(0,300),width:meta.width||0,height:meta.height||0,duration:meta.duration||0,hasThumb:Boolean(thumbEnc)};
}
export async function addAttachment({entryId,kind,mime,bytes,thumb=null,meta={}}){
  const id=uid(),now=nowIso();
  const row={id,entryId,kind,mime,size:bytes.byteLength,createdAt:now,metaEnc:await encryptJson(meta),thumbEnc:thumb?await encryptBytes(thumb.bytes):null,thumbMime:thumb?.mime||null};
  const blob={id,dataEnc:await encryptBytes(bytes)};
  const tx=openTx([STORES.attachments,STORES.blobs],"readwrite","strict"),done=txDone(tx);
  tx.objectStore(STORES.attachments).put(row);tx.objectStore(STORES.blobs).put(blob);
  await done;
  notifyChange("media");
  return id;
}
export async function updateAttachmentMeta(id,patch){
  const row=await getRecord(STORES.attachments,id);if(!row)return;
  const meta={...await decryptJson(row.metaEnc,{}),...patch};
  await put(STORES.attachments,{...row,metaEnc:await encryptJson(meta)});
}
export async function moveAttachment(id,entryId){const row=await getRecord(STORES.attachments,id);if(row)await put(STORES.attachments,{...row,entryId});}
export async function deleteAttachment(id){
  const tx=openTx([STORES.attachments,STORES.blobs],"readwrite","strict"),done=txDone(tx);
  tx.objectStore(STORES.attachments).delete(id);tx.objectStore(STORES.blobs).delete(id);await done;
  notifyChange("media");
}
export async function deleteAttachmentsFor(entryId){
  const rows=(await all(STORES.attachments)).filter(a=>a.entryId===entryId);
  for(const r of rows)await deleteAttachment(r.id);
}
export async function readAttachmentBytes(id){const b=await getRecord(STORES.blobs,id);return b?decryptBytes(b.dataEnc):null;}
export async function readAttachmentThumb(id){const r=await getRecord(STORES.attachments,id);return r?.thumbEnc?{bytes:await decryptBytes(r.thumbEnc),mime:r.thumbMime||"image/jpeg"}:null;}

/* Object URLs for decrypted media live only while the page shows them; locking or leaving revokes all of them. */
const urlCache=new Map();
export async function mediaUrl(id,{thumb=false}={}){
  const key=`${thumb?"t":"f"}:${id}`;
  if(urlCache.has(key))return urlCache.get(key);
  const meta=state.attachments.find(a=>a.id===id);
  if(!meta)return null;
  let url=null;
  if(thumb){const t=await readAttachmentThumb(id);if(t)url=URL.createObjectURL(new Blob([t.bytes],{type:t.mime}));}
  if(!url){const bytes=await readAttachmentBytes(id);if(bytes)url=URL.createObjectURL(new Blob([bytes],{type:meta.mime}));}
  if(url)urlCache.set(key,url);
  return url;
}
export function revokeMediaUrls(){for(const u of urlCache.values())URL.revokeObjectURL(u);urlCache.clear();}

/* ---------- cross-tab notice ---------- */
let channel=null;
try{channel=new BroadcastChannel("narra-sync");}catch{}
export const clientId=uid();
export function notifyChange(kind="data"){try{channel?.postMessage({from:clientId,kind,db:dbName()});}catch{}}
export function onRemoteChange(fn){if(channel)channel.onmessage=e=>{if(e.data&&e.data.from!==clientId&&e.data.db===dbName())fn(e.data);};}

/* ---------- destructive: everything, for real ---------- */
export async function eraseEverything(){
  try{state.db?.close();}catch{}
  state.db=null;
  await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(dbName());r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=resolve;});
  revokeMediaUrls();
  try{
    for(const k of Object.keys(localStorage))if(k.startsWith("narra"))localStorage.removeItem(k);
    sessionStorage.clear();
    if(self.caches)for(const k of await caches.keys())if(k.startsWith("narra"))await caches.delete(k);
  }catch{}
}
export {ENTRY_META_DEFAULTS};
export const deleteCheckin=async id=>{await del(STORES.checkins,id);notifyChange("checkin");};
export async function saveCheckinRecord(checkin){await put(STORES.checkins,await packCheckin(checkin));notifyChange("checkin");}
export async function reloadAttachments(){state.attachments=(await Promise.all((await all(STORES.attachments)).map(unpackAttachmentMeta))).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));}
/** Copies an entry's attachments for another entry (used when a conflicting edit is kept as a separate entry). Returns old id → new id. */
export async function cloneAttachments(fromEntryId,toEntryId){
  const rows=(await all(STORES.attachments)).filter(a=>a.entryId===fromEntryId),map=new Map();
  if(!rows.length)return map;
  const tx=openTx([STORES.attachments,STORES.blobs],"readwrite","strict"),done=txDone(tx),blobs=tx.objectStore(STORES.blobs),atts=tx.objectStore(STORES.attachments);
  for(const r of rows){const id=uid(),b=await reqP(blobs.get(r.id));map.set(r.id,id);atts.put({...r,id,entryId:toEntryId});if(b)blobs.put({...b,id});}
  await done;return map;
}
/** Keeps a copy of text that is about to be replaced (for example a discarded side of an edit conflict) in the entry's history. */
export async function saveVersionOnly(entry,source){
  const packed=await packEntry(entry);
  await put(STORES.versions,{id:uid(),entryId:entry.id,revision:entry.revision,titleEnc:packed.titleEnc,bodyEnc:packed.bodyEnc,metaEnc:packed.metaEnc,createdAt:nowIso(),source});
}

/* ---------- raw reads for export ---------- */
export async function readAllVersions(){
  const rows=await all(STORES.versions),out=[];
  for(const v of rows){
    const meta=v.metaEnc?await decryptJson(v.metaEnc,{}):{};
    out.push({id:v.id,entryId:v.entryId,revision:v.revision,createdAt:v.createdAt,source:v.source,title:await decryptText(v.titleEnc),body:await decryptText(v.bodyEnc),metadata:meta});
  }
  return out;
}
export async function readBlobBundle(id){
  const row=await getRecord(STORES.attachments,id);if(!row)return null;
  const meta=await decryptJson(row.metaEnc,{}),bytes=await readAttachmentBytes(id),thumb=await readAttachmentThumb(id);
  return {row,meta,bytes,thumb};
}
/** Writes an imported attachment under a given id. Bytes are encrypted with this device's key. */
export async function putAttachmentWithId({id,entryId,kind,mime,bytes,thumb,meta,createdAt}){
  const row={id,entryId,kind,mime,size:bytes.byteLength,createdAt:createdAt||nowIso(),metaEnc:await encryptJson(meta||{}),thumbEnc:thumb?await encryptBytes(thumb.bytes):null,thumbMime:thumb?.mime||null};
  const blob={id,dataEnc:await encryptBytes(bytes)};
  const tx=openTx([STORES.attachments,STORES.blobs],"readwrite","strict"),done=txDone(tx);
  tx.objectStore(STORES.attachments).put(row);tx.objectStore(STORES.blobs).put(blob);
  await done;
}
export async function putVersionRecord(v){
  const entry={title:v.title,body:v.body,...v.meta};
  const packed=await packEntry({id:v.entryId,revision:v.revision,...entry});
  await put(STORES.versions,{id:v.id,entryId:v.entryId,revision:v.revision,titleEnc:packed.titleEnc,bodyEnc:packed.bodyEnc,metaEnc:packed.metaEnc,createdAt:v.createdAt,source:v.source},"relaxed");
}
