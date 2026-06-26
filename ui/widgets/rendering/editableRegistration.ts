type EditableRegistrationDetail = {
  element: HTMLElement;
  source: string;
  handled?: boolean;
};

type EditableRegistrar = {
  registerElement?: (element: HTMLElement) => void;
  default?: {
    registerElement?: (element: HTMLElement) => void;
  };
};

type EditableBridgeWindow = Window & {
  BP_WIDGET_EDITOR?: EditableRegistrar;
  BP_DESIGNER_EDITOR?: EditableRegistrar;
};

function callRegistrar(registrar: EditableRegistrar | undefined, element: HTMLElement): boolean {
  const registerElement = registrar?.registerElement || registrar?.default?.registerElement;
  if (typeof registerElement !== 'function') return false;
  registerElement(element);
  return true;
}

export async function registerEditableElement(
  element: HTMLElement,
  source = 'widget'
): Promise<boolean> {
  const detail: EditableRegistrationDetail = { element, source, handled: false };
  document.dispatchEvent(new CustomEvent('ui:widget-editable-mounted', { detail }));
  if (detail.handled) return true;

  const bridgeWindow = window as EditableBridgeWindow;
  if (
    callRegistrar(bridgeWindow.BP_WIDGET_EDITOR, element) ||
    callRegistrar(bridgeWindow.BP_DESIGNER_EDITOR, element)
  ) {
    return true;
  }

  if (!document.body.classList.contains('builder-mode')) return false;

  try {
    const mod = await import(
      /* webpackIgnore: true */ '/build/designerEditor.js'
    ) as EditableRegistrar;
    return callRegistrar(mod, element);
  } catch (err) {
    console.warn(`[${source}] editor bridge load failed`, err);
    return false;
  }
}
