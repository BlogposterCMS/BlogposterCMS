/** @jest-environment jsdom */
import { bindPageContentAction } from '../ui/shared/article/pageContentAction';
import { openArticle } from '../ui/shared/article/articleLoader';
import { openHtmlContentEditor } from '../ui/shared/article/htmlContentEditor';
jest.mock('../ui/shared/article/articleLoader', () => ({ openArticle: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../ui/shared/article/htmlContentEditor', () => ({ openHtmlContentEditor: jest.fn().mockResolvedValue(undefined) }));

test('the brush opens the matching content modal instead of page settings', async () => {
  for (const meta of [{ contentFormat: 'article-v1' }, { htmlFileName: 'import.html' }]) {
    window.meltdownEmit = jest.fn().mockResolvedValue({ id: 4, html: '<p>Body</p>', meta });
    const anchor = document.createElement('a'); anchor.href = '/admin/pages/edit/4'; document.body.append(anchor);
    const callback = jest.fn(); bindPageContentAction(anchor, 4, '/admin', callback);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true }); anchor.dispatchEvent(click);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(click.defaultPrevented).toBe(true);
    expect(meta.contentFormat ? openArticle : openHtmlContentEditor).toHaveBeenLastCalledWith(4, callback);
    anchor.remove();
  }
});
