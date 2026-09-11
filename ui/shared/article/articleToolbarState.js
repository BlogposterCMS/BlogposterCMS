/** Ask the schema/history state, rather than guessing from selection text or disabling every empty selection. */
export function articleCommandAvailable(editor, label) {
    if (editor.isDestroyed || !editor.isEditable)
        return false;
    const can = editor.can();
    switch (label) {
        case 'Bold': return can.toggleBold();
        case 'Italic': return can.toggleItalic();
        case 'Underline': return can.toggleUnderline();
        case 'Bullet list': return can.toggleBulletList();
        case 'Numbered list': return can.toggleOrderedList();
        case 'Quote': return can.toggleBlockquote();
        case 'Code block': return can.toggleCodeBlock();
        case 'Undo': return can.undo();
        case 'Redo': return can.redo();
        case 'Media description': return editor.isActive('image') || editor.isActive('video');
        case 'Edit link': return (!editor.state.selection.empty || editor.isActive('link')) && can.setLink({ href: '/' });
        case 'Insert image': return can.setImage({ src: '/media-placeholder' });
        case 'Insert video': return can.insertContent({ type: 'video', attrs: { src: '/media-placeholder' } });
        case 'Table actions': return editor.isActive('table') || can.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
        case 'Add row': return can.addRowAfter();
        case 'Add column': return can.addColumnAfter();
        case 'Delete row': return can.deleteRow();
        case 'Delete column': return can.deleteColumn();
        case 'Delete table': return can.deleteTable();
        case 'Insert table': return can.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
        default: return false;
    }
}
export function mountArticleToolbarState(editor, toolbar, busy) {
    const refresh = () => {
        for (const button of toolbar.querySelectorAll('button[aria-label]'))
            button.disabled = busy() || !articleCommandAvailable(editor, button.getAttribute('aria-label') || '');
        const block = toolbar.querySelector('select');
        if (block) {
            for (const option of block.options)
                option.disabled = busy() || !(option.value === 'p' ? editor.can().setParagraph() : editor.can().toggleHeading({ level: Number(option.value) }));
            block.disabled = busy() || [...block.options].every(option => option.disabled);
        }
    };
    editor.on('transaction', refresh);
    refresh();
    return { refresh, read: () => [...toolbar.querySelectorAll('button[aria-label]')].map(button => ({ label: button.getAttribute('aria-label'), available: !button.disabled })) };
}
