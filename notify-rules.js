/* Which reminders are due right now. One plain script used by both the page and the service worker
   (importScripts in sw.js, side-effect import in reminders.js), so they can never disagree.
   Notification texts never contain anything from the diary. */
(function(g){
  const pad=n=>String(n).padStart(2,"0");
  const dayKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const minutes=t=>{const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(t||"");return m?Number(m[1])*60+Number(m[2]):null;};
  const DEFAULTS={dailyOn:false,dailyTime:"21:00",weeklyOn:false,weeklyDay:0,weeklyTime:"19:00",decisionsOn:false,memoryOn:false,onThisDay:0,memoryDay:"",lastEntryDay:"",decisionDates:[],fired:{},base:"./"};
  function normalize(raw){
    const c={...DEFAULTS,...(raw&&typeof raw==="object"?raw:{})};
    c.fired=c.fired&&typeof c.fired==="object"?c.fired:{};
    c.decisionDates=Array.isArray(c.decisionDates)?c.decisionDates.filter(x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)):[];
    if(minutes(c.dailyTime)==null)c.dailyTime=DEFAULTS.dailyTime;
    if(minutes(c.weeklyTime)==null)c.weeklyTime=DEFAULTS.weeklyTime;
    if(!(c.weeklyDay>=0&&c.weeklyDay<=6))c.weeklyDay=0;
    return c;
  }
  /** @returns {{id:string,title:string,body:string,url:string}[]} reminders that should be shown now and have not been shown today */
  function due(raw,now=new Date()){
    const c=normalize(raw),today=dayKey(now),at=now.getHours()*60+now.getMinutes(),out=[];
    if(c.dailyOn&&c.lastEntryDay!==today&&c.fired.daily!==today&&at>=minutes(c.dailyTime))
      out.push({id:"daily",title:"Narra",body:"Вы собирались записать день. Хватит одной фразы.",url:"?quick=1"});
    if(c.weeklyOn&&now.getDay()===c.weeklyDay&&c.fired.weekly!==today&&at>=minutes(c.weeklyTime))
      out.push({id:"weekly",title:"Narra",body:"Неделя закончилась. Посмотрите обзор и добавьте свои выводы.",url:"?go=reviews"});
    const late=c.decisionDates.filter(d=>d<=today).length;
    if(c.decisionsOn&&late&&c.fired.decisions!==today&&at>=10*60)
      out.push({id:"decisions",title:"Narra",body:"Есть решение, к которому вы хотели вернуться.",url:"?go=journal"});
    if(c.memoryOn&&c.memoryDay===today&&c.onThisDay>0&&c.fired.memory!==today&&at>=9*60+30)
      out.push({id:"memory",title:"Narra",body:c.onThisDay===1?"В этот день у вас есть запись из прошлого.":"В этот день у вас есть записи из прошлого.",url:"?go=memories"});
    return out;
  }
  /** How many things are waiting, for the icon badge (ignores whether a notification was already shown). */
  function pending(raw,now=new Date()){
    const c=normalize(raw),today=dayKey(now),at=now.getHours()*60+now.getMinutes();
    let n=0;
    if(c.dailyOn&&c.lastEntryDay!==today&&at>=minutes(c.dailyTime))n++;
    if(c.decisionsOn&&c.decisionDates.some(d=>d<=today))n++;
    return n;
  }
  g.NarraNotify={due,pending,normalize,dayKey,minutes,DEFAULTS};
})(typeof self!=="undefined"?self:globalThis);
