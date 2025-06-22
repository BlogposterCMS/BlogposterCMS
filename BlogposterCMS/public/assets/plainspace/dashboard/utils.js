// public/assets/plainspace/dashboard/utils.js
async function fetchPartial(partialName, partialType = 'headers') {
  const response = await window.fetchWithTimeout(`/assets/partials/${partialType}/${partialName}.html`);
    if (!response.ok) {
      throw new Error(`Partial "${partialName}" (${partialType}) not found.`);
    }
    return await response.text();
  }
  