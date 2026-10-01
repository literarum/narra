/* Narra writing assists. Everything here is deterministic, local and explicit: it runs only when the user asks,
   never inserts text on its own, and never rewrites anything. Pure and dependency-free. */
import {wordCount} from "./domain.mjs?v=4.6.0";
import {mdToPlain} from "./text.mjs?v=4.6.0";

export const STRUCTURE_TEMPLATE="**Что произошло?**\n\n\n**Что было важным?**\n\n\n**Что изменилось?**\n\n";

const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;};

/** «Помочь вспомнить детали»: prompts for what the entry does not say yet. Never invents details. */
export function detailQuestions(entry,{max=5}={}){
  const q=[],body=mdToPlain(entry.body||""),words=wordCount(body);
  if(!(entry.people||[]).length)q.push("Кто был рядом или упоминался в разговорах?");
  if(!entry.location)q.push("Где именно это происходило?");
  q.push("Что вы видели, слышали, какие запахи и звуки запомнились?");
  q.push("Какие слова или фразы прозвучали — свои или чужие?");
  if(words<60)q.push("Что было до этого и что случилось сразу после?");
  q.push("Что вы почувствовали в первую минуту?");
  q.push("Что вы хотели бы помнить об этом через десять лет?");
  return q.slice(0,max);
}

const BY_KIND={
  dream:["Какие образы или ощущения из сна остались с вами до сих пор?","На что это похоже в вашей жизни — если вам хочется искать сходство?"],
  decision:["Что для вас самое важное в этом решении?","Каким вы хотели бы увидеть результат через месяц — и через год?","Что могло бы заставить вас пересмотреть выбор?"],
  letter:["Что вы хотите, чтобы адресат почувствовал, прочитав это?","Какое одно предложение здесь самое главное?"],
  milestone:["Что этот момент говорит о пути, который вы прошли?","Кому из близких вы хотели бы о нём рассказать?"],
  memory:["Почему это воспоминание пришло именно сейчас?","Что в нём осталось таким же, а что вы видите иначе?"],
  event:["Что в этом было самым важным для вас?","Что вас удивило?","Чему это вас научило?"],
  day:["Какой момент дня вы бы оставили, если бы пришлось выбрать один?","Что сегодня далось легче, чем ожидалось?"],
  thought:["Что за этой мыслью стоит?","Что бы вы ответили себе через год?","Что вы хотите сделать с этой мыслью — ничего, и это тоже ответ?"],
};
/** «Задать вопросы для размышления»: open questions chosen by kind and by the wording of the entry. Stable for the same text. */
export function reflectiveQuestions(entry,{max=3}={}){
  const text=mdToPlain(`${entry.title||""} ${entry.body||""}`).toLocaleLowerCase("ru-RU");
  const pool=[...(BY_KIND[entry.kind]||BY_KIND.thought)];
  if(/сомнева|не знаю|не уверен|не понимаю/.test(text))pool.unshift("Что помогло бы прояснить сомнение — информация, время, разговор?");
  if(/устал|тяжело|не могу/.test(text))pool.unshift("Что сейчас могло бы стать хоть немного легче?");
  if(/благодар|спасибо|рад[аы]?\b/.test(text))pool.unshift("Кому и за что вы благодарны в этой истории?");
  const start=hash(text)%pool.length,out=[];
  for(let i=0;i<pool.length&&out.length<max;i++)out.push(pool[(start+i)%pool.length]);
  return out;
}

/** Non-generative clarity check: points at long sentences and dense paragraphs; the user decides what to change. */
export function clarityFindings(body=""){
  const out=[];
  const re=/[^.!?…\n]+[.!?…]*/g;
  let m;
  while((m=re.exec(body))){
    const s=m[0],n=wordCount(s);
    if(n>=35)out.push({kind:"long-sentence",from:m.index+(s.length-s.trimStart().length),to:m.index+s.trimEnd().length,words:n,message:`Длинное предложение — ${n} слов. Возможно, его стоит разделить.`});
  }
  let pos=0;
  for(const para of body.split(/\n{2,}/)){
    const n=wordCount(para);
    if(n>=180)out.push({kind:"long-paragraph",from:pos,to:pos+para.length,words:n,message:`Плотный абзац — ${n} слов. Пустая строка внутри может помочь читать.`});
    pos+=para.length+2;
  }
  return out.sort((a,b)=>a.from-b.from).slice(0,12);
}
