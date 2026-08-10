const STORAGE_KEY = 'familyTreeData';
const LAYOUT_STORAGE_KEY = 'familyTreeLayout';
const SUBSCRIPTION_STORAGE_KEY = 'familyTreeSubscriptionTier';
const BILLING_INTERVAL_STORAGE_KEY = 'familyTreeBillingInterval';
const STRIPE_CUSTOMER_STORAGE_KEY = 'familyTreeStripeCustomerId';
const MAX_GEDCOM_FILE_BYTES = 150 * 1024 * 1024;
const BLOB_UPLOAD_THRESHOLD_BYTES = 4.5 * 1024 * 1024;

let treeData = loadTreeData();
let treeLayout = localStorage.getItem(LAYOUT_STORAGE_KEY) || 'vertical';
let currentTier = localStorage.getItem(SUBSCRIPTION_STORAGE_KEY) || 'free';
let billingInterval = localStorage.getItem(BILLING_INTERVAL_STORAGE_KEY) || 'monthly';
let stripeConfig = null;
let storeUrl = '/store';
let stripeCustomerId = localStorage.getItem(STRIPE_CUSTOMER_STORAGE_KEY) || '';

const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    rank: 0,
    description: 'Try the GEDCOM parser with basic preview and basic issue report.',
    monthlyPrice: 0,
    annualPrice: 0,
    features: ['Small GEDCOM upload', 'Basic tree preview', 'Basic error report'],
  },
  personal: {
    name: 'Personal',
    rank: 1,
    description: 'For one family tree with print and export tools.',
    monthlyPrice: 19.99,
    annualPrice: 19.99,
    features: ['ZIP uploads', 'Print tree', 'Export JSON/CSV', 'Local fix records'],
  },
  pro: {
    name: 'Pro / Researcher',
    rank: 2,
    description: 'For deeper genealogy cleanup, reporting, and the Genealogy Pro Package included free with subscription.',
    monthlyPrice: 29.99,
    annualPrice: 29.99,
    features: ['Safe automatic fixes', 'Full correction report', 'Advanced validation workflow', 'Free Genealogy Pro Package included', 'Digital report package', 'Printed tree and chart package', 'Researcher review service package', 'Memory keepsake package', 'Research journals and worksheets'],
  },
  business: {
    name: 'Business / Genealogist',
    rank: 3,
    description: 'For client-facing genealogy workflows.',
    monthlyPrice: 39.99,
    annualPrice: 39.99,
    features: ['Client tree workflow', 'Branded reports roadmap', 'Higher limits roadmap'],
  },
};

const ACTION_REQUIREMENTS = {
  print: 'personal',
  exportJson: 'personal',
  exportCsv: 'personal',
  copySummary: 'personal',
  autoFix: 'pro',
};

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
const billingButtons = document.querySelectorAll('[data-billing-interval]');
const subscriptionPlansDiv = document.getElementById('subscriptionPlans');
const subscriptionStatusDiv = document.getElementById('subscriptionStatus');
const manageBillingButton = document.getElementById('manageBilling');
const goToStoreButton = document.getElementById('goToStore');

subscriptionPlansDiv.addEventListener('click', (event) => {
  const upgradeButton = event.target.closest('[data-upgrade-tier]');
  const previewButton = event.target.closest('[data-preview-tier]');

  if (upgradeButton) {
    startCheckout(upgradeButton.dataset.upgradeTier);
  }

  if (previewButton) {
    setPreviewTier(previewButton.dataset.previewTier);
  }
});

manageBillingButton.addEventListener('click', openBillingPortal);

if (goToStoreButton) {
  goToStoreButton.addEventListener('click', () => {
    window.open(storeUrl, '_blank', 'noopener');
  });
}

billingButtons.forEach((button) => {
  button.addEventListener('click', () => {
    billingInterval = button.dataset.billingInterval;
    localStorage.setItem(BILLING_INTERVAL_STORAGE_KEY, billingInterval);
    updateBillingButtons();
    renderSubscriptionPlans();
  });
});

layoutButtons.forEach((button) => {
  button.addEventListener('click', () => {
    treeLayout = button.dataset.layout;
    localStorage.setItem(LAYOUT_STORAGE_KEY, treeLayout);
    updateLayoutButtons();
    renderFamilyTree();
  });
});

function updateBillingButtons() {
  billingButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.billingInterval === billingInterval);
  });
}

function updateLayoutButtons() {
  layoutButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.layout === treeLayout);
  });
}

familyTreeDiv.addEventListener('click', (event) => {
  const removeButton = event.target.closest('[data-remove-person-id]');
  const autoFixButton = event.target.closest('[data-apply-auto-fixes]');
  const manualFixButton = event.target.closest('[data-show-manual-fixes]');

  if (removeButton) {
    removeMember(removeButton.dataset.removePersonId);
    return;
  }

  if (autoFixButton) {
    applyAutomaticFixes();
    return;
  }

  if (manualFixButton) {
    showManualFixes();
  }
});

gedcomForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const file = gedcomFileInput.files[0];
  if (!file) return;

  const previousTreeData = treeData;
  treeData = createEmptyTreeData();
  renderFamilyTree();

  try {
    let result;

    if (file.size > BLOB_UPLOAD_THRESHOLD_BYTES) {
      setStatus('Uploading GEDCOM file to storage...', 'info');
      const blobUrl = await uploadGedcomToBlob(file);

      setStatus('Parsing GEDCOM file...', 'info');
      let parseError;
      try {
        const response = await fetch('/api/parse-gedcom-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: blobUrl }),
        });
        result = await response.json();
        if (!result.success) throw new Error(result.error || 'Server could not parse this GEDCOM file.');
      } catch (err) {
        parseError = err;
      } finally {
        deleteBlob(blobUrl).catch(() => {});
      }
      if (parseError) throw parseError;
    } else {
      setStatus('Reading GEDCOM file...', 'info');
      const gedcom = await readGedcomFile(file);
      const cleanup = cleanupRepeatedGedcomRecords(gedcom);
      const parsed = parseGedcomInBrowser(cleanup.gedcom);
      result = {
        success: true,
        parsed,
        cleanup: {
          repeatedRecordsRemoved: cleanup.repeatedRecordsRemoved,
        },
      };
    }

    treeData = normalizeParsedGedcom(result.parsed);
    const savedLocally = saveTreeData();
    renderFamilyTree();

    const { people, families, relationships } = result.parsed.stats;
    const warningText = result.parsed.warnings.length
      ? ` ${result.parsed.warnings.length} warning(s) found.`
      : '';
    const cleanupText = result.cleanup?.repeatedRecordsRemoved
      ? ` Removed ${result.cleanup.repeatedRecordsRemoved} repeated GEDCOM record(s) before parsing.`
      : '';
    const storageText = savedLocally ? '' : ' This tree is too large for browser storage, so it will stay available only until this tab is refreshed.';
    setStatus(`Imported ${people} people, ${families} families, and ${relationships} relationships.${warningText}${cleanupText}${storageText}`, 'success');
    gedcomForm.reset();
  } catch (error) {
    treeData = previousTreeData;
    renderFamilyTree();
    const restoreText = previousTreeData.people.length
      ? ' Previous tree restored; no new GEDCOM was imported.'
      : ' No GEDCOM was imported.';
    setStatus(`${formatGedcomLoadError(error)}${restoreText}`, 'error');
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
  if (!requireTier('print')) return;
  if (!treeData.people.length) {
    setStatus('Upload or add family members before printing the tree.', 'error');
    return;
  }

  window.print();
});

exportJsonButton.addEventListener('click', () => {
  if (!requireTier('exportJson') || !ensureTreeHasPeople('exporting JSON')) return;

  downloadFile('family-tree.json', JSON.stringify(treeData, null, 2), 'application/json');
  setStatus('Downloaded parsed tree JSON.', 'success');
});

exportCsvButton.addEventListener('click', () => {
  if (!requireTier('exportCsv') || !ensureTreeHasPeople('exporting CSV')) return;

  downloadFile('family-tree-people.csv', buildPeopleCsv(), 'text/csv');
  setStatus('Downloaded people CSV.', 'success');
});

copySummaryButton.addEventListener('click', async () => {
  if (!requireTier('copySummary') || !ensureTreeHasPeople('copying a summary')) return;

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



async function loadSubscriptionConfig() {
  try {
    const response = await fetch('/api/subscription/config');
    const result = await response.json();
    stripeConfig = result.stripe || null;
    storeUrl = stripeConfig?.storeUrl || '/store';
  } catch (error) {
    stripeConfig = null;
  }

  renderSubscriptionPlans();
}

function renderSubscriptionPlans() {
  const intervalLabel = billingInterval === 'annual' ? 'Annual billing' : 'Monthly billing';
  subscriptionStatusDiv.textContent = `Current plan: ${SUBSCRIPTION_TIERS[currentTier]?.name || 'Free'} · ${intervalLabel}`;

  subscriptionPlansDiv.innerHTML = Object.entries(SUBSCRIPTION_TIERS).map(([tierId, tier]) => {
    const isCurrent = tierId === currentTier;
    const isFree = tierId === 'free';
    const stripeReady = isFree || stripeConfig?.configured && stripeConfig?.tiers?.[tierId]?.[billingInterval]?.configured;
    const price = billingInterval === 'annual' ? tier.annualPrice : tier.monthlyPrice;
    const priceLabel = isFree ? 'Free' : `$${price.toFixed(2)} / month${billingInterval === 'annual' ? ' billed annually' : ''}`;

    return `
      <article class="subscription-card ${isCurrent ? 'current' : ''}">
        <h3>${escapeHtml(tier.name)}</h3>
        <p class="plan-price">${escapeHtml(priceLabel)}</p>
        <p>${escapeHtml(tier.description)}</p>
        <ul>${tier.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>
        ${isCurrent ? '<span class="plan-badge">Current</span>' : ''}
        ${!isFree ? `<button type="button" class="btn-add" data-upgrade-tier="${tierId}">${stripeReady ? `Upgrade to ${escapeHtml(tier.name)}` : 'Stripe setup needed'}</button>` : ''}
        ${!isCurrent ? `<button type="button" class="btn-secondary" data-preview-tier="${tierId}">Preview as ${escapeHtml(tier.name)}</button>` : ''}
      </article>
    `;
  }).join('');
}

function hasTier(requiredTier) {
  const current = SUBSCRIPTION_TIERS[currentTier] || SUBSCRIPTION_TIERS.free;
  const required = SUBSCRIPTION_TIERS[requiredTier] || SUBSCRIPTION_TIERS.free;
  return current.rank >= required.rank;
}

function requireTier(action) {
  const requiredTier = ACTION_REQUIREMENTS[action];
  if (!requiredTier || hasTier(requiredTier)) return true;

  setStatus(`${SUBSCRIPTION_TIERS[requiredTier].name} subscription required for this action. Choose a plan above to upgrade.`, 'error');
  return false;
}

function setPreviewTier(tierId) {
  if (!SUBSCRIPTION_TIERS[tierId]) return;

  currentTier = tierId;
  localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, currentTier);
  renderSubscriptionPlans();
  setStatus(`Previewing ${SUBSCRIPTION_TIERS[tierId].name} workflow locally. Use Stripe Checkout to activate this for real customers.`, 'info');
}

async function startCheckout(tierId) {
  if (!SUBSCRIPTION_TIERS[tierId] || tierId === 'free') return;

  try {
    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: tierId, interval: billingInterval }),
    });
    const result = await response.json();

    if (!response.ok || !result.success) throw new Error(result.error || 'Could not start checkout.');
    window.location.href = result.url;
  } catch (error) {
    setStatus(`${error.message} For preview, use “Preview as ${SUBSCRIPTION_TIERS[tierId].name}”.`, 'error');
  }
}

