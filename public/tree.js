const STORAGE_KEY = window.familyTreeClientStorage?.getActiveTreeKey() || 'familyTreeData';
const review = document.getElementById('treeReview');
const GENERATIONS_PER_PAGE = 10;
let visibleGenerationCount = GENERATIONS_PER_PAGE;
let loadedTreeData = null;

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

function getPrimaryPerson(treeData) {
  return treeData.people.find((person) => person.id === treeData.primaryPersonId) || treeData.people[0] || null;
}

function saveTreeData(treeData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(treeData));
    void window.familyTreeClientStorage?.removeTreeFromDatabase?.(STORAGE_KEY);
  } catch (error) {
    void window.familyTreeClientStorage?.saveTreeInDatabase?.(STORAGE_KEY, treeData);
  }
}

function buildGenerationData(treeData, peopleById, primaryPerson) {
  const parentToChildren = new Map();

  for (const family of treeData.families || []) {
    const parentIds = [family.husbandId, family.wifeId].filter((id) => id && peopleById.has(id));
    const childIds = (family.childrenIds || []).filter((id) => id && peopleById.has(id));

    for (const parentId of parentIds) {
      if (!parentToChildren.has(parentId)) parentToChildren.set(parentId, new Set());
      childIds.forEach((childId) => parentToChildren.get(parentId).add(childId));
    }

  }

  const generationByPerson = new Map();
  const queue = primaryPerson ? [{ id: primaryPerson.id, generation: 1 }] : [];

  while (queue.length) {
    const { id, generation } = queue.shift();
    const knownGeneration = generationByPerson.get(id);
    if (knownGeneration && knownGeneration <= generation) continue;

    generationByPerson.set(id, generation);
    for (const childId of parentToChildren.get(id) || []) {
      queue.push({ id: childId, generation: generation + 1 });
    }
  }

  return generationByPerson;
}

function renderFamilyGroup(family, index, generation, peopleById) {
  const parents = [family.husbandId, family.wifeId]
    .map((id) => peopleById.get(id))
    .filter(Boolean)
    .map((person) => escapeHtml(person.name || person.id));
  const children = (family.childrenIds || [])
    .map((id) => peopleById.get(id))
    .filter(Boolean)
    .map((person) => escapeHtml(person.name || person.id));

  return `
    <article class="tree-review-family">
      <h4>Family ${index + 1}</h4>
      <p><strong>Parents:</strong> ${parents.join(' and ') || 'Not recorded'}</p>
      <p><strong>Children:</strong> ${children.join(', ') || 'Not recorded'}</p>
    </article>
  `;
}

function renderGenerations(treeData, peopleById, families) {
  const primaryPerson = getPrimaryPerson(treeData);
  const generationByPerson = buildGenerationData(treeData, peopleById, primaryPerson);
  const maximumGeneration = Math.max(...generationByPerson.values(), 1);
  const displayedThrough = Math.min(visibleGenerationCount, maximumGeneration);
  const sections = [];

  for (let generation = 1; generation <= displayedThrough; generation += 1) {
    const familyRows = families
      .map((family, index) => ({ family, index }))
      .filter(({ family }) => (
        [family.husbandId, family.wifeId].some((id) => generationByPerson.get(id) === generation)
      ));
    const people = treeData.people.filter((person) => generationByPerson.get(person.id) === generation);

    sections.push(`
      <section class="tree-review-generation">
        <h3>Generation ${generation}</h3>
        <p class="muted">${people.length} person${people.length === 1 ? '' : 's'}</p>
        ${familyRows.length
          ? familyRows.map(({ family, index }) => renderFamilyGroup(family, index, generation, peopleById)).join('')
          : `<article class="tree-review-family"><p>${people.map((person) => escapeHtml(person.name || person.id)).join(' · ') || 'No connected family group recorded.'}</p></article>`}
      </section>
    `);
  }

  const loadMore = displayedThrough < maximumGeneration
    ? `<button class="btn-secondary" type="button" data-load-more-generations>Load next ${Math.min(GENERATIONS_PER_PAGE, maximumGeneration - displayedThrough)} generations</button>`
    : '';

  return `
    <section class="tree-review-list">
      <h2>Family tree</h2>
      <button class="btn-secondary" type="button" data-open-primary-person-picker>Choose starting person</button>
      <div id="primaryPersonPicker" hidden>
        <label for="primaryPerson">Start this tree with</label>
        <select id="primaryPerson" data-primary-person>
          ${treeData.people.map((person) => `<option value="${escapeHtml(person.id)}" ${person.id === primaryPerson?.id ? 'selected' : ''}>${escapeHtml(person.name || person.id)}</option>`).join('')}
        </select>
        <button class="btn-add" type="button" data-confirm-primary-person>Start tree with this person</button>
      </div>
      <p>Showing generations 1-${displayedThrough} of ${maximumGeneration}, starting with ${escapeHtml(primaryPerson?.name || 'the main person')}.</p>
      ${sections.join('')}
      ${loadMore}
    </section>
  `;
}

function renderTreeReview(treeData = loadedTreeData || getTreeData()) {
  loadedTreeData = treeData;
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
    ${renderGenerations(treeData, peopleById, families)}
  `;
}

review.addEventListener('click', (event) => {
  if (event.target.closest('[data-load-more-generations]')) {
    visibleGenerationCount += GENERATIONS_PER_PAGE;
    renderTreeReview();
    return;
  }

  if (event.target.closest('[data-open-primary-person-picker]')) {
    document.getElementById('primaryPersonPicker').hidden = false;
    document.getElementById('primaryPerson').focus();
    return;
  }

  if (event.target.closest('[data-confirm-primary-person]') && loadedTreeData) {
    loadedTreeData.primaryPersonId = document.getElementById('primaryPerson').value;
    visibleGenerationCount = GENERATIONS_PER_PAGE;
    saveTreeData(loadedTreeData);
    renderTreeReview();
  }
});

const storedTreeData = getTreeData();
if (storedTreeData?.people?.length) {
  renderTreeReview(storedTreeData);
} else if (window.familyTreeClientStorage?.loadTreeFromDatabase) {
  review.innerHTML = '<p class="empty-message">Opening your family tree...</p>';
  window.familyTreeClientStorage.loadTreeFromDatabase(STORAGE_KEY)
    .then((treeData) => renderTreeReview(treeData))
    .catch(() => renderTreeReview());
} else {
  renderTreeReview();
}
