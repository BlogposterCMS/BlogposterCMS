/** Inspector input can be ahead of its change handler while a person is typing.
 * Read those existing fields as part of the revision, without owning or writing them.
 */
export function readDesignerDraftInputs(root = document) {
    const selector = '#layoutNameInput, #sceneInspector input, #sceneInspector textarea, #sceneInspector select, .scene-section-title-input';
    return Array.from(root.querySelectorAll(selector))
        .filter(input => !['password', 'file', 'hidden'].includes(input.type))
        .map((input, index) => ({
        id: input.id || input.name || `${input.className}:${index}`,
        value: input instanceof HTMLInputElement && ['checkbox', 'radio'].includes(input.type) ? input.checked : input.value,
        disabled: input.disabled
    }));
}
