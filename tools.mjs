/* The formatting toolbar as data: every tool the editor knows, the default arrangement, the person's own tools,
   and the pure helpers that keep a saved arrangement valid. No DOM here — editor.js draws it, toolbar.js edits it. */

/** Built-in tools. `format` tools run through md.mjs; `action` tools call a named app action. */
export const TOOLS={
  bold:{icon:"bold",label:"Полужирный",shortcut:"Ctrl+B",format:"bold"},
  italic:{icon:"italic",label:"Курсив",shortcut:"Ctrl+I",format:"italic"},
  strike:{icon:"strike",label:"Зачёркнутый",shortcut:"Ctrl+Shift+X",format:"strike"},
  mark:{icon:"highlight",label:"Выделение маркером",shortcut:"Ctrl+Shift+H",format:"mark"},
  code:{icon:"code",label:"Код в строке",shortcut:"Ctrl+E",format:"code"},
  h1:{icon:"heading",label:"Заголовок 1",shortcut:"Ctrl+Alt+1",format:"h1"},
  h2:{icon:"heading2",label:"Заголовок 2",shortcut:"Ctrl+Alt+2",format:"h2"},
  h3:{icon:"heading3",label:"Заголовок 3",shortcut:"Ctrl+Alt+3",format:"h3"},
  quote:{icon:"quote",label:"Цитата",shortcut:"Ctrl+Shift+.",format:"quote"},
  bullet:{icon:"list",label:"Маркированный список",shortcut:"Ctrl+Shift+8",format:"bullet"},
  numbered:{icon:"list-ordered",label:"Нумерованный список",shortcut:"Ctrl+Shift+7",format:"numbered"},
  checklist:{icon:"checklist",label:"Чек-лист",shortcut:"Ctrl+Shift+9",format:"checklist"},
  outdent:{icon:"outdent",label:"Уменьшить отступ",shortcut:"Shift+Tab",format:"outdent"},
  indent:{icon:"indent",label:"Увеличить отступ",shortcut:"Tab",format:"indent"},
  link:{icon:"link",label:"Ссылка",shortcut:"Ctrl+K",format:"link"},
  divider:{icon:"divider",label:"Разделитель",shortcut:"",format:"divider"},
  table:{icon:"table",label:"Таблица",shortcut:"",format:"table"},
  codeblock:{icon:"codeblock",label:"Блок кода",shortcut:"",format:"codeblock"},
  date:{icon:"calendar",label:"Вставить дату и время",shortcut:"Ctrl+;",format:"date"},
  case:{icon:"case",label:"Регистр: ЗАГЛАВНЫЕ → строчные → как в предложении",shortcut:"Ctrl+Shift+U",format:"case"},
  clear:{icon:"eraser",label:"Убрать форматирование",shortcut:"Ctrl+\\",format:"clear"},
  moveup:{icon:"move-up",label:"Строку выше",shortcut:"Alt+↑",format:"moveup"},
  movedown:{icon:"move-down",label:"Строку ниже",shortcut:"Alt+↓",format:"movedown"},
  dup:{icon:"duplicate",label:"Дублировать строку",shortcut:"Ctrl+Shift+D",format:"dup"},
  sort:{icon:"sort",label:"Отсортировать строки",shortcut:"",format:"sort"},
  photo:{icon:"image",label:"Добавить фото",action:"attach-photo",needs:"media"},
  audiofile:{icon:"paperclip",label:"Добавить аудиофайл",action:"attach-audio",needs:"media"},
  voice:{icon:"mic",label:"Голос: диктовка или запись",action:"voice-menu",needs:"voice",pressed:true},
  ai:{icon:"sparkle",label:"Помощник ИИ",action:"ai-open",needs:"ai"},
};
export const SEP="|";
/** What everyone starts with (and what «Сбросить» returns to). */
export const DEFAULT_LAYOUT=[
  "bold","italic","strike","mark","code",SEP,"h1","h2","h3","quote",SEP,"bullet","numbered","checklist","outdent","indent",SEP,
  "link","divider","table","codeblock","date",SEP,"case","clear","moveup","movedown","dup",SEP,
  "photo","audiofile","voice",SEP,"ai"];
/** Ready-made own tools, one tap to add. */
export const PRESETS=[
  {id:"p-callout",label:"Выноска",icon:"bulb",before:"> 💡 ",after:"",line:true},
  {id:"p-important",label:"Важное",icon:"star",before:"**Важно:** ",after:"",line:false},
  {id:"p-today",label:"Задача на сегодня",icon:"check",before:"- [ ] ",after:" ({date})",line:true},
  {id:"p-mood",label:"Настроение",icon:"wave",before:"Настроение: ",after:"/5",line:false},
  {id:"p-grateful",label:"Благодарность",icon:"sun",before:"Благодарна за ",after:"",line:false},
  {id:"p-lesson",label:"Урок",icon:"book",before:"**Урок:** ",after:"",line:false},
  {id:"p-question",label:"Вопрос к себе",icon:"info",before:"❓ ",after:"",line:true},
  {id:"p-idea",label:"Идея",icon:"sparkle",before:"💭 Идея: ",after:"",line:true},
];
export const CUSTOM_ICONS=["star","bulb","check","bell","clock","tag","users","map","pen","sparkle","info","calendar","wave","moon","sun","book","key","link","quote","state"];
export const MAX_CUSTOM=16;

