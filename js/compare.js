// ═══════════════════════════════════════════════════
// BROKER COMPARISON TOOL
// (fee-engine.js provides: calculatePlatformFee, calculateTieredFee, calculateCost, brokerSlug)
// ═══════════════════════════════════════════════════

let BROKERS = [];
let dataState = 'loading'; // 'loading' | 'loaded' | 'failed'

// ═══════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════
async function loadBrokers() {
  dataState = 'loading';
  updateStartButton();
  try {
    const response = await fetch('/data/brokers.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Invalid broker data format');
    BROKERS = data;
    dataState = 'loaded';
  } catch (err) {
    console.error('Failed to load broker data:', err);
    dataState = 'failed';
  }
  updateStartButton();
}

function updateStartButton() {
  const btn = document.getElementById('btnStart');
  if (!btn) return;
  if (dataState === 'loading') {
    btn.disabled = true;
    btn.innerHTML = 'Loading brokers\u2026';
  } else if (dataState === 'failed') {
    btn.disabled = false;
    btn.innerHTML = 'Retry loading <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>';
  } else {
    btn.disabled = false;
    btn.innerHTML = 'Get started <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
  }
}

// ═══════════════════════════════════════════════════
// WIZARD QUESTIONS
// ═══════════════════════════════════════════════════
const QUESTIONS = [
  {
    id: 'accounts',
    title: 'What account type(s) do you need?',
    desc: 'Select all that apply.',
    multi: true,
    options: [
      {value:'isa', label:'Stocks & Shares ISA'},
      {value:'sipp', label:'SIPP (pension)'},
      {value:'gia', label:'General Investment Account (GIA)'},
      {value:'jisa', label:'JISA (Junior ISA)'},
      {value:'lisa', label:'LISA (Lifetime ISA)'}
    ]
  },
  {
    id: 'investmentTypes',
    title: 'What do you want to invest in?',
    desc: 'Select all that apply.',
    multi: true,
    options: [
      {value:'funds', label:'Index funds / OEICs', detail:'Mutual funds, typically via regular investing'},
      {value:'etfs', label:'ETFs', detail:'Exchange-traded funds, bought like shares'},
      {value:'sharesUK', label:'Individual shares (UK)'},
      {value:'sharesIntl', label:'Individual shares (International)'},
      {value:'bonds', label:'Bonds / Gilts'}
    ]
  },
  {
    id: 'assetSplit',
    title: 'How is your portfolio split?',
    desc: 'This affects your platform fee — many brokers charge differently for funds vs ETFs and shares.',
    multi: false,
    conditional: (answers) => {
      const types = answers.investmentTypes || [];
      const hasFunds = types.includes('funds');
      const hasETFsOrShares = types.includes('etfs') || types.includes('sharesUK') || types.includes('sharesIntl');
      return hasFunds && hasETFsOrShares;
    },
    options: [
      {value: 100, label: 'All funds (100% funds)', detail: 'No ETFs or individual shares'},
      {value: 75, label: 'Mostly funds (~75% funds, ~25% ETFs/shares)'},
      {value: 50, label: 'Roughly even split (~50/50)'},
      {value: 25, label: 'Mostly ETFs/shares (~25% funds, ~75% ETFs/shares)'},
      {value: 0, label: 'All ETFs/shares (0% funds)', detail: 'No traditional funds'}
    ]
  },
  {
    id: 'portfolioSize',
    title: 'How large is your portfolio?',
    desc: 'Or your expected portfolio. This is the biggest factor in your costs.',
    multi: false,
    options: [
      {value:5000, label:'Under \u00a310,000', detail:'Just getting started'},
      {value:30000, label:'\u00a310,000 \u2013 \u00a350,000'},
      {value:75000, label:'\u00a350,000 \u2013 \u00a3100,000'},
      {value:175000, label:'\u00a3100,000 \u2013 \u00a3250,000'},
      {value:375000, label:'\u00a3250,000 \u2013 \u00a3500,000'},
      {value:750000, label:'Over \u00a3500,000'}
    ]
  },
  {
    id: 'tradingFreq',
    title: 'How often do you trade?',
    desc: 'Trading costs add up. Regular investing is usually cheapest.',
    multi: false,
    options: [
      {value:'setForget', label:'Set and forget', detail:'1\u20132 trades per year'},
      {value:'monthly', label:'Monthly regular investor', detail:'12 buys per year via standing order'},
      {value:'occasional', label:'Occasional', detail:'6\u201312 trades per year'},
      {value:'active', label:'Active', detail:'24+ trades per year'}
    ]
  },
  {
    id: 'fxTrading',
    title: 'Do you trade in non-GBP currencies?',
    desc: 'For example, US shares or international ETFs requiring FX conversion.',
    multi: false,
    options: [
      {value:'rarely', label:'No / Rarely'},
      {value:'sometimes', label:'Sometimes'},
      {value:'frequently', label:'Frequently'}
    ]
  },
  {
    id: 'priorities',
    title: 'What matters most to you?',
    desc: 'Select up to 3 priorities. We\'ll weight recommendations accordingly.',
    multi: true,
    maxSelect: 3,
    options: [
      {value:'lowestFees', label:'Lowest fees'},
      {value:'customerService', label:'Customer service / reputation'},
      {value:'wideRange', label:'Wide investment range'},
      {value:'easyToUse', label:'Easy-to-use app / website'},
      {value:'fscs', label:'FSCS protection comfort', detail:'Prefer established, well-capitalised brokers'},
      {value:'drawdown', label:'Drawdown / decumulation features', detail:'For SIPP drawdown in retirement'}
    ]
  },
  {
    id: 'feeModel',
    title: 'Do you have a preference for how your broker charges?',
    desc: 'This filters which types of brokers we recommend. Not sure? Pick "No preference".',
    multi: false,
    options: [
      {value:'noPreference', label:'No preference', detail:'Show me the cheapest option regardless'},
      {value:'zeroFee', label:'Zero / commission-free brokers', detail:'They earn from spreads, FX fees, and other services'},
      {value:'flatFee', label:'Flat fee brokers', detail:'Fixed annual charge regardless of portfolio size \u2014 better for larger portfolios'},
      {value:'percentageFee', label:'Percentage fee brokers', detail:'Fee scales with your portfolio \u2014 better for smaller portfolios'},
      {value:'directFee', label:'Established direct-fee brokers only', detail:'I want to pay transparent fees to well-established providers'}
    ]
  },
  {
    id: 'drawdownSoon',
    title: 'Will you need SIPP drawdown soon?',
    desc: 'This affects which platforms are suitable for you.',
    multi: false,
    conditional: (answers) => answers.accounts && answers.accounts.includes('sipp'),
    options: [
      {value:'yes', label:'Yes, within 5 years'},
      {value:'no', label:'No, still accumulating'}
    ]
  }
];

