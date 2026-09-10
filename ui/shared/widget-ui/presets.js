/** A portable example of event -> state -> named data source -> conditional container. */
export function searchPopoverDocument(language = 'en') {
    return { version: 1, state: { query: '', opened: false },
        sources: { articles: { operation: 'publicSearch', debounceMs: 200, input: { query: { q: { ref: 'state.query' }, lang: language, type: 'page', limit: '10' } },
                sample: { items: [{ id: 'example-1', title: 'Getting started', path: '/docs' }, { id: 'example-2', title: 'Working with content', path: '/docs/content' }] } } },
        actions: {
            search: [{ type: 'set', target: 'query', value: { ref: 'event.value' } }, { type: 'set', target: 'opened', value: true }, { type: 'request', target: 'articles' }],
            close: [{ type: 'set', target: 'opened', value: false }]
        },
        view: { tag: 'div', key: 'search-demo', styles: { maxWidth: '640px', padding: '24px' }, children: [
                { tag: 'h2', text: 'Find an article' },
                { tag: 'input', key: 'query', type: 'search', label: 'Search published articles', events: { input: 'search' }, bindings: { value: { ref: 'state.query' } }, props: { placeholder: 'Start typing…' }, styles: { width: '100%' } },
                { tag: 'popover', key: 'results', anchor: 'query', label: 'Article results', bindings: { open: { ref: 'state.opened' } }, events: { close: 'close' }, props: { matchAnchorWidth: true }, children: [
                        { tag: 'p', text: 'Searching…', when: { ref: 'data.articles.status', operator: 'equals', value: 'loading' } },
                        { tag: 'p', text: 'The search could not be loaded.', when: { ref: 'data.articles.status', operator: 'equals', value: 'error' } },
                        { tag: 'div', when: { ref: 'data.articles.status', operator: 'equals', value: 'ready' }, children: [
                                { tag: 'p', text: 'No articles found.', when: { ref: 'data.articles.result.items', operator: 'empty' } },
                                { tag: 'ul', children: [{ tag: 'li', key: 'result', repeat: { ref: 'data.articles.result.items', key: 'id' }, children: [
                                                { tag: 'a', bindings: { text: { ref: 'item.title' }, href: { ref: 'item.path' } } }
                                            ] }] }
                            ] }
                    ] }
            ] } };
}
