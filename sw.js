const VERSION="4.7.0";
const CACHE="narra-shell-v4.7";
/* Everything the app needs to open without a network. New modules must be listed here (tests/static.test.mjs checks it). */
const FILES=["styles.css", "history.mjs","print.mjs","inter.woff", "literata.woff", "literata-italic.woff", "bootstrap.js", "app.js", "core.js", "store.js", "kit.js", "derived.js", "entries-ui.js", "today.js", "journal.js", "search.js", "insights.js", "insights-model.mjs", "lifemap.js", "memories.js", "reviews.js", "settings.js", "editor.js", "editor-panels.js", "backup.js", "assistant.js", "reminders.js", "device.js", "motion.js","toolbar.js", "talk.js", "hub.js", "brain.mjs", "therapy.mjs", "tools.mjs", "notify-rules.js", "privacy.js", "media.js", "checkin-ui.js", "domain.mjs", "md.mjs", "ui.mjs", "stats.mjs", "checkin.mjs", "entities.mjs", "text.mjs", "review.mjs", "semantic.mjs", "zip.mjs", "seal.mjs", "writing.mjs", "templates.mjs", "intel.mjs", "importers.mjs", "lock.mjs", "ai-state.mjs","ai.mjs", "charts.mjs", "demo.mjs", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
const ASSETS=["./","./index.html",...FILES.map(f=>`./${f}?v=${VERSION}`)];
/* The app may live in a sub-folder (GitHub Pages: /repo-name/), so paths are built from where sw.js itself is served. */
const BASE=new URL("./",self.location).pathname;
const STATIC_PATHS=new Set([BASE,`${BASE}index.html`,...FILES.map(f=>`${BASE}${f}`)]);
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
/* Versioned files (?v=4.7.0) never change under the same address: serve them from the cache at once.
   The page itself goes to the network first (to pick up a new version), but waits at most a few seconds on a bad connection. */
const NAV_TIMEOUT=3500;
const cachePut=(event,request,response)=>{if(response&&response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{}));}return response;};
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||!STATIC_PATHS.has(url.pathname))return;
  if(url.searchParams.get("v")===VERSION){
    event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(r=>cachePut(event,event.request,r))));
    return;
  }
  const shell=()=>caches.match(event.request,{ignoreSearch:true}).then(hit=>hit||caches.match("./index.html")).then(hit=>hit||caches.match("./"));
  event.respondWith(new Promise(resolve=>{
    let done=false;const finish=r=>{if(!done&&r){done=true;resolve(r);}};
    const timer=setTimeout(()=>shell().then(hit=>{if(hit)finish(hit);}),NAV_TIMEOUT);
    fetch(event.request,{cache:"no-cache"}).then(r=>{clearTimeout(timer);finish(cachePut(event,event.request,r));})
      .catch(()=>{clearTimeout(timer);shell().then(hit=>finish(hit||Response.error()));});
  }));
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
