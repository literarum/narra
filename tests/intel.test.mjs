import {test} from "node:test";
import assert from "node:assert/strict";
import {shiftingWords,nearDuplicates,jaccard,shingles,buildDocFreq,keywordsFor,keySentences,intentions,quietPeople,contentWords} from "../intel.mjs";
import {stemRu} from "../domain.mjs";

const now=new Date("2026-11-16T12:00:00Z");
const at=d=>new Date(now.getTime()-d*86400000).toISOString();
let n=0;const e=(daysAgo,body,extra={})=>({id:`e${n++}`,title:"",body,happenedAt:at(daysAgo),...extra});
const filler="тихий вечер чай книга окно разговор улица город дорога солнце дождь ветер облака река лес поле";

test("content words drop function words and fold ё",()=>{
  assert.deepEqual(contentWords("Я очень люблю ёлку и это всё"),["люблю","елку"]);
});
test("rising words: a word that suddenly appears often, with enough text on both sides",()=>{
  const list=[];
  for(let i=0;i<40;i++)list.push(e(40+i*3,`${filler} ${filler}`));
  for(let i=0;i<12;i++)list.push(e(1+i*2,`переезд квартира коробки ${filler}`));
  const r=shiftingWords(list,{now,stem:stemRu});
  assert.equal(r.enough,true);
  assert.ok(r.rising.some(x=>x.word==="переезд"),JSON.stringify(r.rising));
  assert.ok(!r.rising.some(x=>x.word==="тихий"));
});
test("rising words: too little text says so instead of guessing",()=>{
  assert.equal(shiftingWords([e(1,"переезд")],{now}).enough,false);
});
test("near duplicates: the same text twice, not two different days",()=>{
  const a=e(3,"Сегодня долго гуляли у реки и смотрели на закат, было тепло и спокойно"),b=e(2,"Сегодня долго гуляли у реки и смотрели на закат, было тепло и спокойно!"),c=e(1,"Работа, звонки, письма и встреча с командой до вечера");
  const d=nearDuplicates([a,b,c]);
  assert.equal(d.length,1);assert.ok(d[0].similarity>.9);
  assert.equal(nearDuplicates([a,b,c],{dismissed:new Set([d[0].key])}).length,0);
  assert.equal(jaccard(shingles("а б в г"),shingles("д е ж з")),0);
});
test("keywords: distinctive here and present in a few other entries",()=>{
  const list=[e(9,"бассейн утром, плавала долго"),e(8,"снова бассейн"),e(7,"бассейн и сауна"),e(6,"работа отчёт"),e(5,"работа звонки"),e(4,"кино вечером"),e(3,"кино с друзьями"),e(2,"парк прогулка"),e(1,"рынок овощи")];
  const df=buildDocFreq(list,{stem:stemRu});
  assert.deepEqual(keywordsFor("Сегодня бассейн был почти пустой",df,{stem:stemRu}),["бассейн"]);
});
test("key sentences are the person's own sentences, in time order",()=>{
  const list=[e(3,"Утром я снова думала о переезде в другой город. Потом долго пила чай на кухне."),e(2,"Переезд в другой город пугает и радует одновременно. Вечером звонила маме."),e(1,"Решила, что переезд в новый город всё-таки нужен этой весной. Купила хлеб.")];
  const s=keySentences(list,{limit:2,stem:stemRu});
  assert.equal(s.length,2);
  for(const x of s)assert.ok(list.some(en=>en.body.includes(x.text.replace(/\s+$/,""))));
  assert.ok(s.every(x=>/переезд/i.test(x.text)),JSON.stringify(s.map(x=>x.text)));
});
test("intentions: written down a while ago, not negations or questions",()=>{
  const list=[e(20,"Хочу записаться на курсы рисования этой осенью."),e(30,"Не хочу больше работать по выходным."),e(25,"Может, надо бы позвонить Лене?"),e(3,"Хочу купить новый чайник для дома.")];
  const r=intentions(list,{now});
  assert.equal(r.length,1);assert.match(r[0].text,/курсы рисования/);
});
test("quiet people: often mentioned, not for a while",()=>{
  const rows=[{type:"person",name:"Аня",count:5,last:at(90)},{type:"person",name:"Игорь",count:5,last:at(5)},{type:"person",name:"Лена",count:1,last:at(200)},{type:"place",name:"Дом",count:9,last:at(100)}];
  assert.deepEqual(quietPeople(rows,{now}).map(r=>r.name),["Аня"]);
});
