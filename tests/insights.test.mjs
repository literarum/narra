import {test} from "node:test";
import assert from "node:assert/strict";
import {yearPixels,writingRecords,frequentWords,wordsPerDay} from "../insights-model.mjs";
import {stemRu} from "../domain.mjs";

const e=(d,body)=>({id:d+body.length,happenedAt:new Date(`${d}T12:00:00`).toISOString(),body,title:""});
test("year in pixels: median mood per day, nothing invented",()=>{
  const px=yearPixels([{observedAt:new Date("2026-03-02T09:00:00").toISOString(),moodValence:2},{observedAt:new Date("2026-03-02T20:00:00").toISOString(),moodValence:0}],[e("2026-03-03","текст")],2026,"2026-03-10");
  assert.equal(px.months[2][1].mood,1);assert.equal(px.months[2][2].mood,null);assert.equal(px.months[2][2].written,true);
  assert.equal(px.months[1][29],null,"no 30 February");assert.equal(px.rated,1);assert.equal(px.months[2][20].future,true);
});
test("records: totals, longest entry, longest run of days",()=>{
  const r=writingRecords([e("2026-01-01","раз два три"),e("2026-01-02","раз"),e("2026-01-03","раз два"),e("2026-01-10","один")]);
  assert.equal(r.words,7);assert.equal(r.longestRun,3);assert.equal(r.longest.words,3);assert.equal(r.activeDays,4);
});
test("frequent words skip function words and merge forms",()=>{
  const w=frequentWords([e("2026-01-01","Прогулка у реки. Прогулки радуют, река тихая, и это очень хорошо"),e("2026-01-02","прогулка")],{stem:stemRu});
  assert.equal(w[0].word,"прогулка");assert.ok(!w.some(x=>["очень","хорошо","это"].includes(x.word)));
});
test("words per day are compared with the person's own median day",()=>{
  const d=wordsPerDay([e("2026-01-01","а б в г"),e("2026-01-02","а б"),e("2026-01-03","а б в г д е ж з и к л м")],2026);
  assert.equal(d.median,4);assert.equal(d.level(0),null);assert.ok(d.level(12)>d.level(2));
});
