const IS_ADMINISTRATION_REVIEW = new URLSearchParams(window.location.search).get('admin_review') === 'true';
const STORAGE_KEY = IS_ADMINISTRATION_REVIEW
  ? 'familyTreeAdministrationReviewData'
  : window.familyTreeClientStorage?.getActiveTreeKey() || 'familyTreeData';
const LAYOUT_STORAGE_KEY = 'familyTreeLayout';
const SUBSCRIPTION_STORAGE_KEY = IS_ADMINISTRATION_REVIEW ? 'familyTreeAdministrationReviewTier' : 'familyTreeSubscriptionTier';
const BILLING_INTERVAL_STORAGE_KEY = 'familyTreeBillingInterval';
const STRIPE_CUSTOMER_STORAGE_KEY = 'familyTreeStripeCustomerId';
const PLAN_SELECTION_STORAGE_KEY = IS_ADMINISTRATION_REVIEW ? 'familyTreeAdministrationReviewPlanSelected' : 'familyTreePlanSelected';
const TREE_REVIEW_URL = IS_ADMINISTRATION_REVIEW ? 'tree.html?admin_review=true' : 'tree.html';
const ERROR_REVIEW_URL = IS_ADMINISTRATION_REVIEW ? 'errors.html?admin_review=true' : 'errors.html';
const ERROR_PROGRESS_STORAGE_KEY = `${STORAGE_KEY}:errorProgress`;
const TREE_THEME_STORAGE_KEY = 'familyTreePresentationTheme';
const POSTER_LAYOUT_STORAGE_KEY = 'familyTreePosterLayout';
const POSTER_BACKGROUND_STORAGE_KEY = 'familyTreePosterBackground';
const POSTER_FOCUS_PERSON_STORAGE_KEY = 'familyTreePosterFocusPerson';
const POSTER_FAMILY_STORAGE_KEY = 'familyTreePosterFamily';
const GEDCOM_BACKUP_DATABASE = 'genealogyTreeCheckerBackups';
const GEDCOM_BACKUP_STORE = 'gedcomFiles';
const GEDCOM_BACKUP_ID = 'latest';
const GEDCOM_UPLOAD_LIMITS = {
  free: 150 * 1024 * 1024,
  personal: 500 * 1024 * 1024,
  pro: 500 * 1024 * 1024,
  business: 2 * 1024 * 1024 * 1024,
};
const treeOverviewSection = document.getElementById('treeOverviewSection');

let treeData = loadTreeData();
let treeLayout = localStorage.getItem(LAYOUT_STORAGE_KEY) || 'vertical';
let treeTheme = localStorage.getItem(TREE_THEME_STORAGE_KEY) || 'classic';
let posterLayout = localStorage.getItem(POSTER_LAYOUT_STORAGE_KEY) || 'family';
let posterBackground = localStorage.getItem(POSTER_BACKGROUND_STORAGE_KEY) || 'parchment';
let posterFocusPersonId = localStorage.getItem(POSTER_FOCUS_PERSON_STORAGE_KEY) || '';
let posterFamilyId = localStorage.getItem(POSTER_FAMILY_STORAGE_KEY) || '';
let currentTier = localStorage.getItem(SUBSCRIPTION_STORAGE_KEY) || 'free';
let billingInterval = localStorage.getItem(BILLING_INTERVAL_STORAGE_KEY) || 'monthly';
let stripeConfig = null;
let storeUrl = '/store';
let stripeCustomerId = localStorage.getItem(STRIPE_CUSTOMER_STORAGE_KEY) || '';
let isImportingGedcom = false;
let pendingTreeDatabaseSave = Promise.resolve(true);

const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Basic',
    rank: 0,
    description: 'Upload a GEDCOM file and manually fix the first five validation errors at no charge.',
    monthlyPrice: 0,
    annualPrice: 0,
    features: ['GEDCOM uploads up to 150 MB', 'Manually fix the first 5 validation errors', 'Upgrade to fix the remaining errors'],
  },
  personal: {
    name: 'Family Builder',
    rank: 1,
    description: 'For organizing one family tree with unlimited error review, charts, and research worksheets.',
    monthlyPrice: 19.99,
    annualPrice: 19.99,
    features: ['GEDCOM uploads up to 500 MB', 'Unlimited manual error fixes', 'Generation and family organizer', 'Progress messages and charts', 'Downloadable research worksheets', 'Ancestor Discovery research prompts', 'ZIP uploads', 'Print tree', 'Export JSON/CSV', 'Local fix records'],
  },
  pro: {
    name: 'Pro / Researcher',
    rank: 2,
    description: 'For deeper genealogy cleanup, reporting, and up to 10 separately organized family trees.',
    monthlyPrice: 29.99,
    annualPrice: 29.99,
    features: ['Up to 10 separate family-tree workspaces', 'Surname and generation labels for each workspace', 'GEDCOM uploads up to 500 MB', 'Safe automatic fixes', 'Full correction report', 'Advanced validation workflow', 'Ancestor Discovery research prompts', 'Free Genealogy Pro Package included', 'Digital report package', 'Printed tree and chart package', 'Researcher review service package', 'Memory keepsake package', 'Research journals and worksheets'],
  },
  business: {
    name: 'Business / Genealogist',
    rank: 3,
    description: 'For client-facing genealogy workflows.',
    monthlyPrice: 39.99,
    annualPrice: 39.99,
    features: ['Unlimited separate client workspaces', 'Surname and generation labels for each workspace', 'GEDCOM uploads up to 2 GB', 'Client tree workflow', 'Ancestor Discovery research prompts', 'Branded reports roadmap'],
  },
};

const ACTION_REQUIREMENTS = {
  print: 'personal',
  exportJson: 'personal',
  exportCsv: 'personal',
  copySummary: 'personal',
  familyBuilder: 'personal',
  autoFix: 'pro',
};

const gedcomForm = document.getElementById('gedcomForm');
const gedcomFileInput = document.getElementById('gedcomFile');
const uploadSection = document.getElementById('uploadSection');
const uploadStatus = document.getElementById('uploadStatus');
const welcomeStartAction = document.getElementById('welcomeStartAction');
const uploadCompleteActions = document.getElementById('uploadCompleteActions');
const continueToTreeReviewButton = document.getElementById('continueToTreeReview');
const reviewInitialTreeButton = document.getElementById('reviewInitialTree');
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
const downloadGedcomBackupButton = document.getElementById('downloadGedcomBackup');
const restoreGedcomBackupButton = document.getElementById('restoreGedcomBackup');
const layoutButtons = document.querySelectorAll('[data-layout]');
const billingButtons = document.querySelectorAll('[data-billing-interval]');
const subscriptionPlansDiv = document.getElementById('subscriptionPlans');
const subscriptionStatusDiv = document.getElementById('subscriptionStatus');
const manageBillingButton = document.getElementById('manageBilling');
const goToStoreButton = document.getElementById('goToStore');
const gedcomUploadLimit = document.getElementById('gedcomUploadLimit');
const selectedPlanGuidance = document.getElementById('selectedPlanGuidance');
const selectedPlanWelcome = document.getElementById('selectedPlanWelcome');
const selectedPlanSteps = document.getElementById('selectedPlanSteps');
const selectedPlanTitle = document.getElementById('selectedPlanTitle');
const continuePlanFlowAction = document.getElementById('continuePlanFlowAction');
const selectedPlanFeatures = document.getElementById('selectedPlanFeatures');
const freeReviewInvitation = document.getElementById('freeReviewInvitation');
const exploreWaysAction = document.getElementById('exploreWaysAction');

