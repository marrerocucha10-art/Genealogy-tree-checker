const STORAGE_KEY = 'familyTreeData';
const LAYOUT_STORAGE_KEY = 'familyTreeLayout';
const MAX_GEDCOM_FILE_BYTES = 10 * 1024 * 1024;

let treeData = loadTreeData();
let treeLayout = localStorage.getItem(LAYOUT_STORAGE_KEY) || 'vertical';

const gedcomForm = document.getElementById('gedcomForm');
const gedcomFileInput = document.getElementById('gedcomFile');
const uploadStatus = document.getElementById('uploadStatus');
const familyForm = document.getElementById('familyForm');
const nameInput = document.getElementById('name');
const relationInput = document.getElementById('relation');
const birthYearInput = document.getElementById('birthYear');
const familyTreeDiv = document.getElementById('familyTree');
const clearTreeButton = document.getElementById('clearTree');
const printTreeButton = document.getElementById('printTree');
const layoutButtons = document.querySelectorAll('[data-layout]');

layoutButtons.forEach((button) => {
  button.addEventListener('click', () => {
    treeLayout = button.dataset.layout;
    localStorage.setItem(LAYOUT_STORAGE_KEY, treeLayout);
    updateLayoutButtons();
    renderFamilyTree();
  });
});

function updateLayoutButtons() {
  layoutButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.layout === treeLayout);
  });
}

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
    const gedcom = await readGedcomFile(file);
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

printTreeButton.addEventListener('click', () => {
  if (!treeData.people.length) {
    setStatus('Upload or add family members before printing the tree.', 'error');
    return;
  }

  window.print();
});

clearTreeButton.addEventListener('click', () => {
  if (!treeData.people.length || confirm('Clear the current family tree?')) {
    treeData = createEmptyTreeData();
    saveTreeData();
    renderFamilyTree();
    setStatus('', 'info');
  }
});


async function readGedcomFile(file) {
  if (file.size > MAX_GEDCOM_FILE_BYTES) {
    throw new Error('GEDCOM file is too large. Maximum size is 10 MB.');
  }

  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.zip') || fileName.endsWith('.gz')) {
    throw new Error('This looks like a compressed download. Extract it first, then upload the .ged or .gedcom file inside.');
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 4));

  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    throw new Error('This looks like a ZIP download. Extract it first, then upload the .ged or .gedcom file inside.');
  }

  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    throw new Error('This looks like a compressed GZIP download. Extract it first, then upload the .ged or .gedcom file inside.');
  }

  const decoders = getGedcomDecoders(bytes);
  let fallbackText = '';

  for (const decoder of decoders) {
    try {
      const text = new TextDecoder(decoder, { fatal: decoder !== 'windows-1252' }).decode(buffer);
      const normalized = text.replace(/^\uFEFF/, '').replace(/\u0000/g, '');

      if (looksLikeGedcom(normalized)) return normalized;
      if (!fallbackText) fallbackText = normalized;
    } catch (error) {
      // Try the next common GEDCOM encoding.
    }
  }

  if (fallbackText.trim()) return fallbackText;

  throw new Error('Could not read this GEDCOM file. Try exporting it as GEDCOM 5.5/5.5.1 plain text, then upload the .ged file.');
}

function getGedcomDecoders(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return ['utf-16le'];
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return ['utf-16be'];
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return ['utf-8'];

  return ['utf-8', 'utf-16le', 'utf-16be', 'windows-1252'];
}

