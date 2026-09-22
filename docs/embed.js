/*!
 * ADA AI Skill Navigator: embed script
 * Plaats op elke website:
 *   <script src="https://<jouw-pages-domein>/embed.js" async></script>
 * Optioneel een vaste plek: <div id="ada-skill-navigator"></div> (anders komt de widget direct na het script).
 */
(function () {
  var script = document.currentScript || (function () {
    var s = document.getElementsByTagName("script");
    for (var i = s.length - 1; i >= 0; i--) if (/embed\.js(\?|$)/.test(s[i].src)) return s[i];
  })();
  if (!script) return;
  var base = script.src.replace(/embed\.js(\?.*)?$/, "");

  var iframe = document.createElement("iframe");
  iframe.src = base + "index.html";
  iframe.title = "AI Skill Navigator van Amsterdam Data Academy";
  iframe.loading = "lazy";
  iframe.setAttribute("scrolling", "no");
  iframe.style.cssText = "display:block;width:100%;max-width:440px;height:720px;margin:0 auto;border:0;border-radius:12px;box-shadow:0 8px 40px rgba(49,57,156,.18);background:transparent;overflow:hidden";

  var target = document.getElementById("ada-skill-navigator");
  if (target) target.appendChild(iframe);
  else script.parentNode.insertBefore(iframe, script.nextSibling);

  var origin = new URL(base).origin;
  window.addEventListener("message", function (e) {
    if (e.origin !== origin || e.source !== iframe.contentWindow) return;
    var d = e.data;
    if (d && d.type === "ada-skill-navigator:resize" && typeof d.height === "number") {
      iframe.style.height = Math.min(Math.max(d.height, 300), 3000) + "px";
    }
  });
})();