function getGedcomUploadLimitBytes(tier = currentTier) {
  return GEDCOM_UPLOAD_LIMITS[tier] || GEDCOM_UPLOAD_LIMITS.free;
}

function formatGedcomUploadLimit(tier = currentTier) {
  const megabytes = getGedcomUploadLimitBytes(tier) / (1024 * 1024);
  return megabytes >= 1024 ? `${megabytes / 1024} GB` : `${Math.round(megabytes)} MB`;
}

function updateGedcomUploadLimit() {
  if (!gedcomUploadLimit) return;
  gedcomUploadLimit.textContent = `Supports .ged, .gedcom, text GEDCOM downloads, and .zip files containing a GEDCOM file up to ${formatGedcomUploadLimit()} on your current plan.`;
}

function updateSelectedPlanGuidance() {
  const planName = SUBSCRIPTION_TIERS[currentTier]?.name || 'selected';
  const hasPaidPlan = ['personal', 'pro', 'business'].includes(currentTier);
  // An active paid tier is itself the source of truth, including for customers
  // who selected their plan before the separate marker was introduced.
  const hasSelectedPlan = hasPaidPlan || Boolean(localStorage.getItem(PLAN_SELECTION_STORAGE_KEY));
  const guidance = currentTier === 'free'
    ? 'Wonderful - your free review is ready. You are about to bring your family story into clearer focus.'
    : `Wonderful choice - your ${planName} plan is ready. You are about to bring your family story into clearer focus.`;
  if (selectedPlanGuidance) selectedPlanGuidance.textContent = guidance;
  if (selectedPlanWelcome) selectedPlanWelcome.textContent = guidance;
  if (selectedPlanTitle) {
    selectedPlanTitle.textContent = currentTier === 'free'
      ? 'Welcome to your free family-tree review!'
      : `Welcome to your ${planName} journey!`;
  }
  if (selectedPlanFeatures) {
    selectedPlanFeatures.innerHTML = (SUBSCRIPTION_TIERS[currentTier]?.features || [])
      .map((feature) => `<li>${escapeHtml(feature)}</li>`)
      .join('');
  }
  if (continuePlanFlowAction) {
    continuePlanFlowAction.textContent = currentTier === 'free'
      ? 'Open Your Free Review Work Place'
      : `Open Your ${planName} Work Place`;
  }
  if (selectedPlanSteps) selectedPlanSteps.hidden = !hasSelectedPlan;
  if (freeReviewInvitation) freeReviewInvitation.hidden = hasPaidPlan;
  if (exploreWaysAction) exploreWaysAction.hidden = hasPaidPlan;
}

subscriptionPlansDiv?.addEventListener('click', (event) => {
  const upgradeButton = event.target.closest('[data-upgrade-tier]');
  const previewButton = event.target.closest('[data-preview-tier]');

  if (upgradeButton) {
    startCheckout(upgradeButton.dataset.upgradeTier);
  }

  if (previewButton) {
    setPreviewTier(previewButton.dataset.previewTier);
  }
});

manageBillingButton?.addEventListener('click', openBillingPortal);

if (goToStoreButton) {
  goToStoreButton.addEventListener('click', () => {
    window.open(storeUrl, '_blank', 'noopener');
  });
}

downloadGedcomBackupButton.addEventListener('click', downloadSavedGedcomBackup);
restoreGedcomBackupButton.addEventListener('click', restoreSavedGedcomBackup);

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
    return;
  }

  if (event.target.closest('[data-open-error-workspace]')) {
    window.open(ERROR_REVIEW_URL, '_blank', 'noopener');
    return;
  }

  if (event.target.closest('[data-open-family-builder]')) {
    openFamilyBuilder();
    return;
  }

  const worksheetButton = event.target.closest('[data-download-worksheet]');
  if (worksheetButton) {
    downloadFamilyBuilderWorksheet(worksheetButton.dataset.downloadWorksheet);
    return;
  }

  const themeButton = event.target.closest('[data-tree-theme]');
  if (themeButton) {
    treeTheme = themeButton.dataset.treeTheme;
    localStorage.setItem(TREE_THEME_STORAGE_KEY, treeTheme);
    renderFamilyTree();
    setStatus(`Your ${treeTheme} tree edition is ready to preview.`, 'success');
    return;
  }

  const viewButton = event.target.closest('[data-tree-layout-choice]');
  if (viewButton) {
    treeLayout = viewButton.dataset.treeLayoutChoice;
    localStorage.setItem(LAYOUT_STORAGE_KEY, treeLayout);
    updateLayoutButtons();
    renderFamilyTree();
    setStatus(`Showing the ${treeLayout} family-tree view.`, 'success');
    return;
  }

  if (event.target.closest('[data-print-updated-tree]')) {
    printUpdatedTree();
    return;
  }

  const posterLayoutButton = event.target.closest('[data-poster-layout]');
  if (posterLayoutButton) {
    posterLayout = posterLayoutButton.dataset.posterLayout;
    localStorage.setItem(POSTER_LAYOUT_STORAGE_KEY, posterLayout);
    renderFamilyTree();
    return;
  }

  const posterBackgroundButton = event.target.closest('[data-poster-background]');
  if (posterBackgroundButton) {
    posterBackground = posterBackgroundButton.dataset.posterBackground;
    localStorage.setItem(POSTER_BACKGROUND_STORAGE_KEY, posterBackground);
    renderFamilyTree();
    return;
  }

  if (event.target.closest('[data-download-poster-artwork]')) {
    downloadPosterArtwork();
  }
});

familyTreeDiv.addEventListener('change', (event) => {
  const focusPersonSelect = event.target.closest('[data-poster-focus-person]');
  const startPersonInput = event.target.closest('[data-poster-start-person]');
  if (!focusPersonSelect && !startPersonInput) return;

  if (focusPersonSelect) {
    posterFocusPersonId = focusPersonSelect.value;
    localStorage.setItem(POSTER_FOCUS_PERSON_STORAGE_KEY, posterFocusPersonId);
  }
  if (startPersonInput) {
    const person = treeData.people.find((item) => (
      String(item.name || item.id).toLocaleLowerCase() === startPersonInput.value.trim().toLocaleLowerCase()
    ));
    const family = treeData.families.find((item) => (
      item.husbandId === person?.id || item.wifeId === person?.id || (item.childrenIds || []).includes(person?.id)
    ));
    if (!person || !family) {
      setStatus('Choose a person from the suggestions who is connected to a family group.', 'info');
      return;
    }
    posterFamilyId = family.id;
    localStorage.setItem(POSTER_FAMILY_STORAGE_KEY, posterFamilyId);
  }
  renderFamilyTree();
});

