const WORKSPACE_PREVIEW_MODE = new URLSearchParams(window.location.search).get('demo') === 'workspace';
const IS_ADMINISTRATION_REVIEW = isAdministrationReview();
const IS_ADMINISTRATION_WORKSPACE = isAdministrationReviewWorkspace();
const STORAGE_KEY = WORKSPACE_PREVIEW_MODE
  ? 'familyTreeWorkspacePreviewData'
  : IS_ADMINISTRATION_WORKSPACE
    ? 'familyTreeAdministrationReviewData'
    : window.familyTreeClientStorage?.getActiveTreeKey() || 'familyTreeData';
if (IS_ADMINISTRATION_WORKSPACE) {
  window.familyTreeClientStorage?.seedAdministrationReviewTree?.(STORAGE_KEY);
}
const review = document.getElementById('treeReview');
const GENERATIONS_PER_PAGE = 5;
let visibleGenerationCount = GENERATIONS_PER_PAGE;
let loadedTreeData = null;
let matchingPrimaryPersonIds = [];
const requestedFocusPersonId = new URLSearchParams(window.location.search).get('focus') || '';
const errorWorkspaceUrl = WORKSPACE_PREVIEW_MODE
  ? 'errors.html?demo=workspace'
  : IS_ADMINISTRATION_WORKSPACE
    ? 'errors.html?admin_review=true'
    : 'errors.html';
const workspaceProgressUrl = WORKSPACE_PREVIEW_MODE
  ? 'errors.html?demo=workspace&view=progress#progressReports'
  : IS_ADMINISTRATION_REVIEW
    ? 'errors.html?admin_review=true&view=progress#progressReports'
    : 'errors.html?view=progress#progressReports';
const FIVE_GENERATION_REVIEW_STORAGE_KEY = `${STORAGE_KEY}:fiveGenerationReview`;
const ERROR_REVIEW_HANDOFF_KEY = `${FIVE_GENERATION_REVIEW_STORAGE_KEY}:errorReviewHandoff`;

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
  return treeData.people.find((person) => person.id === requestedFocusPersonId)
    || treeData.people.find((person) => person.id === treeData.primaryPersonId)
    || treeData.people[0]
    || null;
}

function restoreDefaultStartingPerson(treeData) {
  if (treeData?.primaryPersonSelectionMode !== 'automatic') return;
  treeData.primaryPersonId = treeData.people[0]?.id || '';
  treeData.primaryPersonSelectionMode = 'manual';
  delete treeData.directLineSelectionVersion;
  saveTreeData(treeData);
}

function saveTreeData(treeData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(treeData));
    void window.familyTreeClientStorage?.removeTreeFromDatabase?.(STORAGE_KEY);
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
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

function createFiveGenerationReviewTree(treeData) {
  const primaryPerson = getPrimaryPerson(treeData);
  const peopleById = new Map((treeData.people || []).map((person) => [person.id, person]));
  const generationByPerson = buildGenerationData(treeData, peopleById, primaryPerson);
  const includedPersonIds = new Set(
    [...generationByPerson.entries()]
      .filter(([, generation]) => generation <= GENERATIONS_PER_PAGE)
      .map(([personId]) => personId),
  );

  // Generations are counted upward through parents, so a spouse, child or
  // sibling of someone in these five generations was left out and their errors
  // disappeared from the review. Keep each included person's immediate family.
  for (const family of treeData.families || []) {
    const memberIds = [family.husbandId, family.wifeId, ...(family.childrenIds || [])]
      .filter((id) => id && peopleById.has(id));
    if (!memberIds.some((id) => includedPersonIds.has(id))) continue;
    memberIds.forEach((id) => includedPersonIds.add(id));
  }

  // Records with no family links at all, such as unmatched duplicates, still
  // carry errors the customer needs to see.
  const linkedPersonIds = new Set(
    (treeData.families || []).flatMap((family) => [family.husbandId, family.wifeId, ...(family.childrenIds || [])])
      .filter(Boolean),
  );
  for (const person of treeData.people || []) {
    if (!linkedPersonIds.has(person.id)) includedPersonIds.add(person.id);
  }

  const includesPerson = (personId) => personId && includedPersonIds.has(personId);

  // A duplicate names two or three records at once. If any of them fell outside
  // these five generations the merge had nothing to compare and its button did
  // nothing at all, so every record a retained duplicate refers to is kept.
  const duplicateIssues = [
    ...(treeData.validationReport?.errors || []),
    ...(treeData.validationReport?.warnings || []),
  ].filter((issue) => issue.autoFix?.type === 'mergeDuplicatePeople');
  for (const issue of duplicateIssues) {
    const memberIds = [issue.subject, issue.autoFix.survivorId, ...(issue.autoFix.duplicateIds || [])]
      .filter((id) => id && peopleById.has(id));
    if (!memberIds.some((id) => includedPersonIds.has(id))) continue;
    memberIds.forEach((id) => includedPersonIds.add(id));
  }

  const families = (treeData.families || [])
    .filter((family) => [family.husbandId, family.wifeId, ...(family.childrenIds || [])].some(includesPerson))
    .map((family) => ({
      ...family,
      husbandId: includesPerson(family.husbandId) ? family.husbandId : null,
      wifeId: includesPerson(family.wifeId) ? family.wifeId : null,
      childrenIds: (family.childrenIds || []).filter(includesPerson),
    }));

  const includedFamilyIds = new Set(families.map((family) => family.id).filter(Boolean));
  const includesSubject = (subject) => includesPerson(subject) || Boolean(subject && includedFamilyIds.has(subject));
  const reviewIssues = (issues = []) => issues.filter((issue) => includesSubject(issue.subject));

  return {
    people: (treeData.people || []).filter((person) => includedPersonIds.has(person.id)),
    families,
    relationships: [],
    primaryPersonId: primaryPerson?.id || '',
    primaryPersonSelectionMode: 'manual',
    validationReport: {
      errors: reviewIssues(treeData.validationReport?.errors),
      warnings: reviewIssues(treeData.validationReport?.warnings),
      info: [],
    },
  };
}

