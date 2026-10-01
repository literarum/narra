/* Narra UI kit: small markup builders shared by every view. Strings in, strings out; no state changes. */
import {state,escapeHtml,icon,capitalizeRu} from "./core.js?v=4.6.0";

export function modalHeader(title,subtitle="",iconName="info",closeAction="close-overlay"){
  return `<header class="modal-header"><div class="modal-heading">${icon(iconName,"modal-heading-icon")}<div><h2>${escapeHtml(title)}</h2>${subtitle?`<p>${escapeHtml(subtitle)}</p>`:""}</div></div><button type="button" class="icon-button icon-button-quiet" data-action="${closeAction}" aria-label="Закрыть">${icon("x")}</button></header>`;
}
export function statusPill(label,tone="neutral",iconName="info"){return `<span class="status-pill status-${tone}">${icon(iconName)}<span>${escapeHtml(label)}</span></span>`;}
export function pageHeader(eyebrow,title,sub="",actions=""){
  return `<header class="page-header"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1>${sub?`<p class="subtle">${escapeHtml(sub)}</p>`:""}</div>${actions?`<div class="page-actions">${actions}</div>`:""}</header>`;
}
export function emptyState(title,text,actionHtml="",iconName="journal"){
  return `<div class="empty">${icon(iconName,"empty-icon")}<h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p>${actionHtml}</div>`;
}
/** Safe highlighting: ranges are computed on raw text, then every segment is escaped separately. */
export function highlightHtml(text,ranges){
  if(!ranges?.length)return escapeHtml(text);
  let out="",pos=0;
  for(const [a,b] of ranges){out+=escapeHtml(text.slice(pos,a))+`<mark class="search-highlight">${escapeHtml(text.slice(a,b))}</mark>`;pos=b;}
  return out+escapeHtml(text.slice(pos));
}
export function switchRow(key,title,desc,{id=""}={}){
  const checked=key==="motion_on"?state.prefs.motion==="on":state.prefs[key];
  return `<div class="setting-row"><div class="setting-row-text"><strong>${title}</strong>${desc?`<span>${desc}</span>`:""}</div><div class="setting-row-control"><label class="switch"><input type="checkbox" role="switch" data-pref="${key}" ${id?`id="${id}"`:""} ${checked?"checked":""} aria-label="${escapeHtml(title)}"><span class="switch-track"></span></label></div></div>`;
}
export function segmentedRow(key,title,desc,options,{stacked=false}={}){
  return `<div class="setting-row${stacked?" is-stacked":""}"><div class="setting-row-text"><strong>${title}</strong>${desc?`<span>${desc}</span>`:""}</div><div class="setting-row-control"><div class="segmented" role="group" aria-label="${escapeHtml(title)}">${options.map(([value,label])=>`<button data-action="set-pref" data-key="${key}" data-value="${value}" aria-pressed="${String(state.prefs[key])===String(value)}" class="${String(state.prefs[key])===String(value)?"is-active":""}">${label}</button>`).join("")}</div></div></div>`;
}
export function settingsGroup(iconName,title,rows,note=""){
  return `<section class="settings-group"><h2>${icon(iconName)}${title}</h2><div class="card settings-list">${rows}${note?`<p class="setting-note">${note}</p>`:""}</div></section>`;
}
/** Tabs as a real tablist: arrow keys move between tabs (wired in app.js), each tab names the panel it controls. */
export function tabs(name,items,current,{label="Разделы"}={}){
  return `<div class="tabs" role="tablist" aria-label="${escapeHtml(label)}">${items.map(([id,text])=>`<button role="tab" id="tab-${name}-${id}" class="tab${id===current?" is-active":""}" data-action="tab" data-tabs="${name}" data-tab="${id}" aria-selected="${id===current}" aria-controls="panel-${name}" tabindex="${id===current?0:-1}">${escapeHtml(text)}</button>`).join("")}</div>`;
}
export const chip=(text,attrs="",{on=false}={})=>`<button type="button" class="chip${on?" is-on":""}" ${attrs} aria-pressed="${on}">${text}</button>`;
export const checkRow=(id,label,checked,attrs="")=>`<label class="check"><input id="${id}" type="checkbox" ${checked?"checked":""} ${attrs}><span class="check-box"></span><span>${label}</span></label>`;
export const field=(label,inner,cls="")=>`<label class="field ${cls}"><span class="label">${label}</span>${inner}</label>`;
export const selectHtml=(id,options,value,{label=""}={})=>`<select data-select id="${id}" aria-label="${escapeHtml(label)}">${options.map(([v,l])=>`<option value="${escapeHtml(v)}" ${String(value)===String(v)?"selected":""}>${escapeHtml(l)}</option>`).join("")}</select>`;
export {capitalizeRu};