const isStr=v=>typeof v==="string";
/** Keeps only well-formed own tools; never trusts stored data. */
export function cleanCustomTools(list){
  const out=[],seen=new Set();
  for(const t of Array.isArray(list)?list:[]){
    if(!t||typeof t!=="object"||!isStr(t.id)||!/^[\w-]{1,24}$/.test(t.id)||seen.has(t.id)||Object.hasOwn(TOOLS,t.id))continue;
    const label=isStr(t.label)?t.label.trim().slice(0,28):"";
    const before=isStr(t.before)?t.before.slice(0,160):"",after=isStr(t.after)?t.after.slice(0,160):"";
    if(!label||(!before&&!after))continue;
    seen.add(t.id);
    out.push({id:t.id,label,before,after,icon:CUSTOM_ICONS.includes(t.icon)?t.icon:"pen",line:t.line===true});
    if(out.length>=MAX_CUSTOM)break;
  }
  return out;
}
export const isCustomId=id=>isStr(id)&&id.startsWith("c:");
/** Own tools are addressed as «c:<id>» inside a layout. */
export const customKey=id=>`c:${id}`;
export function toolInfo(key,customTools=[]){
  if(Object.hasOwn(TOOLS,key))return {key,...TOOLS[key],custom:false};
  if(isCustomId(key)){const t=customTools.find(c=>c.id===key.slice(2));if(t)return {key,icon:t.icon,label:t.label,shortcut:"",custom:true,tool:t};}
  return null;
}
/** A saved arrangement → a valid one: unknown or repeated tools dropped, separators tidied; an empty result falls back to the default. */
export function normalizeLayout(layout,customTools=[]){
  if(!Array.isArray(layout)||!layout.length)return [...DEFAULT_LAYOUT];
  const seen=new Set(),out=[];
  for(let k of layout.slice(0,120)){
    if(k==="record"||k==="dictate")k="voice"; // 4.5 had two microphone buttons; they are one now
    if(k===SEP){if(out.length&&out[out.length-1]!==SEP)out.push(SEP);continue;}
    if(!isStr(k)||seen.has(k)||!toolInfo(k,customTools))continue;
    seen.add(k);out.push(k);
  }
  while(out[out.length-1]===SEP)out.pop();
  return out.some(k=>k!==SEP)?out:[...DEFAULT_LAYOUT];
}
/** Tools that exist but are not on the bar right now. */
export function unusedTools(layout,customTools=[]){
  const used=new Set(layout);
  return [...Object.keys(TOOLS),...customTools.map(t=>customKey(t.id))].filter(k=>!used.has(k));
}
export function moveTool(layout,from,to){
  const a=[...layout];if(from<0||from>=a.length||to<0||to>=a.length||from===to)return a;
  const [x]=a.splice(from,1);a.splice(to,0,x);return normalizeLayoutKeepCustom(a);
}
function normalizeLayoutKeepCustom(a){ // separators tidied, tools untouched
  const out=[];for(const k of a){if(k===SEP&&(!out.length||out[out.length-1]===SEP))continue;out.push(k);}
  while(out[out.length-1]===SEP)out.pop();return out;
}
export const removeTool=(layout,key)=>normalizeLayoutKeepCustom(layout.filter(k=>k!==key));
export const addTool=(layout,key)=>layout.includes(key)?[...layout]:normalizeLayoutKeepCustom([...layout,key]);

/** Expands {date} {time} {datetime} in an own tool's text. */
export function expandTokens(text,now=new Date()){
  const p=n=>String(n).padStart(2,"0");
  const d=`${p(now.getDate())}.${p(now.getMonth()+1)}.${now.getFullYear()}`,t=`${p(now.getHours())}:${p(now.getMinutes())}`;
  return String(text).replaceAll("{datetime}",`${d} ${t}`).replaceAll("{date}",d).replaceAll("{time}",t);
}
/** Applies an own tool to the text. Selection is wrapped; with no selection the caret lands between the parts.
    `line` tools put the opening part at the start of each selected line instead. */
export function applyCustomTool(value,start,end,tool,now=new Date()){
  const before=expandTokens(tool.before,now),after=expandTokens(tool.after,now);
  if(tool.line){
    const ls=start<=0?0:value.lastIndexOf("\n",start-1)+1;
    const e2=end>start&&value[end-1]==="\n"?end-1:end; // a selection that swallowed the closing line break does not decorate the next line
    let le=value.indexOf("\n",e2);if(le<0)le=value.length;
    const lines=value.slice(ls,le).split("\n").map(l=>before+l+after);
    const text=lines.join("\n");
    const hadSel=end>start;
    return {value:value.slice(0,ls)+text+value.slice(le),start:hadSel?ls:ls+before.length,end:hadSel?ls+text.length:ls+before.length};
  }
  const sel=value.slice(start,end);
  const text=before+sel+after;
  const caret=sel?start+text.length:start+before.length;
  return {value:value.slice(0,start)+text+value.slice(end),start:caret,end:caret};
}

/** After drag-and-drop: the visible tokens (keys or separators) took a new order inside the slots they occupied;
    tools that are hidden right now (no microphone, AI off…) keep their place in the saved arrangement. */
export function reorderVisible(layout,slots,newTokens){
  const out=[...layout];slots.forEach((slot,i)=>{if(slot>=0&&slot<out.length&&i<newTokens.length)out[slot]=newTokens[i];});
  return normalizeLayoutKeepCustom(out);
}
