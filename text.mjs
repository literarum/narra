/* Narra text helpers shared by the interface and by pure modules (reviews, export). No DOM. */
import {capitalizeRu,pluralRu} from "./domain.mjs?v=4.6.0";

export const strip=(s="")=>String(s).replace(/\s+/g," ").trim();
/** Markdown → plain text for excerpts and search-like views. */
export function mdToPlain(s=""){
  return String(s).replace(/```[\s\S]*?```/g," ").replace(/!\[([^\]]*)\]\(narra-media:[^)]*\)/g,"").replace(/^\s{0,3}#{1,6}\s+/gm,"").replace(/^\s*>\s?/gm,"").replace(/^\s*(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/gm,"")
    .replace(/^\s*([-*_])(?:\s*\1){2,}\s*$/gm," ").replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g,(m,a,b)=>b||a).replace(/\[([^\]]*)\]\(([^)]*)\)/g,"$1").replace(/(\*\*|__|~~|`)/g,"").replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,;:!?)])/g,"$1$2");
}
export const excerpt=(s="",n=220)=>{const t=strip(mdToPlain(s));return t.slice(0,n)+(t.length>n?"…":"");};
/** Title and excerpt for lists. Untitled entries borrow their first sentence, and the excerpt then skips it. */
export function entryText(e,excerptLen=260){
  const body=mdToPlain(e.body||"");
  if(e.title?.trim()) return {title:e.title.trim(),rest:excerpt(e.body,excerptLen),derived:false};
  const lines=body.split("\n").map(strip).filter(Boolean);
  if(!lines.length) return {title:"Без заголовка",rest:"",derived:true};
  const first=lines[0],sentence=(first.match(/^.+?[.!?…](?=\s|$)/)||[])[0];
  let taken,title;
  if(sentence&&sentence.length<=90){taken=sentence;title=sentence.replace(/\.$/,"");}
  else if(first.length<=90){taken=first;title=first.replace(/\.$/,"");}
  else{const at=first.lastIndexOf(" ",72),cut=first.slice(0,at>28?at:72).replace(/[\s,;:—-]+$/,"");taken=cut;title=`${cut}…`;}
  const rest=[first.slice(taken.length).trim(),...lines.slice(1)].filter(Boolean).join(" ");
  return {title,rest:rest?excerpt(rest,excerptLen):"",derived:true};
}
export const plural={
  word:n=>pluralRu(n,"слово","слова","слов"),
  entry:n=>pluralRu(n,"запись","записи","записей"),
  checkin:n=>pluralRu(n,"отметка","отметки","отметок"),
  day:n=>pluralRu(n,"день","дня","дней"),
  year:n=>pluralRu(n,"год","года","лет"),
  month:n=>pluralRu(n,"месяц","месяца","месяцев"),
};
export {capitalizeRu};
/** Unchecked checklist items in a Markdown body. */
export function openChecklistItems(body=""){return (String(body).match(/^\s*[-*+]\s+\[ \]\s+\S/gm)||[]).length;}
