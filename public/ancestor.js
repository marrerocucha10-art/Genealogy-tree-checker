const STORAGE_KEY = 'familyTreeData';
const workspace = document.getElementById('ancestorDiscovery');

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
    youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${placeTerms} history`)}`,
    wikipedia: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(placeTerms)}`,
    archive: `https://archive.org/search?query=${encodeURIComponent(searchTerms)}`,
  };
}

function renderDiscovery() {
  const people = getTreeData()?.people?.filter((person) => person.birthPlace || person.birthDate || person.deathDate) || [];
  if (!people.length) {
    workspace.innerHTML = '<p class="empty-message">Parse a GEDCOM with life dates or places before opening ancestor research leads.</p>';
    return;
  }
  workspace.innerHTML = `
    <section class="ancestor-discovery">
      <p class="ancestor-discovery-intro">Select a person to explore their place and family-history research leads.</p>
      <div class="ancestor-discovery-grid">
        ${people.map((person) => {
          const links = getSearchLinks(person);
          const years = [extractYear(person.birthDate), extractYear(person.deathDate)].filter(Boolean).join(' - ');
          return `<article class="ancestor-card">
            <h4>${escapeHtml(person.name || person.id)}</h4>
            <p class="ancestor-meta">${escapeHtml([person.birthPlace, years].filter(Boolean).join(' · ') || 'Add a place or life date to tailor this lead.')}</p>
            <div class="ancestor-resource-links">
              <a class="btn-secondary" href="${links.youtube}" target="_blank" rel="noopener">Explore on YouTube</a>
              <a class="btn-secondary" href="${links.wikipedia}" target="_blank" rel="noopener">Search Wikipedia</a>
              <a class="btn-secondary" href="${links.archive}" target="_blank" rel="noopener">Search Internet Archive</a>
            </div>
          </article>`;
        }).join('')}
      </div>
    </section>
  `;
}

renderDiscovery();
