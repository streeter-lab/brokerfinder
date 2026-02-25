#!/usr/bin/env node
// ═══════════════════════════════════════════════════
// BUILD BROKER DETAIL PAGES
// Reads data/brokers.json and generates /broker/{slug}/index.html for each broker
// Also generates /broker/index.html (broker index page)
// Updates sitemap.xml with all broker page URLs
// ═══════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BROKERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'brokers.json'), 'utf8'));
const TODAY = new Date().toISOString().slice(0, 10);

// Load fee engine so we can calculate accurate fees for calculator links
// (handles all fee types: fixed, percentage, tiered, thresholded)
const feeEngineCode = fs.readFileSync(path.join(ROOT, 'js', 'fee-engine.js'), 'utf8');
eval(feeEngineCode);

// Default portfolio value used in calculator links from broker pages.
// Must match the `start` parameter in the calculator link URL below.
const CALC_DEFAULT_PORTFOLIO = 30000;

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[\/]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function formatVerifiedDate(ym) {
  if (!ym) return 'Unknown';
  const [year, month] = ym.split('-');
  const monthIdx = parseInt(month, 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return year || 'Unknown';
  return `${MONTH_NAMES[monthIdx]} ${year}`;
}

// ═══════════════════════════════════════════════════
// FEE DESCRIPTION HELPERS
// ═══════════════════════════════════════════════════

function describePlatformFee(broker) {
  const fee = broker.platformFee;
  if (!fee) return 'N/A';

  switch (fee.type) {
    case 'fixed':
      if (fee.amount === 0) return 'Free (£0)';
      return `£${fee.amount.toFixed(2)} per year`;

    case 'percentage': {
      let desc = `${(fee.rate * 100).toFixed(2)}% of portfolio value`;
      if (fee.flat_extra) desc += ` + £${fee.flat_extra} base fee`;
      if (fee.minimum) desc += ` (min £${fee.minimum})`;
      if (fee.cap) desc += ` (max £${fee.cap})`;
      return desc;
    }

    case 'tiered': {
      const parts = fee.tiers.map((t, i) => {
        if (t.above !== undefined) return `${(t.rate * 100).toFixed(2)}% above £${(t.above / 1000).toFixed(0)}k`;
        const prev = i > 0 ? fee.tiers[i - 1].upTo : 0;
        return `${(t.rate * 100).toFixed(2)}% on ${prev === 0 ? 'first' : 'next'} £${(t.upTo / 1000).toFixed(0)}k`;
      });
      return parts.join(', ');
    }

    case 'thresholded': {
      const tierDesc = fee.tiers.map((t, i) => {
        if (t.above !== undefined) return `${(t.rate * 100).toFixed(2)}% above £${(t.above / 1000).toFixed(0)}k`;
        const prev = i > 0 ? fee.tiers[i - 1].upTo : 0;
        return `${(t.rate * 100).toFixed(2)}% on ${prev === 0 ? 'first' : 'next'} £${(t.upTo / 1000).toFixed(0)}k`;
      }).join(', ');
      let desc = `Flat £${broker.platformFee.belowAmount} if under £${(broker.platformFee.belowThreshold / 1000).toFixed(0)}k, otherwise ${tierDesc}`;
      if (fee.cap) desc += ` (capped at £${fee.cap})`;
      return desc;
    }

    default:
      return 'See provider';
  }
}

function describeSippFee(broker) {
  if (!broker.hasSIPP) return 'N/A — no SIPP available';
  if (!broker.sippFee) return 'N/A';
  const fee = broker.sippFee;
  let desc = '';
  if (fee.type === 'fixed') {
    desc = fee.amount === 0 ? 'Included (£0 extra)' : `£${fee.amount.toFixed(2)} per year`;
  } else if (fee.type === 'percentage') {
    desc = `${(fee.rate * 100).toFixed(2)}%`;
    if (fee.cap) desc += ` (max £${fee.cap})`;
  }
  if (broker.sippExtra) desc += ` + £${broker.sippExtra}/yr surcharge`;
  if (broker.sippMin) desc += ` (min £${broker.sippMin})`;
  return desc || 'See provider';
}

function formatTradeFee(val) {
  if (val === null || val === undefined) return 'N/A';
  if (val === 0) return 'Free';
  return `£${val.toFixed(2)}`;
}

function formatFxRate(broker) {
  if (broker.fxRate === null || broker.fxRate === undefined) return 'Not disclosed';
  if (broker.fxRate === 0) return 'Free (0%)';
  return `${(broker.fxRate * 100).toFixed(2)}%`;
}

const ACCOUNT_LABELS = { isa: 'ISA', sipp: 'SIPP', gia: 'GIA', jisa: 'JISA', lisa: 'LISA' };
const INVESTMENT_LABELS = { fund: 'Funds', etf: 'ETFs', shareUK: 'UK Shares', shareIntl: 'Intl Shares', bond: 'Bonds' };
const CATEGORY_LABELS = { flat: 'Flat fee', percentage: 'Percentage fee', trading: 'Trading platform' };
const RATING_LABELS = { customerService: 'Customer Service', easeOfUse: 'Ease of Use', investmentRange: 'Investment Range', established: 'Track Record' };

function ratingDots(value, max = 5) {
  let html = '';
  for (let i = 1; i <= max; i++) {
    html += `<span class="rating-dot ${i <= value ? 'filled' : ''}"></span>`;
  }
  return html;
}

// ═══════════════════════════════════════════════════
// BROKER PAGE TEMPLATE
// ═══════════════════════════════════════════════════

function generateBrokerPage(broker) {
  const slug = slugify(broker.name);
  const feePercent = broker.platformFee && broker.platformFee.rate
    ? (broker.platformFee.rate * 100).toFixed(2) : '0';

  const accountTags = broker.accounts.map(a =>
    `<span class="tag tag-accent">${ACCOUNT_LABELS[a] || a}</span>`
  ).join('');

  const investmentTags = broker.investmentTypes.map(t =>
    `<span class="tag tag-accent">${INVESTMENT_LABELS[t] || t}</span>`
  ).join('');

  const prosHTML = (broker.pros || []).map(p =>
    `<div class="pro-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg><span>${escapeHTML(p)}</span></div>`
  ).join('');

  const warningsHTML = (broker.warnings || []).map(w =>
    `<div class="warning-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg><span>${escapeHTML(w)}</span></div>`
  ).join('');

  const ratings = broker.ratings || {};
  const ratingsHTML = Object.entries(RATING_LABELS).map(([key, label]) => {
    const val = ratings[key] || 0;
    return `<div class="rating-row"><span class="rating-label">${label}</span><span class="rating-dots">${ratingDots(val)}</span><span class="rating-num">${val}/5</span></div>`;
  }).join('');

  // Build calc link with platform fee — use fee engine for accurate calculation
  // across all fee types (fixed, percentage, tiered, thresholded)
  const calcFeeAmount = broker.platformFee ? calculatePlatformFee(broker.platformFee, CALC_DEFAULT_PORTFOLIO) : 0;
  const calcFee = CALC_DEFAULT_PORTFOLIO > 0 ? ((calcFeeAmount / CALC_DEFAULT_PORTFOLIO) * 100).toFixed(2) : '0';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHTML(broker.name)} Fee Breakdown — BrokerFinder</title>
<meta name="description" content="Full fee schedule, pros, cons, and how ${escapeHTML(broker.name)} compares to other UK platforms.">
<meta name="theme-color" content="#2ec4b6">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Serif+Display&display=swap" rel="stylesheet">
<link rel="canonical" href="https://brokerfinder.uk/broker/${slug}/">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta property="og:title" content="${escapeHTML(broker.name)} Fee Breakdown — BrokerFinder">
<meta property="og:description" content="Full fee schedule, pros, cons, and how ${escapeHTML(broker.name)} compares to other UK platforms.">
<meta property="og:url" content="https://brokerfinder.uk/broker/${slug}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="BrokerFinder">
<meta name="twitter:card" content="summary">
<link rel="stylesheet" href="/css/style.css">
<style>
.broker-layout {
  max-width: 760px;
  margin: 0 auto;
  padding: 0 1.5rem 4rem;
}
.broker-subtitle {
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.95rem;
  max-width: 560px;
  margin: -1.5rem auto 2rem;
}
.broker-overview {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem 2rem;
  margin-bottom: 1.5rem;
}
.overview-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.overview-row:last-child { margin-bottom: 0; }
.overview-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  min-width: 110px;
  flex-shrink: 0;
  padding-top: 0.25rem;
}
.overview-value {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}
.overview-verified {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  font-size: 0.78rem;
  color: var(--text-muted);
}
.fee-table-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  margin-bottom: 1.5rem;
}
.fee-table-card h2 {
  font-family: var(--font-heading);
  font-size: 1.15rem;
  padding: 1.25rem 2rem 0;
  margin-bottom: 0;
}
.fee-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}
.fee-table tr { border-bottom: 1px solid var(--border); }
.fee-table tr:last-child { border-bottom: none; }
.fee-table td {
  padding: 0.75rem 2rem;
  vertical-align: top;
}
.fee-table td:first-child {
  color: var(--text-secondary);
  font-weight: 500;
  white-space: nowrap;
  width: 40%;
}
.fee-table td:last-child {
  font-weight: 500;
}
.pros-cons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}
.pros-card, .cons-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem 2rem;
}
.pros-card h2, .cons-card h2 {
  font-family: var(--font-heading);
  font-size: 1.1rem;
  margin-bottom: 1rem;
}
.pro-item, .warning-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.88rem;
  margin-bottom: 0.5rem;
  line-height: 1.5;
}
.pro-item { color: var(--text-secondary); }
.pro-item svg { flex-shrink: 0; margin-top: 3px; }
.warning-item { color: var(--amber); }
.warning-item svg { flex-shrink: 0; margin-top: 3px; }
.ratings-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem 2rem;
  margin-bottom: 1.5rem;
}
.ratings-card h2 {
  font-family: var(--font-heading);
  font-size: 1.1rem;
  margin-bottom: 1rem;
}
.rating-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
}
.rating-label {
  font-size: 0.85rem;
  color: var(--text-secondary);
  min-width: 140px;
}
.rating-dots {
  display: flex;
  gap: 4px;
}
.rating-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--border);
}
.rating-dot.filled {
  background: var(--accent);
}
.rating-num {
  font-size: 0.78rem;
  color: var(--text-muted);
}
.notes-card {
  background: var(--accent-dim);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: 1rem 1.5rem;
  margin-bottom: 1.5rem;
  font-size: 0.88rem;
  color: var(--text-secondary);
  line-height: 1.6;
}
.broker-ctas {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
.broker-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  transition: var(--transition);
}
.broker-cta.primary {
  background: var(--accent);
  color: #1a1a1a;
}
.broker-cta.primary:hover { background: var(--accent-hover); }
.broker-cta.secondary {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
}
.broker-cta.secondary:hover { border-color: var(--accent); color: var(--accent); }
.fscs-warning {
  background: var(--amber-dim);
  border: 1px solid rgba(232,168,56,0.3);
  border-radius: var(--radius-sm);
  padding: 0.75rem 1.25rem;
  font-size: 0.82rem;
  color: var(--amber);
  margin-top: 0.75rem;
}
@media (max-width: 640px) {
  .pros-cons { grid-template-columns: 1fr; }
  .fee-table td { padding: 0.6rem 1.25rem; }
  .fee-table td:first-child { white-space: normal; }
  .overview-row { flex-direction: column; gap: 0.25rem; }
  .overview-label { min-width: auto; }
  .broker-ctas { flex-direction: column; }
  .broker-cta { justify-content: center; }
  .broker-overview, .pros-card, .cons-card, .ratings-card { padding: 1.25rem; }
  .rating-label { min-width: 100px; font-size: 0.78rem; }
}
</style>
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FinancialProduct",
  "name": `${broker.name} Investment Platform`,
  "provider": { "@type": "FinancialService", "name": broker.name },
  "url": `https://brokerfinder.uk/broker/${slug}/`,
  "description": `Fee breakdown and review of ${broker.name} investment platform.`
}, null, 2)}
</script>
</head>
<body>

