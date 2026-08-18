const STORAGE_KEY = window.familyTreeClientStorage?.getActiveTreeKey() || 'familyTreeData';
const ERROR_PROGRESS_STORAGE_KEY = `${STORAGE_KEY}:errorProgress`;
const DUPLICATE_MERGE_UNDO_STORAGE_KEY = `${STORAGE_KEY}:duplicateMergeUndo`;
const SUBSCRIPTION_STORAGE_KEY = 'familyTreeSubscriptionTier';
const PLAN_SELECTION_STORAGE_KEY = 'familyTreePlanSelected';
const ERROR_BATCH_SIZE = 10;
const BASIC_ERROR_REVIEW_LIMIT = 5;
const ERROR_REVIEW_ORDER_VERSION = 2;
const workspace = document.getElementById('errorWorkspace');
let loadedTreeData = null;

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
    void window.familyTreeClientStorage?.saveTreeInDatabase?.(STORAGE_KEY, treeData);
  }
}

function saveDuplicateMergeUndo(treeData, progress, mergeSummary) {
  localStorage.setItem(DUPLICATE_MERGE_UNDO_STORAGE_KEY, JSON.stringify({ treeData, progress, mergeSummary }));
}

function getDuplicateMergeUndo() {
  try {
    return JSON.parse(localStorage.getItem(DUPLICATE_MERGE_UNDO_STORAGE_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function getIssueId(issue) {
  return JSON.stringify([issue.category || '', issue.message || '', issue.subject || '']);
}

function getProgress() {
  try {
    const progress = JSON.parse(localStorage.getItem(ERROR_PROGRESS_STORAGE_KEY) || '{}');
    return {
      completedIssueIds: Array.isArray(progress.completedIssueIds) ? progress.completedIssueIds : [],
      completedNonDuplicateIssueIds: Array.isArray(progress.completedNonDuplicateIssueIds)
        ? progress.completedNonDuplicateIssueIds
        : [],
      pendingIssueIds: Array.isArray(progress.pendingIssueIds) ? progress.pendingIssueIds : [],
      activeGroupIds: progress.batchMode === 'people' && Array.isArray(progress.activeGroupIds) ? progress.activeGroupIds : [],
      batchMode: 'people',
      reviewOrderVersion: Number(progress.reviewOrderVersion) || 0,
    };
  } catch (error) {
    return {
      completedIssueIds: [],
      completedNonDuplicateIssueIds: [],
      pendingIssueIds: [],
      activeGroupIds: [],
      batchMode: 'people',
      reviewOrderVersion: 0,
    };
  }
}

function saveProgress(progress) {
  localStorage.setItem(ERROR_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

function getResolvedIssueIds(progress) {
  return new Set([...progress.completedIssueIds, ...progress.pendingIssueIds]);
}

function getCurrentTier() {
  return localStorage.getItem(SUBSCRIPTION_STORAGE_KEY) || 'free';
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

function renderBasicPlanOptions(errors) {
  if (getCurrentTier() !== 'free') return '';

  const reviewedCount = Math.min(errors.length, BASIC_ERROR_REVIEW_LIMIT);
  const remainingErrors = Math.max(errors.length - reviewedCount, 0);

  return `
    <section class="assistance-options">
      <h2>Great news - these details can be fixed.</h2>
      <p>We found ${reviewedCount} error${reviewedCount === 1 ? '' : 's'} you can manually fix at no charge. An accurate tree is a wonderful way to share your family's story with relatives and friends, while honoring your ancestors and their contributions to society.</p>
      <p>${remainingErrors ? `Upgrade to Family Builder to fix the remaining ${remainingErrors} error${remainingErrors === 1 ? '' : 's'}, and choose Pro / Researcher when you want safe automatic fixes.` : 'Upgrade to Family Builder whenever you are ready to continue fixing errors and preserving your family history.'}</p>
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
      <h2>Review duplicate merge</h2>
      <p><strong>${escapeHtml(undoState.mergeSummary.survivorName)}</strong> now includes ${escapeHtml(undoState.mergeSummary.duplicateNames.join(', '))}.</p>
      <p>Confirm this merge to continue fixing errors, or return to your previous tree.</p>
      <button id="approveDuplicateMerge" type="button" class="btn-add">Approve Merge and Continue</button>
      <button id="undoDuplicateMerge" type="button" class="btn-secondary">Return to Previous Tree</button>
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
    <section class="pending-research">
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

function getOrderedIssueGroups(treeData, errors) {
  const descendantOrder = getDescendantReviewOrder(treeData);
  return getIssueGroups(errors)
    .map((group, index) => ({ group, index }))
    .sort((left, right) => {
      const leftOrder = descendantOrder.get(left.group.issues[0]?.subject) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = descendantOrder.get(right.group.issues[0]?.subject) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.index - right.index;
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

  const nextGroups = getOrderedIssueGroups(treeData, errors)
    .filter((group) => group.issues.some((issue) => !resolved.has(getIssueId(issue))))
    .slice(0, ERROR_BATCH_SIZE);
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
    }
  }

  if (appliedIssueIds.length) {
    saveTreeData(treeData);
    saveProgress(progress);
  }
  return appliedIssueIds.length;
}

function renderWorkspace() {
  const treeData = getTreeData();
  const allErrors = [
    ...(treeData?.validationReport?.errors || []),
    ...(treeData?.validationReport?.warnings || []).filter((issue) => issue.autoFix?.type === 'mergeDuplicatePeople'),
  ];
  const isBasicPlan = getCurrentTier() === 'free';
  const errors = isBasicPlan ? allErrors.slice(0, BASIC_ERROR_REVIEW_LIMIT) : allErrors;
  const progress = getProgress();
  const duplicateMergeUndo = getDuplicateMergeUndo();
  const canUndoDuplicateMerge = Boolean(duplicateMergeUndo);
  const undoButton = canUndoDuplicateMerge && !duplicateMergeUndo.mergeSummary
    ? '<button id="undoDuplicateMerge" type="button" class="btn-secondary">Return to Previous Tree</button>'
    : '';
  const duplicateMergeReview = renderDuplicateMergeReview();
  const assistanceOptions = renderBasicPlanOptions(allErrors);
  const encouragement = renderProgressEncouragement(errors, progress);
  const pendingResearch = renderPendingResearch(allErrors, progress);

  if (!treeData?.people?.length) {
    workspace.innerHTML = '<p class="empty-message">Upload a GEDCOM file before opening the error workspace.</p>';
    return;
  }

  if (!localStorage.getItem(PLAN_SELECTION_STORAGE_KEY)) {
    workspace.innerHTML = '<p class="empty-message">Choose a subscription plan before starting error fixes. <a href="store.html#subscriptions">Choose a plan in the Store</a>.</p>';
    return;
  }

  if (!errors.length) {
    workspace.innerHTML = `${duplicateMergeReview}${encouragement}${pendingResearch}<p class="empty-message">No validation errors are currently available. Return to the family tree to review warnings and notes.</p><button id="printProgressChart" type="button" class="btn-secondary">Print Progress Chart</button><button id="printFixedProgressChart" type="button" class="btn-secondary">Print Fixed Errors Chart</button>${renderUpdatedTreeOffer()}${undoButton}${assistanceOptions}`;
    return;
  }

  const activeGroups = getActiveIssueGroups(treeData, errors, progress);
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
      ${duplicateMergeReview}
      <section class="batch-complete">
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
    workspace.innerHTML = `${duplicateMergeReview}<section class="batch-complete"><h2>Active error review complete</h2><p>You completed every active issue in this workspace.${pendingMessage} Take a moment to print your progress, save your fixed-errors chart, and celebrate the progress.</p><button id="printProgressChart" type="button" class="btn-secondary">Print Progress Chart</button><button id="printFixedProgressChart" type="button" class="btn-secondary">Print Fixed Errors Chart</button>${undoButton}</section>${pendingResearch}${renderUpdatedTreeOffer()}${encouragement}${assistanceOptions}`;
    return;
  }

  workspace.innerHTML = `
    <section class="error-batch">
      <div class="report-heading">
        <h2>Current people batch</h2>
        <span>${activeGroups.length} of ${ERROR_BATCH_SIZE} selected</span>
      </div>
      <p class="batch-help">${isBasicPlan ? `Your first ${BASIC_ERROR_REVIEW_LIMIT} manual fixes are included at no charge. Use the review guidance below, then mark each corrected record solved. Upgrade to Family Builder to fix the rest, or choose Pro / Researcher for safe automatic fixes.` : 'Each person includes all of their unresolved errors. Mark an error solved only after correcting it in the source GEDCOM or completing its recommended fix. The next batch stays locked until this batch is complete.'}</p>
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
              <ul class="person-error-list">
                ${group.issues.map((issue) => {
                  const issueId = getIssueId(issue);
                  const isCompleted = completed.has(issueId);
                  const isPending = progress.pendingIssueIds.includes(issueId);
                  const isResolved = isCompleted || isPending;
                  const hasSafeAutomaticFix = Boolean(issue.autoFix) && !isDuplicateIssue(issue);
                  const issueActions = `
                    ${isBasicPlan ? '' : `
                    <div class="issue-fix-actions">
                    ${isDuplicateIssue(issue) ? `<button type="button" class="btn-secondary" data-merge-duplicates="${encodeURIComponent(JSON.stringify(issue.autoFix))}">Merge duplicate people for review</button>` : ''}
                    <button type="button" class="btn-secondary" data-apply-safe-fix="${encodeURIComponent(issueId)}" ${!hasSafeAutomaticFix || !canUseSafeAutomaticFixes() || isResolved ? 'disabled' : ''}>${hasSafeAutomaticFix && canUseSafeAutomaticFixes() ? 'Apply safe automatic fix' : 'No safe automatic fix'}</button>
                    </div>`}
                    <div class="issue-fix-actions">
                    <button type="button" class="btn-secondary" data-review-manually>Review manually</button>
                    <button type="button" class="btn-secondary" data-resolve-issue="${encodeURIComponent(issueId)}" data-duplicate-issue="${isDuplicateIssue(issue)}" ${isResolved ? 'disabled' : ''}>${isCompleted ? 'Solved' : isPending ? 'Pending review' : 'Mark solved'}</button>
                    ${isResolved ? '' : `<button type="button" class="btn-secondary" data-pending-issue="${encodeURIComponent(issueId)}">Move to Fix Later</button>`}
                    </div>
                    <p class="manual-review-note" hidden>Review the source record and suggestion above, then mark this item solved or move it to Fix Later (Pending) without blocking your progress.</p>
                  `;
                  return `
                    <li>
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
    localStorage.removeItem(DUPLICATE_MERGE_UNDO_STORAGE_KEY);
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
    localStorage.removeItem(DUPLICATE_MERGE_UNDO_STORAGE_KEY);
    renderWorkspace();
    return;
  }

  const mergeButton = event.target.closest('[data-merge-duplicates]');
  if (mergeButton) {
    const treeData = getTreeData();
    const fix = JSON.parse(decodeURIComponent(mergeButton.dataset.mergeDuplicates));
    const survivor = treeData?.people?.find((person) => person.id === fix.survivorId);
    const duplicates = treeData?.people?.filter((person) => fix.duplicateIds.includes(person.id)) || [];

    if (!survivor || !duplicates.length) {
      alert('The duplicate records are no longer available. Reload the tree and try again.');
      return;
    }

    const names = [survivor, ...duplicates].map((person) => `${person.name} (${person.id})`).join(', ');
    if (!confirm(`Merge these records into ${survivor.name} (${survivor.id})?\n\n${names}\n\nYou will be able to review this merge before continuing.`)) {
      return;
    }

    try {
      const progress = getProgress();
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
      saveTreeData(treeData);
      saveProgress(progress);
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
    if (!progress.completedIssueIds.includes(issueId)) {
      progress.completedIssueIds.push(issueId);
      if (resolveButton.dataset.duplicateIssue !== 'true') {
        progress.completedNonDuplicateIssueIds.push(issueId);
      }
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
