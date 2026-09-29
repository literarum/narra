(() => {
  const BUILD = "4.2.0";
  const allowed = location.protocol === "http:" || location.protocol === "https:";

  function showStartup(message, details = "") {
    const render = () => {
      document.body.classList.add("startup-error");
      const view = document.querySelector("#view");
      if (!view) return;
      view.innerHTML = `
        <section class="startup-card card" role="alert">
          <p class="eyebrow">Безопасный запуск</p>
          <h1>${message}</h1>
          ${details ? `<p class="subtle">${details}</p>` : ""}
          <div class="startup-steps">
            <strong>Windows</strong>
            <ol>
              <li>Закройте эту вкладку.</li>
              <li>Дважды щёлкните <code>START_NARRA.bat</code> в папке приложения.</li>
              <li>Права администратора не нужны.</li>
              <li>Оставьте окно локального сервера открытым, пока работаете с дневником.</li>
            </ol>
          </div>
          <p class="text-small subtle">Используйте один адрес: <code>http://127.0.0.1:8765/</code>. Данные браузера привязаны к origin.</p>
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
