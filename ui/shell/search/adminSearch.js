import { adminSearchDisabledPlaceholder, errorMessage, fetchAdminSearchPages } from './adminSearchData.js';
import { setSearchExpanded } from './searchExpansion.js';
function escapeHtml(value) {
    const span = document.createElement('span');
    span.textContent = String(value ?? '');
    return span.innerHTML;
}
export function initAdminSearch() {
    const input = document.getElementById('admin-search-input');
    const results = document.getElementById('admin-search-results');
    const container = document.querySelector('.search-container');
    if (!input || !results || !container)
        return;
    const searchInput = input;
    const resultsList = results;
    const searchContainer = container;
    if (!window.ADMIN_TOKEN) {
        searchInput.disabled = true;
        searchInput.placeholder = 'Login required';
        return;
    }
    let timer;
    let disabled = false;
    async function performSearch() {
        const q = searchInput.value.trim();
        if (!q) {
            resultsList.innerHTML = '';
            resultsList.parentElement?.classList.remove('active');
            return;
        }
        try {
            const pages = await fetchAdminSearchPages(window.meltdownEmit, window.ADMIN_TOKEN, q);
            if (pages.length) {
                resultsList.innerHTML = pages
                    .map(p => `<li data-id="${escapeHtml(p.id)}" data-slug="${escapeHtml(p.slug)}" data-lane="${escapeHtml(p.lane)}">${escapeHtml(p.title || p.slug)}</li>`)
                    .join('');
            }
            else {
                resultsList.innerHTML = '<li class="no-results">No results</li>';
            }
            resultsList.parentElement?.classList.add('active');
        }
        catch (err) {
            const placeholder = adminSearchDisabledPlaceholder(err);
            if (placeholder) {
                searchInput.disabled = true;
                searchInput.placeholder = placeholder;
                disabled = true;
            }
            console.error(`Admin search failed: ${errorMessage(err)}`, err);
        }
    }
    searchInput.addEventListener('input', () => {
        if (disabled)
            return;
        if (timer)
            clearTimeout(timer);
        setSearchExpanded(searchContainer, searchInput, true);
        timer = setTimeout(() => {
            void performSearch();
        }, 300);
    });
    searchInput.addEventListener('focus', () => {
        if (!disabled)
            setSearchExpanded(searchContainer, searchInput, true);
    });
    resultsList.addEventListener('click', e => {
        const target = e.target;
        if (target instanceof HTMLElement && target.tagName === 'LI') {
            const id = target.dataset.id;
            window.location.href = `/admin/pages/edit/${id}`;
            resultsList.parentElement?.classList.remove('active');
            setSearchExpanded(searchContainer, searchInput, false);
        }
    });
    document.addEventListener('click', e => {
        if (e.target instanceof Node && !searchContainer.contains(e.target)) {
            resultsList.parentElement?.classList.remove('active');
            setSearchExpanded(searchContainer, searchInput, false);
        }
    });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminSearch);
}
else {
    initAdminSearch();
}
