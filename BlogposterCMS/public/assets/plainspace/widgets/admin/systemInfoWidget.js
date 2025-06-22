// public/assets/plainSpace/admin/systemInfoWidget.js
export function render(el) {
  // 1) Uptime seit Seiten-Load in Sekunden
  const uptimeSec = Math.floor(performance.now() / 1000);

  // 2) Browser-Infos statt Node-process
  const infoHtml = `
    <div><strong>Uptime:</strong> ${uptimeSec}s</div>
    <div><strong>Browser:</strong> ${navigator.userAgent}</div>
  `;

  el.innerHTML = infoHtml;
}
