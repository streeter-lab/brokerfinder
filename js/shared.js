// ═══════════════════════════════════════════════════
// SHARED UTILITIES
// ═══════════════════════════════════════════════════

function formatCurrency(value) {
  if (value === 0) return '\u00a30';
  if (value < 0) return '-' + formatCurrency(Math.abs(value));
  if (value >= 1000) return '\u00a3' + value.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (value < 1 && value > 0) return '\u00a3' + value.toFixed(2);
  return '\u00a3' + value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Set active nav link based on current path
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  document.querySelectorAll('.site-nav a').forEach(a => {
    const href = a.getAttribute('href');
    if (path === href || (href !== '/' && path.startsWith(href))) {
      a.classList.add('active');
    }
  });
});
