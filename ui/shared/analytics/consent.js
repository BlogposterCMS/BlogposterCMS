import { createFormChoice, createFormActions } from '../forms/formField.js';
import { analyticsConnectors } from './connectors/index.js';
const categories = [
    ['analytics', 'Analytics — count page deliveries and their source'],
    ['recognition', 'Visit linking — browser/session IDs and signed-in account ID'],
    ['marketing', 'Marketing — optional advertising integrations'],
    ['personalization', 'Personalization — optional preference integrations']
];
export function readCookie(name) {
    return document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}
function setCookie(name, value, seconds) {
    document.cookie = `${name}=${value}; Max-Age=${seconds}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}
export function mountConsent(config, reload = () => location.reload()) {
    if (document.getElementById('bp-consent-controls'))
        return;
    const blocked = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
    let choice;
    try {
        const saved = JSON.parse(decodeURIComponent(readCookie('bp_consent')));
        if (saved.version === config.policyVersion && Number.isFinite(saved.at) && saved.at <= Date.now() && saved.at > Date.now() - config.cookieDays * 86400000)
            choice = saved;
    }
    catch { /* Missing/invalid/expired preferences need a new choice. */ }
    const effective = (category) => config.enabled && config.bannerEnabled && !blocked && config[category]
        && (category !== 'recognition' || (config.analytics && choice?.analytics === true))
        && !(readCookie('bp_consent') && !choice)
        && (choice ? choice[category] === true : category === 'analytics' && config.mode === 'opt-out');
    const recognition = effective('analytics') && effective('recognition');
    for (const [name, seconds] of [['bp_visitor', config.visitorDays * 86400], ['bp_session', config.sessionMinutes * 60]]) {
        if (recognition) {
            const current = readCookie(name);
            if (!/^[a-f0-9-]{36}$/.test(current))
                setCookie(name, crypto.randomUUID(), seconds);
            else if (name === 'bp_session')
                setCookie(name, current, seconds);
        }
        else
            setCookie(name, '', 0);
    }
    const nonce = window.NONCE || '';
    for (const connector of analyticsConnectors) {
        if (choice && effective('analytics'))
            connector.start(config, nonce);
        else
            connector.stop(config);
    }
    document.dispatchEvent(new CustomEvent('bp:consent', { detail: Object.fromEntries(categories.map(([key]) => [key, effective(key)])) }));
    if (!config.enabled || !config.bannerEnabled)
        return;
    // Public HTML may not load the admin stylesheet. Reuse the scoped UI kit so
    // the banner receives real controls without restyling the site's content.
    if (!document.querySelector('link[href="/assets/css/ui-kit-components.css"]')) {
        const sheet = document.createElement('link');
        sheet.rel = 'stylesheet';
        sheet.href = '/assets/css/ui-kit-components.css';
        document.head.append(sheet);
    }
    const host = document.createElement('section');
    host.id = 'bp-consent-controls';
    host.className = 'bp-ui-kit-surface';
    const scope = document.createElement('div');
    scope.className = 'app-scope';
    const reopen = document.createElement('button');
    reopen.type = 'button';
    reopen.className = 'button secondary sm';
    reopen.textContent = 'Privacy preferences';
    reopen.style.cssText = 'position:fixed;bottom:1rem;left:1rem;z-index:2147483000';
    const panel = document.createElement('section');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', config.title);
    panel.className = 'settings-surface page-list-card';
    panel.style.cssText = `position:fixed;${config.position}:0;left:0;right:0;z-index:2147483001;background:var(--studio-surface-solid,#fff);color:var(--studio-text,#17212b);padding:1.25rem;box-shadow:0 0 24px #0003;max-height:85vh;overflow:auto`;
    const heading = document.createElement('h2');
    heading.textContent = config.title;
    heading.style.cssText = 'font-size:1.25rem;font-weight:600;margin:0 0 .5rem';
    const message = document.createElement('p');
    message.textContent = config.message;
    message.style.marginBottom = '.5rem';
    const note = document.createElement('p');
    note.textContent = blocked ? 'Your browser privacy signal disables optional services.'
        : choice ? 'Your saved preferences apply. Change or withdraw them below.'
            : config.mode === 'opt-out' ? 'Anonymous first-party analytics starts until you opt out. Visit linking and Google Analytics require an explicit choice.' : 'Optional services remain off until you choose.';
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Manage categories';
    details.append(summary);
    details.style.margin = '.75rem 0';
    summary.style.cursor = 'pointer';
    const necessary = document.createElement('p');
    necessary.textContent = 'Necessary — always active: authentication, security and storing this choice.';
    details.append(necessary);
    const fields = new Map();
    for (const [key, label] of categories) {
        if (!config[key])
            continue;
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = effective(key);
        input.disabled = blocked;
        fields.set(key, input);
        const field = createFormChoice(label, input);
        field.style.display = 'flex';
        details.append(field);
    }
    if (config.googleEnabled) {
        const provider = document.createElement('p');
        provider.textContent = 'Google Analytics (GA4): UNTESTED connector. Enabled only with explicit Analytics consent. Advertising signals remain disabled.';
        details.append(provider);
    }
    const status = document.createElement('p');
    status.setAttribute('role', 'alert');
    const save = (all) => {
        const next = { version: config.policyVersion, at: Date.now() };
        for (const [key] of categories)
            next[key] = !blocked && config[key] && (all ?? fields.get(key)?.checked ?? false);
        next.recognition = next.recognition && next.analytics;
        setCookie('bp_consent', encodeURIComponent(JSON.stringify(next)), config.cookieDays * 86400);
        if (readCookie('bp_consent') !== encodeURIComponent(JSON.stringify(next))) {
            status.textContent = 'CONSENT_STORAGE_UNAVAILABLE: Your browser did not save this choice. Optional services have not been activated.';
            return;
        }
        if (!next.recognition) {
            setCookie('bp_visitor', '', 0);
            setCookie('bp_session', '', 0);
        }
        else {
            // Establish the links before the following server delivery is measured.
            if (!readCookie('bp_visitor'))
                setCookie('bp_visitor', crypto.randomUUID(), config.visitorDays * 86400);
            if (!readCookie('bp_session'))
                setCookie('bp_session', crypto.randomUUID(), config.sessionMinutes * 60);
        }
        for (const connector of analyticsConnectors)
            connector.stop(config);
        reload();
    };
    const buttons = [['Reject optional', () => save(false)], ['Save selection', () => save()], ['Accept optional', () => save(true)]];
    const actions = buttons.map(([label, action]) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.className = 'button secondary'; button.addEventListener('click', action); return button; });
    panel.append(heading, message, note, details, createFormActions(...actions), status);
    if (config.privacyUrl) {
        const link = document.createElement('a');
        link.href = config.privacyUrl;
        link.textContent = 'Privacy policy';
        panel.append(link);
    }
    panel.hidden = Boolean(choice);
    reopen.hidden = !panel.hidden;
    reopen.addEventListener('click', () => { panel.hidden = false; reopen.hidden = true; actions[0]?.focus(); });
    scope.append(reopen, panel);
    host.append(scope);
    document.body.append(host);
}