// ═══════════════════════════════════════════════════
// APP STATE
// ═══════════════════════════════════════════════════
let currentStep = 0;
let answers = {};
let rankedBrokers = [];
let showingAll = false;
let compareSet = new Set();

// ═══════════════════════════════════════════════════
// WIZARD LOGIC
// ═══════════════════════════════════════════════════
function startWizard() {
  if (dataState === 'failed') {
    loadBrokers();
    return;
  }
  if (dataState === 'loading' || BROKERS.length === 0) {
    return;
  }
  document.getElementById('hero').style.display = 'none';
  document.getElementById('wizard').classList.add('active');
  document.getElementById('results').classList.remove('active');
  document.getElementById('comparison').classList.remove('active');
  currentStep = 0;
  answers = {};
  renderStep();
}

function changeAnswers() {
  document.getElementById('results').classList.remove('active');
  document.getElementById('comparison').classList.remove('active');
  document.getElementById('wizard').classList.add('active');
  currentStep = 0;
  showingAll = false;
  compareSet.clear();
  updateCompareButton();
  history.replaceState(null, '', window.location.pathname);
  renderStep();
}

function getVisibleQuestions() {
  return QUESTIONS.filter(q => !q.conditional || q.conditional(answers));
}

function renderStep() {
  const visible = getVisibleQuestions();
  const total = visible.length;
  const q = visible[currentStep];
  if (!q) return;

  // Progress dots
  let progressHTML = '';
  for (let i = 0; i < total; i++) {
    if (i > 0) progressHTML += `<div class="progress-line ${i <= currentStep ? 'done' : ''}"></div>`;
    progressHTML += `<div class="progress-dot ${i === currentStep ? 'active' : i < currentStep ? 'done' : ''}"></div>`;
  }
  document.getElementById('wizardProgress').innerHTML = progressHTML;

  // Step content — dynamic label
  const stepLabel = `Step ${currentStep + 1} of ${total}`;
  const selected = answers[q.id] || (q.multi ? [] : null);
  let optionsHTML = q.options.map(opt => {
    const isSelected = q.multi ? (selected && selected.includes(opt.value)) : selected === opt.value;
    return `
      <button class="option-btn ${q.multi ? 'multi' : ''} ${isSelected ? 'selected' : ''}"
              data-qid="${q.id}" data-value="${opt.value}" data-type="${typeof opt.value}" data-multi="${q.multi}" data-max="${q.maxSelect || 99}"
              aria-checked="${isSelected}"
              role="${q.multi ? 'checkbox' : 'radio'}">
        <span class="check-indicator"></span>
        <span>
          ${opt.label}
          ${opt.detail ? `<span class="option-detail">${opt.detail}</span>` : ''}
        </span>
      </button>
    `;
  }).join('');

  // Multi-select counter
  let counterHTML = '';
  if (q.multi && q.maxSelect) {
    const count = (selected && selected.length) || 0;
    counterHTML = `<span class="selection-counter">${count} of ${q.maxSelect} selected</span>`;
  }

  const stepsContainer = document.getElementById('wizardSteps');
  stepsContainer.innerHTML = `
    <div class="wizard-step active" role="group" aria-labelledby="step-title-${currentStep}">
      <div class="step-card">
        <div class="step-label">${stepLabel}</div>
        <h2 id="step-title-${currentStep}">${q.title}</h2>
        <p class="step-desc">${q.desc}</p>
        ${counterHTML}
        <div class="options-grid" role="${q.multi ? 'group' : 'radiogroup'}" aria-label="${q.title}">
          ${optionsHTML}
        </div>
      </div>
    </div>
  `;

  // Nav buttons
  document.getElementById('btnPrev').style.visibility = currentStep === 0 ? 'hidden' : 'visible';
  const isLast = currentStep === total - 1;
  const btnNext = document.getElementById('btnNext');
  btnNext.innerHTML = isLast ? 'See results <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' : 'Next <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

  const hasAnswer = q.multi ? (selected && selected.length > 0) : selected !== null && selected !== undefined;
  btnNext.disabled = !hasAnswer;
}