function getPeopleNames(ids, peopleById) {
  return ids
    .map((id) => peopleById.get(id))
    .filter(Boolean)
    .map((person) => escapeHtml(person.name || person.id));
}

function buildFamilyConnections(families, peopleById) {
  const connections = new Map();
  const getConnections = (personId) => {
    if (!connections.has(personId)) {
      connections.set(personId, { parents: new Set(), spouses: new Set(), children: new Set() });
    }
    return connections.get(personId);
  };

  for (const family of families) {
    const parentIds = [family.husbandId, family.wifeId].filter((id) => peopleById.has(id));
    const childIds = (family.childrenIds || []).filter((id) => peopleById.has(id));
    for (const parentId of parentIds) {
      const parentConnections = getConnections(parentId);
      parentIds.filter((id) => id !== parentId).forEach((spouseId) => parentConnections.spouses.add(spouseId));
      childIds.forEach((childId) => parentConnections.children.add(childId));
    }
    for (const childId of childIds) {
      const childConnections = getConnections(childId);
      parentIds.forEach((parentId) => childConnections.parents.add(parentId));
    }
  }
  return connections;
}

function renderPersonCard(person, peopleById, familyConnections, isStartingPerson = false, roleLine = '') {
  const connections = familyConnections.get(person.id) || { parents: new Set(), spouses: new Set(), children: new Set() };
  const parents = getPeopleNames([...connections.parents], peopleById);
  const spouses = getPeopleNames([...connections.spouses], peopleById);
  const children = getPeopleNames([...connections.children], peopleById);

  return `
    <article class="tree-review-person ${isStartingPerson ? 'selected-tree-person' : ''}">
      <h4>${escapeHtml(person.name || person.id)}</h4>
      ${isStartingPerson ? '<p><strong>Your starting person</strong></p>' : ''}
      ${roleLine ? `<p class="tree-person-role">${roleLine}</p>` : ''}
      <p><strong>Parents:</strong> ${parents.join(' and ') || 'Not recorded'}</p>
      <p><strong>Spouse:</strong> ${spouses.join(' and ') || 'Not recorded'}</p>
      <p><strong>Children:</strong> ${children.join(', ') || 'Not recorded'}</p>
    </article>
  `;
}

// A generation reads as a list of strangers unless the couples in it are kept
// together. Each couple is shown side by side and named as the parents of the
// person below them, so the customer can follow their own line down the page.
function getGenerationCouples(peopleInGeneration, families, childOrder) {
  const inGeneration = new Map(peopleInGeneration.map((person) => [person.id, person]));
  const used = new Set();
  const units = [];

  for (const family of families) {
    const husband = inGeneration.get(family.husbandId);
    const wife = inGeneration.get(family.wifeId);
    const members = [husband, wife].filter((person) => person && !used.has(person.id));
    if (!members.length) continue;
    members.forEach((person) => used.add(person.id));
    const childRanks = (family.childrenIds || [])
      .map((childId) => childOrder.get(childId))
      .filter((rank) => rank !== undefined);
    units.push({
      members,
      husbandId: husband?.id || '',
      wifeId: wife?.id || '',
      childIds: (family.childrenIds || []).filter((childId) => childOrder.has(childId)),
      rank: childRanks.length ? Math.min(...childRanks) : Number.MAX_SAFE_INTEGER,
    });
  }

  for (const person of peopleInGeneration) {
    if (used.has(person.id)) continue;
    units.push({ members: [person], husbandId: '', wifeId: '', childIds: [], rank: Number.MAX_SAFE_INTEGER });
  }

  return units.sort((left, right) => left.rank - right.rank);
}

