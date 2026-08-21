const WORKSPACE_PREVIEW_MODE = new URLSearchParams(window.location.search).get('demo') === 'workspace';
const STORAGE_KEY = WORKSPACE_PREVIEW_MODE
  ? 'familyTreeWorkspacePreviewData'
  : window.familyTreeClientStorage?.getActiveTreeKey() || 'familyTreeData';
const workspace = document.getElementById('ancestorDiscovery');
const requestedFocusPersonId = new URLSearchParams(window.location.search).get('focus') || '';
const PEOPLE_PER_BATCH = 5;
let loadedTreeData = null;
let searchTerm = '';
let visibleCount = PEOPLE_PER_BATCH;
let selectedIds = requestedFocusPersonId ? [requestedFocusPersonId] : [];

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
  return String(person.name || '').replace(/\//g, '').trim() || 'Unnamed person';
}

function getPersonDetail(person) {
  const years = [extractYear(person.birthDate), extractYear(person.deathDate)].filter(Boolean).join(' - ');
  return [person.birthPlace, years].filter(Boolean).join(' · ');
}

function getSearchLinks(person) {
  const name = getPersonName(person);
  const searchTerms = [name, person.birthPlace, 'family history'].filter(Boolean).join(' ');
  return {
    familySearch: `https://www.familysearch.org/search/record/results?count=20&q.any=${encodeURIComponent(searchTerms)}`,
    ancestry: `https://www.ancestry.com/search/?name=${encodeURIComponent(name)}`,
    census: 'https://www.archives.gov/research/census',
    vital: 'https://www.familysearch.org/en/wiki/United_States_Vital_Records',
    church: 'https://www.familysearch.org/en/wiki/Church_records',
    immigration: 'https://www.archives.gov/research/immigration',
    archive: `https://archive.org/search?query=${encodeURIComponent(searchTerms)}`,
  };
}

function getRelationshipLabel(step) {
  if (step === 0) return 'Starting person in your tree';
  if (step === 1) return 'Closest relatives';
  if (step === 2) return 'Next circle of relatives';
  return `${step} steps from your starting person`;
}

// The list follows the family, not the order the GEDCOM happened to store people
// in: the starting person first, then outward through parents, partners and
// children one circle at a time.
function getOrderedPeople() {
  const treeData = loadedTreeData || getTreeData();
  const people = treeData?.people || [];
  if (!people.length) return [];
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const relatives = new Map(people.map((person) => [person.id, new Set()]));
  const link = (a, b) => {
    if (!a || !b || a === b || !relatives.has(a) || !relatives.has(b)) return;
    relatives.get(a).add(b);
    relatives.get(b).add(a);
  };
  for (const family of treeData?.families || []) {
    const members = [family.husbandId, family.wifeId, ...(family.childrenIds || [])].filter(Boolean);
    for (const member of members) {
      for (const other of members) link(member, other);
    }
  }

  const startId = peopleById.has(treeData?.primaryPersonId) ? treeData.primaryPersonId : people[0].id;
  const ordered = [];
  const seen = new Set();
  const queue = [{ id: startId, step: 0 }];
  while (queue.length) {
    const { id, step } = queue.shift();
    if (seen.has(id) || !peopleById.has(id)) continue;
    seen.add(id);
    ordered.push({ person: peopleById.get(id), step });
    const next = [...(relatives.get(id) || [])]
      .filter((relativeId) => !seen.has(relativeId))
      .sort((a, b) => getPersonName(peopleById.get(a)).localeCompare(getPersonName(peopleById.get(b))));
    for (const relativeId of next) queue.push({ id: relativeId, step: step + 1 });
  }
  for (const person of people) {
    if (!seen.has(person.id)) ordered.push({ person, step: null });
  }
  return ordered;
}

function getAllPeople() {
  return (loadedTreeData || getTreeData())?.people || [];
}

function getMatchingPeople() {
  const term = searchTerm.trim().toLowerCase();
  const entries = getOrderedPeople();
  if (!term) return entries;
  return entries.filter(({ person }) => getPersonName(person).toLowerCase().includes(term)
    || String(person.birthPlace || '').toLowerCase().includes(term));
}

