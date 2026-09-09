const administrationReview = isAdministrationReview();
const SUBSCRIPTION_STORAGE_KEY = administrationReview ? 'familyTreeAdministrationReviewTier' : 'familyTreeSubscriptionTier';
const BILLING_INTERVAL_STORAGE_KEY = 'familyTreeBillingInterval';
const STRIPE_CUSTOMER_STORAGE_KEY = 'familyTreeStripeCustomerId';
const PLAN_SELECTION_STORAGE_KEY = administrationReview ? 'familyTreeAdministrationReviewPlanSelected' : 'familyTreePlanSelected';
const PRODUCT_VISIBILITY_STORAGE_KEY = 'familyTreeStoreProductVisibility';
const ACTIVE_FAMILY_TREE_CLIENT_KEY = 'activeFamilyTreeClientId';

const subscriptionPlans = document.getElementById('subscriptionPlans');
const subscriptionStatus = document.getElementById('subscriptionStatus');
const manageBillingButton = document.getElementById('manageBilling');
const billingButtons = document.querySelectorAll('[data-billing-interval]');
const keepsakeCards = [...document.querySelectorAll('[data-product-id]')];
const gedRequiredProductPanel = document.getElementById('gedRequiredProductPanel');

const tiers = {
  free: {
    name: 'Basic',
    description: 'Upload a GEDCOM file and fix five duplicate records and five other errors at no charge.',
    prices: { monthly: 0, annual: 0 },
    features: ['GEDCOM uploads up to 150 MB', 'Fix 5 duplicates and 5 other errors', 'Choose a plan to fix the rest'],
  },
  personal: {
    name: 'Family Builder',
    description: 'Organize one family tree with unlimited error review, charts, and research worksheets.',
    prices: { monthly: 19.99, annual: 19.99 },
    features: ['GEDCOM uploads up to 500 MB', 'Unlimited manual error fixes', 'Family-tree organization', 'Printable tree and exports', 'Research worksheets'],
  },
  pro: {
    name: 'Pro / Researcher',
    description: 'Unlock advanced cleanup, reporting, the Genealogy Pro Package, and up to 10 separately organized family trees.',
    prices: { monthly: 29.99, annual: 29.99 },
    features: ['Up to 10 separate family-tree workspaces', 'Surname and generation labels for each workspace', 'GEDCOM uploads up to 500 MB', 'Safe automatic fixes', 'Full correction report', 'Advanced validation workflow', 'Genealogy Pro Package'],
  },
  business: {
    name: 'Business / Genealogist',
    description: 'Support client-facing genealogy workflows.',
    prices: { monthly: 39.99, annual: 39.99 },
    features: ['Unlimited separate client workspaces', 'Surname and generation labels for each workspace', 'GEDCOM uploads up to 2 GB', 'Client tree workflow', 'Branded reports roadmap'],
  },
};

const keepsakeProducts = {
  'family-tree-poster': {
    id: 'family-tree-poster',
    name: 'Personalized Family Tree Poster',
    detailsUrl: 'family-tree-poster.html',
    requiresTreeData: true,
    defaultVisibility: 'pending',
  },
  'ancestor-chart-poster': {
    id: 'ancestor-chart-poster',
    name: 'Ancestor Chart Poster',
    requiresTreeData: true,
    defaultVisibility: 'pending',
  },
  'family-history-journal': {
    id: 'family-history-journal',
    name: 'Family History Journal',
    detailsUrl: 'family-history-journal.html',
    requiresTreeData: true,
    defaultVisibility: 'pending',
  },
  'surname-research-workbook': {
    id: 'surname-research-workbook',
    name: 'Surname Research Workbook',
    requiresTreeData: false,
    defaultVisibility: 'pending',
  },
  'family-reunion-sign': {
    id: 'family-reunion-sign',
    name: 'Family Reunion Welcome Sign',
    requiresTreeData: true,
    defaultVisibility: 'pending',
  },
  'qr-memorial-story-marker': {
    id: 'qr-memorial-story-marker',
    name: 'QR Memorial Story Marker',
    detailsUrl: 'qr-memorial-story-marker.html',
    requiresTreeData: false,
    defaultVisibility: 'public',
  },
  'digital-family-history-booklet': {
    id: 'digital-family-history-booklet',
    name: 'Digital Family History Booklet',
    requiresTreeData: true,
    defaultVisibility: 'pending',
  },
};

