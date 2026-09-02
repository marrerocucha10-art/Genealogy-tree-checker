const WORKSPACE_PREVIEW_MODE = new URLSearchParams(window.location.search).get('demo') === 'workspace';
const STORAGE_KEY = WORKSPACE_PREVIEW_MODE
  ? 'familyTreeWorkspacePreviewData'
  : window.familyTreeClientStorage?.getActiveTreeKey() || 'familyTreeData';
const workspace = document.getElementById('ancestorDiscovery');
const requestedFocusPersonId = new URLSearchParams(window.location.search).get('focus') || '';
const PEOPLE_PER_BATCH = 5;
let loadedTreeData = null;
let startingPersonId = requestedFocusPersonId;
let activeGeneration = 0;
let selectedIds = [];

function getTreeData() {
  if (loadedTreeData) return loadedTreeData;
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

function extractYear(value) {
  const match = String(value || '').match(/\b(\d{4})\b/);
  return match ? Number(match[1]) : null;
}

function getPersonName(person) {
  return String(person?.name || '').replace(/\//g, '').trim() || 'Unnamed person';
}

// Places are shown as recorded, and a place with no country named is marked as
// such so nobody reads a bare town as a complete location.
function formatPlace(place) {
  const parts = String(place || '').split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return `${parts[0]} (country not recorded)`;
  return parts.join(', ');
}

function getPersonDetail(person) {
  const years = [extractYear(person?.birthDate), extractYear(person?.deathDate)].filter(Boolean).join(' - ');
  return [formatPlace(person?.birthPlace), years].filter(Boolean).join(' · ');
}

function getGenerationLabel(generation) {
  if (generation === 0) return 'Starting person';
  if (generation === 1) return 'Parents';
  if (generation === 2) return 'Grandparents';
  if (generation === 3) return 'Great-grandparents';
  const greats = generation - 2;
  const suffix = greats === 2 ? 'nd' : greats === 3 ? 'rd' : 'th';
  return `${greats}${suffix} great-grandparents`;
}

function getAllPeople() {
  return (loadedTreeData || getTreeData())?.people || [];
}

function getStartingPerson() {
  const treeData = loadedTreeData || getTreeData();
  const people = treeData?.people || [];
  const byId = new Map(people.map((person) => [person.id, person]));
  return byId.get(startingPersonId)
    || byId.get(treeData?.primaryPersonId)
    || people[0]
    || null;
}

// Only the direct line above the starting person: their parents, then that
// generation's parents, and so on. Nobody else from the file appears here.
function getAncestorGenerations() {
  const treeData = loadedTreeData || getTreeData();
  const people = treeData?.people || [];
  const start = getStartingPerson();
  if (!start) return [];
  const byId = new Map(people.map((person) => [person.id, person]));
  const parentsByChild = new Map();
  for (const family of treeData?.families || []) {
    const parents = [family.husbandId, family.wifeId].filter((id) => byId.has(id));
    for (const childId of family.childrenIds || []) {
      if (!byId.has(childId)) continue;
      if (!parentsByChild.has(childId)) parentsByChild.set(childId, []);
      parentsByChild.get(childId).push(...parents);
    }
  }

  const generations = [[start]];
  const placed = new Set([start.id]);
  while (generations.length < 25) {
    const parents = [];
    for (const child of generations[generations.length - 1]) {
      for (const parentId of parentsByChild.get(child.id) || []) {
        if (placed.has(parentId)) continue;
        placed.add(parentId);
        parents.push(byId.get(parentId));
      }
    }
    if (!parents.length) break;
    generations.push(parents);
  }
  return generations;
}

function getSearchLinks(person) {
  const name = getPersonName(person);
  const nameParts = name.split(' ').filter(Boolean);
  const surname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : name;
  const given = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : name;
  const searchTerms = [name, String(person?.birthPlace || '').trim(), 'family history'].filter(Boolean).join(' ');
  return {
    familySearch: `https://www.familysearch.org/search/record/results?count=20&q.any=${encodeURIComponent(searchTerms)}`,
    ancestry: `https://www.ancestry.com/search/?name=${encodeURIComponent(name)}`,
    myHeritage: `https://www.myheritage.com/research?formId=master&formMode=&useTranslation=1&exactSearch=&p=1&action=query&qname=${encodeURIComponent(`Name fn.${given} ln.${surname}`)}`,
    census: 'https://www.archives.gov/research/census',
    vital: 'https://www.familysearch.org/en/wiki/United_States_Vital_Records',
    church: 'https://www.familysearch.org/en/wiki/Church_records',
    immigration: 'https://www.archives.gov/research/immigration',
    archive: `https://archive.org/search?query=${encodeURIComponent(searchTerms)}`,
  };
}

function renderResearchCard(person, note) {
  const links = getSearchLinks(person);
  return `<article class="ancestor-card">
    <h4>${escapeHtml(getPersonName(person))}</h4>
    <p class="ancestor-meta">${escapeHtml([note, getPersonDetail(person)].filter(Boolean).join(' · ') || 'Add a place or life date to tailor these searches.')}</p>
    <div class="ancestor-resource-links">
      <a class="btn-secondary" href="${links.familySearch}" target="_blank" rel="noopener">Search FamilySearch Records</a>
      <a class="btn-secondary" href="${links.ancestry}" target="_blank" rel="noopener">Search Ancestry</a>
      <a class="btn-secondary" href="${links.myHeritage}" target="_blank" rel="noopener">Search MyHeritage</a>
      <a class="btn-secondary" href="${links.census}" target="_blank" rel="noopener">Open Census Records Guide</a>
      <a class="btn-secondary" href="${links.vital}" target="_blank" rel="noopener">Find Vital Records</a>
      <a class="btn-secondary" href="${links.church}" target="_blank" rel="noopener">Find Church Records</a>
      <a class="btn-secondary" href="${links.immigration}" target="_blank" rel="noopener">Find Immigration Records</a>
      <a class="btn-secondary" href="${links.archive}" target="_blank" rel="noopener">Search Internet Archive</a>
    </div>
  </article>`;
}

function renderResearchOptions() {
  const start = getStartingPerson();
  const generations = getAncestorGenerations();
  const lineById = new Map(generations.flat().map((person) => [person.id, person]));
  const chosen = selectedIds.map((id) => lineById.get(id)).filter(Boolean);
  return `
    <section class="ancestor-discovery">
      <h2>Research options for ${escapeHtml(getPersonName(start))}</h2>
      <p class="ancestor-discovery-intro">${chosen.length
        ? `Every search below stays on ${escapeHtml(getPersonName(start))}'s line. Links open in a new tab so you keep your place here.`
        : `Tick a name above to add that ancestor's searches alongside ${escapeHtml(getPersonName(start))}.`}</p>
      <div class="ancestor-discovery-grid">
        ${renderResearchCard(start, 'Focus of this research')}
        ${chosen.map((person) => renderResearchCard(person, `${getGenerationLabel(generations.findIndex((generation) => generation.some((member) => member.id === person.id)))} of ${getPersonName(start)}`)).join('')}
      </div>
    </section>
  `;
}

function renderDiscovery() {
  const allPeople = getAllPeople();
  if (!allPeople.length) {
    workspace.innerHTML = `
      <section class="ancestor-discovery">
        <h2>Start your ancestor research</h2>
        <p class="ancestor-discovery-intro">Upload a GEDCOM file first. Then choose a starting person here and work back one generation at a time, opening Census, vital, church, immigration, Ancestry, MyHeritage, FamilySearch and archive research options.</p>
        <div class="ancestor-upload-action"><a class="btn-add" href="/?start=upload">Upload Your GEDCOM</a></div>
      </section>
    `;
    return;
  }

  const start = getStartingPerson();
  const generations = getAncestorGenerations();
  if (activeGeneration > generations.length - 1) activeGeneration = generations.length - 1;
  if (activeGeneration < 1) activeGeneration = Math.min(1, generations.length - 1);
  const currentGeneration = generations[activeGeneration] || [];
  const limitReached = selectedIds.length >= PEOPLE_PER_BATCH;
  const sortedForSelect = [...allPeople].sort((a, b) => getPersonName(a).localeCompare(getPersonName(b)));

  workspace.innerHTML = `
    <section class="ancestor-discovery person-picker">
      <h2>Work back through ${escapeHtml(getPersonName(start))}'s line</h2>
      <p class="ancestor-discovery-intro">Only ${escapeHtml(getPersonName(start))}'s direct ancestors appear here, one generation at a time, up to ${PEOPLE_PER_BATCH} people in view. ${escapeHtml(getPersonName(start))} stays the focus of the research below.</p>
      <label class="person-picker-search">
        <span>Starting person</span>
        <select id="startingPerson">
          ${sortedForSelect.map((person) => `<option value="${escapeHtml(person.id)}"${person.id === start.id ? ' selected' : ''}>${escapeHtml(getPersonName(person))}${getPersonDetail(person) ? ` — ${escapeHtml(getPersonDetail(person))}` : ''}</option>`).join('')}
        </select>
      </label>
      ${generations.length < 2
        ? `<p class="empty-message">Your file records no parents for ${escapeHtml(getPersonName(start))}, so there is no earlier generation to research yet. ${escapeHtml(getPersonName(start))}'s own research options are below.</p>`
        : `
      <p class="person-picker-generation">${escapeHtml(getGenerationLabel(activeGeneration))} of ${escapeHtml(getPersonName(start))} · generation ${activeGeneration} of ${generations.length - 1}</p>
      <p class="person-picker-actions">
        <button type="button" class="btn-secondary" id="previousGeneration"${activeGeneration <= 1 ? ' disabled' : ''}>← ${escapeHtml(getGenerationLabel(Math.max(1, activeGeneration - 1)))}</button>
        <button type="button" class="btn-secondary" id="nextGeneration"${activeGeneration >= generations.length - 1 ? ' disabled' : ''}>${escapeHtml(getGenerationLabel(Math.min(generations.length - 1, activeGeneration + 1)))} →</button>
      </p>
      <p class="person-picker-count">${selectedIds.length} of ${PEOPLE_PER_BATCH} ancestors added to the research${selectedIds.length ? ' · <button type="button" class="btn-link" id="clearSelection">Clear</button>' : ''}</p>
      <ul class="person-picker-list">
        ${currentGeneration.slice(0, PEOPLE_PER_BATCH).map((person) => {
          const checked = selectedIds.includes(person.id);
          return `<li>
            <label class="person-picker-option${checked ? ' is-selected' : ''}">
              <input type="checkbox" data-person-id="${escapeHtml(person.id)}"${checked ? ' checked' : ''}${!checked && limitReached ? ' disabled' : ''}>
              <span class="person-picker-name">${escapeHtml(getPersonName(person))}</span>
              <span class="person-picker-detail">${escapeHtml(getPersonDetail(person) || 'No place or dates recorded')}</span>
            </label>
          </li>`;
        }).join('')}
      </ul>
      ${currentGeneration.length > PEOPLE_PER_BATCH
        ? `<p class="person-picker-progress">Showing the first ${PEOPLE_PER_BATCH} of ${currentGeneration.length} people in this generation.</p>`
        : ''}`}
    </section>
    <div id="researchOptions">${renderResearchOptions()}</div>
  `;
}

function refreshSelectionState() {
  const limitReached = selectedIds.length >= PEOPLE_PER_BATCH;
  workspace.querySelectorAll('input[data-person-id]').forEach((checkbox) => {
    const checked = selectedIds.includes(checkbox.getAttribute('data-person-id'));
    checkbox.checked = checked;
    checkbox.disabled = !checked && limitReached;
    checkbox.closest('.person-picker-option')?.classList.toggle('is-selected', checked);
  });
  const count = workspace.querySelector('.person-picker-count');
  if (count) {
    count.innerHTML = `${selectedIds.length} of ${PEOPLE_PER_BATCH} ancestors added to the research${selectedIds.length ? ' \u00b7 <button type="button" class="btn-link" id="clearSelection">Clear</button>' : ''}`;
  }
  const options = document.getElementById('researchOptions');
  if (options) options.innerHTML = renderResearchOptions();
}

workspace.addEventListener('change', (event) => {
  const select = event.target.closest('#startingPerson');
  if (select) {
    startingPersonId = select.value;
    selectedIds = [];
    activeGeneration = 1;
    renderDiscovery();
    return;
  }
  const checkbox = event.target.closest('input[data-person-id]');
  if (!checkbox) return;
  const personId = checkbox.getAttribute('data-person-id');
  if (checkbox.checked) {
    if (!selectedIds.includes(personId) && selectedIds.length < PEOPLE_PER_BATCH) selectedIds.push(personId);
  } else {
    selectedIds = selectedIds.filter((id) => id !== personId);
  }
  refreshSelectionState();
});

workspace.addEventListener('click', (event) => {
  if (event.target.closest('#previousGeneration')) {
    activeGeneration -= 1;
    renderDiscovery();
  }
  if (event.target.closest('#nextGeneration')) {
    activeGeneration += 1;
    renderDiscovery();
  }
  if (event.target.closest('#clearSelection')) {
    selectedIds = [];
    refreshSelectionState();
  }
});

const storedTreeData = getTreeData();
if (storedTreeData?.people?.length) {
  loadedTreeData = storedTreeData;
  renderDiscovery();
} else if (window.familyTreeClientStorage?.loadTreeFromDatabase) {
  workspace.innerHTML = '<p class="empty-message">Opening your family tree...</p>';
  window.familyTreeClientStorage.loadTreeFromDatabase(STORAGE_KEY)
    .then((treeData) => {
      loadedTreeData = treeData;
      renderDiscovery();
    })
    .catch(() => renderDiscovery());
} else {
  renderDiscovery();
}
