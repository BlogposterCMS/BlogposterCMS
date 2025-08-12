export default function initNotificationHub() {
  const logo = document.querySelector('.main-header .logo');
  if (!logo || logo.dataset.bound) return;
  logo.dataset.bound = 'true';

  const hub = document.getElementById('notification-hub');
  if (!hub) return;
  const list = hub.querySelector('ul');

  async function loadNotifications() {
    try {
      const data = await window.meltdownEmit('getRecentNotifications', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'notificationManager',
        moduleType: 'core',
        limit: 5
      });
      list.innerHTML = '';
      (data || []).forEach(n => {
        const li = document.createElement('li');
        li.className = `priority-${n.priority}`;
        const title = document.createElement('strong');
        title.className = 'title';
        title.textContent = `${n.moduleName} ${new Date(n.timestamp).toLocaleString()}`;
        const msg = document.createElement('span');
        msg.className = 'msg';
        msg.textContent = n.message;
        li.appendChild(title);
        li.appendChild(msg);
        list.appendChild(li);
      });
    } catch (err) {
      console.error('[NotificationHub] load error', err);
    }
  }

  logo.addEventListener('click', async (e) => {
    e.preventDefault();
    hub.classList.toggle('open');
    hub.hidden = !hub.classList.contains('open');
    if (hub.classList.contains('open')) {
      await loadNotifications();
    }
  });

  document.addEventListener('click', (e) => {
    if (!hub.contains(e.target) && !logo.contains(e.target)) {
      hub.classList.remove('open');
      hub.hidden = true;
    }
  });
}

document.addEventListener('DOMContentLoaded', initNotificationHub);
document.addEventListener('main-header-loaded', initNotificationHub);
