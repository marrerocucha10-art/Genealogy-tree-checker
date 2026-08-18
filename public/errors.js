const WORKSPACE_PREVIEW_MODE = new URLSearchParams(window.location.search).get('demo') === 'workspace';
const STORAGE_KEY = WORKSPACE_PREVIEW_MODE
  ? 'familyTreeWorkspacePreviewData'
  : window.familyTreeClientStorage?.getActiveTreeKey() || 'familyTreeData';
const ERROR_PROGRESS_STORAGE_KEY = `${STORAGE_KEY}:errorProgress`;
const DUPLICATE_MERGE_UNDO_STORAGE_KEY = `${STORAGE_KEY}:duplicateMergeUndo`;
const SUBSCRIPTION_STORAGE_KEY = 'familyTreeSubscriptionTier';
const PLAN_SELECTION_STORAGE_KEY = 'familyTreePlanSelected';
const ERROR_BATCH_SIZE = 10;
const BASIC_ERROR_REVIEW_LIMIT = 5;
const FREE_DUPLICATE_FIX_LIMIT = 5;
const ERROR_REVIEW_ORDER_VERSION = 4;
const workspace = document.getElementById('errorWorkspace');
const returnToTreeLink = document.getElementById('returnToTree');
const planErrorWorkspaceMessage = document.getElementById('planErrorWorkspaceMessage');
let loadedTreeData = null;
let inMemoryDuplicateMergeUndo = null;
let pendingDuplicateMerge = null;

function getTreeData() {
  if (loadedTreeData) return loadedTreeData;
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
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
    suggestion: 'Compare the family record with the source GEDCOM, then confirm or correct the parent connection.',
    subject: '@I3@',
  };
  return {
    people: [
      { id: '@I1@', name: 'Elena Rivera' },
      { id: '@I2@', name: 'Mateo Rivera' },
      { id: '@I3@', name: 'Sofia Rivera' },
    ],
    primaryPersonId: '@I3@',
    families: [{ id: '@F1@', husbandId: '@I2@', wifeId: '@I1@', childrenIds: ['@I3@'] }],
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
      lastReviewedSubject: activeIssue.subject,
    },
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
    batchMode: 'people',
    reviewOrderVersion: Number(savedProgress.reviewOrderVersion) || 0,
    duplicateReviewMode: ['single', 'batch'].includes(savedProgress.duplicateReviewMode) ? savedProgress.duplicateReviewMode : '',
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

function updateReturnToTreeLink(progress = getProgress()) {
  if (!returnToTreeLink) return;
  const parameters = new URLSearchParams();
  if (WORKSPACE_PREVIEW_MODE) parameters.set('demo', 'workspace');
  if (progress.lastReviewedSubject) parameters.set('focus', progress.lastReviewedSubject);
  returnToTreeLink.href = parameters.size ? `tree.html?${parameters}` : 'tree.html';
}

