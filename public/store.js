const SUBSCRIPTION_STORAGE_KEY = 'familyTreeSubscriptionTier';
const BILLING_INTERVAL_STORAGE_KEY = 'familyTreeBillingInterval';
const STRIPE_CUSTOMER_STORAGE_KEY = 'familyTreeStripeCustomerId';
const PLAN_SELECTION_STORAGE_KEY = 'familyTreePlanSelected';
const subscriptionPlans = document.getElementById('subscriptionPlans');
const subscriptionStatus = document.getElementById('subscriptionStatus');
const manageBillingButton = document.getElementById('manageBilling');
const billingButtons = document.querySelectorAll('[data-billing-interval]');

const tiers = {
  free: {
    name: 'Basic',
    description: 'Review your tree, start a family tree manually, and fix up to 20 validation errors for free.',
    prices: { monthly: 0, annual: 0 },
    features: ['Parse a small GEDCOM', 'Start a family tree manually', '20 non-duplicate error fixes', 'Free duplicate merges'],
  },
  personal: {
    name: 'Family Builder',
    description: 'Organize one family tree with unlimited error review, charts, and research worksheets.',
    prices: { monthly: 19.99, annual: 19.99 },
    features: ['Unlimited manual error fixes', 'Family-tree organization', 'Printable tree and exports', 'Research worksheets'],
  },
  pro: {
    name: 'Pro / Researcher',
    description: 'Unlock advanced cleanup, reporting, and the Genealogy Pro Package.',
    prices: { monthly: 29.99, annual: 29.99 },
    features: ['Safe automatic fixes', 'Full correction report', 'Advanced validation workflow', 'Genealogy Pro Package'],
  },
  business: {
    name: 'Business / Genealogist',
    description: 'Support client-facing genealogy workflows.',
    prices: { monthly: 39.99, annual: 39.99 },
    features: ['Separate client folders and browser-saved trees', 'Client tree workflow', 'Branded reports roadmap', 'Higher limits roadmap'],
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

function updateBillingButtons() {
  billingButtons.forEach((button) => button.classList.toggle('active', button.dataset.billingInterval === billingInterval));
}

function renderPlans() {
  const current = tiers[currentTier] || tiers.free;
  subscriptionStatus.textContent = `Current plan: ${current.name} · ${billingInterval === 'annual' ? 'Annual billing' : 'Monthly billing'}`;
  subscriptionPlans.innerHTML = Object.entries(tiers).map(([id, tier]) => {
    const isFree = id === 'free';
    const isCurrent = id === currentTier;
    const checkoutReady = isFree || stripeConfig?.configured && stripeConfig.tiers?.[id]?.[billingInterval]?.configured;
    const price = tier.prices[billingInterval];
    const priceLabel = isFree ? 'Free' : `$${price.toFixed(2)} / month${billingInterval === 'annual' ? ' billed annually' : ''}`;
    const proPackage = id === 'pro' ? `
      <aside class="pro-package-highlight">
        <strong>Genealogy Pro Package included</strong>
        <p>Digital products, print products, research services, and research journals are included with this plan.</p>
        <div class="plan-package-actions">
          <button type="button" data-open-collection="digitalProducts">Included Digital Perks</button>
          <button type="button" data-open-collection="printProducts">Print Products</button>
          <button type="button" data-open-collection="researchServices">Research Services</button>
          <button type="button" data-open-collection="researchJournals">Research Journals</button>
        </div>
      </aside>` : '';
    return `
      <article class="subscription-card ${isCurrent ? 'current' : ''}">
        <h3>${escapeHtml(tier.name)}</h3>
        <p class="plan-price">${escapeHtml(priceLabel)}</p>
        <p>${escapeHtml(tier.description)}</p>
        <ul>${tier.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>
        ${proPackage}
        ${isCurrent ? '<span class="plan-badge">Current</span>' : ''}
        ${isFree ? `<button class="btn-add" type="button" data-select-free>Start with Basic</button>` : ''}
        ${!isFree && !isCurrent ? `<button class="btn-add" type="button" data-upgrade-tier="${id}" ${checkoutReady ? '' : 'disabled'}>${checkoutReady ? `Choose ${escapeHtml(tier.name)}` : 'Checkout unavailable'}</button>` : ''}
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

subscriptionPlans.addEventListener('click', async (event) => {
  const collectionButton = event.target.closest('[data-open-collection]');
  if (collectionButton) {
    const collection = document.getElementById(collectionButton.dataset.openCollection);
    if (collection) {
      collection.open = true;
      collection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
  }

  if (event.target.closest('[data-select-free]')) {
    currentTier = 'free';
    localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, currentTier);
    localStorage.setItem(PLAN_SELECTION_STORAGE_KEY, 'true');
    window.location.href = '/?start=upload';
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

document.querySelector('[data-open-additional-digital]')?.addEventListener('click', () => {
  const products = document.getElementById('additionalDigitalProducts');
  products.open = true;
  products.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
}

initializeStore();
