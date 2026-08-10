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
      activeIssueIds: Array.isArray(progress.activeIssueIds) ? progress.activeIssueIds : [],
    };
  } catch (error) {
    return { completedIssueIds: [], activeIssueIds: [] };
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

function getActiveIssues(errors, progress) {
  const errorsById = new Map(errors.map((issue) => [getIssueId(issue), issue]));
  const completed = new Set(progress.completedIssueIds);
  const activeIds = progress.activeIssueIds.filter((id) => errorsById.has(id));

  if (activeIds.length) {
    return activeIds.map((id) => errorsById.get(id));
  }

  const nextIssues = errors.filter((issue) => !completed.has(getIssueId(issue))).slice(0, ERROR_BATCH_SIZE);
  progress.activeIssueIds = nextIssues.map(getIssueId);
  saveProgress(progress);
  return nextIssues;
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
  const activeIssues = getActiveIssues(errors, progress);
  const completed = new Set(progress.completedIssueIds);
  const activeIds = new Set(progress.activeIssueIds);
  const activeDone = activeIssues.length === 0 || [...activeIds].every((id) => completed.has(id));
  const remainingErrors = errors.filter((issue) => !completed.has(getIssueId(issue))).length;

  if (activeDone && remainingErrors) {
    workspace.innerHTML = `
      <section class="batch-complete">
        <h2>Batch complete</h2>
        <p>You solved this batch. ${remainingErrors} error${remainingErrors === 1 ? '' : 's'} remain.</p>
        <button id="loadNextBatch" type="button" class="btn-add">Load next ${Math.min(ERROR_BATCH_SIZE, remainingErrors)} errors</button>
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
        <h2>Current error batch</h2>
        <span>${activeIssues.length} of ${ERROR_BATCH_SIZE} selected</span>
      </div>
      <p class="batch-help">Mark an error solved only after correcting it in the source GEDCOM or completing its recommended fix. The next batch stays locked until this batch is complete.</p>
      <ol class="error-batch-list">
        ${activeIssues.map((issue) => {
          const issueId = getIssueId(issue);
          const isCompleted = completed.has(issueId);
          return `
            <li>
              <strong>${escapeHtml(issue.category)}:</strong> ${escapeHtml(issue.message)}
              ${issue.subject ? ` <span class="person-id">${escapeHtml(issue.subject)}</span>` : ''}
              ${issue.suggestion ? `<p class="fix-suggestion">${escapeHtml(issue.suggestion)}</p>` : ''}
              <button type="button" class="btn-secondary" data-resolve-issue="${encodeURIComponent(issueId)}" ${isCompleted ? 'disabled' : ''}>${isCompleted ? 'Solved' : 'Mark solved'}</button>
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
    progress.activeIssueIds = [];
    saveProgress(progress);
    renderWorkspace();
  }
});

renderWorkspace();
