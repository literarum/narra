const VERSION="4.3.0";
const CACHE="narra-shell-v4.3";
/* Everything the app needs to open without a network. New modules must be listed here (tests/static_contract.py checks it). */
const FILES=["styles.css", "history.mjs","print.mjs","inter.woff", "literata.woff", "literata-italic.woff", "bootstrap.js", "app.js", "core.js", "store.js", "kit.js", "derived.js", "entries-ui.js", "today.js", "journal.js", "search.js", "insights.js", "insights-model.mjs", "lifemap.js", "memories.js", "reviews.js", "settings.js", "editor.js", "editor-panels.js", "backup.js", "privacy.js", "media.js", "checkin-ui.js", "domain.mjs", "md.mjs", "ui.mjs", "stats.mjs", "checkin.mjs", "entities.mjs", "text.mjs", "review.mjs", "semantic.mjs", "zip.mjs", "writing.mjs", "importers.mjs", "lock.mjs", "ai.mjs", "charts.mjs", "demo.mjs", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
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
