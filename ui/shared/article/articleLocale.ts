import type { JSONContent } from '@tiptap/core';

export type ArticleLocaleProgress = { sourceLanguage: string; translatedBlockIds: string[]; removedBlockIds: string[]; titleTranslated: boolean };
const id = (node: JSONContent) => String(node.attrs?.['block-id'] || '');
// Editor-generated ids on nested paragraphs are structural, not translated content.
const fingerprint = (node: JSONContent) => JSON.stringify(node, (key, value) => key === 'block-id' ? undefined : value);

/** Existing rich text already has stable ids. Legacy source blocks get deterministic read-only ids until explicitly saved. */
export function stableSourceBlocks(document: JSONContent): JSONContent {
  const hash = (text: string) => { let value = 2166136261; for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619); return (value >>> 0).toString(36); };
  return { ...document, content: (document.content || []).map((node, index) => ({ ...node, attrs: { ...node.attrs,
    'block-id': id(node) || `source-${index}-${hash(fingerprint(node))}` } })) };
}

/** Only translation progress is metadata; the existing translated HTML remains the content authority. */
export function createArticleLocale(sourceDocument: JSONContent, targetDocument: JSONContent | null, progress?: Partial<ArticleLocaleProgress>) {
  const source = stableSourceBlocks(sourceDocument);
  const sourceById = new Map((source.content || []).map(node => [id(node), node]));
  // An older complete translation without progress metadata remains a complete translation.
  const translated = new Set(progress?.translatedBlockIds || (targetDocument?.content || []).map(id).filter(Boolean));
  const removed = new Set(progress?.removedBlockIds || []);
  const target = targetDocument?.content || [];
  const content = targetDocument && !progress ? target : (source.content || []).filter(node => !removed.has(id(node))).map(node => {
    const stored = target.find(candidate => id(candidate) === id(node));
    return translated.has(id(node)) && stored ? stored : node;
  });
  for (const node of target) if (id(node) && !sourceById.has(id(node)) && !content.includes(node)) content.push(node);
  const isFallback = (node: JSONContent) => !translated.has(id(node)) && sourceById.has(id(node)) && fingerprint(sourceById.get(id(node))!) === fingerprint(node);
  return {
    document: { type: 'doc', content } as JSONContent,
    isFallback,
    markTranslated(blockId: string) { translated.add(blockId); },
    progress(document: JSONContent, sourceLanguage: string, titleTranslated: boolean): ArticleLocaleProgress {
      const nodes = document.content || [];
      return { sourceLanguage, titleTranslated,
        translatedBlockIds: nodes.filter(node => !isFallback(node)).map(id).filter(Boolean),
        removedBlockIds: [...sourceById.keys()].filter(key => !nodes.some(node => id(node) === key)) };
    }
  };
}
