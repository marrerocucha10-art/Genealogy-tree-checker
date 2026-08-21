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
let startingPersonId = '';

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
    myHeritage: `https://www.myheritage.com/research?formId=master&formMode=&useTranslation=1&exactSearch=&p=1&action=query&qname=${encodeURIComponent(`Name fn.${name.split(' ').slice(0, -1).join(' ') || name} ln.${name.split(' ').slice(-1).join('')}`)}`,
    census: 'https://www.archives.gov/research/census',
    vital: 'https://www.familysearch.org/en/wiki/United_States_Vital_Records',
    church: 'https://www.familysearch.org/en/wiki/Church_records',
    immigration: 'https://www.archives.gov/research/immigration',
    archive: `https://archive.org/search?query=${encodeURIComponent(searchTerms)}`,
  };
}

function getGenerationLabel(generation) {
  if (generation === 0) return 'Starting person';
  if (generation === 1) return 'Parents';
  if (generation === 2) return 'Grandparents';
  if (generation === 3) return 'Great-grandparents';
  const greats = generation - 2;
  return `${greats}${greats === 2 ? 'nd' : greats === 3 ? 'rd' : 'th'} great-grandparents`;
}

function buildFamilyIndex(treeData) {
  const parentsByChild = new Map();
  const partnersById = new Map();
  const childrenById = new Map();
  const add = (map, key, value) => {
    if (!key || !value) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(value);
  };
  for (const family of treeData?.families || []) {
    const parents = [family.husbandId, family.wifeId].filter(Boolean);
    const children = (family.childrenIds || []).filter(Boolean);
    for (const child of children) {
      for (const parent of parents) {
        add(parentsByChild, child, parent);
        add(childrenById, parent, child);
      }
    }
    for (const parent of parents) {
      for (const other of parents) if (parent !== other) add(partnersById, parent, other);
    }
  }
  return { parentsByChild, partnersById, childrenById };
}

