import { fetchPublicLoginStrategies } from './loginStrategiesPublicData.js';

export async function loadPublicLoginStrategies(): Promise<void> {
  const container = document.getElementById('publicLoginStrategies');
  if (!container || !window.meltdownEmit) return;

  try {
    const strategies = await fetchPublicLoginStrategies(window.meltdownEmit);

    if (!strategies.length) {
      container.style.display = 'none';
      return;
    }

    const label = document.createElement('div');
    label.className = 'strategy-label';
    label.textContent = 'Other login options:';
    container.appendChild(label);

    strategies.forEach(strat => {
      const btn = document.createElement('button');
      btn.className = 'oauth-button';
      btn.textContent = strat.name || '';
      btn.addEventListener('click', () => {
        alert(`${strat.name} login is not implemented in this demo.`);
      });
      container.appendChild(btn);
    });
  } catch (err) {
    console.error('[publicLoginStrategies] failed', err);
  }
}

void loadPublicLoginStrategies();
