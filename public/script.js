const STORAGE_KEY = 'familyTreeData';

let treeData = loadTreeData();

const gedcomForm = document.getElementById('gedcomForm');
const gedcomFileInput = document.getElementById('gedcomFile');
const uploadStatus = document.getElementById('uploadStatus');
const familyForm = document.getElementById('familyForm');
const nameInput = document.getElementById('name');
const relationInput = document.getElementById('relation');
const birthYearInput = document.getElementById('birthYear');
const familyTreeDiv = document.getElementById('familyTree');
const clearTreeButton = document.getElementById('clearTree');

familyTreeDiv.addEventListener('click', (event) => {
  const removeButton = event.target.closest('[data-remove-person-id]');
  if (!removeButton) return;

  removeMember(removeButton.dataset.removePersonId);
});

gedcomForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const file = gedcomFileInput.files[0];
  if (!file) return;

  setStatus('Reading GEDCOM file...', 'info');

  try {
    const gedcom = await file.text();
    const response = await fetch('/api/parse-gedcom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gedcom }),
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Could not parse GEDCOM file.');
    }

    treeData = normalizeParsedGedcom(result.parsed);
    saveTreeData();
    renderFamilyTree();

    const { people, families, relationships } = result.parsed.stats;
    const warningText = result.parsed.warnings.length
      ? ` ${result.parsed.warnings.length} warning(s) found.`
      : '';
    setStatus(`Imported ${people} people, ${families} families, and ${relationships} relationships.${warningText}`, 'success');
    gedcomForm.reset();
  } catch (error) {
    setStatus(error.message, 'error');
  }
});

familyForm.addEventListener('submit', (event) => {
  event.preventDefault();
  
  const name = nameInput.value.trim();
  if (!name) return;

  treeData.people.push({
    id: `manual-${Date.now()}`,
    name,
    relation: relationInput.value,
    birthYear: birthYearInput.value || 'Unknown',
    source: 'manual',
  });

  saveTreeData();
  renderFamilyTree();
  familyForm.reset();
  nameInput.focus();
});

clearTreeButton.addEventListener('click', () => {
  if (!treeData.people.length || confirm('Clear the current family tree?')) {
    treeData = createEmptyTreeData();
    saveTreeData();
    renderFamilyTree();
    setStatus('', 'info');
  }
});

function createEmptyTreeData() {
  return {
    metadata: { header: { source: {}, gedcom: {} }, submitters: [] },
    people: [],
    families: [],
    relationships: [],
    warnings: [],
  };
}

function loadTreeData() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored && Array.isArray(stored.people)) {
      return {
        metadata: stored.metadata || { header: { source: {}, gedcom: {} }, submitters: [] },
        people: stored.people || [],
        families: stored.families || [],
        relationships: stored.relationships || [],
        warnings: stored.warnings || [],
      };
    }
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
  }

  return createEmptyTreeData();
}

function saveTreeData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(treeData));
}

function normalizeParsedGedcom(parsed) {
  return {
    metadata: parsed.metadata || { header: { source: {}, gedcom: {} }, submitters: [] },
    people: parsed.people.map((person) => ({
      id: person.id,
      name: person.name?.display || person.id,
      sex: person.sex || 'Unknown',
      birthDate: person.birth?.date || '',
      birthPlace: person.birth?.place || '',
      deathDate: person.death?.date || '',
      deathPlace: person.death?.place || '',
      familyAsChild: person.familyAsChild || [],
      familyAsSpouse: person.familyAsSpouse || [],
      notes: person.notes || [],
      source: 'gedcom',
    })),
    families: parsed.families || [],
    relationships: parsed.relationships || [],
    warnings: parsed.warnings || [],
  };
}

function renderFamilyTree() {
  if (treeData.people.length === 0) {
    familyTreeDiv.innerHTML = '<p class="empty-message">No family members added yet. Upload a GEDCOM file or add someone manually.</p>';
    return;
  }

  const peopleById = new Map(treeData.people.map((person) => [person.id, person]));
  const familyCards = treeData.families.map((family) => renderFamilyCard(family, peopleById)).join('');
  const ungroupedPeople = treeData.families.length
    ? treeData.people.filter((person) => !isPersonInFamily(person.id))
    : treeData.people;

  familyTreeDiv.innerHTML = `
    ${renderSummary()}
    ${renderGedcomInfo()}
    ${treeData.warnings.length ? renderWarnings() : ''}
    ${familyCards}
    ${ungroupedPeople.length ? `<h3 class="group-title">People</h3>${ungroupedPeople.map(renderPersonCard).join('')}` : ''}
  `;
}

function renderSummary() {
  return `
    <div class="tree-summary">
      <span><strong>${treeData.people.length}</strong> people</span>
      <span><strong>${treeData.families.length}</strong> families</span>
      <span><strong>${treeData.relationships.length}</strong> relationships</span>
    </div>
  `;
}