function selectOption(qId, value, multi, maxSelect) {
  if (multi) {
    if (!answers[qId]) answers[qId] = [];
    const idx = answers[qId].indexOf(value);
    if (idx > -1) {
      answers[qId].splice(idx, 1);
    } else {
      if (answers[qId].length < maxSelect) {
        answers[qId].push(value);
      }
    }
  } else {
    answers[qId] = value;
  }
  renderStep();
  // Apply pulse animation for visual feedback (no auto-advance)
  if (!multi) {
    const selectedBtn = document.querySelector('.option-btn.selected');
    if (selectedBtn) selectedBtn.classList.add('just-selected');
  }
}

function nextStep() {
  const visible = getVisibleQuestions();
  // Clamp to valid range in case visibility changed
  if (currentStep >= visible.length) currentStep = visible.length - 1;
  if (currentStep < visible.length - 1) {
    currentStep++;
    renderStep();
  } else {
    showResults();
  }
}

function prevStep() {
  if (currentStep > 0) {
    currentStep--;
    const visible = getVisibleQuestions();
    if (currentStep >= visible.length) currentStep = visible.length - 1;
    renderStep();
  }
}

// ═══════════════════════════════════════════════════
// DATE FORMATTING
// ═══════════════════════════════════════════════════
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
// ELIGIBILITY & SCORING
// ═══════════════════════════════════════════════════
function checkEligibility(broker, userAnswers) {
  const accounts = userAnswers.accounts || ['isa'];
  const needsSIPP = accounts.includes('sipp');
  const needsJISA = accounts.includes('jisa');
  const needsLISA = accounts.includes('lisa');
  const needsDrawdown = needsSIPP && userAnswers.drawdownSoon === 'yes';

  const warnings = [];
  let eligible = true;

  // Account type checks
  if (needsSIPP && !broker.hasSIPP) {
    warnings.push('No SIPP available');
    eligible = false;
  }
  if (needsJISA && !broker.accounts.includes('jisa')) {
    warnings.push('No JISA available');
    eligible = false;
  }
  if (needsLISA && !broker.accounts.includes('lisa')) {
    warnings.push('No LISA available');
    eligible = false;
  }
  if (needsDrawdown && !broker.hasDrawdown) {
    warnings.push('No SIPP drawdown available');
  }

  // Investment type checks
  const invTypes = userAnswers.investmentTypes || ['etfs'];
  const buyingFunds = invTypes.includes('funds');
  const buyingETFs = invTypes.includes('etfs');
  const buyingShares = invTypes.includes('sharesUK') || invTypes.includes('sharesIntl');
  const buyingBonds = invTypes.includes('bonds');

  if (buyingFunds && broker.fundTrade === null && !broker.investmentTypes.includes('fund')) {
    eligible = false;
    warnings.push('No funds available');
  }
  if (buyingShares && broker.shareTrade === null && !broker.investmentTypes.includes('shareUK') && !broker.investmentTypes.includes('shareIntl')) {
    eligible = false;
    warnings.push('No individual shares');
  }
  if (buyingBonds && !broker.investmentTypes.includes('bond')) {
    eligible = false;
    warnings.push('No bonds/gilts available');
  }
  if (buyingETFs && broker.etfTrade === null && !broker.investmentTypes.includes('etf')) {
    eligible = false;
    warnings.push('No ETFs available');
  }

  // GIA-only check
  if (accounts.length === 1 && accounts[0] === 'gia' && !broker.accounts.includes('gia')) {
    eligible = false;
  }

  return { eligible, warnings };
}

function scoreBroker(broker, costResult, userAnswers) {
  const priorities = userAnswers.priorities || ['lowestFees'];
  let score = 0;

  // Priority bonuses — use ratings object
  const ratings = broker.ratings || {};
  if (priorities.includes('customerService')) score += (ratings.customerService || 0) * 8;
  if (priorities.includes('wideRange')) score += (ratings.investmentRange || 0) * 8;
  if (priorities.includes('easyToUse')) score += (ratings.easeOfUse || 0) * 8;
  if (priorities.includes('fscs')) score += (ratings.established || 0) * 8;
  if (priorities.includes('drawdown') && broker.hasDrawdown) score += 20;

  // Fee model preference scoring
  const feeModel = userAnswers.feeModel || 'noPreference';

  if (feeModel === 'zeroFee') {
    if (broker.tags.zeroFees) score += 40;
    else score -= 15;
  }
  if (feeModel === 'flatFee') {
    if (broker.category === 'flat' && !broker.tags.zeroFees) score += 35;
    else if (broker.category === 'flat' && broker.tags.zeroFees) score += 15;
    else score -= 10;
  }
  if (feeModel === 'percentageFee') {
    if (broker.category === 'percentage') score += 35;
    else score -= 10;
  }
  if (feeModel === 'directFee') {
    if (ratings.established >= 4 && !broker.tags.zeroFees) score += 40;
    else if (broker.tags.zeroFees) score -= 20;
    else if (broker.category === 'trading') score -= 15;
  }

  return score;
}

function buildCalcLink(broker, costResult, userAnswers) {
  const pv = userAnswers.portfolioSize || 30000;
  const feePercent = pv > 0 ? ((costResult.totalCost / pv) * 100).toFixed(2) : 0;
  const params = new URLSearchParams({
    start: pv,
    monthly: 500,
    growth: 7,
    fee: feePercent,
    ocf: 0.15,
    years: 20,
    broker: broker.name
  });
  return `/calculator/#${params.toString()}`;
}

