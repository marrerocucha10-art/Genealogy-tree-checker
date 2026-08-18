const SUBSCRIPTION_STORAGE_KEY = 'familyTreeSubscriptionTier';
const workspace = document.getElementById('clientWorkspace');
const clientStorage = window.familyTreeClientStorage;
const PRO_TREE_LIMIT = 10;

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
  const tier = localStorage.getItem(SUBSCRIPTION_STORAGE_KEY) || 'free';
  const hasWorkspaceAccess = ['pro', 'business'].includes(tier);
  if (!hasWorkspaceAccess) {
    workspace.innerHTML = `
      <section class="client-access-gate">
        <h2>Pro / Researcher feature</h2>
        <p>Family Tree Workspaces keep each saved tree and its error progress separate in this browser. Pro includes up to ${PRO_TREE_LIMIT} workspaces, organized with family, surname, and generation labels.</p>
        <a class="btn-add" href="store.html#subscriptions">Choose the Pro / Researcher plan</a>
      </section>
    `;
    return;
  }

  const activeClientId = clientStorage.getActiveClientId();
  const clients = clientStorage.getClients();
  const isAtTreeLimit = tier === 'pro' && clients.length >= PRO_TREE_LIMIT;
  const workspaceLimitMessage = tier === 'pro'
    ? `<p class="help-text">Your Pro / Researcher plan includes up to ${PRO_TREE_LIMIT} separate family-tree workspaces. ${clients.length} of ${PRO_TREE_LIMIT} used. Upgrade to Business / Genealogist for unlimited client workspaces.</p>`
    : '<p class="help-text">Your Business / Genealogist plan includes unlimited separate client workspaces.</p>';
  workspace.innerHTML = `
    <section class="client-workspace">
      <h2>Create a family-tree workspace</h2>
      ${workspaceLimitMessage}
      <form id="clientForm">
        <div class="form-group">
          <label for="clientName">Family or tree name</label>
          <input id="clientName" type="text" placeholder="e.g., Morgan Family" required>
        </div>
        <div class="form-group">
          <label for="clientSurname">Surname label (optional)</label>
          <input id="clientSurname" type="text" placeholder="e.g., Morgan">
        </div>
        <div class="form-group">
          <label for="clientGeneration">Generation label (optional)</label>
          <input id="clientGeneration" type="text" placeholder="e.g., Great-grandparents">
        </div>
        <button class="btn-add" type="submit" ${isAtTreeLimit ? 'disabled' : ''}>${isAtTreeLimit ? 'Pro workspace limit reached' : 'Create family-tree workspace'}</button>
      </form>
    </section>
    <section class="client-workspace">
      <h2>Saved family-tree workspaces</h2>
      ${clients.length ? `<div class="client-list">${clients.map((client) => `
        <article class="client-card ${client.id === activeClientId ? 'active-client' : ''}">
          <div>
            <h3>${escapeHtml(client.name)}</h3>
            <p>${[client.surname && `Surname: ${escapeHtml(client.surname)}`, client.generation && `Generation: ${escapeHtml(client.generation)}`, `${getClientPersonCount(client.id)} saved people`, client.id === activeClientId && 'Active workspace'].filter(Boolean).join(' · ')}</p>
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
  const tier = localStorage.getItem(SUBSCRIPTION_STORAGE_KEY) || 'free';
  if (tier === 'pro' && clientStorage.getClients().length >= PRO_TREE_LIMIT) {
    renderWorkspace();
    return;
  }
  clientStorage.createClient(
    name,
    document.getElementById('clientSurname').value.trim(),
    document.getElementById('clientGeneration').value.trim(),
  );
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
