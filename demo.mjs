/* Narra demo data: a synthetic, clearly fictional diary used by demo mode and by tests.
   Seeded and deterministic. Effects are planted on purpose (days with work → higher tension, days with a walk → better mood),
   so the tests can check that the insights find exactly what was planted and nothing else. Pure, no DOM. */
import {cleanEntry} from "./domain.mjs?v=4.3.0";
import {cleanCheckin} from "./checkin.mjs?v=4.3.0";
import {addDays} from "./stats.mjs?v=4.3.0";

export function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}

export const DEMO_PEOPLE=["Аня","Мама","Игорь","Лена"];
export const DEMO_PLACES=["Дом","Парк","Кофейня","Офис","Набережная"];
export const DEMO_CHAPTERS=[{name:"Новая работа",offset:[60,0],description:"Первые месяцы на новом месте."},{name:"Переезд",offset:[150,61],description:"Поиск квартиры и сборы."}];
const OPENERS=["Сегодня","Утром","Вечером","Днём","После обеда","На этой неделе"];
const SNIPPETS={
  work:["Много звонков и правок, к вечеру голова гудит.","Обсуждали сроки проекта, договорились о следующем шаге.","Долго разбирала письма, но закрыла главный вопрос."],
  walk:["Прошлась по набережной, стало заметно легче.","Долгая прогулка без телефона, слушала птиц.","Вышел в парк на полчаса — и день сложился иначе."],
  people:["Разговор получился тёплым, давно так не болтали.","Договорились встретиться на выходных.","Было приятно просто помолчать рядом."],
  calm:["Тихий день, много чая и книга.","Ничего особенного, но хорошо.","Успела навести порядок и спокойно подумать."],
  decision:["Взвешиваю варианты и пока не решаюсь.","Кажется, я готов выбрать — запишу, чтобы потом сверить."],
  dream:["Приснилась большая река и старый мост."],
  thought:["Замечаю, что лучше думается утром.","Хочу больше времени проводить без экранов."]
};
const pick=(r,a)=>a[Math.floor(r()*a.length)];