function getRecommendationReason(broker, costResult, userAnswers) {
  const pv = userAnswers.portfolioSize;
  const invTypes = userAnswers.investmentTypes || ['etfs'];
  const reasons = [];
  const ratings = broker.ratings || {};

  if (costResult.totalCost === 0) reasons.push('zero total fees');
  else if (costResult.platformFee === 0) reasons.push('zero platform fee');

  if (pv >= 100000 && broker.category === 'flat') reasons.push('flat fee saves money on larger portfolios');
  if (pv < 25000 && broker.category === 'percentage') reasons.push('percentage fee is low on smaller portfolios');

  if (invTypes.includes('funds') && broker.fundTrade === 0) reasons.push('free fund trading');
  if (invTypes.includes('etfs') && broker.etfTrade === 0) reasons.push('free ETF trading');
  if (ratings.customerService >= 5) reasons.push('top-rated customer service');
  if (ratings.investmentRange >= 5) reasons.push('widest investment range');

  if (reasons.length === 0) reasons.push('competitive overall costs');

  const pvLabel = pv >= 1000 ? `\u00a3${(pv/1000).toFixed(0)}k` : `\u00a3${pv}`;
  return `Best for you because: ${reasons.slice(0, 2).join(' and ')} on your ${pvLabel} portfolio`;
}

// ═══════════════════════════════════════════════════
// RESULTS RENDERING
// ═══════════════════════════════════════════════════
function recalculateAndRender(userAnswers) {
  const pv = userAnswers.portfolioSize;

  // FSCS notice
  document.getElementById('fscsNotice').style.display = pv >= 85000 ? 'flex' : 'none';

  // Calculate and rank
  rankedBrokers = [];
  BROKERS.forEach(broker => {
    const { eligible, warnings: eligWarnings } = checkEligibility(broker, userAnswers);
    const costResult = calculateCost(broker, pv, userAnswers);
    const priorityScore = scoreBroker(broker, costResult, userAnswers);
    const reason = getRecommendationReason(broker, costResult, userAnswers);

    rankedBrokers.push({
      broker,
      costResult,
      eligible,
      eligWarnings,
      priorityScore,
      reason
    });
  });

  // Blended scoring: normalize cost and priority, then blend
  const eligibleBrokers = rankedBrokers.filter(b => b.eligible);
  const maxCost = Math.max(...eligibleBrokers.map(b => b.costResult.totalCost), 1);
  const maxPriorityScore = Math.max(...eligibleBrokers.map(b => b.priorityScore), 1);
  const hasLowestFees = (userAnswers.priorities || []).includes('lowestFees');
  const costWeight = hasLowestFees ? 0.8 : 0.55;
  const priorityWeight = 1 - costWeight;

  rankedBrokers.forEach(b => {
    const costScore = 100 * (1 - b.costResult.totalCost / maxCost);
    const normalizedPriority = Math.max(0, 100 * (b.priorityScore / maxPriorityScore));
    b.blendedScore = costScore * costWeight + normalizedPriority * priorityWeight;
  });

  // Sort: eligible first, then by blended score (highest first)
  rankedBrokers.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return b.blendedScore - a.blendedScore;
  });

  // Summary
  const invTypeLabels = {
    funds: 'index funds', etfs: 'ETFs', sharesUK: 'UK shares',
    sharesIntl: 'international shares', bonds: 'bonds/gilts'
  };
  const invTypes = userAnswers.investmentTypes || ['etfs'];
  const invLabel = invTypes.map(t => invTypeLabels[t] || t).join(', ').replace(/, ([^,]*)$/, ' and $1');
  const pvLabel = pv >= 1000 ? `\u00a3${(pv/1000).toFixed(0)}k` : `\u00a3${pv}`;
  document.getElementById('resultsSummary').textContent = `Based on a ${pvLabel} portfolio investing in ${invLabel}`;

  // Render cards
  const ineligibleBrokers = rankedBrokers.filter(b => !b.eligible);
  const initialShow = 5;

  if (eligibleBrokers.length === 0) {
    document.getElementById('brokerList').innerHTML = `
      <div class="no-results">
        <h3>No brokers match your criteria</h3>
        <p>Try adjusting your account types or investment preferences.</p>
        <button class="btn-action" onclick="changeAnswers()">Change my answers</button>
      </div>
    `;
    const showAllBtn = document.getElementById('showAllBtn');
    if (showAllBtn) showAllBtn.style.display = 'none';
    return;
  }

  renderBrokerCards(eligibleBrokers, ineligibleBrokers, initialShow, maxCost);
  animateCostBars();
}

function showResults() {
  document.getElementById('wizard').classList.remove('active');
  document.getElementById('hero').style.display = 'none';
  document.getElementById('results').classList.add('active');

  recalculateAndRender(answers);

  // What-if slider — initialise and bind handler
  const slider = document.getElementById('whatifSlider');
  slider.value = answers.portfolioSize;
  document.getElementById('whatifValue').textContent = formatCurrency(answers.portfolioSize);
  let sliderTimeout;
  slider.oninput = function() {
    const val = parseInt(this.value);
    document.getElementById('whatifValue').textContent = formatCurrency(val);
    clearTimeout(sliderTimeout);
    sliderTimeout = setTimeout(() => {
      // Capture expanded card state before re-render
      const expandedIds = new Set();
      document.querySelectorAll('.card-details.open').forEach(el => expandedIds.add(el.id));

      const modifiedAnswers = { ...answers, portfolioSize: val };
      recalculateAndRender(modifiedAnswers);

      // Restore expanded cards
      expandedIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.classList.add('open');
          const header = el.closest('.broker-card').querySelector('.card-header');
          if (header) header.setAttribute('aria-expanded', 'true');
        }
      });

      // Update URL with slider value
      const savedPortfolio = answers.portfolioSize;
      answers.portfolioSize = val;
      encodeAnswersToURL();
      answers.portfolioSize = savedPortfolio;
    }, 150);
  };

  // Encode answers to URL for sharing
  encodeAnswersToURL();

  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Move focus to results heading for screen reader users
  const resultsHeading = document.querySelector('#results h2');
  if (resultsHeading) {
    resultsHeading.setAttribute('tabindex', '-1');
    resultsHeading.focus({ preventScroll: true });
  }
}