function updateWorkspaceTreeLinks(progress = getProgress()) {
  const parameters = new URLSearchParams();
  if (WORKSPACE_PREVIEW_MODE) parameters.set('demo', 'workspace');
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

  const duplicateIssues = errors.filter(isDuplicateIssue);
  const completedDuplicateFixes = progress.completedDuplicateIssueIds.length;
  if (duplicateIssues.length || completedDuplicateFixes) {
    const remainingDuplicateFixes = Math.max(FREE_DUPLICATE_FIX_LIMIT - completedDuplicateFixes, 0);
    const duplicateProgressMessage = remainingDuplicateFixes
      ? `You have completed ${completedDuplicateFixes} of ${FREE_DUPLICATE_FIX_LIMIT} so far, with ${remainingDuplicateFixes} still available.`
      : `You have completed all ${FREE_DUPLICATE_FIX_LIMIT} duplicate corrections included in your free preview. Upgrade to continue reviewing and fixing possible duplicates throughout your tree.`;
    return `
      <section class="assistance-options">
        <h2>Wonderful progress on your family tree.</h2>
        <p>Your free preview includes up to ${FREE_DUPLICATE_FIX_LIMIT} reviewed duplicate corrections. ${duplicateProgressMessage}</p>
        <p>Family Builder lets you continue reviewing and correcting possible duplicates, so every person has a clearer place in your family story.</p>
        <p>Your resolved work stays in this browser workspace when you upgrade, so you can continue from the same place.</p>
        <a class="btn-secondary assistance-upgrade-link" href="store.html#subscriptions">Upgrade for more duplicate corrections</a>
      </section>
    `;
  }

  const reviewedCount = Math.min(errors.length, BASIC_ERROR_REVIEW_LIMIT);
  const remainingErrors = Math.max(errors.length - reviewedCount, 0);
  const completedFreeReviewCount = Math.min(progress.completedIssueIds.length, BASIC_ERROR_REVIEW_LIMIT);
  const freeReviewMessage = completedFreeReviewCount >= BASIC_ERROR_REVIEW_LIMIT
    ? `You have completed the ${BASIC_ERROR_REVIEW_LIMIT} corrections included in your free review. Upgrade to continue reviewing and fixing the rest of your family tree.`
    : `We spotted ${reviewedCount} error${reviewedCount === 1 ? '' : 's'} you can manually fix at no charge.`;

  return `
    <section class="assistance-options">
      <h2>Great news - these details can be fixed.</h2>
      <p>${freeReviewMessage} An accurate tree is a wonderful way to share your family's story with relatives and friends, while honoring your ancestors and their contributions to society.</p>
      <p>${remainingErrors ? `Upgrade to Family Builder to fix the remaining ${remainingErrors} error${remainingErrors === 1 ? '' : 's'}, and choose Pro / Researcher when you want safe automatic fixes.` : 'Upgrade to Family Builder whenever you are ready to continue fixing errors and preserving your family history.'}</p>
      <p>Your resolved work stays in this browser workspace when you upgrade, so you can continue from the same place.</p>
      <a class="btn-secondary assistance-upgrade-link" href="store.html#subscriptions">Choose a plan to fix the rest</a>
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
      <p>Personalize a fresh family-tree edition, print it, or explore posters and keepsakes made from the progress you just completed.</p>
      <div class="family-documentary-offer">
        <strong>Your family story deserves a standing ovation!</strong>
        <p>Coming soon: celebrate your family achievements and memories with a short documentary video. Select treasured photographs and turn them into a living tribute to the ancestors whose lives and contributions shaped your family.</p>
        <video class="family-documentary-video" autoplay loop muted playsinline controls aria-label="Family members revisiting treasured photographs">
          <source src="family-memory-documentary-preview.mp4#t=0,15" type="video/mp4">
          Your browser does not support the video tag.
        </video>
        <small>Preview video by cottonbro studio on Pexels.</small>
        <a class="btn-secondary" href="photo-to-life.html">Bring a Family Photo to Life</a>
      </div>
      <a class="btn-add" href="index.html#treePresentation">Personalize and print your updated tree</a>
    </section>
  `;
}

function renderDuplicateMergeReview() {
  const undoState = getDuplicateMergeUndo();
  if (!undoState?.mergeSummary) return '';

  return `
    <section class="duplicate-merge-review">
      <h2>Duplicate merge complete</h2>
      <p><strong>${escapeHtml(undoState.mergeSummary.survivorName)}</strong> now includes ${escapeHtml(undoState.mergeSummary.duplicateNames.join(', '))}.</p>
    <p>Keep this resolved correction in your workspace and continue reviewing or upgrade when you are ready. If you prefer, you can return this most recent merge to the previous tree state.</p>
    <button id="approveDuplicateMerge" type="button" class="btn-add">Keep Resolved Work and Continue</button>
    <button id="undoDuplicateMerge" type="button" class="btn-secondary">Return to Previous Tree State</button>
    </section>
  `;
}