async function importSelectedGedcom() {
  if (isImportingGedcom) return;
  if (!localStorage.getItem(PLAN_SELECTION_STORAGE_KEY)) {
    window.location.href = '/store#subscriptions';
    return;
  }

  const file = gedcomFileInput.files[0];
  if (!file) return;

  isImportingGedcom = true;
  gedcomFileInput.disabled = true;
  uploadCompleteActions.hidden = true;
  const previousTreeData = treeData;
  treeData = createEmptyTreeData();
  renderFamilyTree();
  setStatus('Reading your family file...', 'info');

  try {
    const gedcom = await readGedcomFile(file);
    const result = parseGedcomText(gedcom);
    const savedLocally = applyGedcomResult(result);
    const savedForReview = savedLocally || await pendingTreeDatabaseSave;
    const backupSaved = await saveGedcomBackup(gedcom, getGedcomBackupFileName(file.name));
    const storageText = savedForReview
      ? ''
      : ' This tree could not be saved in this browser, so it will stay available only until this tab is refreshed.';
    const backupText = backupSaved
      ? ' A local GEDCOM backup is ready to download or restore from this browser.'
      : ' The GEDCOM backup could not be saved in this browser.';
    setStatus(`Your family file is ready. ${formatGedcomImportStatus(result)}${storageText}${backupText}`, 'success');
    gedcomForm.reset();
    uploadCompleteActions.hidden = false;
  } catch (error) {
    treeData = previousTreeData;
    renderFamilyTree();
    const restoreText = previousTreeData.people.length
      ? ' Previous tree restored; no new GEDCOM was imported.'
      : ' No GEDCOM was imported.';
    setStatus(`${formatGedcomLoadError(error)}${restoreText}`, 'error');
  } finally {
    isImportingGedcom = false;
    gedcomFileInput.disabled = false;
  }
}

gedcomForm.addEventListener('submit', (event) => {
  event.preventDefault();
  importSelectedGedcom();
});

gedcomFileInput.addEventListener('change', () => {
  if (gedcomFileInput.files[0]) importSelectedGedcom();
});

continueToTreeReviewButton?.addEventListener('click', () => {
  window.location.href = TREE_REVIEW_URL;
});

function parseGedcomText(gedcom) {
  const cleanup = cleanupRepeatedGedcomRecords(gedcom);
  const parsed = parseGedcomInBrowser(cleanup.gedcom);
  return {
    success: true,
    parsed,
    cleanup: {
      repeatedRecordsRemoved: cleanup.repeatedRecordsRemoved,
    },
  };
}

function applyGedcomResult(result) {
  treeData = normalizeParsedGedcom(result.parsed);
  localStorage.removeItem(ERROR_PROGRESS_STORAGE_KEY);
  const savedLocally = saveTreeData();
  renderFamilyTree();
  return savedLocally;
}

function formatGedcomImportStatus(result) {
  const { people, families, relationships } = result.parsed.stats;
  const warningText = result.parsed.warnings.length
    ? ` ${result.parsed.warnings.length} warning(s) found.`
    : '';
  const cleanupText = result.cleanup?.repeatedRecordsRemoved
    ? ` Removed ${result.cleanup.repeatedRecordsRemoved} repeated GEDCOM record(s) before parsing.`
    : '';
  return `We found ${people} people, ${families} families, and ${relationships} relationships.${warningText}${cleanupText}`;
}

function getGedcomBackupFileName(fileName = 'family-tree.ged') {
  const baseName = fileName.replace(/\.(zip|gedzip)$/i, '').replace(/\.(ged|gedcom|ged\.txt|txt)$/i, '');
  return `${baseName || 'family-tree'}-backup.ged`;
}

function openGedcomBackupDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(GEDCOM_BACKUP_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(GEDCOM_BACKUP_STORE)) {
        request.result.createObjectStore(GEDCOM_BACKUP_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local GEDCOM backup storage.'));
  });
}

async function saveGedcomBackup(gedcom, fileName) {
  try {
    const database = await openGedcomBackupDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(GEDCOM_BACKUP_STORE, 'readwrite');
      transaction.objectStore(GEDCOM_BACKUP_STORE).put({
        id: GEDCOM_BACKUP_ID,
        fileName,
        gedcom,
        savedAt: new Date().toISOString(),
      });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
    return true;
  } catch (error) {
    console.warn('Could not save local GEDCOM backup:', error);
    return false;
  }
}

