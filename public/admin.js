const unlockForm = document.getElementById('adminUnlockForm');
const passphraseInput = document.getElementById('adminPassphrase');
const statusMessage = document.getElementById('adminStatus');

const DEFAULT_RETURN_URL = 'store.html?admin_review=true#subscriptions';

// Only allow same-origin relative destinations so a crafted `return` value
// cannot turn this page into an open redirect.
function getSafeReturnUrl() {
  const requested = new URLSearchParams(window.location.search).get('return');
  if (!requested) return DEFAULT_RETURN_URL;
  if (/^[a-z][a-z0-9+.-]*:/i.test(requested)) return DEFAULT_RETURN_URL;
  if (requested.startsWith('//')) return DEFAULT_RETURN_URL;

  const resolved = new URL(requested, window.location.href);
  if (resolved.origin !== window.location.origin) return DEFAULT_RETURN_URL;
  if (resolved.pathname.endsWith('/admin.html')) return DEFAULT_RETURN_URL;
  return resolved.pathname + resolved.search + resolved.hash;
}

function setStatus(message, isError) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle('error', Boolean(isError));
  statusMessage.classList.toggle('success', !isError && Boolean(message));
}

unlockForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const passphrase = passphraseInput.value.trim();
  if (!passphrase) return;

  setStatus('Checking passphrase...', false);

  let token;
  try {
    token = await hashAdministrationReviewPassphrase(passphrase);
  } catch (error) {
    setStatus('This browser cannot verify the passphrase. Open the page over HTTPS and try again.', true);
    return;
  }

  if (token !== ADMIN_REVIEW_TOKEN) {
    passphraseInput.value = '';
    setStatus('That passphrase was not recognized.', true);
    return;
  }

  unlockAdministrationReview(token);
  setStatus('Unlocked. Opening administration review...', false);
  window.location.replace(getSafeReturnUrl());
});
