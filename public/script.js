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
const exportJsonButton = document.getElementById('exportJson');
const exportCsvButton = document.getElementById('exportCsv');
const copySummaryButton = document.getElementById('copySummary');
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

exportJsonButton.addEventListener('click', () => {
  if (!ensureTreeHasPeople('exporting JSON')) return;

  downloadFile('family-tree.json', JSON.stringify(treeData, null, 2), 'application/json');
  setStatus('Downloaded parsed tree JSON.', 'success');
});

exportCsvButton.addEventListener('click', () => {
  if (!ensureTreeHasPeople('exporting CSV')) return;

  downloadFile('family-tree-people.csv', buildPeopleCsv(), 'text/csv');
  setStatus('Downloaded people CSV.', 'success');
});

copySummaryButton.addEventListener('click', async () => {
  if (!ensureTreeHasPeople('copying a summary')) return;

  const summary = buildTreeSummary();
  try {
    await navigator.clipboard.writeText(summary);
    setStatus('Copied tree summary to clipboard.', 'success');
  } catch (error) {
    setStatus(summary, 'info');
  }
});

clearTreeButton.addEventListener('click', () => {
  if (!treeData.people.length || confirm('Clear the current family tree?')) {
    treeData = createEmptyTreeData();
    saveTreeData();
    renderFamilyTree();
    setStatus('', 'info');
  }
});


function ensureTreeHasPeople(action) {
  if (treeData.people.length) return true;

  setStatus(`Upload or add family members before ${action}.`, 'error');
  return false;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildPeopleCsv() {
  const headers = ['ID', 'Name', 'Sex/Relation', 'Birth Date', 'Birth Place', 'Death Date', 'Death Place', 'Notes'];
  const rows = treeData.people.map((person) => ([
    person.id,
    person.name,
    person.source === 'manual' ? person.relation : person.sex,
    person.birthDate || person.birthYear || '',
    person.birthPlace || '',
    person.deathDate || '',
    person.deathPlace || '',
    (person.notes || []).join(' | '),
  ]));

  return [headers, ...rows]
    .map((row) => row.map(formatCsvCell).join(','))
    .join('\n');
}

function formatCsvCell(value = '') {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildTreeSummary() {
  const header = treeData.metadata?.header || {};
  const source = header.source?.name ? ` Source: ${header.source.name}.` : '';

  return `Family tree: ${treeData.people.length} people, ${treeData.families.length} families, ${treeData.relationships.length} relationships.${source}`;
}

async function readGedcomFile(file) {
  if (file.size > MAX_GEDCOM_FILE_BYTES) {
    throw new Error('GEDCOM file is too large. Maximum size is 10 MB.');
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 4));
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.zip') || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    const zippedGedcom = await readGedcomFromZip(buffer);
    assertValidGedcomText(zippedGedcom);
    return zippedGedcom;
  }

  if (fileName.endsWith('.gz') || (bytes[0] === 0x1f && bytes[1] === 0x8b)) {
    throw new Error('GZIP GEDCOM downloads are not supported yet. Extract the .ged or .gedcom file first, then upload it.');
  }

  const gedcom = decodeGedcomBuffer(buffer, bytes);
  assertValidGedcomText(gedcom);
  return gedcom;
}

async function readGedcomFromZip(buffer) {
  const zipBytes = new Uint8Array(buffer);
  const entries = readZipEntries(zipBytes);
  const gedcomEntry = entries.find((entry) => /\.(ged|gedcom|ged\.txt|txt)$/i.test(entry.name));

  if (!gedcomEntry) {
    throw new Error('No .ged or .gedcom file was found inside this ZIP file.');
  }

  if (gedcomEntry.uncompressedSize > MAX_GEDCOM_FILE_BYTES) {
    throw new Error('The GEDCOM file inside this ZIP is too large. Maximum size is 10 MB.');
  }

  const data = await extractZipEntry(zipBytes, gedcomEntry);
  const bytes = new Uint8Array(data.slice(0, 4));
  return decodeGedcomBuffer(data, bytes);
}

function readZipEntries(zipBytes) {
  const eocdOffset = findEndOfCentralDirectory(zipBytes);
  if (eocdOffset === -1) {
    throw new Error('Could not read this ZIP file. Try extracting the .ged file and uploading it directly.');
  }

  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let offset = view.getUint32(eocdOffset + 16, true);
  const entries = [];

  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameBytes = zipBytes.slice(offset + 46, offset + 46 + nameLength);
    const name = new TextDecoder('utf-8').decode(nameBytes);

    if (!name.endsWith('/')) {
      entries.push({ name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(zipBytes) {
  for (let index = zipBytes.length - 22; index >= Math.max(0, zipBytes.length - 65557); index -= 1) {
    if (
      zipBytes[index] === 0x50 &&
      zipBytes[index + 1] === 0x4b &&
      zipBytes[index + 2] === 0x05 &&
      zipBytes[index + 3] === 0x06
    ) {
      return index;
    }
  }

  return -1;
}

async function extractZipEntry(zipBytes, entry) {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const offset = entry.localHeaderOffset;

  if (view.getUint32(offset, true) !== 0x04034b50) {
    throw new Error('Could not read the GEDCOM file inside this ZIP.');
  }

  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataStart = offset + 30 + nameLength + extraLength;
  const compressedData = zipBytes.slice(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressedData.buffer.slice(compressedData.byteOffset, compressedData.byteOffset + compressedData.byteLength);
  }

  if (entry.compressionMethod === 8 && 'DecompressionStream' in window) {
    const stream = new Response(compressedData).body.pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(stream).arrayBuffer();
  }

  throw new Error('This ZIP uses a compression method this browser cannot read. Extract the .ged file and upload it directly.');
}

function decodeGedcomBuffer(buffer, bytes) {
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

function validateGedcomText(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const parsedLines = lines.map(parseGedcomLine).filter(Boolean);
  const hasHeader = parsedLines.some((line) => line.level === 0 && line.tag === 'HEAD');
  const hasTrailer = parsedLines.some((line) => line.level === 0 && line.tag === 'TRLR');
  const hasRecords = parsedLines.some((line) => line.level === 0 && (line.tag === 'INDI' || line.tag === 'FAM'));
  const errors = [];

  if (!hasHeader) errors.push('Missing required GEDCOM header: 0 HEAD.');
  if (!hasTrailer) errors.push('Missing required GEDCOM trailer: 0 TRLR.');
  if (!hasRecords) errors.push('No individual or family records were found.');
  if (parsedLines.length < 3) errors.push('File does not contain enough GEDCOM records to parse.');

  return { valid: errors.length === 0, errors };
}

function assertValidGedcomText(text) {
  const validation = validateGedcomText(text);

  if (!validation.valid) {
    throw new Error(`This does not look like a valid GEDCOM file. ${validation.errors.join(' ')}`);
  }
}

function parseGedcomLine(line) {
  const match = String(line).match(/^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Z0-9_]+)(?:\s+(.*))?$/i);
  if (!match) return null;

  return {
    level: Number(match[1]),
    tag: match[3].toUpperCase(),
  };
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
