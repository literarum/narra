/* Photos and voice notes. Photos are re-drawn on a canvas, which drops all embedded metadata (location, camera, time),
   scaled down and stored encrypted with a thumbnail. Audio is stored as recorded. Nothing is uploaded anywhere. */
import {state,ctx,$,$$,escapeHtml,icon,featureOn,mediaOf} from "./core.js?v=4.3.0";
import * as store from "./store.js?v=4.3.0";

export const LIMITS={imageIn:30*1024*1024,audioIn:30*1024*1024,perEntry:40,maxSide:2000,thumbSide:360,recordSeconds:600};
const fmtSize=n=>n>=1048576?`${(n/1048576).toFixed(1).replace(".",",")} МБ`:`${Math.max(1,Math.round(n/1024))} КБ`;
const fmtDur=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
const canvasFor=(w,h)=>typeof OffscreenCanvas!=="undefined"?new OffscreenCanvas(w,h):Object.assign(document.createElement("canvas"),{width:w,height:h});
async function toBlob(canvas,type,q){return canvas.convertToBlob?canvas.convertToBlob({type,quality:q}):new Promise(r=>canvas.toBlob(r,type,q));}

/** Returns {bytes,mime,width,height,thumb:{bytes,mime}} or throws an Error with a message fit to show. */
export async function prepareImage(file){
  if(file.size>LIMITS.imageIn)throw new Error("Фото больше 30 МБ. Уменьшите его и попробуйте снова.");
  let bmp;
  try{bmp=await createImageBitmap(file,{imageOrientation:"from-image"});}
  catch{throw new Error("Этот формат фото браузер не открывает (например, HEIC). Сохраните его как JPEG или PNG.");}
  const draw=(side,type,q)=>{
    const scale=Math.min(1,side/Math.max(bmp.width,bmp.height)),w=Math.max(1,Math.round(bmp.width*scale)),h=Math.max(1,Math.round(bmp.height*scale));
    const c=canvasFor(w,h),g=c.getContext("2d");
    if(type==="image/jpeg"){g.fillStyle="#fff";g.fillRect(0,0,w,h);}
    g.drawImage(bmp,0,0,w,h);
    return toBlob(c,type,q).then(b=>({b,w,h}));
  };
  const keepPng=file.type==="image/png";
  const main=await draw(LIMITS.maxSide,keepPng?"image/png":"image/jpeg",.86);
  const th=await draw(LIMITS.thumbSide,"image/jpeg",.75);
  bmp.close?.();
  return {bytes:await main.b.arrayBuffer(),mime:main.b.type||"image/jpeg",width:main.w,height:main.h,thumb:{bytes:await th.b.arrayBuffer(),mime:"image/jpeg"}};
}
async function audioDuration(file){
  return new Promise(resolve=>{
    const a=document.createElement("audio"),url=URL.createObjectURL(file);
    const done=v=>{URL.revokeObjectURL(url);resolve(Number.isFinite(v)?v:0);};
    a.preload="metadata";a.onloadedmetadata=()=>done(a.duration);a.onerror=()=>done(0);a.src=url;setTimeout(()=>done(0),3000);
  });
}
/** Stores files for an entry. Returns the ids added. Errors are reported one by one; the rest still go through. */
export async function addFiles(entryId,files){
  const added=[];
  for(const file of files){
    if(mediaOf(entryId).length+added.length>=LIMITS.perEntry){ctx.toast(`К одной записи можно добавить до ${LIMITS.perEntry} вложений.`);break;}
    try{
      if(file.type.startsWith("image/")){
        const img=await prepareImage(file);
        const id=await store.addAttachment({entryId,kind:"image",mime:img.mime,bytes:img.bytes,thumb:img.thumb,meta:{name:(file.name||"фото").slice(0,120),width:img.width,height:img.height,caption:""}});
        added.push({id,kind:"image",name:file.name||"фото"});
      }else if(file.type.startsWith("audio/")){
        if(file.size>LIMITS.audioIn)throw new Error("Аудио больше 30 МБ.");
        const bytes=await file.arrayBuffer(),duration=await audioDuration(file);
        const id=await store.addAttachment({entryId,kind:"audio",mime:file.type||"audio/webm",bytes,meta:{name:(file.name||"голосовая заметка").slice(0,120),duration,caption:""}});
        added.push({id,kind:"audio",name:file.name||"голосовая заметка"});
      }else throw new Error(`«${file.name}» — не фото и не аудио.`);
    }catch(error){console.error(error);ctx.toast(error.message||"Не удалось добавить файл.");}
  }
  if(added.length)await store.reloadAttachments();
  return added;
}

