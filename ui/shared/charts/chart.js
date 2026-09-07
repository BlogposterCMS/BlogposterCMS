let loading;
const DIGEST = '61f13280aba3161f77fc801bf5f9c786f55f10432153a0683fc5cc0700b013d5';
function loadEngine() {
    if (loading)
        return loading;
    loading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/ui/shared/vendor/echarts-6.1.0/echarts.common.min.js';
        script.integrity = `sha256-${btoa(String.fromCharCode(...DIGEST.match(/../g).map(byte => parseInt(byte, 16))))}`;
        script.crossOrigin = 'anonymous';
        script.onload = () => {
            const engine = window.echarts;
            if (engine?.init)
                resolve(engine);
            else {
                loading = undefined;
                reject(new Error('CHART_ENGINE_INVALID'));
            }
        };
        script.onerror = () => { script.remove(); loading = undefined; reject(new Error('CHART_ENGINE_LOAD_FAILED')); };
        document.head.append(script);
    });
    return loading;
}
export function chartOptions(data) {
    if (!Array.isArray(data.labels) || data.labels.length > 2000 || !Array.isArray(data.series)
        || data.series.length > 8 || data.labels.some(label => typeof label !== 'string' || label.length > 200)
        || data.series.some(series => typeof series.name !== 'string' || series.name.length > 200
            || !Array.isArray(series.values) || series.values.length !== data.labels.length
            || series.values.some(value => !Number.isFinite(value))))
        throw new Error('CHART_DATA_INVALID');
    return {
        animation: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
        color: ['#9380e8', '#4aada7', '#7992ca'],
        tooltip: { trigger: 'axis', renderMode: 'richText', confine: true },
        legend: { show: data.series.length > 1, bottom: 0 },
        grid: { left: 42, right: 12, top: 16, bottom: data.zoom ? 76 : 42 },
        xAxis: { type: 'category', data: data.labels.slice(), boundaryGap: data.type === 'bar' },
        yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#e8e8ee' } } },
        dataZoom: data.zoom ? [{ type: 'inside' }, { type: 'slider', bottom: 28 }] : [],
        series: data.series.map(series => ({ name: series.name, type: data.type === 'bar' ? 'bar' : 'line',
            data: series.values.slice(), symbolSize: 6, smooth: false, lineStyle: { width: 2 } }))
    };
}
export async function mountChart(host, data) {
    const options = chartOptions(data);
    const engine = await loadEngine();
    if (!host.isConnected)
        throw new Error('CHART_HOST_DETACHED');
    host.style.height ||= '260px';
    const chart = engine.init(host, null, { renderer: 'canvas' });
    let disposed = false;
    const update = (next) => {
        if (disposed)
            throw new Error('CHART_DISPOSED');
        chart.setOption(chartOptions(next), true);
        host.setAttribute('aria-label', next.series.map(series => `${series.name}: ${series.values.join(', ')}`).join('; '));
    };
    host.setAttribute('role', 'img');
    chart.setOption(options, true);
    update(data);
    chart.on('click', point => host.dispatchEvent(new CustomEvent('chart:select', {
        bubbles: true, composed: true, detail: { series: point.seriesName, index: point.dataIndex, value: point.value }
    })));
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(host);
    const removal = new MutationObserver(() => { if (!host.isConnected)
        dispose(); });
    removal.observe(document, { childList: true, subtree: true });
    const localRoot = host.getRootNode();
    if (localRoot !== document)
        removal.observe(localRoot, { childList: true, subtree: true });
    function dispose() { if (disposed)
        return; disposed = true; resize.disconnect(); removal.disconnect(); chart.dispose(); }
    return { update, dispose };
}
