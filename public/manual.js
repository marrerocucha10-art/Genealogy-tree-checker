const STORAGE_KEY = 'familyTreeData';
const ERROR_PROGRESS_STORAGE_KEY = 'familyTreeErrorProgress';
const form = document.getElementById('familyForm');
const peopleList = document.getElementById('peopleList');
const status = document.getElementById('manualStatus');

function loadTreeData() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (stored && Array.isArray(stored.people)) return stored;
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
  }
  return { metadata: { header: { source: {}, gedcom: {} }, submitters: [] }, people: [], families: [], relationships: [], warnings: [], validationReport: { errors: [], warnings: [], info: [] }, fixHistory: [] };
}

function saveTreeData(treeData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(treeData));
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character]));
}

function renderPeople() {
  const treeData = loadTreeData();
  if (!treeData.people.length) {
    peopleList.innerHTML = '<p class="empty-message">No people have been added yet.</p>';
    return;
  }
  peopleList.innerHTML = `<ul class="manual-people-list">${treeData.people.map((person) => `
    <li><strong>${escapeHtml(person.name || person.id)}</strong><span>${escapeHtml(person.relation || person.sex || 'Family member')} · ${escapeHtml(person.birthYear || person.birthDate || 'Birth year unknown')}</span></li>
  `).join('')}</ul>`;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = document.getElementById('name').value.trim();
  const relation = document.getElementById('relation').value;
  const birthYear = document.getElementById('birthYear').value;
  if (!name || !relation) return;

  const treeData = loadTreeData();
  treeData.people.push({ id: `manual-${Date.now()}`, name, relation, birthYear: birthYear || 'Unknown', source: 'manual' });
  saveTreeData(treeData);
  localStorage.removeItem(ERROR_PROGRESS_STORAGE_KEY);
  form.reset();
  status.textContent = `${name} was added to your family tree.`;
  status.className = 'status-message success';
  renderPeople();
});

renderPeople();
