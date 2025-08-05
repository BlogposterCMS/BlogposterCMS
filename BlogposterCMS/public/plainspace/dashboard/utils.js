async function fetchPartial(partialName, partialType = 'headers') {
  const base = '/apps/' + 'plainspace' + '/partials/';
  const response = await window.fetchWithTimeout(
    `${base}${partialType}/${partialName}.html`
  );
  if (!response.ok) {
    throw new Error(`Partial "${partialName}" (${partialType}) not found.`);
  }
  return await response.text();
}
  