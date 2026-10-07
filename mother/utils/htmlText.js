'use strict';

const { Parser } = require('htmlparser2');

/** Search excerpts are text: parse markup instead of treating regexes as HTML. */
function htmlText(value = '') {
  const pieces = [];
  let ignored = 0;
  const parser = new Parser({
    onopentag(name) {
      if (ignored || name === 'script' || name === 'style') ignored++;
      else pieces.push(' ');
    },
    ontext(text) { if (!ignored) pieces.push(text); },
    onclosetag() { if (ignored) ignored--; else pieces.push(' '); }
  }, { decodeEntities: true });
  parser.end(String(value || ''));
  return pieces.join('').replace(/\s+/g, ' ').trim();
}

module.exports = { htmlText };
