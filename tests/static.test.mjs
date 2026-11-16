// Static contract of the app shell: every file is cached for offline use, every address carries the same version,
// every icon the code asks for exists in the sprite. Run with `npm test` (Node 20+, no dependencies).
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync,existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");
const read=f=>readFileSync(join(ROOT,f),"utf8");
const rootFiles=readdirSync(ROOT);
const code=rootFiles.filter(f=>/\.(m?js)$/.test(f)&&f!=="sw.js");
const VERSION=read("core.js").match(/APP_VERSION="([^"]+)"/)[1];

test("service worker caches every module, font and icon of the app",()=>{
  const sw=read("sw.js");
  const files=JSON.parse(sw.match(/const FILES=(\[[^\]]*\])/)[1]);
  const needed=rootFiles.filter(f=>/\.(m?js|css|woff|png|svg|webmanifest)$/.test(f)&&f!=="sw.js");
  for(const f of needed)assert.ok(files.includes(f),`${f} is missing from FILES in sw.js`);
  for(const f of files)assert.ok(existsSync(join(ROOT,f)),`sw.js lists ${f}, which does not exist`);
});

test("every versioned address uses the current version",()=>{
  for(const f of [...code,"index.html","sw.js","manifest.webmanifest","README.md"]){
    for(const m of read(f).matchAll(/(?:\?v=|BUILD = "|VERSION=")(\d+\.\d+\.\d+)/g))assert.equal(m[1],VERSION,`${f} refers to version ${m[1]}`);
  }
  assert.match(read("README.md"),new RegExp(VERSION.replace(/\./g,"\\.")));
  assert.equal(JSON.parse(read("package.json")).version,VERSION);
});

test("every static import points at an existing file",()=>{
  for(const f of code){
    for(const m of read(f).matchAll(/(?:import|from)\s*\(?\s*["']\.\/([^"'?]+)/g))assert.ok(existsSync(join(ROOT,m[1])),`${f} imports missing ${m[1]}`);
  }
});

test("every icon used by the code exists in the sprite, and the sprite is one block",()=>{
  const html=read("index.html");
  const sprite=html.slice(html.indexOf('<svg class="icon-sprite"'),html.indexOf("</svg>",html.indexOf('<svg class="icon-sprite"')));
  const have=new Set([...sprite.matchAll(/<symbol id="icon-([a-z0-9-]+)"/g)].map(m=>m[1]));
  assert.equal(have.size,[...html.matchAll(/<symbol /g)].length,"a <symbol> is defined outside the sprite");
  const used=new Set();
  for(const f of [...code,"index.html"]){
    const s=read(f);
    for(const m of s.matchAll(/icon\("([a-z0-9-]+)"/g))used.add(m[1]);
    for(const m of s.matchAll(/#icon-([a-z0-9-]+)/g))used.add(m[1]);
    for(const m of s.matchAll(/\b(?:icon|iconName)\s*:\s*"([a-z0-9-]+)"/g))used.add(m[1]);
  }
  for(const name of used)assert.ok(have.has(name),`icon "${name}" is used but not defined`);
});

test("element ids in index.html are unique",()=>{
  const ids=[...read("index.html").matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(ids.filter((id,i)=>ids.indexOf(id)!==i),[]);
});

test("manifest is valid JSON and its icons exist",()=>{
  const m=JSON.parse(read("manifest.webmanifest"));
  for(const icon of m.icons)assert.ok(existsSync(join(ROOT,icon.src.replace(/^\.\//,"").replace(/\?.*$/,""))),icon.src);
  assert.equal(m.start_url.includes(VERSION),true);
});

test("GitHub Pages serves the files untouched",()=>assert.ok(existsSync(join(ROOT,".nojekyll"))));