<header class="site-header">
  <a href="/" class="logo">Broker<span>Finder</span></a>
  <button class="nav-toggle" id="navToggle" aria-label="Toggle navigation" aria-expanded="false">
    <span class="hamburger-line"></span>
    <span class="hamburger-line"></span>
    <span class="hamburger-line"></span>
  </button>
  <nav class="site-nav">
    <a href="/compare/">Compare</a>
    <a href="/check/">Quick Check</a>
    <a href="/calculator/">Calculator</a>
    <a href="/faq/">FAQ</a>
  </nav>
  <button class="btn-theme-toggle" id="themeToggle" aria-label="Toggle dark mode">🌙</button>
</header>
<noscript><p style="text-align:center;padding:2rem;color:#888;">This tool requires JavaScript. Please enable it in your browser.</p></noscript>

<section class="page-hero">
  <h1>${escapeHTML(broker.name)}<br><em>Fee Breakdown</em></h1>
</section>
<p class="broker-subtitle">Full fee schedule, pros, cons, and how ${escapeHTML(broker.name)} compares to other UK platforms.</p>

<div class="broker-layout">

  <!-- Overview Card -->
  <div class="broker-overview">
    <div class="overview-row">
      <span class="overview-label">Category</span>
      <span class="overview-value"><span class="tag tag-accent">${CATEGORY_LABELS[broker.category] || broker.category}</span></span>
    </div>
    <div class="overview-row">
      <span class="overview-label">Account types</span>
      <span class="overview-value">${accountTags}</span>
    </div>
    <div class="overview-row">
      <span class="overview-label">Investments</span>
      <span class="overview-value">${investmentTags}</span>
    </div>
    <div class="overview-row">
      <span class="overview-label">SIPP drawdown</span>
      <span class="overview-value" style="font-size:0.9rem;color:var(--text)">${broker.hasDrawdown ? 'Yes' : 'No'}</span>
    </div>${broker.fscsGroup ? `
    <div class="fscs-warning">⚠ FSCS group: This broker shares FSCS investment protection with other brands in the ${escapeHTML(broker.fscsGroup)} group. Combined limit of £85,000.</div>` : ''}
    <div class="overview-verified">Fee data last verified: ${formatVerifiedDate(broker.lastVerified)}</div>
  </div>

  <!-- Fee Schedule Table -->
  <div class="fee-table-card">
    <h2>Fee schedule</h2>
    <table class="fee-table">
      <tr><td>Platform fee</td><td>${escapeHTML(describePlatformFee(broker))}</td></tr>
      <tr><td>SIPP fee</td><td>${escapeHTML(describeSippFee(broker))}</td></tr>
      <tr><td>Fund trading</td><td>${formatTradeFee(broker.fundTrade)}</td></tr>
      <tr><td>ETF trading</td><td>${formatTradeFee(broker.etfTrade)}</td></tr>
      <tr><td>Share trading (UK)</td><td>${formatTradeFee(broker.shareTrade)}</td></tr>${broker.shareTradeGIA_UK !== undefined ? `
      <tr><td>Share trading (GIA)</td><td>£${broker.shareTradeGIA_UK}</td></tr>` : ''}
      <tr><td>Regular investing</td><td>${formatTradeFee(broker.regularInvesting)}</td></tr>
      <tr><td>FX rate</td><td>${formatFxRate(broker)}</td></tr>
      <tr><td>Entry/exit fees</td><td>${escapeHTML(broker.entryExit)}</td></tr>${broker.sippDrawdownFee !== null && broker.sippDrawdownFee !== undefined ? `
      <tr><td>Drawdown fee</td><td>${broker.sippDrawdownFee === 0 ? 'Free' : '£' + broker.sippDrawdownFee}</td></tr>` : ''}
      <tr><td>Cash interest</td><td>${escapeHTML(broker.cashInterest || 'Check with provider')}</td></tr>
    </table>
  </div>

  <!-- Pros & Cons -->
  <div class="pros-cons">
    <div class="pros-card">
      <h2>Pros</h2>
      ${prosHTML || '<p style="color:var(--text-muted);font-size:0.88rem">No specific pros listed.</p>'}
    </div>
    <div class="cons-card">
      <h2>Things to know</h2>
      ${warningsHTML || '<p style="color:var(--text-muted);font-size:0.88rem">No specific warnings.</p>'}
    </div>
  </div>

  <!-- Ratings -->
  <div class="ratings-card">
    <h2>Ratings</h2>
    ${ratingsHTML}
  </div>

  <!-- Notes -->
  ${broker.notes ? `<div class="notes-card">${escapeHTML(broker.notes)}</div>` : ''}

  <!-- CTAs -->
  <div class="broker-ctas">
    <a href="/compare/" class="broker-cta primary">See how ${escapeHTML(broker.name)} compares →</a>
    <a href="/calculator/#start=${CALC_DEFAULT_PORTFOLIO}&monthly=500&growth=7&fee=${calcFee}&ocf=0.15&years=20&broker=${encodeURIComponent(broker.name)}" class="broker-cta secondary">Calculate your long-term costs →</a>
  </div>

