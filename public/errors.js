const WORKSPACE_PREVIEW_MODE = new URLSearchParams(window.location.search).get('demo') === 'workspace';
const IS_ADMINISTRATION_REVIEW = isAdministrationReview();
const IS_ADMINISTRATION_WORKSPACE = isAdministrationReviewWorkspace();
const SHOW_WORKSPACE_PROGRESS = new URLSearchParams(window.location.search).get('view') === 'progress';
const TREE_STORAGE_KEY = WORKSPACE_PREVIEW_MODE
  ? 'familyTreeWorkspacePreviewData'
  : IS_ADMINISTRATION_WORKSPACE
    ? 'familyTreeAdministrationReviewData'
    : window.familyTreeClientStorage?.getActiveTreeKey() || 'familyTreeData';
const STORAGE_KEY = `${TREE_STORAGE_KEY}:fiveGenerationReview`;
if (IS_ADMINISTRATION_WORKSPACE) {
  window.familyTreeClientStorage?.seedAdministrationReviewTree?.(TREE_STORAGE_KEY);
}
const ERROR_REVIEW_HANDOFF_KEY = `${STORAGE_KEY}:errorReviewHandoff`;
const ERROR_PROGRESS_STORAGE_KEY = `${STORAGE_KEY}:errorProgress`;
const DUPLICATE_MERGE_UNDO_STORAGE_KEY = `${STORAGE_KEY}:duplicateMergeUndo`;
const SUBSCRIPTION_STORAGE_KEY = IS_ADMINISTRATION_WORKSPACE ? 'familyTreeAdministrationReviewTier' : 'familyTreeSubscriptionTier';
const PLAN_SELECTION_STORAGE_KEY = IS_ADMINISTRATION_WORKSPACE ? 'familyTreeAdministrationReviewPlanSelected' : 'familyTreePlanSelected';
const SUBSCRIPTION_STORE_URL = IS_ADMINISTRATION_WORKSPACE ? 'store.html?admin_review=true#subscriptions' : 'store.html#subscriptions';
const ERROR_BATCH_SIZE = 10;
// The free preview is five duplicate corrections and five other corrections.
// They are separate allowances so combining duplicates never uses up the
// chance to fix dates, places or relationships.
const BASIC_ERROR_REVIEW_LIMIT = 5;
const FREE_DUPLICATE_FIX_LIMIT = 5;

function getFreeDuplicatesUsed(progress) {
  const others = new Set(progress?.completedNonDuplicateIssueIds || []);
  return new Set([
    ...(progress?.completedDuplicateIssueIds || []),
    ...(progress?.completedIssueIds || []).filter((id) => !others.has(id)),
  ]).size;
}

function getFreeOtherUsed(progress) {
  return new Set(progress?.completedNonDuplicateIssueIds || []).size;
}

function getFreeDuplicatesLeft(progress) {
  return Math.max(FREE_DUPLICATE_FIX_LIMIT - getFreeDuplicatesUsed(progress), 0);
}

function getFreeOtherLeft(progress) {
  return Math.max(BASIC_ERROR_REVIEW_LIMIT - getFreeOtherUsed(progress), 0);
}

// The whole free preview is the five duplicates and five other errors the
// customer is actually allowed to fix. Every count on the page reads from this
// list, so nothing ever reports the size of the untouched tree.
function getFreePreviewErrors(visibleGenerationErrors) {
  const duplicates = visibleGenerationErrors.filter(isDuplicateIssue);
  const others = visibleGenerationErrors.filter((issue) => !isDuplicateIssue(issue));
  return [
    ...duplicates.slice(0, FREE_DUPLICATE_FIX_LIMIT),
    ...others.slice(0, BASIC_ERROR_REVIEW_LIMIT),
  ];
}
const ERROR_REVIEW_ORDER_VERSION = 12;
const VISIBLE_REVIEW_GENERATION_COUNT = 5;
const workspace = document.getElementById('errorWorkspace');
const workspaceWelcome = document.getElementById('workspaceWelcome');
const returnToTreeLink = document.getElementById('returnToTree');
const planErrorWorkspaceMessage = document.getElementById('planErrorWorkspaceMessage');
let loadedTreeData = null;
let inMemoryDuplicateMergeUndo = null;
let pendingDuplicateMerge = null;

function getTreeData() {
  if (loadedTreeData) return loadedTreeData;
  try {
    const normalize = (tree) => window.familyTreeClientStorage?.normalizeFamilyLinks?.(tree) || tree;
    const handoffTreeData = JSON.parse(sessionStorage.getItem(ERROR_REVIEW_HANDOFF_KEY) || 'null');
    if (handoffTreeData?.people?.length) return normalize(handoffTreeData);

    const reviewTreeData = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (reviewTreeData?.people?.length) return normalize(reviewTreeData);

    // Only the tree page writes the five-generation subset, so arriving here any
    // other way — "Continue to fix errors" from the upload page or the workplace,
    // a bookmark, a reopened tab — used to show an empty workspace. Fall back to
    // the full tree; the review is limited to the first five generations further
    // down regardless of which tree it started from.
    return normalize(JSON.parse(localStorage.getItem(TREE_STORAGE_KEY) || 'null'));
  } catch (error) {
    return null;
  }
}

function saveTreeData(treeData) {
  loadedTreeData = treeData;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(treeData));
    void window.familyTreeClientStorage?.removeTreeFromDatabase?.(STORAGE_KEY);
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    void window.familyTreeClientStorage?.saveTreeInDatabase?.(STORAGE_KEY, treeData);
  }
}

function saveDuplicateMergeUndo(treeData, progress, mergeSummary) {
  const undoState = { treeData, progress, mergeSummary };
  inMemoryDuplicateMergeUndo = undoState;
  try {
    localStorage.setItem(DUPLICATE_MERGE_UNDO_STORAGE_KEY, JSON.stringify(undoState));
  } catch (error) {
    const databaseSave = window.familyTreeClientStorage?.saveTreeInDatabase?.(DUPLICATE_MERGE_UNDO_STORAGE_KEY, undoState);
    if (databaseSave) {
      void databaseSave.catch((databaseError) => console.warn('Could not save duplicate-merge undo state:', databaseError));
    }
  }
}

