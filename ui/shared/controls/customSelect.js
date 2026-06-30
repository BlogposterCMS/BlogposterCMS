const enhancedSelects = new WeakMap();
const activeSelects = new Set();
let instanceId = 0;
let documentBindingsReady = false;
let documentObserver = null;
function nextId(prefix) {
    instanceId += 1;
    return `${prefix}-${instanceId}`;
}
function isEscapeHatch(select) {
    return select.dataset.nativeSelect === 'true'
        || select.dataset.enhance === 'native'
        || select.multiple
        || select.size > 1;
}
function isIntentionallyHidden(select) {
    return select.hidden
        || select.getAttribute('aria-hidden') === 'true'
        || select.style.display === 'none'
        || select.closest('[hidden], [aria-hidden="true"]') !== null;
}
function shouldEnhanceSelect(select) {
    if (isEscapeHatch(select))
        return false;
    if (select.closest('.custom-select'))
        return false;
    // Existing opt-in selects remain allowed even when nearby CSS makes them compact.
    if (select.dataset.enhance === 'dropdown')
        return true;
    return !isIntentionallyHidden(select);
}
function getSelectedOption(select) {
    return select.options[select.selectedIndex] ?? null;
}
function getOptionLabel(option) {
    return option?.label || option?.textContent?.trim() || '';
}
function getButtonLabel(select) {
    const ariaLabel = select.getAttribute('aria-label');
    if (ariaLabel)
        return ariaLabel;
    if (select.id) {
        const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
            ? CSS.escape(select.id)
            : select.id.replace(/["\\]/g, '\\$&');
        const label = document.querySelector(`label[for="${escapedId}"]`);
        if (label?.textContent)
            return label.textContent.trim();
    }
    const wrappingLabel = select.closest('label');
    return wrappingLabel?.textContent?.trim() || null;
}
function emitNativeChange(select) {
    select.dispatchEvent(new Event('change', { bubbles: true }));
}
function closeAll(except) {
    activeSelects.forEach(select => {
        if (select !== except)
            enhancedSelects.get(select)?.close();
    });
}
function copySelectSizing(select, wrapper) {
    const inlineWidth = select.style.width;
    if (inlineWidth) {
        wrapper.style.width = inlineWidth;
        return;
    }
    const computedWidth = window.getComputedStyle(select).width;
    if (computedWidth && computedWidth !== 'auto' && computedWidth !== '0px') {
        wrapper.style.setProperty('--custom-select-source-width', computedWidth);
    }
}
function createOptionButton(select, state, option, index) {
    const button = document.createElement('button');
    const optionId = `${state.optionList.id}-option-${index}`;
    const selected = index === select.selectedIndex;
    button.type = 'button';
    button.id = optionId;
    button.className = 'option';
    button.dataset.optionIndex = String(index);
    button.textContent = getOptionLabel(option);
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(selected));
    button.disabled = option.disabled;
    if (option.disabled)
        button.classList.add('disabled');
    button.addEventListener('click', () => {
        if (option.disabled)
            return;
        select.selectedIndex = index;
        state.refresh();
        emitNativeChange(select);
        state.close();
        state.display.focus();
    });
    button.addEventListener('keydown', event => {
        handleListKeydown(event, select, state);
    });
    return button;
}
function getFocusableOptions(state) {
    return Array.from(state.optionList.querySelectorAll('.option:not(:disabled)'));
}
function focusOption(state, direction) {
    const options = getFocusableOptions(state);
    if (!options.length)
        return;
    const current = document.activeElement instanceof HTMLButtonElement
        ? options.indexOf(document.activeElement)
        : -1;
    const next = current < 0
        ? (direction > 0 ? 0 : options.length - 1)
        : (current + direction + options.length) % options.length;
    options[next]?.focus();
}
function focusSelectedOption(select, state) {
    const selected = state.optionList.querySelector(`.option[data-option-index="${select.selectedIndex}"]:not(:disabled)`);
    if (selected) {
        selected.focus();
        return;
    }
    focusOption(state, 1);
}
function handleDisplayKeydown(event, select, state) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        state.open();
        focusOption(state, event.key === 'ArrowDown' ? 1 : -1);
        return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        state.open();
        focusSelectedOption(select, state);
        return;
    }
    if (event.key === 'Escape') {
        state.close();
    }
}
function handleListKeydown(event, select, state) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        focusOption(state, event.key === 'ArrowDown' ? 1 : -1);
        return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const optionIndex = Number(event.currentTarget.dataset.optionIndex);
        const option = select.options[optionIndex];
        if (!option || option.disabled)
            return;
        select.selectedIndex = optionIndex;
        state.refresh();
        emitNativeChange(select);
        state.close();
        state.display.focus();
        return;
    }
    if (event.key === 'Escape' || event.key === 'Tab') {
        state.close();
        if (event.key === 'Escape') {
            event.preventDefault();
            state.display.focus();
        }
    }
}
function enhanceSelect(select) {
    const existingState = enhancedSelects.get(select);
    if (existingState) {
        existingState.refresh();
        return;
    }
    if (!shouldEnhanceSelect(select))
        return;
    const staleWrapper = select.nextElementSibling;
    if (staleWrapper instanceof HTMLElement && staleWrapper.classList.contains('custom-select')) {
        staleWrapper.remove();
    }
    const wrapper = document.createElement('div');
    const display = document.createElement('button');
    const valueNode = document.createElement('span');
    const chevron = document.createElement('span');
    const optionList = document.createElement('div');
    const listboxId = nextId('custom-select-listbox');
    const label = getButtonLabel(select);
    wrapper.className = 'custom-select';
    wrapper.dataset.customSelect = 'true';
    copySelectSizing(select, wrapper);
    display.type = 'button';
    display.className = 'display';
    display.setAttribute('role', 'combobox');
    display.setAttribute('aria-haspopup', 'listbox');
    display.setAttribute('aria-expanded', 'false');
    display.setAttribute('aria-controls', listboxId);
    if (label)
        display.setAttribute('aria-label', label);
    valueNode.className = 'custom-select__value';
    chevron.className = 'custom-select__chevron';
    chevron.setAttribute('aria-hidden', 'true');
    optionList.id = listboxId;
    optionList.className = 'options';
    optionList.setAttribute('role', 'listbox');
    const state = {
        wrapper,
        display,
        valueNode,
        optionList,
        optionsObserver: null,
        open: () => {
            if (select.disabled)
                return;
            closeAll(select);
            state.refresh();
            wrapper.classList.add('open');
            display.setAttribute('aria-expanded', 'true');
            activeSelects.add(select);
        },
        close: () => {
            wrapper.classList.remove('open');
            display.setAttribute('aria-expanded', 'false');
            activeSelects.delete(select);
        },
        refresh: () => {
            const selectedOption = getSelectedOption(select);
            valueNode.textContent = getOptionLabel(selectedOption);
            display.disabled = select.disabled;
            wrapper.classList.toggle('is-disabled', select.disabled);
            optionList.innerHTML = '';
            Array.from(select.options).forEach((option, index) => {
                if (option.hidden)
                    return;
                optionList.appendChild(createOptionButton(select, state, option, index));
            });
        },
        destroy: () => {
            state.optionsObserver?.disconnect();
            activeSelects.delete(select);
            enhancedSelects.delete(select);
            wrapper.remove();
            select.classList.remove('custom-select__native');
            delete select.dataset.customSelectEnhanced;
        },
    };
    enhancedSelects.set(select, state);
    select.dataset.customSelectEnhanced = 'true';
    select.classList.add('custom-select__native');
    display.append(valueNode, chevron);
    wrapper.append(display, optionList);
    select.after(wrapper);
    state.refresh();
    display.addEventListener('click', () => {
        if (wrapper.classList.contains('open'))
            state.close();
        else
            state.open();
    });
    display.addEventListener('keydown', event => handleDisplayKeydown(event, select, state));
    select.addEventListener('change', state.refresh);
    if (typeof MutationObserver !== 'undefined') {
        state.optionsObserver = new MutationObserver(state.refresh);
        state.optionsObserver.observe(select, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['disabled', 'hidden', 'label', 'selected', 'value'],
        });
    }
}
function cleanupRemovedSelects(root) {
    if (root instanceof HTMLSelectElement) {
        enhancedSelects.get(root)?.destroy();
    }
    if (root instanceof Element) {
        root.querySelectorAll('select').forEach(select => {
            enhancedSelects.get(select)?.destroy();
        });
    }
}
function bindDocumentBehavior() {
    if (documentBindingsReady)
        return;
    documentBindingsReady = true;
    document.addEventListener('click', event => {
        const target = event.target;
        if (target instanceof Element && target.closest('.custom-select'))
            return;
        closeAll();
    });
    if (typeof MutationObserver === 'undefined' || !document.body)
        return;
    documentObserver = new MutationObserver(records => {
        records.forEach(record => {
            record.removedNodes.forEach(cleanupRemovedSelects);
            record.addedNodes.forEach(node => {
                if (node instanceof HTMLSelectElement) {
                    enhanceSelect(node);
                    return;
                }
                if (node instanceof Element || node instanceof DocumentFragment) {
                    enhanceSelects(node);
                }
            });
        });
    });
    documentObserver.observe(document.body, { childList: true, subtree: true });
}
export default function enhanceSelects(root = document) {
    const scope = root instanceof HTMLSelectElement ? [root] : Array.from(root.querySelectorAll('select'));
    scope.forEach(enhanceSelect);
    bindDocumentBehavior();
}
function startCustomSelects() {
    enhanceSelects(document);
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startCustomSelects, { once: true });
}
else {
    startCustomSelects();
}
