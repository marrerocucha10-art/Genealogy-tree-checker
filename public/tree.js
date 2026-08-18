const STORAGE_KEY = window.familyTreeClientStorage?.getActiveTreeKey() || 'familyTreeData';
const review = document.getElementById('treeReview');
const GENERATIONS_PER_PAGE = 5;
let visibleGenerationCount = GENERATIONS_PER_PAGE;
let loadedTreeData = null;
let matchingPrimaryPersonIds = [];

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

function normalizePersonSearch(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function getMatchingPeople(query = '') {
  if (!loadedTreeData) return [];
  const normalizedQuery = normalizePersonSearch(query);
  if (!normalizedQuery) return [];

  const queryWords = String(query)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  return loadedTreeData.people.filter((person) => {
    const name = [person.name || person.id, ...(person.aliases || [])].join(' ');
    const normalizedName = normalizePersonSearch(name);
    const normalizedId = normalizePersonSearch(person.id);
    if (normalizedName.includes(normalizedQuery) || normalizedId.includes(normalizedQuery)) return true;

    const normalizedWords = name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    return queryWords.every((word) => normalizedWords.some((nameWord) => nameWord.includes(word)));
  });
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
  const childToParents = new Map();

  for (const family of treeData.families || []) {
    const parentIds = [family.husbandId, family.wifeId].filter((id) => id && peopleById.has(id));
    const childIds = (family.childrenIds || []).filter((id) => id && peopleById.has(id));

    for (const childId of childIds) {
      if (!childToParents.has(childId)) childToParents.set(childId, new Set());
      parentIds.forEach((parentId) => childToParents.get(childId).add(parentId));
    }

  }

  const generationByPerson = new Map();
  const queue = primaryPerson ? [{ id: primaryPerson.id, generation: 1 }] : [];

  while (queue.length) {
    const { id, generation } = queue.shift();
    const knownGeneration = generationByPerson.get(id);
    if (knownGeneration && knownGeneration <= generation) continue;

    generationByPerson.set(id, generation);
    for (const parentId of childToParents.get(id) || []) {
      queue.push({ id: parentId, generation: generation + 1 });
    }
  }

  return generationByPerson;
}

function getPeopleNames(ids, peopleById) {
  return ids
    .map((id) => peopleById.get(id))
    .filter(Boolean)
    .map((person) => escapeHtml(person.name || person.id));
}

function renderPersonCard(person, families, peopleById, isStartingPerson = false) {
  const parentFamilies = families.filter((family) => (family.childrenIds || []).includes(person.id));
  const spouseFamilies = families.filter((family) => family.husbandId === person.id || family.wifeId === person.id);
  const parentIds = parentFamilies.flatMap((family) => [family.husbandId, family.wifeId]).filter(Boolean);
  const spouseIds = spouseFamilies.map((family) => (
    family.husbandId === person.id ? family.wifeId : family.husbandId
  )).filter(Boolean);
  const childIds = spouseFamilies.flatMap((family) => family.childrenIds || []);
  const parents = getPeopleNames([...new Set(parentIds)], peopleById);
  const spouses = getPeopleNames([...new Set(spouseIds)], peopleById);
  const children = getPeopleNames([...new Set(childIds)], peopleById);

  return `
    <article class="tree-review-person ${isStartingPerson ? 'selected-tree-person' : ''}">
      <h4>${escapeHtml(person.name || person.id)}</h4>
      ${isStartingPerson ? '<p><strong>Your starting person</strong></p>' : ''}
      <p><strong>Parents:</strong> ${parents.join(' and ') || 'Not recorded'}</p>
      <p><strong>Spouse:</strong> ${spouses.join(' and ') || 'Not recorded'}</p>
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
    const people = treeData.people.filter((person) => generationByPerson.get(person.id) === generation);

    sections.push(`
      <section class="tree-review-generation ancestry-generation">
        <div class="ancestry-generation-heading">
          <h3>${generation === 1 ? 'Starting person' : `Ancestor generation ${generation - 1}`}</h3>
          <p class="muted">${people.length} person${people.length === 1 ? '' : 's'}</p>
        </div>
        <div class="ancestry-people">
          ${people.length
            ? people.map((person) => renderPersonCard(person, families, peopleById, person.id === primaryPerson?.id)).join('')
            : '<p class="muted">No people recorded in this generation.</p>'}
        </div>
      </section>
    `);
  }

  const loadMore = displayedThrough < maximumGeneration
    ? `<button class="btn-secondary" type="button" data-load-more-generations>View ${Math.min(GENERATIONS_PER_PAGE, maximumGeneration - displayedThrough)} more generations</button>`
    : '';

  return `
    <section class="tree-review-list">
      <h2>Family tree</h2>
      <button class="btn-secondary" type="button" data-open-primary-person-picker>Choose starting person</button>
      <div id="primaryPersonPicker" hidden>
        <label for="primaryPerson">Start this tree with</label>
        <input id="primaryPerson" type="search" placeholder="Type a person's name" autocomplete="off">
        <div id="primaryPersonMatches" class="primary-person-matches" aria-live="polite"></div>
        <button class="btn-add" type="button" data-confirm-primary-person>Start tree with first matching person</button>
      </div>
      <p>Showing ${displayedThrough} of ${maximumGeneration} ancestry generations, starting with ${escapeHtml(primaryPerson?.name || 'the main person')}.</p>
      <div class="tree-next-step">
        ${loadMore}
        <a class="btn-add" href="errors.html">Continue to Fixing Errors</a>
      </div>
      <div class="ancestry-tree" aria-label="Family ancestry tree">
        ${sections.join('')}
      </div>
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
    </section>
    ${renderGenerations(treeData, peopleById, families)}
  `;
}

function renderPrimaryPersonMatches(query = '') {
  const matches = document.getElementById('primaryPersonMatches');
  if (!matches || !loadedTreeData) return;

  const normalizedQuery = normalizePersonSearch(query);
  if (!normalizedQuery) {
    matchingPrimaryPersonIds = [];
    matches.innerHTML = '<p class="muted">Type a name to see matching people.</p>';
    return;
  }

  const people = getMatchingPeople(query).slice(0, 10);
  matchingPrimaryPersonIds = people.map((person) => person.id);

  matches.innerHTML = people.length
    ? people.map((person) => `
      <button type="button" class="primary-person-match" data-select-primary-person="${escapeHtml(person.id)}">
        ${escapeHtml(person.name || person.id)}
      </button>
    `).join('')
    : '<p class="muted">No matching people found.</p>';
}

function setPrimaryPerson(personId) {
  if (!loadedTreeData) return;
  loadedTreeData.primaryPersonId = personId;
  visibleGenerationCount = GENERATIONS_PER_PAGE;
  saveTreeData(loadedTreeData);
  renderTreeReview();
}

review.addEventListener('click', (event) => {
  if (event.target.closest('[data-load-more-generations]')) {
    visibleGenerationCount += GENERATIONS_PER_PAGE;
    renderTreeReview();
    return;
  }

  if (event.target.closest('[data-open-primary-person-picker]')) {
    document.getElementById('primaryPersonPicker').hidden = false;
    const primaryPersonInput = document.getElementById('primaryPerson');
    primaryPersonInput.value = '';
    primaryPersonInput.focus();
    renderPrimaryPersonMatches();
    return;
  }

  const selectedPerson = event.target.closest('[data-select-primary-person]');
  if (selectedPerson) {
    setPrimaryPerson(selectedPerson.dataset.selectPrimaryPerson);
    return;
  }

  if (event.target.closest('[data-confirm-primary-person]') && loadedTreeData) {
    const typedMatch = getMatchingPeople(document.getElementById('primaryPerson').value)[0];
    const selectedPersonId = typedMatch?.id || matchingPrimaryPersonIds[0];
    if (!selectedPersonId) {
      document.getElementById('primaryPersonPicker').hidden = false;
      renderPrimaryPersonMatches(document.getElementById('primaryPerson').value);
      return;
    }
    setPrimaryPerson(selectedPersonId);
  }
});

function updatePrimaryPersonMatches(event) {
  if (event.target.id === 'primaryPerson') renderPrimaryPersonMatches(event.target.value);
}

review.addEventListener('input', updatePrimaryPersonMatches);
review.addEventListener('change', updatePrimaryPersonMatches);
review.addEventListener('keyup', updatePrimaryPersonMatches);
review.addEventListener('search', updatePrimaryPersonMatches);

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