/* ---------- filling placeholders in rendered markup ---------- */
export async function hydrate(root){
  if(!root||!state.cryptoKey)return;
  for(const img of $$("img[data-media-thumb]",root)){
    const id=img.dataset.mediaThumb;
    store.mediaUrl(id,{thumb:true}).then(u=>{if(u&&img.isConnected)img.src=u;else if(img.isConnected)img.remove();}).catch(()=>{});
  }
  for(const slot of $$(".md-media:not([data-ready])",root)){
    slot.dataset.ready="1";
    const id=slot.dataset.mediaId,meta=state.attachments.find(a=>a.id===id),alt=slot.dataset.alt||meta?.caption||"";
    if(!meta){slot.textContent="Вложение недоступно";slot.classList.add("is-missing");continue;}
    store.mediaUrl(id).then(url=>{
      if(!url||!slot.isConnected)return;
      if(meta.kind==="audio"){const a=document.createElement("audio");a.controls=true;a.preload="metadata";a.src=url;a.setAttribute("aria-label",alt||meta.name||"Голосовая заметка");slot.replaceChildren(a);}
      else{const im=document.createElement("img");im.src=url;im.alt=alt;im.loading="lazy";im.decoding="async";slot.replaceChildren(im);if(alt||meta.caption){const c=document.createElement("small");c.textContent=alt||meta.caption;slot.append(c);}}
    }).catch(()=>{slot.textContent="Не удалось открыть вложение";slot.classList.add("is-missing");});
  }
}

/* ---------- the attachment strip in the editor ---------- */
export function stripMarkup(entryId){
  const list=mediaOf(entryId);
  if(!list.length)return "";
  return `<section class="attach-strip" aria-label="Вложения"><div class="context-heading"><strong>Вложения</strong><span>${list.length}</span></div><ul class="attach-list">${list.map(a=>`<li class="attach-item" data-attachment="${escapeHtml(a.id)}">
    ${a.kind==="image"?`<img class="attach-thumb" data-media-thumb="${escapeHtml(a.id)}" alt="" width="64" height="64">`:`<span class="attach-thumb attach-audio">${icon("mic")}</span>`}
    <div class="attach-body"><input class="input attach-caption" data-attachment-caption="${escapeHtml(a.id)}" maxlength="300" value="${escapeHtml(a.caption)}" placeholder="${a.kind==="image"?"Подпись к фото":"Подпись к записи голоса"}" aria-label="Подпись" autocomplete="off">
      <small>${a.kind==="audio"&&a.duration?`${fmtDur(a.duration)} · `:""}${fmtSize(a.size)}</small></div>
    <div class="attach-actions"><button type="button" class="icon-button icon-button-quiet" data-action="attach-insert" data-id="${escapeHtml(a.id)}" aria-label="Вставить в текст" title="Вставить в текст">${icon("plus")}</button><button type="button" class="icon-button icon-button-quiet danger-quiet" data-action="attach-delete" data-id="${escapeHtml(a.id)}" aria-label="Удалить вложение" title="Удалить">${icon("trash")}</button></div></li>`).join("")}</ul></section>`;
}
export const refMarkdown=a=>`![${(a.caption||a.name||"").replace(/[\]\n]/g," ").slice(0,80)}](narra-media:${a.id})`;


/* ---------- reading mode: attachments that are not already shown inside the text, read-only ---------- */
export function galleryMarkup(entryId,body=""){
  const list=mediaOf(entryId).filter(a=>!body.includes(`narra-media:${a.id}`));
  if(!list.length)return "";
  const images=list.filter(a=>a.kind==="image"),audios=list.filter(a=>a.kind!=="image");
  return `<section class="view-gallery" aria-label="Вложения">
    ${images.length?`<ul class="gallery-grid">${images.map(a=>`<li><button type="button" class="gallery-item" data-action="media-open" data-id="${escapeHtml(a.id)}" aria-label="${escapeHtml(a.caption?`Открыть фото: ${a.caption}`:"Открыть фото")}"><img data-media-thumb="${escapeHtml(a.id)}" alt="${escapeHtml(a.caption||"")}" width="240" height="240" loading="lazy"></button>${a.caption?`<small>${escapeHtml(a.caption)}</small>`:""}</li>`).join("")}</ul>`:""}
    ${audios.map(a=>`<div class="md-media gallery-audio" data-media-id="${escapeHtml(a.id)}" data-alt="${escapeHtml(a.caption||a.name||"Голосовая заметка")}">${icon("mic")}<span>${escapeHtml(a.caption||a.name||"Голосовая заметка")}</span></div>`).join("")}
  </section>`;
}
async function openLightbox(id){
  const a=state.attachments.find(x=>x.id===id);if(!a)return;
  const url=await store.mediaUrl(id).catch(()=>null);
  if(!url){ctx.toast("Не удалось открыть фото.");return;}
  ctx.sheetDialog(`<header class="modal-header"><div class="modal-heading"><div><h2>${escapeHtml(a.caption||a.name||"Фото")}</h2></div></div><button class="icon-button icon-button-quiet" data-action="close-dialog" aria-label="Закрыть">${icon("x")}</button></header><div class="lightbox"><img src="${url}" alt="${escapeHtml(a.caption||"")}"></div>`,"Фото");
}