let currentTier = localStorage.getItem(SUBSCRIPTION_STORAGE_KEY) || 'free';
let billingInterval = localStorage.getItem(BILLING_INTERVAL_STORAGE_KEY) || 'monthly';
let stripeCustomerId = localStorage.getItem(STRIPE_CUSTOMER_STORAGE_KEY) || '';
let stripeConfig = null;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character]));
}

function getProductVisibilityState() {
  const defaults = Object.fromEntries(Object.values(keepsakeProducts).map((product) => [product.id, product.defaultVisibility]));
  try {
    const stored = JSON.parse(localStorage.getItem(PRODUCT_VISIBILITY_STORAGE_KEY) || '{}');
    if (!stored || typeof stored !== 'object') return defaults;
    return { ...defaults, ...stored };
  } catch (error) {
    return defaults;
  }
}

function saveProductVisibilityState(state) {
  localStorage.setItem(PRODUCT_VISIBILITY_STORAGE_KEY, JSON.stringify(state));
}

function updateBillingButtons() {
  billingButtons.forEach((button) => button.classList.toggle('active', button.dataset.billingInterval === billingInterval));
}

function renderPlans() {
  const current = tiers[currentTier] || tiers.free;
  manageBillingButton.hidden = !stripeCustomerId;
  subscriptionStatus.textContent = `Current plan: ${current.name} · ${billingInterval === 'annual' ? 'Annual billing' : 'Monthly billing'} · Store access is open to all users`;
  subscriptionPlans.innerHTML = Object.entries(tiers).filter(([id]) => id !== 'free').map(([id, tier]) => {
    const isCurrent = id === currentTier;
    const checkoutReady = stripeConfig?.configured && stripeConfig.tiers?.[id]?.[billingInterval]?.configured;
    const price = tier.prices[billingInterval];
    const priceLabel = `$${price.toFixed(2)} / month${billingInterval === 'annual' ? ' billed annually' : ''}`;
    const testButton = stripeConfig?.testSubscriptionsEnabled || administrationReview
      ? `<button class="btn-secondary" type="button" data-test-tier="${id}">${administrationReview ? `Review ${escapeHtml(tier.name)} at No Charge` : `Test ${escapeHtml(tier.name)} flow`}</button>`
      : '';
    const proPackage = id === 'pro' ? `
      <aside class="pro-package-highlight">
        <strong>Genealogy Pro Package included</strong>
        <p>Digital products, print products, research services, and research journals are included with this plan.</p>
      </aside>` : '';
    return `
      <article class="subscription-card ${isCurrent ? 'current' : ''}">
        <h3>${escapeHtml(tier.name)}</h3>
        <p class="plan-price">${escapeHtml(priceLabel)}</p>
        <p>${escapeHtml(tier.description)}</p>
        <ul>${tier.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>
        ${proPackage}
        ${isCurrent ? '<span class="plan-badge">Current</span>' : ''}
        ${!administrationReview && !isCurrent ? `<button class="btn-add" type="button" data-upgrade-tier="${id}" ${checkoutReady ? '' : 'disabled'}>${checkoutReady ? `Choose ${escapeHtml(tier.name)}` : 'Checkout unavailable'}</button>` : ''}
        ${testButton}
      </article>
    `;
  }).join('');
}

async function startCheckout(tier) {
  const response = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier, interval: billingInterval }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || 'Could not start checkout.');
  window.location.href = result.url;
}

async function applyCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('checkout') !== 'success' || !params.get('session_id')) return;
  const response = await fetch(`/api/subscription/status?session_id=${encodeURIComponent(params.get('session_id'))}`);
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || 'Could not confirm Stripe subscription.');
  const subscription = result.subscription;
  currentTier = subscription.active ? subscription.tier : 'free';
  billingInterval = subscription.interval || billingInterval;
  stripeCustomerId = subscription.customerId || '';
  localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, currentTier);
  localStorage.setItem(BILLING_INTERVAL_STORAGE_KEY, billingInterval);
  localStorage.setItem(PLAN_SELECTION_STORAGE_KEY, 'true');
  if (stripeCustomerId) localStorage.setItem(STRIPE_CUSTOMER_STORAGE_KEY, stripeCustomerId);
  window.location.href = '/?start=upload';
}

async function treeHasPeople(treeKey) {
  try {
    const stored = JSON.parse(localStorage.getItem(treeKey) || 'null');
    if (stored?.people?.length) return true;
  } catch (error) {
    // continue with database fallback
  }
  try {
    const fromDatabase = await window.familyTreeClientStorage?.loadTreeFromDatabase?.(treeKey);
    return Boolean(fromDatabase?.people?.length);
  } catch (error) {
    return false;
  }
}

