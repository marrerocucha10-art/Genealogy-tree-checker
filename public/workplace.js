const STORAGE_KEY = window.familyTreeClientStorage?.getActiveTreeKey() || 'familyTreeData';
const SUBSCRIPTION_STORAGE_KEY = 'familyTreeSubscriptionTier';
const workPlace = document.getElementById('workPlace');

const PLAN_DETAILS = {
  free: {
    name: 'Free Review',
    features: ['Review the first five family-tree corrections', 'GEDCOM uploads up to 150 MB'],
  },
  personal: {
    name: 'Family Builder',
    features: ['Unlimited manual error review', 'GEDCOM uploads up to 500 MB', 'Printable tree and research worksheets'],
  },
  pro: {
    name: 'Pro / Researcher',
    features: ['Up to 10 separate family-tree workspaces', 'Surname and generation labels for each workspace', 'Safe automatic fixes', 'Full correction reports', 'Genealogy Pro Package'],
  },
  business: {
    name: 'Business / Genealogist',
    features: ['Unlimited separate client workspaces', 'Surname and generation labels for each workspace', 'GEDCOM uploads up to 2 GB', 'Client tree workflow'],
  },
};

function getTreeData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function renderWorkPlace(treeData = getTreeData()) {
  const tier = localStorage.getItem(SUBSCRIPTION_STORAGE_KEY) || 'free';
  const plan = PLAN_DETAILS[tier] || PLAN_DETAILS.free;
  const hasTree = Boolean(treeData?.people?.length);
  const workspaceReminder = tier === 'pro'
    ? `<section class="workplace-card">
         <h2>Keep your family trees easy to find</h2>
         <p>Your Pro / Researcher plan includes up to 10 separate family-tree workspaces. Label each one by surname or generation so you can keep related branches clearly organized. Business / Genealogist adds unlimited client workspaces.</p>
         <a class="btn-secondary" href="clients.html">Organize Your Family Trees</a>
       </section>`
    : tier === 'business'
      ? `<section class="workplace-card">
           <h2>Keep every client tree organized</h2>
           <p>Your Business / Genealogist plan includes unlimited separate client workspaces. Use surname and generation labels to keep each family branch easy to return to.</p>
           <a class="btn-secondary" href="clients.html">Organize Client Trees</a>
         </section>`
      : '';

  workPlace.innerHTML = `
    <section class="workplace-card">
      <h2>Wonderful choice - your ${plan.name} plan is ready!</h2>
      <p>You have a dedicated place to keep building, reviewing, and preserving your family story.</p>
      <h3>Included in your plan</h3>
      <ul class="guided-steps">${plan.features.map((feature) => `<li>${feature}</li>`).join('')}</ul>
    </section>
    <section class="workplace-card">
      <h2>Your next step</h2>
      ${hasTree
        ? `<p>Your working tree is ready. Open it to see corrections so far, or continue with guided error review.</p>
           <div class="workflow-actions">
             <a class="btn-add" href="tree.html">Open Your Family Tree</a>
             <a class="btn-secondary" href="errors.html">Continue Fixing Errors</a>
           </div>`
        : `<p>Start by uploading your GEDCOM file. After it is read, your tree and guided error review will be ready here.</p>
           <a class="btn-add" href="/?start=upload">Step 1: Upload Your GEDCOM</a>`}
    </section>
    ${workspaceReminder}
  `;
}

const storedTreeData = getTreeData();
if (storedTreeData?.people?.length) {
  renderWorkPlace(storedTreeData);
} else if (window.familyTreeClientStorage?.loadTreeFromDatabase) {
  workPlace.innerHTML = '<p class="empty-message">Opening your family-tree work place...</p>';
  window.familyTreeClientStorage.loadTreeFromDatabase(STORAGE_KEY)
    .then(renderWorkPlace)
    .catch(() => renderWorkPlace());
} else {
  renderWorkPlace();
}
