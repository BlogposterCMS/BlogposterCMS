'use strict';

function validateNavigationTitles(meta) {
  if (!meta || !Object.hasOwn(meta, 'navigationTitles')) return;
  const titles = meta.navigationTitles;
  if (!titles || typeof titles !== 'object' || Array.isArray(titles) || Object.keys(titles).length > 60
    || Object.entries(titles).some(([locale, title]) => !/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/.test(locale)
      || locale.length > 35 || typeof title !== 'string' || title.length > 120)) {
    throw Object.assign(new Error('PAGE_NAVIGATION_TITLE_INVALID: Use locale keys and titles of at most 120 characters.'), { code: 'PAGE_NAVIGATION_TITLE_INVALID' });
  }
}
module.exports = { validateNavigationTitles };
