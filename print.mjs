/* Narra print layouts: the review sheet and the yearly book. Pure functions that return HTML; the look is in styles.css (@media print).
   Monochrome by design: hierarchy comes from rules of different weight, small caps, numerals, tables and quotation marks, never from colour.
   No inline styles (the page runs under a strict CSP): everything is classes. */
import {dayKey,addDays} from "./stats.mjs?v=4.4.0";
import {SECTION_TITLES,SECTION_ORDER} from "./review.mjs?v=4.4.0";

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const MONTHS=["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const fullDate=key=>{const [y,m,d]=key.split("-").map(Number);return `${d} ${MONTHS[m-1]} ${y}`;};
const KIND_TITLE={week:"Обзор недели",month:"Обзор месяца",quarter:"Обзор квартала",year:"Обзор года"};
const SECTION_ICON={happened:"calendar",entities:"users",states:"wave",moments:"star",loops:"checklist",surprised:"sparkle",questions:"bulb"};
const ico=name=>`<svg class="pi" aria-hidden="true" focusable="false"><use href="#icon-${name}"/></svg>`;
const num=n=>String(n).padStart(2,"0");
const nbsp=n=>Number(n).toLocaleString("ru-RU").replace(/\s/g," ");
const para=t=>esc(t).replace(/\n/g,"<br>");

/** Day-by-day rhythm: one square per day, darker where more was written. Weeks run in columns, Monday at the top. */
export function rhythmMarkup(range,counts){
  const cells=[];
  const first=range.from,dow=(new Date(`${first}T12:00:00`).getDay()+6)%7,pad=range.kind==="week"?0:dow;
  for(let i=0;i<pad;i++)cells.push(`<i class="rc rc-pad"></i>`);
  let k=first,guard=0;
  while(k<=range.to&&guard++<400){
    const n=counts.get(k)||0;
    cells.push(`<i class="rc rc-${n>=3?3:n}"></i>`);
    k=addDays(k,1);
  }
  return `<div class="rhythm rhythm-${range.kind}" role="img" aria-label="Дни периода: закрашены дни с записями">${cells.join("")}</div>
    <p class="rhythm-key"><span><i class="rc rc-0"></i> без записей</span><span><i class="rc rc-1"></i> одна</span><span><i class="rc rc-2"></i> две</span><span><i class="rc rc-3"></i> три и больше</span></p>`;
}

function figures(stats){
  const cell=(n,label)=>`<td><span class="fig-n">${typeof n==="number"?nbsp(n):n}</span><span class="fig-l">${label}</span></td>`;
  return `<table class="figures"><tr>${cell(stats.entries,"записей")}${cell(stats.words,"слов")}${cell(`${stats.activeDays}<small>/${stats.periodDays}</small>`,"дней с записями")}${cell(stats.favorites,"избранных")}</tr></table>`;
}

function happenedBlock(facts){
  return `<table class="ptable"><tbody>${facts.map(f=>{
    const m=/^(.+?) — «(.+)»$/.exec(f.text);
    if(m)return `<tr><th scope="row">${esc(m[1])}</th><td><span class="q-l">«</span>${esc(m[2])}<span class="q-r">»</span></td></tr>`;
    const g=/^(.+?): (.+)$/.exec(f.text);
    return g?`<tr><th scope="row">${esc(g[1])}</th><td>${esc(g[2])}</td></tr>`:`<tr><td colspan="2">${esc(f.text)}</td></tr>`;
  }).join("")}</tbody></table>`;
}
function splitTable(facts){
  return `<table class="ptable"><tbody>${facts.map(f=>{
    const g=/^(.+?): (.+)$/.exec(f.text);
    return g?`<tr><th scope="row">${esc(g[1])}</th><td>${esc(g[2])}</td></tr>`:`<tr><td colspan="2">${esc(f.text)}</td></tr>`;
  }).join("")}</tbody></table>`;
}
function momentsBlock(facts){
  return facts.map(f=>{
    const m=/^«(.+?)»(?: — (.*))?$/.exec(f.text);
    return `<blockquote class="pquote"><span class="pquote-mark" aria-hidden="true">“</span><p class="pquote-title">${esc(m?m[1]:f.text)}</p>${m&&m[2]?`<p class="pquote-body">${esc(m[2])}</p>`:""}</blockquote>`;
  }).join("");
}
function loopsBlock(facts){return `<ul class="ploops">${facts.map(f=>`<li><i class="box" aria-hidden="true"></i><span>${esc(f.text)}</span></li>`).join("")}</ul>`;}
function questionsBlock(facts){
  return `<ol class="pquestions">${facts.map(f=>`<li><p>${esc(f.text)}</p><span class="wline"></span><span class="wline"></span></li>`).join("")}</ol>`;
}
const BLOCKS={happened:happenedBlock,entities:splitTable,states:splitTable,moments:momentsBlock,loops:loopsBlock,surprised:f=>`<ul class="pplain">${f.map(x=>`<li>${esc(x.text)}</li>`).join("")}</ul>`,questions:questionsBlock};


/** The review sheet. `counts` maps a day key to the number of entries written that day. */
export function reviewSheetHtml({review,saved={},hidden=new Set(),counts=new Map(),label,printedAt=new Date()}){
  const r=review.range,stats=review.stats;
  let n=0;
  const sections=SECTION_ORDER.map(k=>{
    const facts=(review.sections[k]||[]).filter(f=>!hidden.has(f.id)),own=String(saved.sections?.[k]||"").trim();
    if(!facts.length&&!own)return "";
    n++;
    return `<section class="psec psec-${k}"><header class="psec-head"><span class="psec-no">${num(n)}</span>${ico(SECTION_ICON[k]||"info")}<h2>${esc(SECTION_TITLES[k])}</h2></header>
      ${facts.length?BLOCKS[k](facts):""}${own?`<div class="pown"><span class="pown-l">Мои слова</span><p>${para(own)}</p></div>`:""}</section>`;
  }).join("");
  return `<article class="psheet">
    <header class="pmast"><div class="pmast-top"><span class="pbrand"><span class="pbrand-mark">N</span>Narra <em>личный дневник</em></span><span class="pmast-kind">${esc(KIND_TITLE[r.kind]||"Обзор")}</span></div>
      <div class="rule rule-heavy"></div>
      <h1>${esc(label)}</h1>
      <p class="pmast-dates">${esc(fullDate(r.from))} — ${esc(fullDate(r.to))}</p>
      <div class="rule rule-double"></div></header>
    ${figures(stats)}
    <section class="prhythm"><h2 class="pcap">Ритм периода</h2>${rhythmMarkup(r,counts)}</section>
    ${sections||`<p class="pempty">За этот период записей пока нет.</p>`}
    <section class="pcolophon"><div class="rule rule-hair"></div><p>Обзор составлен на вашем устройстве из ваших записей и отметок. Ничего не отправлялось и не оценивалось: факты можно проверить, открыв записи, на которые они опираются. Раздел «Мои слова» — ваш собственный текст.</p><p class="pcolophon-date">Напечатано ${esc(fullDate(dayKey(printedAt.toISOString())))}</p></section>
  </article>`;
}

/** The yearly book: cover, contents, one chapter per month with the person's own words, closing notes. */
export function bookSheetHtml({book,renderBody,ownSections=[],printedAt=new Date()}){
  const total=book.months.reduce((s,m)=>s+m.count,0);
  const toc=book.months.map((m,i)=>`<tr><th scope="row">${num(i+1)}</th><td>${esc(m.month)}</td><td class="toc-n">${m.count}</td></tr>`).join("");
  return `<article class="pbook">
    <section class="pcover"><div class="pcover-frame"><p class="pcover-kicker">Мой дневник</p><div class="rule rule-heavy"></div><h1>${esc(book.cover.title)}</h1><div class="rule rule-double"></div><p class="pcover-sub">${esc(book.cover.subtitle)}</p><span class="pcover-mark" aria-hidden="true">N</span></div></section>
    <section class="ptoc"><h2 class="pcap">Содержание</h2><table class="ptable ptoc-table"><tbody>${toc}${ownSections.length?`<tr><th scope="row">—</th><td>Итоги года</td><td class="toc-n"></td></tr>`:""}</tbody></table><p class="ptoc-note">Всего записей за год: ${nbsp(total)}. В книге — избранное и самые подробные записи каждого месяца.</p></section>
    ${book.months.map((m,i)=>`<section class="pchapter"><header class="pchapter-head"><span class="psec-no">${num(i+1)}</span><h2>${esc(m.month)}</h2></header><div class="rule rule-hair"></div>
      <p class="pchapter-sub">Записей за месяц: ${m.count}${m.entries.length<m.count?" · здесь — избранное и самое подробное":""}</p>
      ${m.entries.map(e=>`<div class="pentry"><div class="pentry-meta"><span class="pentry-date">${esc(e.dateLabel)}</span></div><div class="pentry-main"><h3>${esc(e.title)}</h3><div class="pentry-body">${renderBody(e)}</div></div></div>`).join("")}</section>`).join("")}
    ${ownSections.length?`<section class="pchapter"><header class="pchapter-head"><span class="psec-no">✦</span><h2>Итоги года</h2></header><div class="rule rule-hair"></div>${ownSections.map(x=>`<div class="pown"><span class="pown-l">${esc(x.title)}</span><p>${para(x.text)}</p></div>`).join("")}</section>`:""}
    <section class="pcolophon"><div class="rule rule-hair"></div><p>Книга собрана на вашем устройстве из ваших записей. Напечатано ${esc(fullDate(dayKey(printedAt.toISOString())))}.</p></section>
  </article>`;
}