async function getGedcomBackup() {
  const database = await openGedcomBackupDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(GEDCOM_BACKUP_STORE, 'readonly')
        .objectStore(GEDCOM_BACKUP_STORE)
        .get(GEDCOM_BACKUP_ID);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function downloadSavedGedcomBackup() {
  try {
    const backup = await getGedcomBackup();
    if (!backup) {
      setStatus('No local GEDCOM backup is available in this browser yet. Upload a GEDCOM file first.', 'info');
      return;
    }
    downloadFile(backup.fileName, backup.gedcom, 'application/x-gedcom');
    setStatus(`Downloaded the GEDCOM backup saved ${new Date(backup.savedAt).toLocaleString()}.`, 'success');
  } catch (error) {
    setStatus('Could not access the local GEDCOM backup.', 'error');
  }
}

async function restoreSavedGedcomBackup() {
  const previousTreeData = treeData;
  treeData = createEmptyTreeData();
  renderFamilyTree();
  setStatus('Restoring local GEDCOM backup...', 'info');

  try {
    const backup = await getGedcomBackup();
    if (!backup) throw new Error('No local GEDCOM backup is available in this browser yet.');
    const result = parseGedcomText(backup.gedcom);
    const savedLocally = applyGedcomResult(result);
    const savedForReview = savedLocally || await pendingTreeDatabaseSave;
    const storageText = savedForReview
      ? ''
      : ' This tree could not be saved in this browser, so it will stay available only until this tab is refreshed.';
    setStatus(`Restored ${backup.fileName}. ${formatGedcomImportStatus(result)}${storageText}`, 'success');
    uploadCompleteActions.hidden = false;
  } catch (error) {
    treeData = previousTreeData;
    renderFamilyTree();
    setStatus(error.message || 'Could not restore the local GEDCOM backup.', 'error');
  }
}

reviewInitialTreeButton?.addEventListener('click', () => {
  if (!ensureTreeHasPeople('reviewing the initial family tree')) return;

  document.querySelector('.tree-section').scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (confirm('Review the initial family tree below. Would you like to print this version for comparison?')) {
    if (!requireTier('print')) return;
    window.print();
  }
});

familyForm?.addEventListener('submit', (event) => {
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

printTreeButton?.addEventListener('click', () => {
  if (!requireTier('print')) return;
  if (!treeData.people.length) {
    setStatus('Upload or add family members before printing the tree.', 'error');
    return;
  }

  window.print();
});

exportJsonButton?.addEventListener('click', () => {
  if (!requireTier('exportJson') || !ensureTreeHasPeople('exporting JSON')) return;

  downloadFile('family-tree.json', JSON.stringify(treeData, null, 2), 'application/json');
  setStatus('Downloaded parsed tree JSON.', 'success');
});

exportCsvButton?.addEventListener('click', () => {
  if (!requireTier('exportCsv') || !ensureTreeHasPeople('exporting CSV')) return;

  downloadFile('family-tree-people.csv', buildPeopleCsv(), 'text/csv');
  setStatus('Downloaded people CSV.', 'success');
});

copySummaryButton?.addEventListener('click', async () => {
  if (!requireTier('copySummary') || !ensureTreeHasPeople('copying a summary')) return;

  const summary = buildTreeSummary();
  try {
    await navigator.clipboard.writeText(summary);
    setStatus('Copied tree summary to clipboard.', 'success');
  } catch (error) {
    setStatus(summary, 'info');
  }
});

clearTreeButton?.addEventListener('click', () => {
  if (!treeData.people.length || confirm('Clear the current family tree?')) {
    treeData = createEmptyTreeData();
    localStorage.removeItem(ERROR_PROGRESS_STORAGE_KEY);
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
  if (!subscriptionPlansDiv || !subscriptionStatusDiv) return;

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
  updateGedcomUploadLimit();
  updateSelectedPlanGuidance();
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
  localStorage.setItem(PLAN_SELECTION_STORAGE_KEY, 'true');
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

async function readGedcomFile(file) {
  const uploadLimit = getGedcomUploadLimitBytes();
  if (file.size > uploadLimit) {
    throw new Error(`GEDCOM file is too large for your ${SUBSCRIPTION_TIERS[currentTier]?.name || 'Basic'} plan. Maximum size is ${formatGedcomUploadLimit()}.`);
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

  const uploadLimit = getGedcomUploadLimitBytes();
  if (gedcomEntry.uncompressedSize > uploadLimit) {
    throw new Error(`The GEDCOM file inside this ZIP is too large for your ${SUBSCRIPTION_TIERS[currentTier]?.name || 'Basic'} plan. Maximum size is ${formatGedcomUploadLimit()}.`);
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
      otherNames: [],
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
        if (tag === 'NAME') {
          const name = normalizeGedcomName(value);
          if (!person.name?.display) person.name = name;
          else person.otherNames.push(name);
        }
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
    primaryPersonId: '',
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
        primaryPersonId: stored.primaryPersonId || stored.people[0]?.id || '',
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
    void window.familyTreeClientStorage?.removeTreeFromDatabase?.(STORAGE_KEY);
    pendingTreeDatabaseSave = Promise.resolve(true);
    return true;
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    pendingTreeDatabaseSave = window.familyTreeClientStorage?.saveTreeInDatabase(STORAGE_KEY, treeData)
      .then(() => true)
      .catch((databaseError) => {
        console.warn('Tree is too large to save in browser storage:', error, databaseError);
        return false;
      }) || Promise.resolve(false);
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
      aliases: (person.otherNames || []).map((name) => name.display).filter(Boolean),
      source: 'gedcom',
    })),
    families: parsed.families || [],
    relationships: parsed.relationships || [],
    warnings: parsed.warnings || [],
    validationReport: createEmptyValidationReport(),
    fixHistory: [],
    primaryPersonId: parsed.people[0]?.id || '',
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

    const hasApproximateDate = isApproximateDate(person.birthDate || person.birthYear) || isApproximateDate(person.deathDate);

    if (!hasApproximateDate && birthYear && deathYear && deathYear < birthYear) {
      addIssue(report.errors, 'Date inconsistency', `${person.name} has a death year (${deathYear}) before birth year (${birthYear}).`, person.id, 'Manual fix: review the original record and correct either the birth date or death date.');
    }

    if (!hasApproximateDate && birthYear && birthYear > new Date().getFullYear()) {
      addIssue(report.errors, 'Date inconsistency', `${person.name} has a birth year in the future (${birthYear}).`, person.id, 'Manual fix: verify the source and correct the birth date.');
    }

    if (!hasApproximateDate && deathYear && deathYear > new Date().getFullYear()) {
      addIssue(report.errors, 'Date inconsistency', `${person.name} has a death year in the future (${deathYear}).`, person.id, 'Manual fix: verify the source and correct or remove the death date.');
    }

    if (!hasApproximateDate && birthYear && deathYear && deathYear - birthYear > 125) {
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
      const [survivor, ...duplicates] = matches;
      addIssue(
        report.warnings,
        'Possible duplicate',
        `${matches.length} people share the same name and birth year: ${matches.map((person) => `${person.name} (${person.id})`).join(', ')}.`,
        survivor.id,
        'Review the records, then merge the duplicate people when you are confident they refer to the same person.',
        { type: 'mergeDuplicatePeople', survivorId: survivor.id, duplicateIds: duplicates.map((person) => person.id) }
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

        const hasApproximateFamilyDate = isApproximateDate(child.birthDate || child.birthYear)
          || isApproximateDate(parent.birthDate || parent.birthYear)
          || isApproximateDate(parent.deathDate);

        if (!hasApproximateFamilyDate && parentBirthYear && childBirthYear && childBirthYear < parentBirthYear) {
          addIssue(report.errors, 'Date inconsistency', `${child.name} appears born before parent ${parent.name}.`, family.id, 'Manual fix: verify the child and parent birth dates or the relationship link.');
        }

        if (!hasApproximateFamilyDate && parentBirthYear && childBirthYear && childBirthYear - parentBirthYear < 12) {
          addIssue(report.warnings, 'Date warning', `${parent.name} appears younger than 12 when ${child.name} was born.`, family.id, 'Manual fix: verify dates and confirm the parent-child relationship.');
        }

        if (!hasApproximateFamilyDate && parentDeathYear && childBirthYear && childBirthYear > parentDeathYear + 1) {
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

function isApproximateDate(value) {
  return /\b(ABT|ABOUT|EST|ESTIMATED|CAL|CIRCA|CA|BEF|BEFORE|AFT|AFTER|BET|BETWEEN|FROM|TO)\b/i.test(String(value || ''));
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
    treeOverviewSection.hidden = true;
    return;
  }

  treeOverviewSection.hidden = false;
  const peopleById = new Map(treeData.people.map((person) => [person.id, person]));
  const generationData = buildGenerationData(peopleById);

  familyTreeDiv.innerHTML = `
    ${renderSummary(generationData)}
    ${renderWorkflowOverview()}
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

function renderWorkflowOverview() {
  const report = treeData.validationReport || createEmptyValidationReport();
  const issueCount = report.errors.length + report.warnings.filter((issue) => (
    issue.autoFix?.type === 'mergeDuplicatePeople'
  )).length;

  return `
    <section class="workflow-overview">
      <h3>Step 2: Review your family tree</h3>
      <p>Your family tree is ready. Open the five-generation Working Tree Preview, choose the direct line you want to work on, then continue to its organized Error Workspace.</p>
      <div class="workflow-actions">
        <a class="btn-add" href="${TREE_REVIEW_URL}">Review Your Five-Generation Working Tree${issueCount ? ` (${issueCount} errors)` : ''}</a>
        <a class="btn-secondary" href="manual.html">Edit your tree manually</a>
        <a class="btn-secondary" href="ancestor.html">Explore ancestor research</a>
      </div>
    </section>
  `;
}

function renderTreePresentation(generationData, peopleById) {
  const canPrintUpdatedTree = hasTier('personal');
  const focusPerson = peopleById.get(posterFocusPersonId) || getDefaultPosterFocusPerson(generationData, peopleById);
  const ancestorPreview = posterLayout === 'ancestor' && focusPerson ? buildAncestorLevels(focusPerson.id, peopleById) : [];
  const focusSelector = posterLayout === 'ancestor' ? `
    <label class="poster-focus-label" for="posterFocusPerson">Focus person for ancestor chart</label>
    <select id="posterFocusPerson" data-poster-focus-person>
      ${[...treeData.people]
        .sort((first, second) => String(first.name || first.id).localeCompare(String(second.name || second.id)))
        .map((person) => `<option value="${escapeHtml(person.id)}" ${person.id === focusPerson?.id ? 'selected' : ''}>${escapeHtml(person.name || person.id)}</option>`)
        .join('')}
    </select>
    <p class="muted">Ancestor Chart posters include up to four direct generations to keep the design clear and readable.</p>
    <details class="ancestor-poster-preview" open>
      <summary>Four-generation preview</summary>
      ${ancestorPreview.map((level, index) => `<p><strong>Level ${index + 1}:</strong> ${level.map((person) => escapeHtml(person.name || person.id)).join(', ')}</p>`).join('')}
    </details>
  ` : '';
  const familySelector = posterLayout === 'family' ? `
    <label class="poster-focus-label" for="posterStartPerson">Start this family tree with a person</label>
    <input id="posterStartPerson" type="search" list="posterPeople" data-poster-start-person placeholder="Type a person's name">
    <datalist id="posterPeople">
      ${treeData.people.map((person) => `<option value="${escapeHtml(person.name || person.id)}"></option>`).join('')}
    </datalist>
  ` : '';

  return `
    <section id="treePresentation" class="tree-presentation">
      <div class="report-heading">
        <div>
          <h3>Celebrate Your Updated Tree</h3>
          <p class="muted">Your research deserves a presentation that feels as personal as the story it preserves.</p>
        </div>
        <span>${canPrintUpdatedTree ? 'Ready to personalize and print' : 'Personalization available with Family Builder'}</span>
      </div>
      <div class="presentation-options">
        <div>
          <h4>Choose a special edition</h4>
          <div class="presentation-buttons">
            <button type="button" class="btn-secondary ${treeTheme === 'classic' ? 'active-presentation' : ''}" data-tree-theme="classic">Classic Edition</button>
            <button type="button" class="btn-secondary ${treeTheme === 'heritage' ? 'active-presentation' : ''}" data-tree-theme="heritage">Heritage Edition</button>
            <button type="button" class="btn-secondary ${treeTheme === 'garden' ? 'active-presentation' : ''}" data-tree-theme="garden">Garden Edition</button>
          </div>
        </div>
        <div>
          <h4>Choose a family-tree view</h4>
          <div class="presentation-buttons">
            <button type="button" class="btn-secondary ${treeLayout === 'vertical' ? 'active-presentation' : ''}" data-tree-layout-choice="vertical">Generation View</button>
            <button type="button" class="btn-secondary ${treeLayout === 'horizontal' ? 'active-presentation' : ''}" data-tree-layout-choice="horizontal">Family Flow View</button>
          </div>
        </div>
        <div>
          <h4>Choose a poster layout</h4>
          <div class="presentation-buttons">
            <button type="button" class="btn-secondary ${posterLayout === 'family' ? 'active-presentation' : ''}" data-poster-layout="family">Family Tree</button>
            <button type="button" class="btn-secondary ${posterLayout === 'generation' ? 'active-presentation' : ''}" data-poster-layout="generation">Generation Chart</button>
            <button type="button" class="btn-secondary ${posterLayout === 'ancestor' ? 'active-presentation' : ''}" data-poster-layout="ancestor">Ancestor Chart</button>
          </div>
          ${focusSelector}${familySelector}
        </div>
        <div>
          <h4>Poster background</h4>
          <div class="presentation-buttons">
            <button type="button" class="btn-secondary ${posterBackground === 'parchment' ? 'active-presentation' : ''}" data-poster-background="parchment">Vintage Parchment</button>
          </div>
          <p class="muted">The background is embedded in the downloaded poster image.</p>
        </div>
      </div>
      ${canPrintUpdatedTree
        ? `<div class="presentation-print-actions">
            <button type="button" class="btn-add presentation-print-button" data-print-updated-tree>Print Your Personalized Tree</button>
            <button type="button" class="btn-secondary" data-download-poster-artwork>Download 18x24 Poster PNG</button>
          </div>`
        : '<p class="presentation-upgrade">Family Builder unlocks personalized tree printing, unlimited fixes, and research worksheets. <a href="#subscriptionWorkflows">Upgrade to Family Builder</a>.</p>'}
      <div class="keepsake-offer">
        <h4>Turn your updated tree into a keepsake</h4>
        <p>Explore personalized posters, family-history diaries, phone covers, journals, booklets, and memory keepsakes made from your new tree.</p>
        <a class="btn-secondary" href="/store#customKeepsakes">Explore posters and keepsakes</a>
      </div>
    </section>
  `;
}

function printUpdatedTree() {
  if (!requireTier('print')) return;
  if (!ensureTreeHasPeople('printing your updated tree')) return;

  setStatus('Your personalized family tree is ready to print or save as a PDF.', 'success');
  window.print();
}

function getDefaultPosterFocusPerson(generationData, peopleById) {
  const furthestGeneration = Math.max(...generationData.generationByPerson.values(), 1);
  const focusId = [...generationData.generationByPerson.entries()]
    .find(([, generation]) => generation === furthestGeneration)?.[0];
  return peopleById.get(focusId) || treeData.people[0] || null;
}

function buildAncestorLevels(focusPersonId, peopleById) {
  const parentIdsByChildId = new Map();

  for (const family of treeData.families) {
    const parents = [family.husbandId, family.wifeId].filter((id) => peopleById.has(id));
    for (const childId of family.childrenIds || []) {
      if (!parentIdsByChildId.has(childId)) parentIdsByChildId.set(childId, new Set());
      parents.forEach((parentId) => parentIdsByChildId.get(childId).add(parentId));
    }
  }

  const levels = [];
  let currentIds = [focusPersonId];
  for (let level = 0; level < 4 && currentIds.length; level += 1) {
    levels.push(currentIds.map((id) => peopleById.get(id)).filter(Boolean));
    currentIds = [...new Set(currentIds.flatMap((id) => [...(parentIdsByChildId.get(id) || [])]))];
  }

  return levels.reverse();
}

function buildFamilyTreePoster(family, peopleById, colors) {
  if (!family) return '<text x="2700" y="2700" text-anchor="middle" fill="#451a03" font-size="56">Choose a family group to create this poster.</text>';
  const parents = [family.husbandId, family.wifeId].map((id) => peopleById.get(id)).filter(Boolean);
  const children = (family.childrenIds || []).map((id) => peopleById.get(id)).filter(Boolean).slice(0, 8);
  const card = (person, x, y) => `
    <rect x="${x}" y="${y}" width="1400" height="220" rx="30" fill="${colors.card}" stroke="${colors.accent}" stroke-width="8"/>
    <text x="${x + 55}" y="${y + 88}" fill="${colors.text}" font-family="Georgia, serif" font-size="50" font-weight="700">${escapeSvg(shortenPosterText(person.name || person.id))}</text>
    <text x="${x + 55}" y="${y + 154}" fill="${colors.text}" font-family="Arial, sans-serif" font-size="34">${escapeSvg(shortenPosterText([extractYear(person.birthDate), person.birthPlace].filter(Boolean).join(' · '), 54))}</text>
  `;
  const parentCards = parents.map((person, index) => card(person, parents.length === 1 ? 2000 : 650 + index * 2100, 1850)).join('');
  const childCards = children.map((person, index) => card(person, 350 + (index % 3) * 1700, 3850 + Math.floor(index / 3) * 360)).join('');
  const childCenter = children.length ? 2700 : 0;
  return `
    <text x="2700" y="1350" text-anchor="middle" fill="${colors.accent}" font-family="Arial, sans-serif" font-size="56" font-weight="700">FAMILY TREE</text>
    ${parentCards}
    ${parents.length && children.length ? `<line x1="2700" y1="2070" x2="2700" y2="3500" stroke="${colors.accent}" stroke-width="12"/><line x1="700" y1="3500" x2="4700" y2="3500" stroke="${colors.accent}" stroke-width="12"/><line x1="${childCenter}" y1="3500" x2="${childCenter}" y2="3850" stroke="${colors.accent}" stroke-width="12"/>` : ''}
    ${childCards}
  `;
}

function posterBackgroundMarkup(colors) {
  if (posterBackground !== 'parchment') return `<rect width="100%" height="100%" fill="${colors.background}"/>`;

  return `
    <defs>
      <linearGradient id="parchment" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f8edcf"/>
        <stop offset="55%" stop-color="#ead4a6"/>
        <stop offset="100%" stop-color="#f7e8c5"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#parchment)"/>
    <path d="M0 950 C1200 760 2400 1130 5400 850 M0 6250 C1800 6000 3400 6460 5400 6140" fill="none" stroke="#a16207" stroke-opacity="0.16" stroke-width="55"/>
  `;
}

function posterThemeColors() {
  if (treeTheme === 'heritage') {
    return { background: '#fff8e7', accent: '#92400e', card: '#fffbeb', text: '#451a03' };
  }
  if (treeTheme === 'garden') {
    return { background: '#f0fdf4', accent: '#166534', card: '#f7fee7', text: '#14532d' };
  }
  return { background: '#f5f3ff', accent: '#5b21b6', card: '#faf5ff', text: '#2e1065' };
}

function escapeSvg(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  }[character]));
}

function shortenPosterText(value, maxLength = 34) {
  const text = String(value || '');
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

async function downloadPosterArtwork() {
  if (!requireTier('print')) return;
  if (!ensureTreeHasPeople('creating poster artwork')) return;

  const width = 5400;
  const height = 7200;
  const colors = posterThemeColors();
  const peopleById = new Map(treeData.people.map((person) => [person.id, person]));
  const generationData = buildGenerationData(peopleById);
  const groups = new Map();

  if (posterLayout === 'ancestor') {
    const focusPerson = peopleById.get(posterFocusPersonId) || getDefaultPosterFocusPerson(generationData, peopleById);
    buildAncestorLevels(focusPerson?.id, peopleById).forEach((level, index) => groups.set(index + 1, level));
  } else {
    for (const person of treeData.people) {
      const generation = generationData.generationByPerson.get(person.id) || 1;
      if (!groups.has(generation)) groups.set(generation, []);
      groups.get(generation).push(person);
    }
  }

  const generations = [...groups.keys()].sort((first, second) => first - second).slice(0, posterLayout === 'ancestor' ? 4 : 7);
  const familyTitle = 'Your Family Tree';
  const bandHeight = Math.floor(5400 / Math.max(generations.length, 1));
  const columns = 3;
  const cardHeight = 190;
  const rowGap = 55;
  const maxRows = Math.max(1, Math.floor((bandHeight - 250) / (cardHeight + rowGap)));
  const maxPeoplePerGeneration = columns * maxRows;
  const cards = posterLayout === 'family'
    ? buildFamilyTreePoster(treeData.families.find((family) => family.id === (posterFamilyId || treeData.families[0]?.id)), peopleById, colors)
    : generations.map((generation, index) => {
    const people = groups.get(generation) || [];
    const visiblePeople = people.slice(0, maxPeoplePerGeneration);
    const y = 1120 + index * bandHeight;
    const cardWidth = 1480;
    const cardGap = 100;
    const nodes = visiblePeople.map((person, personIndex) => {
      const column = personIndex % columns;
      const row = Math.floor(personIndex / columns);
      const x = 360 + column * (cardWidth + cardGap);
      const cardY = y + 125 + row * (cardHeight + rowGap);
      const lifeDates = [extractYear(person.birthDate), extractYear(person.deathDate)].filter(Boolean).join(' - ');
      return `
        <rect x="${x}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="28" fill="${colors.card}" stroke="${colors.accent}" stroke-width="7"/>
        <text x="${x + 55}" y="${cardY + 78}" fill="${colors.text}" font-family="Georgia, serif" font-size="48" font-weight="700">${escapeSvg(shortenPosterText(person.name || person.id))}</text>
        <text x="${x + 55}" y="${cardY + 138}" fill="${colors.text}" font-family="Arial, sans-serif" font-size="34">${escapeSvg(shortenPosterText([lifeDates, person.birthPlace].filter(Boolean).join(' · '), 54))}</text>
      `;
      }).join('');
    const remaining = people.length - visiblePeople.length;
    return `
      <line x1="300" y1="${y}" x2="5100" y2="${y}" stroke="${colors.accent}" stroke-width="8"/>
      <text x="300" y="${y + 74}" fill="${colors.accent}" font-family="Arial, sans-serif" font-size="46" font-weight="700">${posterLayout === 'ancestor' ? `ANCESTOR LEVEL ${generation}` : `FAMILY GROUP ${generation}`}</text>
      ${nodes}
      ${remaining > 0 ? `<text x="300" y="${y + bandHeight - 30}" fill="${colors.text}" font-family="Arial, sans-serif" font-size="32">+ ${remaining} additional person${remaining === 1 ? '' : 's'} in this generation</text>` : ''}
    `;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${posterBackgroundMarkup(colors)}
    <rect x="150" y="150" width="5100" height="6900" rx="45" fill="none" stroke="${colors.accent}" stroke-width="12"/>
    <text x="2700" y="470" text-anchor="middle" fill="${colors.accent}" font-family="Georgia, serif" font-size="132" font-weight="700">${escapeSvg(shortenPosterText(familyTitle, 48))}</text>
    <text x="2700" y="590" text-anchor="middle" fill="${colors.text}" font-family="Arial, sans-serif" font-size="46">${posterLayout === 'ancestor' ? 'A personalized ancestor chart' : 'A personalized family history chart'}</text>
    <text x="2700" y="690" text-anchor="middle" fill="${colors.text}" font-family="Arial, sans-serif" font-size="36">${posterLayout === 'ancestor' ? `${generations.length} ancestor levels shown` : `${treeData.people.length} people · ${treeData.families.length} families · ${generations.length} family groups shown`}</text>
    ${cards}
    <text x="2700" y="6930" text-anchor="middle" fill="${colors.text}" font-family="Arial, sans-serif" font-size="30">Created with Genealogy Tree Checker</text>
  </svg>`;

  try {
    const png = await rasterizePosterSvg(svg, width, height);
    downloadFile('family-tree-poster-18x24.png', png, 'image/png');
    setStatus('Downloaded flattened 18x24 portrait poster PNG. Upload it to your matching Printify poster product.', 'success');
  } catch (error) {
    setStatus(error.message || 'Could not create the poster PNG. Please try again in a current desktop browser.', 'error');
  }
}

function rasterizePosterSvg(svg, width, height) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));

    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      URL.revokeObjectURL(svgUrl);

      if (!context) {
        reject(new Error('Your browser could not create the poster image.'));
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Your browser could not export the poster image.'));
          return;
        }
        resolve(blob);
      }, 'image/png');
    };

    image.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('Your browser could not prepare the poster image.'));
    };

    image.src = svgUrl;
  });
}

