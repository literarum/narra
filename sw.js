const VERSION="4.6.0";
const CACHE="narra-shell-v4.6";
/* Everything the app needs to open without a network. New modules must be listed here (tests/static_contract.py checks it). */
const FILES=["styles.css", "history.mjs","print.mjs","inter.woff", "literata.woff", "literata-italic.woff", "bootstrap.js", "app.js", "core.js", "store.js", "kit.js", "derived.js", "entries-ui.js", "today.js", "journal.js", "search.js", "insights.js", "insights-model.mjs", "lifemap.js", "memories.js", "reviews.js", "settings.js", "editor.js", "editor-panels.js", "backup.js", "assistant.js", "reminders.js", "device.js", "motion.js","toolbar.js", "talk.js", "hub.js", "brain.mjs", "therapy.mjs", "tools.mjs", "notify-rules.js", "privacy.js", "media.js", "checkin-ui.js", "domain.mjs", "md.mjs", "ui.mjs", "stats.mjs", "checkin.mjs", "entities.mjs", "text.mjs", "review.mjs", "semantic.mjs", "zip.mjs", "seal.mjs", "writing.mjs", "importers.mjs", "lock.mjs", "ai-state.mjs","ai.mjs", "charts.mjs", "demo.mjs", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
const ASSETS=["./","./index.html",...FILES.map(f=>`./${f}?v=${VERSION}`)];
/* The app may live in a sub-folder (GitHub Pages: /repo-name/), so paths are built from where sw.js itself is served. */
const BASE=new URL("./",self.location).pathname;
const STATIC_PATHS=new Set([BASE,`${BASE}index.html`,...FILES.map(f=>`${BASE}${f}`)]);
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||!STATIC_PATHS.has(url.pathname))return;
  event.respondWith(fetch(event.request,{cache:"no-cache"}).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
    return response;
  }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match("./index.html"))));
});

/* ---------- reminders (no server: schedule is kept in IndexedDB by the page) ---------- */
importScripts(`./notify-rules.js?v=${VERSION}`);
function idb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open("narra-notify",1);
    req.onupgradeneeded=()=>req.result.createObjectStore("kv");
    req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result);
  });
}
const readKey=async key=>{try{const db=await idb();return await new Promise(res=>{const r=db.transaction("kv").objectStore("kv").get(key);r.onsuccess=()=>{db.close();res(r.result||null);};r.onerror=()=>{db.close();res(null);};});}catch{return null;}};
/** Marks are stored under their own key in one transaction, so a page write to the schedule can never be lost. */
async function markFired(id,day){
  try{const db=await idb();await new Promise(res=>{const tx=db.transaction("kv","readwrite"),st=tx.objectStore("kv"),g=st.get("fired");g.onsuccess=()=>{st.put({...(g.result||{}),[id]:day},"fired");};tx.oncomplete=()=>{db.close();res();};tx.onerror=tx.onabort=()=>{db.close();res();};});}catch{}
}
async function remind(){
  if(!self.registration?.showNotification)return;
  const cfg=await readKey("config");
  if(!cfg)return;
  const fired=await readKey("fired")||{},today=self.NarraNotify.dayKey(new Date());
  for(const item of self.NarraNotify.due({...cfg,fired})){
    await self.registration.showNotification(item.title,{body:item.body,tag:`narra-${item.id}`,icon:"./icon-192.png",badge:"./icon-192.png",lang:"ru",data:{url:item.url}});
    await markFired(item.id,today);
  }
}
self.addEventListener("periodicsync",event=>{if(event.tag==="narra-remind")event.waitUntil(remind());});
self.addEventListener("sync",event=>{if(event.tag==="narra-remind")event.waitUntil(remind());});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const url=event.notification.data?.url||"./";
  event.waitUntil((async()=>{
    const list=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const mine=list.find(c=>new URL(c.url).pathname.startsWith(BASE));
    if(mine){try{await mine.focus();}catch{}mine.postMessage({type:"narra-open",url});return;}
    await self.clients.openWindow(new URL(url,self.registration.scope).href);
  })());
});
