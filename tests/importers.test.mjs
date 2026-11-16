import {test} from "node:test";
import assert from "node:assert/strict";
import {entryToMarkdown,entryFromMarkdown,entriesFromMarkdownFiles} from "../importers.mjs";

test("Markdown export imports back without losing fields or duplicating the title",()=>{
  const e={id:"x",title:'Мой "день"\nвторая строка',body:"Текст",happenedAt:"2026-03-01T22:30:00.000Z",happenedEnd:"2026-03-02T10:00:00.000Z",kind:"event",themes:["a"],people:["Аня"],projects:["P"],location:"Дом",favorite:true};
  const back=entryFromMarkdown("x.md",entryToMarkdown(e),{id:"y"});
  assert.equal(back.body,"Текст");
  assert.equal(back.title,'Мой "день" вторая строка');
  assert.equal(back.happenedAt,e.happenedAt);
  assert.equal(back.happenedEnd,e.happenedEnd);
  assert.deepEqual([back.kind,back.themes,back.people,back.projects,back.location,back.favorite],["event",["a"],["Аня"],["P"],"Дом",true]);
});
test("plain notes: date from the file name, heading becomes the title",()=>{
  const e=entryFromMarkdown("2025-05-04 заметка.md","# Привет\n\nтело",{id:"z"});
  assert.equal(e.title,"Привет");assert.equal(e.body,"тело");
  assert.equal(new Date(e.happenedAt).getDate(),4);
});
test("empty files are skipped",()=>{
  const r=entriesFromMarkdownFiles([{name:"a.md",text:"---\ntitle: x\n---\n"},{name:"b.md",text:"ok"}],{makeId:()=>"id"+Math.random()});
  assert.equal(r.entries.length,1);assert.equal(r.skipped,1);
});
