/* Motion that needs a little script: a tab indicator that slides, a pill that glides between bottom-bar items, and sheets that follow the finger.
   Everything here is skipped when animations are off or the system asks for reduced motion; the static styles then do the same job without movement. */
import {state,ctx,$,$$} from "./core.js?v=4.6.0";

const SPRING="cubic-bezier(.3,1.15,.5,1)";
const off=()=>ctx.reducedMotion?.()??false;
let prevTabs=null;

/** Call before the view is replaced: remembers where each tab indicator was. */
export function rememberTabs(view){
  prevTabs={route:state.route,map:{}};
  $$(".tabs",view).forEach(t=>{
    const a=t.querySelector(".tab.is-active");if(!a)return;
    prevTabs.map[a.dataset.tabs||t.getAttribute("aria-label")||""]={id:a.dataset.tab,left:a.offsetLeft,width:a.offsetWidth};
  });
}
/** Call after the view is drawn: places the indicator and slides it from the old spot. */
export function paintTabs(view){
  $$(".tabs",view).forEach(t=>{
    t.querySelector(".tab-ink")?.remove();t.classList.remove("has-ink");
    if(off())return;
    const a=t.querySelector(".tab.is-active");if(!a||!a.offsetWidth)return;
    const ink=document.createElement("i");ink.className="tab-ink";ink.setAttribute("aria-hidden","true");
    ink.style.left=`${a.offsetLeft}px`;ink.style.width=`${a.offsetWidth}px`;
    t.appendChild(ink);t.classList.add("has-ink");
    const key=a.dataset.tabs||t.getAttribute("aria-label")||"",was=prevTabs&&prevTabs.route===state.route?prevTabs.map[key]:null;
    if(was&&was.id!==a.dataset.tab&&ink.animate)ink.animate([{left:`${was.left}px`,width:`${was.width}px`},{left:`${a.offsetLeft}px`,width:`${a.offsetWidth}px`}],{duration:460,easing:SPRING});
  });
  prevTabs=null;
}
/** The pill under the active item of the bottom bar. */
export function paintNav(){
  const nav=$(".mobile-nav");if(!nav)return;
  let pill=nav.querySelector(".nav-pill");
  const a=nav.querySelector(".mobile-nav-item.is-active");
  if(!a||!nav.offsetWidth||off()){nav.classList.remove("has-pill");return;}
  if(!pill){pill=document.createElement("i");pill.className="nav-pill";pill.setAttribute("aria-hidden","true");nav.prepend(pill);}
  pill.style.top=`${a.offsetTop}px`;pill.style.height=`${a.offsetHeight}px`;
  pill.style.left=`${a.offsetLeft}px`;pill.style.width=`${a.offsetWidth}px`;
  nav.classList.add("has-pill");
}

/* ---------- sheets that follow the finger ---------- */
function closeButton(modal){
  const list=[...modal.querySelectorAll(".modal-header button[data-action]")];
  return list.reverse().find(b=>/close|cancel/.test(b.dataset.action))||null;
}
function initSheets(){
  let drag=null;
  document.addEventListener("pointerdown",e=>{
    if(e.pointerType==="mouse"||e.button>0||innerWidth>768)return;
    const head=e.target.closest?.(".modal-header");if(!head)return;
    const modal=head.closest(".modal,.sheet");if(!modal||modal.classList.contains("editor-modal")||!closeButton(modal))return;
    if(e.target.closest("button,a,input,select,textarea"))return;
    drag={modal,id:e.pointerId,y0:e.clientY,t0:performance.now(),dy:0};
  },true);
  document.addEventListener("pointermove",e=>{
    if(!drag||e.pointerId!==drag.id)return;
    const dy=Math.max(0,e.clientY-drag.y0);
    if(!drag.on&&dy<6)return;
    if(!drag.on){drag.on=true;drag.modal.classList.add("is-dragging");drag.modal.classList.remove("is-settling");try{drag.modal.setPointerCapture?.(e.pointerId);}catch{}}
    drag.dy=dy;
    drag.modal.style.transform=`translateY(${dy}px)`;
    const ov=drag.modal.closest(".overlay");if(ov)ov.style.opacity=String(Math.max(.25,1-dy/420));
    e.preventDefault();
  },{capture:true,passive:false});
  const end=e=>{
    if(!drag||e.pointerId!==drag.id)return;
    const d=drag;drag=null;
    if(!d.on)return;
    const {modal}=d,v=d.dy/Math.max(1,performance.now()-d.t0),ov=modal.closest(".overlay");
    modal.classList.remove("is-dragging");
    /* a cancelled touch or a tiny flick never closes anything: it needs a deliberate pull */
    if(e.type!=="pointercancel"&&(d.dy>120||(v>.7&&d.dy>=60))){
      const btn=closeButton(modal);
      modal.classList.add("is-settling");modal.style.transform="translateY(110%)";if(ov)ov.style.opacity="0";
      setTimeout(()=>{btn?.click();},180);
    }else{
      modal.classList.add("is-settling");modal.style.transform="";if(ov)ov.style.opacity="";
      setTimeout(()=>modal.classList.remove("is-settling"),520);
    }
  };
  document.addEventListener("pointerup",end,true);
  document.addEventListener("pointercancel",end,true);
}
export function init(){
  initSheets();
  addEventListener("resize",()=>paintNav(),{passive:true});
}