const WORLD_HISTORY_EVENTS = [
  { year: 1776, label: 'American Declaration of Independence', detail: 'A turning point in the political history of the Atlantic world.' },
  { year: 1861, label: 'American Civil War begins', detail: 'A major conflict with lasting social and migration effects.' },
  { year: 1914, label: 'First World War begins', detail: 'A global conflict that reshaped many families, borders, and records.' },
  { year: 1918, label: 'Influenza pandemic', detail: 'A worldwide public-health event that may appear in local records and family stories.' },
  { year: 1929, label: 'Great Depression begins', detail: 'An economic crisis that influenced work, housing, and migration.' },
  { year: 1939, label: 'Second World War begins', detail: 'A global conflict that affected communities, service records, and movement.' },
  { year: 1969, label: 'First Moon landing', detail: 'A landmark moment in modern global history.' },
  { year: 1989, label: 'Fall of the Berlin Wall', detail: 'A major moment in late twentieth-century political history.' },
];

function getAncestorResearchPrompt(person) {
  const birthPlace = person.birthPlace ? `Start with local histories, newspapers, and civil records for ${person.birthPlace}.` : 'Start by identifying a birth place, then search local histories, newspapers, and civil records.';
  const hasLifeDates = extractYear(person.birthDate) || extractYear(person.deathDate);
  const lifeDates = hasLifeDates
    ? ' Compare the documented years with local events, occupations, migration routes, and family stories.'
    : '';
  return `${birthPlace}${lifeDates}`;
}

