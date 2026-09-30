(() => {
  const BUILD = "4.5.0";
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
            <strong>Windows</strong>
            <ol>
              <li>Закройте эту вкладку.</li>
              <li>Дважды щёлкните <code>START_NARRA.bat</code> в папке приложения.</li>
              <li>Права администратора не нужны.</li>
              <li>Оставьте окно локального сервера открытым, пока работаете с дневником.</li>
            </ol>
          </div>
          <p class="text-small subtle">Используйте один адрес: <code>http://127.0.0.1:8765/</code>. Данные браузера привязаны к origin.</p>` : ""}
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
    showStartup("Не удалось загрузить Narra.", "Перезапустите START_NARRA.bat и обновите страницу. Если ошибка повторяется, откройте инструменты разработчика и скопируйте сообщение из Console.");
  }, {once:true});
  document.head.appendChild(module);
})();