// Organised the way the family tree reads: the starting person, then their
// parents, then grandparents, and so on up the direct ancestry line. Partners
// sit with the ancestor they married, and anyone off that line follows after.
function getOrderedPeople() {
  const treeData = loadedTreeData || getTreeData();
  const people = treeData?.people || [];
  if (!people.length) return [];
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const { parentsByChild, partnersById, childrenById } = buildFamilyIndex(treeData);
  const startId = peopleById.has(startingPersonId) ? startingPersonId
    : peopleById.has(treeData?.primaryPersonId) ? treeData.primaryPersonId
      : people[0].id;

  const ordered = [];
  const seen = new Set();
  const push = (id, generation, group) => {
    if (!peopleById.has(id) || seen.has(id)) return;
    seen.add(id);
    ordered.push({ person: peopleById.get(id), generation, group });
  };

  push(startId, 0, getGenerationLabel(0));
  let currentGeneration = [startId];
  let generation = 1;
  while (currentGeneration.length && generation < 25) {
    const nextGeneration = [];
    const sorted = currentGeneration
      .flatMap((childId) => [...(parentsByChild.get(childId) || [])])
      .filter((id) => peopleById.has(id) && !seen.has(id))
      .sort((a, b) => getPersonName(peopleById.get(a)).localeCompare(getPersonName(peopleById.get(b))));
    for (const parentId of sorted) {
      push(parentId, generation, getGenerationLabel(generation));
      nextGeneration.push(parentId);
    }
    currentGeneration = nextGeneration;
    generation += 1;
  }

  // Partners and children of anyone already listed: still family, but not on the
  // direct line, so they follow the ancestry list instead of interrupting it.
  const directIds = [...seen];
  const relatedIds = directIds
    .flatMap((id) => [...(partnersById.get(id) || []), ...(childrenById.get(id) || [])])
    .filter((id) => peopleById.has(id) && !seen.has(id));
  for (const id of [...new Set(relatedIds)].sort((a, b) => getPersonName(peopleById.get(a)).localeCompare(getPersonName(peopleById.get(b))))) {
    push(id, null, 'Partners and children');
  }

  for (const person of people) {
    if (!seen.has(person.id)) {
      seen.add(person.id);
      ordered.push({ person, generation: null, group: 'Not linked to your starting person yet' });
    }
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
              <a class="btn-secondary" href="${links.myHeritage}" target="_blank" rel="noopener">Search MyHeritage</a>
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
        <p class="ancestor-discovery-intro">Upload a GEDCOM file first. Then pick people from your family tree here to open Census, vital, church, immigration, Ancestry, MyHeritage, FamilySearch, and archive research options.</p>
        <a class="btn-add" href="/?start=upload">Upload Your GEDCOM</a>
      </section>
    `;
    return;
  }

  const orderedForSelect = getOrderedPeople();
  const treeData = loadedTreeData || getTreeData();
  const activeStartId = orderedForSelect[0]?.person?.id || treeData?.primaryPersonId || '';
  const matching = getMatchingPeople();
  const shown = matching.slice(0, visibleCount);
  const selectedPeople = selectedIds
    .map((id) => allPeople.find((person) => person.id === id))
    .filter(Boolean);
  const limitReached = selectedIds.length >= PEOPLE_PER_BATCH;

  workspace.innerHTML = `
    <section class="ancestor-discovery person-picker">
      <h2>Select a person from your family tree</h2>
      <p class="ancestor-discovery-intro">You work with ${PEOPLE_PER_BATCH} people from your family tree at a time. The list is ordered the way your tree reads: your starting person first, then parents, grandparents and back up the line. Tick up to ${PEOPLE_PER_BATCH} names and their research options open underneath.</p>
      <label class="person-picker-search">
        <span>Starting person</span>
        <select id="startingPerson">
          ${orderedForSelect.map(({ person, group }) => `<option value="${escapeHtml(person.id)}"${person.id === activeStartId ? ' selected' : ''}>${escapeHtml(getPersonName(person))}${group ? ` — ${escapeHtml(group)}` : ''}</option>`).join('')}
        </select>
      </label>
      <label class="person-picker-search">
        <span>Search your tree by name or place</span>
        <input type="search" id="personSearch" value="${escapeHtml(searchTerm)}" placeholder="Type a name, for example Lopez" autocomplete="off">
      </label>
      <p class="person-picker-count">${selectedIds.length} of ${PEOPLE_PER_BATCH} people selected${selectedIds.length ? ' · <button type="button" class="btn-link" id="clearSelection">Clear selection</button>' : ''}</p>
      ${shown.length ? `<ul class="person-picker-list">
        ${shown.map(({ person, group }, index) => {
          const checked = selectedIds.includes(person.id);
          const detail = getPersonDetail(person);
          const heading = index === 0 || shown[index - 1].group !== group
            ? `<li class="person-picker-group">${escapeHtml(group)}</li>`
            : '';
          return `${heading}<li>
            <label class="person-picker-option${checked ? ' is-selected' : ''}">
              <input type="checkbox" data-person-id="${escapeHtml(person.id)}"${checked ? ' checked' : ''}${!checked && limitReached ? ' disabled' : ''}>
              <span class="person-picker-name">${escapeHtml(getPersonName(person))}</span>
              <span class="person-picker-detail">${escapeHtml(detail || 'No place or dates recorded')}</span>
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
  if (event.target.closest('#showAncestryTop')) {
    visibleCount = PEOPLE_PER_BATCH;
    renderDiscovery();
  }
  if (event.target.closest('#clearSelection')) {
    selectedIds = [];
    refreshSelectionState();
  }
});

workspace.addEventListener('change', (event) => {
  const select = event.target.closest('#startingPerson');
  if (!select) return;
  startingPersonId = select.value;
  visibleCount = PEOPLE_PER_BATCH;
  renderDiscovery();
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
