/* Narra entry templates: a few built-in starts and the person's own. Pure, no DOM.
   A template only fills an empty entry; it never changes text that is already written.
   Built-ins follow what research supports, with honest framing:
   - expressive writing (Pennebaker): 15–20 minutes about a stressful experience; meta-analyses report small average benefits;
   - gratitude: a few things, a few times a week, not necessarily daily; effects are small and similar to other positive practices. */
export const MAX_TEMPLATES=30;
export const BUILTIN_TEMPLATES=Object.freeze([
  {id:"b-day",name:"Итоги дня",icon:"calendar",kind:"day",body:"**Что сегодня было?**\n\n\n**Что получилось или порадовало?**\n\n\n**Что было трудным?**\n\n\n**Что хочется запомнить?**\n\n"},
  {id:"b-gratitude",name:"Три хороших вещи",icon:"star",kind:"thought",body:"**Три хороших вещи за последние дни — и почему они случились**\n\n1. \n2. \n3. \n"},
  {id:"b-expressive",name:"Выписать переживание",icon:"pen",kind:"thought",body:"_Пишите 15–20 минут не останавливаясь, о том, что сейчас волнует сильнее всего: что случилось, что вы чувствуете и почему. Грамматика и порядок не важны. Этот текст можно никому не показывать._\n\n"},
  {id:"b-morning",name:"Утренние страницы",icon:"sun",kind:"thought",body:"_Всё, что приходит в голову, без правки — пока не станет легче._\n\n"},
  {id:"b-dream",name:"Сон",icon:"moon",kind:"dream",body:"**Что снилось**\n\n\n**Какое было настроение во сне**\n\n\n**С чем это может быть связано**\n\n"},
  {id:"b-decision",name:"Решение",icon:"compass",kind:"decision",body:"**Что я решаю**\n\n\n**Варианты**\n\n- \n- \n\n**Чего я жду от выбора**\n\n"},
  {id:"b-week",name:"Неделя",icon:"reviews",kind:"thought",body:"**Главное за неделю**\n\n\n**Чему научилась / научился**\n\n\n**Что взять в следующую неделю**\n\n"},
  /* CBT thought record (practical self-help form, not a clinical protocol): situation → thought → feeling with intensity →
     evidence for and against (the step people tend to skip) → a more balanced thought → how strong the feeling is now */
  {id:"b-thought",name:"Дневник мыслей",icon:"bulb",kind:"thought",body:"**Ситуация** — что произошло, где, с кем\n\n\n**Автоматическая мысль** — что пронеслось в голове\n\n\n**Чувство и сила** (0–100)\n\n\n**Что говорит за эту мысль**\n\n\n**Что говорит против неё**\n\n\n**Более взвешенная мысль**\n\n\n**Сила чувства теперь** (0–100)\n\n"},
  {id:"b-intention",name:"Утреннее намерение",icon:"sun",kind:"thought",body:"**Как я себя чувствую этим утром**\n\n\n**Что сегодня важно**\n\n\n**Если станет трудно, я…**\n\n"},
  {id:"b-evening",name:"Вечерний разбор",icon:"moon",kind:"day",body:"**Что сегодня получилось**\n\n\n**Что я сделала бы иначе**\n\n\n**За что я себе благодарна / благодарен**\n\n"},
  {id:"b-letter",name:"Письмо себе в будущее",icon:"mail",kind:"letter",capsule:true,body:"Дорогой я через год,\n\n"},
]);
const str=(v,n)=>typeof v==="string"?v.slice(0,n):"";
/** The person's own templates, validated; built-in ids are never stored. */
export function cleanTemplates(list){
  if(!Array.isArray(list))return [];
  const out=[],seen=new Set();
  for(const t of list){
    if(!t||typeof t!=="object")continue;
    const id=str(t.id,80),name=str(t.name,60).trim(),body=str(t.body,20000);
    if(!id||id.startsWith("b-")||seen.has(id)||!name||!body.trim())continue;
    seen.add(id);out.push({id,name,body,kind:str(t.kind,20)||"thought",title:str(t.title,300)});
    if(out.length>=MAX_TEMPLATES)break;
  }
  return out;
}
export const allTemplates=own=>[...BUILTIN_TEMPLATES,...cleanTemplates(own)];
/** Fields a template sets on an empty new entry; a capsule letter also proposes an opening date a year ahead. */
export function templateFields(t,now=new Date()){
  const f={body:t.body,kind:t.kind||"thought"};
  if(t.title)f.title=t.title;
  if(t.capsule){const d=new Date(now.getFullYear()+1,now.getMonth(),now.getDate());f.openOn=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
  return f;
}
/** A template from an existing entry: its structure (headings, list markers, bold lines) without the person's sentences. */
export function templateFromEntry(e){
  const lines=String(e.body||"").split("\n"),keep=[];
  for(const l of lines){
    if(/^\s*#{1,6}\s+\S/.test(l)||/^\s*\*\*[^*]+\*\*\s*$/.test(l))keep.push(l.trim(),"","");
    else if(/^\s*[-*+]\s+\[[ xX]\]\s+/.test(l))keep.push(l.replace(/\[[xX]\]/,"[ ]").replace(/(\]\s+).*/,"$1"));
    else if(/^\s*([-*+]|\d+[.)])\s+/.test(l))keep.push(l.replace(/^(\s*(?:[-*+]|\d+[.)])\s+).*/,"$1"));
  }
  const body=keep.join("\n").replace(/\n{4,}/g,"\n\n\n").trim();
  return body?body+"\n\n":String(e.body||"");
}
