// ═══════════════════════════════════════════════════
// QUICK CHECK — "Am I Overpaying?"
// ═══════════════════════════════════════════════════

let CHECK_BROKERS = [];

// Compound savings projection constants
const COMPOUND_YEARS = 20;
const COMPOUND_GROWTH_RATE = 0.07;

// Default assumptions for quick check
const CHECK_DEFAULTS = {
  accounts: ['isa'],
  investmentTypes: ['etfs'],
  tradingFreq: 'monthly',
  fxTrading: 'rarely',
  drawdownSoon: 'no'
};

async function loadCheckBrokers() {
  const btnCheck = document.getElementById('btnCheck');
  if (btnCheck) btnCheck.disabled = true;
  try {
    const response = await fetch('/data/brokers.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    CHECK_BROKERS = await response.json();
    populateBrokerDropdown();
    if (btnCheck) {
      btnCheck.disabled = false;
      btnCheck.textContent = 'Check now';
    }
  } catch (err) {
    console.error('Failed to load broker data:', err);
    const select = document.getElementById('checkBroker');
    select.innerHTML = '<option value="">Failed to load — please refresh</option>';
    // Show visible error banner in results area
    const resultCurrent = document.getElementById('resultCurrent');
    if (resultCurrent) {
      document.getElementById('checkResults').style.display = 'block';
      resultCurrent.innerHTML = '<p style="color:var(--red);text-align:center">Could not load broker data. Please check your connection and try again.</p>';
      document.getElementById('resultRank').style.display = 'none';
      document.getElementById('resultSavings').style.display = 'none';
      document.getElementById('checkCtas').innerHTML = '';
    }
    if (btnCheck) {
      btnCheck.disabled = false;
      btnCheck.textContent = 'Retry';
    }
  }
}

function populateBrokerDropdown() {
  const select = document.getElementById('checkBroker');
  const sorted = [...CHECK_BROKERS].sort((a, b) => a.name.localeCompare(b.name));
  let html = '<option value="other">Other / I don\'t know</option>';
  sorted.forEach(b => {
    html += `<option value="${brokerSlug(b.name)}">${escapeHTML(b.name)}</option>`;
  });
  select.innerHTML = html;

  // Restore from URL hash if present
  restoreFromURL();
}

function getSelectedBroker() {
  const val = document.getElementById('checkBroker').value;
  if (val === 'other' || val === '') return null;
  return CHECK_BROKERS.find(b => brokerSlug(b.name) === val) || null;
}

function getPortfolioValue() {
  return Math.max(0, parseInt(document.getElementById('checkPortfolio').value, 10) || 0);
}

function calculateAllCosts(portfolioValue) {
  const userAnswers = {
    ...CHECK_DEFAULTS,
    portfolioSize: portfolioValue
  };

  return CHECK_BROKERS
    .filter(b => {
      // Must support ISA and ETFs at minimum
      return b.accounts.includes('isa') && b.investmentTypes.includes('etf');
    })
    .map(b => ({
      broker: b,
      cost: calculateCost(b, portfolioValue, userAnswers)
    }))
    .sort((a, b) => a.cost.totalCost - b.cost.totalCost);
}

function calculateCompoundSavings(annualSaving, years, growthRate) {
  // Future value of annual savings invested at growthRate
  let total = 0;
  for (let y = 0; y < years; y++) {
    total = (total + annualSaving) * (1 + growthRate);
  }
  return total;
}

function runCheck() {
  if (CHECK_BROKERS.length === 0) {
    loadCheckBrokers();
    return;
  }
  const selectedBroker = getSelectedBroker();
  const portfolioValue = getPortfolioValue();

  if (portfolioValue <= 0) {
    showToast('Please enter a portfolio value greater than zero.');
    return;
  }

  const allCosts = calculateAllCosts(portfolioValue);
  if (allCosts.length === 0) return;

  const pvLabel = portfolioValue >= 1000
    ? '£' + Math.round(portfolioValue).toLocaleString('en-GB')
    : '£' + portfolioValue;

  const isOther = !selectedBroker;
  const resultCurrent = document.getElementById('resultCurrent');
  const resultRank = document.getElementById('resultRank');
  const resultSavings = document.getElementById('resultSavings');
  const checkCtas = document.getElementById('checkCtas');

  if (!isOther) {
    // Find user's current broker cost
    const currentEntry = allCosts.find(e => e.broker.name === selectedBroker.name);
    if (!currentEntry) {
      resultCurrent.innerHTML = `<p style="color:var(--text-secondary)">${escapeHTML(selectedBroker.name)} doesn't match the default criteria (ISA + ETFs). <a href="/compare/" style="color:var(--accent)">Try the full comparison</a> for a personalised result.</p>`;
      resultRank.style.display = 'none';
      resultSavings.style.display = 'none';
      checkCtas.innerHTML = '';
      document.getElementById('checkResults').style.display = 'block';
      updateURL();
      return;
    }

    const currentCost = currentEntry.cost.totalCost;
    const costPct = portfolioValue > 0 ? ((currentCost / portfolioValue) * 100).toFixed(2) : '0';

    resultCurrent.innerHTML = `
      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.5rem">Your estimated annual cost with ${escapeHTML(selectedBroker.name)}</p>
      <div class="cost-big">${formatCurrency(currentCost)}/year</div>
      <div class="cost-pct">${costPct}% of your portfolio</div>
    `;

    // Rank
    const rank = allCosts.findIndex(e => e.broker.name === selectedBroker.name) + 1;
    const total = allCosts.length;
    const cheaperCount = rank - 1;
    const rankPct = (rank / total) * 100;
    const barClass = rankPct <= 33 ? 'good' : rankPct <= 66 ? 'ok' : 'bad';

    const cheapest3 = allCosts.slice(0, 3).filter(e => e.broker.name !== selectedBroker.name);
    // If selected broker is in top 3, show the first 3 that aren't the selected broker
    const alternatives = cheapest3.length < 3
      ? allCosts.filter(e => e.broker.name !== selectedBroker.name).slice(0, 3)
      : cheapest3;

    resultRank.style.display = 'block';
    const rankMessage = cheaperCount === 0
      ? `<p>You have the <strong>cheapest option</strong> among ${total} eligible brokers!</p>`
      : `<p>You're paying more than <strong>${cheaperCount}</strong> out of <strong>${total}</strong> eligible brokers.</p>`;
    resultRank.innerHTML = `
      ${rankMessage}
      <div class="rank-bar"><div class="rank-bar-fill ${barClass}" style="width:${rankPct}%"></div></div>
      <span class="sr-only">${rankPct <= 33 ? 'Good value' : rankPct <= 66 ? 'Average value' : 'Expensive'}</span>
      ${alternatives.length > 0 ? `
      <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:0.5rem">Cheapest alternatives:</p>
      <ul class="cheapest-list">
        ${alternatives.map(e => `
          <li class="cheapest-item">
            <span class="cheapest-name"><a href="/broker/${brokerSlug(e.broker.name)}/">${escapeHTML(e.broker.name)}</a></span>
            <span class="cheapest-cost">${formatCurrency(e.cost.totalCost)}/yr</span>
          </li>
        `).join('')}
      </ul>` : ''}
    `;

    // Savings
    const cheapestCost = allCosts[0].cost.totalCost;
    const annualSaving = currentCost - cheapestCost;
    if (annualSaving > 0) {
      const compoundSavings = calculateCompoundSavings(annualSaving, COMPOUND_YEARS, COMPOUND_GROWTH_RATE);
      resultSavings.style.display = 'block';
      resultSavings.innerHTML = `
        <p style="font-size:0.85rem;color:var(--text-secondary);margin:0 0 0.25rem">Switching to ${escapeHTML(allCosts[0].broker.name)} could save you</p>
        <div class="savings-big">${formatCurrency(Math.round(annualSaving))}/year</div>
        <p>Over ${COMPOUND_YEARS} years at ${COMPOUND_GROWTH_RATE * 100}% growth, that's <strong>${formatCurrency(Math.round(compoundSavings))}</strong> in extra returns</p>
      `;
    } else {
      resultSavings.style.display = 'none';
    }

    // CTAs
    checkCtas.innerHTML = `
      <a href="/compare/#accounts=isa&investmentTypes=etfs&balances=${encodeURIComponent(JSON.stringify({isa: portfolioValue}))}&tradingFreq=monthly&fxTrading=rarely" class="check-cta primary">Get a personalised comparison →</a>
      <a href="/broker/${brokerSlug(selectedBroker.name)}/" class="check-cta secondary">See full ${escapeHTML(selectedBroker.name)} breakdown →</a>
    `;
  } else {
    // "Other / I don't know"
    resultCurrent.innerHTML = `
      <p style="font-size:0.92rem;color:var(--text-secondary)">Here are the cheapest brokers for a <strong>${pvLabel}</strong> portfolio</p>
      <p style="font-size:0.78rem;color:var(--text-muted)">Assumes: ISA, ETFs, monthly regular investing</p>
    `;

    const cheapest3 = allCosts.slice(0, 3);
    resultRank.style.display = 'block';
    resultRank.innerHTML = `
      <ul class="cheapest-list">
        ${cheapest3.map((e, i) => `
          <li class="cheapest-item">
            <span class="cheapest-name"><strong>${i + 1}.</strong> <a href="/broker/${brokerSlug(e.broker.name)}/">${escapeHTML(e.broker.name)}</a></span>
            <span class="cheapest-cost">${formatCurrency(e.cost.totalCost)}/yr</span>
          </li>
        `).join('')}
      </ul>
    `;

    resultSavings.style.display = 'none';

    checkCtas.innerHTML = `
      <a href="/compare/#accounts=isa&investmentTypes=etfs&balances=${encodeURIComponent(JSON.stringify({isa: portfolioValue}))}&tradingFreq=monthly&fxTrading=rarely" class="check-cta primary">Get a full comparison →</a>
    `;
  }

  document.getElementById('checkResults').style.display = 'block';
  updateURL();
}

// URL sharing
function updateURL() {
  const broker = document.getElementById('checkBroker').value;
  const portfolio = getPortfolioValue();
  const params = new URLSearchParams();
  if (broker) params.set('broker', broker);
  if (portfolio) params.set('portfolio', portfolio);
  history.replaceState(null, '', '#' + params.toString());
}

function restoreFromURL() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  const params = new URLSearchParams(hash);
  if (params.has('broker')) {
    document.getElementById('checkBroker').value = params.get('broker');
  }
  if (params.has('portfolio')) {
    document.getElementById('checkPortfolio').value = params.get('portfolio');
    highlightQuickAmount(parseInt(params.get('portfolio'), 10));
  }
  // Auto-run if both params present
  if (params.has('broker') && params.has('portfolio')) {
    setTimeout(runCheck, 100);
  }
}

function highlightQuickAmount(val) {
  document.querySelectorAll('.quick-amount').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.value, 10) === val);
  });
}

// Initialise
document.addEventListener('DOMContentLoaded', () => {
  loadCheckBrokers();

  document.getElementById('btnCheck').addEventListener('click', runCheck);

  // Quick amount buttons
  document.querySelectorAll('.quick-amount').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('checkPortfolio').value = btn.dataset.value;
      highlightQuickAmount(parseInt(btn.dataset.value, 10));
    });
  });

  // Enter key triggers check
  document.getElementById('checkPortfolio').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runCheck();
  });
});
