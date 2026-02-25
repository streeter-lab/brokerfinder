// ═══════════════════════════════════════════════════
// SHARED UTILITIES
// ═══════════════════════════════════════════════════

function formatCurrency(value) {
  if (!isFinite(value)) return '\u00a30';
  if (value === 0) return '\u00a30';
  if (value < 0) return '-' + formatCurrency(Math.abs(value));
  if (value < 1) return '\u00a3' + value.toFixed(2);
  const formatted = value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return '\u00a3' + (formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted);
}

function escapeHTML(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showToast(message, duration) {
  duration = duration || 3000;
  var existing = document.getElementById('toast-notification');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.id = 'toast-notification';
  toast.className = 'toast';
  toast.textContent = message;
  toast.setAttribute('role', 'alert');
  document.body.appendChild(toast);
  requestAnimationFrame(function() { toast.classList.add('visible'); });
  setTimeout(function() {
    toast.classList.remove('visible');
    setTimeout(function() { toast.remove(); }, 300);
  }, duration);
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
// Safe because all nav hrefs include trailing slash (e.g. '/compare/')
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
  updateToggleIcon();

  // Mobile hamburger nav
  const navToggle = document.getElementById('navToggle');
  const siteNav = document.querySelector('.site-nav');
  if (navToggle && siteNav) {
    let navTrapHandler = null;

    function closeNav() {
      siteNav.classList.remove('open');
      navToggle.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
      if (navTrapHandler) {
        document.removeEventListener('keydown', navTrapHandler);
        navTrapHandler = null;
      }
    }

    navToggle.addEventListener('click', () => {
      const isOpen = siteNav.classList.toggle('open');
      navToggle.classList.toggle('open', isOpen);
      navToggle.setAttribute('aria-expanded', isOpen);

      if (isOpen) {
        // Focus first nav link
        const firstLink = siteNav.querySelector('a');
        if (firstLink) firstLink.focus();

        // Trap focus within nav
        navTrapHandler = (e) => {
          if (e.key === 'Escape') {
            closeNav();
            navToggle.focus();
            return;
          }
          if (e.key === 'Tab') {
            const focusable = siteNav.querySelectorAll('a, button');
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              navToggle.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        };
        document.addEventListener('keydown', navTrapHandler);
      } else {
        if (navTrapHandler) {
          document.removeEventListener('keydown', navTrapHandler);
          navTrapHandler = null;
        }
      }
    });
    // Close nav when clicking a link
    siteNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => closeNav());
    });
  }

  // ── ISA Deadline / Tax Year Banner ──
  showTaxYearBanner();
});

function showTaxYearBanner() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();

  // Show between Jan 1 and Apr 5
  const isISASeason = (month >= 0 && month <= 2) || (month === 3 && day <= 5);
  if (!isISASeason) return;

  // Only show on homepage and compare page
  const path = window.location.pathname;
  const showOnPages = ['/', '/index.html', '/compare/', '/compare/index.html'];
  if (!showOnPages.some(p => path === p || path.endsWith(p))) return;

  // Check dismissal for current tax year
  const taxYear = month <= 3 ? year : year + 1;
  const dismissKey = `taxBannerDismissed${taxYear}`;
  try {
    if (localStorage.getItem(dismissKey) === 'true') return;
  } catch (e) { /* localStorage unavailable */ }

  // Calculate days until Apr 5
  const deadline = new Date(taxYear, 3, 5); // April 5
  const msPerDay = 86400000;
  const daysAway = Math.max(0, Math.ceil((deadline - now) / msPerDay));

  const banner = document.createElement('div');
  banner.className = 'tax-year-banner';
  banner.id = 'taxYearBanner';
  banner.innerHTML = `
    <span>\u{1F550} The ISA deadline is <strong>5 April ${taxYear}</strong> \u2014 ${daysAway} day${daysAway !== 1 ? 's' : ''} away.
    <a href="/compare/">Find the right broker</a> before the tax year ends.</span>
    <button class="banner-dismiss" aria-label="Dismiss">&times;</button>
  `;

  const header = document.querySelector('.site-header');
  if (header && header.nextSibling) {
    header.parentNode.insertBefore(banner, header.nextSibling);
  }

  banner.querySelector('.banner-dismiss').addEventListener('click', () => {
    banner.remove();
    try { localStorage.setItem(dismissKey, 'true'); } catch (e) { /* localStorage unavailable */ }
  });
}