async function getSavedTreeOptions() {
  const options = [];
  const activeClientId = window.familyTreeClientStorage?.getActiveClientId?.() || '';
  const activeKey = window.familyTreeClientStorage?.getActiveTreeKey?.() || 'familyTreeData';
  if (await treeHasPeople(activeKey)) {
    options.push({
      id: 'active',
      label: activeClientId ? 'Active saved family tree' : 'Current family tree in this browser',
      key: activeKey,
      clientId: activeClientId,
      isLegacy: !activeClientId,
    });
  }

  const clients = window.familyTreeClientStorage?.getClients?.() || [];
  const checks = clients.map(async (client) => {
    const key = `familyTreeClient:${client.id}`;
    if (!(await treeHasPeople(key))) return null;
    return {
      id: client.id,
      label: `${client.name || 'Saved tree'}${client.surname ? ` ${client.surname}` : ''}`.trim(),
      key,
      clientId: client.id,
      isLegacy: false,
    };
  });
  const availableClientTrees = (await Promise.all(checks)).filter(Boolean);
  for (const tree of availableClientTrees) {
    if (!options.some((option) => option.key === tree.key)) options.push(tree);
  }
  return options;
}

function openGedRequiredPanel(product) {
  if (!gedRequiredProductPanel) return;
  gedRequiredProductPanel.hidden = false;
  gedRequiredProductPanel.dataset.productId = product.id;
  gedRequiredProductPanel.dataset.productUrl = product.detailsUrl || '';
  gedRequiredProductPanel.innerHTML = `
    <h3>${escapeHtml(product.name)} needs a family tree first</h3>
    <p>To continue, upload and parse a GED file, or choose a previously saved family tree.</p>
    <div class="tree-summary-actions">
      <a class="btn-add" href="index.html?start=upload">Upload Family Tree</a>
      <button class="btn-secondary" type="button" data-open-saved-tree-selector>Use Previously Saved Family Tree</button>
    </div>
    <div id="savedTreeSelector" hidden>
      <label for="savedTreeList">Choose a saved family tree</label>
      <select id="savedTreeList">
        <option value="">Select a saved family tree</option>
      </select>
      <div class="tree-summary-actions">
        <button class="btn-add" type="button" data-use-selected-tree disabled>Continue with Selected Tree</button>
      </div>
      <p id="savedTreeNotice" class="muted"></p>
    </div>
  `;
  gedRequiredProductPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function createProductAction(product) {
  if (!product.detailsUrl) return '';
  if (product.requiresTreeData) {
    return `<button class="btn-add" type="button" data-select-ged-required-product="${escapeHtml(product.id)}">Select Product</button>`;
  }
  return `<a class="btn-add" href="${escapeHtml(product.detailsUrl)}">Select Product</a>`;
}

function renderKeepsakeCatalog() {
  const visibilityState = getProductVisibilityState();
  keepsakeCards.forEach((card) => {
    const productId = card.dataset.productId;
    const product = keepsakeProducts[productId];
    if (!product) return;
    const visibility = visibilityState[productId] === 'public' ? 'public' : 'pending';
    const showCard = administrationReview || visibility === 'public';
    card.hidden = !showCard;

    let actions = card.querySelector('[data-product-actions]');
    if (!actions) {
      actions = document.createElement('div');
      actions.dataset.productActions = 'true';
      actions.className = 'poster-product-actions';
      card.appendChild(actions);
    }
    actions.innerHTML = createProductAction(product);

    let review = card.querySelector('[data-product-review-controls]');
    if (!review) {
      review = document.createElement('div');
      review.dataset.productReviewControls = 'true';
      review.className = 'tree-summary-actions';
      card.appendChild(review);
    }
    if (administrationReview) {
      review.hidden = false;
      review.innerHTML = `
        <button class="btn-secondary" type="button" data-toggle-product-visibility="${escapeHtml(productId)}">
          ${visibility === 'public' ? 'Mark as Pending Review' : 'Publish to Public Store'}
        </button>
      `;
    } else {
      review.hidden = true;
      review.innerHTML = '';
    }
  });
}

subscriptionPlans.addEventListener('click', async (event) => {
  const testButton = event.target.closest('[data-test-tier]');
  if (testButton) {
    currentTier = testButton.dataset.testTier;
    localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, currentTier);
    localStorage.setItem(PLAN_SELECTION_STORAGE_KEY, 'true');
    window.location.href = `index.html?start=upload&test_plan=true&admin_review=true&review_tier=${encodeURIComponent(currentTier)}`;
    return;
  }

  const button = event.target.closest('[data-upgrade-tier]');
  if (!button) return;
  button.disabled = true;
  try {
    await startCheckout(button.dataset.upgradeTier);
  } catch (error) {
    button.disabled = false;
    alert(error.message);
  }
});

