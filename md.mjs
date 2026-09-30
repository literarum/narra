/* Narra Markdown core: pure text transforms for the editor toolbar and a safe renderer for preview.
   Every function takes and returns plain data so it can be unit-tested without a DOM. */

const BLOCK_PREFIX=/^(\s*)(#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+\[[ xX]\][ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)/;
const INLINE_MARKS={bold:"**",italic:"_",strike:"~~",code:"`",mark:"=="};

export function lineRange(value,pos){
  const start=value.lastIndexOf("\n",Math.max(0,pos)-1)+1;
  const nl=value.indexOf("\n",pos);
  return [start,nl===-1?value.length:nl];
}
function linesTouched(value,s,e){
  const [first]=lineRange(value,s);
  const endPos=e>s&&value[e-1]==="\n"?e-1:e;
  const [,last]=lineRange(value,endPos);
  return [first,last];
}
function blockKind(prefix){
  const p=prefix.trim();
  if(/^#{1,6}$/.test(p)) return "h"+p.length;
  if(p.startsWith(">")) return "quote";
  if(/^[-*+]\s*\[[ xX]\]$/.test(p)) return "checklist";
  if(/^[-*+]$/.test(p)) return "bullet";
  if(/^\d+[.)]$/.test(p)) return "numbered";
  return null;
}
export function parseBlock(line){
  const m=line.match(BLOCK_PREFIX);
  if(!m){const ind=line.match(/^\s*/)[0];return {kind:null,indent:ind,prefix:"",content:line.slice(ind.length)};}
  return {kind:blockKind(m[2]),indent:m[1],prefix:m[0],content:line.slice(m[0].length),marker:m[2]};
}

function replaceRange(value,from,to,text){return value.slice(0,from)+text+value.slice(to);}

/* ---------- inline wrapping (bold / italic / strike / code) ---------- */
function toggleInline(value,s,e,mark){
  const before=value.slice(0,s),after=value.slice(e);
  let sel=value.slice(s,e);
  // caret only: wrap the word under the caret, or open an empty pair
  if(s===e){
    const [ls,le]=lineRange(value,s),line=value.slice(ls,le),col=s-ls;
    if(before.endsWith(mark)&&after.startsWith(mark)) // "**|**" → remove empty pair
      return {value:replaceRange(value,s-mark.length,e+mark.length,""),start:s-mark.length,end:s-mark.length};
    let a=col,b=col;
    while(a>0&&/[\p{L}\p{N}]/u.test(line[a-1]))a--;
    while(b<line.length&&/[\p{L}\p{N}]/u.test(line[b]))b++;
    if(a===b){
      return {value:replaceRange(value,s,e,mark+mark),start:s+mark.length,end:s+mark.length};
    }
    return toggleInline(value,ls+a,ls+b,mark);
  }
  // keep spaces outside the markers
  const lead=sel.match(/^\s*/)[0].length,trail=sel.match(/\s*$/)[0].length;
  if(lead===sel.length) return {value,start:s,end:e};
  s+=lead;e-=trail;sel=value.slice(s,e);
  const b2=value.slice(0,s),a2=value.slice(e);
  if(b2.endsWith(mark)&&a2.startsWith(mark)&&!(mark==="_"&&(b2.endsWith("__")||a2.startsWith("__")))){
    const out=replaceRange(value,e,e+mark.length,"");
    const out2=replaceRange(out,s-mark.length,s,"");
    return {value:out2,start:s-mark.length,end:e-mark.length};
  }
  if(sel.length>=mark.length*2&&sel.startsWith(mark)&&sel.endsWith(mark)){
    const inner=sel.slice(mark.length,-mark.length);
    return {value:replaceRange(value,s,e,inner),start:s,end:s+inner.length};
  }
  return {value:replaceRange(value,s,e,mark+sel+mark),start:s+mark.length,end:e+mark.length};
}

/* ---------- block prefixes (heading / quote / lists) ---------- */
function setBlock(value,s,e,kind){
  const [from,to]=linesTouched(value,s,e);
  const lines=value.slice(from,to).split("\n");
  const parsed=lines.map(parseBlock);
  const skipEmpty=lines.length>1;
  const nonEmpty=parsed.filter(p=>!skipEmpty||p.content.trim()||p.kind);
  const allSame=nonEmpty.length>0&&nonEmpty.every(p=>p.kind===kind);
  let n=0;
  const out=lines.map((line,i)=>{
    const p=parsed[i];
    if(skipEmpty&&!p.content.trim()&&!p.kind) return line;
    const base=p.indent+p.content;
    if(allSame) return base;
    n++;
    const ind=p.indent;
    switch(kind){
      case "h1":case "h2":case "h3": return ind+"#".repeat(Number(kind[1]))+" "+p.content;
      case "quote": return ind+"> "+p.content;
      case "bullet": return ind+"- "+p.content;
      case "numbered": return ind+`${n}. `+p.content;
      case "checklist": return ind+"- [ ] "+p.content;
      default: return line;
    }
  });
  const text=out.join("\n"),next=replaceRange(value,from,to,text);
  if(s===e){
    const delta=text.length-(to-from);
    const [ls]=lineRange(next,from);
    const newCaret=Math.max(ls,Math.min(next.length,s+delta));
    return {value:next,start:newCaret,end:newCaret};
  }
  return {value:next,start:from,end:from+text.length};
}

function makeLink(value,s,e){
  const sel=value.slice(s,e);
  if(/^(https?:\/\/|mailto:)\S+$/i.test(sel)){
    const text=`[](${sel})`;
    return {value:replaceRange(value,s,e,text),start:s+1,end:s+1};
  }
  const label=sel||"текст";
  const text=`[${label}](https://)`;
  if(sel){const p=text.indexOf("(https://)")+1;return {value:replaceRange(value,s,e,text),start:s+p,end:s+p+8};}
  return {value:replaceRange(value,s,e,text),start:s+1,end:s+1+label.length};
}
function insertDivider(value,s,e){
  const [ls,le]=lineRange(value,e);
  const line=value.slice(ls,le),head=value.slice(0,le),tail=value.slice(le);
  let insert;
  if(line.trim()) insert="\n\n---\n\n";
  else insert=(head===""||head.endsWith("\n\n")?"":"\n")+"---\n\n";
  const text=head+insert+tail,caret=head.length+insert.length;
  return {value:text,start:caret,end:caret};
}

export function applyFormat(value,s,e,format){
  if(s>e)[s,e]=[e,s];
  if(INLINE_MARKS[format]) return toggleInline(value,s,e,INLINE_MARKS[format]);
  if(["h1","h2","h3","quote","bullet","numbered","checklist"].includes(format)) return setBlock(value,s,e,format);
  if(format==="link") return makeLink(value,s,e);
  if(format==="divider") return insertDivider(value,s,e);
  if(format==="codeblock") return insertCodeBlock(value,s,e);
  if(format==="table") return insertTable(value,s,e);
  if(format==="clear") return clearFormat(value,s,e);
  if(format==="case") return cycleCase(value,s,e);
  if(format==="indent"||format==="outdent") return shiftIndent(value,s,e,format==="outdent")||indentPlain(value,s,e,format==="outdent");
  if(format==="dup") return duplicateLines(value,s,e);
  if(format==="moveup"||format==="movedown") return moveLines(value,s,e,format==="moveup"?-1:1);
  if(format==="sort") return sortLines(value,s,e);
  return {value,start:s,end:e};
}

/* ---------- more tools: code block, table, clearing, case, moving lines ---------- */
function blockInsert(value,s,e,text,caretOffset){
  const [ls,le]=lineRange(value,e);
  const line=value.slice(ls,le),head=value.slice(0,le),tail=value.slice(le);
  const lead=line.trim()?"\n\n":(head===""||head.endsWith("\n\n")?"":"\n");
  const ins=lead+text+"\n";
  const at=head.length+lead.length+caretOffset;
  return {value:head+ins+tail,start:at,end:at};
}
export function insertCodeBlock(value,s,e){
  const sel=value.slice(s,e);
  if(sel.trim()){
    const wrapped="```\n"+sel.replace(/\n$/,"")+"\n```";
    return {value:replaceRange(value,s,e,wrapped),start:s+4,end:s+4+sel.replace(/\n$/,"").length};
  }
  return blockInsert(value,s,e,"```\n\n```",4);
}
export function insertTable(value,s,e){
  const t="| Столбец 1 | Столбец 2 | Столбец 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |";
  return blockInsert(value,s,e,t,2);
}
export function clearFormat(value,s,e){
  const [from,to]=s===e?lineRange(value,s):linesTouched(value,s,e);
  const clean=line=>{
    let t=parseBlock(line);t=t.indent+t.content;
    return t.replace(/\*\*([^*\n]+)\*\*/g,"$1").replace(/~~([^~\n]+)~~/g,"$1").replace(/==([^=\n]+)==/g,"$1")
      .replace(/`([^`\n]+)`/g,"$1").replace(/(?<![_\w])_([^_\n]+)_(?![_\w])/g,"$1").replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g,"$1")
      .replace(/\[([^\]\n]*)\]\((?!narra-media:)[^)\s]*\)/g,"$1");
  };
  const text=value.slice(from,to).split("\n").map(clean).join("\n");
  const next=replaceRange(value,from,to,text);
  const end=from+text.length;
  return {value:next,start:s===e?end:from,end};
}
function sentenceCase(t){return t.toLocaleLowerCase("ru-RU").replace(/(^|[.!?…]\s+)(\p{L})/gu,(m,a,b)=>a+b.toLocaleUpperCase("ru-RU"));}
export function cycleCase(value,s,e){
  if(s===e){const [ls,le]=lineRange(value,s);[s,e]=[ls,le];}
  const sel=value.slice(s,e);if(!sel.trim())return {value,start:s,end:e};
  const up=sel.toLocaleUpperCase("ru-RU"),low=sel.toLocaleLowerCase("ru-RU");
  const next=sel===up?low:sel===low?sentenceCase(sel):up;
  return {value:replaceRange(value,s,e,next),start:s,end:s+next.length};
}
function indentPlain(value,s,e,outdent){
  const [from,to]=linesTouched(value,s,e);
  const lines=value.slice(from,to).split("\n");let delta=0,first=0;
  const out=lines.map((l,i)=>{
    if(outdent){const m=l.match(/^( {1,2}|\t)/);if(!m)return l;delta-=m[0].length;if(i===0)first=-m[0].length;return l.slice(m[0].length);}
    if(!l.trim())return l;delta+=2;if(i===0)first=2;return "  "+l;
  });
  const text=out.join("\n");
  return {value:replaceRange(value,from,to,text),start:Math.max(from,s+first),end:Math.max(from,e+delta)};
}
export function duplicateLines(value,s,e){
  const [from,to]=linesTouched(value,s,e),block=value.slice(from,to);
  const next=value.slice(0,to)+"\n"+block+value.slice(to),shift=block.length+1;
  return {value:next,start:s+shift,end:e+shift};
}
export function moveLines(value,s,e,dir){
  const [from,to]=linesTouched(value,s,e);
  if(dir<0){
    if(from===0)return {value,start:s,end:e};
    const [pf]=lineRange(value,from-1);
    const prev=value.slice(pf,from-1),block=value.slice(from,to);
    const next=value.slice(0,pf)+block+"\n"+prev+value.slice(to),shift=-(prev.length+1);
    return {value:next,start:s+shift,end:e+shift};
  }
  if(to>=value.length)return {value,start:s,end:e};
  const [,ne]=lineRange(value,to+1);
  const nextLine=value.slice(to+1,ne),block=value.slice(from,to);
  const next=value.slice(0,from)+nextLine+"\n"+block+value.slice(ne),shift=nextLine.length+1;
  return {value:next,start:s+shift,end:e+shift};
}
export function sortLines(value,s,e){
  if(s===e)return {value,start:s,end:e};
  const [from,to]=linesTouched(value,s,e);
  const lines=value.slice(from,to).split("\n");
  const sorted=[...lines].sort((a,b)=>a.localeCompare(b,"ru",{numeric:true,sensitivity:"base"}));
  const text=sorted.join("\n");
  return {value:replaceRange(value,from,to,text),start:from,end:from+text.length};
}

/* ---------- which formats are active at the selection ---------- */
function inlineSpans(line){
  const spans=[];
  const rules=[["code",/`([^`\n]+)`/g],["bold",/\*\*([^*\n]+)\*\*/g],["strike",/~~([^~\n]+)~~/g],["mark",/==([^=\n]+)==/g],["italic",/(?<![_\w])_([^_\n]+)_(?![_\w])/g],["italic",/(?<!\*)\*([^*\n]+)\*(?!\*)/g],["link",/\[([^\]\n]*)\]\(([^)\n]*)\)/g]];
  for(const [name,re] of rules)for(const m of line.matchAll(re))spans.push({name,from:m.index,to:m.index+m[0].length});
  return spans;
}
export function activeFormats(value,s,e){
  const active=new Set();
  const [ls,le]=lineRange(value,s),line=value.slice(ls,le),p=parseBlock(line);
  if(p.kind) active.add(p.kind);
  const a=s-ls,b=Math.min(e,le)-ls;
  for(const sp of inlineSpans(line)) if(a>=sp.from&&b<=sp.to&&(a>sp.from||b<sp.to||a===b)) active.add(sp.name);
  return active;
}