function getWorldContext(person) {
  const birthYear = extractYear(person.birthDate);
  const deathYear = extractYear(person.deathDate);
  if (!birthYear) return [];

  const endYear = deathYear && deathYear >= birthYear ? deathYear : birthYear + 20;
  return WORLD_HISTORY_EVENTS.filter((event) => event.year >= birthYear && event.year <= endYear).slice(0, 3);
}

function getAncestorSearchLinks(person) {
  const searchTerms = [person.name || person.id, person.birthPlace, 'family history'].filter(Boolean).join(' ');
  const placeTerms = person.birthPlace || `${person.name || person.id} family history`;
  return {
    youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${placeTerms} history`)}`,
    wikipedia: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(placeTerms)}`,
    archive: `https://archive.org/search?query=${encodeURIComponent(searchTerms)}`,
  };
}

function renderAncestorDiscovery() {
  const people = treeData.people
    .filter((person) => person.birthPlace || person.birthDate || person.deathDate)
    .slice(0, 6);

  if (!people.length) return '';

  return `
    <section class="ancestor-discovery">
      <div class="report-heading">
        <div>
          <h3>Ancestor Discovery</h3>
          <p class="muted">Follow one focused research lead at a time. Historical context is for exploration, not a claim about an individual ancestor's experience.</p>
        </div>
        <span>Included with every plan</span>
      </div>
      <p class="ancestor-discovery-intro">A little context can make names and dates feel more connected. Explore a place, compare documented years with major world events, and save what you verify in your research notes.</p>
      <div class="ancestor-discovery-grid">
        ${people.map((person) => {
          const context = getWorldContext(person);
          const links = getAncestorSearchLinks(person);
          const lifeYears = [extractYear(person.birthDate), extractYear(person.deathDate)].filter(Boolean).join(' - ');
          return `
            <article class="ancestor-card">
              <h4>${escapeHtml(person.name || person.id)}</h4>
              <p class="ancestor-meta">${escapeHtml([person.birthPlace, lifeYears].filter(Boolean).join(' · ') || 'Add a place or life date to tailor this research lead.')}</p>
              <p>${escapeHtml(getAncestorResearchPrompt(person))}</p>
              ${context.length ? `
                <details>
                  <summary>View historical context</summary>
                  <ul>${context.map((event) => `<li><strong>${event.year} - ${escapeHtml(event.label)}:</strong> ${escapeHtml(event.detail)}</li>`).join('')}</ul>
                </details>
              ` : '<p class="muted">Add a birth year to compare this ancestor’s documented lifetime with historical events.</p>'}
              <div class="ancestor-resource-links">
                <a class="btn-secondary" href="${links.youtube}" target="_blank" rel="noopener">Explore on YouTube</a>
                <a class="btn-secondary" href="${links.wikipedia}" target="_blank" rel="noopener">Search Wikipedia</a>
                <a class="btn-secondary" href="${links.archive}" target="_blank" rel="noopener">Search Internet Archive</a>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>
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
        ${report.errors.length ? '<button type="button" class="btn-secondary" data-open-error-workspace>Work Through Errors</button>' : ''}
        <button type="button" class="btn-secondary" data-open-family-builder>Open Family Builder</button>
        <button type="button" class="btn-secondary" data-apply-auto-fixes>Apply Safe Automatic Fixes</button>
        <button type="button" class="btn-secondary" data-show-manual-fixes>Show Manual Fix Guidance</button>
      </div>
      ${report.errors.length ? '<p class="muted">Errors are shown in the Error Workspace, where they can be resolved in batches of 10.</p>' : ''}
      ${renderIssueGroup('Warnings', report.warnings, 'warning')}
      ${renderIssueGroup('Notes', report.info, 'info')}
    </section>
  `;
}

const FAMILY_BUILDER_WORKSHEETS = {
  ancestral: {
    title: 'Ancestral Chart',
    description: 'Track your direct ancestors, document complete family units, and see where research remains.',
  },
  calendar: {
    title: 'Research Calendar',
    description: 'Record every source searched, where it was found, and the next follow-up needed.',
  },
  extract: {
    title: 'Research Extract',
    description: 'Capture the details and evidence taken from each record source for a family or ancestor.',
  },
  correspondence: {
    title: 'Correspondence Record',
    description: 'Track who you contacted, why you wrote, and whether a response has been received.',
  },
  family: {
    title: 'Family Group Sheet',
    description: 'Organize each ancestor, spouse, children, and supporting family information together.',
  },
  source: {
    title: 'Source Summary',
    description: 'Keep a quick reference to information found for each family group and its sources.',
  },
};

function openFamilyBuilder() {
  if (!requireTier('familyBuilder')) return;

  const tools = document.getElementById('familyBuilderTools');
  if (!tools) {
    setStatus('Upload a family tree before opening Family Builder tools.', 'info');
    return;
  }

  tools.scrollIntoView({ behavior: 'smooth', block: 'start' });
  tools.classList.add('highlighted');
  window.setTimeout(() => tools.classList.remove('highlighted'), 1600);
  setStatus('Family Builder is ready. Browse family groups, jump to a generation, or download a research worksheet.', 'success');
}

function renderFamilyBuilderTools(generationData, peopleById) {
  if (!hasTier('personal')) return '';

  const familyGroups = generationData.familyRows;
  const generations = generationData.generations;
  const approvedFixes = treeData.fixHistory?.length || 0;
  const welcomeMessage = approvedFixes
    ? `You have approved ${approvedFixes} change${approvedFixes === 1 ? '' : 's'} so far. Your organized tree and worksheets are ready for the next research step.`
    : 'Start by reviewing one family group or generation. Each detail you confirm helps turn names into a connected family story.';

  return `
    <section id="familyBuilderTools" class="family-builder-tools">
      <div class="report-heading">
        <div>
          <h3>Family Builder</h3>
          <p class="muted">${welcomeMessage}</p>
        </div>
        <span>${approvedFixes} approved automatic change${approvedFixes === 1 ? '' : 's'}</span>
      </div>
      <div class="family-builder-summary">
        <span><strong>${generations.length}</strong> generations</span>
        <span><strong>${familyGroups.length}</strong> family groups</span>
        <span><strong>${treeData.people.length}</strong> people to organize</span>
      </div>
      <div class="family-builder-actions">
        ${generations.map((generation) => `<a class="btn-secondary" href="#generation-${generation}">View generation ${generation}</a>`).join('')}
      </div>
      <div class="worksheet-grid">
        ${Object.entries(FAMILY_BUILDER_WORKSHEETS).map(([id, worksheet]) => `
          <article class="worksheet-card">
            <h4>${escapeHtml(worksheet.title)}</h4>
            <p>${escapeHtml(worksheet.description)}</p>
            <button type="button" class="btn-secondary" data-download-worksheet="${id}">Download form</button>
          </article>
        `).join('')}
      </div>
      <p class="ancestry-forms-note">These are original worksheets generated from your tree. Similar blank forms are also available through Ancestry Forms.</p>
    </section>
  `;
}

function getWorksheetRows(type) {
  const peopleById = new Map(treeData.people.map((person) => [person.id, person]));

  if (type === 'ancestral') {
    const generationData = buildGenerationData(peopleById);
    return generationData.familyRows.map((row) => {
      const parents = [row.family.husbandId, row.family.wifeId]
        .map((id) => peopleById.get(id))
        .filter(Boolean)
        .map((person) => person.name || person.id)
        .join(' and ');
      return [`Generation ${row.generation}`, parents || row.family.id, 'Research status: ________________________'];
    });
  }

  if (type === 'family') {
    return treeData.families.map((family) => {
      const parents = [family.husbandId, family.wifeId]
        .map((id) => peopleById.get(id))
        .filter(Boolean)
        .map((person) => person.name || person.id)
        .join(' and ');
      const children = (family.childrenIds || [])
        .map((id) => peopleById.get(id))
        .filter(Boolean)
        .map((person) => person.name || person.id)
        .join(', ');
      return [family.id, parents || 'Not recorded', children || 'No children recorded'];
    });
  }

  const headings = {
    calendar: ['Date searched', 'Source or repository', 'Result and next step'],
    extract: ['Person or family', 'Source citation', 'Extracted information'],
    correspondence: ['Contact and date', 'Reason for writing', 'Response and follow-up'],
    source: ['Family group', 'Source citation', 'Information found'],
  };
  return Array.from({ length: 12 }, () => headings[type].map(() => ''));
}

function downloadFamilyBuilderWorksheet(type) {
  if (!requireTier('familyBuilder')) return;

  const worksheet = FAMILY_BUILDER_WORKSHEETS[type];
  if (!worksheet) return;

  const headings = {
    ancestral: ['Generation', 'Direct ancestors', 'Progress notes'],
    calendar: ['Date searched', 'Source or repository', 'Result and next step'],
    extract: ['Person or family', 'Source citation', 'Extracted information'],
    correspondence: ['Contact and date', 'Reason for writing', 'Response and follow-up'],
    family: ['Family group', 'Parents or spouses', 'Children'],
    source: ['Family group', 'Source citation', 'Information found'],
  }[type];
  const rows = getWorksheetRows(type);
  const documentHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${escapeHtml(worksheet.title)}</title>
<style>body{color:#1f2937;font-family:Arial,sans-serif;margin:.6in}h1{margin:0 0 8px}p{margin:0 0 18px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #64748b;min-height:26px;padding:8px;text-align:left;vertical-align:top}th{background:#e2e8f0}@media print{@page{margin:.45in}}</style>
</head><body><h1>${escapeHtml(worksheet.title)}</h1><p>${escapeHtml(worksheet.description)}</p><table><thead><tr>${headings.map((heading) => `<th>${escapeHtml(heading)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
  const fileName = `${type}-worksheet.html`;
  const url = URL.createObjectURL(new Blob([documentHtml], { type: 'text/html' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  setStatus(`Downloaded ${worksheet.title}. Open it in a browser to print or save it as a PDF.`, 'success');
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
  const startupParams = new URLSearchParams(window.location.search);
  const administrationReviewTier = startupParams.get('review_tier');
  if (IS_ADMINISTRATION_REVIEW) {
    document.querySelectorAll('a[href="store.html#subscriptions"]').forEach((link) => {
      link.href = 'store.html?admin_review=true#subscriptions';
    });
  }
  if (IS_ADMINISTRATION_REVIEW && SUBSCRIPTION_TIERS[administrationReviewTier]) {
    currentTier = administrationReviewTier;
    localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, currentTier);
    localStorage.setItem(PLAN_SELECTION_STORAGE_KEY, 'true');
  }
  if (startupParams.get('free_review') === 'true') {
    currentTier = 'free';
    localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, currentTier);
    localStorage.setItem(PLAN_SELECTION_STORAGE_KEY, 'true');
  }
  applyCheckoutReturn();
  updateLayoutButtons();
  updateBillingButtons();
  renderSubscriptionPlans();
  updateGedcomUploadLimit();
  loadSubscriptionConfig();
  loadSubscriptionStatusFromCustomer();
  renderFamilyTree();
  if (localStorage.getItem(PLAN_SELECTION_STORAGE_KEY)) {
    welcomeStartAction.href = '/?start=upload';
    welcomeStartAction.textContent = 'Upload Your Family File';
  }
  if (startupParams.get('start') === 'upload') {
    uploadSection.hidden = false;
    uploadSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (startupParams.get('test_plan') === 'true') {
      setStatus(`Test mode: ${SUBSCRIPTION_TIERS[currentTier]?.name || 'selected'} plan is active. Choose a family file to test the guided flow without payment.`, 'info');
    }
  }
});
