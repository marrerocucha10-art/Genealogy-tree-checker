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

function getIssueGroupId(issue) {
  return issue.subject ? `record:${issue.subject}` : `issue:${getIssueId(issue)}`;
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
  const errors = treeData?.validationReport?.errors || [];

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
  }
});

renderWorkspace();