function renderGedcomInfo() {
  const header = treeData.metadata?.header || {};
  const source = header.source || {};
  const gedcom = header.gedcom || {};
  const submitters = treeData.metadata?.submitters || [];
  const rows = [
    ['GEDCOM version', [gedcom.version, gedcom.form].filter(Boolean).join(' · ')],
    ['Source', [source.name, source.version, source.productName, source.corporation].filter(Boolean).join(' · ')],
    ['File', header.file],
    ['Character set', header.characterSet],
    ['Destination', header.destination],
    ['Created', header.date],
    ['Submitter ID', header.submitterId],
  ].filter(([, value]) => value);

  if (!rows.length && !submitters.length) return '';

  return `
    <section class="gedcom-info">
      <h3>GEDCOM Information</h3>
      <dl>
        ${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}
      </dl>
      ${submitters.length ? `
        <h4>Submitters</h4>
        ${submitters.map((submitter) => `
          <div class="submitter-card">
            <p><strong>${escapeHtml(submitter.name || submitter.id)}</strong></p>
            ${submitter.address ? `<p>${escapeHtml(submitter.address).replace(/\n/g, '<br>')}</p>` : ''}
            ${submitter.phone ? `<p><strong>Phone:</strong> ${escapeHtml(submitter.phone)}</p>` : ''}
            ${submitter.email ? `<p><strong>Email:</strong> ${escapeHtml(submitter.email)}</p>` : ''}
          </div>
        `).join('')}
      ` : ''}
    </section>
  `;
}

function renderWarnings() {
  const warningItems = treeData.warnings.slice(0, 5).map((warning) => (
    `<li>Line ${warning.line}: ${escapeHtml(warning.message)}</li>`
  )).join('');
  const remaining = treeData.warnings.length > 5 ? `<li>${treeData.warnings.length - 5} more warning(s)</li>` : '';

  return `<div class="warnings"><strong>Import warnings</strong><ul>${warningItems}${remaining}</ul></div>`;
}

function renderFamilyCard(family, peopleById) {
  const parents = [family.husbandId, family.wifeId]
    .filter(Boolean)
    .map((id) => peopleById.get(id))
    .filter(Boolean);
  const children = (family.childrenIds || [])
    .map((id) => peopleById.get(id))
    .filter(Boolean);

  return `
    <article class="family-group">
      <h3>Family ${escapeHtml(family.id)}</h3>
      ${family.marriage?.date || family.marriage?.place ? `<p class="muted"><strong>Married:</strong> ${escapeHtml([family.marriage.date, family.marriage.place].filter(Boolean).join(' · '))}</p>` : ''}
      ${family.divorce?.date || family.divorce?.place ? `<p class="muted"><strong>Divorced:</strong> ${escapeHtml([family.divorce.date, family.divorce.place].filter(Boolean).join(' · '))}</p>` : ''}
      ${family.notes?.length ? `<p class="muted"><strong>Notes:</strong> ${escapeHtml(family.notes.join(' | '))}</p>` : ''}
      <div class="relationship-grid">
        <div>
          <h4>Parents / Spouses</h4>
          ${parents.length ? parents.map(renderPersonCard).join('') : '<p class="muted">No parents or spouses listed.</p>'}
        </div>
        <div>
          <h4>Children</h4>
          ${children.length ? children.map(renderPersonCard).join('') : '<p class="muted">No children listed.</p>'}
        </div>
      </div>
    </article>
  `;
}

function renderPersonCard(person) {
  const birth = [person.birthDate || person.birthYear, person.birthPlace].filter(Boolean).join(' · ') || 'Unknown';
  const death = [person.deathDate, person.deathPlace].filter(Boolean).join(' · ');
  const label = person.source === 'manual' ? person.relation : person.sex;

  return `
    <div class="family-member">
      <div class="member-info">
        <h3>${escapeHtml(person.name)}</h3>
        <p class="muted"><strong>GEDCOM ID:</strong> ${escapeHtml(person.id)}</p>
        <p><span class="relation-badge">${escapeHtml(label || 'Unknown')}</span></p>
        <p><strong>Born:</strong> ${escapeHtml(birth)}</p>
        ${death ? `<p><strong>Died:</strong> ${escapeHtml(death)}</p>` : ''}
        ${person.notes?.length ? `<p><strong>Notes:</strong> ${escapeHtml(person.notes.join(' | '))}</p>` : ''}
      </div>
      <button class="btn-remove" type="button" data-remove-person-id="${escapeHtml(person.id)}">Remove</button>
    </div>
  `;
}

function isPersonInFamily(personId) {
  return treeData.families.some((family) => (
    family.husbandId === personId ||
    family.wifeId === personId ||
    (family.childrenIds || []).includes(personId)
  ));
}

function removeMember(id) {
  if (!confirm('Remove this family member from the current tree?')) return;

  treeData.people = treeData.people.filter((person) => person.id !== id);
  treeData.families = treeData.families
    .map((family) => ({
      ...family,
      husbandId: family.husbandId === id ? null : family.husbandId,
      wifeId: family.wifeId === id ? null : family.wifeId,
      childrenIds: (family.childrenIds || []).filter((childId) => childId !== id),
    }))
    .filter((family) => family.husbandId || family.wifeId || family.childrenIds.length);
  treeData.relationships = treeData.relationships.filter((relationship) => (
    relationship.personId !== id && relationship.relatedPersonId !== id
  ));

  saveTreeData();
  renderFamilyTree();
}

function setStatus(message, type) {
  uploadStatus.textContent = message;
  uploadStatus.className = `status-message ${type || ''}`.trim();
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

document.addEventListener('DOMContentLoaded', renderFamilyTree);
