(() => {
  'use strict';

  function animateLatestGuess() {
    const board = document.querySelector('#board');
    if (!board) return;

    const rows = [...board.querySelectorAll('.row')];
    const candidates = rows.filter(row => [...row.querySelectorAll('.cell')].some(cell =>
      cell.classList.contains('green') || cell.classList.contains('yellow') || cell.classList.contains('gray')
    ));
    const row = candidates[candidates.length - 1];
    if (!row) return;

    const cells = [...row.querySelectorAll('.cell')];
    const signature = cells.map(cell => `${cell.textContent}|${cell.classList.contains('green') ? 'g' : cell.classList.contains('yellow') ? 'y' : cell.classList.contains('gray') ? 'x' : ''}`).join('');
    if (row.dataset.revealSignature === signature) return;
    row.dataset.revealSignature = signature;

    cells.forEach((cell, index) => {
      const color = cell.classList.contains('green') ? 'green' : cell.classList.contains('yellow') ? 'yellow' : cell.classList.contains('gray') ? 'gray' : '';
      if (!color) return;
      cell.classList.remove('reveal');
      void cell.offsetWidth;
      cell.style.animationDelay = `${index * 120}ms`;
      cell.classList.add('reveal');
    });
  }

  function boot() {
    const board = document.querySelector('#board');
    if (!board || board.dataset.effectsBound === '1') return;
    board.dataset.effectsBound = '1';

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(animateLatestGuess);
    });
    observer.observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    animateLatestGuess();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
