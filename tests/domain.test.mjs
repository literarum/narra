import {test} from "node:test";
import assert from "node:assert/strict";
import {extractHashtags,parseRussianDateHint,searchEntries,pluralRu,validateCanonicalEntry} from "../domain.mjs";
import {makeDemo} from "../demo.mjs";
import {makeRecoveryCode,normalizeRecoveryCode,makeRecovery,verifyRecovery,makeLock,verifyPasscode,passcodeProblem,retryDelayMs} from "../lock.mjs";
import {seal,unseal,isSealed} from "../seal.mjs";
import {createZip,readZip} from "../zip.mjs";
import "../notify-rules.js";

test("hashtags",()=>{
  assert.deepEqual(extractHashtags("#Тег и #тег, (#скобка) site.com/#part #12"),["тег","скобка"]);
});
test("date hints look back, not ahead",()=>{
  const ref=new Date(2026,0,10,12);
  assert.equal(new Date(parseRussianDateHint("25 декабря",ref).iso).getFullYear(),2025);
  assert.equal(new Date(parseRussianDateHint("25.12",ref).iso).getFullYear(),2025);
  assert.equal(new Date(parseRussianDateHint("15 января",ref).iso).getFullYear(),2026);
  assert.equal(parseRussianDateHint("в прошлую среду",ref).label,"Дата: в прошлую среду");
  assert.equal(parseRussianDateHint("31.02",ref),null);
});
test("search finds words and forms",()=>{
  const entries=[{id:"a",title:"",body:"Гуляли в парке",happenedAt:"2026-01-01T10:00:00Z",kind:"thought"},{id:"b",title:"",body:"Работа",happenedAt:"2026-01-02T10:00:00Z",kind:"thought"}];
  assert.deepEqual(searchEntries(entries,"парк").results.map(e=>e.id),["a"]);
});
test("plurals",()=>{
  assert.equal(pluralRu(1,"запись","записи","записей"),"запись");
  assert.equal(pluralRu(3,"запись","записи","записей"),"записи");
  assert.equal(pluralRu(11,"запись","записи","записей"),"записей");
  assert.equal(pluralRu(21,"запись","записи","записей"),"запись");
});
test("an entry needs text",()=>{
  assert.equal(validateCanonicalEntry({body:"  "}).ok,false);
  assert.equal(validateCanonicalEntry({body:"a"}).ok,true);
});
test("demo diary ends at the given moment, never in the future",()=>{
  const now=new Date(2026,10,16,8,0);
  const d=makeDemo({now});
  assert.ok(d.entries.length>50);
  assert.ok(d.entries.every(e=>new Date(e.createdAt)<=now&&new Date(e.happenedAt)<=now));
});
test("recovery codes: alphabet, format, round trip",async()=>{
  const code=makeRecoveryCode();
  assert.match(code,/^[A-HJKMNP-TV-Z2-9]{4}(-[A-HJKMNP-TV-Z2-9]{4}){4}$/);
  const rec=await makeRecovery(code,{iterations:1000});
  assert.equal(await verifyRecovery(code.toLowerCase().replace(/-/g," "),rec),true);
  assert.equal(await verifyRecovery("AAAA-AAAA-AAAA-AAAA-AAAA",rec),false);
  assert.equal(normalizeRecoveryCode("ab-cd"),"ABCD");
});
test("passcodes",async()=>{
  const lock=await makeLock("кот-2026",{iterations:1000});
  assert.equal(await verifyPasscode("кот-2026",lock),true);
  assert.equal(await verifyPasscode("кот-2025",lock),false);
  for(const weak of ["123","1234","4321","0000","121212","qwerty","Пароль"])assert.notEqual(passcodeProblem(weak),"",weak);
  assert.equal(passcodeProblem("тихая река"),"");
  assert.equal(retryDelayMs(4),0);assert.ok(retryDelayMs(30)<=300000);
});
test("sealed backups",async()=>{
  const data=new TextEncoder().encode("дневник");
  const sealed=await seal(data,"пароль-1",{iterations:10000});
  assert.equal(isSealed(sealed),true);
  assert.equal(new TextDecoder().decode(await unseal(sealed,"пароль-1")),"дневник");
  await assert.rejects(unseal(sealed,"другой"));
});
test("zip round trip",async()=>{
  const z=createZip([{name:"a.txt",data:"привет"},{name:"b/c.bin",data:new Uint8Array([1,2,3])}]);
  const items=readZip(z);
  assert.deepEqual(items.map(i=>i.name),["a.txt","b/c.bin"]);
  assert.equal(new TextDecoder().decode(await items[0].read()),"привет");
});
test("reminders: due once a day, after the chosen time",()=>{
  const N=globalThis.NarraNotify,at=new Date(2026,10,16,21,30);
  assert.deepEqual(N.due({dailyOn:true,dailyTime:"21:00"},at).map(x=>x.id),["daily"]);
  assert.deepEqual(N.due({dailyOn:true,dailyTime:"22:00"},at),[]);
  assert.deepEqual(N.due({dailyOn:true,dailyTime:"21:00",fired:{daily:"2026-11-16"}},at),[]);
  assert.deepEqual(N.due({dailyOn:true,dailyTime:"21:00",lastEntryDay:"2026-11-16"},at),[]);
});
