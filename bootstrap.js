(() => {
  const BUILD = "4.7.0";
  const allowed = location.protocol === "http:" || location.protocol === "https:";

  function showStartup(message, details = "", steps = true) {
    const render = () => {
      document.documentElement?.classList?.remove("boot-locked");
      document.body.classList.add("startup-error");
      const view = document.querySelector("#view");
      if (!view) return;
      view.innerHTML = `
        <section class="startup-card card" role="alert">
          <p class="eyebrow">Безопасный запуск</p>
          <h1>${message}</h1>
          ${details ? `<p class="subtle">${details}</p>` : ""}
          ${steps ? `<div class="startup-steps">
            <strong>Как открыть</strong>
            <ol>
              <li>Откройте опубликованный адрес приложения (https://…), а не файл с диска.</li>
              <li>Для запуска на своём компьютере подойдёт любой локальный сервер, например <code>python -m http.server 8765</code> в папке приложения.</li>
              <li>Затем откройте <code>http://localhost:8765/</code>.</li>
            </ol>
          </div>
          <p class="text-small subtle">Пользуйтесь всегда одним и тем же адресом: данные браузера привязаны к нему.</p>` : ""}
          <button id="startup-retry" class="primary">Повторить загрузку</button>
        </section>`;
      document.querySelector("#startup-retry")?.addEventListener("click",()=>location.reload());
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, {once:true});
    else render();
  }

  if (!allowed) {
    showStartup("Откройте Narra через локальный сервер, а не как файл.", "Режим file:// не даёт приложению стабильный origin для ES-модулей, PWA и локального хранилища.");
    return;
  }

  // Encryption (Web Crypto) works only on https:// or on localhost. A plain http:// address in a local network would open
  // the shell and then fail on the first save, so say so before anything loads.
  if (window.isSecureContext === false || !(window.crypto && crypto.subtle)) {
    showStartup("Нужно защищённое соединение.", "Narra шифрует записи, а браузер разрешает шифрование только по адресу https:// или на localhost. Откройте приложение по такому адресу — записи в этом браузере не затронуты.");
    return;
  }

  // Narra uses regular-expression lookbehind, :has() and color-mix(): Safari/iOS 16.4+, Chrome/Edge 111+, Firefox 121+.
  let modern = true;
  try {
    new RegExp("(?<!a)b");
    modern = typeof window === "undefined" || !(window.CSS && CSS.supports) || Boolean(CSS.supports("selector(:has(a))") && CSS.supports("color", "color-mix(in srgb, red, blue)"));
  } catch { modern = false; }
  if (!modern) {
    showStartup("Этому браузеру нужно обновление.", "Narra работает в Safari и на iPhone начиная с iOS 16.4, в Chrome и Edge 111+, в Firefox 121+. Обновите систему или браузер — записи в этом браузере не затронуты.", false);
    return;
  }

  // A locked diary must never flash before the password screen: hide the shell until the lock screen (or the diary) is ready.
  try {
    const root = document.documentElement;
    const theme = localStorage.getItem("narra-theme");
    if (theme === "dark" || theme === "light") root.dataset.theme = theme;
    else if (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) root.dataset.theme = "dark";
    // a theme chosen in the app (not the system one) also colours the status bar from the very first frame
    if (theme === "dark" || theme === "light") document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.content = theme === "dark" ? "#1d1c19" : "#f4f0e7"; m.removeAttribute("media"); });
    if (localStorage.getItem("narra-lock-hint") === "1") root.classList.add("boot-locked");
  } catch {}

  // never leave a blank page: if the app has not taken over in 10 s, show the shell (and its own messages) again
  if (typeof setTimeout === "function") setTimeout(() => document.documentElement?.classList?.remove("boot-locked"), 10000);

  const manifest = document.createElement("link");
  manifest.rel = "manifest";
  manifest.href = `./manifest.webmanifest?v=${BUILD}`;
  document.head.appendChild(manifest);

  const module = document.createElement("script");
  module.type = "module";
  module.src = `./app.js?v=${BUILD}`;
  module.addEventListener("error", () => {
    showStartup("Не удалось загрузить Narra.", navigator.onLine === false ? "Похоже, нет подключения к интернету, а приложение ещё не сохранилось для работы без сети. Подключитесь и обновите страницу." : "Обновите страницу. Если ошибка повторяется, очистите кэш сайта или откройте инструменты разработчика и скопируйте сообщение из Console.", false);
  }, {once:true});
  document.head.appendChild(module);
})();