function renderCoupleUnit(unit, peopleById, familyConnections, primaryPersonId) {
  const nameOf = (person) => escapeHtml(person?.name || person?.id || '');
  const coupleName = unit.members.map(nameOf).join(' and ');
  const childNames = unit.childIds
    .map((childId) => peopleById.get(childId))
    .filter(Boolean)
    .map(nameOf);
  const relationLine = childNames.length
    ? `Parents of ${childNames.join(' and ')}`
    : unit.members.length > 1
      ? 'Married couple'
      : '';
  const partnerLabel = (person) => {
    const partner = unit.members.find((other) => other.id !== person.id);
    if (!partner) return unit.members.length === 1 ? 'Spouse not recorded in this generation' : '';
    const role = person.id === unit.husbandId ? 'Husband' : person.id === unit.wifeId ? 'Wife' : 'Married';
    return `${role} of ${nameOf(partner)}`;
  };

  return `
    <article class="ancestry-couple">
      <div class="ancestry-couple-heading">
        <h4>${coupleName}</h4>
        ${relationLine ? `<p class="muted">${relationLine}</p>` : ''}
      </div>
      <div class="ancestry-couple-people">
        ${unit.members.map((person) => renderPersonCard(
          person,
          peopleById,
          familyConnections,
          person.id === primaryPersonId,
          partnerLabel(person),
        )).join('')}
      </div>
    </article>
  `;
}

function renderGenerations(treeData, peopleById, families) {
  const primaryPerson = getPrimaryPerson(treeData);
  const generationByPerson = buildGenerationData(treeData, peopleById, primaryPerson);
  const familyConnections = buildFamilyConnections(families, peopleById);
  const peopleByGeneration = new Map();
  for (const person of treeData.people) {
    const generation = generationByPerson.get(person.id);
    if (!generation) continue;
    if (!peopleByGeneration.has(generation)) peopleByGeneration.set(generation, []);
    peopleByGeneration.get(generation).push(person);
  }
  const maximumGeneration = Math.max(...generationByPerson.values(), 1);
  const displayedThrough = Math.min(visibleGenerationCount, maximumGeneration);
  const sections = [];

  // Each generation is ordered by the person below it, so a line of descent
  // stays together instead of the whole generation arriving in file order.
  let childOrder = new Map(primaryPerson ? [[primaryPerson.id, 0]] : []);

  for (let generation = 1; generation <= displayedThrough; generation += 1) {
    const people = peopleByGeneration.get(generation) || [];
    const units = generation === 1
      ? people.map((person) => ({ members: [person], husbandId: '', wifeId: '', childIds: [], rank: 0 }))
      : getGenerationCouples(people, families, childOrder);
    const nextOrder = new Map();
    units.forEach((unit) => unit.members.forEach((person) => nextOrder.set(person.id, nextOrder.size)));
    childOrder = nextOrder;

    sections.push(`
      <section class="tree-review-generation ancestry-generation">
        <div class="ancestry-generation-heading">
          <h3>${generation === 1 ? 'Starting person' : generation === 2 ? 'Parents' : `Ancestor generation ${generation - 1}`}</h3>
          <p class="muted">${people.length} person${people.length === 1 ? '' : 's'}${generation > 1 ? ` \u00b7 ${units.length} famil${units.length === 1 ? 'y' : 'ies'}` : ''}</p>
        </div>
        <div class="ancestry-people">
          ${!units.length
            ? '<p class="muted">No people recorded in this generation.</p>'
            : generation === 1
              ? people.map((person) => renderPersonCard(person, peopleById, familyConnections, person.id === primaryPerson?.id)).join('')
              : units.map((unit) => renderCoupleUnit(unit, peopleById, familyConnections, primaryPerson?.id)).join('')}
        </div>
      </section>
    `);
  }

  const loadMore = displayedThrough < maximumGeneration
    ? `<button class="btn-secondary" type="button" data-load-more-generations>View ${Math.min(GENERATIONS_PER_PAGE, maximumGeneration - displayedThrough)} more generations</button>`
    : '';

  return `
    <section class="tree-review-list">
      <h2>Your working tree preview</h2>
      <div class="tree-review-actions">
        <button class="btn-secondary" type="button" data-open-primary-person-picker>Choose the Person to Start With</button>
      </div>
      <div id="primaryPersonPicker" hidden>
        <label for="primaryPerson">Choose the person whose family branch you want to review</label>
        <input id="primaryPerson" type="search" placeholder="Type the person's name or record ID" autocomplete="off">
        <div id="primaryPersonMatches" class="primary-person-matches" aria-live="polite"></div>
        <button class="btn-add" type="button" data-confirm-primary-person>Use This Person as the Starting Point</button>
      </div>
      <p>Showing ${displayedThrough} of ${maximumGeneration} ancestry generations around ${escapeHtml(primaryPerson?.name || 'the main person')}, so you can stay focused on the records you are correcting.</p>
      <p class="muted">This working view starts with five generations. Add more only when you need them, or choose a different direct line.</p>
      <div class="tree-next-step">
        ${loadMore}
        <a class="btn-add" href="${errorWorkspaceUrl}" data-continue-to-errors>Continue to Fix Errors</a>
        <a class="btn-secondary" href="${workspaceProgressUrl}">Review Work Space Progress</a>
      </div>
      <div class="ancestry-tree" aria-label="Family ancestry tree">
        ${sections.join('')}
      </div>
    </section>
  `;
}

