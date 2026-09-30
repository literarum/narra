/* Entry rows and lists shared by the today screen, the journal, search and the life map. */
import {state,ctx,escapeHtml,icon,relDay,fmtTime,fmtMonthYear,kindLabels,words,wordLabel,mediaOf,activeEntries} from "./core.js?v=4.3.0";
import {entryText,strip} from "./text.mjs?v=4.3.0";
import {highlightRanges} from "./domain.mjs?v=4.3.0";
import {highlightHtml,emptyState} from "./kit.js?v=4.3.0";

export function entryMetaMarkup(e){
  const themes=(e.themes||[]).slice(0,2).map(x=>"#"+x).join(" ");
  const wc=words(e.body),media=mediaOf(e.id).length;
  return `<div class="entry-meta"><span>${escapeHtml(kindLabels[e.kind]||"мысль")}</span><span>${wc} ${wordLabel(wc)}</span>${e.favorite?`<span>${icon("star")}Избранное</span>`:""}${media?`<span>${icon("image")}${media}</span>`:""}${themes?`<span>${escapeHtml(themes)}</span>`:""}${e.sensitive?`<span>${icon("lock")}Личное</span>`:""}</div>`;
}
export function entryRow(e,{parsed=null,fuzzy=false,showReason=false,reason="",select=false}={}){
  const t=entryText(e,260);
  let titleHtml=escapeHtml(t.title),restHtml=escapeHtml(t.rest),why=reason?`<div class="match-reason">${escapeHtml(reason)}</div>`:"";
  if(parsed&&!parsed.empty){
    const tr=highlightRanges(e.title?.trim()?t.title:"",parsed,{fuzzy});
    if(e.title?.trim())titleHtml=highlightHtml(t.title,tr);
    const raw=strip(e.body||""),br=highlightRanges(raw,parsed,{fuzzy});
    if(br.length){
      const first=br[0][0],start=first>90?Math.max(0,raw.lastIndexOf(" ",first-70)):0,slice=raw.slice(start,start+260);
      const shifted=br.filter(([a,b])=>a>=start&&b<=start+260).map(([a,b])=>[a-start,b-start]);
      restHtml=(start>0?"… ":"")+highlightHtml(slice,shifted)+(start+260<raw.length?" …":"");
    }else if(!tr.length&&showReason&&!why)why=`<div class="match-reason">Совпадение в темах, людях или месте</div>`;
  }
  const selected=state.journalSelected.has(e.id);
  const pick=select?`<label class="row-check"><input type="checkbox" data-select-entry="${escapeHtml(e.id)}" ${selected?"checked":""} aria-label="Выбрать запись «${escapeHtml(t.title)}»"><span class="check-box"></span></label>`:"";
  const thumb=mediaOf(e.id).find(a=>a.kind==="image"&&a.hasThumb);
  return `<article class="entry-card${select?" has-select":""}${selected?" is-selected":""}" data-entry-id="${escapeHtml(e.id)}">${pick}
      <time class="entry-date" datetime="${escapeHtml(e.happenedAt)}"><strong>${escapeHtml(relDay(e.happenedAt))}</strong><span>${escapeHtml(fmtTime(e.happenedAt))}</span></time>
      <div class="entry-main"><h3><button class="entry-title-link" data-action="open-entry" data-id="${escapeHtml(e.id)}">${titleHtml}</button></h3>${restHtml?`<p class="entry-excerpt">${restHtml}</p>`:""}${entryMetaMarkup(e)}${why}</div>
      ${thumb?`<img class="entry-thumb" data-media-thumb="${escapeHtml(thumb.id)}" alt="" width="56" height="56">`:icon("chevron-right","entry-chevron")}
    </article>`;
}
export function entryRows(entries,emptyMarkup=null,opts={}){
  if(!entries.length)return emptyMarkup??emptyState("Здесь пока тихо","Начните с одной фразы. Заголовок, темы и отметка состояния могут подождать.",`<button class="secondary button-with-icon" data-action="new-entry">${icon("plus")}<span>Создать первую запись</span></button>`);
  return `<div class="entry-list">${entries.map(e=>entryRow(e,opts)).join("")}</div>`;
}
export function monthGroups(entries,opts={}){
  if(!entries.length)return entryRows(entries);
  const groups=new Map();
  for(const e of entries){const d=new Date(e.happenedAt),k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e);}
  return [...groups.values()].map(g=>`<section class="timeline-group"><h2>${fmtMonthYear(new Date(g[0].happenedAt))}</h2>${entryRows(g,null,opts)}</section>`).join("");
}
export {activeEntries};
