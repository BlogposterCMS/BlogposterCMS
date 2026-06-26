export function render(el) {
    if (!el)
        return;
    const uptimeSec = Math.floor(performance.now() / 1000);
    const infoHtml = `
    <div><strong>Uptime:</strong> ${uptimeSec}s</div>
    <div><strong>Browser:</strong> ${navigator.userAgent}</div>
  `;
    el.innerHTML = infoHtml;
}
