const STORAGE_KEY = window.familyTreeClientStorage?.getActiveTreeKey() || 'familyTreeData';
const review = document.getElementById('treeReview');

function getTreeData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character]));
}

function renderTreeReview() {
  const treeData = getTreeData();
  if (!treeData?.people?.length) {
    review.innerHTML = `
      <section class="tree-review-summary">
        <h2>Upload your family file first</h2>
        <p>Choose a GEDCOM file to create a family tree for review.</p>
        <a class="btn-add" href="/?start=upload">Upload Your Family File</a>
      </section>
    `;
    return;
  }
  const errors = treeData.validationReport?.errors || [];
  const duplicateWarnings = (treeData.validationReport?.warnings || []).filter((issue) => issue.autoFix?.type === 'mergeDuplicatePeople');
  const issueCount = errors.length + duplicateWarnings.length;
  const peopleById = new Map(treeData.people.map((person) => [person.id, person]));
  const families = treeData.families || [];

  review.innerHTML = `
    <section class="tree-review-summary">
      <div class="tree-summary">
        <span><strong>${treeData.people.length}</strong> people</span>
        <span><strong>${families.length}</strong> families</span>
        <span><strong>${treeData.relationships?.length || 0}</strong> relationships</span>
      </div>
      <h2>${issueCount} error${issueCount === 1 ? '' : 's'} to fix</h2>
      <p>Fixing these items helps make your family tree more complete and reliable.</p>
      <a class="btn-add" href="errors.html">Fix errors in batches of 10</a>
    </section>
    <section class="tree-review-list">
      <h2>Family groups</h2>
      ${families.length ? families.map((family, index) => {
        const members = [family.husbandId, family.wifeId, ...(family.childrenIds || [])]
          .map((id) => peopleById.get(id))
          .filter(Boolean)
          .map((person) => escapeHtml(person.name || person.id));
        return `<article class="tree-review-family"><h3>Family ${index + 1}</h3><p>${members.join(' · ') || 'No connected people recorded.'}</p></article>`;
      }).join('') : `<article class="tree-review-family"><h3>People in your tree</h3><p>${treeData.people.map((person) => escapeHtml(person.name || person.id)).join(' · ')}</p></article>`}
    </section>
  `;
}

renderTreeReview();