function renderTreeReview(treeData = loadedTreeData || getTreeData()) {
  try {
    renderTreeReviewContent(treeData);
  } catch (error) {
    renderTreeReviewRecovery(error);
  }
  if (review && !review.textContent.trim()) {
    renderTreeReviewRecovery(new Error('This screen finished loading without any content to show.'));
  }
}

// Never leave the preview empty: a blank screen reads as a lost family tree.
function renderTreeReviewRecovery(error) {
  const detail = error?.message ? String(error.message) : 'An unexpected problem interrupted the preview.';
  review.innerHTML = `
    <section class="batch-complete">
      <h2>Your working tree preview needs a moment</h2>
      <p>Your family tree is safe. Something interrupted this screen, so nothing was lost and nothing was changed.</p>
      <p class="fix-suggestion">${escapeHtml(detail)}</p>
      <div class="workflow-actions">
        <button type="button" class="btn-add" onclick="window.location.reload()">Try This Screen Again</button>
        <a class="btn-secondary" href="${errorWorkspaceUrl}">Continue to Fix Errors</a>
        <a class="btn-secondary" href="workplace.html">Open Your Work Place</a>
      </div>
    </section>
  `;
}

function renderTreeReviewContent(treeData = loadedTreeData || getTreeData()) {
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
  restoreDefaultStartingPerson(treeData);
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
      <div class="tree-summary-actions">
        <a class="btn-secondary" href="${errorWorkspaceUrl}" data-continue-to-errors>Return to Error Workspace</a>
      </div>
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
  loadedTreeData.primaryPersonSelectionMode = 'manual';
  visibleGenerationCount = GENERATIONS_PER_PAGE;
  saveTreeData(loadedTreeData);
  renderTreeReview();
}

review.addEventListener('click', async (event) => {
  const continueToErrors = event.target.closest('[data-continue-to-errors]');
  if (continueToErrors && loadedTreeData) {
    event.preventDefault();
    continueToErrors.textContent = 'Opening Your Fixes...';
    continueToErrors.setAttribute('aria-disabled', 'true');

    const reviewTreeData = createFiveGenerationReviewTree(loadedTreeData);

    try {
      sessionStorage.setItem(ERROR_REVIEW_HANDOFF_KEY, JSON.stringify(reviewTreeData));
    } catch (error) {
      // The persistent save below remains the source of truth for large trees.
    }

    let databaseSave;
    try {
      localStorage.setItem(FIVE_GENERATION_REVIEW_STORAGE_KEY, JSON.stringify(reviewTreeData));
    } catch (error) {
      databaseSave = window.familyTreeClientStorage?.saveTreeInDatabase?.(FIVE_GENERATION_REVIEW_STORAGE_KEY, reviewTreeData);
    }

    if (databaseSave) {
      await Promise.race([
        databaseSave.catch(() => console.error('Could not save the reviewed tree to browser storage.')),
        new Promise((resolve) => window.setTimeout(resolve, 1500)),
      ]);
    }

    window.location.assign(continueToErrors.href);
    return;
  }

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
