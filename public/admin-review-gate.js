// Administration review gate.
//
// This gate is optional by design. Administration review only reveals the
// no-charge buttons for walking the subscription flow — paid entitlements are
// kept in localStorage and can be edited by anyone, so requiring a passphrase
// here protects very little and is not a revenue control.
//
// So it stays open unless an operator opts in: set ADMIN_REVIEW_PASSPHRASE_HASH
// on the server and the passphrase becomes mandatory, enforced by an HttpOnly,
// HMAC-signed session cookie that page scripts cannot read or forge. With no
// server at all (a static deploy), review simply stays open, which is the same
// behaviour a static host had before the server gate existed.
const ADMIN_REVIEW_SESSION_ENDPOINT = '/api/admin-review/session';
const ADMIN_REVIEW_UNLOCK_PAGE = 'admin.html';
const ADMIN_REVIEW_STICKY_KEY = 'familyTreeAdministrationReviewRequested';

// Administration review has to survive ordinary navigation and closing the tab.
// Asking an operator to retype ?admin_review=true on every page meant the
// no-charge buttons disappeared the moment they followed any link. The request
// is remembered on this computer until it is switched off with
// ?admin_review=false, so review stays on while the application is being
// prepared. A customer never inherits it: nothing is stored until the
// administration address is opened deliberately.
function administrationReviewRequested() {
  const requested = new URLSearchParams(window.location.search).get('admin_review');
  try {
    if (requested === 'true') {
      localStorage.setItem(ADMIN_REVIEW_STICKY_KEY, 'true');
      return true;
    }
    if (requested === 'false') {
      localStorage.removeItem(ADMIN_REVIEW_STICKY_KEY);
      return false;
    }
    return localStorage.getItem(ADMIN_REVIEW_STICKY_KEY) === 'true';
  } catch (error) {
    return requested === 'true';
  }
}

// Page scripts read the administration flag while parsing, so the answer has to
// be available synchronously. This request only runs on the administration
// path, never for ordinary visitors, so it cannot slow down the normal flow.
function fetchAdministrationReviewState() {
  try {
    const request = new XMLHttpRequest();
    request.open('GET', ADMIN_REVIEW_SESSION_ENDPOINT, false);
    request.send(null);
    if (request.status !== 200) return { configured: false, active: true };
    const result = JSON.parse(request.responseText);
    if (result.configured !== true) return { configured: false, active: true };
    return { configured: true, active: result.active === true };
  } catch (error) {
    return { configured: false, active: true };
  }
}

const ADMINISTRATION_REVIEW_STATE = administrationReviewRequested()
  ? fetchAdministrationReviewState()
  : { configured: false, active: false };

function isAdministrationReview() {
  return administrationReviewRequested() && ADMINISTRATION_REVIEW_STATE.active;
}

async function requestAdministrationReviewState() {
  const response = await fetch(ADMIN_REVIEW_SESSION_ENDPOINT, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Administration review is unavailable on this deployment.');
  return response.json();
}

async function unlockAdministrationReview(passphrase) {
  let response;
  try {
    response = await fetch(ADMIN_REVIEW_SESSION_ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase }),
    });
  } catch (error) {
    throw new Error('Could not reach the server. Administration review needs the Node server running.');
  }

  let result = {};
  try {
    result = await response.json();
  } catch (error) {
    throw new Error('Administration review is unavailable on this deployment.');
  }

  if (!response.ok || !result.success) {
    throw new Error(result.error || 'That passphrase was not recognized.');
  }
  return result;
}

async function lockAdministrationReview() {
  await fetch(ADMIN_REVIEW_SESSION_ENDPOINT, { method: 'DELETE', credentials: 'same-origin' });
}

// Send anyone asking for administration review to the unlock page first, so the
// workspace never renders unlocked content without a verified session.
(function guardAdministrationReview() {
  if (!administrationReviewRequested() || ADMINISTRATION_REVIEW_STATE.active) return;
  if (window.location.pathname.endsWith(`/${ADMIN_REVIEW_UNLOCK_PAGE}`)) return;
  const destination = window.location.pathname + window.location.search + window.location.hash;
  window.location.replace(`${ADMIN_REVIEW_UNLOCK_PAGE}?return=${encodeURIComponent(destination)}`);
}());

// A page restored from the back/forward cache keeps the markup it was rendered
// with and never re-runs the guard above, so a locked or expired session could
// still be looking at unlocked content. Re-check on restore and reload.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted || !administrationReviewRequested()) return;
  requestAdministrationReviewState()
    .then((state) => {
      if (state.active !== ADMINISTRATION_REVIEW_STATE.active) window.location.reload();
    })
    .catch(() => window.location.reload());
});
