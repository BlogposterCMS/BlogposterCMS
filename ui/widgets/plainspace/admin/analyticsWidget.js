import { fetchAnalytics } from './analyticsData.js';
import { mountChart } from '../../../shared/charts/chart.js';
// Use DOM text nodes for all event metadata; analytics labels are untrusted data.
function node(tag, text = '', className = '') {
    const el = document.createElement(tag);
    el.textContent = text;
    el.className = className;
    return el;
}
function table(title, columns, rows, emptyMessage = 'No recorded activity in this period.') {
    const section = node('section', '', 'analytics-panel');
    section.append(node('h3', title));
    if (!rows.length) {
        section.append(node('p', emptyMessage));
        return section;
    }
    const wrapper = node('div', '', 'analytics-table-scroll');
    const table = node('table', '', 'table');
    // Preserve readable columns on narrow widgets; the existing wrapper scrolls.
    if (columns.length > 5)
        table.style.minWidth = '1200px';
    const head = node('thead');
    const header = node('tr');
    columns.forEach(label => { const th = node('th', label); th.scope = 'col'; header.append(th); });
    head.append(header);
    const body = node('tbody');
    rows.forEach(values => { const row = node('tr'); values.forEach(value => row.append(node('td', value))); body.append(row); });
    table.append(head, body);
    wrapper.append(table);
    section.append(wrapper);
    return section;
}
export function renderSummary(data) {
    const section = node('section', '', 'analytics-summary');
    for (const [name, count, previous] of [
        ['Public HTML deliveries', data.pages, data.previous.pages],
        ['System events', data.system, data.previous.system],
        ['Reported event errors', data.errors, null]
    ]) {
        const row = node('div', '', 'analytics-metric');
        row.append(node('span', name), node('strong', String(count)));
        if (previous !== null)
            row.append(node('small', `Previous period: ${previous}`));
        section.append(row);
    }
    return section;
}
const VIEWS = {
    overview: { title: 'Analytics overview', description: 'Public page delivery and authenticated system activity.', dimensions: [] },
    website: { title: 'Website analytics', description: 'Delivered public pages and their referrer domains.', dimensions: ['page', 'source'] },
    devices: { title: 'Devices & Software', description: 'Device and software categories reported by public clients.', dimensions: ['device', 'browser', 'os'] },
    system: { title: 'System activity', description: 'Authenticated events, verified actors and target modules.', dimensions: ['event', 'module', 'actor', 'outcome'] }
};
// All catalog widgets share rendering and the existing authorized summary API.
export async function renderAnalytics(el, view) {
    if (!el)
        return;
    const config = VIEWS[view];
    const root = node('div', '', 'analytics-workspace');
    root.append(node('h2', config.title), node('p', config.description));
    const label = node('label', 'Period ');
    const period = node('select');
    [1, 7, 30].forEach(days => { const option = node('option', `${days} day${days === 1 ? '' : 's'}`); option.value = String(days); period.append(option); });
    period.value = '7';
    label.append(period);
    const refresh = node('button', 'Refresh', 'button secondary sm');
    refresh.type = 'button';
    const content = node('div', '', 'analytics-content');
    content.setAttribute('aria-live', 'polite');
    const toolbar = node('div', '', 'analytics-toolbar');
    toolbar.append(label, refresh);
    root.append(toolbar, content);
    el.replaceChildren(root);
    let generation = 0;
    async function load() {
        const current = ++generation;
        content.replaceChildren(node('p', 'Loading analytics…'));
        refresh.disabled = true;
        try {
            const data = await fetchAnalytics(Number(period.value));
            if (current !== generation)
                return;
            content.replaceChildren();
            if (view === 'overview')
                content.append(renderSummary(data));
            content.append(node('p', `Updated ${new Date(data.to).toLocaleString()}. Times grouped by UTC day. Retention: ${data.retentionDays} days.`));
            if (data.health.lastError || data.health.dropped || data.health.truncated || !data.health.enabled) {
                const warning = node('p', `ANALYTICS_INCOMPLETE: ${data.health.lastError || ''} Dropped this process: ${data.health.dropped}. Read limit reached: ${data.health.truncated}. Collection enabled: ${data.health.enabled}.`);
                warning.setAttribute('role', 'alert');
                content.append(warning);
            }
            if (view === 'overview') {
                const chart = node('div');
                content.append(chart);
                await mountChart(chart, { labels: data.timeline.map(row => row.day), zoom: true,
                    series: [{ name: 'Public HTML', values: data.timeline.map(row => row.pages) },
                        { name: 'System events', values: data.timeline.map(row => row.system) }] });
                if (current !== generation)
                    return;
                content.append(table('Activity over time', ['UTC day', 'Public HTML', 'System events'], data.timeline.map(row => [row.day, String(row.pages), String(row.system)])));
                const links = node('nav', '', 'analytics-toolbar');
                for (const section of ['website', 'devices', 'system']) {
                    const link = node('a', VIEWS[section].title, 'button secondary sm');
                    link.href = `/admin/analytics/${section}`;
                    links.append(link);
                }
                content.append(links);
            }
            const grid = node('div', '', 'analytics-grid');
            for (const [key, title] of Object.entries({ page: 'Pages (ID)', source: 'Referrer domains', device: 'Device classes', browser: 'Browsers', os: 'Operating systems', event: 'System events', module: 'Target modules', actor: 'Verified actors', outcome: 'Event outcomes' })) {
                if (!config.dimensions.includes(key))
                    continue;
                grid.append(table(title, ['Name', 'Count'], (data.tables[key] || []).map(row => [row.name, String(row.count)])));
            }
            if (grid.childElementCount)
                content.append(grid);
            if (view === 'website') {
                const settings = node('a', 'Consent & connections', 'button secondary sm');
                settings.href = '/admin/settings/general?tab=privacy';
                content.append(settings);
                const filter = node('input');
                filter.type = 'search';
                filter.placeholder = 'Page, account, visitor, session or referrer';
                const filterLabel = node('label', 'Filter recent visits ');
                filterLabel.append(filter);
                const visits = node('div');
                const draw = () => {
                    const query = filter.value.toLowerCase().trim();
                    const rows = (data.recentPages || []).filter(row => Object.values(row).some(value => String(value).toLowerCase().includes(query)));
                    visits.replaceChildren(table('Recent page deliveries (latest 500)', ['Time', 'Page', 'Path', 'Account ID', 'Browser visitor ID', 'Session', 'Referrer domain', 'Location (approximate)', 'Device / browser / OS'], rows.map(row => [new Date(row.at).toLocaleString(), `${row.title || row.page} (${row.page})`, row.path || 'Not recorded',
                        row.actor === 'unknown' ? 'Not recorded' : row.actor, row.visitor || 'Not linked', row.session || 'Not linked', row.source,
                        [row.country, row.region, row.city].filter(Boolean).join(' / ') || row.geoStatus || 'Not recorded',
                        `${row.device} / ${row.browser} / ${row.os}`]), query ? 'No matching visits in the latest 500 records.' : 'No recorded page deliveries in this period.'));
                };
                filter.addEventListener('input', draw);
                draw();
                content.append(filterLabel, visits);
                content.append(node('p', 'Visitor and session IDs link consenting browser visits; they do not prove a person’s identity. Missing referrers may also be hidden by the browser. Consent applies to future deliveries; earlier anonymous visits cannot be attributed retroactively.'));
            }
            if (view === 'system')
                content.append(table('Recent system activity', ['Time', 'Event', 'Actor', 'Outcome'], data.recent.filter(row => row.kind === 'system').map(row => [new Date(row.at).toLocaleString(), row.event, row.actor, row.outcome])));
            content.append(node('p', 'HTML deliveries include automated clients and reloads; they are not unique visitors or sessions. Device/software categories come from self-reported user agents. Internal event counts can include several events for one action. No historic log backfill.'));
        }
        catch (error) {
            if (current !== generation)
                return;
            const message = node('p', `ANALYTICS_LOAD_FAILED: ${error instanceof Error ? error.message : String(error)}`);
            message.setAttribute('role', 'alert');
            content.replaceChildren(message);
        }
        finally {
            if (current === generation)
                refresh.disabled = false;
        }
    }
    refresh.addEventListener('click', () => void load());
    period.addEventListener('change', () => void load());
    await load();
}
export async function render(el) { await renderAnalytics(el, 'overview'); }
