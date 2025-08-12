async function initTopHeader() {
  const userLink = document.getElementById('user-link');
  const logoutIcon = document.getElementById('logout-icon');
  const searchToggle = document.getElementById('search-toggle');
  const searchContainer = document.querySelector('.search-container');
  const searchInput = document.getElementById('admin-search-input');

  if (userLink && !userLink.dataset.bound && window.ADMIN_TOKEN) {
    userLink.dataset.bound = 'true';
    try {
      const [, payload] = window.ADMIN_TOKEN.split('.');
      const decoded = JSON.parse(atob(payload));
      const id = decoded.userId || decoded.sub;
      if (id) {
        userLink.href = `/admin/settings/users/edit/${id}`;
      }
    } catch (err) {
      console.error('[TopHeader] token parse failed', err);
    }
  }

  if (logoutIcon && !logoutIcon.dataset.bound) {
    logoutIcon.dataset.bound = 'true';
    logoutIcon.addEventListener('click', () => {
      window.location.href = '/admin/logout';
    });
  }

  if (searchToggle && searchContainer && searchInput && !searchToggle.dataset.bound) {
    searchToggle.dataset.bound = 'true';
    searchToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      searchContainer.classList.toggle('open');
      if (searchContainer.classList.contains('open')) {
        searchInput.focus();
      } else {
        searchContainer.classList.remove('active');
      }
    });

    document.addEventListener('click', (e) => {
      if (!searchContainer.contains(e.target)) {
        searchContainer.classList.remove('open', 'active');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchContainer.classList.remove('open', 'active');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', initTopHeader);
document.addEventListener('top-header-loaded', initTopHeader);
