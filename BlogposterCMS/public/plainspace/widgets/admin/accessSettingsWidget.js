export async function render(el) {
  const jwt = window.ADMIN_TOKEN;
  const meltdownEmit = window.meltdownEmit;

  if (!el) return;

  if (!jwt || typeof meltdownEmit !== 'function') {
    el.textContent = 'Unable to load access settings without an admin session.';
    return;
  }

  try {
    const [allowRegistrationRaw, firstInstallRaw] = await Promise.all([
      meltdownEmit('getSetting', {
        jwt,
        moduleName: 'settingsManager',
        moduleType: 'core',
        key: 'ALLOW_REGISTRATION'
      }),
      meltdownEmit('getSetting', {
        jwt,
        moduleName: 'settingsManager',
        moduleType: 'core',
        key: 'FIRST_INSTALL_DONE'
      })
    ]);

    const allowRegistration = String(allowRegistrationRaw).toLowerCase() === 'true';
    const firstInstallDone = String(firstInstallRaw).toLowerCase() === 'true';

    const card = document.createElement('div');
    card.className = 'access-settings-card page-list-card';

    const titleBar = document.createElement('div');
    titleBar.className = 'access-settings-title-bar page-title-bar';

    const title = document.createElement('div');
    title.className = 'access-settings-title page-title';
    title.textContent = 'Access Control';

    const badge = document.createElement('span');
    badge.className = 'access-settings-badge';
    badge.textContent = firstInstallDone ? 'First install complete' : 'Initial setup pending';
    badge.dataset.state = firstInstallDone ? 'ok' : 'pending';

    titleBar.appendChild(title);
    titleBar.appendChild(badge);
    card.appendChild(titleBar);

    const section = document.createElement('div');
    section.className = 'settings-section';

    const toggleWrapper = document.createElement('div');
    toggleWrapper.className = 'access-settings-toggle';

    const toggleId = 'access-allow-registration';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.id = toggleId;
    toggleInput.checked = allowRegistration;

    const toggleLabel = document.createElement('label');
    toggleLabel.setAttribute('for', toggleId);
    toggleLabel.textContent = 'Allow public registration';

    toggleWrapper.appendChild(toggleInput);
    toggleWrapper.appendChild(toggleLabel);

    const toggleHint = document.createElement('div');
    toggleHint.className = 'settings-hint';
    toggleHint.textContent = 'When disabled, only administrators can add new users from the Users page.';

    const status = document.createElement('div');
    status.className = 'access-settings-status';
    status.textContent = '';

    toggleInput.addEventListener('change', async () => {
      toggleInput.disabled = true;
      status.textContent = 'Saving…';
      try {
        await meltdownEmit('setSetting', {
          jwt,
          moduleName: 'settingsManager',
          moduleType: 'core',
          key: 'ALLOW_REGISTRATION',
          value: toggleInput.checked ? 'true' : 'false'
        });
        status.textContent = toggleInput.checked ? 'Public registration enabled.' : 'Public registration disabled.';
      } catch (err) {
        status.textContent = 'Failed to update registration setting.';
        console.error('[accessSettings] setSetting failed', err);
        toggleInput.checked = !toggleInput.checked;
      } finally {
        toggleInput.disabled = false;
      }
    });

    const installNote = document.createElement('div');
    installNote.className = 'settings-hint';
    installNote.textContent = firstInstallDone
      ? 'First-time registration is closed. Toggle the switch to temporarily reopen public sign-ups.'
      : 'The first administrator can still register even if the toggle is off. After installation, only enabled registration allows new public accounts.';

    const tipsTitle = document.createElement('h4');
    tipsTitle.className = 'access-settings-subtitle';
    tipsTitle.textContent = 'Security recommendations';

    const tipsList = document.createElement('ul');
    tipsList.className = 'access-settings-tips';

    const tips = [
      'Review config/security.js to tune brute-force protection for login attempts.',
      'Keep registration closed unless you are actively onboarding new members.',
      'Enable external authentication strategies only when you trust the provider.'
    ];

    tips.forEach(text => {
      const li = document.createElement('li');
      li.textContent = text;
      tipsList.appendChild(li);
    });

    section.appendChild(toggleWrapper);
    section.appendChild(toggleHint);
    section.appendChild(status);
    section.appendChild(installNote);
    section.appendChild(tipsTitle);
    section.appendChild(tipsList);

    card.appendChild(section);

    el.innerHTML = '';
    el.appendChild(card);
  } catch (err) {
    console.error('[accessSettings] render failed', err);
    el.innerHTML = '';
    const error = document.createElement('div');
    error.className = 'error';
    error.textContent = `Failed to load access settings: ${err.message}`;
    el.appendChild(error);
  }
}
