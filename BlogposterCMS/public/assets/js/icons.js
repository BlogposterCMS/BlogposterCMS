window.featherIcons = {
  home:            '/assets/icons/house.svg',
  setHome:         '/assets/icons/house.svg',
  edit:            '/assets/icons/pencil-line.svg',
  draft:           '/assets/icons/file-text.svg',
  published:       '/assets/icons/circle-check.svg',
  delete:          '/assets/icons/delete.svg',
  editSlug:        '/assets/icons/text-cursor-input.svg',
  pencil:          '/assets/icons/pencil.svg',
  share:           '/assets/icons/share.svg',
  bold:            '/assets/icons/bold.svg',
  italic:          '/assets/icons/italic.svg',
  underline:       '/assets/icons/underline.svg',
  'external-link': '/assets/icons/external-link.svg',
  'more-vertical': '/assets/icons/ellipsis-vertical.svg',
  'more-horizontal': '/assets/icons/ellipsis.svg'
};

window.featherIcon = function(name, extraClass = '') {
  const src = window.featherIcons[name] || `/assets/icons/${name}.svg`;
  return `<img class="icon ${extraClass}" src="${src}" alt="${name}" />`;
};
