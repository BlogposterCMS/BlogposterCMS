import { normalizeUiDocument, readBinding, conditionMatches, resolveInput, uiError, type UiDocument, type UiNode } from '/ui/shared/widget-ui/model.js';

export type UiEvent = { action: string; event?: string; value?: string; checked?: boolean; key?: string; isComposing?: boolean; inputRevision?: number };
export type UiRequester = (operation: string, input: any, signal?: AbortSignal) => Promise<unknown>;

/** Instance-local presentation state; module responses remain the authoritative data. */
export function createUiBindings(input: UiDocument, request: UiRequester, paint: (tree: UiNode) => void, preview = false) {
  const doc = normalizeUiDocument(input);
  const state = { ...doc.state };
  const data: Record<string, { status: string; result?: unknown; error?: string }> = {};
  const jobs = new Map<string, { version: number; timer?: ReturnType<typeof setTimeout>; controller?: AbortController }>();
  let disposed = false, resolvedNodes = 0;
  const scope = (event?: UiEvent) => ({ state, data, event: event || {} });
  function resolveNode(node: UiNode, local: Record<string, unknown>, suffix = ''): UiNode[] {
    if (++resolvedNodes > 500) throw uiError('WIDGET_VIEW_NODE_LIMIT');
    if (node.repeat) {
      const items = readBinding(local, node.repeat.ref);
      if (!Array.isArray(items)) return [];
      const seen = new Set<string>();
      return items.slice(0, 100).flatMap((item, index) => {
        const identity = String(readBinding({ item }, `item.${node.repeat!.key}`) ?? index);
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(identity) || seen.has(identity)) throw uiError('WIDGET_REPEAT_KEY_INVALID');
        seen.add(identity);
        return resolveNode({ ...node, repeat: undefined }, { ...local, item, index }, `${suffix}-${identity}`);
      });
    }
    const result: UiNode = { ...node, key: node.key ? node.key + suffix : undefined, props: { ...node.props } };
    for (const [field, binding] of Object.entries(node.bindings || {})) {
      const value = readBinding(local, binding.ref);
      if (['open','hidden'].includes(field)) (result as any)[field] = !!value;
      else if (['text','value','label'].includes(field)) (result as any)[field] = value == null ? '' : String(value);
      else result.props![field] = value;
    }
    if (node.when && !conditionMatches(node.when, local)) result.hidden = true;
    result.children = (node.children || []).flatMap(child => resolveNode(child, local, suffix));
    result.bindings = undefined; result.when = undefined;
    return [result];
  }
  function render(): void { if (!disposed) { resolvedNodes = 0; paint(resolveNode(doc.view, scope())[0]!); } }
  async function load(name: string, event: UiEvent): Promise<void> {
    const source = doc.sources?.[name];
    if (!source) throw uiError('WIDGET_SOURCE_MISSING');
    const previous = jobs.get(name); previous?.controller?.abort(); clearTimeout(previous?.timer);
    const job = { version: (previous?.version || 0) + 1, controller: new AbortController(), timer: undefined as ReturnType<typeof setTimeout> | undefined };
    jobs.set(name, job);
    const parameters = resolveInput(source.input || {}, scope(event));
    data[name] = { status: 'loading' }; render();
    const run = async () => {
      try {
        // Designer uses explicit sample responses. Editing a document never calls providers.
        const result = preview ? source.sample ?? null : await request(source.operation, parameters, job.controller.signal);
        if (disposed || jobs.get(name) !== job) return;
        data[name] = { status: 'ready', result }; render();
      } catch (error) {
        if (disposed || jobs.get(name) !== job) return;
        data[name] = { status: 'error', error: (error as any)?.status === 401 ? 'WIDGET_LOGIN_REQUIRED' : 'WIDGET_DATA_REQUEST_FAILED' }; render();
      }
    };
    if (source.debounceMs) job.timer = setTimeout(() => { void run(); }, source.debounceMs);
    else await run();
  }
  async function dispatch(event: UiEvent): Promise<void> {
    if (disposed || event.isComposing) return;
    const actions = doc.actions?.[event.action];
    if (!actions) return;
    // UI state changes happen synchronously before a request, including its input bindings.
    for (const action of actions) {
      if (action.type === 'set') state[action.target] = resolveInput(action.value, scope(event));
      else if (action.type === 'toggle') state[action.target] = !state[action.target];
      else void load(action.target, event);
    }
    render();
  }
  render();
  return { dispatch, snapshot: () => JSON.parse(JSON.stringify({ state, data })),
    dispose() { disposed = true; jobs.forEach(job => { clearTimeout(job.timer); job.controller?.abort(); }); jobs.clear(); } };
}
