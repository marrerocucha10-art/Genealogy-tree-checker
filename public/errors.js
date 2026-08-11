const STORAGE_KEY = 'familyTreeData';
const ERROR_PROGRESS_STORAGE_KEY = 'familyTreeErrorProgress';
const ERROR_BATCH_SIZE = 10;
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

function getIssueId(issue) {
  return JSON.stringify([issue.category || '', issue.message || '', issue.subject || '']);
}

function getProgress() {
  try {
    const progress = JSON.parse(localStorage.getItem(ERROR_PROGRESS_STORAGE_KEY) || '{}');
    return {
      completedIssueIds: Array.isArray(progress.completedIssueIds) ? progress.completedIssueIds : [],
      activeGroupIds: progress.batchMode === 'people' && Array.isArray(progress.activeGroupIds) ? progress.activeGroupIds : [],
      batchMode: 'people',
    };
  } catch (error) {
    return { completedIssueIds: [], activeGroupIds: [], batchMode: 'people' };
  }
}

function saveProgress(progress) {
  localStorage.setItem(ERROR_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
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

function printProgressChart(groups, completed) {
  const rows = groups.flatMap((group) => group.issues.map((issue) => {
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
      <h1>Family Tree Error Progress Chart</h1>
      <p>Current people batch: ${groups.length} record${groups.length === 1 ? '' : 's'}</p>
      <table>
        <thead><tr><th>Person or Record</th><th>Issue</th><th>Recommended Fix</th><th>Progress Notes</th></tr></thead>
        <tbody>${rows}</tbody>
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

  if (!treeData?.people?.length) {
    workspace.innerHTML = '<p class="empty-message">Upload a GEDCOM file before opening the error workspace.</p>';
    return;
  }

  if (!errors.length) {
    workspace.innerHTML = '<p class="empty-message">No validation errors are currently available. Return to the family tree to review warnings and notes.</p>';
    return;
  }

  const progress = getProgress();
  const activeGroups = getActiveIssueGroups(errors, progress);
  const completed = new Set(progress.completedIssueIds);
  const activeDone = activeGroups.length === 0 || activeGroups.every((group) => (
    group.issues.every((issue) => completed.has(getIssueId(issue)))
  ));
  const remainingGroups = getIssueGroups(errors).filter((group) => (
    group.issues.some((issue) => !completed.has(getIssueId(issue)))
  )).length;

  if (activeDone && remainingGroups) {
    workspace.innerHTML = `
      <section class="batch-complete">
        <h2>Batch complete</h2>
        <p>You solved this group. ${remainingGroups} person${remainingGroups === 1 ? '' : 's'} or record${remainingGroups === 1 ? '' : 's'} remain.</p>
        <button id="loadNextBatch" type="button" class="btn-add">Load next ${Math.min(ERROR_BATCH_SIZE, remainingGroups)} people</button>
      </section>
    `;
    return;
  }

  if (activeDone) {
    workspace.innerHTML = '<section class="batch-complete"><h2>All errors completed</h2><p>No more validation errors remain in this workspace.</p></section>';
    return;
  }

  workspace.innerHTML = `
    <section class="error-batch">
      <div class="report-heading">
        <h2>Current people batch</h2>
        <span>${activeGroups.length} of ${ERROR_BATCH_SIZE} selected</span>
      </div>
      <p class="batch-help">Each person includes all of their unresolved errors. Mark an error solved only after correcting it in the source GEDCOM or completing its recommended fix. The next batch stays locked until this batch is complete.</p>
      <button id="printProgressChart" type="button" class="btn-secondary">Print Progress Chart</button>
      <ol class="error-batch-list">
        ${activeGroups.map((group) => {
          return `
            <li>
              <strong>${escapeHtml(group.label)}</strong>
              <ul class="person-error-list">
                ${group.issues.map((issue) => {
                  const issueId = getIssueId(issue);
                  const isCompleted = completed.has(issueId);
                  return `
                    <li>
                      <strong>${escapeHtml(issue.category)}:</strong> ${escapeHtml(issue.message)}
                      ${issue.suggestion ? `<p class="fix-suggestion">${escapeHtml(issue.suggestion)}</p>` : ''}
                      ${issue.autoFix?.type === 'mergeDuplicatePeople' ? `<button type="button" class="btn-secondary" data-merge-duplicates="${encodeURIComponent(JSON.stringify(issue.autoFix))}">Merge duplicate people</button>` : ''}
                      <button type="button" class="btn-secondary" data-resolve-issue="${encodeURIComponent(issueId)}" ${isCompleted ? 'disabled' : ''}>${isCompleted ? 'Solved' : 'Mark solved'}</button>
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
      mergeDuplicatePeople(treeData, fix);
      const mergedIssueId = getIssueId({
        category: 'Possible duplicate',
        message: `${duplicates.length + 1} people share the same name and birth year: ${[survivor, ...duplicates].map((person) => `${person.name} (${person.id})`).join(', ')}.`,
        subject: survivor.id,
      });
      const progress = getProgress();
      if (!progress.completedIssueIds.includes(mergedIssueId)) progress.completedIssueIds.push(mergedIssueId);
      treeData.validationReport.warnings = (treeData.validationReport.warnings || []).filter((issue) => getIssueId(issue) !== mergedIssueId);
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
      saveProgress(progress);
    }
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
    const activeGroups = getActiveIssueGroups(treeData?.validationReport?.errors || [], progress);
    printProgressChart(activeGroups, new Set(progress.completedIssueIds));
  }
});

renderWorkspace();
