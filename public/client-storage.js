const FAMILY_TREE_CLIENTS_KEY = 'familyTreeClients';
const ACTIVE_FAMILY_TREE_CLIENT_KEY = 'activeFamilyTreeClientId';
const LEGACY_FAMILY_TREE_KEY = 'familyTreeData';
const TREE_DATABASE = 'genealogyTreeCheckerData';
const TREE_STORE = 'trees';

function openTreeDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TREE_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(TREE_STORE)) {
        request.result.createObjectStore(TREE_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open family tree storage.'));
  });
}

async function saveTreeInDatabase(key, treeData) {
  const database = await openTreeDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(TREE_STORE, 'readwrite');
      transaction.objectStore(TREE_STORE).put({ key, treeData });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function loadTreeFromDatabase(key) {
  const database = await openTreeDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(TREE_STORE, 'readonly').objectStore(TREE_STORE).get(key);
      request.onsuccess = () => resolve(request.result?.treeData || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function removeTreeFromDatabase(key) {
  const database = await openTreeDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(TREE_STORE, 'readwrite');
      transaction.objectStore(TREE_STORE).delete(key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

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
  void removeTreeFromDatabase(`familyTreeClient:${id}`);
  if (wasActive) localStorage.removeItem(ACTIVE_FAMILY_TREE_CLIENT_KEY);
}

window.familyTreeClientStorage = {
  createClient,
  deleteClient,
  getActiveClientId,
  getActiveTreeKey,
  getClients,
  loadTreeFromDatabase,
  removeTreeFromDatabase,
  saveTreeInDatabase,
  setActiveClient,
};
