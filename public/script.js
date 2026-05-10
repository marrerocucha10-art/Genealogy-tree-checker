// Load family members from localStorage
let familyMembers = JSON.parse(localStorage.getItem('familyMembers')) || [];

// DOM Elements
const familyForm = document.getElementById('familyForm');
const nameInput = document.getElementById('name');
const relationInput = document.getElementById('relation');
const birthYearInput = document.getElementById('birthYear');
const familyTreeDiv = document.getElementById('familyTree');

// Form submission
familyForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const newMember = {
    id: Date.now(),
    name: nameInput.value.trim(),
    relation: relationInput.value,
    birthYear: birthYearInput.value || 'Unknown'
  };
  
  if (newMember.name) {
    familyMembers.push(newMember);
    saveFamilyMembers();
    renderFamilyTree();
    familyForm.reset();
    nameInput.focus();
  }
});

// Save to localStorage
function saveFamilyMembers() {
  localStorage.setItem('familyMembers', JSON.stringify(familyMembers));
}

// Render family tree
function renderFamilyTree() {
  if (familyMembers.length === 0) {
    familyTreeDiv.innerHTML = '<p class="empty-message">No family members added yet. Start by adding someone!</p>';
    return;
  }
  
  familyTreeDiv.innerHTML = familyMembers.map(member => `
    <div class="family-member">
      <div class="member-info">
        <h3>${escapeHtml(member.name)}</h3>
        <p><span class="relation-badge">${member.relation}</span></p>
        <p><strong>Born:</strong> ${member.birthYear}</p>
      </div>
      <button class="btn-remove" onclick="removeMember(${member.id})">Remove</button>
    </div>
  `).join('');
}

// Remove member
function removeMember(id) {
  if (confirm('Are you sure you want to remove this family member?')) {
    familyMembers = familyMembers.filter(member => member.id !== id);
    saveFamilyMembers();
    renderFamilyTree();
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Initial render on page load
document.addEventListener('DOMContentLoaded', () => {
  renderFamilyTree();
});
