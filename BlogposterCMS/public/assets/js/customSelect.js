export default function enhanceSelects() {
  const selects = document.querySelectorAll('select[data-enhance="dropdown"]');
  selects.forEach(select => {
    if (select.dataset.enhanced) return;
    select.dataset.enhanced = 'true';

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select';

    const display = document.createElement('button');
    display.type = 'button';
    display.className = 'display';

    const updateDisplay = () => {
      const opt = select.options[select.selectedIndex];
      display.textContent = opt ? opt.textContent : '';
    };
    updateDisplay();

    const options = document.createElement('div');
    options.className = 'options';

    Array.from(select.options).forEach(option => {
      const opt = document.createElement('div');
      opt.className = 'option';
      opt.textContent = option.textContent;
      opt.dataset.value = option.value;
      if (option.disabled) opt.classList.add('disabled');
      opt.addEventListener('click', () => {
        if (option.disabled) return;
        select.value = option.value;
        updateDisplay();
        select.dispatchEvent(new Event('change'));
        wrapper.classList.remove('open');
      });
      options.appendChild(opt);
    });

    display.addEventListener('click', () => {
      wrapper.classList.toggle('open');
    });

    document.addEventListener('click', ev => {
      if (!wrapper.contains(ev.target)) wrapper.classList.remove('open');
    });

    wrapper.appendChild(display);
    wrapper.appendChild(options);
    select.after(wrapper);
    select.style.display = 'none';
  });
}

document.addEventListener('DOMContentLoaded', enhanceSelects);
