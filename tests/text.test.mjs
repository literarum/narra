import {test} from "node:test";
import assert from "node:assert/strict";
import {excerpt,entryText,openChecklistItems} from "../text.mjs";
import {wordCount,formatNumberRu} from "../domain.mjs";

test("excerpts show words, not Markdown",()=>{
  assert.equal(excerpt("*курсив* и ==выделение== и _подчёрк_ и **ж**"),"курсив и выделение и подчёрк и ж");
  assert.equal(excerpt("| a | b |\n|---|---|\n| 1 | 2 |"),"a · b 1 · 2");
  assert.equal(excerpt("5 * 3 * 2"),"5 * 3 * 2");
  assert.equal(excerpt("![фото](narra-media:abcdef12) текст"),"текст");
});
test("untitled entries borrow their first sentence",()=>{
  const t=entryText({title:"",body:"Первая мысль. Потом вторая."});
  assert.equal(t.title,"Первая мысль");assert.equal(t.rest,"Потом вторая.");
  assert.equal(entryText({title:"",body:""}).title,"Без заголовка");
});
test("word count ignores addresses and media",()=>{
  assert.equal(wordCount("кто-то пришёл — и всё"),4);
  assert.equal(wordCount("[ссылка](https://a.b/c) ![x](narra-media:1234abcd-aa) см. https://x.y/z"),2);
});
test("numbers in Russian style",()=>{
  assert.equal(formatNumberRu(0.5),"0,5");
  assert.equal(formatNumberRu(1234),"1234");
  assert.equal(formatNumberRu(12345),"12 345");
});
test("open checklist items",()=>assert.equal(openChecklistItems("- [ ] a\n- [x] b\n* [ ] c"),2));
