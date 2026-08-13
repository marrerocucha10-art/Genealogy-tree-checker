const FAMILY_TREE_CLIENTS_KEY = 'familyTreeClients';
const ACTIVE_FAMILY_TREE_CLIENT_KEY = 'activeFamilyTreeClientId';
const LEGACY_FAMILY_TREE_KEY = 'familyTreeData';

function getClients() {
  try {
    const clients = JSON.parse(localStorage.getItem(FAMILY_TREE_CLIENTS_KEY) || '[]');
    return Array.isArray(clients) ? clients : [];
  } catch (error) {
    return [];
  }
}

function saveClients(clients) {
  localStorage.setItem(FAMILY_TREE_CLIENTS_KEY, JSON.stringify(clients));
}

function getActiveClientId() {
  const activeId = localStorage.getItem(ACTIVE_FAMILY_TREE_CLIENT_KEY) || '';
  return getClients().some((client) => client.id === activeId) ? activeId : '';
}

function getActiveTreeKey() {
  const activeId = getActiveClientId();
  return activeId ? `familyTreeClient:${activeId}` : LEGACY_FAMILY_TREE_KEY;
}

function createClient(name) {
  const client = {
    id: `client-${Date.now()}`,
    name,
    createdAt: new Date().toISOString(),
  };
  const clients = getClients();
  clients.push(client);
  saveClients(clients);
  localStorage.setItem(ACTIVE_FAMILY_TREE_CLIENT_KEY, client.id);
  return client;
}

function setActiveClient(id) {
  if (getClients().some((client) => client.id === id)) {
    localStorage.setItem(ACTIVE_FAMILY_TREE_CLIENT_KEY, id);
  }
}

function deleteClient(id) {
  const wasActive = localStorage.getItem(ACTIVE_FAMILY_TREE_CLIENT_KEY) === id;
  const clients = getClients().filter((client) => client.id !== id);
  saveClients(clients);
  localStorage.removeItem(`familyTreeClient:${id}`);
  if (wasActive) localStorage.removeItem(ACTIVE_FAMILY_TREE_CLIENT_KEY);
}

window.familyTreeClientStorage = {
  createClient,
  deleteClient,
  getActiveClientId,
  getActiveTreeKey,
  getClients,
  setActiveClient,
};
