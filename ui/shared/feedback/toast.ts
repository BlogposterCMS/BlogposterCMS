export type BpToastTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export interface BpToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface BpToastOptions {
  title?: string;
  message: unknown;
  tone?: BpToastTone;
  duration?: number;
  dismissible?: boolean;
  action?: BpToastAction;
}

export interface BpToastHandle {
  element: HTMLElement | null;
  dismiss: () => void;
}

export interface BpToastApi {
  show: (options: BpToastOptions) => BpToastHandle;
  info: (message: unknown, options?: Omit<BpToastOptions, 'message' | 'tone'>) => BpToastHandle;
  success: (message: unknown, options?: Omit<BpToastOptions, 'message' | 'tone'>) => BpToastHandle;
  warning: (message: unknown, options?: Omit<BpToastOptions, 'message' | 'tone'>) => BpToastHandle;
  error: (message: unknown, options?: Omit<BpToastOptions, 'message' | 'tone'>) => BpToastHandle;
  clear: () => void;
}

declare global {
  interface Window {
    bpToast?: BpToastApi;
  }
}

const REGION_ID = 'bp-toast-region';
const DEFAULT_DURATION = 4500;

const ICON_BY_TONE: Record<BpToastTone, string> = {
  neutral: 'bell',
  info: 'info',
  success: 'circle-check',
  warning: 'triangle-alert',
  error: 'circle-x'
};

function messageText(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (value === null || value === undefined) return '';
  return String(value);
}

function ensureRegion(): HTMLElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  const existing = document.getElementById(REGION_ID);
  if (existing) return existing;

  const region = document.createElement('section');
  region.id = REGION_ID;
  region.className = 'bp-toast-region app-scope';
  region.setAttribute('aria-label', 'Notifications');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-relevant', 'additions');
  document.body.appendChild(region);
  return region;
}

function nextFrame(callback: FrameRequestCallback): void {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(callback);
  } else {
    window.setTimeout(() => callback(Date.now()), 0);
  }
}

export function showToast(options: BpToastOptions): BpToastHandle {
  const region = ensureRegion();
  if (!region) {
    console.warn('BP_TOAST_DOCUMENT_UNAVAILABLE: Toast could not be mounted.');
    return { element: null, dismiss: () => {} };
  }

  const tone = options.tone ?? 'neutral';
  const toast = document.createElement('article');
  toast.className = `bp-toast bp-toast--${tone}`;
  toast.dataset.toastTone = tone;
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');

  const icon = document.createElement('img');
  icon.className = 'bp-toast__icon';
  icon.src = `/assets/icons/${ICON_BY_TONE[tone]}.svg`;
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');

  const content = document.createElement('div');
  content.className = 'bp-toast__content';
  if (options.title) {
    const title = document.createElement('strong');
    title.className = 'bp-toast__title';
    title.textContent = options.title;
    content.appendChild(title);
  }
  const message = document.createElement('p');
  message.className = 'bp-toast__message';
  message.textContent = messageText(options.message);
  content.appendChild(message);

  let settled = false;
  let timer: number | null = null;
  const duration = Math.max(0, Number(options.duration ?? DEFAULT_DURATION));

  const dismiss = () => {
    if (settled) return;
    settled = true;
    if (timer !== null) window.clearTimeout(timer);
    toast.classList.add('is-leaving');
    window.setTimeout(() => {
      toast.remove();
      if (!region.childElementCount) region.remove();
    }, 160);
  };

  const actions = document.createElement('div');
  actions.className = 'bp-toast__actions';
  if (options.action) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'button text sm bp-toast__action';
    action.textContent = options.action.label;
    action.addEventListener('click', () => {
      Promise.resolve(options.action?.onClick()).catch(error => {
        console.error('BP_TOAST_ACTION_FAILED: Toast action failed.', error);
      });
      dismiss();
    });
    actions.appendChild(action);
  }

  if (options.dismissible !== false) {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'bp-toast__close';
    close.setAttribute('aria-label', 'Dismiss notification');
    const closeIcon = document.createElement('img');
    closeIcon.src = '/assets/icons/x.svg';
    closeIcon.alt = '';
    closeIcon.setAttribute('aria-hidden', 'true');
    close.appendChild(closeIcon);
    close.addEventListener('click', dismiss);
    actions.appendChild(close);
  }

  toast.append(icon, content, actions);
  region.appendChild(toast);
  nextFrame(() => toast.classList.add('is-visible'));

  // Pausing while the toast is being read keeps short-lived feedback usable
  // for keyboard and pointer users without making all messages permanent.
  const scheduleDismiss = () => {
    if (!duration || settled) return;
    timer = window.setTimeout(dismiss, duration);
  };
  const pauseDismiss = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };
  toast.addEventListener('mouseenter', pauseDismiss);
  toast.addEventListener('mouseleave', scheduleDismiss);
  toast.addEventListener('focusin', pauseDismiss);
  toast.addEventListener('focusout', scheduleDismiss);
  scheduleDismiss();

  return { element: toast, dismiss };
}

function clearToasts(): void {
  document.getElementById(REGION_ID)?.remove();
}

export const bpToast: BpToastApi = {
  show: showToast,
  info: (message, options = {}) => showToast({ ...options, message, tone: 'info' }),
  success: (message, options = {}) => showToast({ ...options, message, tone: 'success' }),
  warning: (message, options = {}) => showToast({ ...options, message, tone: 'warning' }),
  error: (message, options = {}) => showToast({ ...options, message, tone: 'error' }),
  clear: clearToasts
};

if (typeof window !== 'undefined') {
  window.bpToast = bpToast;
}
