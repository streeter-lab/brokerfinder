// ═══════════════════════════════════════════════════
// SHARED UTILITIES
// ═══════════════════════════════════════════════════

function formatCurrency(value) {
  if (value === 0) return '\u00a30';
  if (value < 0) return '-' + formatCurrency(Math.abs(value));
  if (value < 1) return '\u00a3' + value.toFixed(2);
  return '\u00a3' + Math.round(value).toLocaleString('en-GB');
}

// ── Theme toggle (runs immediately to prevent flash) ──
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) { /* localStorage unavailable */ }
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  updateToggleIcon();
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('theme', 'light'); } catch (e) { /* localStorage unavailable */ }
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    try { localStorage.setItem('theme', 'dark'); } catch (e) { /* localStorage unavailable */ }
  }
  updateToggleIcon();
  // Redraw calculator chart if on calculator page
  if (typeof drawChart === 'function' && typeof chartData !== 'undefined' && chartData) drawChart();
}

function updateToggleIcon() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  btn.textContent = isDark ? '\u2600\uFE0F' : '\uD83C\uDF19';
}

// Apply theme before page renders
initTheme();

// Set active nav link based on current path
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  document.querySelectorAll('.site-nav a').forEach(a => {
    const href = a.getAttribute('href');
    if (path === href || (href !== '/' && path.startsWith(href))) {
      a.classList.add('active');
    }
  });

  // Bind theme toggle click
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  // Mobile hamburger nav
  const navToggle = document.getElementById('navToggle');
  const siteNav = document.querySelector('.site-nav');
  if (navToggle && siteNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = siteNav.classList.toggle('open');
      navToggle.classList.toggle('open', isOpen);
      navToggle.setAttribute('aria-expanded', isOpen);
    });
    // Close nav when clicking a link
    siteNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        siteNav.classList.remove('open');
        navToggle.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }
});
