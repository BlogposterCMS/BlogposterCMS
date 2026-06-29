import { createRuntimeWidgetContext } from './runtimeWidgetContext.js';
import { loadWidgetModule } from './widgetRuntimeGateway.js';
import type { RuntimeWidgetDefinition } from './runtimeWidgetTypes.js';

type RuntimeWidgetError = {
  code: string;
  title: string;
  detail?: string;
};

function createRuntimeWidgetError({ code, title, detail }: RuntimeWidgetError): HTMLElement {
  const message = document.createElement('div');
  message.className = 'widget-runtime-message';
  message.dataset.errorCode = code;
  message.setAttribute('role', 'alert');
  message.style.cssText = [
    'box-sizing:border-box',
    'width:100%',
    'min-height:100%',
    'padding:12px',
    'color:var(--color-text,#1f2933)',
    'background:var(--color-card,#fff)',
    'font:13px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'overflow-wrap:anywhere'
  ].join(';');

  const heading = document.createElement('strong');
  heading.textContent = title;
  heading.style.display = 'block';
  heading.style.marginBottom = '4px';

  const codeNode = document.createElement('code');
  codeNode.textContent = code;
  codeNode.style.display = 'block';
  codeNode.style.marginTop = '6px';
  codeNode.style.fontSize = '11px';

  message.append(heading);
  if (detail) {
    const detailNode = document.createElement('span');
    detailNode.textContent = detail;
    detailNode.style.display = 'block';
    message.append(detailNode);
  }
  message.append(codeNode);
  return message;
}

function renderRuntimeWidgetError(container: HTMLElement, error: RuntimeWidgetError): void {
  container.replaceChildren(createRuntimeWidgetError(error));
}

function toRuntimeErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}

export async function renderRuntimeWidgetModule(
  wrapper: HTMLElement,
  container: HTMLElement,
  def: RuntimeWidgetDefinition,
  lane = 'public',
  instanceMetadata: Record<string, any> = {}
): Promise<void> {
  if (!def.codeUrl) {
    console.warn(`[Widget ${def.id}] WIDGET_RUNTIME_MISSING_CODE_URL: missing codeUrl`);
    renderRuntimeWidgetError(container, {
      code: 'WIDGET_RUNTIME_MISSING_CODE_URL',
      title: 'Widget module is missing.',
      detail: `Widget ${def.id} has no code URL.`
    });
    return;
  }

  let mod: any;
  try {
    mod = await loadWidgetModule(def.codeUrl);
  } catch (err) {
    console.error(`[Widget ${def.id}] WIDGET_RUNTIME_IMPORT_FAILED import error:`, err);
    renderRuntimeWidgetError(container, {
      code: 'WIDGET_RUNTIME_IMPORT_FAILED',
      title: 'Widget module could not load.',
      detail: `${def.codeUrl}: ${toRuntimeErrorMessage(err)}`
    });
    return;
  }

  if (!mod) {
    console.warn(`[Widget ${def.id}] WIDGET_RUNTIME_BLOCKED_CODE_URL blocked widget import path:`, def.codeUrl);
    renderRuntimeWidgetError(container, {
      code: 'WIDGET_RUNTIME_BLOCKED_CODE_URL',
      title: 'Widget module path is blocked.',
      detail: def.codeUrl
    });
    return;
  }

  if (typeof mod.render !== 'function') {
    console.error(`[Widget ${def.id}] WIDGET_RUNTIME_MISSING_RENDER render export missing:`, def.codeUrl);
    renderRuntimeWidgetError(container, {
      code: 'WIDGET_RUNTIME_MISSING_RENDER',
      title: 'Widget module has no renderer.',
      detail: def.codeUrl
    });
    return;
  }

  try {
    await mod.render(container, createRuntimeWidgetContext(wrapper, def, lane, instanceMetadata));
  } catch (err) {
    console.error(`[Widget ${def.id}] WIDGET_RUNTIME_RENDER_FAILED render error:`, err);
    renderRuntimeWidgetError(container, {
      code: 'WIDGET_RUNTIME_RENDER_FAILED',
      title: 'Widget render failed.',
      detail: `${def.codeUrl}: ${toRuntimeErrorMessage(err)}`
    });
  }
}
