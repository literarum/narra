/* Settings: interface, feature switches, editor, check-in fields, privacy (lock and assistant), data, and an honest «about».
   Everything optional can be turned off here and its screens disappear; nothing that was written is deleted by a switch. */
import {state,ctx,$,$$,escapeHtml,icon,FEATURES,APP_VERSION,featureOn,entryLabel,plural,kindLabels} from "./core.js?v=4.6.0";
import {pageHeader,tabs,settingsGroup,switchRow,segmentedRow,selectHtml} from "./kit.js?v=4.6.0";
import {CORE_DIMENSIONS,DEEP_DIMENSIONS,activeDimensions,cleanConfig,DEFAULT_CONFIG} from "./checkin.mjs?v=4.6.0";
import {AI_FEATURES,FEATURE_GROUPS,PROVIDERS,providerById,detectProvider,listModels,pickModel,createProvider,runFeature,cleanAiState,REASON_TEXT} from "./ai.mjs?v=4.6.0";
import {TIERS,fmtTok} from "./brain.mjs?v=4.6.0";
import {ADDRESS,STYLES,LENGTHS} from "./therapy.mjs?v=4.6.0";
import {INACTIVITY_OPTIONS} from "./lock.mjs?v=4.6.0";
import {capitalizeRu} from "./domain.mjs?v=4.6.0";
import {MIN_N,METHOD_VERSION} from "./stats.mjs?v=4.6.0";
import {METHOD_ID} from "./insights-model.mjs?v=4.6.0";
import {entryText} from "./text.mjs?v=4.6.0";
import {entityMap} from "./derived.js?v=4.6.0";
import * as store from "./store.js?v=4.6.0";

