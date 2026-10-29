import { Node, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import UniqueID from '@tiptap/extension-unique-id';

export function safeArticleUrl(value: unknown, link = false): boolean {
  return typeof value === 'string' && !/[\s\\\u0000-\u001f]/.test(value) &&
    (/^(https?:\/\/|\/(?!\/))/i.test(value) || (link && /^(mailto:|tel:|#)/i.test(value)));
}

const Video = Node.create({
  name: 'video', group: 'block', atom: true,
  addAttributes: () => ({ src: { default: null }, title: { default: '' } }),
  parseHTML: () => [{ tag: 'video[src]', getAttrs: element => safeArticleUrl((element as HTMLElement).getAttribute('src')) ? null : false }],
  renderHTML: ({ HTMLAttributes }) => ['video', { ...HTMLAttributes, controls: '', preload: 'metadata' }]
});

export function articleExtensions() {
  return [StarterKit.configure({ link: { openOnClick: false, autolink: true, isAllowedUri: url => safeArticleUrl(url, true) } }),
    Image.configure({ allowBase64: false }), Video, TableKit,
    UniqueID.configure({ attributeName: 'block-id', types: ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'codeBlock', 'image', 'video', 'table', 'horizontalRule'] })];
}

/** Validate agent JSON before handing it to the schema; no arbitrary embeds/HTML. */
export function validateArticleDocument(value: unknown): asserts value is JSONContent {
  const allowed = new Set(['doc', 'text', 'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'codeBlock', 'hardBreak', 'horizontalRule', 'image', 'video', 'table', 'tableRow', 'tableCell', 'tableHeader']);
  const marks = new Set(['bold', 'italic', 'strike', 'underline', 'code', 'link']);
  let count = 0;
  function walk(node: any, depth: number) {
    if (++count > 20000 || depth > 40 || !node || !allowed.has(node.type)) throw new Error('ARTICLE_DOCUMENT_INVALID');
    if ((node.content != null && !Array.isArray(node.content)) || (node.marks != null && !Array.isArray(node.marks))) throw new Error('ARTICLE_DOCUMENT_INVALID');
    if (['image', 'video'].includes(node.type) && !safeArticleUrl(node.attrs?.src)) throw new Error('ARTICLE_MEDIA_URL_INVALID');
    for (const mark of node.marks || []) {
      if (!marks.has(mark.type)) throw new Error('ARTICLE_MARK_INVALID');
      if (mark.type === 'link' && !safeArticleUrl(mark.attrs?.href, true)) throw new Error('ARTICLE_LINK_INVALID');
    }
    for (const child of node.content || []) walk(child, depth + 1);
  }
  if (!value || (value as JSONContent).type !== 'doc') throw new Error('ARTICLE_DOCUMENT_INVALID');
  if (JSON.stringify(value).length > 2000000) throw new Error('ARTICLE_DOCUMENT_TOO_LARGE');
  walk(value, 0);
}

export function cleanArticleHtml(html: string): string {
  const template = document.createElement('template'); template.innerHTML = html;
  template.content.querySelectorAll('script,style,iframe,object,embed,form,input,button').forEach(el => el.remove());
  template.content.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || ['style', 'srcset'].includes(attr.name) ||
        (['src', 'href', 'poster'].includes(attr.name) && !safeArticleUrl(attr.value, attr.name === 'href'))) el.removeAttribute(attr.name);
    }
  });
  return template.innerHTML;
}