/** days: how many days of history; density: chance of an entry on a day; returns {entries,checkins,chapters,config,now,planted}. */
export function makeDemo({seed=7,days=180,density=.6,now=new Date("2026-09-29T12:00:00+04:00")}={}){
  const r=rng(seed),today=new Date(now),entries=[],checkins=[];
  const dayOf=i=>addDays(today.toISOString().slice(0,10),-i);
  const chapters=DEMO_CHAPTERS.map((c,i)=>({id:`demo-ch-${i+1}`,name:c.name,start:dayOf(c.offset[0]===0?c.offset[0]:c.offset[0]),end:dayOf(c.offset[1]),description:c.description,sort:i}));
  chapters[0].start=dayOf(60);chapters[0].end="";chapters[1].start=dayOf(150);chapters[1].end=dayOf(61);
  for(let i=days-1;i>=0;i--){
    const day=dayOf(i),at=h=>new Date(`${day}T${String(h).padStart(2,"0")}:${String(Math.floor(r()*50)+5).padStart(2,"0")}:00`).toISOString();
    const workday=new Date(`${day}T12:00:00`).getDay()%6!==0;
    const hasWork=workday&&r()<.75,hasWalk=r()<.35,hasPeople=r()<.3;
    const tension=Math.max(1,Math.min(5,Math.round(2+(hasWork?1.6:0)+(r()-.5)*1.6)));
    const mood=Math.max(-2,Math.min(2,Math.round(0+(hasWalk?1.2:0)+(hasPeople?.6:0)-(hasWork?.3:0)+(r()-.5)*1.4)));
    const energy=Math.max(1,Math.min(5,Math.round(3+(hasWalk?.6:0)-(hasWork?.4:0)+(r()-.5)*2)));
    if(r()<.85){
      const c=cleanCheckin({id:`demo-c-${i}`,observedAt:at(9+Math.floor(r()*10)),moodValence:mood,energy,tension,
        emotions:hasWalk?[{name:"спокойствие",intensity:3}]:hasWork?[{name:"усталость",intensity:3}]:[],
        context:{activities:[hasWork?"работа":null,hasWalk?"прогулка":null].filter(Boolean),social:hasPeople?["с близкими"]:[],needs:[],triggers:[],weather:"",mode:""}});
      if(c)checkins.push(c);
    }
    if(r()<density){
      const parts=[],themes=[],people=[];let kind="day",location="";
      if(hasWork){parts.push(pick(r,SNIPPETS.work));themes.push("работа");location="Офис";}
      if(hasWalk){parts.push(pick(r,SNIPPETS.walk));themes.push("прогулка");location=pick(r,["Парк","Набережная"]);}
      if(hasPeople){parts.push(pick(r,SNIPPETS.people));people.push(pick(r,DEMO_PEOPLE));themes.push("близкие");}
      if(!parts.length){parts.push(pick(r,SNIPPETS.calm));location="Дом";}
      if(r()<.06){parts.push(pick(r,SNIPPETS.dream));kind="dream";}
      else if(r()<.05){parts.push(pick(r,SNIPPETS.decision));kind="decision";themes.push("выбор");}
      else if(r()<.12){parts.push(pick(r,SNIPPETS.thought));kind="thought";}
      const ch=chapters.find(c=>day>=c.start&&(!c.end||day<=c.end));
      const e=cleanEntry({id:`demo-e-${i}`,title:r()<.4?`${pick(r,OPENERS)}: ${themes[0]||"заметка"}`:"",body:`${pick(r,OPENERS)} — ${parts.join(" ")}`,happenedAt:at(19+Math.floor(r()*3)),kind,themes,people,location,
        chapterId:ch?ch.id:null,favorite:r()<.06,completedAt:at(20),
        decision:kind==="decision"?{decision:"Остаться на прежней работе или перейти",context:"Предложили новую роль.",options:"1) остаться; 2) перейти",expected:"Меньше суеты по вечерам",confidence:3,revisitOn:addDays(day,30),outcome:"",outcomeAt:null}:null});
      if(e)entries.push(e);
    }
  }
  return {entries,checkins,chapters,now:today,planted:{tensionHigherWith:"работа",moodHigherWith:"прогулка"},
    config:{enabled:{moodValence:true,energy:true,tension:true},custom:[],emotions:true,context:true,note:false,extra:{emotions:[],needs:[],triggers:[],activities:[],social:[]},pairing:false}};
}

/** One large entry for performance checks (about `chars` characters of Russian prose). */
export function bigBody(chars=50000,seed=3){
  const r=rng(seed),words=("тихий вечер город дорога чай окно разговор память утро река снег книга друг мысль решение работа дом свет шаг сон голос лето").split(" ");
  let out="";while(out.length<chars){const n=6+Math.floor(r()*12),s=[];for(let i=0;i<n;i++)s.push(pick(r,words));out+=`${s.join(" ").replace(/^./,c=>c.toUpperCase())}. `;if(r()<.12)out+="\n\n";}
  return out.slice(0,chars);
}
/** Many small entries for list, search and palette timing. */
export function manyEntries(n=5000,seed=11){
  const r=rng(seed),themes=["работа","дом","семья","путь","книги","сон","город"],out=[];
  const base=Date.parse("2020-01-01T10:00:00Z");
  for(let i=0;i<n;i++){
    const at=new Date(base+i*Math.floor(2200e6/n)).toISOString();
    const e=cleanEntry({id:`bulk-${i}`,title:i%3?"":`Заметка ${i}`,body:`${pick(r,OPENERS)} ${bigBody(160+Math.floor(r()*300),i+1)}`,happenedAt:at,themes:[pick(r,themes)],people:r()<.2?[pick(r,DEMO_PEOPLE)]:[],location:r()<.3?pick(r,DEMO_PLACES):""});
    if(e)out.push(e);
  }
  return out;
}