document.querySelector('[data-toggle-coming-soon]')?.addEventListener('click', (event) => {
  const content = document.getElementById('comingSoonKeepsakes');
  const isOpen = content.hidden;
  content.hidden = !isOpen;
  event.currentTarget.setAttribute('aria-expanded', String(isOpen));
  event.currentTarget.textContent = isOpen
    ? 'Hide Personalized Keepsakes'
    : 'Coming Soon: Explore Personalized Keepsakes';
});

document.getElementById('comingSoonKeepsakes')?.addEventListener('click', async (event) => {
  const visibilityButton = event.target.closest('[data-toggle-product-visibility]');
  if (visibilityButton) {
    const productId = visibilityButton.dataset.toggleProductVisibility;
    if (!keepsakeProducts[productId]) return;
    const state = getProductVisibilityState();
    state[productId] = state[productId] === 'public' ? 'pending' : 'public';
    saveProductVisibilityState(state);
    renderKeepsakeCatalog();
    return;
  }

  const requiresTreeButton = event.target.closest('[data-select-ged-required-product]');
  if (requiresTreeButton) {
    const product = keepsakeProducts[requiresTreeButton.dataset.selectGedRequiredProduct];
    if (!product) return;
    openGedRequiredPanel(product);
    return;
  }
});

gedRequiredProductPanel?.addEventListener('click', async (event) => {
  if (event.target.closest('[data-open-saved-tree-selector]')) {
    const selectorPanel = document.getElementById('savedTreeSelector');
    const select = document.getElementById('savedTreeList');
    const notice = document.getElementById('savedTreeNotice');
    const continueButton = gedRequiredProductPanel.querySelector('[data-use-selected-tree]');
    selectorPanel.hidden = false;
    select.innerHTML = '<option value="">Select a saved family tree</option>';
    continueButton.disabled = true;
    notice.textContent = 'Loading saved family trees...';
    const trees = await getSavedTreeOptions();
    for (const tree of trees) {
      const option = document.createElement('option');
      option.value = JSON.stringify({
        key: tree.key,
        clientId: tree.clientId || '',
        isLegacy: tree.isLegacy,
      });
      option.textContent = tree.label;
      select.appendChild(option);
    }
    notice.textContent = trees.length ? 'Select one saved tree, then continue to this product.' : 'No saved family tree was found in this browser yet.';
    return;
  }

  if (event.target.closest('[data-use-selected-tree]')) {
    const selected = document.getElementById('savedTreeList')?.value;
    const productUrl = gedRequiredProductPanel.dataset.productUrl;
    if (!selected || !productUrl) return;
    const choice = JSON.parse(selected);
    if (choice.isLegacy) {
      localStorage.removeItem(ACTIVE_FAMILY_TREE_CLIENT_KEY);
    } else if (choice.clientId) {
      window.familyTreeClientStorage?.setActiveClient?.(choice.clientId);
    }
    window.location.href = productUrl;
  }
});

gedRequiredProductPanel?.addEventListener('change', (event) => {
  if (event.target.id !== 'savedTreeList') return;
  const continueButton = gedRequiredProductPanel.querySelector('[data-use-selected-tree]');
  if (continueButton) continueButton.disabled = !event.target.value;
});

billingButtons.forEach((button) => button.addEventListener('click', () => {
  billingInterval = button.dataset.billingInterval;
  localStorage.setItem(BILLING_INTERVAL_STORAGE_KEY, billingInterval);
  updateBillingButtons();
  renderPlans();
}));

manageBillingButton.addEventListener('click', async () => {
  if (!stripeCustomerId) {
    alert('Manage billing after completing a Stripe checkout.');
    return;
  }
  const response = await fetch('/api/create-portal-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId: stripeCustomerId }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    alert(result.error || 'Could not open the billing portal.');
    return;
  }
  window.location.href = result.url;
});

async function initializeStore() {
  try {
    await applyCheckoutReturn();
    const response = await fetch('/api/subscription/config');
    const result = await response.json();
    stripeConfig = result.stripe || null;
  } catch (error) {
    stripeConfig = null;
  }
  updateBillingButtons();
  renderPlans();
  renderKeepsakeCatalog();
}

initializeStore();
