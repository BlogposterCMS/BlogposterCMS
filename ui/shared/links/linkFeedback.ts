import { openPopover, type BpPopoverHandle } from '../overlays/popover.js';
import { createEditorLinkTargetChecker, type LinkTargetResult } from './linkTargetStatus.js';

export type EditorLink = { id: string; href: string; anchor: HTMLElement };
export type LinkFeedbackItem = LinkTargetResult & { id: string };
export type LinkFeedbackOptions = {
  collect: () => EditorLink[];
  check?: (href: string) => Promise<LinkTargetResult>;
};

/** Ephemeral authoring feedback. Decorations live outside saved content and never alter a link. */
export function mountLinkFeedback(root: HTMLElement, options: LinkFeedbackOptions) {
  const check = options.check || createEditorLinkTargetChecker();
  let items: LinkFeedbackItem[] = [], currentLinks: EditorLink[] = [];
  let revision = 0, timer = 0, hideTimer = 0, stopped = false, pending = false, truncated = false;
  let popover: BpPopoverHandle | undefined;
  let popoverAnchor: { proxy: HTMLElement; source: HTMLElement } | undefined;
  let seen = new Set<string>();
  const externalInputs = new Set<HTMLInputElement>();
  const decoration = document.createElement('div');
  decoration.dataset.bpLinkFeedback = 'true';
  decoration.setAttribute('aria-hidden', 'true');
  decoration.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5290';
  document.body.append(decoration);

  function paint() {
    if (popoverAnchor?.source.isConnected) {
      const rect = popoverAnchor.source.getBoundingClientRect();
      Object.assign(popoverAnchor.proxy.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      popover?.updatePosition();
    }
    decoration.replaceChildren();
    for (const item of items.filter(item => item.warning)) {
      const anchor = currentLinks.find(link => link.id === item.id)?.anchor;
      if (!anchor?.isConnected) continue;
      const rect = anchor.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > window.innerHeight) continue;
      const outline = document.createElement('span');
      outline.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;border:1px dashed var(--color-warning,#b7791f);background:rgba(183,121,31,.08);border-radius:3px;box-sizing:border-box`;
      decoration.append(outline);
    }
  }
  function show(link: EditorLink, result: LinkTargetResult) {
    if (!link.anchor.isConnected) return;
    window.clearTimeout(hideTimer);
    // Do not close the existing link-editing popover (which owns its URL input).
    const editorPopover = link.anchor.closest('.bp-popover');
    if (editorPopover) {
      let hint = editorPopover.querySelector<HTMLElement>('[data-bp-link-hint]');
      if (!hint) { hint = document.createElement('p'); hint.dataset.bpLinkHint = 'true'; hint.setAttribute('role', 'status'); editorPopover.append(hint); }
      hint.textContent = result.message; hint.hidden = false;
      return;
    }
    popover?.close();
    // A position proxy keeps the popover's temporary ARIA attributes out of
    // authored HTML when Studio serializes a widget while the warning is open.
    const rect = link.anchor.getBoundingClientRect();
    const proxy = document.createElement('span'); proxy.dataset.bpLinkFeedback = 'anchor';
    proxy.style.cssText = `position:fixed;pointer-events:none;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
    document.body.append(proxy);
    popoverAnchor = { proxy, source: link.anchor };
    popover = openPopover(proxy, { content: result.message, role: 'tooltip', ariaLabel: 'Link target warning', autoFocus: false,
      onClose: () => { proxy.remove(); if (popoverAnchor?.proxy === proxy) popoverAnchor = undefined; } });
    popover.panel.setAttribute('aria-live', 'polite');
    hideTimer = window.setTimeout(() => { popover?.close(); popover = undefined; }, 4000);
  }
  async function refresh(announce = false) {
    if (stopped || !root.isConnected) return;
    const ownRevision = ++revision;
    const collected = options.collect();
    const links = collected.slice(0, 40);
    truncated = collected.length > 40;
    pending = true;
    const next: LinkFeedbackItem[] = [];
    // Keep the existing facade bounded even when pasting an entire linked article.
    for (let index = 0; index < links.length; index += 4) {
      const batch = await Promise.all(links.slice(index, index + 4).map(async link => ({ id: link.id, ...await check(link.href) })));
      if (ownRevision !== revision || stopped) return;
      next.push(...batch);
    }
    pending = false; currentLinks = links; items = next;
    const warnings = next.filter(item => item.warning);
    // Corrections must also clear the transient hint inside an existing URL-edit popover.
    for (const input of externalInputs) {
      const hint = input.closest('.bp-popover')?.querySelector<HTMLElement>('[data-bp-link-hint]');
      const warning = warnings.find(item => links.find(link => link.id === item.id)?.anchor === input);
      if (hint) { hint.textContent = warning?.message || ''; hint.hidden = !warning; }
    }
    const fresh = warnings.find(item => !seen.has(`${item.id}:${item.target}:${item.code}`));
    seen = new Set(warnings.map(item => `${item.id}:${item.target}:${item.code}`));
    paint();
    if (announce && fresh) {
      const link = links.find(link => link.id === fresh.id);
      if (link) show(link, fresh);
    } else if (!warnings.length) { popover?.close(); popover = undefined; }
  }
  function schedule(event?: Event) {
    window.clearTimeout(timer);
    // Invalidate in-flight results immediately, including corrections to a URL.
    revision += 1;
    pending = true;
    timer = window.setTimeout(() => { void refresh(event?.type !== 'focusin'); }, 350);
  }
  function onClick(event: Event) {
    const path = event.composedPath();
    const link = currentLinks.find(candidate => path.includes(candidate.anchor));
    const item = link && items.find(candidate => candidate.id === link.id && candidate.warning);
    if (link && item) {
      if (link.anchor instanceof HTMLAnchorElement) event.preventDefault();
      show(link, item);
    }
  }
  root.addEventListener('input', schedule);
  root.addEventListener('change', schedule);
  root.addEventListener('focusin', schedule);
  root.addEventListener('click', onClick, true);
  window.addEventListener('scroll', paint, true);
  window.addEventListener('resize', paint);
  const detachObserver = new MutationObserver(() => { if (!root.isConnected) controller.stop(); });
  detachObserver.observe(document.body, { childList: true, subtree: true });
  void refresh();
  const controller = {
    refresh,
    schedule: () => schedule(new Event('input')),
    read: () => ({ pending, checked: items.filter(item => item.code !== 'LINK_TARGET_UNCHECKED').length, unchecked: items.filter(item => item.code === 'LINK_TARGET_UNCHECKED').length, truncated, limit: 40, items: items.filter(item => item.code !== 'LINK_TARGET_UNCHECKED') }),
    watchInput: (input: HTMLInputElement) => { externalInputs.add(input); input.addEventListener('input', schedule); },
    stop: () => {
      stopped = true; revision += 1;
      window.clearTimeout(timer); window.clearTimeout(hideTimer); popover?.close(); decoration.remove();
      root.removeEventListener('input', schedule); root.removeEventListener('change', schedule);
      root.removeEventListener('focusin', schedule); root.removeEventListener('click', onClick, true);
      window.removeEventListener('scroll', paint, true); window.removeEventListener('resize', paint);
      detachObserver.disconnect();
      externalInputs.forEach(input => input.removeEventListener('input', schedule));
    }
  };
  return controller;
}

/** Read HTML as an inert template; no source attributes or attached assets are changed. */
export function htmlSourceLinks(input: HTMLTextAreaElement): EditorLink[] {
  const template = document.createElement('template');
  template.innerHTML = input.value.slice(0, 2000000);
  return Array.from(template.content.querySelectorAll<HTMLAnchorElement>('a[href]')).slice(0, 41)
    .map((link, index) => ({ id: `html-link-${index}`, href: link.getAttribute('href') || '', anchor: input }));
}