async function openBillingPortal() {
  if (!stripeCustomerId) {
    setStatus('Open billing after a successful Stripe checkout. The app will save your Stripe customer ID locally.', 'info');
    return;
  }

  try {
    const response = await fetch('/api/create-portal-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: stripeCustomerId }),
    });
    const result = await response.json();

    if (!response.ok || !result.success) throw new Error(result.error || 'Could not open billing portal.');
    window.location.href = result.url;
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function loadSubscriptionStatusFromCustomer() {
  if (!stripeCustomerId) return;

  try {
    const response = await fetch(`/api/subscription/status?customerId=${encodeURIComponent(stripeCustomerId)}`);
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Could not load subscription status.');

    applySubscriptionStatus(result.subscription, false);
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function applySubscriptionStatus(subscription, showMessage = true) {
  if (!subscription) return;

  currentTier = subscription.active ? subscription.tier : 'free';
  billingInterval = subscription.interval || billingInterval;
  if (subscription.customerId) {
    stripeCustomerId = subscription.customerId;
    localStorage.setItem(STRIPE_CUSTOMER_STORAGE_KEY, stripeCustomerId);
  }
  localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, currentTier);
  localStorage.setItem(BILLING_INTERVAL_STORAGE_KEY, billingInterval);
  updateBillingButtons();
  renderSubscriptionPlans();

  if (showMessage) {
    setStatus(`Stripe subscription active: ${SUBSCRIPTION_TIERS[currentTier]?.name || 'Free'} (${billingInterval}).`, 'success');
  }
}

async function applyCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  const fallbackTier = params.get('subscription');
  const fallbackInterval = params.get('interval');

  if (params.get('checkout') !== 'success') return;

  if (sessionId) {
    try {
      const response = await fetch(`/api/subscription/status?session_id=${encodeURIComponent(sessionId)}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not confirm Stripe subscription.');

      applySubscriptionStatus(result.subscription);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  if (SUBSCRIPTION_TIERS[fallbackTier]) {
    currentTier = fallbackTier;
    billingInterval = ['monthly', 'annual'].includes(fallbackInterval) ? fallbackInterval : billingInterval;
    localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, currentTier);
    localStorage.setItem(BILLING_INTERVAL_STORAGE_KEY, billingInterval);
    updateBillingButtons();
    renderSubscriptionPlans();
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

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


function formatGedcomLoadError(error) {
  const message = error?.message || String(error || 'Unable to load GEDCOM file.');
  if (/expected pattern/i.test(message)) {
    return 'Safari could not decode this file format. If this is a ZIP, extract the .ged file and upload the .ged file directly. If it is already a .ged file, export it as GEDCOM 5.5 or 5.5.1 plain text and try again.';
  }
  return message;
}

async function uploadGedcomToBlob(file) {
  const tokenRes = await fetch('/api/blob/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'blob.generate-client-token',
      payload: {
        pathname: file.name,
        callbackUrl: `${window.location.origin}/api/blob/upload`,
        clientPayload: null,
        multipart: false,
      },
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}));
    throw new Error(err.error || 'Could not get a Vercel Blob upload token. Add BLOB_READ_WRITE_TOKEN in Vercel Environment Variables.');
  }

  const { clientToken } = await tokenRes.json();
  if (!clientToken) {
    throw new Error('Server did not return a Vercel Blob client token.');
  }

  const params = new URLSearchParams({ pathname: file.name });
  const uploadRes = await fetch(`https://blob.vercel-storage.com/?${params}`, {
    method: 'PUT',
    headers: {
      authorization: 'Bearer ' + clientToken,
      'x-api-version': '12',
      'x-content-type': file.type || 'application/octet-stream',
      'x-add-random-suffix': '1',
      'x-content-length': String(file.size),
    },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error('Could not upload GEDCOM file to Vercel Blob storage.');
  }

  const blob = await uploadRes.json();
  return blob.url;
}

async function deleteBlob(url) {
  await fetch('/api/blob/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

async function readGedcomFile(file) {
  if (file.size > MAX_GEDCOM_FILE_BYTES) {
    throw new Error('GEDCOM file is too large. Maximum size is 150 MB.');
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
    throw new Error('The GEDCOM file inside this ZIP is too large. Maximum size is 150 MB.');
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
    try {
      const stream = new Response(compressedData).body.pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(stream).arrayBuffer();
    } catch (error) {
      try {
        const stream = new Response(compressedData).body.pipeThrough(new DecompressionStream('deflate'));
        return await new Response(stream).arrayBuffer();
      } catch (fallbackError) {
        throw new Error('This browser could not read the compressed ZIP GEDCOM. Extract the .ged file from the ZIP, then upload the .ged file directly.');
      }
    }
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


function splitGedcomRecords(gedcom) {
  const normalized = String(gedcom || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const records = [];
  let current = [];

  for (const line of lines) {
    if (/^0\s+/.test(line) && current.length) {
      records.push(current);
      current = [];
    }
    current.push(line);
  }

  if (current.length) records.push(current);
  return records;
}

function normalizeGedcomRecord(lines) {
  return lines
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
    .join('\n');
}

function cleanupRepeatedGedcomRecords(gedcom) {
  const records = splitGedcomRecords(gedcom);
  const seen = new Set();
  const cleanedRecords = [];
  let repeatedRecordsRemoved = 0;

  for (const record of records) {
    const firstLine = record.find((line) => line.trim()) || '';
    const isTopLevelEntity = /^0\s+@[^@]+@\s+(INDI|FAM|SUBM|NOTE|SOUR|REPO|OBJE)\b/i.test(firstLine);
    const key = isTopLevelEntity ? normalizeGedcomRecord(record) : '';

    if (key) {
      if (seen.has(key)) {
        repeatedRecordsRemoved += 1;
        continue;
      }
      seen.add(key);
    }

    cleanedRecords.push(record);
  }

  return {
    gedcom: cleanedRecords.map((record) => record.join('\n')).join('\n'),
    repeatedRecordsRemoved,
  };
}

function cleanGedcomValue(value = '') {
  return String(value).trim();
}

function normalizeGedcomName(value = '') {
  const raw = cleanGedcomValue(value);
  const display = raw.replace(/\//g, '').replace(/\s+/g, ' ').trim();
  const surnameMatch = raw.match(/\/([^/]+)\//);

  return {
    raw,
    display,
    surname: surnameMatch ? surnameMatch[1].trim() : '',
    given: surnameMatch ? raw.slice(0, surnameMatch.index).trim() : display,
  };
}

function parseFullGedcomLine(line) {
  const match = String(line).match(/^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Z0-9_]+)(?:\s+(.*))?$/i);
  if (!match) return null;

  return {
    level: Number(match[1]),
    xref: match[2] || null,
    tag: match[3].toUpperCase(),
    value: cleanGedcomValue(match[4] || ''),
  };
}

function ensureParsedPerson(peopleById, id) {
  if (!peopleById.has(id)) {
    peopleById.set(id, {
      id,
      name: null,
      sex: null,
      birth: {},
      death: {},
      notes: [],
      familyAsChild: [],
      familyAsSpouse: [],
    });
  }
  return peopleById.get(id);
}

function ensureParsedSubmitter(submittersById, id) {
  if (!submittersById.has(id)) {
    submittersById.set(id, { id, name: '', address: '', phone: '', email: '', notes: [] });
  }
  return submittersById.get(id);
}

function ensureParsedFamily(familiesById, id) {
  if (!familiesById.has(id)) {
    familiesById.set(id, {
      id,
      husbandId: null,
      wifeId: null,
      childrenIds: [],
      marriage: {},
      divorce: {},
      notes: [],
    });
  }
  return familiesById.get(id);
}

function setParsedEventValue(target, eventTag, childTag, value) {
  const eventNameByTag = { BIRT: 'birth', DEAT: 'death', MARR: 'marriage', DIV: 'divorce' };
  const eventName = eventNameByTag[eventTag];
  if (!eventName) return;
  target[eventName] = target[eventName] || {};
  if (childTag === 'DATE') target[eventName].date = value;
  if (childTag === 'PLAC') target[eventName].place = value;
}

function parseGedcomInBrowser(gedcomText) {
  assertValidGedcomText(gedcomText);

  const peopleById = new Map();
  const familiesById = new Map();
  const submittersById = new Map();
  const metadata = {
    header: {
      source: {},
      gedcom: {},
      destination: '',
      date: '',
      file: '',
      characterSet: '',
      submitterId: '',
    },
    submitters: [],
  };
  const warnings = [];
  const lines = String(gedcomText || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  let currentRecord = null;
  let currentEventTag = null;
  let currentHeaderSection = null;
  let currentTextTarget = null;

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const parsed = parseFullGedcomLine(lines[lineNumber]);
    if (!parsed) {
      if (lines[lineNumber].trim()) warnings.push({ line: lineNumber + 1, message: 'Skipped unrecognized GEDCOM line.' });
      continue;
    }

    const { level, xref, tag, value } = parsed;
    if (level === 0) {
      currentEventTag = null;
      currentHeaderSection = null;
      currentTextTarget = null;
      if (tag === 'HEAD') currentRecord = { type: 'HEAD', data: metadata.header };
      else if (xref && tag === 'SUBM') currentRecord = { type: 'SUBM', data: ensureParsedSubmitter(submittersById, xref) };
      else if (xref && tag === 'INDI') currentRecord = { type: 'INDI', data: ensureParsedPerson(peopleById, xref) };
      else if (xref && tag === 'FAM') currentRecord = { type: 'FAM', data: ensureParsedFamily(familiesById, xref) };
      else currentRecord = null;
      continue;
    }

    if (!currentRecord) continue;

    if (tag === 'CONT' || tag === 'CONC') {
      if (currentTextTarget) {
        const currentValue = currentTextTarget.object[currentTextTarget.key];
        const separator = tag === 'CONT' && currentValue ? '\n' : '';
        currentTextTarget.object[currentTextTarget.key] += `${separator}${value}`;
      }
      continue;
    }

    if (level === 1) {
      currentEventTag = null;
      currentHeaderSection = null;
      currentTextTarget = null;

      if (currentRecord.type === 'HEAD') {
        const header = currentRecord.data;
        if (tag === 'SOUR') { header.source.name = value; currentHeaderSection = 'SOUR'; }
        if (tag === 'GEDC') currentHeaderSection = 'GEDC';
        if (tag === 'DEST') header.destination = value;
        if (tag === 'DATE') header.date = value;
        if (tag === 'FILE') header.file = value;
        if (tag === 'CHAR') header.characterSet = value;
        if (tag === 'SUBM') header.submitterId = value;
      }

      if (currentRecord.type === 'SUBM') {
        const submitter = currentRecord.data;
        if (tag === 'NAME') submitter.name = value;
        if (tag === 'ADDR') { submitter.address = value; currentTextTarget = { object: submitter, key: 'address' }; }
        if (tag === 'PHON') submitter.phone = value;
        if (tag === 'EMAIL') submitter.email = value;
        if (tag === 'NOTE') { submitter.notes.push(value); currentTextTarget = { object: submitter.notes, key: submitter.notes.length - 1 }; }
      }

      if (currentRecord.type === 'INDI') {
        const person = currentRecord.data;
        if (tag === 'NAME') person.name = normalizeGedcomName(value);
        if (tag === 'SEX') person.sex = value || null;
        if (tag === 'FAMC' && value) person.familyAsChild.push(value);
        if (tag === 'FAMS' && value) person.familyAsSpouse.push(value);
        if (tag === 'NOTE') { person.notes.push(value); currentTextTarget = { object: person.notes, key: person.notes.length - 1 }; }
        if (tag === 'BIRT' || tag === 'DEAT') currentEventTag = tag;
      }

      if (currentRecord.type === 'FAM') {
        const family = currentRecord.data;
        if (tag === 'HUSB') family.husbandId = value || null;
        if (tag === 'WIFE') family.wifeId = value || null;
        if (tag === 'CHIL' && value) family.childrenIds.push(value);
        if (tag === 'NOTE') { family.notes.push(value); currentTextTarget = { object: family.notes, key: family.notes.length - 1 }; }
        if (tag === 'MARR' || tag === 'DIV') currentEventTag = tag;
      }
      continue;
    }

    if (level === 2 && currentRecord.type === 'HEAD' && currentHeaderSection === 'GEDC') {
      if (tag === 'VERS') currentRecord.data.gedcom.version = value;
      if (tag === 'FORM') currentRecord.data.gedcom.form = value;
      continue;
    }

    if (level === 2 && currentRecord.type === 'HEAD' && currentHeaderSection === 'SOUR') {
      if (tag === 'VERS') currentRecord.data.source.version = value;
      if (tag === 'NAME') currentRecord.data.source.productName = value;
      if (tag === 'CORP') currentRecord.data.source.corporation = value;
      continue;
    }

    if (level === 2 && currentEventTag && (tag === 'DATE' || tag === 'PLAC')) {
      setParsedEventValue(currentRecord.data, currentEventTag, tag, value);
    }
  }

  const people = Array.from(peopleById.values());
  const families = Array.from(familiesById.values());
  metadata.submitters = Array.from(submittersById.values());
  const relationships = [];

  for (const family of families) {
    const spouseIds = [family.husbandId, family.wifeId].filter(Boolean);
    if (spouseIds.length === 2) relationships.push({ type: 'spouse', personId: spouseIds[0], relatedPersonId: spouseIds[1], familyId: family.id });
    for (const childId of family.childrenIds) {
      for (const parentId of spouseIds) relationships.push({ type: 'parent-child', personId: parentId, relatedPersonId: childId, familyId: family.id });
    }
  }

  return {
    metadata,
    people,
    families,
    relationships,
    stats: { people: people.length, families: families.length, relationships: relationships.length, lines: lines.length },
    warnings,
  };
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
    const firstLines = String(text || '')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(' | ');
    const sampleText = firstLines ? ` First lines found: ${firstLines}` : '';
    throw new Error(`This does not look like a valid GEDCOM file. ${validation.errors.join(' ')}${sampleText}`);
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
    validationReport: createEmptyValidationReport(),
    fixHistory: [],
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
        validationReport: stored.validationReport || createEmptyValidationReport(),
        fixHistory: stored.fixHistory || [],
      };
    }
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
  }

  return createEmptyTreeData();
}

function saveTreeData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(treeData));
    return true;
  } catch (error) {
    console.warn('Tree is too large to save in browser storage:', error);
    return false;
  }
}

function normalizeParsedGedcom(parsed) {
  const normalized = {
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
    validationReport: createEmptyValidationReport(),
    fixHistory: [],
  };

  normalized.validationReport = analyzeTreeData(normalized);
  return normalized;
}


function createEmptyValidationReport() {
  return { errors: [], warnings: [], info: [] };
}

function analyzeTreeData(data) {
  const report = createEmptyValidationReport();
  const peopleById = new Map(data.people.map((person) => [person.id, person]));
  const familyById = new Map(data.families.map((family) => [family.id, family]));
  const duplicateGroups = new Map();

  for (const person of data.people) {
    const key = normalizeDuplicateKey(person);
    if (!key) continue;
    if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
    duplicateGroups.get(key).push(person);

    const birthYear = extractYear(person.birthDate || person.birthYear);
    const deathYear = extractYear(person.deathDate);

    if (birthYear && deathYear && deathYear < birthYear) {
      addIssue(report.errors, 'Date inconsistency', `${person.name} has a death year (${deathYear}) before birth year (${birthYear}).`, person.id, 'Manual fix: review the original record and correct either the birth date or death date.');
    }

    if (birthYear && birthYear > new Date().getFullYear()) {
      addIssue(report.errors, 'Date inconsistency', `${person.name} has a birth year in the future (${birthYear}).`, person.id, 'Manual fix: verify the source and correct the birth date.');
    }

    if (deathYear && deathYear > new Date().getFullYear()) {
      addIssue(report.errors, 'Date inconsistency', `${person.name} has a death year in the future (${deathYear}).`, person.id, 'Manual fix: verify the source and correct or remove the death date.');
    }

    if (birthYear && deathYear && deathYear - birthYear > 125) {
      addIssue(report.warnings, 'Date warning', `${person.name} appears to have lived ${deathYear - birthYear} years.`, person.id, 'Manual fix: confirm the birth and death dates with a source record.');
    }

    if (!person.birthPlace) {
      addIssue(report.warnings, 'Place warning', `${person.name} is missing a birth place.`, person.id, 'Manual fix: add the most specific known birth place from the source record.');
    } else if (isWeakPlace(person.birthPlace)) {
      addIssue(report.info, 'Place detail', `${person.name} has a very broad birth place: ${person.birthPlace}.`, person.id, 'Manual fix: expand the place if you know the city/county/state/country.');
    }

    if (person.deathDate && !person.deathPlace) {
      addIssue(report.warnings, 'Place warning', `${person.name} has a death date but no death place.`, person.id, 'Manual fix: add the death place from a death certificate, obituary, or burial record.');
    }

    for (const familyId of person.familyAsChild || []) {
      if (!familyById.has(familyId)) {
        addIssue(report.errors, 'Relationship inconsistency', `${person.name} references missing child-family ${familyId}.`, person.id, 'Automatic fix available: remove the broken family reference from this person.', { type: 'removeMissingFamilyRef', personId: person.id, field: 'familyAsChild', familyId });
      }
    }

    for (const familyId of person.familyAsSpouse || []) {
      if (!familyById.has(familyId)) {
        addIssue(report.errors, 'Relationship inconsistency', `${person.name} references missing spouse-family ${familyId}.`, person.id, 'Automatic fix available: remove the broken family reference from this person.', { type: 'removeMissingFamilyRef', personId: person.id, field: 'familyAsSpouse', familyId });
      }
    }
  }

  for (const matches of duplicateGroups.values()) {
    if (matches.length > 1) {
      addIssue(
        report.warnings,
        'Possible duplicate',
        `${matches.length} people share the same name and birth year: ${matches.map((person) => `${person.name} (${person.id})`).join(', ')}.`,
        '',
        'Manual fix: compare sources, merge duplicate people in your GEDCOM editor, then re-upload the corrected file.'
      );
    }
  }

  for (const family of data.families) {
    const parentIds = [family.husbandId, family.wifeId].filter(Boolean);

    if (!parentIds.length && (family.childrenIds || []).length) {
      addIssue(report.warnings, 'Relationship warning', `${family.id} has children but no parents/spouses listed.`, family.id, 'Manual fix: add the missing parent/spouse records or confirm this is an intentional child-only family.');
    }

    for (const personId of [...parentIds, ...(family.childrenIds || [])]) {
      if (!peopleById.has(personId)) {
        addIssue(report.errors, 'Relationship inconsistency', `${family.id} references missing person ${personId}.`, family.id, 'Automatic fix available: remove the missing person reference from this family.', { type: 'removeMissingPersonFromFamily', familyId: family.id, personId });
      }
    }

    for (const childId of family.childrenIds || []) {
      if (parentIds.includes(childId)) {
        addIssue(report.errors, 'Relationship inconsistency', `${childId} is listed as both parent/spouse and child in ${family.id}.`, family.id, 'Automatic fix available: remove this person from the child list and keep them as parent/spouse.', { type: 'removeChildFromFamily', familyId: family.id, childId });
      }

      const child = peopleById.get(childId);
      if (!child) continue;
      const childBirthYear = extractYear(child.birthDate || child.birthYear);

      for (const parentId of parentIds) {
        const parent = peopleById.get(parentId);
        if (!parent) continue;

        const parentBirthYear = extractYear(parent.birthDate || parent.birthYear);
        const parentDeathYear = extractYear(parent.deathDate);

        if (parentBirthYear && childBirthYear && childBirthYear < parentBirthYear) {
          addIssue(report.errors, 'Date inconsistency', `${child.name} appears born before parent ${parent.name}.`, family.id, 'Manual fix: verify the child and parent birth dates or the relationship link.');
        }

        if (parentBirthYear && childBirthYear && childBirthYear - parentBirthYear < 12) {
          addIssue(report.warnings, 'Date warning', `${parent.name} appears younger than 12 when ${child.name} was born.`, family.id, 'Manual fix: verify dates and confirm the parent-child relationship.');
        }

        if (parentDeathYear && childBirthYear && childBirthYear > parentDeathYear + 1) {
          addIssue(report.errors, 'Date inconsistency', `${child.name} appears born after parent ${parent.name} died.`, family.id, 'Manual fix: verify the parent death date, child birth date, and relationship link.');
        }
      }
    }
  }

  if (!report.errors.length && !report.warnings.length && !report.info.length) {
    report.info.push({ category: 'No issues found', message: 'No duplicate, date, relationship, or place issues were detected by the current checks.', suggestion: 'No fix needed.' });
  }

  return report;
}

function normalizeDuplicateKey(person) {
  const name = String(person.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const birthYear = extractYear(person.birthDate || person.birthYear) || 'unknown';
  if (!name || name === String(person.id).toLowerCase().replace(/[^a-z0-9]/g, '')) return '';
  return `${name}|${birthYear}`;
}

function extractYear(value = '') {
  const match = String(value).match(/\b(\d{3,4})\b/);
  return match ? Number(match[1]) : null;
}

function isWeakPlace(place = '') {
  const parts = String(place).split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length < 2;
}

function addIssue(collection, category, message, subject = '', suggestion = 'Manual fix: review this record in your source GEDCOM editor.', autoFix = null) {
  collection.push({ category, message, subject, suggestion, autoFix });
}


function getAllIssues() {
  const report = treeData.validationReport || createEmptyValidationReport();
  return [...report.errors, ...report.warnings, ...report.info];
}

function getAutomaticFixIssues() {
  return getAllIssues().filter((issue) => issue.autoFix);
}

function getAutomaticFixes() {
  return getAutomaticFixIssues().map((issue) => issue.autoFix);
}

function applyAutomaticFixes() {
  if (!requireTier('autoFix')) return;

  const fixIssues = getAutomaticFixIssues();
  if (!fixIssues.length) {
    setStatus('No safe automatic fixes are available. Use manual fixes for the remaining issues.', 'info');
    return;
  }

  const appliedRecords = [];

  for (const issue of fixIssues) {
    const fix = issue.autoFix;
    let applied = false;
    if (fix.type === 'removeMissingFamilyRef') {
      const person = treeData.people.find((item) => item.id === fix.personId);
      if (person && Array.isArray(person[fix.field])) {
        const before = person[fix.field].length;
        person[fix.field] = person[fix.field].filter((familyId) => familyId !== fix.familyId);
        applied = person[fix.field].length !== before;
      }
    }

    if (fix.type === 'removeMissingPersonFromFamily') {
      const family = treeData.families.find((item) => item.id === fix.familyId);
      if (family) {
        const before = JSON.stringify({ husbandId: family.husbandId, wifeId: family.wifeId, childrenIds: family.childrenIds || [] });
        if (family.husbandId === fix.personId) family.husbandId = null;
        if (family.wifeId === fix.personId) family.wifeId = null;
        family.childrenIds = (family.childrenIds || []).filter((childId) => childId !== fix.personId);
        const after = JSON.stringify({ husbandId: family.husbandId, wifeId: family.wifeId, childrenIds: family.childrenIds || [] });
        applied = before !== after;
      }
    }

    if (fix.type === 'removeChildFromFamily') {
      const family = treeData.families.find((item) => item.id === fix.familyId);
      if (family) {
        const before = family.childrenIds?.length || 0;
        family.childrenIds = (family.childrenIds || []).filter((childId) => childId !== fix.childId);
        applied = family.childrenIds.length !== before;
      }
    }
    if (applied) {
      appliedRecords.push({
        time: new Date().toISOString(),
        category: issue.category,
        subject: issue.subject || '',
        problem: issue.message,
        fix: issue.suggestion.replace(/^Automatic fix available:\s*/i, ''),
      });
    }
  }

  treeData.fixHistory = [...(treeData.fixHistory || []), ...appliedRecords];
  treeData.validationReport = analyzeTreeData(treeData);
  saveTreeData();
  renderFamilyTree();
  setStatus(`Applied ${appliedRecords.length} safe automatic fix(es). Review the Fix Record and remaining manual fixes.`, 'success');

  if (appliedRecords.length && confirm('Safe fixes were applied. Do you want a printout of the fixed family tree and fix record?')) {
    window.print();
  }
}

function showManualFixes() {
  const manualSuggestions = getAllIssues()
    .filter((issue) => !issue.autoFix && issue.suggestion)
    .map((issue) => `${issue.category}: ${issue.suggestion}`);

  if (!manualSuggestions.length) {
    setStatus('No manual fixes are currently listed.', 'info');
    return;
  }

  setStatus(`Manual fix suggestions: ${manualSuggestions.slice(0, 5).join(' | ')}${manualSuggestions.length > 5 ? ' | More suggestions are listed in the report.' : ''}`, 'info');
}

function renderFamilyTree() {
  if (treeData.people.length === 0) {
    familyTreeDiv.innerHTML = '<p class="empty-message">No family members added yet. Upload a GEDCOM file or add someone manually.</p>';
    return;
  }

  const peopleById = new Map(treeData.people.map((person) => [person.id, person]));
  const generationData = buildGenerationData(peopleById);
  const unconnectedPeople = treeData.families.length
    ? treeData.people.filter((person) => !generationData.connectedIds.has(person.id))
    : treeData.people;

  familyTreeDiv.classList.toggle('horizontal-layout', treeLayout === 'horizontal');
  familyTreeDiv.classList.toggle('vertical-layout', treeLayout !== 'horizontal');

  familyTreeDiv.innerHTML = `
    ${renderSummary(generationData)}
    ${renderGedcomInfo()}
    ${treeData.warnings.length ? renderWarnings() : ''}
    ${renderValidationReport()}
    ${renderFixHistory()}
    ${renderGenerationSections(generationData, peopleById)}
    ${!treeData.families.length ? `<section class="tree-chart standalone-people"><h3>People</h3><div class="children-row">${unconnectedPeople.map(renderPersonNode).join('')}</div></section>` : ''}
    ${treeData.families.length && unconnectedPeople.length ? `<section class="tree-chart standalone-people"><h3>Unconnected People</h3><div class="children-row">${unconnectedPeople.map(renderPersonNode).join('')}</div></section>` : ''}
  `;
}

function renderSummary(generationData = null) {
  const generationCount = generationData ? generationData.generations.length : 0;

  return `
    <div class="tree-summary">
      <span><strong>${treeData.people.length}</strong> people</span>
      <span><strong>${treeData.families.length}</strong> families</span>
      <span><strong>${treeData.relationships.length}</strong> relationships</span>
      ${generationCount ? `<span><strong>${generationCount}</strong> generation group${generationCount === 1 ? '' : 's'}</span>` : ''}
    </div>
  `;
}


function buildGenerationData(peopleById) {
  const connectedIds = new Set();
  const parentToChildren = new Map();
  const childToParents = new Map();

  for (const family of treeData.families) {
    const parentIds = [family.husbandId, family.wifeId].filter((id) => id && peopleById.has(id));
    const childIds = (family.childrenIds || []).filter((id) => id && peopleById.has(id));
    [...parentIds, ...childIds].forEach((id) => connectedIds.add(id));

    for (const parentId of parentIds) {
      if (!parentToChildren.has(parentId)) parentToChildren.set(parentId, new Set());
      childIds.forEach((childId) => parentToChildren.get(parentId).add(childId));
    }

    for (const childId of childIds) {
      if (!childToParents.has(childId)) childToParents.set(childId, new Set());
      parentIds.forEach((parentId) => childToParents.get(childId).add(parentId));
    }
  }

  const generationByPerson = new Map();
  const rootIds = [...connectedIds].filter((id) => !childToParents.has(id) || childToParents.get(id).size === 0);
  const queue = (rootIds.length ? rootIds : [...connectedIds]).map((id) => ({ id, generation: 1 }));

  while (queue.length) {
    const { id, generation } = queue.shift();
    const knownGeneration = generationByPerson.get(id);
    if (knownGeneration && knownGeneration <= generation) continue;

    generationByPerson.set(id, generation);
    for (const childId of parentToChildren.get(id) || []) {
      queue.push({ id: childId, generation: generation + 1 });
    }
  }

  for (const id of connectedIds) {
    if (!generationByPerson.has(id)) generationByPerson.set(id, 1);
  }

  const familyRows = treeData.families.map((family, index) => {
    const memberGenerations = [family.husbandId, family.wifeId, ...(family.childrenIds || [])]
      .filter(Boolean)
      .map((id) => generationByPerson.get(id))
      .filter(Boolean);
    const parentGenerations = [family.husbandId, family.wifeId]
      .filter(Boolean)
      .map((id) => generationByPerson.get(id))
      .filter(Boolean);

    return {
      family,
      index,
      generation: parentGenerations[0] || Math.min(...memberGenerations, 1),
    };
  });

  const generations = [...new Set(familyRows.map((row) => row.generation))].sort((a, b) => a - b);
  return { connectedIds, generationByPerson, familyRows, generations };
}

function renderGenerationSections(generationData, peopleById) {
  if (!generationData.familyRows.length) return '';

  const firstSeven = generationData.familyRows.filter((row) => row.generation <= 7);
  const later = generationData.familyRows.filter((row) => row.generation > 7);

  return `
    <section class="generation-block primary-generations">
      <div class="generation-heading">
        <h3>First 7 Generations</h3>
        <span>${firstSeven.length} family group${firstSeven.length === 1 ? '' : 's'}</span>
      </div>
      ${firstSeven.length ? renderGenerationGroups(firstSeven, peopleById) : '<p class="muted">No connected family groups were found in generations 1–7.</p>'}
    </section>
    ${later.length ? `
      <section class="generation-block later-generations">
        <div class="generation-heading">
          <h3>Remaining Generations</h3>
          <span>Generations 8+ · ${later.length} family group${later.length === 1 ? '' : 's'}</span>
        </div>
        ${renderGenerationGroups(later, peopleById)}
      </section>
    ` : ''}
  `;
}

function renderGenerationGroups(familyRows, peopleById) {
  const generations = [...new Set(familyRows.map((row) => row.generation))].sort((a, b) => a - b);

  return generations.map((generation) => {
    const rows = familyRows.filter((row) => row.generation === generation);
    return `
      <section class="single-generation" id="generation-${generation}">
        <div class="single-generation-heading">
          <h4>Generation ${generation}</h4>
          <span>${rows.length} family group${rows.length === 1 ? '' : 's'}</span>
        </div>
        ${rows.map((row) => renderFamilyTreeChart(row.family, peopleById, row.index + 1, row.generation)).join('')}
      </section>
    `;
  }).join('');
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



function renderFixHistory() {
  const records = treeData.fixHistory || [];
  if (!records.length) return '';

  return `
    <section class="fix-history">
      <div class="report-heading">
        <h3>Fix Record</h3>
        <span>${records.length} automatic fix(es) applied</span>
      </div>
      <ol>
        ${records.map((record) => `
          <li>
            <strong>${escapeHtml(record.category)}</strong>${record.subject ? ` <span>${escapeHtml(record.subject)}</span>` : ''}
            <p><strong>Problem:</strong> ${escapeHtml(record.problem)}</p>
            <p><strong>Fix:</strong> ${escapeHtml(record.fix)}</p>
            <p class="fix-time">${escapeHtml(new Date(record.time).toLocaleString())}</p>
          </li>
        `).join('')}
      </ol>
    </section>
  `;
}

function renderValidationReport() {
  const report = treeData.validationReport || createEmptyValidationReport();
  const total = report.errors.length + report.warnings.length + report.info.length;
  if (!total) return '';

  return `
    <section class="validation-report">
      <div class="report-heading">
        <h3>Tree Error Report</h3>
        <span>${report.errors.length} errors · ${report.warnings.length} warnings · ${report.info.length} notes</span>
      </div>
      <div class="report-actions">
        <button type="button" class="btn-secondary" data-apply-auto-fixes>Apply Safe Automatic Fixes</button>
        <button type="button" class="btn-secondary" data-show-manual-fixes>Show Manual Fix Guidance</button>
      </div>
      ${renderIssueGroup('Errors', report.errors, 'error')}
      ${renderIssueGroup('Warnings', report.warnings, 'warning')}
      ${renderIssueGroup('Notes', report.info, 'info')}
    </section>
  `;
}

function renderIssueGroup(title, issues, type) {
  if (!issues.length) return '';

  return `
    <div class="issue-group ${type}">
      <h4>${title}</h4>
      <ul>
        ${issues.map((issue) => `<li><strong>${escapeHtml(issue.category)}:</strong> ${escapeHtml(issue.message)}${issue.subject ? ` <span>${escapeHtml(issue.subject)}</span>` : ''}${issue.suggestion ? `<p class="fix-suggestion">${escapeHtml(issue.suggestion)}</p>` : ''}</li>`).join('')}
      </ul>
    </div>
  `;
}

function renderWarnings() {
  const warningItems = treeData.warnings.slice(0, 5).map((warning) => (
    `<li>Line ${warning.line}: ${escapeHtml(warning.message)}</li>`
  )).join('');
  const remaining = treeData.warnings.length > 5 ? `<li>${treeData.warnings.length - 5} more warning(s)</li>` : '';

  return `<div class="warnings"><strong>Import warnings</strong><ul>${warningItems}${remaining}</ul></div>`;
}

function renderFamilyTreeChart(family, peopleById, familyNumber, generation = null) {
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
        <h3>Family ${familyNumber}${generation ? ` · Generation ${generation}` : ''}</h3>
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
  applyCheckoutReturn();
  updateLayoutButtons();
  updateBillingButtons();
  renderSubscriptionPlans();
  loadSubscriptionConfig();
  loadSubscriptionStatusFromCustomer();
  renderFamilyTree();
});