</div>

<footer class="site-footer">
  <div class="container">
    This site is for informational purposes only and is not financial advice.<br>
    Data sourced from Monevator broker comparison (Oct 2025 / Feb 2026 updates). Always verify current fees with your chosen provider.<br>
    Spot an error or missing broker? <a href="mailto:admin@brokerfinder.uk">admin@brokerfinder.uk</a>
  </div>
</footer>

<script src="/js/shared.js"></script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════
// BROKER INDEX PAGE
// ═══════════════════════════════════════════════════

function generateBrokerIndex(brokers) {
  const sorted = [...brokers].sort((a, b) => a.name.localeCompare(b.name));
  const cards = sorted.map(b => {
    const slug = slugify(b.name);
    return `  <a href="/broker/${slug}/" class="broker-index-card">
    <h3>${escapeHTML(b.name)}</h3>
    <span class="tag tag-accent" style="margin-bottom:0.5rem">${CATEGORY_LABELS[b.category] || b.category}</span>
    <p>${escapeHTML(b.notes || 'View fee breakdown and details.')}</p>
  </a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>All UK Brokers — BrokerFinder</title>
<meta name="description" content="Browse all UK investment platforms with detailed fee breakdowns, pros, cons, and ratings.">
<meta name="theme-color" content="#2ec4b6">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Serif+Display&display=swap" rel="stylesheet">
<link rel="canonical" href="https://brokerfinder.uk/broker/">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta property="og:title" content="All UK Brokers — BrokerFinder">
<meta property="og:description" content="Browse all UK investment platforms with detailed fee breakdowns, pros, cons, and ratings.">
<meta property="og:url" content="https://brokerfinder.uk/broker/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="BrokerFinder">
<meta name="twitter:card" content="summary">
<link rel="stylesheet" href="/css/style.css">
<style>
.broker-index-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
  max-width: 960px;
  margin: 0 auto 4rem;
  padding: 0 1.5rem;
}
.broker-index-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem 1.5rem;
  text-decoration: none;
  color: inherit;
  transition: var(--transition);
  display: flex;
  flex-direction: column;
}
.broker-index-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}
.broker-index-card h3 {
  font-family: var(--font-heading);
  font-size: 1.05rem;
  margin-bottom: 0.4rem;
}
.broker-index-card p {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 0;
  flex: 1;
}
</style>
</head>
<body>

<header class="site-header">
  <a href="/" class="logo">Broker<span>Finder</span></a>
  <button class="nav-toggle" id="navToggle" aria-label="Toggle navigation" aria-expanded="false">
    <span class="hamburger-line"></span>
    <span class="hamburger-line"></span>
    <span class="hamburger-line"></span>
  </button>
  <nav class="site-nav">
    <a href="/compare/">Compare</a>
    <a href="/check/">Quick Check</a>
    <a href="/calculator/">Calculator</a>
    <a href="/faq/">FAQ</a>
  </nav>
  <button class="btn-theme-toggle" id="themeToggle" aria-label="Toggle dark mode">🌙</button>
</header>
<noscript><p style="text-align:center;padding:2rem;color:#888;">This tool requires JavaScript. Please enable it in your browser.</p></noscript>

<section class="page-hero">
  <h1>All UK<br><em>Broker Profiles</em></h1>
  <p>Browse detailed fee breakdowns, ratings, and reviews for every UK investment platform we cover.</p>
</section>

<div class="broker-index-grid">
${cards}
</div>

<footer class="site-footer">
  <div class="container">
    This site is for informational purposes only and is not financial advice.<br>
    Data sourced from Monevator broker comparison (Oct 2025 / Feb 2026 updates). Always verify current fees with your chosen provider.<br>
    Spot an error or missing broker? <a href="mailto:admin@brokerfinder.uk">admin@brokerfinder.uk</a>
  </div>
</footer>

<script src="/js/shared.js"></script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════
// SITEMAP UPDATE
// ═══════════════════════════════════════════════════

function updateSitemap(brokers) {
  const staticPages = [
    { loc: 'https://brokerfinder.uk/', priority: '1.0' },
    { loc: 'https://brokerfinder.uk/compare/', priority: '0.9' },
    { loc: 'https://brokerfinder.uk/check/', priority: '0.8' },
    { loc: 'https://brokerfinder.uk/calculator/', priority: '0.7' },
    { loc: 'https://brokerfinder.uk/faq/', priority: '0.5' },
    { loc: 'https://brokerfinder.uk/broker/', priority: '0.6' },
  ];

  const brokerPages = brokers.map(b => ({
    loc: `https://brokerfinder.uk/broker/${slugify(b.name)}/`,
    priority: '0.5'
  }));

  const allPages = [...staticPages, ...brokerPages];

  const urls = allPages.map(p => `  <url>
    <loc>${p.loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

// ═══════════════════════════════════════════════════
// MAIN BUILD
// ═══════════════════════════════════════════════════

console.log(`Building broker pages for ${BROKERS.length} brokers...`);

// Create broker directory
const brokerDir = path.join(ROOT, 'broker');
if (!fs.existsSync(brokerDir)) fs.mkdirSync(brokerDir, { recursive: true });

// Generate individual broker pages
BROKERS.forEach(broker => {
  const slug = slugify(broker.name);
  const dir = path.join(brokerDir, slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const html = generateBrokerPage(broker);
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  console.log(`  ✓ /broker/${slug}/index.html`);
});

// Generate broker index page
const indexHTML = generateBrokerIndex(BROKERS);
fs.writeFileSync(path.join(brokerDir, 'index.html'), indexHTML);
console.log(`  ✓ /broker/index.html (index of all brokers)`);

// Update sitemap
const sitemapContent = updateSitemap(BROKERS);
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemapContent);
console.log(`  ✓ sitemap.xml updated with ${BROKERS.length} broker pages`);

console.log(`\nDone! Generated ${BROKERS.length} broker pages + index page.`);