function renderBrokerCards(eligible, ineligible, initialShow, maxCost) {
  const list = document.getElementById('brokerList');
  let html = '';

  const toShow = showingAll ? eligible : eligible.slice(0, initialShow);

  toShow.forEach((item, idx) => {
    html += renderBrokerCard(item, idx + 1, maxCost);
  });

  // Ineligible brokers section
  if (ineligible.length > 0) {
    html += `
      <div class="ineligible-section">
        <button class="ineligible-toggle" aria-expanded="false">
          <span id="ineligibleToggleText">${ineligible.length} broker${ineligible.length > 1 ? 's' : ''} excluded</span>
          <svg class="ineligible-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="ineligible-list" id="ineligibleList" style="display:none">
          ${ineligible.map(item => renderIneligibleCard(item)).join('')}
        </div>
      </div>
    `;
  }

  list.innerHTML = html;

  // Show/hide "show all" button
  const showAllBtn = document.getElementById('showAllBtn');
  if (showAllBtn) {
    if (eligible.length > initialShow && !showingAll) {
      showAllBtn.style.display = 'block';
      showAllBtn.textContent = `Show all ${eligible.length} eligible brokers`;
    } else {
      showAllBtn.style.display = 'none';
    }
  }

  // Update compare button
  updateCompareButton();
}

function renderIneligibleCard(item) {
  const { broker, eligWarnings } = item;
  const reasons = eligWarnings.length > 0 ? eligWarnings.join(', ') : 'Does not match your criteria';
  return `
    <div class="broker-card ineligible">
      <div class="card-header" style="cursor:default; opacity:0.6;">
        <div class="card-info">
          <h3>${escapeHTML(broker.name)}</h3>
          <span class="broker-reason" style="color:var(--red)">${escapeHTML(reasons)}</span>
        </div>
      </div>
    </div>
  `;
}

function toggleIneligible() {
  const list = document.getElementById('ineligibleList');
  const btn = list.previousElementSibling;
  const isHidden = list.style.display === 'none';
  list.style.display = isHidden ? 'block' : 'none';
  btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  btn.querySelector('.ineligible-chevron').style.transform = isHidden ? 'rotate(180deg)' : '';
}

