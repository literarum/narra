import {test} from "node:test";
import assert from "node:assert/strict";
import {staleVersions} from "../domain.mjs";

test("history thinning keeps recent versions, one per hour/day for older ones, and milestones",()=>{
  const now=Date.parse("2026-11-16T12:00:00Z"),rows=[];
  // 300 autosaves every 10 minutes, going back ~2 days, and one import a month ago
  for(let i=0;i<300;i++)rows.push({id:"a"+i,source:"autosave",createdAt:new Date(now-i*600000).toISOString()});
  rows.push({id:"imp",source:"import",createdAt:new Date(now-30*86400000).toISOString()});
  const stale=new Set(staleVersions(rows,100,now).map(v=>v.id));
  for(let i=0;i<40;i++)assert.ok(!stale.has("a"+i),"newest are kept");
  assert.ok(!stale.has("imp"),"imports are never thinned");
  const kept=rows.filter(v=>!stale.has(v.id));
  assert.ok(kept.length<=200&&kept.length>=40+40,`kept ${kept.length}`);
  const hourOf=v=>new Date(v.createdAt).toISOString().slice(0,13),oldestHour=hourOf(rows[299]);
  assert.ok(kept.some(v=>hourOf(v)===oldestHour),"the oldest hour still has a version");
});