/* ---------- Enter / Tab behaviour inside lists ---------- */
export function continueList(value,pos){
  const [ls,le]=lineRange(value,pos),line=value.slice(ls,le),p=parseBlock(line);
  if(!p.kind||p.kind[0]==="h") return null;
  if(pos-ls<p.prefix.length) return null;
  if(!p.content.trim()){
    const out=replaceRange(value,ls,le,"");
    return {value:out,start:ls,end:ls};
  }
  let next=p.indent;
  if(p.kind==="quote") next+="> ";
  else if(p.kind==="bullet") next+=p.marker.replace(/\s+$/,"")+" ";
  else if(p.kind==="checklist") next+=p.marker.replace(/\[[ xX]\]/,"[ ]");
  else if(p.kind==="numbered"){const n=parseInt(p.marker,10)+1;next+=`${n}${/\)/.test(p.marker)?")":"."} `;}
  const ins="\n"+next;
  return {value:replaceRange(value,pos,pos,ins),start:pos+ins.length,end:pos+ins.length};
}
export function shiftIndent(value,s,e,outdent=false){
  const [from,to]=linesTouched(value,s,e);
  const lines=value.slice(from,to).split("\n");
  if(!lines.every(l=>parseBlock(l).kind&&parseBlock(l).kind[0]!=="h")) return null;
  let delta=0,firstDelta=0;
  const out=lines.map((l,i)=>{
    if(outdent){const m=l.match(/^( {1,2}|\t)/);if(!m)return l;delta-=m[0].length;if(i===0)firstDelta=-m[0].length;return l.slice(m[0].length);}
    delta+=2;if(i===0)firstDelta=2;return "  "+l;
  });
  const text=out.join("\n");
  return {value:replaceRange(value,from,to,text),start:Math.max(from,s+firstDelta),end:Math.max(from,e+delta)};
}