function renderBrokerCard(item, rank, maxCost) {
  const { broker, costResult, reason, eligWarnings } = item;
  const isTopPick = rank <= 3;
  const costPercent = maxCost > 0 ? Math.max((costResult.totalCost / maxCost) * 100, 1) : 1;
  const ratings = broker.ratings || {};

  // Tags
  let tagsHTML = '';
  if (costResult.totalCost === 0) tagsHTML += '<span class="tag tag-green">Zero fees</span>';
  if (broker.tags.bestService) tagsHTML += '<span class="tag tag-accent">Great service</span>';
  if (broker.tags.wideRange) tagsHTML += '<span class="tag tag-accent">Wide range</span>';
  if (broker.tags.established) tagsHTML += '<span class="tag tag-accent">Established</span>';
  if (broker.tags.bestInternational) tagsHTML += '<span class="tag tag-accent">Best international</span>';
  if (broker.tags.easyToUse) tagsHTML += '<span class="tag tag-accent">Easy to use</span>';
  if (broker.tags.zeroFees && costResult.totalCost > 0) tagsHTML += '<span class="tag tag-green">Low fees</span>';
  if (broker.restricted) tagsHTML += '<span class="tag tag-amber">Restricted list</span>';
  if (broker.category === 'flat' && answers.portfolioSize >= 100000) tagsHTML += '<span class="tag tag-green">Flat fee advantage</span>';

  // Fee model match tag
  const feeModel = answers.feeModel || 'noPreference';
  if (feeModel !== 'noPreference') {
    const isMatch = (
      (feeModel === 'zeroFee' && broker.tags.zeroFees) ||
      (feeModel === 'flatFee' && broker.category === 'flat' && !broker.tags.zeroFees) ||
      (feeModel === 'percentageFee' && broker.category === 'percentage') ||
      (feeModel === 'directFee' && ratings.established >= 4 && !broker.tags.zeroFees)
    );
    if (isMatch) tagsHTML += '<span class="tag tag-green">Matches your fee preference</span>';
  }

  // Warnings
  let warningsHTML = '';
  const allWarnings = [...(broker.warnings || [])];
  if (eligWarnings.length > 0) {
    allWarnings.push(...eligWarnings);
  }
  // Inform about fee cap split when user has mixed funds + ETFs/shares
  const userInvTypes = answers.investmentTypes || ['etfs'];
  const hasFundsAndETFs = userInvTypes.includes('funds') && (userInvTypes.includes('etfs') || userInvTypes.includes('sharesUK') || userInvTypes.includes('sharesIntl'));
  if (broker.platformFeeCaps && hasFundsAndETFs && costResult.fundPv > 0 && costResult.sharePv > 0) {
    const capAccounts = [];
    if ((answers.accounts || ['isa']).includes('isa') && broker.platformFeeCaps.isa)
      capAccounts.push(`ISA \u00a3${broker.platformFeeCaps.isa}`);
    if ((answers.accounts || []).includes('sipp') && broker.platformFeeCaps.sipp)
      capAccounts.push(`SIPP \u00a3${broker.platformFeeCaps.sipp}`);
    if ((answers.accounts || []).includes('lisa') && broker.platformFeeCaps.lisa)
      capAccounts.push(`LISA \u00a3${broker.platformFeeCaps.lisa}`);
    const capsStr = capAccounts.join(', ');
    const fundPct = Math.round((costResult.fundPv / (costResult.fundPv + costResult.sharePv)) * 100);
    if (capsStr) {
      allWarnings.push(`Platform fee based on ${fundPct}% funds (uncapped) + ${100 - fundPct}% ETFs/shares (capped at ${capsStr})`);
    }
  }
  if (allWarnings.length > 0) {
    warningsHTML = '<div class="detail-warnings">';
    allWarnings.forEach(w => {
      warningsHTML += `<div class="warning-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>${escapeHTML(w)}</div>`;
    });
    warningsHTML += '</div>';
  }

  // Details grid
  const detailsHTML = `
    <div class="details-grid">
      <div class="detail-item">
        <span class="detail-label">Platform fee</span>
        <span class="detail-value">${formatCurrency(costResult.platformFee)}/yr</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">SIPP cost</span>
        <span class="detail-value">${costResult.sippCost > 0 ? formatCurrency(costResult.sippCost) + '/yr' : (broker.hasSIPP ? 'Included' : 'N/A')}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Trading costs</span>
        <span class="detail-value">${formatCurrency(costResult.tradingCost)}/yr</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">FX costs</span>
        <span class="detail-value">${formatCurrency(costResult.fxCost)}/yr</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">FX rate</span>
        <span class="detail-value">${broker.fxRate === null ? 'Not disclosed' : broker.fxRate !== undefined ? (broker.fxRate * 100).toFixed(2) + '%' : 'N/A'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Regular investing</span>
        <span class="detail-value">${broker.regularInvesting !== null && broker.regularInvesting !== undefined ? (broker.regularInvesting === 0 ? 'Free' : formatCurrency(broker.regularInvesting) + '/trade') : 'N/A'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Entry/exit fees</span>
        <span class="detail-value">${escapeHTML(broker.entryExit)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Category</span>
        <span class="detail-value">${broker.category === 'flat' ? 'Flat fee' : broker.category === 'percentage' ? 'Percentage fee' : 'Trading platform'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Cash interest</span>
        <span class="detail-value">${escapeHTML(broker.cashInterest || 'Check with provider')}</span>
      </div>
    </div>
    ${warningsHTML}
    ${broker.notes ? `<div class="detail-notes">${escapeHTML(broker.notes)}</div>` : ''}
    ${broker.lastVerified ? `<div class="detail-verified">Fee data last verified: ${formatVerifiedDate(broker.lastVerified)}</div>` : ''}
    <div class="detail-calc-cta">
      <a href="/broker/${brokerSlug(broker.name)}/" class="btn-calc-link">
        View full ${escapeHTML(broker.name)} fee breakdown &rarr;
      </a>
      <a href="${buildCalcLink(broker, costResult, answers)}" class="btn-calc-link" style="margin-left:1.5rem">
        See long-term fee impact &rarr;
      </a>
    </div>
  `;

  const isCompared = compareSet.has(broker.name);

  return `
    <div class="broker-card ${isTopPick ? 'top-pick' : ''}" data-broker="${escapeHTML(broker.name)}">
      <div class="card-header" data-broker-name="${escapeHTML(broker.name)}" tabindex="0" role="button" aria-expanded="false" aria-label="Show details for ${escapeHTML(broker.name)}">
        <span class="card-rank">${rank}</span>
        <div class="card-info">
          <h3>${escapeHTML(broker.name)}</h3>
          <span class="broker-reason">${escapeHTML(reason)}</span>
        </div>
        <div class="card-cost">
          <span class="cost-amount">${formatCurrency(costResult.totalCost)}</span>
          <span class="cost-label">per year</span>
        </div>
      </div>
      <div class="cost-bar-container">
        <div class="cost-bar-track">
          <div class="cost-bar-fill" style="width: 0%" data-target="${costPercent}"></div>
        </div>
      </div>
      <div class="card-tags">${tagsHTML}</div>
      <div class="card-compare-toggle">
        <label class="compare-checkbox">
          <input type="checkbox" ${isCompared ? 'checked' : ''}>
          Add to comparison
        </label>
      </div>
      <div class="card-details" id="details-${broker.name.replace(/[^a-zA-Z0-9]/g, '')}">${detailsHTML}</div>
    </div>
  `;
}

function toggleDetails(brokerName) {
  const id = 'details-' + brokerName.replace(/[^a-zA-Z0-9]/g, '');
  const el = document.getElementById(id);
  const card = el.closest('.broker-card');
  const header = card.querySelector('.card-header');
  if (el.classList.contains('open')) {
    el.classList.remove('open');
    header.setAttribute('aria-expanded', 'false');
  } else {
    el.classList.add('open');
    header.setAttribute('aria-expanded', 'true');
  }
}

function showAllBrokers() {
  showingAll = true;
  const eligible = rankedBrokers.filter(b => b.eligible);
  const ineligible = rankedBrokers.filter(b => !b.eligible);
  const maxCost = Math.max(...eligible.map(b => b.costResult.totalCost), 1);
  renderBrokerCards(eligible, ineligible, eligible.length, maxCost);
  animateCostBars();
}

// Animate cost bars on scroll/render
function animateCostBars() {
  setTimeout(() => {
    document.querySelectorAll('.cost-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.target + '%';
    });
  }, 100);
}

