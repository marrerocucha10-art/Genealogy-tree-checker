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

// Administration review keeps its own copy of the tree so reviewing never edits a
// real client's records. Without a copy the review pages look empty, which reads as
// "the tree disappeared", so take one from the tree already loaded instead of asking
// for the GEDCOM again.
function seedAdministrationReviewTree(administrationKey) {
  try {
    if (!administrationKey || localStorage.getItem(administrationKey)) return;
    const loadedTree = localStorage.getItem(getActiveTreeKey()) || localStorage.getItem(LEGACY_FAMILY_TREE_KEY);
    if (!loadedTree) return;
    localStorage.setItem(administrationKey, loadedTree);
  } catch (error) {
    // A full or unavailable storage just leaves the review empty, as before.
  }
}

function createClient(name, surname = '', generation = '') {
  const client = {
    id: `client-${Date.now()}`,
    name,
    surname,
    generation,
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

// A GEDCOM can record a family link on one side only: the child names the
// family it belongs to while the family itself never lists that child, or a
// parent names the family while the family has no husband or wife recorded.
// Reading one side alone loses a parent that is plainly in the file, so both
// sides are filled in from each other before anything is shown.
function normalizeFamilyLinks(treeData) {
  if (!treeData?.people?.length || !treeData?.families?.length) return treeData;
  const familiesById = new Map(treeData.families.map((family) => [family.id, family]));

  for (const person of treeData.people) {
    for (const familyId of person.familyAsChild || []) {
      const family = familiesById.get(familyId);
      if (!family) continue;
      if (!Array.isArray(family.childrenIds)) family.childrenIds = [];
      if (!family.childrenIds.includes(person.id)) family.childrenIds.push(person.id);
    }

    for (const familyId of person.familyAsSpouse || []) {
      const family = familiesById.get(familyId);
      if (!family) continue;
      if (family.husbandId === person.id || family.wifeId === person.id) continue;
      const sex = String(person.sex || '').trim().toUpperCase();
      if (sex.startsWith('M') && !family.husbandId) family.husbandId = person.id;
      else if (sex.startsWith('F') && !family.wifeId) family.wifeId = person.id;
      else if (!family.husbandId) family.husbandId = person.id;
      else if (!family.wifeId) family.wifeId = person.id;
    }
  }

  for (const family of treeData.families) {
    for (const parentId of [family.husbandId, family.wifeId]) {
      if (!parentId) continue;
      const parent = treeData.people.find((person) => person.id === parentId);
      if (!parent) continue;
      if (!Array.isArray(parent.familyAsSpouse)) parent.familyAsSpouse = [];
      if (!parent.familyAsSpouse.includes(family.id)) parent.familyAsSpouse.push(family.id);
    }
    for (const childId of family.childrenIds || []) {
      const child = treeData.people.find((person) => person.id === childId);
      if (!child) continue;
      if (!Array.isArray(child.familyAsChild)) child.familyAsChild = [];
      if (!child.familyAsChild.includes(family.id)) child.familyAsChild.push(family.id);
    }
  }

  return treeData;
}

window.familyTreeClientStorage = {
  normalizeFamilyLinks,
  createClient,
  deleteClient,
  getActiveClientId,
  getActiveTreeKey,
  getClients,
  loadTreeFromDatabase,
  removeTreeFromDatabase,
  saveTreeInDatabase,
  seedAdministrationReviewTree,
  setActiveClient,
};