function renderResearchOptions(people) {
  if (!people.length) {
    return `<section class="ancestor-discovery">
      <h2>Research options</h2>
      <p class="ancestor-discovery-intro">Choose up to ${PEOPLE_PER_BATCH} people above to open their research options.</p>
    </section>`;
  }
  return `
    <section class="ancestor-discovery">
      <h2>Research options</h2>
      <p class="ancestor-discovery-intro">Each person below opens their own record searches. Every link opens in a new tab so you keep your place here.</p>
      <div class="ancestor-discovery-grid">
        ${people.map((person) => {
          const links = getSearchLinks(person);
          return `<article class="ancestor-card">
            <h4>${escapeHtml(getPersonName(person))}</h4>
            <p class="ancestor-meta">${escapeHtml(getPersonDetail(person) || 'Add a place or life date to tailor these searches.')}</p>
            <div class="ancestor-resource-links">
              <a class="btn-secondary" href="${links.familySearch}" target="_blank" rel="noopener">Search FamilySearch Records</a>
              <a class="btn-secondary" href="${links.ancestry}" target="_blank" rel="noopener">Search Ancestry</a>
              <a class="btn-secondary" href="${links.census}" target="_blank" rel="noopener">Open Census Records Guide</a>
              <a class="btn-secondary" href="${links.vital}" target="_blank" rel="noopener">Find Vital Records</a>
              <a class="btn-secondary" href="${links.church}" target="_blank" rel="noopener">Find Church Records</a>
              <a class="btn-secondary" href="${links.immigration}" target="_blank" rel="noopener">Find Immigration Records</a>
              <a class="btn-secondary" href="${links.archive}" target="_blank" rel="noopener">Search Internet Archive</a>
            </div>
          </article>`;
        }).join('')}
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
        <p class="ancestor-discovery-intro">Upload a GEDCOM file first. Then pick people from your family tree here to open Census, vital, church, immigration, Ancestry, FamilySearch, and archive research options.</p>
        <a class="btn-add" href="/?start=upload">Upload Your GEDCOM</a>
      </section>
    `;
    return;
  }

  const matching = getMatchingPeople();
  const shown = matching.slice(0, visibleCount);
  const selectedPeople = selectedIds
    .map((id) => allPeople.find((person) => person.id === id))
    .filter(Boolean);
  const limitReached = selectedIds.length >= PEOPLE_PER_BATCH;

  workspace.innerHTML = `
    <section class="ancestor-discovery person-picker">
      <h2>Select a person from your family tree</h2>
      <p class="ancestor-discovery-intro">You work with ${PEOPLE_PER_BATCH} people from your family tree at a time. The list begins with the person you chose as the starting person in your tree and moves outward through their closest relatives. Tick up to ${PEOPLE_PER_BATCH} names and their research options open underneath.</p>
      <label class="person-picker-search">
        <span>Search your tree by name or place</span>
        <input type="search" id="personSearch" value="${escapeHtml(searchTerm)}" placeholder="Type a name, for example Lopez" autocomplete="off">
      </label>
      <p class="person-picker-count">${selectedIds.length} of ${PEOPLE_PER_BATCH} people selected${selectedIds.length ? ' · <button type="button" class="btn-link" id="clearSelection">Clear selection</button>' : ''}</p>
      ${shown.length ? `<ul class="person-picker-list">
        ${shown.map(({ person, step }) => {
          const checked = selectedIds.includes(person.id);
          const detail = getPersonDetail(person);
          return `<li>
            <label class="person-picker-option${checked ? ' is-selected' : ''}">
              <input type="checkbox" data-person-id="${escapeHtml(person.id)}"${checked ? ' checked' : ''}${!checked && limitReached ? ' disabled' : ''}>
              <span class="person-picker-name">${escapeHtml(getPersonName(person))}</span>
              <span class="person-picker-detail">${escapeHtml([step === null ? 'Not connected to your starting person yet' : getRelationshipLabel(step), detail].filter(Boolean).join(' · '))}</span>
            </label>
          </li>`;
        }).join('')}
      </ul>` : '<p class="empty-message">No one in your tree matches that search.</p>'}
      <p class="person-picker-actions">
        ${matching.length > shown.length ? `<button type="button" class="btn-secondary" id="showMorePeople">Show ${Math.min(PEOPLE_PER_BATCH, matching.length - shown.length)} more people</button>` : ''}
        <span class="person-picker-progress">Showing ${shown.length} of ${matching.length} people</span>
      </p>
    </section>
    <div id="researchOptions">${renderResearchOptions(selectedPeople)}</div>
  `;
}

function refreshSelectionState() {
  const allPeople = getAllPeople();
  const selectedPeople = selectedIds
    .map((id) => allPeople.find((person) => person.id === id))
    .filter(Boolean);
  const limitReached = selectedIds.length >= PEOPLE_PER_BATCH;
  workspace.querySelectorAll('input[data-person-id]').forEach((checkbox) => {
    const checked = selectedIds.includes(checkbox.getAttribute('data-person-id'));
    checkbox.checked = checked;
    checkbox.disabled = !checked && limitReached;
    checkbox.closest('.person-picker-option')?.classList.toggle('is-selected', checked);
  });
  const count = workspace.querySelector('.person-picker-count');
  if (count) {
    count.innerHTML = `${selectedIds.length} of ${PEOPLE_PER_BATCH} people selected${selectedIds.length ? ' \u00b7 <button type="button" class="btn-link" id="clearSelection">Clear selection</button>' : ''}`;
  }
  const options = document.getElementById('researchOptions');
  if (options) options.innerHTML = renderResearchOptions(selectedPeople);
}

workspace.addEventListener('change', (event) => {
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
  if (event.target.closest('#showMorePeople')) {
    visibleCount += PEOPLE_PER_BATCH;
    renderDiscovery();
  }
  if (event.target.closest('#clearSelection')) {
    selectedIds = [];
    refreshSelectionState();
  }
});

workspace.addEventListener('input', (event) => {
  const search = event.target.closest('#personSearch');
  if (!search) return;
  searchTerm = search.value;
  visibleCount = PEOPLE_PER_BATCH;
  renderDiscovery();
  const refreshed = document.getElementById('personSearch');
  if (refreshed) {
    refreshed.focus();
    refreshed.setSelectionRange(refreshed.value.length, refreshed.value.length);
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
