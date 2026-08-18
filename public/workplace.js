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
    features: ['Safe automatic fixes', 'Full correction reports', 'Genealogy Pro Package'],
  },
  business: {
    name: 'Business / Genealogist',
    features: ['Client tree workflow', 'GEDCOM uploads up to 2 GB', 'Separate browser-saved client trees'],
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