function getDuplicateMergeUndo() {
  if (inMemoryDuplicateMergeUndo) return inMemoryDuplicateMergeUndo;
  try {
    return JSON.parse(localStorage.getItem(DUPLICATE_MERGE_UNDO_STORAGE_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function clearDuplicateMergeUndo() {
  inMemoryDuplicateMergeUndo = null;
  localStorage.removeItem(DUPLICATE_MERGE_UNDO_STORAGE_KEY);
  void window.familyTreeClientStorage?.removeTreeFromDatabase?.(DUPLICATE_MERGE_UNDO_STORAGE_KEY);
}

function getIssueId(issue) {
  return JSON.stringify([issue.category || '', issue.message || '', issue.subject || '']);
}

function createWorkspacePreviewTree() {
  const resolvedIssue = {
    category: 'Missing birth date',
    message: 'Elena Rivera does not have a birth date.',
    suggestion: 'Review the family register or census record and add the date when confirmed.',
    subject: '@I1@',
  };
  const pendingIssue = {
    category: 'Missing birthplace',
    message: 'Mateo Rivera does not have a birthplace.',
    suggestion: 'Check immigration, census, or church records before adding a birthplace.',
    subject: '@I2@',
  };
  const activeIssue = {
    category: 'Relationship detail',
    message: 'Sofia Rivera has a parent connection that needs review.',
    suggestion: 'Compare the family record in your working tree, then confirm or correct the parent connection.',
    subject: '@I3@',
  };
  const people = [
    { id: '@I1@', name: 'Elena Rivera' },
    { id: '@I2@', name: 'Mateo Rivera' },
    { id: '@I3@', name: 'Sofia Rivera' },
  ];
  const families = [{ id: '@F1@', husbandId: '@I2@', wifeId: '@I1@', childrenIds: ['@I3@'] }];
  let ancestorGeneration = ['@I2@', '@I1@'];
  let nextPersonNumber = 4;

  for (let generation = 3; generation <= 5; generation += 1) {
    const nextGeneration = [];
    for (const childId of ancestorGeneration) {
      const firstParentId = `@I${nextPersonNumber}@`;
      const secondParentId = `@I${nextPersonNumber + 1}@`;
      const ancestorNumber = nextPersonNumber - 3;
      people.push(
        { id: firstParentId, name: `Rivera ancestor ${generation}-${ancestorNumber}` },
        { id: secondParentId, name: `Rivera ancestor ${generation}-${ancestorNumber + 1}` },
      );
      families.push({
        id: `@F${families.length + 1}@`,
        husbandId: firstParentId,
        wifeId: secondParentId,
        childrenIds: [childId],
      });
      nextGeneration.push(firstParentId, secondParentId);
      nextPersonNumber += 2;
    }
    ancestorGeneration = nextGeneration;
  }

  return {
    people,
    primaryPersonId: '@I3@',
    families,
    relationships: [],
    validationReport: { errors: [resolvedIssue, pendingIssue, activeIssue], warnings: [], info: [] },
    errorProgress: {
      completedIssueIds: [getIssueId(resolvedIssue)],
      completedNonDuplicateIssueIds: [getIssueId(resolvedIssue)],
      completedDuplicateIssueIds: [],
      pendingIssueIds: [getIssueId(pendingIssue)],
      resolvedItems: [{
        issueId: getIssueId(resolvedIssue),
        category: resolvedIssue.category,
        message: resolvedIssue.message,
        subject: resolvedIssue.subject,
        correctionType: 'Manual review',
      }],
      activeGroupIds: [`record:${activeIssue.subject}`],
      batchMode: 'people',
      reviewOrderVersion: ERROR_REVIEW_ORDER_VERSION,
      duplicateReviewMode: '',
      reviewFocus: '',
      lastReviewedSubject: activeIssue.subject,
    },
  };
}

function addWorkspacePreviewGenerations(treeData) {
  const previewTree = createWorkspacePreviewTree();
  const existingPersonIds = new Set((treeData.people || []).map((person) => person.id));
  const existingFamilyIds = new Set((treeData.families || []).map((family) => family.id));
  const people = previewTree.people.filter((person) => !existingPersonIds.has(person.id));
  const families = previewTree.families.filter((family) => !existingFamilyIds.has(family.id));

  if (!people.length && !families.length) return treeData;

  return {
    ...treeData,
    people: [...(treeData.people || []), ...people],
    families: [...(treeData.families || []), ...families],
  };
}

function getProgress() {
  let progress;
  try {
    progress = JSON.parse(localStorage.getItem(ERROR_PROGRESS_STORAGE_KEY) || 'null');
  } catch (error) {
    progress = null;
  }

  const savedProgress = progress || getTreeData()?.errorProgress || {};
  return {
    completedIssueIds: Array.isArray(savedProgress.completedIssueIds) ? savedProgress.completedIssueIds : [],
    completedNonDuplicateIssueIds: Array.isArray(savedProgress.completedNonDuplicateIssueIds)
      ? savedProgress.completedNonDuplicateIssueIds
      : [],
    completedDuplicateIssueIds: Array.isArray(savedProgress.completedDuplicateIssueIds)
      ? savedProgress.completedDuplicateIssueIds
      : [],
    pendingIssueIds: Array.isArray(savedProgress.pendingIssueIds) ? savedProgress.pendingIssueIds : [],
    resolvedItems: Array.isArray(savedProgress.resolvedItems) ? savedProgress.resolvedItems : [],
    activeGroupIds: savedProgress.batchMode === 'people' && Array.isArray(savedProgress.activeGroupIds) ? savedProgress.activeGroupIds : [],
    activeGenerationKey: typeof savedProgress.activeGenerationKey === 'string' ? savedProgress.activeGenerationKey : '',
    batchMode: 'people',
    reviewOrderVersion: Number(savedProgress.reviewOrderVersion) || 0,
    duplicateReviewMode: ['single', 'batch'].includes(savedProgress.duplicateReviewMode) ? savedProgress.duplicateReviewMode : '',
    reviewFocus: ['duplicates', 'other'].includes(savedProgress.reviewFocus) ? savedProgress.reviewFocus : '',
    lastReviewedSubject: typeof savedProgress.lastReviewedSubject === 'string' ? savedProgress.lastReviewedSubject : '',
  };
}

function saveProgress(progress) {
  try {
    localStorage.setItem(ERROR_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch (error) {
    const treeData = getTreeData();
    if (!treeData) throw error;
    treeData.errorProgress = progress;
    saveTreeData(treeData);
  }
}

function resolveTreeFocusSubject(subject) {
  if (!subject) return '';
  const treeData = getTreeData();
  if ((treeData?.people || []).some((person) => person.id === subject)) return subject;
  const family = (treeData?.families || []).find((candidate) => candidate.id === subject);
  if (!family) return subject;
  return family.husbandId || family.wifeId || (family.childrenIds || [])[0] || subject;
}

function updateReturnToTreeLink(progress = getProgress()) {
  if (!returnToTreeLink) return;
  const parameters = new URLSearchParams();
  if (WORKSPACE_PREVIEW_MODE) parameters.set('demo', 'workspace');
  if (IS_ADMINISTRATION_REVIEW) parameters.set('admin_review', 'true');
  const focusSubject = resolveTreeFocusSubject(progress.lastReviewedSubject);
  if (focusSubject) parameters.set('focus', focusSubject);
  returnToTreeLink.href = parameters.size ? `tree.html?${parameters}` : 'tree.html';
}

function updateWorkspaceTreeLinks(progress = getProgress()) {
  const parameters = new URLSearchParams();
  if (WORKSPACE_PREVIEW_MODE) parameters.set('demo', 'workspace');
  if (IS_ADMINISTRATION_REVIEW) parameters.set('admin_review', 'true');
  const treeUrl = parameters.size ? `tree.html?${parameters}` : 'tree.html';
  document.querySelectorAll('[data-workspace-tree-preview]').forEach((link) => {
    link.href = treeUrl;
  });
}

function rememberLastReviewedSubject(subject) {
  if (!subject) return;
  const progress = getProgress();
  if (progress.lastReviewedSubject === subject) return;
  progress.lastReviewedSubject = subject;
  saveProgress(progress);
  updateReturnToTreeLink(progress);
}

function getResolvedIssueIds(progress) {
  return new Set([...progress.completedIssueIds, ...progress.pendingIssueIds]);
}

function recordResolvedItem(progress, issue, correctionType) {
  const issueId = getIssueId(issue);
  if (progress.resolvedItems.some((item) => item.issueId === issueId)) return;
  progress.resolvedItems.push({
    issueId,
    category: issue.category || 'Family tree correction',
    message: issue.message || 'Corrected family-tree item.',
    subject: issue.subject || 'General validation',
    correctionType,
  });
}

function getRecordResearchLinks(issue, person) {
  const personName = person?.name || issue.subject || 'family history';
  const searchTerms = [personName, person?.birthPlace, person?.birthDate, 'genealogy'].filter(Boolean).join(' ');
  return {
    familySearch: `https://www.familysearch.org/search/record/results?count=20&q.any=${encodeURIComponent(searchTerms)}`,
    ancestry: `https://www.ancestry.com/search/?name=${encodeURIComponent(personName)}`,
    census: 'https://www.archives.gov/research/census',
    vital: 'https://www.familysearch.org/en/wiki/United_States_Vital_Records',
    church: 'https://www.familysearch.org/en/wiki/Church_records',
    immigration: 'https://www.archives.gov/research/immigration',
    archive: `https://archive.org/search?query=${encodeURIComponent(searchTerms)}`,
  };
}

function getResearchSubject(issue, peopleById, familiesById) {
  const person = peopleById?.get(issue.subject);
  if (person) return person;

  const family = familiesById?.get(issue.subject);
  if (!family) return undefined;

  const parentNames = [family.husbandId, family.wifeId]
    .map((parentId) => peopleById?.get(parentId)?.name?.trim())
    .filter(Boolean);
  if (!parentNames.length) return undefined;
  return { name: parentNames.join(' and ') };
}

function renderRecordReviewOptions(issue, person) {
  const resourceKey = encodeURIComponent(getIssueId(issue));
  const personName = escapeHtml(person?.name || issue.subject || 'this person');
  const links = getRecordResearchLinks(issue, person);
  return `
    <section class="record-review-options">
      <p><strong>How would you like to review records for ${personName}?</strong></p>
      <button type="button" class="btn-secondary" data-open-record-sources="${resourceKey}">Choose a Record Source</button>
      <div class="record-source-options" data-record-source-options="${resourceKey}" hidden>
        <a class="btn-secondary" href="${links.familySearch}" target="_blank" rel="noopener">Search FamilySearch</a>
        <a class="btn-secondary" href="${links.ancestry}" target="_blank" rel="noopener">Search Ancestry</a>
        <a class="btn-secondary" href="${links.census}" target="_blank" rel="noopener">Census Records</a>
        <a class="btn-secondary" href="${links.vital}" target="_blank" rel="noopener">Vital Records</a>
        <a class="btn-secondary" href="${links.church}" target="_blank" rel="noopener">Church Records</a>
        <a class="btn-secondary" href="${links.immigration}" target="_blank" rel="noopener">Immigration Records</a>
        <a class="btn-secondary" href="${links.archive}" target="_blank" rel="noopener">Internet Archive</a>
      </div>
    </section>
  `;
}

function getCurrentTier() {
  if (WORKSPACE_PREVIEW_MODE) return 'pro';
  return localStorage.getItem(SUBSCRIPTION_STORAGE_KEY) || 'free';
}

function updatePlanErrorWorkspaceMessage() {
  if (!planErrorWorkspaceMessage) return;
  const messages = {
    free: 'Your first five manual fixes are included at no charge. Upgrade when you are ready to correct the rest or use safe automatic fixes.',
    personal: 'Your Family Builder plan includes unlimited manual error review and correction. Continue at your own pace, one clear step at a time.',
    pro: 'Your Pro / Researcher plan includes unlimited review, safe automatic fixes, and up to 10 separately organized family-tree workspaces.',
    business: 'Your Business / Genealogist plan includes client-focused review tools and unlimited separately organized family-tree workspaces.',
  };
  planErrorWorkspaceMessage.textContent = messages[getCurrentTier()] || messages.free;
}

function isDuplicateIssue(issue) {
  return issue.autoFix?.type === 'mergeDuplicatePeople';
}

function canUseUnlimitedErrorFixes() {
  return ['personal', 'pro', 'business'].includes(getCurrentTier());
}

function canUseSafeAutomaticFixes() {
  return getCurrentTier() !== 'free';
}

function getCompletedNonDuplicateIssueCount(errors, progress) {
  const completedNonDuplicateIds = new Set(progress.completedNonDuplicateIssueIds);
  const completed = new Set(progress.completedIssueIds);
  errors
    .filter((issue) => !isDuplicateIssue(issue) && completed.has(getIssueId(issue)))
    .forEach((issue) => completedNonDuplicateIds.add(getIssueId(issue)));
  return completedNonDuplicateIds.size;
}

function renderBasicPlanOptions(errors, progress) {
  if (getCurrentTier() !== 'free') return '';

  const duplicatesLeft = getFreeDuplicatesLeft(progress);
  const othersLeft = getFreeOtherLeft(progress);
  // Finishing the preview is a moment worth marking: say what was achieved and
  // exactly what a plan adds.
  if (!duplicatesLeft && !othersLeft) {
    return `
      <section class="assistance-options free-trial-complete">
        <h2>You finished all ${FREE_DUPLICATE_FIX_LIMIT + BASIC_ERROR_REVIEW_LIMIT} free corrections</h2>
        <p>That is real progress on your family history. Choose a plan to keep going through the rest of your tree, and your finished work stays exactly where it is.</p>
        <ul class="free-trial-perks">
          <li>Unlimited error corrections, duplicates included</li>
          <li>GEDCOM uploads up to 500 MB</li>
          <li>Printable family tree and chart exports</li>
          <li>Research worksheets and Ancestor Discovery prompts</li>
          <li>Safe automatic fixes and a full correction report on Pro / Researcher</li>
        </ul>
        <a class="btn-add assistance-upgrade-link" href="${SUBSCRIPTION_STORE_URL}">Choose a plan and keep correcting</a>
      </section>
    `;
  }

  const freeReviewMessage = `Your free preview covers ${FREE_DUPLICATE_FIX_LIMIT} duplicate corrections and ${BASIC_ERROR_REVIEW_LIMIT} other corrections. ${duplicatesLeft} duplicate${duplicatesLeft === 1 ? '' : 's'} and ${othersLeft} other error${othersLeft === 1 ? '' : 's'} left.`;

  return `
    <section class="assistance-options free-trial-remaining">
      <p>${freeReviewMessage} <a class="assistance-upgrade-link" href="${SUBSCRIPTION_STORE_URL}">Choose a plan</a> when you want to correct the rest.</p>
    </section>
  `;
}

function renderProgressEncouragement(errors, progress) {
  const completed = new Set(progress.completedIssueIds);
  const total = errors.length;
  const solved = errors.filter((issue) => completed.has(getIssueId(issue))).length;
  const tier = getCurrentTier();
  let message = 'You have chosen to care for your family story, and every corrected record helps preserve names, connections, and memories for the people who come after you.';

  if (!total) {
    message = 'What a meaningful beginning. Your current report is clear, and this chart can become a lasting record of the care you have given your family history.';
  } else if (!solved) {
    message = 'You have taken a wonderful first step by reviewing your family tree. Choose one issue, follow the recommendation, and watch your family story become clearer with every discovery.';
  } else if (solved === total) {
    message = 'Wonderful work - this report is complete. You have honored your family story by making it clearer and easier to share with relatives and future generations.';
  } else if (solved >= Math.ceil(total / 2)) {
    message = 'You are more than halfway through this report. Keep going - every detail you clarify brings your family’s journey into sharper focus for the people who will treasure it.';
  } else {
    message = `Wonderful progress - you have solved ${solved} issue${solved === 1 ? '' : 's'} so far. Each one is a meaningful step toward a family tree you can share with pride.`;
  }

  const tierMessage = tier === 'personal'
    ? ' Family Builder gives you room to keep reviewing and organizing without a fix limit.'
    : tier === 'free'
      ? ' Your first five manual fixes are included at no charge. Upgrade to Family Builder to fix the rest, or choose Pro / Researcher for safe automatic fixes.'
      : ' Your plan includes safe automatic fixes alongside the manual review tools.';

  return `
    <aside class="progress-encouragement" aria-live="polite">
      <strong>You are preserving something meaningful</strong>
      <p>${message}${tierMessage}</p>
    </aside>
  `;
}

function renderUpdatedTreeOffer() {
  return `
    <section class="updated-tree-offer">
      <h2>Your updated tree is ready to celebrate</h2>
      <p>Your completed work is ready for a fresh family-tree edition, a printed copy, or a personalized keepsake.</p>
      <a class="btn-add" href="index.html#treePresentation">Personalize and print your updated tree</a>
      <a class="btn-secondary" href="store.html#customKeepsakes">Explore Personalized Tree Keepsakes</a>
    </section>
  `;
}

function renderDuplicateMergeReview() {
  const undoState = getDuplicateMergeUndo();
  if (!undoState?.mergeSummary) return '';

  return `
    <section class="duplicate-merge-review merge-confirmation">
      <p><strong>Merged:</strong> ${escapeHtml(undoState.mergeSummary.survivorName)} now includes ${escapeHtml(undoState.mergeSummary.duplicateNames.join(', '))}.
      <button id="undoDuplicateMerge" type="button" class="btn-link">Undo</button></p>
    </section>
  `;
}

function renderReviewFocusChoice(duplicateCount, otherCount) {
  return `
    <section id="activeReview" class="batch-complete">
      <h2>What would you like to work on?</h2>
      <div class="review-focus-choice">
        <button type="button" class="btn-add" data-review-focus="duplicates">Merge Duplicate Records (${duplicateCount})</button>
        <button type="button" class="btn-secondary" data-review-focus="other">Fix Other Errors (${otherCount})</button>
      </div>
    </section>
  `;
}

function renderReviewFocusSwitch(focus, duplicateCount, otherCount) {
  if (!focus) return '';
  const working = focus === 'duplicates'
    ? `Working on duplicate records${duplicateCount ? ` · ${duplicateCount} left` : ''}`
    : `Working on other errors${otherCount ? ` · ${otherCount} left` : ''}`;
  const other = focus === 'duplicates'
    ? `<button type="button" class="btn-link" data-review-focus="other">Switch to other errors (${otherCount})</button>`
    : `<button type="button" class="btn-link" data-review-focus="duplicates">Switch to duplicate records (${duplicateCount})</button>`;
  return `<p class="review-focus-switch">${escapeHtml(working)} · ${other}</p>`;
}

function renderDuplicateReviewChoice(duplicateIssues) {
  return `
    <section class="duplicate-merge-review">
      <h2>How would you like to review possible duplicates?</h2>
      <p>We found ${duplicateIssues.length} possible duplicate record${duplicateIssues.length === 1 ? '' : 's'} in this review. You will always confirm each merge separately before anything changes.</p>
      <button type="button" class="btn-add" data-duplicate-review-mode="single">Review One Duplicate Group at a Time</button>
      <button type="button" class="btn-secondary" data-duplicate-review-mode="batch">Review All Duplicate Groups in This Batch</button>
    </section>
  `;
}

function renderPendingDuplicateMergeReview(treeData) {
  if (!pendingDuplicateMerge) return '';

  const survivor = treeData?.people?.find((person) => person.id === pendingDuplicateMerge.survivorId);
  const duplicates = treeData?.people?.filter((person) => pendingDuplicateMerge.duplicateIds.includes(person.id)) || [];
  if (!survivor || !duplicates.length) {
    // Silently returning nothing here made the merge button look dead. Say what
    // happened instead, and offer the one action that repairs it.
    pendingDuplicateMerge = null;
    return `
      <section class="duplicate-merge-review">
        <h2>These duplicate records are not in your working tree</h2>
        <p>The matching records sit outside the five generations you are reviewing, so they cannot be compared here yet. Open your Working Tree Preview again to rebuild the review with every record this duplicate refers to, then return and combine them.</p>
        <a class="btn-add" href="${escapeHtml(returnToTreeLink?.href || 'tree.html')}">Rebuild Your Five-Generation Working Tree</a>
      </section>
    `;
  }

  const personDetails = (person) => [
    person.birthDate && `Born: ${person.birthDate}`,
    person.birthPlace && `Place: ${person.birthPlace}`,
    person.deathDate && `Died: ${person.deathDate}`,
  ].filter(Boolean).join(' · ') || 'No additional details recorded';

  return `
    <section class="duplicate-merge-review">
      <h2>Review possible duplicate records</h2>
      <p>Compare these records before combining them. Nothing has been changed yet.</p>
      <article class="tree-review-person selected-tree-person">
        <h3>Keep this record</h3>
        <strong>${escapeHtml(survivor.name || survivor.id)}</strong>
        <p>${escapeHtml(personDetails(survivor))}</p>
      </article>
      <h3>Records to combine into it</h3>
      <ul class="person-error-list">
        ${duplicates.map((person) => `<li><strong>${escapeHtml(person.name || person.id)}</strong><p>${escapeHtml(personDetails(person))}</p></li>`).join('')}
      </ul>
      <p>When you confirm, the selected details are combined into the record you chose to keep. You can still undo the merge immediately afterward.</p>
      <button id="confirmDuplicateMerge" type="button" class="btn-add">Confirm and Merge These Records</button>
      <button id="cancelDuplicateMerge" type="button" class="btn-secondary">Return Without Merging</button>
    </section>
  `;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

const RECORD_ID_PATTERN = /@[^@\s]+@/g;

let readerLookupPeople = new Map();
let readerLookupFamilies = new Map();

function setReaderLookups(peopleById, familiesById) {
  readerLookupPeople = peopleById || new Map();
  readerLookupFamilies = familiesById || new Map();
}

// Record ids come from the GEDCOM file and mean nothing to the person reading the
// screen, so every message is shown with names in their place.
function toReaderFriendlyText(text, peopleById = readerLookupPeople, familiesById = readerLookupFamilies) {
  if (!text) return '';
  return String(text)
    .replace(/missing (child|spouse)-family @[^@\s]+@/g, (match, kind) => (
      kind === 'child' ? 'a parent family that is missing from the file' : 'a spouse family that is missing from the file'
    ))
    .replace(new RegExp(`\\s*\\(${RECORD_ID_PATTERN.source}\\)`, 'g'), '')
    .replace(RECORD_ID_PATTERN, (id) => {
      const personName = peopleById?.get(id)?.name?.trim();
      if (personName) return personName;

      const family = familiesById?.get(id);
      if (family) {
        const parentNames = [family.husbandId, family.wifeId]
          .map((parentId) => peopleById?.get(parentId)?.name?.trim())
          .filter(Boolean);
        if (parentNames.length) return `the family of ${parentNames.join(' and ')}`;
        return 'a family record';
      }

      return 'a record that is no longer in the file';
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// A duplicate is judged by looking at the records next to each other, so the card
// shows the comparison itself instead of a sentence describing it.
function renderDuplicateComparison(issue, peopleById, familiesById) {
  const fix = issue?.autoFix;
  if (!fix || fix.type !== 'mergeDuplicatePeople') return '';

  const ids = [fix.survivorId, ...(fix.duplicateIds || [])];
  const records = ids.map((id) => ({ id, person: peopleById?.get(id) }));
  const present = records.filter((record) => record.person);
  if (!present.length) return '';

  const parentsOf = (person) => {
    const names = (person.familyAsChild || [])
      .map((familyId) => familiesById?.get(familyId))
      .filter(Boolean)
      .flatMap((family) => [family.husbandId, family.wifeId])
      .map((parentId) => peopleById?.get(parentId)?.name?.trim())
      .filter(Boolean);
    return names.join(' and ');
  };

  const rows = [
    ['Name', (person) => person.name],
    ['Born', (person) => person.birthDate],
    ['Birthplace', (person) => person.birthPlace],
    ['Died', (person) => person.deathDate],
    ['Death place', (person) => person.deathPlace],
    ['Parents', parentsOf],
  ];

  const missing = records.length - present.length;

  return `
    <div class="duplicate-comparison">
      <table>
        <thead>
          <tr>
            <th scope="col">Record</th>
            ${present.map((record, index) => `<th scope="col">${index === 0 ? 'Record to keep' : `Record ${index + 1}`}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(([label, read]) => `
            <tr>
              <th scope="row">${escapeHtml(label)}</th>
              ${present.map(({ person }) => `<td>${escapeHtml((read(person) || '').toString().trim() || 'Not recorded')}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${missing ? `<p class="fix-suggestion">${missing} matching record${missing === 1 ? ' is' : 's are'} not in your working tree yet. Rebuild your five-generation working tree to compare ${missing === 1 ? 'it' : 'them'} here.</p>` : ''}
    </div>
  `;
}


// Places are shown with everything recorded, and a place with no country named
// is marked so a bare town is not read as a full location.
function formatReviewPlace(place) {
  const parts = String(place || '').split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return `${parts[0]} (country not recorded)`;
  return parts.join(', ');
}

function cleanPersonName(person) {
  return String(person?.name || '').replace(/\//g, '').trim();
}

// Everything shown here is read back from the uploaded GEDCOM and the working
// tree. Nothing is suggested that the file does not already hold.
function getManualFixSteps(issue, person, peopleById, familiesById) {
  const family = familiesById?.get(issue?.subject);
  const familyName = !person && family
    ? [family.husbandId, family.wifeId].map((id) => cleanPersonName(peopleById?.get(id))).filter(Boolean).join(' and ')
    : '';
  const who = cleanPersonName(person) || (familyName ? `the family of ${familyName}` : 'this record');
  const message = String(issue?.message || '');
  const lower = message.toLowerCase();
  const steps = [];
  const field = (label, value) => `Your file records ${label} for ${who} as ${String(value || '').trim() ? String(value).trim() : 'nothing at all'}.`;

  if (person) {
    if (lower.includes('birth') && lower.includes('place')) {
      steps.push(field('the birthplace', formatReviewPlace(person.birthPlace)));
      steps.push(`Correct the birthplace on ${who} so it matches the record this person was entered from.`);
    } else if (lower.includes('birth')) {
      steps.push(field('the birth date', person.birthDate));
      steps.push(`Correct the birth date on ${who} so it matches the record this person was entered from.`);
    } else if (lower.includes('death') && lower.includes('place')) {
      steps.push(field('the death place', formatReviewPlace(person.deathPlace)));
      steps.push(`Correct the death place on ${who} so it matches the record this person was entered from.`);
    } else if (lower.includes('death') || lower.includes('buri')) {
      steps.push(field('the death date', person.deathDate));
      steps.push(`Correct the death date on ${who} so it matches the record this person was entered from.`);
    } else if (lower.includes('place')) {
      steps.push(field('the birthplace', formatReviewPlace(person.birthPlace)));
      steps.push(field('the death place', formatReviewPlace(person.deathPlace)));
      steps.push(`Correct the place named above on ${who}.`);
    } else if (lower.includes('name')) {
      steps.push(field('the name', cleanPersonName(person)));
      steps.push(`Correct the name on ${who} so it matches the record this person was entered from.`);
    } else {
      steps.push(field('the birth date', person.birthDate));
      steps.push(field('the death date', person.deathDate));
      steps.push(`Correct whichever entry above is wrong on ${who}.`);
    }
  }

  // Anyone else the check named is shown with their own recorded entries, so the
  // customer compares real records in their tree rather than guesses.
  const relatedIds = Array.from(new Set(String(message).match(/@[^@\s]+@/g) || []))
    .filter((id) => id !== issue?.subject);
  for (const id of relatedIds) {
    const other = peopleById?.get(id);
    if (!other) continue;
    const otherName = cleanPersonName(other);
    if (!otherName) continue;
    const born = String(other.birthDate || '').trim();
    const died = String(other.deathDate || '').trim();
    steps.push(`Your file records ${otherName} as born ${born || 'on no recorded date'} and died ${died || 'on no recorded date'}. Compare that entry with ${who}.`);
  }

  if (!person && family) {
    const spouses = [family.husbandId, family.wifeId]
      .map((id) => cleanPersonName(peopleById?.get(id)))
      .filter(Boolean);
    const children = (family.childrenIds || [])
      .map((id) => cleanPersonName(peopleById?.get(id)))
      .filter(Boolean);
    steps.push(`Your file records this family as ${spouses.join(' and ') || 'no parents named'}.`);
    steps.push(`Children recorded in this family: ${children.join(', ') || 'none'}.`);
    steps.push('Correct the family entry above so each person sits in the family the record puts them in.');
  }

  steps.push('Come back here and choose Mark solved, or Save for Later and Continue.');
  return steps;
}

// The manual review opens with the person the error belongs to, written out in
// names and full places, followed by plain steps for putting it right.
function renderManualReviewGuide(issue, peopleById, familiesById) {
  const person = peopleById?.get(issue?.subject);
  const name = person ? String(person.name || '').replace(/\//g, '').trim() : '';
  const family = !person ? familiesById?.get(issue?.subject) : null;
  const familyName = family
    ? [family.husbandId, family.wifeId]
        .map((id) => String(peopleById?.get(id)?.name || '').replace(/\//g, '').trim())
        .filter(Boolean)
        .join(' and ')
    : '';
  const heading = name || familyName || 'This record';

  const parents = person
    ? (person.familyAsChild || [])
        .map((familyId) => familiesById?.get(familyId))
        .filter(Boolean)
        .flatMap((record) => [record.husbandId, record.wifeId])
        .map((parentId) => String(peopleById?.get(parentId)?.name || '').replace(/\//g, '').trim())
        .filter(Boolean)
        .join(' and ')
    : '';

  const rows = person
    ? [
      ['Name', name],
      ['Born', person.birthDate],
      ['Birthplace', formatReviewPlace(person.birthPlace)],
      ['Died', person.deathDate],
      ['Death place', formatReviewPlace(person.deathPlace)],
      ['Parents', parents],
    ]
    : [['Family', familyName]];

  const steps = getManualFixSteps(issue, person, peopleById, familiesById);

  return `
    <div class="manual-review-note" hidden>
      <h4>${escapeHtml(heading)}</h4>
      <table class="manual-review-record">
        <tbody>
          ${rows.map(([label, value]) => `<tr>
            <th scope="row">${escapeHtml(label)}</th>
            <td>${escapeHtml(String(value || '').trim() || 'Not recorded')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p class="manual-review-problem"><strong>What is wrong:</strong> ${escapeHtml(toReaderFriendlyText(issue?.message || ''))}</p>
      <p class="manual-review-heading"><strong>How to fix it</strong></p>
      <ol class="manual-review-steps">
        ${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}
      </ol>
    </div>
  `;
}

function renderPendingResearch(errors, progress) {  const pendingIssues = errors.filter((issue) => progress.pendingIssueIds.includes(getIssueId(issue)));
  if (!pendingIssues.length) return '';

  return `
    <section id="researchShelf" class="pending-research">
      <h2>Fix Later (Pending)</h2>
      <p>${pendingIssues.length} item${pendingIssues.length === 1 ? '' : 's'} will not block your progress. Return whenever you have more records or information.</p>
      <ul>
        ${pendingIssues.map((issue) => `
          <li>
            <strong>${escapeHtml(issue.category)}:</strong> ${escapeHtml(toReaderFriendlyText(issue.message))}
            <button type="button" class="btn-secondary" data-resume-pending-issue="${encodeURIComponent(getIssueId(issue))}">Return to active review</button>
          </li>
        `).join('')}
      </ul>
    </section>
  `;
}

function renderProgressTools(progress, errors = []) {
  const correctedItems = progress.resolvedItems || [];
  const completed = new Set(progress.completedIssueIds);
  const pending = new Set(progress.pendingIssueIds);
  const unresolvedIssues = errors.filter((issue) => !completed.has(getIssueId(issue)) && !pending.has(getIssueId(issue)));
  const nextStep = pending.size
    ? 'Continue with the open items below, then return to Fix Later when you have more records or research.'
    : unresolvedIssues.length
      ? 'Continue with the open items below. Each suggested fix explains the next action to take.'
      : 'Your current review is complete. Open your family tree to see the corrections so far.';
  return `
    <section class="progress-tools">
      <h2>Choose how to review your progress</h2>
      <p>Use a printable chart for handwritten research notes, or open a computer report for a clear summary and your next step.</p>
      <div class="issue-fix-actions">
        <button id="printProgressChart" type="button" class="btn-secondary">Print a Chart for Manual Review</button>
        <button id="openProgressReport" type="button" class="btn-secondary">Open Your Computer Progress Report</button>
      </div>
      <section id="computerProgressReport" class="corrected-items-preview" hidden>
        <h3>Your computer progress report</h3>
        <p><strong>${completed.size}</strong> solved · <strong>${pending.size}</strong> saved for later · <strong>${unresolvedIssues.length}</strong> open</p>
        <p><strong>Your next step:</strong> ${escapeHtml(nextStep)}</p>
        ${unresolvedIssues.length
          ? `<h4>Next items to review</h4><ul>${unresolvedIssues.slice(0, 3).map((issue) => `<li><strong>${escapeHtml(toReaderFriendlyText(issue.subject || issue.category))}:</strong> ${escapeHtml(toReaderFriendlyText(issue.suggestion || issue.message))}</li>`).join('')}</ul>`
          : ''}
      </section>
      <div class="corrected-items-preview">
        <h3>Corrected items preview</h3>
        ${correctedItems.length
          ? `<ul>${correctedItems.map((item) => `<li><strong>${escapeHtml(item.category)}:</strong> ${escapeHtml(toReaderFriendlyText(item.message))} <span>${escapeHtml(item.correctionType)}</span></li>`).join('')}</ul>`
          : '<p class="muted">Corrected items will appear here as you work through the review.</p>'}
      </div>
    </section>
  `;
}

function renderWorkspaceDesk(errors, progress) {
  const completed = new Set(progress.completedIssueIds);
  const pending = new Set(progress.pendingIssueIds);
  const openCount = errors.filter((issue) => !completed.has(getIssueId(issue)) && !pending.has(getIssueId(issue))).length;
  const savedWorkMessage = progress.resolvedItems?.length || pending.size
    ? 'Your corrections, saved-for-later research, and review progress are kept with this family tree in this browser so you can return here and continue.'
    : 'This is your saved review desk. As you solve items or save research for later, your progress will remain here with this family tree in this browser.';
  const workingTreeParameters = new URLSearchParams();
  if (WORKSPACE_PREVIEW_MODE) workingTreeParameters.set('demo', 'workspace');
  const workingTreeUrl = workingTreeParameters.size ? `tree.html?${workingTreeParameters}` : 'tree.html';

  return `
    <section class="review-desk">
      ${WORKSPACE_PREVIEW_MODE ? '<p class="workspace-preview-notice"><strong>Preview workspace:</strong> This sample family tree is only for trying the review desk. Your customer tree is unchanged.</p>' : ''}
      <div class="review-desk-heading">
        <div>
          <p class="eyebrow">Your saved review desk</p>
          <h2>Your family-tree work is ready when you are</h2>
          <p>${savedWorkMessage}</p>
        </div>
        <a class="btn-secondary" href="${workingTreeUrl}">Open Working Tree Preview</a>
      </div>
      <div class="review-desk-metrics" aria-label="Current review progress">
        <article><strong>${completed.size}</strong><span>Solved</span></article>
        <article><strong>${pending.size}</strong><span>Saved for later</span></article>
        <article><strong>${openCount}</strong><span>Open to review</span></article>
      </div>
      <div class="review-desk-links">
        <a href="#activeReview">Continue active review</a>
        <a href="#researchShelf">Open research shelf</a>
        <a href="#progressReports">View charts and reports</a>
      </div>
      <div id="progressReports">
        ${renderProgressTools(progress, errors)}
      </div>
    </section>
  `;
}

function printProgressChart(groups, completed, fixedOnly = false, pending = new Set()) {
  const rows = groups.flatMap((group) => group.issues
    .filter((issue) => !fixedOnly || completed.has(getIssueId(issue)))
    .map((issue) => {
      const status = completed.has(getIssueId(issue))
        ? 'Solved'
        : pending.has(getIssueId(issue))
          ? 'Fix Later (Pending)'
          : 'Open';
      return `
        <tr>
          <td>${escapeHtml(group.label)}</td>
          <td>${escapeHtml(issue.category)}: ${escapeHtml(toReaderFriendlyText(issue.message))}</td>
          <td>${escapeHtml(issue.suggestion || 'Review this record.')}</td>
          <td><div class="note-lines"></div><span>${status}</span></td>
        </tr>
      `;
    })).join('');
  const printWindow = window.open('', 'error-progress-chart');

  if (!printWindow) {
    alert('Allow pop-ups for this site to print the progress chart.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Error Progress Chart</title>
      <style>
        body { color: #111827; font-family: Arial, sans-serif; margin: 0.5in; }
        h1 { font-size: 18pt; margin: 0 0 8px; }
        p { margin: 0 0 18px; }
        table { border-collapse: collapse; font-size: 9pt; width: 100%; }
        th, td { border: 1px solid #374151; padding: 8px; text-align: left; vertical-align: top; }
        th { background: #e5e7eb; }
        td:first-child { width: 13%; }
        td:nth-child(2) { width: 31%; }
        td:nth-child(3) { width: 28%; }
        td:last-child { width: 28%; }
        .note-lines { border-bottom: 1px solid #9ca3af; height: 48px; margin-bottom: 6px; }
        @media print { @page { margin: 0.4in; size: landscape; } }
      </style>
    </head>
    <body>
      <h1>${fixedOnly ? 'Family Tree Fixed Errors Chart' : 'Family Tree Error Progress Chart'}</h1>
      <p>${fixedOnly ? 'Errors fixed so far' : `Current people batch: ${groups.length} record${groups.length === 1 ? '' : 's'}`}</p>
      <table>
        <thead><tr><th>Person or Record</th><th>Issue</th><th>Recommended Fix</th><th>Progress Notes</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">No errors have been marked solved yet.</td></tr>'}</tbody>
      </table>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function getIssueGroupId(issue) {
  return issue.subject ? `record:${issue.subject}` : `issue:${getIssueId(issue)}`;
}

function mergeDuplicatePeople(treeData, fix) {
  const survivor = treeData.people.find((person) => person.id === fix.survivorId);
  const duplicateIds = new Set(fix.duplicateIds);
  const duplicates = treeData.people.filter((person) => duplicateIds.has(person.id));

  if (!survivor || !duplicates.length) {
    throw new Error('The duplicate records are no longer available to merge.');
  }

  for (const duplicate of duplicates) {
    for (const field of ['sex', 'birthDate', 'birthPlace', 'deathDate', 'deathPlace']) {
      if (!survivor[field] && duplicate[field]) survivor[field] = duplicate[field];
    }

    survivor.notes = [...new Set([...(survivor.notes || []), ...(duplicate.notes || [])])];
    survivor.familyAsChild = [...new Set([...(survivor.familyAsChild || []), ...(duplicate.familyAsChild || [])])];
    survivor.familyAsSpouse = [...new Set([...(survivor.familyAsSpouse || []), ...(duplicate.familyAsSpouse || [])])];
  }

  for (const family of treeData.families || []) {
    if (duplicateIds.has(family.husbandId)) family.husbandId = survivor.id;
    if (duplicateIds.has(family.wifeId)) family.wifeId = survivor.id;
    family.childrenIds = [...new Set((family.childrenIds || []).map((id) => (
      duplicateIds.has(id) ? survivor.id : id
    )))];

    if (family.husbandId === family.wifeId) family.wifeId = null;
  }

  treeData.relationships = Array.from(new Map((treeData.relationships || []).map((relationship) => {
    const normalized = {
      ...relationship,
      personId: duplicateIds.has(relationship.personId) ? survivor.id : relationship.personId,
      relatedPersonId: duplicateIds.has(relationship.relatedPersonId) ? survivor.id : relationship.relatedPersonId,
    };
    return [`${normalized.type}|${normalized.personId}|${normalized.relatedPersonId}|${normalized.familyId || ''}`, normalized];
  })).values());
  treeData.people = treeData.people.filter((person) => !duplicateIds.has(person.id));
}

function removeStaleIssuesAfterDuplicateMerge(report, duplicateIds) {
  const removedIds = [...duplicateIds];
  // Matching on the message text alone left the merged duplicate in the report
  // whenever the wording did not happen to contain the record id, so the same
  // group was offered again and again. What the fix points at is what counts.
  const referencesRemovedPerson = (issue) => (
    removedIds.includes(issue.subject)
    || removedIds.some((id) => (issue.message || '').includes(id))
    || removedIds.includes(issue.autoFix?.personId)
    || (issue.autoFix?.duplicateIds || []).some((id) => removedIds.includes(id))
  );

  for (const category of ['errors', 'warnings', 'info']) {
    report[category] = (report[category] || []).filter((issue) => !referencesRemovedPerson(issue));
  }
}

function getIssueGroupLabel(subject, peopleById, familiesById) {
  if (!subject) return 'General validation';
  const name = peopleById?.get(subject)?.name?.trim();
  if (name) return name;

  const family = familiesById?.get(subject);
  if (family) {
    const parentNames = [family.husbandId, family.wifeId]
      .map((parentId) => peopleById?.get(parentId)?.name?.trim())
      .filter(Boolean);
    if (parentNames.length) return `Family of ${parentNames.join(' and ')}`;
    return 'Family record';
  }

  return toReaderFriendlyText(subject, peopleById, familiesById) || 'General validation';
}

function hasReviewName(issue, peopleById, familiesById) {
  const personName = String(peopleById?.get(issue?.subject)?.name || '').replace(/\//g, '').trim();
  if (personName) return true;

  const family = familiesById?.get(issue?.subject);
  return Boolean(family && [family.husbandId, family.wifeId]
    .map((personId) => String(peopleById?.get(personId)?.name || '').replace(/\//g, '').trim())
    .some(Boolean));
}

function getIssueGroups(errors, peopleById, familiesById) {
  const groups = new Map();

  for (const issue of errors) {
    if (!hasReviewName(issue, peopleById, familiesById)) continue;
    const id = getIssueGroupId(issue);
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        label: getIssueGroupLabel(issue.subject, peopleById, familiesById),
        issues: [],
      });
    }
    groups.get(id).issues.push(issue);
  }

  return Array.from(groups.values());
}

function getDescendantReviewOrder(treeData) {
  const peopleById = new Map((treeData?.people || []).map((person) => [person.id, person]));
  const childrenByParentId = new Map();

  for (const family of treeData?.families || []) {
    const parentIds = [family.husbandId, family.wifeId].filter((id) => peopleById.has(id));
    const childIds = (family.childrenIds || []).filter((id) => peopleById.has(id));
    for (const parentId of parentIds) {
      if (!childrenByParentId.has(parentId)) childrenByParentId.set(parentId, []);
      childrenByParentId.get(parentId).push(...childIds);
    }
  }

  const primaryPersonId = peopleById.has(treeData?.primaryPersonId)
    ? treeData.primaryPersonId
    : treeData?.people?.[0]?.id;
  const queue = primaryPersonId ? [primaryPersonId] : [];
  const orderedPeople = new Map();

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const personId = queue[queueIndex];
    if (orderedPeople.has(personId)) continue;
    orderedPeople.set(personId, orderedPeople.size);
    queue.push(...(childrenByParentId.get(personId) || []));
  }

  return orderedPeople;
}

function getDirectLineReviewOrder(treeData) {
  const peopleById = new Map((treeData?.people || []).map((person) => [person.id, person]));
  const parentsByChildId = new Map();

  for (const family of treeData?.families || []) {
    const parentIds = [family.husbandId, family.wifeId].filter((id) => peopleById.has(id));
    for (const childId of family.childrenIds || []) {
      if (!peopleById.has(childId)) continue;
      if (!parentsByChildId.has(childId)) parentsByChildId.set(childId, []);
      parentsByChildId.get(childId).push(...parentIds);
    }
  }

  const primaryPersonId = peopleById.has(treeData?.primaryPersonId)
    ? treeData.primaryPersonId
    : treeData?.people?.[0]?.id;
  const directOrder = new Map();
  const queue = primaryPersonId ? [{ id: primaryPersonId, generation: 0 }] : [];

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const { id: personId, generation } = queue[queueIndex];
    if (directOrder.has(personId)) continue;
    directOrder.set(personId, generation);
    for (const parentId of parentsByChildId.get(personId) || []) {
      queue.push({ id: parentId, generation: generation + 1 });
    }
  }

  // Validation issues can be scoped to a family rather than a person. Give each
  // family the generation of its closest direct-line member so those issues are
  // reviewed alongside the relatives they describe instead of being dropped.
  for (const family of treeData?.families || []) {
    if (!family?.id || directOrder.has(family.id)) continue;
    const memberGenerations = [family.husbandId, family.wifeId, ...(family.childrenIds || [])]
      .map((memberId) => directOrder.get(memberId))
      .filter((generation) => generation !== undefined);
    if (!memberGenerations.length) continue;
    directOrder.set(family.id, Math.min(...memberGenerations));
  }

  return directOrder;
}

function getGenerationReviewLabel(generation) {
  if (generation === 0) return 'Starting person';
  if (generation === 1) return 'Parent generation';
  return `Ancestor generation ${generation}`;
}

function getGroupPlacement(group, placements) {
  return placements.get(group?.issues?.[0]?.subject);
}

// Every record in the review is placed against the person the customer chose.
// Only that person's own ancestors carry a generation label. Anyone else is
// named as a relative of the ancestor they attach to, so an in-law, a spouse or
// an unconnected record is never shown under "Parent generation".
function getReviewPlacements(treeData) {
  const peopleById = new Map((treeData?.people || []).map((person) => [person.id, person]));
  const directOrder = getDirectLineReviewOrder(treeData);
  const placements = new Map();

  for (const [id, generation] of directOrder) {
    placements.set(id, {
      generation,
      direct: true,
      anchorId: peopleById.has(id) ? id : null,
      key: `direct:${generation}`,
    });
  }

  // Relatives take the placement of the closest ancestor they share a family
  // with, and are kept apart from that ancestor's own generation.
  let placedAnother = true;
  while (placedAnother) {
    placedAnother = false;
    for (const family of treeData?.families || []) {
      const memberIds = [family.husbandId, family.wifeId, ...(family.childrenIds || [])]
        .filter((id) => peopleById.has(id));
      const placedMembers = memberIds
        .map((id) => placements.get(id))
        .filter(Boolean);
      if (!placedMembers.length) continue;
      const closest = placedMembers.reduce((best, entry) => (
        entry.generation < best.generation ? entry : best
      ));
      const anchorId = closest.direct ? closest.anchorId : closest.anchorId;
      const relative = {
        generation: closest.generation,
        direct: false,
        anchorId,
        key: anchorId ? `relatives:${anchorId}` : 'unconnected',
      };
      for (const id of memberIds) {
        if (placements.has(id)) continue;
        placements.set(id, relative);
        placedAnother = true;
      }
      if (family?.id && !placements.has(family.id)) placements.set(family.id, relative);
    }
  }

  // Records with no family links still carry errors worth correcting, but they
  // are never presented as part of the selected person's ancestry.
  for (const person of treeData?.people || []) {
    if (placements.has(person.id)) continue;
    placements.set(person.id, { generation: 0, direct: false, anchorId: null, key: 'unconnected' });
  }

  return placements;
}

function getPlacementRank(placement) {
  if (!placement) return Number.MAX_SAFE_INTEGER;
  // The customer's own ancestry is reviewed first, generation by generation.
  // Relatives come after every ancestor, and unconnected records come last.
  if (placement.key === 'unconnected') return Number.MAX_SAFE_INTEGER - 1;
  if (placement.direct) return placement.generation;
  return 1000 + placement.generation;
}

// Names alone do not tell the customer who they are looking at. Every person in
// the review is described by their place in the selected person's own family.
function describeRelationToPrimary(subjectId, treeData, placements, peopleById, primaryPersonId) {
  if (!subjectId || subjectId === primaryPersonId) return 'the person you selected';
  const placement = placements.get(subjectId);
  if (!placement) return '';
  const primaryName = String(peopleById.get(primaryPersonId)?.name || '').replace(/\//g, '').trim();
  if (!primaryName) return '';

  let slot = '';
  for (const family of treeData?.families || []) {
    if (family.husbandId === subjectId) { slot = 'male'; break; }
    if (family.wifeId === subjectId) { slot = 'female'; break; }
  }

  if (placement.direct) {
    const generation = placement.generation;
    const base = generation === 1
      ? (slot === 'male' ? 'father' : slot === 'female' ? 'mother' : 'parent')
      : (slot === 'male' ? 'grandfather' : slot === 'female' ? 'grandmother' : 'grandparent');
    const greats = generation >= 3 ? `${'great-'.repeat(generation - 2)}` : '';
    return `${greats}${base} of ${primaryName}`;
  }

  const anchorName = String(peopleById.get(placement.anchorId)?.name || '').replace(/\//g, '').trim();
  if (!anchorName) return `related to ${primaryName}`;
  const marriedToAnchor = (treeData?.families || []).some((family) => (
    (family.husbandId === subjectId && family.wifeId === placement.anchorId)
    || (family.wifeId === subjectId && family.husbandId === placement.anchorId)
  ));
  if (marriedToAnchor) return `married to ${anchorName}`;
  const childOfAnchor = (treeData?.families || []).some((family) => (
    (family.husbandId === placement.anchorId || family.wifeId === placement.anchorId)
    && (family.childrenIds || []).includes(subjectId)
  ));
  if (childOfAnchor) return `child of ${anchorName}`;
  return `relative of ${anchorName}`;
}

function getPlacementLabel(placement, peopleById, primaryPersonId) {
  if (!placement) return 'Related family branch';
  if (placement.direct && placement.generation >= 2) {
    const ancestorName = String(peopleById?.get(placement.anchorId)?.name || '').replace(/\//g, '').trim();
    if (ancestorName) return ancestorName;
  }
  if (placement.direct) return getGenerationReviewLabel(placement.generation);
  const anchorName = String(peopleById?.get(placement.anchorId)?.name || '').replace(/\//g, '').trim();
  if (anchorName) return `Relatives of ${anchorName}`;
  return 'Related family branch';
}

function getReviewGenerationOrder(treeData) {
  const order = new Map();
  for (const [id, placement] of getReviewPlacements(treeData)) {
    order.set(id, placement.generation);
  }
  return order;
}

// The review only ever covers the selected person's own family. A record with
// no link to them is not shown at all, so nobody is asked to fix a stranger.
function getVisibleGenerationErrors(treeData, errors) {
  const placements = getReviewPlacements(treeData);
  return errors.filter((issue) => {
    const placement = placements.get(issue.subject);
    if (!placement || placement.key === 'unconnected') return false;
    return placement.generation < VISIBLE_REVIEW_GENERATION_COUNT;
  });
}

function buildFamilyLocationIndex(treeData, peopleById) {
  const index = new Map();
  const getLocation = (personId) => {
    if (!index.has(personId)) {
      index.set(personId, { parents: new Set(), spouses: new Set(), children: new Set() });
    }
    return index.get(personId);
  };

  for (const family of treeData?.families || []) {
    const parentIds = [family.husbandId, family.wifeId].filter((id) => peopleById.has(id));
    const childIds = (family.childrenIds || []).filter((id) => peopleById.has(id));
    for (const parentId of parentIds) {
      const location = getLocation(parentId);
      parentIds.filter((id) => id !== parentId).forEach((spouseId) => location.spouses.add(spouseId));
      childIds.forEach((childId) => location.children.add(childId));
    }
    for (const childId of childIds) {
      const location = getLocation(childId);
      parentIds.forEach((parentId) => location.parents.add(parentId));
    }
  }

  return index;
}

function renderFamilyLocationPreview(person, peopleById, locationIndex, directOrder, primaryPersonId) {
  if (!person) return '';
  const namesFor = (ids) => [...ids]
    .map((id) => peopleById.get(id))
    .filter(Boolean)
    .map((relative) => escapeHtml(relative.name || relative.id));
  const location = locationIndex.get(person.id) || { parents: new Set(), spouses: new Set(), children: new Set() };
  const placement = directOrder.get(person.id);
  const primaryPerson = peopleById.get(primaryPersonId);
  const primaryName = escapeHtml(String(primaryPerson?.name || 'your selected person').replace(/\//g, '').trim());
  const anchorName = escapeHtml(String(peopleById.get(placement?.anchorId)?.name || '').replace(/\//g, '').trim());
  const lineDescription = placement?.direct && placement.generation === 0
    ? 'Selected starting person'
    : placement?.direct
      ? `Direct ancestor · ${getGenerationReviewLabel(placement.generation)} from ${primaryName}`
      : anchorName
        ? `Related to ${anchorName}`
        : 'In your working tree';
  const treeParameters = new URLSearchParams();
  if (WORKSPACE_PREVIEW_MODE) treeParameters.set('demo', 'workspace');
  if (IS_ADMINISTRATION_REVIEW) treeParameters.set('admin_review', 'true');
  treeParameters.set('focus', person.id);

  return `
    <aside class="family-location-preview">
      <strong>Family location: ${lineDescription}</strong>
      <span>Parents: ${namesFor(location.parents).join(' and ') || 'Not recorded'} · Spouse: ${namesFor(location.spouses).join(' and ') || 'Not recorded'} · Children: ${namesFor(location.children).join(', ') || 'Not recorded'}</span>
      <a href="tree.html?${treeParameters}">View this person in the working tree</a>
    </aside>
  `;
}

function getOrderedIssueGroups(treeData, errors) {
  const placements = getReviewPlacements(treeData);
  const descendantOrder = getDescendantReviewOrder(treeData);
  const peopleById = new Map((treeData?.people || []).map((person) => [person.id, person]));
  const familiesById = new Map((treeData?.families || []).map((family) => [family.id, family]));
  return getIssueGroups(errors, peopleById, familiesById)
    .map((group, index) => ({ group, index }))
    .sort((left, right) => {
      const leftDirectOrder = getPlacementRank(getGroupPlacement(left.group, placements));
      const rightDirectOrder = getPlacementRank(getGroupPlacement(right.group, placements));
      const leftDuplicateRank = isDuplicateIssue(left.group.issues[0]) ? 0 : 1;
      const rightDuplicateRank = isDuplicateIssue(right.group.issues[0]) ? 0 : 1;
      const leftOrder = descendantOrder.get(left.group.issues[0]?.subject) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = descendantOrder.get(right.group.issues[0]?.subject) ?? Number.MAX_SAFE_INTEGER;
      return leftDuplicateRank - rightDuplicateRank
        || leftDirectOrder - rightDirectOrder
        || leftOrder - rightOrder
        || left.index - right.index;
    })
    .map(({ group }) => group);
}

function getActiveIssueGroups(treeData, errors, progress) {
  if (progress.reviewOrderVersion !== ERROR_REVIEW_ORDER_VERSION) {
    progress.activeGroupIds = [];
    progress.activeGenerationKey = '';
    progress.reviewOrderVersion = ERROR_REVIEW_ORDER_VERSION;
  }
  const orderedGroups = getOrderedIssueGroups(treeData, errors);
  const groupsById = new Map(orderedGroups.map((group) => [group.id, group]));
  const resolved = getResolvedIssueIds(progress);

  const availableGroups = orderedGroups
    .filter((group) => group.issues.some((issue) => !resolved.has(getIssueId(issue))));

  // Duplicates come first, whatever generation they sit in. A duplicate splits
  // one person's life across two records, so fixing dates or relationships
  // before combining them means correcting the same facts twice. While
  // duplicates are open the client sees only the duplicate names — every other
  // error on those same people waits until the records are settled.
  const duplicateGroups = availableGroups
    .map((group) => ({ ...group, issues: group.issues.filter(isDuplicateIssue) }))
    .filter((group) => group.issues.some((issue) => !resolved.has(getIssueId(issue))));

  if (duplicateGroups.length) {
    const duplicatesById = new Map(duplicateGroups.map((group) => [group.id, group]));
    const keptIds = progress.activeGroupIds.filter((id) => duplicatesById.has(id));
    const duplicateBatch = keptIds.length
      ? keptIds.map((id) => duplicatesById.get(id))
      : duplicateGroups.slice(0, progress.duplicateReviewMode === 'single' ? 1 : ERROR_BATCH_SIZE);
    progress.activeGroupIds = duplicateBatch.map((group) => group.id);
    saveProgress(progress);
    return duplicateBatch;
  }

  // Keep the client in the generation already being reviewed. Group ids are
  // temporary (a person can have several issues), while this placement key is
  // the stable generation selection that survives each individual fix.
  const placements = getReviewPlacements(treeData);
  const activeGenerationGroups = progress.activeGenerationKey
    ? availableGroups.filter((group) => getGroupPlacement(group, placements)?.key === progress.activeGenerationKey)
    : [];
  if (activeGenerationGroups.length) {
    const activeIds = progress.activeGroupIds.filter((id) => activeGenerationGroups.some((group) => group.id === id));
    const nextGroups = activeIds.length
      ? activeIds.map((id) => groupsById.get(id))
      : activeGenerationGroups.slice(0, ERROR_BATCH_SIZE);
    progress.activeGroupIds = nextGroups.map((group) => group.id);
    saveProgress(progress);
    return nextGroups;
  }

  // Advance only after every open error in the current generation has been
  // completed or saved for later. Duplicates returned above remain their own
  // first step and never set this non-duplicate generation selection.
  const firstGroup = availableGroups.find((group) => getGroupPlacement(group, placements));
  const currentKey = firstGroup ? getGroupPlacement(firstGroup, placements).key : undefined;
  const generationGroups = currentKey === undefined
    ? availableGroups
    : availableGroups.filter((group) => getGroupPlacement(group, placements)?.key === currentKey);
  const nextGroups = generationGroups.slice(0, ERROR_BATCH_SIZE);
  progress.activeGenerationKey = currentKey || '';
  progress.activeGroupIds = nextGroups.map((group) => group.id);
  saveProgress(progress);
  return nextGroups;
}

function applySafeBatchFixes(treeData, groups, progress) {
  const appliedIssueIds = [];

  for (const issue of groups.flatMap((group) => group.issues)) {
    const fix = issue.autoFix;
    if (!fix || fix.type === 'mergeDuplicatePeople') continue;

    let applied = false;
    if (fix.type === 'removeMissingFamilyRef') {
      const person = treeData.people.find((item) => item.id === fix.personId);
      if (person && Array.isArray(person[fix.field])) {
        const before = person[fix.field].length;
        person[fix.field] = person[fix.field].filter((familyId) => familyId !== fix.familyId);
        applied = person[fix.field].length !== before;
      }
    }

    if (fix.type === 'removeMissingPersonFromFamily') {
      const family = treeData.families.find((item) => item.id === fix.familyId);
      if (family) {
        const before = JSON.stringify([family.husbandId, family.wifeId, family.childrenIds || []]);
        if (family.husbandId === fix.personId) family.husbandId = null;
        if (family.wifeId === fix.personId) family.wifeId = null;
        family.childrenIds = (family.childrenIds || []).filter((childId) => childId !== fix.personId);
        applied = before !== JSON.stringify([family.husbandId, family.wifeId, family.childrenIds || []]);
      }
    }

    if (fix.type === 'removeChildFromFamily') {
      const family = treeData.families.find((item) => item.id === fix.familyId);
      if (family) {
        const before = family.childrenIds?.length || 0;
        family.childrenIds = (family.childrenIds || []).filter((childId) => childId !== fix.childId);
        applied = family.childrenIds.length !== before;
      }
    }

    if (applied) {
      const issueId = getIssueId(issue);
      appliedIssueIds.push(issueId);
      if (!progress.completedIssueIds.includes(issueId)) progress.completedIssueIds.push(issueId);
      if (!progress.completedNonDuplicateIssueIds.includes(issueId)) progress.completedNonDuplicateIssueIds.push(issueId);
      recordResolvedItem(progress, issue, 'Safe automatic fix');
    }
  }

  if (appliedIssueIds.length) {
    saveTreeData(treeData);
    saveProgress(progress);
  }
  return appliedIssueIds.length;
}

function completeDuplicateMerge(treeData, fix) {
  const progress = getProgress();
  if (getCurrentTier() === 'free' && !getFreeDuplicatesLeft(progress)) {
    throw new Error(`Your free preview covers ${FREE_DUPLICATE_FIX_LIMIT} duplicate corrections. Choose a plan to keep combining duplicate records.`);
  }

  const survivor = treeData?.people?.find((person) => person.id === fix.survivorId);
  const duplicates = treeData?.people?.filter((person) => fix.duplicateIds.includes(person.id)) || [];
  if (!survivor || !duplicates.length) {
    throw new Error('The duplicate records are no longer available. Reload the tree and try again.');
  }

  saveDuplicateMergeUndo(JSON.parse(JSON.stringify(treeData)), progress, {
    survivorName: survivor.name || survivor.id,
    duplicateNames: duplicates.map((person) => person.name || person.id),
  });

  // The issue has to be identified before the merge, from the report itself.
  // Rebuilding its wording afterwards produced an id that matched nothing, so
  // the settled duplicate was never marked done and kept coming back.
  const report = treeData.validationReport || {};
  const mergedIssue = ['errors', 'warnings', 'info']
    .flatMap((category) => report[category] || [])
    .find((candidate) => candidate.autoFix?.type === 'mergeDuplicatePeople'
      && candidate.autoFix.survivorId === fix.survivorId
      && (candidate.autoFix.duplicateIds || []).join() === (fix.duplicateIds || []).join());

  mergeDuplicatePeople(treeData, fix);
  removeStaleIssuesAfterDuplicateMerge(treeData.validationReport, fix.duplicateIds);
  const mergedIssueId = mergedIssue ? getIssueId(mergedIssue) : getIssueId({
    category: 'Possible duplicate',
    message: `${duplicates.length + 1} people share the same name and birth year: ${[survivor, ...duplicates].map((person) => `${person.name} (${person.id})`).join(', ')}.`,
    subject: survivor.id,
  });
  if (!progress.completedIssueIds.includes(mergedIssueId)) progress.completedIssueIds.push(mergedIssueId);
  recordResolvedItem(progress, {
    category: 'Possible duplicate',
    message: `${duplicates.length + 1} people were reviewed and merged into ${survivor.name || survivor.id}.`,
    subject: survivor.id,
  }, 'Confirmed duplicate merge');
  if (!progress.completedDuplicateIssueIds.includes(mergedIssueId)) {
    progress.completedDuplicateIssueIds.push(mergedIssueId);
  }
  saveTreeData(treeData);
  saveProgress(progress);
}

function renderWorkspace() {
  try {
    renderWorkspaceContent();
  } catch (error) {
    renderWorkspaceRecovery(error);
  }
  ensureWorkspaceIsNeverBlank();
}

// A thrown error used to leave the workspace completely empty, which reads as the
// review having lost everything. Always leave the customer something to act on.
function renderWorkspaceRecovery(error) {
  const detail = error?.message ? String(error.message) : 'An unexpected problem interrupted the review.';
  workspace.innerHTML = `
    <section id="activeReview" class="batch-complete">
      <h2>Your review needs a moment</h2>
      <p>Your family tree is safe. Something interrupted this screen before your errors could be listed, so nothing was lost and nothing was changed.</p>
      <p class="fix-suggestion">${escapeHtml(detail)}</p>
      <div class="workflow-actions">
        <button type="button" class="btn-add" onclick="window.location.reload()">Try This Screen Again</button>
        <a class="btn-secondary" href="${escapeHtml(returnToTreeLink?.href || 'tree.html')}">Return to Your Five-Generation Working Tree</a>
        <a class="btn-secondary" href="workplace.html">Open Your Work Place</a>
      </div>
    </section>
  `;
}

function ensureWorkspaceIsNeverBlank() {
  if (workspace && !workspace.textContent.trim()) {
    renderWorkspaceRecovery(new Error('This screen finished loading without any content to show.'));
  }
}

window.addEventListener('error', ensureWorkspaceIsNeverBlank);
window.addEventListener('unhandledrejection', ensureWorkspaceIsNeverBlank);

function renderWorkspaceContent() {
  workspaceWelcome.hidden = !SHOW_WORKSPACE_PROGRESS;
  updatePlanErrorWorkspaceMessage();
  const treeData = getTreeData();
  setReaderLookups(
    new Map((treeData?.people || []).map((person) => [person.id, person])),
    new Map((treeData?.families || []).map((family) => [family.id, family]))
  );
  const allErrors = [
    ...(treeData?.validationReport?.errors || []),
    ...(treeData?.validationReport?.warnings || []).filter((issue) => issue.autoFix?.type === 'mergeDuplicatePeople'),
  ];
  const allVisibleGenerationErrors = getVisibleGenerationErrors(treeData, allErrors);
  const openDuplicateIssues = allVisibleGenerationErrors.filter(isDuplicateIssue);
  const openOtherIssues = allVisibleGenerationErrors.filter((issue) => !isDuplicateIssue(issue));
  const isBasicPlan = getCurrentTier() === 'free';
  const progress = getProgress();
  // The customer decides whether this sitting is about duplicates or the rest of
  // the errors; only that kind is shown until they switch.
  const reviewFocus = openDuplicateIssues.length && openOtherIssues.length
    ? progress.reviewFocus
    : openDuplicateIssues.length ? 'duplicates' : 'other';
  const visibleGenerationErrors = reviewFocus === 'duplicates'
    ? openDuplicateIssues
    : reviewFocus === 'other' ? openOtherIssues : allVisibleGenerationErrors;
  const duplicateIssues = visibleGenerationErrors.filter(isDuplicateIssue);
  const reviewFocusSwitch = renderReviewFocusSwitch(
    openDuplicateIssues.length && openOtherIssues.length ? reviewFocus : '',
    openDuplicateIssues.length,
    openOtherIssues.length
  );
  updateReturnToTreeLink(progress);
  updateWorkspaceTreeLinks(progress);
  const errors = isBasicPlan
    ? getFreePreviewErrors(visibleGenerationErrors)
    : visibleGenerationErrors;
  // Everything on the free preview counts the preview itself, never the whole
  // tree, so no panel can announce 58 duplicates the customer cannot fix.
  const countedErrors = isBasicPlan ? errors : visibleGenerationErrors;
  if (isBasicPlan && duplicateIssues.length && progress.duplicateReviewMode !== 'batch') {
    progress.duplicateReviewMode = 'batch';
    progress.activeGroupIds = [];
    saveProgress(progress);
  }
  const duplicateMergeUndo = getDuplicateMergeUndo();
  const canUndoDuplicateMerge = Boolean(duplicateMergeUndo);
  const undoButton = canUndoDuplicateMerge && !duplicateMergeUndo.mergeSummary
    ? '<button id="undoDuplicateMerge" type="button" class="btn-secondary">Return to Previous Tree</button>'
    : '';
  const duplicateMergeReview = renderDuplicateMergeReview();
  const assistanceOptions = renderBasicPlanOptions(countedErrors, progress);
  // The free preview is ten corrections; the customer wants the family and the
  // errors, not a page of explanation before them.
  const encouragement = isBasicPlan ? '' : renderProgressEncouragement(errors, progress);
  const pendingResearch = renderPendingResearch(countedErrors, progress);
  const workspaceDesk = SHOW_WORKSPACE_PROGRESS ? renderWorkspaceDesk(countedErrors, progress) : '';

  if (!treeData?.people?.length) {
    workspace.innerHTML = `
      ${workspaceDesk}
      <section id="activeReview" class="batch-complete">
        <h2>Your five-generation working tree is not available yet</h2>
        <p>Return to your Working Tree Preview to continue with the five generations you selected. This review does not reopen or require the original GEDCOM.</p>
        <a class="btn-add" href="${escapeHtml(returnToTreeLink.href)}">Return to Your Five-Generation Working Tree</a>
      </section>
    `;
    return;
  }

  if (!WORKSPACE_PREVIEW_MODE && !IS_ADMINISTRATION_REVIEW && !localStorage.getItem(PLAN_SELECTION_STORAGE_KEY)) {
    workspace.innerHTML = `
      ${workspaceDesk}
      <section id="activeReview" class="batch-complete">
        <h2>Choose your plan to begin reviewing</h2>
        <p>Your family tree is ready. Select the plan that fits your work, then return here to review, save research for later, and print your progress.</p>
        <a class="btn-add" href="store.html#subscriptions">Choose a Plan</a>
      </section>
    `;
    return;
  }

  const pendingDuplicateReview = renderPendingDuplicateMergeReview(treeData);
  if (pendingDuplicateReview) {
    workspace.innerHTML = `${workspaceDesk}${pendingDuplicateReview}`;
    return;
  }

  // Five corrections is a short enough list that asking which kind to work on
  // first only adds a step; the free trial goes straight to the records.
  if (!isBasicPlan && openDuplicateIssues.length && openOtherIssues.length && !progress.reviewFocus) {
    workspace.innerHTML = `${workspaceDesk}${duplicateMergeReview}${renderReviewFocusChoice(openDuplicateIssues.length, openOtherIssues.length)}`;
    return;
  }

  if (!isBasicPlan && duplicateIssues.length && !progress.duplicateReviewMode) {
    workspace.innerHTML = `${workspaceDesk}${reviewFocusSwitch}${renderDuplicateReviewChoice(duplicateIssues)}`;
    return;
  }

  if (!errors.length) {
    workspace.innerHTML = `${workspaceDesk}${reviewFocusSwitch}${duplicateMergeReview}${encouragement}${pendingResearch}<p id="activeReview" class="empty-message">There are no open errors in the five generations currently shown in your working tree. Return to the tree to choose another direct line or add more generations when you are ready.</p>${renderUpdatedTreeOffer()}${undoButton}${assistanceOptions}`;
    return;
  }

  const activeGroups = getActiveIssueGroups(treeData, errors, progress);
  const reviewingDuplicates = activeGroups.length > 0
    && activeGroups.every((group) => isDuplicateIssue(group.issues[0]));
  const peopleById = new Map(treeData.people.map((person) => [person.id, person]));
  const familiesById = new Map((treeData.families || []).map((family) => [family.id, family]));
  const reviewPlacements = getReviewPlacements(treeData);
  const activePlacement = getGroupPlacement(activeGroups[0], reviewPlacements);
  const activePrimaryPersonId = peopleById.has(treeData.primaryPersonId)
    ? treeData.primaryPersonId
    : treeData.people[0]?.id;
  const activePlacementLabel = getPlacementLabel(activePlacement, peopleById, activePrimaryPersonId);
  const activeReviewTitle = `${activePlacementLabel} review`;
  // Never tell the customer who is or is not an ancestor — the tree says that.
  // This line only says what to do next.
  const placementDescription = `Review the errors for the ${activePlacementLabel.toLowerCase()} before moving outward through the family tree.`;
  const activeReviewDescription = reviewingDuplicates
    ? `${placementDescription} These records look like the same person recorded twice, so they are settled first: a duplicate splits one life across two records, and combining them now saves correcting the same dates and relationships twice.`
    : placementDescription;
  const familyLocationIndex = buildFamilyLocationIndex(treeData, peopleById);
  const selectedPrimaryPersonId = peopleById.has(treeData.primaryPersonId)
    ? treeData.primaryPersonId
    : treeData.people[0]?.id;
  const completed = new Set(progress.completedIssueIds);
  const resolved = getResolvedIssueIds(progress);
  const activeDone = activeGroups.length === 0 || activeGroups.every((group) => (
    group.issues.every((issue) => resolved.has(getIssueId(issue)))
  ));
  const remainingGroups = getOrderedIssueGroups(treeData, errors).filter((group) => (
    group.issues.some((issue) => !resolved.has(getIssueId(issue)))
  )).length;

  if (activeDone && remainingGroups) {
    workspace.innerHTML = `
      ${workspaceDesk}
      ${reviewFocusSwitch}
      ${duplicateMergeReview}
      <section id="activeReview" class="batch-complete">
        <h2>${reviewingDuplicates ? 'Duplicate settled' : 'Generation review complete'}</h2>
        <p>${reviewingDuplicates
          ? `Thank you - that record is settled. ${remainingGroups} person${remainingGroups === 1 ? '' : 's'} or record${remainingGroups === 1 ? '' : 's'} remain, and any further duplicates come next.`
          : `Great job - you completed this generation. ${remainingGroups} person${remainingGroups === 1 ? '' : 's'} or record${remainingGroups === 1 ? '' : 's'} remain.`}</p>
        <button id="loadNextBatch" type="button" class="btn-add">${reviewingDuplicates ? 'Continue' : 'Continue to the next generation'}</button>
        ${undoButton}
        ${encouragement}
        ${pendingResearch}
        ${assistanceOptions}
      </section>
    `;
    return;
  }

  if (activeDone) {
    const pendingMessage = progress.pendingIssueIds.length
      ? ` You also have ${progress.pendingIssueIds.length} item${progress.pendingIssueIds.length === 1 ? '' : 's'} in Fix Later (Pending), which did not block your progress.`
      : '';
    workspace.innerHTML = `${workspaceDesk}${reviewFocusSwitch}${duplicateMergeReview}<section id="activeReview" class="batch-complete"><h2>Active error review complete</h2><p>You completed every active issue in this workspace.${pendingMessage} Your saved review desk above has both your printable chart and your computer progress report.</p>${undoButton}</section>${pendingResearch}${renderUpdatedTreeOffer()}${encouragement}${assistanceOptions}`;
    return;
  }

  workspace.innerHTML = `
    ${workspaceDesk}
    ${reviewFocusSwitch}
    <section id="activeReview" class="error-batch">
      <div class="report-heading">
        <h2>${activeReviewTitle}</h2>
        <span>${activeGroups.length} record${activeGroups.length === 1 ? '' : 's'} in this review</span>
      </div>
      <p class="batch-help">${isBasicPlan ? `${placementDescription}${reviewingDuplicates ? ' These records look like the same person recorded twice, so they are combined first.' : ''}` : `${activeReviewDescription} Each person includes all of their unresolved errors. Mark an error solved after correcting it in this working tree or completing its recommended fix. The next selected generation opens when this generation is complete.`}</p>
      ${duplicateMergeReview}
      ${encouragement}
      ${pendingResearch}
      ${undoButton}
      ${assistanceOptions}
      <ol class="error-batch-list">
        ${activeGroups.map((group) => {
          return `
            <li>
              <strong>${escapeHtml(group.label)}</strong>
              ${(() => {
                const relation = describeRelationToPrimary(
                  group.issues[0]?.subject,
                  treeData,
                  reviewPlacements,
                  peopleById,
                  selectedPrimaryPersonId,
                );
                return relation ? `<p class="issue-group-relation">${escapeHtml(relation.charAt(0).toUpperCase() + relation.slice(1))}</p>` : '';
              })()}
              ${renderFamilyLocationPreview(
                peopleById.get(group.issues[0]?.subject),
                peopleById,
                familyLocationIndex,
                reviewPlacements,
                selectedPrimaryPersonId,
              )}
              <ul class="person-error-list">
                ${group.issues.map((issue) => {
                  const issueId = getIssueId(issue);
                  const isCompleted = completed.has(issueId);
                  const isPending = progress.pendingIssueIds.includes(issueId);
                  const isResolved = isCompleted || isPending;
                  const hasSafeAutomaticFix = Boolean(issue.autoFix) && !isDuplicateIssue(issue);
                  const freeDuplicateLimitReached = isBasicPlan && !getFreeDuplicatesLeft(progress);
                  const issueActions = `
                    ${isDuplicateIssue(issue) ? `
                    <div class="issue-fix-actions">
                    <button type="button" class="btn-secondary" data-merge-duplicates="${encodeURIComponent(JSON.stringify(issue.autoFix))}" ${freeDuplicateLimitReached ? 'disabled' : ''}>${freeDuplicateLimitReached ? 'Upgrade for more duplicate corrections' : 'Review and merge possible duplicates'}</button>
                    </div>` : ''}
                    ${isBasicPlan ? '' : `
                    <div class="issue-fix-actions">
                    <button type="button" class="btn-secondary" data-apply-safe-fix="${encodeURIComponent(issueId)}" ${!hasSafeAutomaticFix || !canUseSafeAutomaticFixes() || isResolved ? 'disabled' : ''}>${hasSafeAutomaticFix && canUseSafeAutomaticFixes() ? 'Apply safe automatic fix' : 'No safe automatic fix'}</button>
                    </div>`}
                    <div class="issue-fix-actions">
                    <button type="button" class="btn-secondary" data-review-manually>Review manually</button>
                    <button type="button" class="btn-secondary" data-resolve-issue="${encodeURIComponent(issueId)}" data-duplicate-issue="${isDuplicateIssue(issue)}" ${isResolved ? 'disabled' : ''}>${isCompleted ? 'Solved' : isPending ? 'Pending review' : 'Mark solved'}</button>
                    ${isResolved ? '' : `<button type="button" class="btn-secondary" data-pending-issue="${encodeURIComponent(issueId)}">Save for Later and Continue</button>`}
                    </div>
                    ${isDuplicateIssue(issue) ? '' : renderRecordReviewOptions(issue, getResearchSubject(issue, peopleById, familiesById))}
                    ${renderManualReviewGuide(issue, peopleById, familiesById)}
                  `;
                  return `
                    <li data-tree-subject="${encodeURIComponent(issue.subject || '')}">
                      ${isDuplicateIssue(issue) ? `
                        ${renderDuplicateComparison(issue, peopleById, familiesById)}
                        <div class="issue-fix-actions">
                          <button type="button" class="btn-add" data-merge-duplicates="${encodeURIComponent(JSON.stringify(issue.autoFix))}" ${freeDuplicateLimitReached ? 'disabled' : ''}>${freeDuplicateLimitReached ? 'Upgrade for more duplicate corrections' : 'Review and merge these records'}</button>
                        </div>
                      ` : `
                        <strong>${escapeHtml(issue.category)}:</strong> ${escapeHtml(toReaderFriendlyText(issue.message))}
                        ${issue.suggestion ? `<p class="fix-suggestion">${escapeHtml(issue.suggestion)}</p>` : ''}
                        ${issueActions}
                      `}
                    </li>
                  `;
                }).join('')}
              </ul>
            </li>
          `;
        }).join('')}
      </ol>
    </section>
  `;
}

workspace.addEventListener('click', (event) => {
  const reviewedIssue = event.target.closest('[data-tree-subject]');
  if (reviewedIssue) {
    rememberLastReviewedSubject(decodeURIComponent(reviewedIssue.dataset.treeSubject));
  }

  const reviewFocusButton = event.target.closest('[data-review-focus]');
  if (reviewFocusButton) {
    const progress = getProgress();
    progress.reviewFocus = reviewFocusButton.dataset.reviewFocus;
    if (progress.reviewFocus === 'duplicates' && !progress.duplicateReviewMode) progress.duplicateReviewMode = 'single';
    progress.activeGroupIds = [];
    progress.activeGenerationKey = '';
    saveProgress(progress);
    renderWorkspace();
    return;
  }

  const duplicateReviewModeButton = event.target.closest('[data-duplicate-review-mode]');
  if (duplicateReviewModeButton) {
    const progress = getProgress();
    progress.duplicateReviewMode = duplicateReviewModeButton.dataset.duplicateReviewMode;
    progress.activeGroupIds = [];
    saveProgress(progress);
    renderWorkspace();
    return;
  }

  const recordSourcesButton = event.target.closest('[data-open-record-sources]');
  if (recordSourcesButton) {
    const sourcePanel = document.querySelector(`[data-record-source-options="${recordSourcesButton.dataset.openRecordSources}"]`);
    if (sourcePanel) {
      sourcePanel.hidden = !sourcePanel.hidden;
      recordSourcesButton.textContent = sourcePanel.hidden ? 'Choose a Record Source' : 'Hide Record Sources';
    }
    return;
  }

  const applySafeFixButton = event.target.closest('[data-apply-safe-fix]');
  if (applySafeFixButton) {
    const issueId = decodeURIComponent(applySafeFixButton.dataset.applySafeFix);
    const treeData = getTreeData();
    const progress = getProgress();
    const errors = [
      ...(treeData?.validationReport?.errors || []),
      ...(treeData?.validationReport?.warnings || []).filter(isDuplicateIssue),
    ];
    const issue = errors.find((item) => getIssueId(item) === issueId);
    if (!issue?.autoFix || isDuplicateIssue(issue)) {
      alert('This error needs a manual review.');
      return;
    }
    const appliedCount = applySafeBatchFixes(treeData, [{ issues: [issue] }], progress);
    alert(appliedCount ? 'Safe automatic fix applied.' : 'This error could not be fixed automatically.');
    renderWorkspace();
    return;
  }

  const reviewManuallyButton = event.target.closest('[data-review-manually]');
  if (reviewManuallyButton) {
    const note = reviewManuallyButton.closest('.person-error-list li')?.querySelector('.manual-review-note');
    if (note) {
      note.hidden = !note.hidden;
      reviewManuallyButton.textContent = note.hidden ? 'Review manually' : 'Hide review steps';
      if (!note.hidden) note.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    return;
  }

  if (event.target.closest('#applySafeBatchFixes')) {
    if (!canUseSafeAutomaticFixes()) {
      alert('Safe automatic fixes are available with every paid plan. Review and fix this batch manually, or choose a paid plan in the Store.');
      return;
    }
    const treeData = getTreeData();
    const progress = getProgress();
    const errors = [
      ...(treeData?.validationReport?.errors || []),
      ...(treeData?.validationReport?.warnings || []).filter(isDuplicateIssue),
    ];
    const appliedCount = applySafeBatchFixes(treeData, getActiveIssueGroups(treeData, errors, progress), progress);
    progress.activeGroupIds = [];
    saveProgress(progress);
    alert(appliedCount ? `${appliedCount} safe automatic fix${appliedCount === 1 ? '' : 'es'} applied.` : 'No safe automatic fixes are available in this batch. Review the suggested fixes manually.');
    renderWorkspace();
    return;
  }

  if (event.target.closest('#reviewManualBatchFixes')) {
    document.querySelector('.error-batch-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  if (event.target.closest('#approveDuplicateMerge')) {
    clearDuplicateMergeUndo();
    renderWorkspace();
    return;
  }

  if (event.target.closest('#undoDuplicateMerge')) {
    const undoState = getDuplicateMergeUndo();
    if (!undoState?.treeData || !undoState?.progress) {
      alert('There is no duplicate merge available to undo.');
      return;
    }
    if (!confirm('Undo the last duplicate merge and restore the previous family tree?')) {
      return;
    }

    saveTreeData(undoState.treeData);
    saveProgress(undoState.progress);
    clearDuplicateMergeUndo();
    renderWorkspace();
    return;
  }

  const mergeButton = event.target.closest('[data-merge-duplicates]');
  if (mergeButton) {
    const treeData = getTreeData();
    const progress = getProgress();
    if (getCurrentTier() === 'free' && !getFreeDuplicatesLeft(progress)) {
      alert(`Your free preview covers ${FREE_DUPLICATE_FIX_LIMIT} duplicate corrections. Choose a plan to keep combining duplicate records.`);
      return;
    }
    const fix = JSON.parse(decodeURIComponent(mergeButton.dataset.mergeDuplicates));
    const survivor = treeData?.people?.find((person) => person.id === fix.survivorId);
    const duplicates = treeData?.people?.filter((person) => fix.duplicateIds.includes(person.id)) || [];

    if (!survivor || !duplicates.length) {
      alert('The duplicate records are no longer available. Reload the tree and try again.');
      return;
    }

    pendingDuplicateMerge = fix;
    renderWorkspace();
    return;
  }

  if (event.target.closest('#cancelDuplicateMerge')) {
    pendingDuplicateMerge = null;
    renderWorkspace();
    return;
  }

  if (event.target.closest('#confirmDuplicateMerge')) {
    const treeData = getTreeData();
    const fix = pendingDuplicateMerge;
    if (!fix) {
      renderWorkspace();
      return;
    }
    try {
      completeDuplicateMerge(treeData, fix);
      pendingDuplicateMerge = null;
      renderWorkspace();
    } catch (error) {
      alert(error.message || 'Could not merge the duplicate people.');
    }
    return;
  }

  const resolveButton = event.target.closest('[data-resolve-issue]');
  if (resolveButton) {
    const issueId = decodeURIComponent(resolveButton.dataset.resolveIssue);
    const progress = getProgress();
    const treeData = getTreeData();
    const issue = [
      ...(treeData?.validationReport?.errors || []),
      ...(treeData?.validationReport?.warnings || []).filter(isDuplicateIssue),
    ].find((item) => getIssueId(item) === issueId);
    if (!progress.completedIssueIds.includes(issueId)) {
      const isDuplicate = resolveButton.dataset.duplicateIssue === 'true';
      // The free preview's two allowances are enforced here as well, so the
      // count can never be walked past by marking records solved.
      if (getCurrentTier() === 'free' && (isDuplicate ? !getFreeDuplicatesLeft(progress) : !getFreeOtherLeft(progress))) {
        alert(isDuplicate
          ? `Your free preview covers ${FREE_DUPLICATE_FIX_LIMIT} duplicate corrections. Choose a plan to keep combining duplicate records.`
          : `Your free preview covers ${BASIC_ERROR_REVIEW_LIMIT} other corrections. Choose a plan to keep correcting your tree.`);
        return;
      }
      progress.completedIssueIds.push(issueId);
      if (!isDuplicate) {
        progress.completedNonDuplicateIssueIds.push(issueId);
      }
      if (issue) recordResolvedItem(progress, issue, 'Manual review');
      progress.activeGroupIds = [];
      saveProgress(progress);
    }
    renderWorkspace();
    return;
  }

  const pendingButton = event.target.closest('[data-pending-issue]');
  if (pendingButton) {
    const issueId = decodeURIComponent(pendingButton.dataset.pendingIssue);
    const progress = getProgress();
    if (!progress.pendingIssueIds.includes(issueId)) {
      progress.pendingIssueIds.push(issueId);
      progress.activeGroupIds = [];
      saveProgress(progress);
    }
    renderWorkspace();
    return;
  }

  const resumePendingButton = event.target.closest('[data-resume-pending-issue]');
  if (resumePendingButton) {
    const issueId = decodeURIComponent(resumePendingButton.dataset.resumePendingIssue);
    const treeData = getTreeData();
    const errors = [
      ...(treeData?.validationReport?.errors || []),
      ...(treeData?.validationReport?.warnings || []).filter(isDuplicateIssue),
    ];
    const issue = errors.find((item) => getIssueId(item) === issueId);
    const progress = getProgress();
    progress.pendingIssueIds = progress.pendingIssueIds.filter((id) => id !== issueId);
    progress.activeGroupIds = issue ? [getIssueGroupId(issue)] : [];
    saveProgress(progress);
    renderWorkspace();
    return;
  }

  if (event.target.closest('#loadNextBatch')) {
    const progress = getProgress();
    progress.activeGroupIds = [];
    progress.activeGenerationKey = '';
    saveProgress(progress);
    renderWorkspace();
    return;
  }

  if (event.target.closest('#openProgressReport')) {
    const report = document.getElementById('computerProgressReport');
    if (report) {
      report.hidden = !report.hidden;
      event.target.closest('#openProgressReport').textContent = report.hidden
        ? 'Open Your Computer Progress Report'
        : 'Hide Your Computer Progress Report';
    }
    return;
  }

  if (event.target.closest('#printProgressChart')) {
    const treeData = getTreeData();
    const progress = getProgress();
    const allGroups = getOrderedIssueGroups(treeData, [
      ...(treeData?.validationReport?.errors || []),
      ...(treeData?.validationReport?.warnings || []).filter(isDuplicateIssue),
    ]);
    printProgressChart(allGroups, new Set(progress.completedIssueIds), false, new Set(progress.pendingIssueIds));
    return;
  }

  if (event.target.closest('#printFixedProgressChart')) {
    const treeData = getTreeData();
    const progress = getProgress();
    const allGroups = getOrderedIssueGroups(treeData, [
      ...(treeData?.validationReport?.errors || []),
      ...(treeData?.validationReport?.warnings || []).filter(isDuplicateIssue),
    ]);
    printProgressChart(allGroups, new Set(progress.completedIssueIds), true, new Set(progress.pendingIssueIds));
  }
});

if (WORKSPACE_PREVIEW_MODE && !getTreeData()?.people?.length) {
  loadedTreeData = createWorkspacePreviewTree();
  saveTreeData(loadedTreeData);
} else if (WORKSPACE_PREVIEW_MODE) {
  const treeData = getTreeData();
  const upgradedTreeData = addWorkspacePreviewGenerations(treeData);
  if (upgradedTreeData !== treeData) {
    loadedTreeData = upgradedTreeData;
    saveTreeData(loadedTreeData);
  }
}
const storedTreeData = getTreeData();
if (storedTreeData?.people?.length) {
  renderWorkspace();
} else if (window.familyTreeClientStorage?.loadTreeFromDatabase) {
  workspace.innerHTML = '<p class="empty-message">Opening your saved error review...</p>';
  let loadedFromDatabase = false;
  const loadingFallback = window.setTimeout(() => {
    if (!loadedFromDatabase) renderWorkspace();
  }, 1500);
  window.familyTreeClientStorage.loadTreeFromDatabase(STORAGE_KEY)
    .then((treeData) => {
      loadedFromDatabase = true;
      window.clearTimeout(loadingFallback);
      loadedTreeData = treeData;
      renderWorkspace();
    })
    .catch(() => {
      loadedFromDatabase = true;
      window.clearTimeout(loadingFallback);
      renderWorkspace();
    });
} else {
  renderWorkspace();
}
