export function render(el){
  const categories = ['Pages','Media','Widgets','Menu'];
  const wrapper = document.createElement('div');
  wrapper.className = 'content-summary';
  categories.forEach(cat => {
    const section = document.createElement('div');
    section.className = 'summary-section';
    const title = document.createElement('h3');
    title.textContent = cat;
    const list = document.createElement('ul');
    list.className = 'summary-list';
    const empty = document.createElement('li');
    empty.textContent = 'No activity yet.';
    list.appendChild(empty);
    section.appendChild(title);
    section.appendChild(list);
    wrapper.appendChild(section);
  });
  el.innerHTML = '';
  el.appendChild(wrapper);
}