/* ---------- voice recording ---------- */
export const canRecord=()=>Boolean(navigator.mediaDevices?.getUserMedia)&&typeof MediaRecorder!=="undefined";
async function startRecording(){
  if(state.recorder)return;
  let stream;
  try{stream=await navigator.mediaDevices.getUserMedia({audio:true});}
  catch{ctx.toast("Нет доступа к микрофону. Разрешите его в настройках браузера или добавьте готовый файл.");return;}
  const rec=new MediaRecorder(stream),chunks=[],startedAt=Date.now();
  state.recorder={rec,stream,startedAt,timer:null};
  rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  rec.onstop=async()=>{
    clearInterval(state.recorder?.timer);stream.getTracks().forEach(t=>t.stop());
    const seconds=(Date.now()-startedAt)/1000,mime=rec.mimeType||"audio/webm";
    state.recorder=null;paintRecorder();
    if(!chunks.length||!state.editing||state.editorMode==='view')return;
    const ext=mime.includes("mp4")?"m4a":mime.includes("ogg")?"ogg":"webm";
    const file=new File(chunks,`голос-${new Date().toISOString().slice(0,16).replace(/[:T]/g,"-")}.${ext}`,{type:mime});
    const added=await addFiles(state.editing.id,[file]);
    if(added.length)ctx.afterMediaAdded?.(added);
    void seconds;
  };
  rec.start();
  state.recorder.timer=setInterval(()=>{
    paintRecorder();
    if((Date.now()-startedAt)/1000>=LIMITS.recordSeconds)rec.stop();
  },500);
  paintRecorder();
}
function paintRecorder(){
  const box=$("#recorder-status");if(!box)return;
  const r=state.recorder;
  box.hidden=!r;
  if(r)box.querySelector("time").textContent=fmtDur((Date.now()-r.startedAt)/1000);
  const btn=$('[data-action="record-toggle"]');
  if(btn){btn.setAttribute("aria-pressed",String(Boolean(r)));btn.classList.toggle("is-recording",Boolean(r));}
}
export function stopRecordingIfAny(){if(state.recorder){try{state.recorder.rec.onstop=()=>{state.recorder?.stream.getTracks().forEach(t=>t.stop());state.recorder=null;};state.recorder.rec.stop();}catch{}}}

export const actions={
  "media-open":el=>openLightbox(el.dataset.id),
  "attach-photo":()=>{$("#attach-file-photo")?.click();},
  "attach-audio":()=>{$("#attach-file-audio")?.click();},
  "record-toggle":async()=>{if(state.recorder)state.recorder.rec.stop();else await startRecording();},
  "attach-insert":el=>{const a=state.attachments.find(x=>x.id===el.dataset.id);if(a)ctx.insertAtCaret?.(`\n\n${refMarkdown(a)}\n\n`);},
  "attach-delete":el=>{
    const a=state.attachments.find(x=>x.id===el.dataset.id);if(!a)return;
    ctx.confirmDialog({title:"Удалить вложение?",text:"Файл будет стёрт из дневника без возможности вернуть. Его ссылка в тексте тоже исчезнет.",confirmLabel:"Удалить",danger:true,iconName:"trash"},async()=>{
      try{
        await store.deleteAttachment(a.id);await store.reloadAttachments();
        ctx.removeMediaRefs?.(a.id);ctx.refreshAttachments?.();ctx.toast("Вложение удалено.");
      }catch(e){console.error(e);ctx.toast("Не удалось удалить вложение.");}
    });
  },
};
export const on={
  change:e=>{
    const t=e.target;
    if(t.id==="attach-file-photo"||t.id==="attach-file-audio"){
      const files=[...t.files];t.value="";
      if(files.length&&state.editing)ctx.attachFiles?.(files);
      return true;
    }
    if(t.dataset?.attachmentCaption){store.updateAttachmentMeta(t.dataset.attachmentCaption,{caption:t.value.trim()}).then(()=>store.reloadAttachments()).catch(()=>ctx.toast("Не удалось сохранить подпись."));return true;}
    return false;
  },
};
export const views={};
export {featureOn};