// ═══════════════════════════════════════════════════
// COMPARISON
// ═══════════════════════════════════════════════════
function toggleCompare(brokerName, checkbox) {
  if (checkbox.checked && compareSet.size >= 3) {
    checkbox.checked = false;
    showToast('You can compare up to 3 brokers at a time.');
    return;
  }
  if (checkbox.checked) {
    compareSet.add(brokerName);
  } else {
    compareSet.delete(brokerName);
  }
  updateCompareButton();
}

function updateCompareButton() {
  const btn = document.getElementById('btnCompare');
  const floatBar = document.getElementById('compareFloatBar');
  const floatText = document.getElementById('compareFloatText');
  const floatBtn = document.getElementById('compareFloatBtn');

  if (compareSet.size >= 2) {
    btn.style.display = 'inline-block';
    btn.textContent = `Compare ${compareSet.size} brokers`;
  } else {
    btn.style.display = 'none';
  }

  // Update floating comparison bar
  if (floatBar) {
    if (compareSet.size >= 1) {
      floatBar.style.display = 'block';
      floatText.textContent = `${compareSet.size} broker${compareSet.size !== 1 ? 's' : ''} selected`;
      floatBtn.disabled = compareSet.size < 2;
    } else {
      floatBar.style.display = 'none';
    }
  }
}

function showComparison() {
  if (compareSet.size < 2) return;
  document.getElementById('comparison').classList.add('active');

  const selected = rankedBrokers.filter(b => compareSet.has(b.broker.name));
  const table = document.getElementById('comparisonTable');

  const headers = selected.map(s => `<th>${escapeHTML(s.broker.name)}</th>`).join('');

  const rows = [
    { label: 'Platform fee', key: 'platformFee' },
    { label: 'SIPP cost', key: 'sippCost' },
    { label: 'Trading costs', key: 'tradingCost' },
    { label: 'FX costs', key: 'fxCost' },
    { label: 'Drawdown cost', key: 'drawdownCost' },
  ];

  let bodyHTML = '';
  rows.forEach(row => {
    const vals = selected.map(s => s.costResult[row.key]);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    bodyHTML += '<tr>';
    bodyHTML += `<td class="row-label">${row.label}</td>`;
    vals.forEach(v => {
      let cls = '';
      if (vals.filter(x => x !== v).length > 0) {
        if (v === min && min !== max) cls = 'lowest-cost';
        if (v === max && min !== max) cls = 'highest-cost';
      }
      bodyHTML += `<td class="${cls}">${formatCurrency(v)}</td>`;
    });
    bodyHTML += '</tr>';
  });

  // Total row
  const totals = selected.map(s => s.costResult.totalCost);
  const minTotal = Math.min(...totals);
  const maxTotal = Math.max(...totals);
  bodyHTML += '<tr class="total-row">';
  bodyHTML += '<td class="row-label">Total annual cost</td>';
  totals.forEach(t => {
    let cls = '';
    if (t === minTotal && minTotal !== maxTotal) cls = 'lowest-cost';
    if (t === maxTotal && minTotal !== maxTotal) cls = 'highest-cost';
    bodyHTML += `<td class="${cls}">${formatCurrency(t)}</td>`;
  });
  bodyHTML += '</tr>';

  // Extra info rows
  const extraRows = [
    { label: 'FX rate', fn: s => s.broker.fxRate === null ? 'Not disclosed' : s.broker.fxRate !== undefined ? (s.broker.fxRate * 100).toFixed(2) + '%' : 'N/A' },
    { label: 'Regular investing', fn: s => s.broker.regularInvesting !== null && s.broker.regularInvesting !== undefined ? (s.broker.regularInvesting === 0 ? 'Free' : formatCurrency(s.broker.regularInvesting)) : 'N/A' },
    { label: 'SIPP available', fn: s => s.broker.hasSIPP ? 'Yes' : 'No' },
    { label: 'Drawdown', fn: s => s.broker.hasDrawdown ? 'Yes' : 'No' },
    { label: 'Entry/exit', fn: s => escapeHTML(s.broker.entryExit) },
    { label: 'Cash interest', fn: s => escapeHTML(s.broker.cashInterest || 'Check with provider') },
  ];

  extraRows.forEach(row => {
    bodyHTML += '<tr>';
    bodyHTML += `<td class="row-label">${row.label}</td>`;
    selected.forEach(s => {
      bodyHTML += `<td>${row.fn(s)}</td>`;
    });
    bodyHTML += '</tr>';
  });

  table.innerHTML = `
    <thead><tr><th>Fee breakdown</th>${headers}</tr></thead>
    <tbody>${bodyHTML}</tbody>
  `;

  // Remove any previous FSCS warnings
  document.querySelectorAll('#comparison .fscs-notice').forEach(el => el.remove());

  // Check for FSCS group overlap
  const groups = {};
  selected.forEach(s => {
    if (s.broker.fscsGroup) {
      if (!groups[s.broker.fscsGroup]) groups[s.broker.fscsGroup] = [];
      groups[s.broker.fscsGroup].push(s.broker.name);
    }
  });
  let fscsWarningHTML = '';
  Object.entries(groups).forEach(([group, names]) => {
    if (names.length >= 2) {
      fscsWarningHTML += `
        <div class="fscs-notice" style="margin-top:1rem">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
          </svg>
          <div>
            <strong>FSCS overlap:</strong> ${names.map(escapeHTML).join(' and ')} share the same FSCS investment protection (\u00a385,000 combined limit across both). Using both does NOT give you \u00a3170,000 of protection.
          </div>
        </div>
      `;
    }
  });
  if (fscsWarningHTML) {
    document.querySelector('.comparison-table-wrapper').insertAdjacentHTML('afterend', fscsWarningHTML);
  }

  document.getElementById('comparison').scrollIntoView({ behavior: 'smooth' });
}

