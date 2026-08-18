const STORAGE_KEY = 'familyTreeData';
const ERROR_PROGRESS_STORAGE_KEY = 'familyTreeErrorProgress';
const DUPLICATE_MERGE_UNDO_STORAGE_KEY = 'familyTreeDuplicateMergeUndo';
const SUBSCRIPTION_STORAGE_KEY = 'familyTreeSubscriptionTier';
const ERROR_BATCH_SIZE = 10;
const BASIC_ERROR_FIX_LIMIT = 20;
const workspace = document.getElementById('errorWorkspace');

function getTreeData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function saveTreeData(treeData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(treeData));
}

function saveDuplicateMergeUndo(treeData, progress) {
  localStorage.setItem(DUPLICATE_MERGE_UNDO_STORAGE_KEY, JSON.stringify({ treeData, progress }));
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
      activeGroupIds: progress.batchMode === 'people' && Array.isArray(progress.activeGroupIds) ? progress.activeGroupIds : [],
      batchMode: 'people',
    };
  } catch (error) {
    return {
      completedIssueIds: [],
      completedNonDuplicateIssueIds: [],
      activeGroupIds: [],
      batchMode: 'people',
    };
  }
}

function saveProgress(progress) {
  localStorage.setItem(ERROR_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
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

  const fixedCount = getCompletedNonDuplicateIssueCount(errors, progress);
  const remainingFixes = Math.max(BASIC_ERROR_FIX_LIMIT - fixedCount, 0);
  const limitReached = remainingFixes === 0;

  return `
    <section class="assistance-options">
      <h2>${limitReached ? 'Basic fix limit reached' : 'Basic plan progress'}</h2>
      <p>${fixedCount} of ${BASIC_ERROR_FIX_LIMIT} non-duplicate error fixes used.${limitReached ? ' Upgrade to Family Builder for unlimited manual fixes.' : ` ${remainingFixes} fix${remainingFixes === 1 ? '' : 'es'} remaining.`} Duplicate person merges are free and do not use this limit.</p>
      <a class="btn-secondary assistance-upgrade-link" href="index.html#subscriptionWorkflows">Upgrade to Family Builder</a>
    </section>
  `;
}

function renderProgressEncouragement(errors, progress) {
  const completed = new Set(progress.completedIssueIds);
  const total = errors.length;
  const solved = errors.filter((issue) => completed.has(getIssueId(issue))).length;
  const tier = getCurrentTier();
  let message = 'Every corrected record makes the next research step clearer.';

  if (!total) {
    message = 'Your current report is clear. Keep this chart as a record of the careful work you have completed.';
  } else if (!solved) {
    message = 'You are off to a great start. Choose one issue, follow the recommendation, and build momentum from there.';
  } else if (solved === total) {
    message = 'Wonderful work - this report is complete. Your family story is now one step clearer.';
  } else if (solved >= Math.ceil(total / 2)) {
    message = 'You are more than halfway through this report. Keep going - the remaining steps are already in view.';
  } else {
    message = `Nice progress - you have solved ${solved} issue${solved === 1 ? '' : 's'} so far.`;
  }

  const tierMessage = tier === 'personal'
    ? ' Family Builder gives you room to keep reviewing and organizing without a fix limit.'
    : tier === 'free'
      ? ' Duplicate person merges remain free, and Family Builder is ready whenever you want unlimited manual fixes.'
      : ' Your plan includes the advanced tools needed to keep refining this tree.';

  return `
    <aside class="progress-encouragement" aria-live="polite">
      <strong>Keep building your family story</strong>
      <p>${message}${tierMessage}</p>
    </aside>
  `;
}

function renderUpdatedTreeOffer() {
  return `
    <section class="updated-tree-offer">
      <h2>Your updated tree is ready to celebrate</h2>
      <p>Personalize a fresh family-tree edition, print it, or explore posters and keepsakes made from the progress you just completed.</p>
      <a class="btn-add" href="index.html#treePresentation">Personalize and print your updated tree</a>
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

function printProgressChart(groups, completed, fixedOnly = false) {
  const rows = groups.flatMap((group) => group.issues
    .filter((issue) => !fixedOnly || completed.has(getIssueId(issue)))
    .map((issue) => {
      const status = completed.has(getIssueId(issue)) ? 'Solved' : 'Open';
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

function getActiveIssueGroups(errors, progress) {
  const groupsById = new Map(getIssueGroups(errors).map((group) => [group.id, group]));
  const completed = new Set(progress.completedIssueIds);
  const activeIds = progress.activeGroupIds.filter((id) => groupsById.has(id));

  if (activeIds.length) {
    return activeIds.map((id) => groupsById.get(id));
  }

  const nextGroups = getIssueGroups(errors)
    .filter((group) => group.issues.some((issue) => !completed.has(getIssueId(issue))))
    .slice(0, ERROR_BATCH_SIZE);
  progress.activeGroupIds = nextGroups.map((group) => group.id);
  saveProgress(progress);
  return nextGroups;
}

function renderWorkspace() {
  const treeData = getTreeData();
  const errors = [
    ...(treeData?.validationReport?.errors || []),
    ...(treeData?.validationReport?.warnings || []).filter((issue) => issue.autoFix?.type === 'mergeDuplicatePeople'),
  ];
  const progress = getProgress();
  const canUndoDuplicateMerge = Boolean(getDuplicateMergeUndo());
  const undoButton = canUndoDuplicateMerge ? '<button id="undoDuplicateMerge" type="button" class="btn-secondary">Undo Last Duplicate Merge</button>' : '';
  const assistanceOptions = renderBasicPlanOptions(errors, progress);
  const encouragement = renderProgressEncouragement(errors, progress);

  if (!treeData?.people?.length) {
    workspace.innerHTML = '<p class="empty-message">Upload a GEDCOM file before opening the error workspace.</p>';
    return;
  }

  if (!errors.length) {
    workspace.innerHTML = `${encouragement}<p class="empty-message">No validation errors are currently available. Return to the family tree to review warnings and notes.</p><button id="printFixedProgressChart" type="button" class="btn-secondary">Print Fixed Errors Chart</button>${renderUpdatedTreeOffer()}${undoButton}${assistanceOptions}`;
    return;
  }

  const activeGroups = getActiveIssueGroups(errors, progress);
  const completed = new Set(progress.completedIssueIds);
  const activeDone = activeGroups.length === 0 || activeGroups.every((group) => (
    group.issues.every((issue) => completed.has(getIssueId(issue)))
  ));
  const remainingGroups = getIssueGroups(errors).filter((group) => (
    group.issues.some((issue) => !completed.has(getIssueId(issue)))
  )).length;

  if (activeDone && remainingGroups) {
    const correctedRows = activeGroups.flatMap((group) =>
      group.issues
        .filter((issue) => completed.has(getIssueId(issue)))
        .map((issue) => `
          <li>
            <strong>${escapeHtml(group.label)}</strong> —
            <em>${escapeHtml(issue.category)}</em>: ${escapeHtml(issue.message)}
          </li>
        `)
    ).join('');
    workspace.innerHTML = `
      <section class="batch-complete">
        <h2>🎉 Congratulations on completing this batch!</h2>
        <p>Excellent work! You've finished this group of errors. There ${remainingGroups === 1 ? 'is' : 'are'} still <strong>${remainingGroups} person${remainingGroups === 1 ? '' : 's'} or record${remainingGroups === 1 ? '' : 's'}</strong> remaining — keep going, you're making great progress!</p>
        ${correctedRows ? `<h3>Corrected errors in this batch</h3><ul class="corrected-errors-list">${correctedRows}</ul>` : ''}
        <button id="loadNextBatch" type="button" class="btn-add">Continue with next ${Math.min(ERROR_BATCH_SIZE, remainingGroups)} errors</button>
        <button id="printFixedProgressChart" type="button" class="btn-secondary">Print Fixed Errors Chart</button>
        ${undoButton}
        ${encouragement}
        ${assistanceOptions}
      </section>
    `;
    return;
  }

  if (activeDone) {
    workspace.innerHTML = `<section class="batch-complete"><h2>🏆 Amazing — all errors completed!</h2><p>You did it! Every issue in this workspace has been resolved. Your family tree is cleaner and more accurate thanks to your hard work. Take a moment to print your fixed-errors chart and celebrate this milestone!</p><button id="printFixedProgressChart" type="button" class="btn-secondary">Print Fixed Errors Chart</button>${undoButton}</section>${renderUpdatedTreeOffer()}${encouragement}${assistanceOptions}`;
    return;
  }

  workspace.innerHTML = `
    <section class="error-batch">
      <div class="report-heading">
        <h2>🔧 Let's fix your family tree — one group at a time!</h2>
        <span>${activeGroups.length} of ${ERROR_BATCH_SIZE} selected</span>
      </div>
      <p class="batch-help">Errors are shown in groups of 10 people so it's easy and manageable. Work through this group at your own pace — each person's issues are listed below. Mark an error solved only after correcting it in your source GEDCOM or completing the recommended fix. The next group will unlock once this batch is complete.</p>
      ${encouragement}
      <button id="markBatchSolved" type="button" class="btn-add">Mark all as solved</button>
      <button id="printProgressChart" type="button" class="btn-secondary">Print Progress Chart</button>
      <button id="printFixedProgressChart" type="button" class="btn-secondary">Print Fixed Errors Chart</button>
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
                  const basicLimitReached = !canUseUnlimitedErrorFixes() && !isDuplicateIssue(issue) && getCompletedNonDuplicateIssueCount(errors, progress) >= BASIC_ERROR_FIX_LIMIT;
                  return `
                    <li>
                      <strong>${escapeHtml(issue.category)}:</strong> ${escapeHtml(issue.message)}
                      ${issue.suggestion ? `<p class="fix-suggestion">${escapeHtml(issue.suggestion)}</p>` : ''}
                      ${isDuplicateIssue(issue) ? `<button type="button" class="btn-secondary" data-merge-duplicates="${encodeURIComponent(JSON.stringify(issue.autoFix))}">Approve &amp; Merge Duplicate People</button>` : ''}
                      <button type="button" class="btn-secondary" data-resolve-issue="${encodeURIComponent(issueId)}" data-duplicate-issue="${isDuplicateIssue(issue)}" ${isCompleted || basicLimitReached ? 'disabled' : ''}>${isCompleted ? '✅ Solved' : basicLimitReached ? 'Upgrade to fix more' : 'Mark solved'}</button>
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
    if (!confirm(`Merge these records into ${survivor.name} (${survivor.id})?\n\n${names}\n\nThis updates family references and removes the duplicate records.`)) {
      return;
    }

    try {
      const progress = getProgress();
      saveDuplicateMergeUndo(JSON.parse(JSON.stringify(treeData)), progress);
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

  if (event.target.closest('#markBatchSolved')) {
    const treeData = getTreeData();
    const allErrors = [
      ...(treeData?.validationReport?.errors || []),
      ...(treeData?.validationReport?.warnings || []).filter((issue) => issue.autoFix?.type === 'mergeDuplicatePeople'),
    ];
    const progress = getProgress();
    const activeGroups = getActiveIssueGroups(allErrors, progress);
    for (const group of activeGroups) {
      for (const issue of group.issues) {
        const issueId = getIssueId(issue);
        if (!progress.completedIssueIds.includes(issueId)) {
          const basicLimitReached = !canUseUnlimitedErrorFixes() && !isDuplicateIssue(issue) && getCompletedNonDuplicateIssueCount(allErrors, progress) >= BASIC_ERROR_FIX_LIMIT;
          if (!basicLimitReached) {
            progress.completedIssueIds.push(issueId);
            if (!isDuplicateIssue(issue)) {
              progress.completedNonDuplicateIssueIds.push(issueId);
            }
          }
        }
      }
    }
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
    const activeGroups = getActiveIssueGroups([
      ...(treeData?.validationReport?.errors || []),
      ...(treeData?.validationReport?.warnings || []).filter(isDuplicateIssue),
    ], progress);
    printProgressChart(activeGroups, new Set(progress.completedIssueIds));
    return;
  }

  if (event.target.closest('#printFixedProgressChart')) {
    const treeData = getTreeData();
    const progress = getProgress();
    const allGroups = getIssueGroups([
      ...(treeData?.validationReport?.errors || []),
      ...(treeData?.validationReport?.warnings || []).filter(isDuplicateIssue),
    ]);
    printProgressChart(allGroups, new Set(progress.completedIssueIds), true);
  }
});

renderWorkspace();
