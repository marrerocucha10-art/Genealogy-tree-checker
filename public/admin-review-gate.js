// Administration review gate.
//
// The server owns this decision. It hands out an HttpOnly, HMAC-signed session
// cookie that page scripts cannot read or forge, and this module simply asks
// the server whether the current request may run administration review.
// Anything other than an explicit "yes" leaves the review locked, so a static
// deploy with no API, or an unreachable server, fails closed.
const ADMIN_REVIEW_SESSION_ENDPOINT = '/api/admin-review/session';
const ADMIN_REVIEW_UNLOCK_PAGE = 'admin.html';

function administrationReviewRequested() {
  return new URLSearchParams(window.location.search).get('admin_review') === 'true';
}

// Page scripts read the administration flag while parsing, so the answer has to
// be available synchronously. This request only runs on the administration
// path, never for ordinary visitors, so it cannot slow down the normal flow.
function fetchAdministrationReviewState() {
  try {
    const request = new XMLHttpRequest();
    request.open('GET', ADMIN_REVIEW_SESSION_ENDPOINT, false);
    request.send(null);
    if (request.status !== 200) return { configured: false, active: false };
    const result = JSON.parse(request.responseText);
    return { configured: result.configured === true, active: result.active === true };
  } catch (error) {
    return { configured: false, active: false };
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
