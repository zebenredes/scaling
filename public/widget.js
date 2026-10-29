/* Scaling · widget de chat IA
 * <script src="https://TU-APP/widget.js" data-agent="PUBLIC_KEY" async></script>
 */
(function () {
  var script = document.currentScript;
  var key = script && script.getAttribute("data-agent");
  if (!key) return;
  var base = new URL(script.src).origin;
  var color = script.getAttribute("data-color") || "#6d5efc";
  var sessionKey = "scaling_chat_" + key;
  var session;
  try {
    session = localStorage.getItem(sessionKey);
    if (!session) {
      session = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2) + Date.now();
      localStorage.setItem(sessionKey, session);
    }
  } catch (e) {
    session = String(Math.random()).slice(2) + Date.now();
  }

  var root = document.createElement("div");
  root.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483000;font-family:system-ui,sans-serif";
  root.innerHTML =
    '<div id="sc-panel" style="display:none;width:340px;max-width:calc(100vw - 40px);height:460px;background:#fff;color:#16161d;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.2);flex-direction:column;overflow:hidden;margin-bottom:12px">' +
    '<div id="sc-head" style="padding:12px 14px;background:' + color + ';color:#fff;font-weight:600">Chat</div>' +
    '<div id="sc-log" style="flex:1;overflow-y:auto;padding:12px;font-size:14px"></div>' +
    '<form id="sc-form" style="display:flex;border-top:1px solid #eee"><input id="sc-in" placeholder="Escribe un mensaje…" style="flex:1;border:0;padding:12px;font-size:14px;outline:none;color:#16161d;background:#fff"/><button style="border:0;background:none;color:' + color + ';font-weight:600;padding:0 14px;cursor:pointer">Enviar</button></form>' +
    "</div>" +
    '<button id="sc-btn" aria-label="Abrir chat" style="float:right;width:56px;height:56px;border-radius:50%;border:0;background:' + color + ';color:#fff;font-size:24px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)">💬</button>';
  document.body.appendChild(root);

  var panel = root.querySelector("#sc-panel");
  var log = root.querySelector("#sc-log");
  var input = root.querySelector("#sc-in");

  function add(role, text) {
    var b = document.createElement("div");
    b.textContent = text;
    b.style.cssText =
      "margin:6px 0;padding:8px 11px;border-radius:12px;max-width:85%;white-space:pre-wrap;line-height:1.35;" +
      (role === "user" ? "margin-left:auto;background:" + color + ";color:#fff" : "background:#f1f1f5");
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
    return b;
  }

  fetch(base + "/api/public/chat?key=" + encodeURIComponent(key))
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) {
      if (!cfg) return;
      root.querySelector("#sc-head").textContent = cfg.name;
      if (cfg.welcome_message) add("assistant", cfg.welcome_message);
    });

  root.querySelector("#sc-btn").onclick = function () {
    panel.style.display = panel.style.display === "none" ? "flex" : "none";
    if (panel.style.display === "flex") input.focus();
  };

  root.querySelector("#sc-form").onsubmit = function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    add("user", text);
    var typing = add("assistant", "…");
    fetch(base + "/api/public/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key, session: session, message: text }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) { typing.textContent = d.reply || "…"; })
      .catch(function () { typing.textContent = "Error de conexión."; });
  };
})();
