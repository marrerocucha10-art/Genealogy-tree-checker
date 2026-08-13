const SUBSCRIPTION_STORAGE_KEY = 'familyTreeSubscriptionTier';
const workspace = document.getElementById('clientWorkspace');
const clientStorage = window.familyTreeClientStorage;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character]));
}

function getClientPersonCount(clientId) {
  try {
    const tree = JSON.parse(localStorage.getItem(`familyTreeClient:${clientId}`) || 'null');
    return Array.isArray(tree?.people) ? tree.people.length : 0;
  } catch (error) {
    return 0;
  }
}

function renderWorkspace() {
  if (localStorage.getItem(SUBSCRIPTION_STORAGE_KEY) !== 'business') {
    workspace.innerHTML = `
      <section class="client-access-gate">
        <h2>Business / Genealogist feature</h2>
        <p>Client Workspaces keep each client’s saved tree and error progress separate in this browser.</p>
        <a class="btn-add" href="store.html#subscriptions">Choose the Business / Genealogist plan</a>
      </section>
    `;
    return;
  }

  const activeClientId = clientStorage.getActiveClientId();
  const clients = clientStorage.getClients();
  workspace.innerHTML = `
    <section class="client-workspace">
      <h2>Create a client folder</h2>
      <form id="clientForm">
        <div class="form-group">
          <label for="clientName">Client name</label>
          <input id="clientName" type="text" placeholder="e.g., Morgan Family" required>
        </div>
        <button class="btn-add" type="submit">Create client folder</button>
      </form>
    </section>
    <section class="client-workspace">
      <h2>Saved client trees</h2>
      ${clients.length ? `<div class="client-list">${clients.map((client) => `
        <article class="client-card ${client.id === activeClientId ? 'active-client' : ''}">
          <div>
            <h3>${escapeHtml(client.name)}</h3>
            <p>${getClientPersonCount(client.id)} saved people${client.id === activeClientId ? ' · Active workspace' : ''}</p>
          </div>
          <div class="client-card-actions">
            <button type="button" class="btn-secondary" data-open-client="${escapeHtml(client.id)}">Open</button>
            <button type="button" class="btn-secondary" data-delete-client="${escapeHtml(client.id)}">Delete</button>
          </div>
        </article>
      `).join('')}</div>` : '<p class="empty-message">Create a folder for your first client to begin.</p>'}
    </section>
  `;
}

workspace.addEventListener('submit', (event) => {
  if (event.target.id !== 'clientForm') return;
  event.preventDefault();
  const input = document.getElementById('clientName');
  const name = input.value.trim();
  if (!name) return;
  clientStorage.createClient(name);
  window.location.href = '/?start=upload';
});

workspace.addEventListener('click', (event) => {
  const openButton = event.target.closest('[data-open-client]');
  if (openButton) {
    clientStorage.setActiveClient(openButton.dataset.openClient);
    window.location.href = 'index.html';
    return;
  }
  const deleteButton = event.target.closest('[data-delete-client]');
  if (deleteButton && confirm('Delete this client folder and its browser-saved family tree?')) {
    clientStorage.deleteClient(deleteButton.dataset.deleteClient);
    renderWorkspace();
  }
});

renderWorkspace();
