// Administration review gate.
//
// The review workspace runs entirely in the browser, so this gate is a
// deterrent, not a security boundary: it stops casual discovery of
// `?admin_review=true`, but anyone willing to open developer tools can set the
// session key by hand. Enforce entitlements on the server before treating
// administration review as protected.
//
// Only the SHA-256 of the passphrase is stored here, so the passphrase itself
// never lands in the repository. To rotate it, run the snippet in
// `admin.html`'s comment and replace the digest below.
const ADMIN_REVIEW_TOKEN = '7537771013c4925bd4a2411616cce0ac01f21fbf18c551fb37018ecfee82b22d';
const ADMIN_REVIEW_SESSION_KEY = 'familyTreeAdministrationReviewUnlocked';
const ADMIN_REVIEW_UNLOCK_PAGE = 'admin.html';

async function hashAdministrationReviewPassphrase(passphrase) {
  const bytes = new TextEncoder().encode(passphrase);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function administrationReviewRequested() {
  return new URLSearchParams(window.location.search).get('admin_review') === 'true';
}

function administrationReviewUnlocked() {
  try {
    return sessionStorage.getItem(ADMIN_REVIEW_SESSION_KEY) === ADMIN_REVIEW_TOKEN;
  } catch (error) {
    return false;
  }
}

function isAdministrationReview() {
  return administrationReviewRequested() && administrationReviewUnlocked();
}

function unlockAdministrationReview(token) {
  sessionStorage.setItem(ADMIN_REVIEW_SESSION_KEY, token);
}

function lockAdministrationReview() {
  try {
    sessionStorage.removeItem(ADMIN_REVIEW_SESSION_KEY);
  } catch (error) {
    // Ignore storage failures; the review simply stays locked.
  }
}

// Send anyone asking for administration review to the unlock page first. This
// runs before the page scripts so the workspace never renders unlocked content.
(function guardAdministrationReview() {
  if (!administrationReviewRequested() || administrationReviewUnlocked()) return;
  if (window.location.pathname.endsWith(`/${ADMIN_REVIEW_UNLOCK_PAGE}`)) return;
  const destination = window.location.pathname + window.location.search + window.location.hash;
  window.location.replace(`${ADMIN_REVIEW_UNLOCK_PAGE}?return=${encodeURIComponent(destination)}`);
}());
