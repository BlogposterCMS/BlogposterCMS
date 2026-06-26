const focusableSelector = [
    'button:not([disabled])',
    'input:not([disabled])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])'
].join(',');
let dialogQueue = Promise.resolve();
function hasUsableDom() {
    return typeof window !== 'undefined' && typeof document !== 'undefined' && Boolean(document.body);
}
function messageText(value) {
    if (value instanceof Error)
        return value.message;
    if (value === null || value === undefined)
        return '';
    return String(value);
}
function isNode(value) {
    return typeof Node !== 'undefined' && value instanceof Node;
}
function nextId(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
function dialogTitle(kind, title) {
    if (title)
        return title;
    if (kind === 'confirm')
        return 'Please confirm';
    if (kind === 'prompt')
        return 'Input required';
    if (kind === 'alert')
        return 'Notice';
    return 'Dialog';
}
function defaultActions(kind) {
    if (kind === 'confirm') {
        return [
            { id: 'cancel', label: 'Cancel', variant: 'ghost' },
            { id: 'confirm', label: 'OK', variant: 'primary', autofocus: true }
        ];
    }
    if (kind === 'prompt') {
        return [
            { id: 'cancel', label: 'Cancel', variant: 'ghost' },
            { id: 'submit', label: 'OK', variant: 'primary', autofocus: true }
        ];
    }
    return [{ id: 'ok', label: 'OK', variant: 'primary', autofocus: true }];
}
function enqueueDialog(run) {
    const next = dialogQueue.then(run, run);
    dialogQueue = next.then(() => undefined, () => undefined);
    return next;
}
function nativeDialog(options) {
    const kind = options.kind ?? 'modal';
    const text = messageText(options.message);
    if (typeof window === 'undefined') {
        return Promise.resolve({ action: kind === 'confirm' ? 'cancel' : 'ok', value: null });
    }
    if (kind === 'confirm') {
        return Promise.resolve({ action: window.confirm(text) ? 'confirm' : 'cancel', value: null });
    }
    if (kind === 'prompt') {
        const result = window.prompt(text, messageText(options.prompt?.defaultValue ?? ''));
        return Promise.resolve({ action: result === null ? 'cancel' : 'submit', value: result });
    }
    window.alert(text);
    return Promise.resolve({ action: 'ok', value: null });
}
function createBodyContent(body) {
    if (!body)
        return null;
    if (isNode(body))
        return body;
    if (typeof body === 'function')
        return body();
    const paragraph = document.createElement('p');
    paragraph.textContent = body;
    return paragraph;
}
function actionClass(action) {
    const variant = action.variant ?? 'ghost';
    if (variant === 'primary')
        return 'button primary';
    if (variant === 'danger')
        return 'button danger';
    return 'button ghost';
}
function focusableElements(panel) {
    return Array.from(panel.querySelectorAll(focusableSelector))
        .filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1);
}
function runDomDialog(options) {
    if (!hasUsableDom())
        return nativeDialog(options);
    return enqueueDialog(() => new Promise(resolve => {
        const kind = options.kind ?? 'modal';
        const titleId = nextId('bp-dialog-title');
        const messageId = nextId('bp-dialog-message');
        const errorId = nextId('bp-dialog-error');
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const actions = options.actions?.length ? options.actions : defaultActions(kind);
        const root = document.createElement('div');
        root.className = 'bp-dialog-root';
        root.dataset.dialogKind = kind;
        const panel = document.createElement('form');
        panel.className = 'bp-dialog app-scope';
        panel.noValidate = true;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', titleId);
        panel.setAttribute('aria-describedby', messageId);
        const header = document.createElement('header');
        header.className = 'bp-dialog__header';
        const title = document.createElement('h2');
        title.id = titleId;
        title.className = 'bp-dialog__title';
        title.textContent = dialogTitle(kind, options.title);
        header.appendChild(title);
        const body = document.createElement('div');
        body.className = 'bp-dialog__body';
        const message = document.createElement('p');
        message.id = messageId;
        message.className = 'bp-dialog__message';
        message.textContent = messageText(options.message);
        body.appendChild(message);
        const customBody = createBodyContent(options.body);
        if (customBody) {
            const customBodyWrap = document.createElement('div');
            customBodyWrap.className = 'bp-dialog__custom-body';
            customBodyWrap.appendChild(customBody);
            body.appendChild(customBodyWrap);
        }
        let promptControl = null;
        let promptError = null;
        if (options.prompt) {
            const field = document.createElement('label');
            field.className = 'bp-dialog__field';
            const labelText = document.createElement('span');
            labelText.textContent = options.prompt.label ?? 'Value';
            field.appendChild(labelText);
            promptControl = options.prompt.multiline
                ? document.createElement('textarea')
                : document.createElement('input');
            promptControl.className = 'bp-dialog__input';
            promptControl.value = messageText(options.prompt.defaultValue ?? '');
            promptControl.placeholder = options.prompt.placeholder ?? '';
            promptControl.setAttribute('aria-describedby', errorId);
            if (!options.prompt.multiline) {
                promptControl.type = 'text';
            }
            field.appendChild(promptControl);
            body.appendChild(field);
            promptError = document.createElement('p');
            promptError.id = errorId;
            promptError.className = 'bp-dialog__error';
            promptError.hidden = true;
            body.appendChild(promptError);
        }
        const footer = document.createElement('footer');
        footer.className = 'bp-dialog__actions';
        let settled = false;
        const closeWith = (result) => {
            if (settled)
                return;
            settled = true;
            document.removeEventListener('keydown', onKeyDown);
            root.removeEventListener('click', onRootClick);
            root.classList.remove('is-open');
            window.setTimeout(() => root.remove(), 120);
            previousFocus?.focus();
            resolve(result);
        };
        const readPromptValue = () => promptControl?.value ?? null;
        const validatePrompt = () => {
            if (!options.prompt?.required || !promptControl)
                return true;
            if (promptControl.value.trim())
                return true;
            if (promptError) {
                promptError.textContent = 'BP_DIALOG_PROMPT_REQUIRED: Please enter a value.';
                promptError.hidden = false;
            }
            promptControl.focus();
            return false;
        };
        const submitAction = (action) => {
            if (action.id === 'cancel') {
                closeWith({ action: 'cancel', value: null });
                return;
            }
            if (!validatePrompt())
                return;
            closeWith({ action: action.id, value: readPromptValue() });
        };
        actions.forEach(action => {
            const button = document.createElement('button');
            button.type = action.id === 'cancel' ? 'button' : 'submit';
            button.className = actionClass(action);
            button.dataset.action = action.id;
            button.textContent = action.label;
            if (action.autofocus)
                button.autofocus = true;
            button.addEventListener('click', event => {
                event.preventDefault();
                submitAction(action);
            });
            footer.appendChild(button);
        });
        function onRootClick(event) {
            if (event.target === root && options.dismissable !== false) {
                closeWith({ action: 'cancel', value: null });
            }
        }
        function onKeyDown(event) {
            if (event.key === 'Escape' && options.dismissable !== false) {
                event.preventDefault();
                closeWith({ action: 'cancel', value: null });
                return;
            }
            if (event.key !== 'Tab')
                return;
            const focusables = focusableElements(panel);
            if (!focusables.length)
                return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            }
            else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        }
        panel.addEventListener('submit', event => {
            event.preventDefault();
            const defaultAction = actions.find(action => action.autofocus)
                ?? actions.find(action => action.variant === 'primary')
                ?? actions[actions.length - 1];
            if (defaultAction)
                submitAction(defaultAction);
        });
        root.addEventListener('click', onRootClick);
        document.addEventListener('keydown', onKeyDown);
        panel.append(header, body, footer);
        root.appendChild(panel);
        document.body.appendChild(root);
        window.setTimeout(() => root.classList.add('is-open'), 0);
        window.setTimeout(() => {
            const focusTarget = promptControl
                ?? panel.querySelector('[data-action][autofocus]')
                ?? panel.querySelector('[data-action]');
            focusTarget?.focus();
        }, 0);
    }));
}
export const bpDialog = {
    async alert(msg, options = {}) {
        await runDomDialog({ ...options, kind: 'alert', message: msg });
    },
    async confirm(msg, options = {}) {
        const result = await runDomDialog({ ...options, kind: 'confirm', message: msg });
        return result.action === 'confirm';
    },
    async prompt(msg, def = '', options = {}) {
        const { prompt, ...dialogOptions } = options;
        const result = await runDomDialog({
            ...dialogOptions,
            kind: 'prompt',
            message: msg,
            prompt: { ...prompt, defaultValue: def, required: prompt?.required ?? false }
        });
        return result.action === 'cancel' ? null : result.value;
    },
    open(options) {
        return runDomDialog(options);
    }
};
if (typeof window !== 'undefined') {
    window.bpDialog = bpDialog;
}