/* ---------- minimal diff so the UI can replace only what changed (keeps native undo history) ---------- */
export function diffRange(oldValue,newValue){
  let a=0;const max=Math.min(oldValue.length,newValue.length);
  while(a<max&&oldValue[a]===newValue[a])a++;
  let b=0;
  while(b<max-a&&oldValue[oldValue.length-1-b]===newValue[newValue.length-1-b])b++;
  return {from:a,to:oldValue.length-b,text:newValue.slice(a,newValue.length-b)};
}

/* ---------- safe renderer for preview ---------- */
const esc=s=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function renderInline(text){
  const holds=[];
  let s=esc(text);
  s=s.replace(/`([^`\n]+)`/g,(_,c)=>{holds.push(`<code>${c}</code>`);return `\u0000${holds.length-1}\u0000`;});
  // media placeholders: the interface fills them with the decrypted picture or player after rendering
  s=s.replace(/!\[([^\]\n]*)\]\(narra-media:([A-Za-z0-9-]{8,64})\)/g,(_,alt,id)=>`\u0000${holds.push(`<span class="md-media" data-media-id="${id}" data-alt="${alt}"></span>`)-1}\u0000`);
  s=s.replace(/\[([^\]\n]*)\]\(([^)\s]*)\)/g,(m,label,url)=>{
    const raw=url.replace(/&amp;/g,"&");
    if(!/^(https?:\/\/|mailto:)[^\s"'<>]+$/i.test(raw)) return m;
    const href=esc(raw);
    return `\u0000${holds.push(`<a href="${href}" target="_blank" rel="noopener noreferrer">${label||href}</a>`)-1}\u0000`;
  });
  s=s.replace(/\*\*([^*\n]+)\*\*/g,"<strong>$1</strong>")
     .replace(/~~([^~\n]+)~~/g,"<del>$1</del>")
     .replace(/==([^=\n]+)==/g,"<mark>$1</mark>")
     .replace(/(?<![_\w])_([^_\n]+)_(?![_\w])/g,"<em>$1</em>")
     .replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g,"<em>$1</em>")
     .replace(/(^|[\s(])#([\p{L}\p{N}_-]{2,40})/gu,'$1<span class="md-tag">#$2</span>');
  return s.replace(/\u0000(\d+)\u0000/g,(_,i)=>holds[Number(i)]);
}
/** {collapsible:true} wraps every heading of level 1–3 and what follows it (up to the next heading of the same or higher level)
    in a <details open>, so long entries can be folded in the reading view. Text is never changed. */
export function renderMarkdown(source="",{collapsible=false}={}){
  const lines=String(source).replace(/\r\n?/g,"\n").split("\n");
  const out=[],levels=[];let i=0;
  const push=(html,level=0)=>{out.push(html);levels.push(level);};
  const isBlank=l=>!l.trim();
  while(i<lines.length){
    const line=lines[i];
    if(isBlank(line)){i++;continue;}
    const fence=line.match(/^\s*```(.*)$/);
    if(fence){
      const code=[];i++;
      while(i<lines.length&&!/^\s*```\s*$/.test(lines[i])){code.push(lines[i]);i++;}
      i++;push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);continue;
    }
    if(/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)){push("<hr>");i++;continue;}
    if(line.includes("|")&&i+1<lines.length&&lines[i+1].includes("|")&&/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i+1])){
      const cells=l=>l.trim().replace(/^\|/,"").replace(/\|$/,"").split("|").map(c=>c.trim());
      const head=cells(line),aligns=cells(lines[i+1]).map(c=>/^:-+:$/.test(c)?"center":/-:$/.test(c)?"right":"");
      i+=2;const rows=[];
      while(i<lines.length&&lines[i].includes("|")&&!isBlank(lines[i])){rows.push(cells(lines[i]));i++;}
      const cell=(t,k,tag)=>`<${tag}${aligns[k]?` class="a-${aligns[k]}"`:""}>${renderInline(t)}</${tag}>`;
      push(`<div class="md-table"><table><thead><tr>${head.map((c,k)=>cell(c,k,"th")).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${head.map((_,k)=>cell(r[k]||"",k,"td")).join("")}</tr>`).join("")}</tbody></table></div>`);continue;
    }
    const h=line.match(/^(#{1,6})[ \t]+(.*)$/);
    if(h){const level=Math.min(h[1].length+1,6);push(`<h${level}>${renderInline(h[2].trim())}</h${level}>`,h[1].length<=3?h[1].length:0);i++;continue;}
    if(/^>/.test(line)){
      const q=[];while(i<lines.length&&/^>/.test(lines[i])){q.push(lines[i].replace(/^>[ \t]?/,""));i++;}
      push(`<blockquote>${q.map(renderInline).join("<br>")}</blockquote>`);continue;
    }
    if(parseBlock(line).kind&&["bullet","numbered","checklist"].includes(parseBlock(line).kind)){
      const items=[];
      while(i<lines.length&&parseBlock(lines[i]).kind&&["bullet","numbered","checklist"].includes(parseBlock(lines[i]).kind)){items.push(parseBlock(lines[i]));i++;}
      push(renderList(items));continue;
    }
    const para=[];
    while(i<lines.length&&!isBlank(lines[i])&&!/^(#{1,6}[ \t]+|>|\s*```)/.test(lines[i])&&!(lines[i].includes("|")&&i+1<lines.length&&lines[i+1].includes("|")&&/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i+1]))&&!(parseBlock(lines[i]).kind&&["bullet","numbered","checklist"].includes(parseBlock(lines[i]).kind))&&!/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(lines[i])){para.push(lines[i]);i++;}
    if(!para.length){para.push(lines[i]);i++;}
    push(`<p>${para.map(renderInline).join("<br>")}</p>`);
  }
  if(!collapsible||!levels.some(Boolean))return out.join("\n");
  let html="";const stack=[];
  out.forEach((block,k)=>{
    const level=levels[k];
    if(level){
      while(stack.length&&stack[stack.length-1]>=level){html+="</div></details>";stack.pop();}
      html+=`<details class="md-fold" open><summary>${block}</summary><div class="md-fold-body">`;stack.push(level);
    }else html+=block+"\n";
  });
  while(stack.length){html+="</div></details>";stack.pop();}
  return html;
}
function renderList(items){
  const depth0=Math.floor(items[0].indent.replace(/\t/g,"  ").length/2);
  const depth=it=>Math.max(depth0,Math.floor(it.indent.replace(/\t/g,"  ").length/2));
  let idx=0;
  const build=(level)=>{
    const kind=items[idx].kind,tag=kind==="numbered"?"ol":"ul";
    let html=`<${tag}${kind==="checklist"?' class="md-check"':""}>`;
    while(idx<items.length&&depth(items[idx])>=level){
      const it=items[idx++];
      if(it.kind==="checklist"){
        const done=/\[[xX]\]/.test(it.marker);
        html+=`<li class="md-task${done?" is-done":""}"><span class="md-box${done?" is-checked":""}" aria-hidden="true"></span><span>${renderInline(it.content)}</span>`;
      }else html+=`<li>${renderInline(it.content)}`;
      if(idx<items.length&&depth(items[idx])>level) html+=build(depth(items[idx]));
      html+="</li>";
    }
    return html+`</${tag}>`;
  };
  let html="";
  while(idx<items.length) html+=build(depth0);
  return html;
}
