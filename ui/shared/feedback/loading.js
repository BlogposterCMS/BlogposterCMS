export function createLoader(options = {}) {
    const variant = options.variant ?? 'inline';
    const loader = document.createElement('div');
    loader.className = `bp-loader bp-loader--${variant}`;
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-live', 'polite');
    const label = document.createElement('span');
    label.className = variant === 'spinner' ? 'bp-sr-only' : 'bp-loader__label';
    label.textContent = options.label ?? 'Loading';
    if (variant === 'skeleton') {
        label.className = 'bp-sr-only';
        loader.appendChild(label);
        const lines = Math.max(1, Math.min(8, Math.round(options.lines ?? 4)));
        for (let index = 0; index < lines; index += 1) {
            const bar = document.createElement('span');
            bar.className = 'bp-loader__skeleton-line';
            bar.style.setProperty('--bp-skeleton-width', `${Math.max(42, 100 - (index * 11))}%`);
            bar.style.setProperty('--bp-skeleton-delay', `${index * 80}ms`);
            loader.appendChild(bar);
        }
        return loader;
    }
    const spinner = document.createElement('span');
    spinner.className = 'bp-loader__spinner';
    spinner.setAttribute('aria-hidden', 'true');
    loader.append(spinner, label);
    return loader;
}
/**
 * Applies a reversible loading state without replacing a button's content.
 * The original accessibility attributes are restored when work completes.
 */
export function setButtonLoading(button, loading, label = 'Loading') {
    if (loading) {
        if (button.dataset.bpLoading === 'true')
            return;
        button.dataset.bpLoading = 'true';
        button.dataset.bpPreviousDisabled = String(button.disabled);
        button.dataset.bpPreviousAriaLabel = button.getAttribute('aria-label') ?? '';
        button.classList.add('is-loading');
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.setAttribute('aria-label', label);
        return;
    }
    if (button.dataset.bpLoading !== 'true')
        return;
    button.classList.remove('is-loading');
    button.disabled = button.dataset.bpPreviousDisabled === 'true';
    button.removeAttribute('aria-busy');
    const previousLabel = button.dataset.bpPreviousAriaLabel ?? '';
    if (previousLabel)
        button.setAttribute('aria-label', previousLabel);
    else
        button.removeAttribute('aria-label');
    delete button.dataset.bpLoading;
    delete button.dataset.bpPreviousDisabled;
    delete button.dataset.bpPreviousAriaLabel;
}
export function createProgress(labelText, initialValue = 0) {
    const root = document.createElement('div');
    root.className = 'bp-progress';
    const header = document.createElement('div');
    header.className = 'bp-progress__header';
    const label = document.createElement('span');
    label.textContent = labelText;
    const valueText = document.createElement('span');
    valueText.className = 'bp-progress__value';
    header.append(label, valueText);
    const track = document.createElement('div');
    track.className = 'bp-progress__track';
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', labelText);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    const bar = document.createElement('span');
    bar.className = 'bp-progress__bar';
    track.appendChild(bar);
    root.append(header, track);
    const update = (value) => {
        const safeValue = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
        track.setAttribute('aria-valuenow', String(Math.round(safeValue)));
        bar.style.width = `${safeValue}%`;
        valueText.textContent = `${Math.round(safeValue)}%`;
    };
    update(initialValue);
    return { element: root, update };
}