function hideComparison() {
  document.getElementById('comparison').classList.remove('active');
}

// ═══════════════════════════════════════════════════
// URL PARAMETER SHARING
// ═══════════════════════════════════════════════════
function encodeAnswersToURL() {
  const params = new URLSearchParams();
  Object.entries(answers).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  });
  history.replaceState(null, '', '#' + params.toString());
}

function decodeAnswersFromURL() {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const restored = {};
  const multiFields = ['accounts', 'priorities', 'investmentTypes'];

  // Build valid values from QUESTIONS
  const validValues = {};
  QUESTIONS.forEach(q => {
    validValues[q.id] = q.options.map(o => String(o.value));
  });

  params.forEach((value, key) => {
    if (!validValues[key]) return; // Ignore unknown keys
    if (multiFields.includes(key)) {
      const vals = value ? value.split(',').filter(v => validValues[key].includes(v)) : [];
      if (vals.length > 0) restored[key] = vals;
    } else if ((key === 'portfolioSize' || key === 'assetSplit') && !isNaN(Number(value))) {
      restored[key] = Number(value);
    } else if (validValues[key].includes(value)) {
      restored[key] = value;
    }
  });
  return Object.keys(restored).length > 0 ? restored : null;
}

function copyShareLink(btn) {
  navigator.clipboard.writeText(window.location.href).then(() => {
    btn.textContent = 'Link copied!';
    setTimeout(() => { btn.textContent = 'Share results'; }, 2000);
  }).catch(() => {
    showToast('Could not copy link. Please copy the URL manually.');
  });
}

// ═══════════════════════════════════════════════════
// KEYBOARD NAVIGATION
// ═══════════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  if (!document.getElementById('wizard').classList.contains('active')) return;
  if (e.key === 'Enter') {
    // Don't auto-advance if the user is pressing Enter to toggle a specific option
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'button' || tag === 'input') return;
    const btnNext = document.getElementById('btnNext');
    if (!btnNext.disabled) nextStep();
  }
});

// Keyboard support for broker card expand/collapse
document.addEventListener('keydown', (e) => {
  const target = e.target;
  if (target.classList.contains('card-header') && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    const brokerName = target.closest('.broker-card').dataset.broker;
    toggleDetails(brokerName);
  }
});

// ═══════════════════════════════════════════════════
// INITIALISE
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // Bind static button handlers BEFORE loading brokers to avoid race condition
  const btnStart = document.getElementById('btnStart');
  if (btnStart) btnStart.addEventListener('click', startWizard);
  const btnPrev = document.getElementById('btnPrev');
  if (btnPrev) btnPrev.addEventListener('click', prevStep);
  const btnNext = document.getElementById('btnNext');
  if (btnNext) btnNext.addEventListener('click', nextStep);
  const btnChangeAnswers = document.getElementById('btnChangeAnswers');
  if (btnChangeAnswers) btnChangeAnswers.addEventListener('click', changeAnswers);
  const btnShareResults = document.getElementById('btnShareResults');
  if (btnShareResults) btnShareResults.addEventListener('click', () => copyShareLink(btnShareResults));
  const btnCompare = document.getElementById('btnCompare');
  if (btnCompare) btnCompare.addEventListener('click', showComparison);
  const showAllBtn = document.getElementById('showAllBtn');
  if (showAllBtn) showAllBtn.addEventListener('click', showAllBrokers);
  const btnCloseCompare = document.getElementById('btnCloseCompare');
  if (btnCloseCompare) btnCloseCompare.addEventListener('click', hideComparison);
  const compareFloatBtn = document.getElementById('compareFloatBtn');
  if (compareFloatBtn) compareFloatBtn.addEventListener('click', showComparison);

  await loadBrokers();

  // Delegate clicks on wizard option buttons
  const wizardSteps = document.getElementById('wizardSteps');
  if (wizardSteps) {
    wizardSteps.addEventListener('click', (e) => {
      const optBtn = e.target.closest('.option-btn');
      if (!optBtn) return;
      const qid = optBtn.dataset.qid;
      const rawValue = optBtn.dataset.value;
      const valueType = optBtn.dataset.type;
      const multi = optBtn.dataset.multi === 'true';
      const maxSelect = parseInt(optBtn.dataset.max) || 99;
      const value = valueType === 'number' ? Number(rawValue) : rawValue;
      selectOption(qid, value, multi, maxSelect);
    });
  }

  // Delegate clicks on dynamically rendered broker list
  const brokerList = document.getElementById('brokerList');
  if (brokerList) {
    brokerList.addEventListener('click', (e) => {
      // Ineligible toggle
      const ineligibleBtn = e.target.closest('.ineligible-toggle');
      if (ineligibleBtn) { toggleIneligible(); return; }

      // Card header toggle details
      const cardHeader = e.target.closest('.card-header[data-broker-name]');
      if (cardHeader) { toggleDetails(cardHeader.dataset.brokerName); return; }
    });
    brokerList.addEventListener('change', (e) => {
      // Compare checkbox
      const checkbox = e.target.closest('.compare-checkbox input');
      if (checkbox) {
        const brokerName = checkbox.closest('.broker-card').dataset.broker;
        toggleCompare(brokerName, checkbox);
      }
    });

    // Observe broker list for cost bar animation
    const observer = new MutationObserver(() => animateCostBars());
    observer.observe(brokerList, { childList: true });
  }

  // Check for URL-encoded answers (shared link)
  const saved = decodeAnswersFromURL();
  if (saved && dataState === 'loaded' && BROKERS.length > 0) {
    answers = saved;
    showResults();
  }
});
