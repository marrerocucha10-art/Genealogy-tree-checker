const SUPABASE_URL = 'https://zxrjtmblykyexrmqsikt.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_MVqVHHooqrIjnfg96g8syw_8ykvsyd8';
const accountForm = document.getElementById('digitalAccessForm');
const accountStatus = document.getElementById('digitalAccessStatus');

function setAccountStatus(message, type = '') {
  if (!accountStatus) return;
  accountStatus.textContent = message;
  accountStatus.className = `status-message ${type}`.trim();
}

async function getSignedInUser() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get('access_token');
  if (accessToken) {
    localStorage.setItem('supabaseAccessToken', accessToken);
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  }

  const token = localStorage.getItem('supabaseAccessToken');
  if (!token) return null;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    localStorage.removeItem('supabaseAccessToken');
    return null;
  }
  return response.json();
}

async function initializeDigitalAccess() {
  try {
    const user = await getSignedInUser();
    if (user) {
      setAccountStatus(`Signed in as ${user.email}. Your eligible digital products will appear here after subscription access is connected.`, 'success');
    }
  } catch (error) {
    setAccountStatus('Could not confirm your digital-product account.', 'error');
  }
}

accountForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.getElementById('digitalAccessEmail').value.trim();
  if (!email) return;

  setAccountStatus('Sending your secure sign-in link...', 'info');
  const response = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      create_user: true,
      email_redirect_to: `${window.location.origin}/store`,
    }),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    setAccountStatus(result.message || 'Could not send the sign-in link.', 'error');
    return;
  }
  setAccountStatus('Check your email for a secure sign-in link.', 'success');
});

initializeDigitalAccess();