const TABS=[["basic","Основные"],["features","Функции"],["editor","Редактор"],["checkin","Отметки"],["privacy","Приватность"],["ai","Помощник"],["data","Данные"],["about","О Narra"]];
const sw=(attrs,title,desc,checked,extra="")=>`<div class="setting-row"><div class="setting-row-text"><strong>${title}</strong>${desc?`<span>${desc}</span>`:""}</div><div class="setting-row-control"><label class="switch"><input type="checkbox" role="switch" ${attrs} ${checked?"checked":""} ${extra} aria-label="${escapeHtml(title.replace(/<[^>]+>/g,""))}"><span class="switch-track"></span></label></div></div>`;
const row=(title,desc,control,{stacked=false}={})=>`<div class="setting-row${stacked?" is-stacked":""}"><div class="setting-row-text"><strong>${title}</strong>${desc?`<span>${desc}</span>`:""}</div><div class="setting-row-control">${control}</div></div>`;
const prefSelect=(key,options,label)=>`<select data-select data-pref="${key}" aria-label="${escapeHtml(label)}">${options.map(([v,l])=>`<option value="${escapeHtml(v)}" ${String(state.prefs[key])===String(v)?"selected":""}>${escapeHtml(l)}</option>`).join("")}</select>`;
const btn=(action,label,{cls="secondary",attrs=""}={})=>`<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;

/* ---------- basic ---------- */
function basicTab(){
  const themeBtns=[["system","Как в системе"],["light","Светлая"],["dark","Тёмная"]].map(([v,l])=>`<button data-action="set-theme" data-theme="${v}" aria-pressed="${state.theme===v}" class="${state.theme===v?"is-active":""}">${l}</button>`).join("");
  const routes=[["today","Сегодня"],["journal","Дневник"],["search","Поиск"],...(featureOn("featInsights")?[["insights","Наблюдения"]]:[])];
  return `${settingsGroup("theme","Оформление",
      row("Тема","Светлая или тёмная. По умолчанию — как в системе.",`<div class="segmented" role="group" aria-label="Тема">${themeBtns}</div>`)
      +segmentedRow("density","Плотность","Компактный вид помещает больше записей на экран.",[["comfortable","Свободная"],["compact","Компактная"]])
      +sw('data-pref="motion_on"',"Анимации","Плавные переходы. Выключаются сами, если в системе включено «уменьшить движение».",state.prefs.motion==="on"))}
    ${settingsGroup("home","Начало работы",
      row("Открывать при запуске","",prefSelect("startRoute",routes,"Открывать при запуске"))
      +row("Неделя начинается с","Для календаря и обзоров.",prefSelect("weekStart",[["1","понедельника"],["0","воскресенья"]],"Неделя начинается с"))
      +sw('data-pref="relativeDates"',"«Сегодня» и «Вчера»","Вместо дат для недавних записей.",state.prefs.relativeDates)
      +row("Записей на странице","Сколько показывать в ленте за один раз.",prefSelect("journalPage",[["20","20"],["40","40"],["80","80"]],"Записей на странице")))}
    ${settingsGroup("layout","Экран «Сегодня»",
      sw('data-pref="showCheckin"',"Отметка состояния","Три быстрых вопроса о состоянии.",state.prefs.showCheckin)
      +sw('data-pref="showMemory"',"Воспоминание дня","Одна запись из прошлого, с объяснением, почему она показана.",state.prefs.showMemory)
      +sw('data-pref="showPrompt"',"Вопрос дня","Необязательная подсказка, с чего начать.",state.prefs.showPrompt)
      +sw('data-pref="showRecent"',"Недавние записи","",state.prefs.showRecent)
      +sw('data-pref="showContinue"',"«Продолжить»","Возврат к незавершённой записи.",state.prefs.showContinue))}
    ${deviceGroup()}
    ${settingsGroup("keyboard","Клавиатура",
      sw('data-pref="shortcuts"',"Подсказки клавиш","Показывать сочетания клавиш в подсказках.",state.prefs.shortcuts)
      +segmentedRow("quickKey","Клавиша новой записи","Работает, когда курсор не в поле ввода.",[["n","N"],["c","C"],["off","Выкл."]]),
      "Ctrl/⌘ K — палитра команд, «/» — поиск.")}
    ${settingsGroup("bell","Напоминания",
      sw('data-pref="notifyDaily"',"Напомнить о записи","Раз в день, если вы ещё ничего не записали. В уведомлении нет текста дневника.",state.prefs.notifyDaily)
      +(state.prefs.notifyDaily?row("Время","",`<input class="input input-time" type="time" data-pref="reminderTime" value="${escapeHtml(state.prefs.reminderTime)}" aria-label="Время напоминания">`):"")
      +sw('data-pref="notifyWeekly"',"Итоги недели","Напоминание заглянуть в обзор недели.",state.prefs.notifyWeekly)
      +(state.prefs.notifyWeekly?row("День",``,prefSelect("notifyWeeklyDay",[["0","воскресенье"],["1","понедельник"],["5","пятница"],["6","суббота"]],"День итогов недели")):"")
      +sw('data-pref="notifyDecisions"',"Вернуться к решению","В день, который вы выбрали в журнале решений.",state.prefs.notifyDecisions)
      +sw('data-pref="notifyMemory"',"Запись из прошлого","В день, когда у вас есть записи с этой же даты в прошлые годы.",state.prefs.notifyMemory)
      +row("Проверка",notifyStatus(),`<button class="secondary" data-action="notify-test">Показать пример</button>`)
      +sw('data-pref="reminderOn"',"Карточка на экране «Сегодня»","Мягкое напоминание внутри приложения, если время записи уже прошло.",state.prefs.reminderOn),
      "Расписание хранится только на этом устройстве. Приложение не отправляет ничего на сервер.")}`;
}
function deviceGroup(){
  const rows=[];
  const standalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
  if(!standalone)rows.push(row("Установить приложение","Откроется в своём окне, без адресной строки, с ярлыками «Новая запись» и «Быстрая заметка».",`<button class="secondary" data-action="install-app">Установить</button>`));
  else rows.push(row("Установлено","Narra запущена как приложение.",""));
  if(navigator.wakeLock)rows.push(sw('data-pref="keepAwake"',"Экран не гаснет при письме","Пока открыта запись, устройство не засыпает.",state.prefs.keepAwake));
  if(navigator.vibrate)rows.push(sw('data-pref="haptics"',"Отклик вибрацией","Лёгкая вибрация при нажатиях.",state.prefs.haptics));
  if(navigator.setAppBadge)rows.push(sw('data-pref="badge"',"Значок на иконке","Число ожидающих напоминаний.",state.prefs.badge));
  if(typeof window.showDirectoryPicker==="function")rows.push(row("Копии в папку",state.prefs.autoBackup?"Раз в сутки при открытии Narra сохраняется полная копия. Последние 7 хранятся.":"Автоматические копии дневника в выбранную папку на устройстве.",state.prefs.autoBackup?`<button class="secondary" data-action="autobackup-now">Сохранить сейчас</button><button class="ghost" data-action="autobackup-off">Отключить</button>`:`<button class="secondary" data-action="autobackup-choose">Выбрать папку</button>`));
  if(globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition)rows.push(row("Диктовка","Кнопка с микрофоном в редакторе печатает то, что вы говорите.",""));
  rows.push(row("Открытие файлов","Резервные копии .narra и .zip можно открыть двойным щелчком в установленном приложении.",""));
  return settingsGroup("phone","Это устройство",rows.join(""),"Возможности зависят от браузера; недоступные не показываются.");
}
function notifyStatus(){
  const g=globalThis.Notification?Notification.permission:"unsupported";
  if(g==="granted")return "Разрешены. Приходят, пока Narra открыта или свёрнута, а на телефоне и компьютере с установленным приложением — и в фоне, если система это позволяет.";
  if(g==="denied")return "Запрещены в настройках браузера или системы. Разрешите их для этого сайта.";
  if(g==="unsupported")return /iP(hone|ad|od)/.test(navigator.userAgent)?"На iPhone уведомления доступны после добавления Narra на экран «Домой».":"Этот браузер не поддерживает уведомления.";
  return "Разрешение будет запрошено при включении.";
}

/* ---------- feature switches ---------- */
function featuresTab(){
  const groups=[...new Set(FEATURES.map(f=>f.group))];
  const on=FEATURES.filter(f=>featureOn(f.key)).length;
  return `<p class="subtle settings-lead">Включайте только то, чем пользуетесь. Выключенное пропадает из меню и с экранов; записи и данные остаются на месте и вернутся при включении.</p>
    <div class="features-actions"><span class="subtle text-small">Включено: ${on} из ${FEATURES.length}</span>${btn("features-minimal","Оставить только дневник")}${btn("features-all","Включить всё")}</div>
    ${groups.map(g=>settingsGroup(g==="Разделы"?"layout":g==="Записи"?"pen":"search",g,FEATURES.filter(f=>f.group===g).map(f=>sw(`data-pref="${f.key}"`,f.name,f.desc,featureOn(f.key))).join(""))).join("")}
    ${settingsGroup("sparkle","Внешний помощник",row("Помощник на основе ИИ","Необязательный. Подключается ключом от любого ИИ-сервиса; управление — в разделе «Помощник».",btn("open-ai-settings","Открыть настройки")))}`;
}

/* ---------- editor ---------- */
function editorTab(){
  return `${settingsGroup("type","Шрифт и ширина",
    segmentedRow("editorFont","Шрифт письма","Для текста записи.",[["serif","С засечками"],["sans","Без засечек"]])
    +segmentedRow("editorWidth","Ширина строки","Узкая строка читается легче.",[["standard","Узкая"],["wide","Широкая"]]))}
    <section class="settings-group"><h2>${icon("eye")}Как это выглядит</h2><div class="card editor-sample" data-editor-sample><p>Утро было тихим. Я долго стояла у окна и думала о том, что хочу сохранить из этого года.</p></div></section>
    ${settingsGroup("type","Панель форматирования",
      row("Кнопки над текстом","Меняйте порядок, убирайте лишнее, добавляйте свои инструменты. В самом редакторе кнопку можно удержать и перетащить.",`<button type="button" class="secondary" data-action="toolbar-settings">Настроить</button>`))}
    ${settingsGroup("pen","Во время письма",
      sw('data-pref="editorStats"',"Счётчик слов","Слова, символы и время чтения под текстом.",state.prefs.editorStats)
      +sw('data-pref="spellcheck"',"Проверка орфографии браузера","Подчёркивание слов с ошибками. Проверку делает сам браузер.",state.prefs.spellcheck)
      +sw('data-pref="featWritingAssist"',"Помощь при письме","Вопросы и шаблон структуры — только по нажатию.",featureOn("featWritingAssist"))
      +sw('data-pref="featEntitySuggest"',"Подсказки людей и мест","Предлагает добавить тех, кого вы уже упоминали.",featureOn("featEntitySuggest")),
      "Сохранение автоматическое: текст записывается на устройство несколько секунд спустя после последнего нажатия.")}`;
}

/* ---------- check-in fields ---------- */
const cfg=()=>cleanConfig(state.config||DEFAULT_CONFIG);
function checkinTab(){
  const c=cfg(),dimRow=d=>sw(`data-cfg="dim:${d.key}"`,d.name,d.note||`От «${d.labels[0].toLocaleLowerCase("ru-RU")}» до «${d.labels.at(-1).toLocaleLowerCase("ru-RU")}».`,c.enabled[d.key]);
  const customRows=c.custom.map(x=>sw(`data-cfg="dim:c_${x.id}"`,escapeHtml(x.name),`От «${escapeHtml(x.low)}» до «${escapeHtml(x.high)}». <button class="link-button" data-action="cfg-remove-custom" data-id="${x.id}">Удалить поле</button>`,c.enabled[`c_${x.id}`])).join("");
  const own=(label,key)=>row(label,c.extra[key].length?c.extra[key].map(escapeHtml).join(", "):"Пока нет своих вариантов.",`<button class="secondary" data-action="cfg-add-own" data-key="${key}">Добавить</button>${c.extra[key].length?`<button class="ghost" data-action="cfg-clear-own" data-key="${key}">Очистить</button>`:""}`,{stacked:true});
  return `<p class="subtle settings-lead">Отметка нужна, чтобы лучше рассказывать историю, а не чтобы оценивать себя. По умолчанию — три вопроса; всё остальное включается здесь.</p>
    ${settingsGroup("state","Быстрые поля",CORE_DIMENSIONS.map(dimRow).join(""),"Значения хранятся как порядковые: «выше» или «ниже», а не как точные числа.")}
    ${settingsGroup("state","Дополнительные поля",DEEP_DIMENSIONS.map(dimRow).join("")+customRows+row("Своё поле","Например, «Творческий подъём» или «Боль».",`<button class="secondary" data-action="cfg-add-custom" ${c.custom.length>=6?"disabled":""}>Добавить поле</button>`))}
    ${settingsGroup("layout","Что можно указать в развёрнутой отметке",
      sw('data-cfg="block:emotions"',"Эмоции","Названия чувств с силой от 1 до 5.",c.emotions)
      +sw('data-cfg="block:context"',"Контекст","Что нужно сейчас, что повлияло, чем занимались, с кем.",c.context)
      +sw('data-cfg="block:note"',"Короткая заметка","К самой отметке, не к записи.",c.note)
      +sw('data-cfg="block:pairing"',"Отметка до и после письма","Иногда предлагать короткую отметку вокруг записи. Показывает, как письмо влияет на состояние.",c.pairing))}
    ${c.emotions||c.context?settingsGroup("tag","Свои варианты",(c.emotions?own("Эмоции","emotions"):"")+(c.context?own("Что сейчас нужно","needs")+own("Что повлияло","triggers")+own("Чем занимались","activities")+own("С кем","social"):"")):""}
    ${settingsGroup("journal","В дневнике",sw('data-pref="featEmotionsInJournal"',"Эмоции дня в ленте","Подсказка с состоянием и эмоциями дня рядом с датой.",featureOn("featEmotionsInJournal")))}`;
}

/* ---------- privacy ---------- */
const CAPS=[[0,"Без лимита"],[20000,"20 тыс. в день"],[50000,"50 тыс. в день"],[100000,"100 тыс. в день"],[250000,"250 тыс. в день"],[1000000,"1 млн в день"]];
const selectAi=(key,options,value,label)=>`<select data-select data-ai="${key}" aria-label="${escapeHtml(label)}">${options.map(([v,l])=>`<option value="${escapeHtml(v)}" ${String(value)===String(v)?"selected":""}>${escapeHtml(l)}</option>`).join("")}</select>`;
const swAi=(key,title,desc,checked)=>sw(`data-ai="${key}"`,title,desc,checked);
function aiTab(){
  const ai=cleanAiState(state.ai),n=ai.log.length,p=providerById(ai.provider),ready=Boolean(p&&(state.aiKey||p.needsKey===false));
  const conn=ready
    ?row("Подключено",`${escapeHtml(p.name)} · ${escapeHtml(ai.model||p.model)}${p.local?" · работает на вашем компьютере":""}`,`${btn("ai-connect","Изменить")}${btn("ai-test","Проверить")}${btn("ai-disconnect","Отключить",{cls:"ghost danger-quiet"})}`)
    :row("Подключение","Вставьте ключ доступа от любого ИИ-сервиса — сервис и модель подберутся сами. Подойдут OpenAI, Claude, Gemini, OpenRouter, Groq, Mistral, DeepSeek, xAI, а также локальные модели (Ollama, LM Studio) и любой сервис, совместимый с OpenAI.",btn("ai-connect","Добавить ключ",{cls:"primary"}));
  const groups=FEATURE_GROUPS.map(g=>{
    const list=AI_FEATURES.filter(f=>f.group===g.id);
    return settingsGroup(g.icon,`${g.name}`,list.map(f=>swAi(`feature:${f.id}`,f.name,`${f.blurb?escapeHtml(f.blurb)+" ":""}Отправляется: ${escapeHtml(f.sends)}. Только после вашего подтверждения${f.kind==="chat"?" (один раз на беседу)":""}.`,ai.features[f.id])).join(""));
  }).join("");
  const t=ai.talk;
  const talkGroup=ai.enabled&&ai.features.talk?settingsGroup("chat","Собеседник: как разговаривать",
    row("Обращение","",selectAi("talk:address",ADDRESS,t.address,"Обращение"))
    +row("Манера","",selectAi("talk:style",STYLES,t.style,"Манера"))
    +row("Длина ответов","Короткие ответы дешевле.",selectAi("talk:length",LENGTHS,t.length,"Длина ответов"))
    +swAi("talk:diary","Опираться на записи дневника","Портрет дневника и подобранные выдержки. Личные записи и скрытые темы не используются. Выключено — Собеседник видит только то, что вы пишете ему.",t.diary)
    +swAi("talk:checkins","Учитывать отметки самочувствия","Динамика настроения, энергии и напряжения, чувства и триггеры из отметок.",t.checkins)
    +swAi("talk:memory","Помнить прошлые беседы","Короткая память: над чем работали, ваши выводы и шаги. Хранится только у вас.",t.memory)
    +swAi("talk:eval","Подробная оценка реплик","Скрытая оценка состояния помогает вести беседу (динамика, подсказки, безопасность). Добавляет ≈130 токенов к каждому ответу.",t.eval)
    +row("Беседы и память","Удалить все беседы, выводы и шаги. Записи дневника не затрагиваются.",btn("talk-wipe","Стереть",{cls:"secondary danger"})),
    "Собеседник не заменяет психотерапевта, не ставит диагнозов и может ошибаться. Признаки кризиса он замечает и на устройстве, до отправки, — и показывает, куда обратиться."):"";
  const econ=ai.enabled?settingsGroup("coins","Экономия токенов",
    row("Режим расхода",TIERS[ai.tier].hint,selectAi("tier",Object.values(TIERS).map(x=>[x.id,x.name]),ai.tier,"Режим расхода"))
    +row("Быстрая модель",ai.modelFast?`Для подсказок и итогов: ${escapeHtml(ai.modelFast)}. Основная — ${escapeHtml(ai.model||p?.model||"")}.`:"Необязательно. Недорогая модель берёт на себя заголовки, разбор записи, итоги и вопросы дня — основная остаётся для бесед.",btn("ai-fast-model",ai.modelFast?"Изменить":"Указать"))
    +row("Дневной лимит","Когда лимит исчерпан, запросы не уходят. Считаются токены входа и выхода.",selectAi("cap",CAPS,ai.dailyCap,"Дневной лимит"))
    +swAi("cache","Запоминать ответы","Одинаковый запрос к тому же тексту не оплачивается дважды. Кэш хранится только у вас, зашифрован, живёт до двух недель.",ai.cache)
    +`<div class="setting-row is-stacked"><div class="setting-row-text"><strong>Расход</strong><span>По данным сервисов. «Сэкономлено» — оценка: сколько токенов ушло бы, если бы отправлялись целые записи за 90 дней.</span></div><div id="ai-usage" class="ai-usage" aria-live="polite">Считаем…</div><div class="setting-actions">${btn("ai-usage-reset","Сбросить счётчик",{cls:"ghost"})}${btn("ai-cache-clear","Очистить кэш",{cls:"ghost"})}</div></div>`,
    "Как это работает: Narra сама, без ИИ, считает портрет дневника, подбирает нужные записи, сжимает их вокруг вашего вопроса, сворачивает старые реплики, не отправляет повторов и выбирает модель по задаче. Платная модель получает только нужное."):"";
  return `${settingsGroup("sparkle","Помощник на основе ИИ",
    swAi("enabled","Разрешить помощника","Выключен по умолчанию. Пока он выключен, ничего никуда не отправляется и кнопки помощника нигде не показываются.",ai.enabled)
    +(ai.enabled?conn:""),
    "Запросы уходят напрямую с вашего устройства выбранному сервису, без посредников. Для каждой функции нужно отдельное согласие, а перед отправкой вы видите, что уйдёт. Ключ хранится только на этом устройстве в зашифрованном виде и не попадает в резервные копии. Результат — черновик: он ничего не меняет, пока вы его не примете.")}
    ${ai.enabled?`<p class="setting-note ai-consent-row">Согласия по функциям: ${btn("ai-consent-all","Разрешить все",{cls:"ghost"})}${btn("ai-consent-none","Снять все",{cls:"ghost"})}</p>${groups}`:""}
    ${talkGroup}${econ}
    ${ai.enabled?settingsGroup("history","Журнал обращений",`<div class="setting-row is-stacked"><div class="setting-row-text"><strong>${n?`Записей: ${n}`:"Обращений не было"}</strong><span>В журнале только служебные данные: какая функция, когда, сколько знаков. Текста записей там нет.</span></div>${n?`<ul class="log-list">${ai.log.slice(-6).reverse().map(l=>`<li>${escapeHtml(AI_FEATURES.find(f=>f.id===l.feature)?.name||l.feature)} — ${l.status==="blocked"?"заблокировано":l.status==="ok"?"выполнено":"не удалось"}, ${new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(l.at))}, ${l.chars} зн.</li>`).join("")}</ul><div class="setting-actions">${btn("ai-clear-log","Очистить журнал")}</div>`:""}</div>`):""}`;
}
function privacyTab(){
  const lock=state.lock,min=state.prefs.lockMinutes;
  return `${settingsGroup("lock","Блокировка экрана",
    row(lock?"Пароль установлен":"Пароль не установлен",lock?"Дневник скрывается по вашей команде или после бездействия. Забыли пароль — поможет подсказка или код восстановления.":"Установите пароль, чтобы скрывать дневник от посторонних глаз на этом устройстве.",lock?`<button class="secondary" data-action="lock-now">${icon("lock")}<span>Заблокировать сейчас</span></button>`:btn("lock-setup","Установить пароль",{cls:"primary"}),{stacked:false})
    +(lock?row("Автоблокировка","Через сколько бездействия закрывать дневник.",prefSelect("lockMinutes",INACTIVITY_OPTIONS.map(([v,l])=>[String(v),l]),"Автоблокировка"))
      +row("Если забудете пароль",lock.recovery?"Есть код восстановления. "+(lock.hint?"Подсказка задана.":"Подсказки нет."):"Кода восстановления нет — выпустите его, пока пароль под рукой.",`${btn("lock-hint",lock.hint?"Изменить подсказку":"Добавить подсказку")}${btn("lock-recovery-new",lock.recovery?"Новый код":"Создать код")}`)
      +row("Управление паролем","",`${btn("lock-change","Сменить пароль")}${btn("lock-remove","Убрать пароль",{cls:"secondary danger"})}`):"")
    +row("Клавиатура для пароля","Совместимое поле принимает сторонние клавиатуры (Gboard, SwiftKey, Яндекс и другие). Системное защищённое поле на iOS допускает только встроенную клавиатуру, но лучше работает с менеджерами паролей.",prefSelect("secretInput",[["compat","Любая клавиатура"],["system","Системное поле"]],"Поле пароля")),
    "Это экранная блокировка, а не шифрование пароля. Данные на диске шифруются ключом, который хранится в браузере: это защищает от случайного просмотра, но не от человека с полным доступом к вашему профилю браузера. Для настоящей защиты включите шифрование диска в системе.")}
    ${settingsGroup("sparkle","Помощник на основе ИИ",row("ИИ-функции, «Собеседник», расход токенов","Подключение, согласия по функциям и экономия — в отдельном разделе.",btn("open-ai-settings","Открыть «Помощник»")))}
    ${settingsGroup("shield","Что уходит из приложения",
      row("Сеть",state.ai?.enabled?"Narra сама ничего не отправляет: нет аналитики, рекламы и счётчиков. Наружу уходит только то, что вы подтвердили для помощника ИИ, и только к выбранному вами сервису.":"Narra ничего не отправляет: нет аналитики, рекламы и счётчиков. Помощник ИИ выключен, запросов наружу нет.",`<span class="status-pill status-good">${icon("check")}<span>${state.ai?.enabled?"Только по вашему ключу":"Ничего не отправляется"}</span></span>`)
      +row("Тексты в журналах","Их нет: приложение не ведёт журналов с содержимым записей.",""))}`;
}

/* ---------- data ---------- */
function dataTab(){
  const trashed=state.entries.filter(e=>e.deletedAt).length,p=state.storagePersistent;
  const muted=state.mutedMemoryIds.map(id=>state.entries.find(e=>e.id===id)).filter(Boolean),map=entityMap();
  const mutedTopics=state.mutedTopics.map(k=>({key:k,name:map.get(k)?.name||k.slice(k.indexOf(":")+1)}));
  return `${settingsGroup("backup","Резервные копии",
    row("Сохранить копию","Полный архив: записи, история, отметки, главы, обзоры, фото и аудио. Или Markdown и CSV.",btn("export","Создать копию",{cls:"primary"}))
    +row("Восстановить из файла","Архив Narra, JSON или файлы Markdown. Перед восстановлением вы увидите, что изменится.",btn("import","Выбрать файл")),
    "Файлы копий не зашифрованы. Делайте их регулярно: если браузер очистит данные, копия — единственный способ всё вернуть.")}
    ${settingsGroup("shield","Хранилище",
      row("Защита от автоочистки",p===true?"Браузер подтвердил постоянное хранение.":p===false?"Браузер может очистить данные при нехватке места.":"Браузер не сообщает состояние.",p===true?`<span class="status-pill status-good">${icon("check")}<span>Включена</span></span>`:btn("request-persistence","Запросить защиту"))
      +row("Занято места",`<span id="storage-usage">Считаем…</span>`,"")
      +row("Самопроверка","Проверит шифрование, целостность записей и вложений, место и работу без сети.",btn("run-diagnostics","Запустить"))
      +(state.diagnostics?`<p class="setting-note">Последняя проверка: ${new Intl.DateTimeFormat("ru-RU",{dateStyle:"short",timeStyle:"short"}).format(new Date(state.diagnostics.at))} — ${state.diagnostics.ok?"без замечаний":"есть замечания"}.</p>`:""))}
    ${settingsGroup("memories","Скрытое из воспоминаний",
      (muted.length||mutedTopics.length)?[...muted.map(e=>row(escapeHtml(entryText(e,80).title),"Запись не показывается в воспоминаниях.",`<button class="secondary" data-action="unmute-memory" data-id="${escapeHtml(e.id)}">Вернуть</button>`)),...mutedTopics.map(t=>row(escapeHtml(t.name),"Тема, человек или место скрыты из воспоминаний.",`<button class="secondary" data-action="unmute-topic" data-key="${escapeHtml(t.key)}">Вернуть</button>`))].join(""):row("Ничего не скрыто","Скрыть можно любую запись, тему, человека или место прямо из карточки воспоминания.",""))}
    ${settingsGroup("journal","Корзина",row(trashed?`Записей в корзине: ${trashed}`:"Корзина пуста","Удалённые записи не попадают в поиск, обзоры и воспоминания.",btn("open-trash","Открыть корзину"))+sw('data-pref="hideDeleteHint"',"Короткое сообщение вместо окна","После удаления записи показывать быстрое уведомление с кнопкой «Вернуть», а не окно с подсказкой. Подтверждение перед удалением остаётся.",Boolean(state.prefs.hideDeleteHint)))}
    ${settingsGroup("info","Демонстрация",state.mode==="demo"?row("Сейчас открыта демонстрация","Вымышленные данные в отдельном хранилище.",`${btn("reset-demo","Сбросить")}${btn("exit-demo","Выйти",{cls:"primary"})}`):row("Посмотреть Narra на примере","Откроется вымышленный дневник за полгода. Ваши записи не затрагиваются.",btn("enter-demo","Открыть демонстрацию")))}
    ${settingsGroup("trash","Удаление",row("Удалить всё с этого устройства","Записи, история, отметки, вложения, пароль и настройки. Восстановить можно только из копии.",btn("erase-all","Удалить всё",{cls:"secondary danger"})))}`;
}

/* ---------- about ---------- */
function aboutTab(){
  const shortcuts=[["Ctrl/⌘ K","Палитра команд"],["N","Новая запись"],["/","Поиск"],["Ctrl/⌘ Enter","Готово, закрыть запись"],["Ctrl/⌘ F","Найти в тексте записи (в редакторе) или поиск"],["Esc","Закрыть окно"]];
  return `${settingsGroup("info","Narra",row("Версия",`Narra ${APP_VERSION}`,"")+row("Обновление приложения","Проверить, нет ли новой версии файлов Narra. Записи не затрагиваются.",`<button class="secondary" data-action="refresh-app-shell">Проверить</button>`)+row("Где хранятся записи","Только в этом браузере, на этом устройстве. Нет аккаунта, сервера и синхронизации.",""))}
    ${settingsGroup("insights","Как считаются наблюдения",
      row("Что это","Описание совпадений в ваших записях: «в дни с этой темой напряжение чаще выше». Это не причины и не диагнозы.","")
      +row("Когда показываются",`Не раньше чем по ${MIN_N} дням с отметками и по ${MIN_N} дням с этой меткой. Всегда видно, по какому числу дней и за какой период.`,"")
      +row("Метод","Сравнение порядковых значений без предположения о «среднем» (ранговые методы), с поправкой на множественные сравнения. Пропуски не заполняются.","")
      +row("Идентификатор метода",`${escapeHtml(METHOD_ID)} · ${escapeHtml(METHOD_VERSION)}`,""))}
    ${settingsGroup("keyboard","Клавиши",shortcuts.map(([k,t])=>row(t,"",`<kbd>${k}</kbd>`)).join(""))}
    ${settingsGroup("shield","Что важно знать",
      `<div class="setting-row is-stacked"><ul class="plain-list"><li>Записи хранятся на этом устройстве. Чтобы перенести их на другое, сделайте резервную копию и откройте её там.</li><li>Файл резервной копии можно защитить паролем — без пароля он читается как обычный файл.</li><li>Поиск по смыслу работает на устройстве и опирается на родственные слова, а не на нейросеть.</li><li>Уведомления приходят без текста дневника. Точное время в фоне зависит от системы устройства.</li></ul></div>`,
      "Narra не заменяет консультацию специалиста и не ставит диагнозов.")}`;
}

export function settingsView(){
  if(!TABS.some(t=>t[0]===state.settingsTab))state.settingsTab="basic";
  const body={basic:basicTab,features:featuresTab,editor:editorTab,checkin:checkinTab,privacy:privacyTab,ai:aiTab,data:dataTab,about:aboutTab}[state.settingsTab]();
  return `${pageHeader("Под себя","Настройки","Всё необязательное можно выключить.")}${tabs("settings",TABS,state.settingsTab,{label:"Разделы настроек"})}<div id="panel-settings" role="tabpanel" aria-labelledby="tab-settings-${state.settingsTab}" class="settings-panel">${body}</div>`;
}
export function afterRender(route){
  if(route==="settings"&&state.settingsTab==="ai"){paintUsage();return;}
  if(route!=="settings"||state.settingsTab!=="data")return;
  const box=$("#storage-usage");if(!box)return;
  if(!navigator.storage?.estimate){box.textContent="Браузер не сообщает.";return;}
  navigator.storage.estimate().then(e=>{if(box.isConnected)box.textContent=`${((e.usage||0)/1048576).toFixed(1).replace(".",",")} МБ из ${Math.round((e.quota||0)/1048576)} МБ доступных браузером.`;}).catch(()=>{if(box.isConnected)box.textContent="Браузер не сообщает.";});
}

async function paintUsage(){
  const box=$("#ai-usage");if(!box)return;
  try{
    const hub=await import(`./hub.js?v=${APP_VERSION}`),u=await hub.usageSummary();
    if(!box.isConnected)return;
    const cell=w=>`<td>${w.calls+w.hits}</td><td>${fmtTok(w.inTok)}</td><td>${fmtTok(w.outTok)}</td><td>${fmtTok(w.saved)}</td>`;
    box.innerHTML=`<table class="usage-table"><thead><tr><th></th><th>Запросов</th><th>Вход</th><th>Выход</th><th>Сэкономлено</th></tr></thead><tbody><tr><th scope="row">Сегодня</th>${cell(u.today)}</tr><tr><th scope="row">7 дней</th>${cell(u.week)}</tr><tr><th scope="row">30 дней</th>${cell(u.month)}</tr></tbody></table>
      <p class="subtle text-small">Из кэша без оплаты: ${u.month.hits} ${u.month.hits%10===1&&u.month.hits%100!==11?"ответ":"ответов"} за 30 дней. В кэше сейчас: ${u.cache}. Токены по данным сервиса; у сервисов с кэшем запросов повторяющаяся часть стоит дешевле${u.month.cachedIn?` (за 30 дней из кэша сервиса: ${fmtTok(u.month.cachedIn)})`:""}.</p>`;
  }catch{if(box.isConnected)box.textContent="Счётчик недоступен.";}
}
async function updateConfig(mutate){
  const next=structuredClone(cfg());mutate(next);
  const clean=cleanConfig(next);
  if(!activeDimensions(clean).length&&state.prefs.showCheckin){ctx.toast("Оставьте хотя бы одно поле или скройте отметку на экране «Сегодня» в основных настройках.");ctx.render();return;}
  await store.saveConfig(clean);ctx.render();
}
const ownTitles={emotions:"Свои эмоции",needs:"Что сейчас нужно",triggers:"Что повлияло",activities:"Чем занимались",social:"С кем"};
export const views={settings:settingsView};
export const actions={
  "open-privacy":()=>{state.settingsTab="privacy";ctx.render();},
  "open-ai-settings":()=>{state.settingsTab="ai";if(state.route==="settings")ctx.render();else ctx.goTo("settings");},
  "features-minimal":()=>{for(const f of FEATURES)ctx.setPref(f.key,false);ctx.render();ctx.toast("Осталась только основа: дневник, запись, поиск. Данные не тронуты.");},
  "features-all":()=>{for(const f of FEATURES)if(f.key!=="featSemantic")ctx.setPref(f.key,true);ctx.render();ctx.toast("Все разделы включены. Близость слов в поиске включается отдельно.");},
  "cfg-add-custom":()=>ctx.formDialog({title:"Своё поле состояния",text:"Шкала из пяти делений. Подпишите её крайние значения.",iconName:"state",confirmLabel:"Добавить",fields:[{id:"name",label:"Название",placeholder:"Например, Творческий подъём",max:32},{id:"low",label:"Внизу шкалы",placeholder:"мало",max:20},{id:"high",label:"Вверху шкалы",placeholder:"много",max:20}]},async v=>{
    const name=v.name.trim();if(!name)return "Введите название поля.";
    const c=cfg(),id=`x${Date.now().toString(36)}`.slice(0,24).replace(/[^a-z0-9_]/g,"");
    if(c.custom.some(x=>x.name.toLocaleLowerCase("ru-RU")===name.toLocaleLowerCase("ru-RU")))return "Такое поле уже есть.";
    await store.saveConfig({...c,custom:[...c.custom,{id,name,low:v.low.trim()||"мало",high:v.high.trim()||"много"}],enabled:{...c.enabled,[`c_${id}`]:true}});ctx.render();ctx.toast("Поле добавлено.");
  }),
  "cfg-remove-custom":el=>{
    const c=cfg(),x=c.custom.find(y=>y.id===el.dataset.id);if(!x)return;
    ctx.confirmDialog({title:`Убрать поле «${x.name}»?`,text:"Поле исчезнет из отметок. Уже сохранённые значения останутся в данных и попадут в резервную копию.",confirmLabel:"Убрать поле",danger:true,iconName:"trash"},async()=>{
      await store.saveConfig({...c,custom:c.custom.filter(y=>y.id!==x.id)});ctx.render();
    });
  },
  "cfg-add-own":el=>{
    const key=el.dataset.key;
    ctx.formDialog({title:ownTitles[key]||"Свои варианты",text:"Один или несколько вариантов через запятую.",iconName:"tag",confirmLabel:"Добавить",fields:[{id:"items",label:"Варианты",placeholder:"например: нежность, азарт",max:200}]},async v=>{
      const items=v.items.split(",").map(s=>s.trim()).filter(Boolean);if(!items.length)return "Введите хотя бы один вариант.";
      const c=cfg();await store.saveConfig({...c,extra:{...c.extra,[key]:[...c.extra[key],...items]}});ctx.render();
    });
  },
  "cfg-clear-own":async el=>{const c=cfg();await store.saveConfig({...c,extra:{...c.extra,[el.dataset.key]:[]}});ctx.render();},
  "ai-connect":()=>{
    const ai=cleanAiState(state.ai);
    ctx.formDialog({title:state.aiKey?"Изменить подключение":"Подключить помощника",iconName:"sparkle",confirmLabel:"Подключить",
      text:"Достаточно вставить ключ — сервис определится по нему. Остальное можно не трогать.",
      fields:[
        {id:"key",label:"Ключ доступа (API key)",type:"password",autocomplete:"off",max:400,hint:"Он хранится только на этом устройстве, в зашифрованном виде."},
        {id:"provider",label:"Сервис",type:"select",value:ai.provider||"",options:[["","Определить по ключу"],...PROVIDERS.map(p=>[p.id,p.name])]},
        {id:"model",label:"Модель (необязательно)",type:"text",max:120,value:ai.model||"",hint:"Пусто — подберём недорогую подходящую."},
        {id:"baseUrl",label:"Адрес API (только для своих и локальных сервисов)",type:"text",max:300,value:ai.baseUrl||"",hint:"Например, https://api.example.com/v1"},
      ]},async v=>{
      const key=String(v.key||"").trim(),id=v.provider||detectProvider(key)||(ai.provider&&!key?ai.provider:null);
      if(!id)return "Не удалось определить сервис по ключу. Выберите его в списке «Сервис».";
      const p=providerById(id),cfg={provider:id,model:String(v.model||"").trim(),baseUrl:String(v.baseUrl||"").trim()};
      const useKey=key||(id===ai.provider?state.aiKey:"");
      if(p.needsKey!==false&&!useKey)return "Вставьте ключ доступа.";
      if(p.custom&&!cfg.baseUrl)return "Для этого сервиса нужен адрес API.";
      if(cfg.baseUrl&&!/^https?:\/\/[^\s]+$/i.test(cfg.baseUrl))return "Адрес должен начинаться с https:// (для локальной модели — http://localhost).";
      let ids=[];
      try{ids=await listModels(cfg,useKey);}
      catch(error){
        if(p.custom||p.local){
          try{await createProvider({...cfg,model:cfg.model||p.model},useKey).run("summarize","Проверка связи.");}catch(e2){return e2.friendly?e2.message:"Не удалось связаться с сервисом.";}
        }else return error.friendly?error.message:"Не удалось проверить ключ.";
      }
      if(cfg.model&&ids.length&&!ids.includes(cfg.model))return `Такой модели у сервиса нет. Например: ${ids.slice(0,4).join(", ")}.`;
      cfg.model=cfg.model||pickModel(ids,p.model);
      if(!cfg.model)return "Не удалось подобрать модель: укажите её название.";
      await store.saveAiSecret(useKey);
      await store.saveAiState({...ai,enabled:true,provider:id,model:cfg.model,baseUrl:p.custom||p.local?cfg.baseUrl:""});
      setTimeout(()=>{ctx.render();ctx.toast(`Помощник подключён: ${p.name}, ${cfg.model}.`);},60);
      return "";
    });
  },
  "ai-disconnect":()=>ctx.confirmDialog({title:"Отключить помощника?",text:"Ключ будет удалён с этого устройства. Записи не затрагиваются. Подключить снова можно в любой момент.",confirmLabel:"Отключить",iconName:"sparkle"},async()=>{
    const ai=cleanAiState(state.ai);await store.saveAiSecret("");await store.saveAiState({...ai,provider:null,model:"",baseUrl:""});ctx.render();ctx.toast("Помощник отключён, ключ удалён.");
  }),
  "ai-test":async()=>{
    const ai=cleanAiState(state.ai);
    const res=await runFeature({state:{...ai,enabled:true,features:{...ai.features,summarize:true}},provider:createProvider(ai,state.aiKey),featureId:"summarize",items:[{id:"probe",title:"Проверка",text:"Проверка связи. Текст записей не используется."}],confirmed:true});
    if(res.log){await store.saveAiState({...ai,log:[...ai.log,res.log]});ctx.render();}
    ctx.toast(res.ok?"Помощник ответил — всё работает.":(res.message||REASON_TEXT[res.reason]||"Помощник недоступен."));
  },
  "refresh-app-shell":async()=>{
    if(!("serviceWorker" in navigator)){ctx.toast("В этом браузере обновление файлов не требуется.");return;}
    try{
      const reg=await navigator.serviceWorker.getRegistration();
      if(reg)await reg.update();
      if(window.caches){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith("narra-shell-")&&!k.endsWith(APP_VERSION.split(".").slice(0,2).join("."))).map(k=>caches.delete(k)));}
      ctx.toast("Файлы проверены. Если есть новая версия, она подхватится при следующем открытии.");
    }catch{ctx.toast("Не удалось проверить обновление. Записи не затронуты.");}
  },
  "ai-fast-model":()=>{
    const ai=cleanAiState(state.ai);
    ctx.formDialog({title:"Быстрая модель",iconName:"zap",confirmLabel:"Сохранить",text:"Необязательно: недорогая модель того же сервиса для подсказок, заголовков и итогов. Например: gpt-4o-mini, claude-haiku-4-5, gemini-2.0-flash. Пусто — всё идёт на основную модель.",
      fields:[{id:"m",label:"Название модели",type:"text",max:120,value:ai.modelFast||""}]},async v=>{
      const m=String(v.m||"").trim();
      if(m&&!/^[\w./:@+-]{2,120}$/.test(m))return "В названии модели допустимы буквы, цифры и знаки . / : - _";
      await store.saveAiState({...ai,modelFast:m});setTimeout(()=>ctx.render(),40);return "";
    });
  },
  "ai-usage-reset":()=>ctx.confirmDialog({title:"Сбросить счётчик расхода?",text:"Обнулится только статистика. Кэш ответов и настройки не изменятся.",confirmLabel:"Сбросить",iconName:"refresh"},async()=>{const hub=await import(`./hub.js?v=${APP_VERSION}`);await hub.resetUsage();ctx.render();ctx.toast("Счётчик сброшен.");}),
  "ai-cache-clear":async()=>{const hub=await import(`./hub.js?v=${APP_VERSION}`);await hub.clearCache();ctx.render();ctx.toast("Кэш ответов очищен.");},
  "ai-consent-all":async()=>{const ai=cleanAiState(state.ai),f={};for(const x of AI_FEATURES)f[x.id]=true;await store.saveAiState({...ai,features:f});ctx.render();},
  "ai-consent-none":async()=>{const ai=cleanAiState(state.ai),f={};for(const x of AI_FEATURES)f[x.id]=false;await store.saveAiState({...ai,features:f});ctx.render();},
  "ai-clear-log":async()=>{const ai=cleanAiState(state.ai);await store.saveAiState({...ai,log:[]});ctx.render();ctx.toast("Журнал очищен.");},
  "unmute-memory":async el=>{state.mutedMemoryIds=state.mutedMemoryIds.filter(x=>x!==el.dataset.id);await store.metaSet("muted-memory-ids",state.mutedMemoryIds);ctx.render();},
  "unmute-topic":async el=>{await store.saveMutedTopics(state.mutedTopics.filter(x=>x!==el.dataset.key));ctx.render();},
};
export const on={
  change:e=>{
    const t=e.target;
    if(t.dataset?.cfg){
      const [kind,key]=t.dataset.cfg.split(":");
      updateConfig(c=>{if(kind==="dim")c.enabled[key]=t.checked;else c[key]=t.checked;});return true;
    }
    if(t.dataset?.ai){
      const ai=cleanAiState(state.ai),[kind,id]=t.dataset.ai.split(":");
      const val=t.type==="checkbox"?t.checked:t.value;
      const next=kind==="enabled"?{...ai,enabled:t.checked}:kind==="talk"?{...ai,talk:{...ai.talk,[id]:val}}:kind==="tier"?{...ai,tier:val}:kind==="cap"?{...ai,dailyCap:Number(val)||0}:kind==="cache"?{...ai,cache:t.checked}:{...ai,features:{...ai.features,[id]:t.checked}};
      store.saveAiState(next).then(()=>ctx.render());return true;
    }
    return false;
  },
};
export {capitalizeRu,plural,entryLabel,kindLabels,switchRow,selectHtml,$$};
