document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-print-page]')) return;
  window.print();
});
