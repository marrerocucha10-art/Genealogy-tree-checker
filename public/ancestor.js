const WORKSPACE_PREVIEW_MODE = new URLSearchParams(window.location.search).get('demo') === 'workspace';
const STORAGE_KEY = WORKSPACE_PREVIEW_MODE
  ? 'familyTreeWorkspacePreviewData'
  : window.familyTreeClientStorage?.getActiveTreeKey() || 'familyTreeData';
const workspace = document.getElementById('ancestorDiscovery');
const requestedFocusPersonId = new URLSearchParams(window.location.search).get('focus') || '';

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

function extractYear(value) {
  const match = String(value || '').match(/\b(\d{4})\b/);
  return match ? Number(match[1]) : null;
}

function getSearchLinks(person) {
  const searchTerms = [person.name || person.id, person.birthPlace, 'family history'].filter(Boolean).join(' ');
  const placeTerms = person.birthPlace || `${person.name || person.id} family history`;
  return {
    familySearch: `https://www.familysearch.org/search/record/results?count=20&q.any=${encodeURIComponent(searchTerms)}`,
    census: 'https://www.archives.gov/research/census',
    vital: 'https://www.familysearch.org/en/wiki/United_States_Vital_Records',
    church: 'https://www.familysearch.org/en/wiki/Church_records',
    immigration: 'https://www.archives.gov/research/immigration',
    archive: `https://archive.org/search?query=${encodeURIComponent(searchTerms)}`,
  };
}

function renderDiscovery() {
  const allPeople = getTreeData()?.people || [];
  const focusedPerson = allPeople.find((person) => person.id === requestedFocusPersonId);
  const people = focusedPerson
    ? [focusedPerson]
    : allPeople.filter((person) => person.birthPlace || person.birthDate || person.deathDate);
  if (!people.length) {
    workspace.innerHTML = '<p class="empty-message">Parse a GEDCOM with life dates or places before opening ancestor research leads.</p>';
    return;
  }
  workspace.innerHTML = `
    <section class="ancestor-discovery">
      <h2>Supporting records path</h2>
      <p class="ancestor-discovery-intro">${focusedPerson ? `Find sources that may help you verify ${escapeHtml(focusedPerson.name || focusedPerson.id)} before updating the record.` : 'Select a person to explore their place and family-history research leads.'}</p>
      <div class="ancestor-discovery-grid">
        ${people.map((person) => {
          const links = getSearchLinks(person);
          const years = [extractYear(person.birthDate), extractYear(person.deathDate)].filter(Boolean).join(' - ');
          return `<article class="ancestor-card">
            <h4>${escapeHtml(person.name || person.id)}</h4>
            <p class="ancestor-meta">${escapeHtml([person.birthPlace, years].filter(Boolean).join(' · ') || 'Add a place or life date to tailor this lead.')}</p>
            <div class="ancestor-resource-links">
              <a class="btn-secondary" href="${links.familySearch}" target="_blank" rel="noopener">Search FamilySearch Records</a>
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

renderDiscovery();