function looksLikeGedcom(text) {
  const start = text.replace(/^\uFEFF/, '').trimStart().slice(0, 200).toUpperCase();
  return start.startsWith('0 HEAD') || /^0\s+@[^@]+@\s+(INDI|FAM|SUBM)/.test(start);
}

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
  const connectedIds = new Set();
  const treeCharts = treeData.families.map((family, index) => {
    [family.husbandId, family.wifeId, ...(family.childrenIds || [])].filter(Boolean).forEach((id) => connectedIds.add(id));
    return renderFamilyTreeChart(family, peopleById, index + 1);
  }).join('');
  const unconnectedPeople = treeData.families.length
    ? treeData.people.filter((person) => !connectedIds.has(person.id))
    : treeData.people;

  familyTreeDiv.classList.toggle('horizontal-layout', treeLayout === 'horizontal');
  familyTreeDiv.classList.toggle('vertical-layout', treeLayout !== 'horizontal');

  familyTreeDiv.innerHTML = `
    ${renderSummary()}
    ${renderGedcomInfo()}
    ${treeData.warnings.length ? renderWarnings() : ''}
    ${treeCharts || `<section class="tree-chart standalone-people"><h3>People</h3><div class="children-row">${unconnectedPeople.map(renderPersonNode).join('')}</div></section>`}
    ${treeCharts && unconnectedPeople.length ? `<section class="tree-chart standalone-people"><h3>Unconnected People</h3><div class="children-row">${unconnectedPeople.map(renderPersonNode).join('')}</div></section>` : ''}
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

function renderFamilyTreeChart(family, peopleById, familyNumber) {
  const parents = [family.husbandId, family.wifeId]
    .filter(Boolean)
    .map((id) => peopleById.get(id))
    .filter(Boolean);
  const children = (family.childrenIds || [])
    .map((id) => peopleById.get(id))
    .filter(Boolean);

  return `
    <section class="tree-chart ${treeLayout === 'horizontal' ? 'tree-chart-horizontal' : 'tree-chart-vertical'}">
      <div class="family-heading">
        <h3>Family ${familyNumber}</h3>
        <span>${escapeHtml(family.id)}</span>
      </div>
      ${renderFamilyFacts(family)}
      <div class="parents-row ${parents.length === 1 ? 'single-parent' : ''}">
        ${parents.length ? parents.map((person) => renderPersonNode(person, 'parent')).join('') : '<p class="muted">No parents or spouses listed.</p>'}
      </div>
      ${children.length ? `
        <div class="tree-connector" aria-hidden="true"><span></span></div>
        <div class="children-row">
          ${children.map((person) => renderPersonNode(person, 'child')).join('')}
        </div>
      ` : '<p class="muted centered">No children listed for this family.</p>'}
    </section>
  `;
}

function renderFamilyFacts(family) {
  const marriage = [family.marriage?.date, family.marriage?.place].filter(Boolean).join(' · ');
  const divorce = [family.divorce?.date, family.divorce?.place].filter(Boolean).join(' · ');
  const notes = family.notes?.length ? family.notes.join(' | ') : '';

  if (!marriage && !divorce && !notes) return '';

  return `
    <div class="family-facts">
      ${marriage ? `<p><strong>Married:</strong> ${escapeHtml(marriage)}</p>` : ''}
      ${divorce ? `<p><strong>Divorced:</strong> ${escapeHtml(divorce)}</p>` : ''}
      ${notes ? `<p><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ''}
    </div>
  `;
}

function renderPersonNode(person, role = '') {
  const label = person.source === 'manual' ? person.relation : person.sex;
  const birthDate = person.birthDate || person.birthYear || 'Unknown';
  const birthPlace = person.birthPlace || 'Unknown';
  const deathDate = person.deathDate || '';
  const deathPlace = person.deathPlace || '';

  return `
    <article class="person-node ${escapeHtml(role)}">
      <button class="btn-remove node-remove" type="button" data-remove-person-id="${escapeHtml(person.id)}" aria-label="Remove ${escapeHtml(person.name)}">×</button>
      <h4>${escapeHtml(person.name)}</h4>
      <dl class="person-details">
        <div><dt>GEDCOM ID</dt><dd>${escapeHtml(person.id)}</dd></div>
        <div><dt>Sex / Relation</dt><dd><span class="relation-badge">${escapeHtml(label || 'Unknown')}</span></dd></div>
        <div><dt>Birth date</dt><dd>${escapeHtml(birthDate)}</dd></div>
        <div><dt>Birth place</dt><dd>${escapeHtml(birthPlace)}</dd></div>
        ${deathDate ? `<div><dt>Death date</dt><dd>${escapeHtml(deathDate)}</dd></div>` : ''}
        ${deathPlace ? `<div><dt>Death place</dt><dd>${escapeHtml(deathPlace)}</dd></div>` : ''}
        ${person.notes?.length ? `<div><dt>Notes</dt><dd>${escapeHtml(person.notes.join(' | '))}</dd></div>` : ''}
      </dl>
    </article>
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

document.addEventListener('DOMContentLoaded', () => {
  updateLayoutButtons();
  renderFamilyTree();
});
