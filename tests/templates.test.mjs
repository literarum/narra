import {test} from "node:test";
import assert from "node:assert/strict";
import {BUILTIN_TEMPLATES,cleanTemplates,templateFields,templateFromEntry,allTemplates} from "../templates.mjs";
import {cleanMeta,isSealedCapsule} from "../domain.mjs";

test("own templates are validated and never shadow built-ins",()=>{
  const own=cleanTemplates([{id:"b-day",name:"x",body:"y"},{id:"t1",name:" Мой ",body:"**A**\n"},{id:"t1",name:"dup",body:"z"},{id:"t2",name:"",body:"z"},null]);
  assert.deepEqual(own.map(t=>[t.id,t.name]),[["t1","Мой"]]);
  assert.equal(allTemplates(own).length,BUILTIN_TEMPLATES.length+1);
});
test("a capsule template proposes a date a year ahead",()=>{
  const f=templateFields(BUILTIN_TEMPLATES.find(t=>t.capsule),new Date(2026,10,16));
  assert.equal(f.openOn,"2027-11-16");assert.equal(f.kind,"letter");
});
test("a template from an entry keeps structure, not sentences",()=>{
  const body=templateFromEntry({body:"**Утро**\nбыло тихо\n- [x] чай\n- кот\n## Вечер\nгуляли"});
  assert.ok(!body.includes("тихо")&&!body.includes("гуляли")&&!body.includes("чай"));
  assert.match(body,/\*\*Утро\*\*/);assert.match(body,/- \[ \] /);assert.match(body,/## Вечер/);
});
test("time capsule meta",()=>{
  assert.equal(cleanMeta({openOn:"2027-03-01"}).openOn,"2027-03-01");
  assert.equal(cleanMeta({openOn:"завтра"}).openOn,null);
  assert.equal(isSealedCapsule({openOn:"2027-03-01"},"2026-11-16"),true);
  assert.equal(isSealedCapsule({openOn:"2026-11-16"},"2026-11-16"),false);
});