function renderPendingDuplicateMergeReview(treeData) {
  if (!pendingDuplicateMerge) return '';

  const survivor = treeData?.people?.find((person) => person.id === pendingDuplicateMerge.survivorId);
  const duplicates = treeData?.people?.filter((person) => pendingDuplicateMerge.duplicateIds.includes(person.id)) || [];
  if (!survivor || !duplicates.length) {
    pendingDuplicateMerge = null;
    return '';
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

function renderPendingResearch(errors, progress) {
  const pendingIssues = errors.filter((issue) => progress.pendingIssueIds.includes(getIssueId(issue)));
  if (!pendingIssues.length) return '';

  return `
    <section id="researchShelf" class="pending-research">
      <h2>Fix Later (Pending)</h2>
      <p>${pendingIssues.length} item${pendingIssues.length === 1 ? '' : 's'} will not block your progress. Return whenever you have more records or information.</p>
      <ul>
        ${pendingIssues.map((issue) => `
          <li>
            <strong>${escapeHtml(issue.category)}:</strong> ${escapeHtml(issue.message)}
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
          ? `<h4>Next items to review</h4><ul>${unresolvedIssues.slice(0, 3).map((issue) => `<li><strong>${escapeHtml(issue.subject || issue.category)}:</strong> ${escapeHtml(issue.suggestion || issue.message)}</li>`).join('')}</ul>`
          : ''}
      </section>
      <div class="corrected-items-preview">
        <h3>Corrected items preview</h3>
        ${correctedItems.length
          ? `<ul>${correctedItems.map((item) => `<li><strong>${escapeHtml(item.category)}:</strong> ${escapeHtml(item.message)} <span>${escapeHtml(item.correctionType)}</span></li>`).join('')}</ul>`
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
          <td>${escapeHtml(issue.category)}: ${escapeHtml(issue.message)}</td>
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
  const referencesRemovedPerson = (issue) => (
    removedIds.includes(issue.subject) || removedIds.some((id) => issue.message.includes(id))
  );

  for (const category of ['errors', 'warnings', 'info']) {
    report[category] = (report[category] || []).filter((issue) => !referencesRemovedPerson(issue));
  }
}

function getIssueGroups(errors) {
  const groups = new Map();

  for (const issue of errors) {
    const id = getIssueGroupId(issue);
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        label: issue.subject || 'General validation',
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
  const queue = primaryPersonId ? [primaryPersonId] : [];

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const personId = queue[queueIndex];
    if (directOrder.has(personId)) continue;
    directOrder.set(personId, directOrder.size);
    queue.push(...(parentsByChildId.get(personId) || []));
  }

  return directOrder;
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
  const directPosition = directOrder.get(person.id);
  const primaryPerson = peopleById.get(primaryPersonId);
  const lineDescription = directPosition === 0
    ? 'Selected starting person'
    : directPosition !== undefined
      ? `Direct ancestor · ${directPosition} generation${directPosition === 1 ? '' : 's'} from ${escapeHtml(primaryPerson?.name || 'your selected person')}`
      : 'Related family branch · outside the selected direct line';
  const treeParameters = new URLSearchParams();
  if (WORKSPACE_PREVIEW_MODE) treeParameters.set('demo', 'workspace');
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
  const directOrder = getDirectLineReviewOrder(treeData);
  const descendantOrder = getDescendantReviewOrder(treeData);
  return getIssueGroups(errors)
    .map((group, index) => ({ group, index }))
    .sort((left, right) => {
      const leftDirectOrder = directOrder.get(left.group.issues[0]?.subject) ?? Number.MAX_SAFE_INTEGER;
      const rightDirectOrder = directOrder.get(right.group.issues[0]?.subject) ?? Number.MAX_SAFE_INTEGER;
      const leftDuplicateRank = isDuplicateIssue(left.group.issues[0]) ? 0 : 1;
      const rightDuplicateRank = isDuplicateIssue(right.group.issues[0]) ? 0 : 1;
      const leftOrder = descendantOrder.get(left.group.issues[0]?.subject) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = descendantOrder.get(right.group.issues[0]?.subject) ?? Number.MAX_SAFE_INTEGER;
      return leftDirectOrder - rightDirectOrder
        || leftDuplicateRank - rightDuplicateRank
        || leftOrder - rightOrder
        || left.index - right.index;
    })
    .map(({ group }) => group);
}

function getActiveIssueGroups(treeData, errors, progress) {
  if (progress.reviewOrderVersion !== ERROR_REVIEW_ORDER_VERSION) {
    progress.activeGroupIds = [];
    progress.reviewOrderVersion = ERROR_REVIEW_ORDER_VERSION;
  }
  const groupsById = new Map(getOrderedIssueGroups(treeData, errors).map((group) => [group.id, group]));
  const resolved = getResolvedIssueIds(progress);
  const activeIds = progress.activeGroupIds.filter((id) => groupsById.has(id));

  if (activeIds.length) {
    return activeIds.map((id) => groupsById.get(id));
  }

  const availableGroups = getOrderedIssueGroups(treeData, errors)
    .filter((group) => group.issues.some((issue) => !resolved.has(getIssueId(issue))));
  const reviewingDuplicatesOneByOne = progress.duplicateReviewMode === 'single'
    && isDuplicateIssue(availableGroups[0]?.issues[0]);
  const nextGroups = availableGroups.slice(0, reviewingDuplicatesOneByOne ? 1 : ERROR_BATCH_SIZE);
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
  if (getCurrentTier() === 'free' && progress.completedDuplicateIssueIds.length >= FREE_DUPLICATE_FIX_LIMIT) {
    throw new Error(`Your free preview includes ${FREE_DUPLICATE_FIX_LIMIT} duplicate corrections. Choose a plan to continue reviewing and correcting possible duplicates.`);
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
  mergeDuplicatePeople(treeData, fix);
  removeStaleIssuesAfterDuplicateMerge(treeData.validationReport, fix.duplicateIds);
  const mergedIssueId = getIssueId({
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
  updatePlanErrorWorkspaceMessage();
  const treeData = getTreeData();
  const allErrors = [
    ...(treeData?.validationReport?.errors || []),
    ...(treeData?.validationReport?.warnings || []).filter((issue) => issue.autoFix?.type === 'mergeDuplicatePeople'),
  ];
  const duplicateIssues = allErrors.filter(isDuplicateIssue);
  const isBasicPlan = getCurrentTier() === 'free';
  const progress = getProgress();
  updateReturnToTreeLink(progress);
  updateWorkspaceTreeLinks(progress);
  const errors = isBasicPlan && duplicateIssues.length
    ? duplicateIssues.slice(0, FREE_DUPLICATE_FIX_LIMIT)
    : isBasicPlan
      ? allErrors.slice(0, BASIC_ERROR_REVIEW_LIMIT)
      : allErrors;
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
  const assistanceOptions = renderBasicPlanOptions(allErrors, progress);
  const encouragement = renderProgressEncouragement(errors, progress);
  const pendingResearch = renderPendingResearch(allErrors, progress);
  const workspaceDesk = renderWorkspaceDesk(allErrors, progress);

  if (!treeData?.people?.length) {
    workspace.innerHTML = `
      ${workspaceDesk}
      <section id="activeReview" class="batch-complete">
        <h2>Start your saved review desk</h2>
        <p>Upload a GEDCOM file first. We will create your family tree, identify items to review, and keep your progress here whenever you return.</p>
        <a class="btn-add" href="/?start=upload">Step 1: Upload Your GEDCOM</a>
      </section>
    `;
    return;
  }

  if (!WORKSPACE_PREVIEW_MODE && !localStorage.getItem(PLAN_SELECTION_STORAGE_KEY)) {
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

  if (!isBasicPlan && duplicateIssues.length && !progress.duplicateReviewMode) {
    workspace.innerHTML = `${workspaceDesk}${renderDuplicateReviewChoice(duplicateIssues)}`;
    return;
  }

  if (!errors.length) {
    workspace.innerHTML = `${workspaceDesk}${duplicateMergeReview}${encouragement}${pendingResearch}<p id="activeReview" class="empty-message">No validation errors are currently available. Return to the family tree to review warnings and notes.</p>${renderUpdatedTreeOffer()}${undoButton}${assistanceOptions}`;
    return;
  }

  const activeGroups = getActiveIssueGroups(treeData, errors, progress);
  const peopleById = new Map(treeData.people.map((person) => [person.id, person]));
  const directLineOrder = getDirectLineReviewOrder(treeData);
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
      ${duplicateMergeReview}
      <section id="activeReview" class="batch-complete">
        <h2>Batch complete</h2>
        <p>Great job - you completed this group. ${remainingGroups} person${remainingGroups === 1 ? '' : 's'} or record${remainingGroups === 1 ? '' : 's'} remain.</p>
        <button id="loadNextBatch" type="button" class="btn-add">Load next ${Math.min(ERROR_BATCH_SIZE, remainingGroups)} people</button>
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
    workspace.innerHTML = `${workspaceDesk}${duplicateMergeReview}<section id="activeReview" class="batch-complete"><h2>Active error review complete</h2><p>You completed every active issue in this workspace.${pendingMessage} Your saved review desk above has both your printable chart and your computer progress report.</p>${undoButton}</section>${pendingResearch}${renderUpdatedTreeOffer()}${encouragement}${assistanceOptions}`;
    return;
  }

  workspace.innerHTML = `
    ${workspaceDesk}
    <section id="activeReview" class="error-batch">
      <div class="report-heading">
        <h2>Current people batch</h2>
        <span>${activeGroups.length} of ${ERROR_BATCH_SIZE} selected</span>
      </div>
      <p class="batch-help">${isBasicPlan && duplicateIssues.length ? `Your free preview shows up to ${FREE_DUPLICATE_FIX_LIMIT} possible duplicate corrections together. Open any record below to review it carefully before confirming its merge. Upgrade to Family Builder when you are ready to correct more duplicates.` : isBasicPlan ? `Your first ${BASIC_ERROR_REVIEW_LIMIT} manual fixes are included at no charge. Use the review guidance below, then mark each corrected record solved. Upgrade to Family Builder to fix the rest, or choose Pro / Researcher for safe automatic fixes.` : 'Each person includes all of their unresolved errors. Mark an error solved only after correcting it in the source GEDCOM or completing its recommended fix. The next batch stays locked until this batch is complete.'}</p>
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
              ${renderFamilyLocationPreview(
                peopleById.get(group.issues[0]?.subject),
                peopleById,
                familyLocationIndex,
                directLineOrder,
                selectedPrimaryPersonId,
              )}
              <ul class="person-error-list">
                ${group.issues.map((issue) => {
                  const issueId = getIssueId(issue);
                  const isCompleted = completed.has(issueId);
                  const isPending = progress.pendingIssueIds.includes(issueId);
                  const isResolved = isCompleted || isPending;
                  const hasSafeAutomaticFix = Boolean(issue.autoFix) && !isDuplicateIssue(issue);
                  const freeDuplicateLimitReached = isBasicPlan
                    && progress.completedDuplicateIssueIds.length >= FREE_DUPLICATE_FIX_LIMIT;
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
                    ${renderRecordReviewOptions(issue, peopleById.get(issue.subject))}
                    <p class="manual-review-note" hidden>Review the source record and suggestion above, then mark this item solved or move it to Fix Later (Pending) without blocking your progress.</p>
                  `;
                  return `
                    <li data-tree-subject="${encodeURIComponent(issue.subject || '')}">
                      <strong>${escapeHtml(issue.category)}:</strong> ${escapeHtml(issue.message)}
                      ${issue.suggestion ? `<p class="fix-suggestion">${escapeHtml(issue.suggestion)}</p>` : ''}
                      ${issueActions}
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
    if (note) note.hidden = !note.hidden;
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
    if (getCurrentTier() === 'free' && progress.completedDuplicateIssueIds.length >= FREE_DUPLICATE_FIX_LIMIT) {
      alert(`Your free preview includes ${FREE_DUPLICATE_FIX_LIMIT} duplicate corrections. Choose a plan to continue reviewing and correcting possible duplicates.`);
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
      progress.completedIssueIds.push(issueId);
      if (resolveButton.dataset.duplicateIssue !== 'true') {
        progress.completedNonDuplicateIssueIds.push(issueId);
      }
      if (issue) recordResolvedItem(progress, issue, 'Manual review');
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

if (WORKSPACE_PREVIEW_MODE) {
  loadedTreeData = createWorkspacePreviewTree();
  saveTreeData(loadedTreeData);
}
const storedTreeData = getTreeData();
if (storedTreeData?.people?.length) {
  renderWorkspace();
} else if (window.familyTreeClientStorage?.loadTreeFromDatabase) {
  workspace.innerHTML = '<p class="empty-message">Opening your family tree...</p>';
  window.familyTreeClientStorage.loadTreeFromDatabase(STORAGE_KEY)
    .then((treeData) => {
      loadedTreeData = treeData;
      renderWorkspace();
    })
    .catch(() => renderWorkspace());
} else {
  renderWorkspace();
}
