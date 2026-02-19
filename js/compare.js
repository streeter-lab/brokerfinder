// ═══════════════════════════════════════════════════
// BROKER COMPARISON TOOL
// ═══════════════════════════════════════════════════

let BROKERS = [];

// ═══════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════
async function loadBrokers() {
  try {
    const response = await fetch('/data/brokers.json');
    BROKERS = await response.json();
  } catch (err) {
    console.error('Failed to load broker data:', err);
    document.getElementById('hero').innerHTML = '<p style="color:var(--red);padding:2rem">Failed to load broker data. Please refresh the page.</p>';
  }
}

// ═══════════════════════════════════════════════════
// FEE INTERPRETER
// ═══════════════════════════════════════════════════
function calculatePlatformFee(feeConfig, portfolioValue) {
  if (!feeConfig) return 0;

  switch (feeConfig.type) {
    case 'fixed':
      return feeConfig.amount;

    case 'percentage': {
      let raw = portfolioValue * feeConfig.rate;
      if (feeConfig.flat_extra) raw += feeConfig.flat_extra;
      let result = feeConfig.minimum ? Math.max(raw, feeConfig.minimum) : raw;
      if (feeConfig.cap) result = Math.min(result, feeConfig.cap);
      return result;
    }

    case 'tiered':
      return calculateTieredFee(feeConfig.tiers, portfolioValue);

    case 'thresholded': {
      if (portfolioValue <= feeConfig.belowThreshold) return feeConfig.belowAmount;
      let fee = calculateTieredFee(feeConfig.tiers, portfolioValue);
      if (feeConfig.cap) fee = Math.min(fee, feeConfig.cap);
      return fee;
    }

    default:
      return 0;
  }
}

function calculateTieredFee(tiers, portfolioValue) {
  let fee = 0;
  let remaining = portfolioValue;
  let prevLimit = 0;

  for (const tier of tiers) {
    if (tier.above !== undefined) {
      // Final tier — everything above previous
      fee += remaining * tier.rate;
      break;
    }
    const tierSize = tier.upTo - prevLimit;
    const inThisTier = Math.min(remaining, tierSize);
    fee += inThisTier * tier.rate;
    remaining -= inThisTier;
    prevLimit = tier.upTo;
    if (remaining <= 0) break;
  }

  return fee;
}

// ═══════════════════════════════════════════════════
// WIZARD QUESTIONS
// ═══════════════════════════════════════════════════
const QUESTIONS = [
  {
    id: 'accounts',
    label: 'Step 1 of 7',
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
    label: 'Step 2 of 8',
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
    id: 'portfolioSize',
    label: 'Step 3 of 7',
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
    label: 'Step 4 of 7',
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
    label: 'Step 5 of 7',
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
    label: 'Step 6 of 7',
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
    label: 'Step 7 of 8',
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
    label: 'Step 8 of 8',
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
              onclick="selectOption('${q.id}', ${typeof opt.value === 'string' ? `'${opt.value}'` : opt.value}, ${q.multi}, ${q.maxSelect || 99})"
              aria-pressed="${isSelected}"
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
// COST CALCULATION
// ═══════════════════════════════════════════════════
function calculateCost(broker, portfolioValue, userAnswers) {
  const pv = portfolioValue || userAnswers.portfolioSize;
  const accounts = userAnswers.accounts || ['isa'];
  const invTypes = userAnswers.investmentTypes || ['etfs'];
  const tradingFreq = userAnswers.tradingFreq || 'monthly';
  const fxTrading = userAnswers.fxTrading || 'rarely';
  const needsSIPP = accounts.includes('sipp');
  const needsDrawdown = needsSIPP && userAnswers.drawdownSoon === 'yes';

  // Determine trades per year
  let tradesPerYear;
  let isRegular = false;
  switch (tradingFreq) {
    case 'setForget': tradesPerYear = 2; break;
    case 'monthly': tradesPerYear = 12; isRegular = true; break;
    case 'occasional': tradesPerYear = 9; break;
    case 'active': tradesPerYear = 30; break;
    default: tradesPerYear = 12;
  }

  // Determine what they're buying
  const buyingFunds = invTypes.includes('funds');
  const buyingETFs = invTypes.includes('etfs');
  const buyingShares = invTypes.includes('sharesUK') || invTypes.includes('sharesIntl');
  const buyingBonds = invTypes.includes('bonds');
  const buyingIntl = invTypes.includes('sharesIntl');

  // ─── Platform Fee ───
  let platformFee = 0;
  if (broker.platformFee) {
    // Interactive Brokers: GIA is free, ISA is £36
    if (broker.platformFeeGIA === 0 && accounts.length === 1 && accounts[0] === 'gia') {
      platformFee = 0;
    } else {
      platformFee = calculatePlatformFee(broker.platformFee, pv);
    }
  }
  // ISA-specific platform fee (Moneyfarm)
  if (broker.platformFeeISA && accounts.includes('isa')) {
    platformFee = calculatePlatformFee(broker.platformFeeISA, pv);
  }
  // Per-account minimum (Dodl)
  if (broker.platformFeePerAccount && broker.platformFee.minimum) {
    const accountCount = accounts.filter(a => broker.accounts.includes(a)).length;
    const minimumTotal = broker.platformFee.minimum * accountCount;
    platformFee = Math.max(platformFee, minimumTotal);
  }

  // Platform fee caps — only apply when user holds ETFs/shares/ITs/bonds (not fund-only)
  const fundsOnly = invTypes.length === 1 && invTypes[0] === 'funds';
  const capsApply = !fundsOnly;
  if (broker.platformFeeCaps) {
    if (capsApply) {
      if (needsSIPP && broker.platformFeeCaps.sipp) {
        platformFee = Math.min(platformFee, broker.platformFeeCaps.sipp);
      } else if (accounts.includes('isa') && broker.platformFeeCaps.isa) {
        platformFee = Math.min(platformFee, broker.platformFeeCaps.isa);
      }
    }
    // LISA cap always applies regardless of investment type
    if (accounts.includes('lisa') && broker.platformFeeCaps.lisa) {
      platformFee = Math.min(platformFee, broker.platformFeeCaps.lisa);
    }
  }

  // SIPP surcharge
  let sippCost = 0;
  if (needsSIPP) {
    if (broker.sippFee) {
      const sippFeeVal = calculatePlatformFee(broker.sippFee, pv);
      sippCost = sippFeeVal;
    }
    if (broker.sippExtra) sippCost += broker.sippExtra;
    if (broker.sippMin) sippCost = Math.max(sippCost, broker.sippMin);
    if (broker.sippExtra120Under30k && pv < 30000) sippCost += 120;
  }

  // ─── Trading Costs ───
  let tradingCost = 0;

  // Count how many tradeable asset classes the user selected
  const activeTypes = [];
  if (buyingFunds) activeTypes.push('funds');
  if (buyingETFs) activeTypes.push('etfs');
  if (buyingShares) activeTypes.push('shares');
  if (buyingBonds) activeTypes.push('bonds');
  const typeCount = activeTypes.length || 1;

  // Allocate trades proportionally across asset types
  const tradesPerType = Math.ceil(tradesPerYear / typeCount);

  if (buyingFunds && broker.fundTrade !== null) {
    let fundTradePrice;
    if (isRegular && broker.regularInvesting !== null && broker.regularInvesting !== undefined) {
      fundTradePrice = broker.regularInvestingFunds !== undefined && broker.regularInvestingFunds !== null ? broker.regularInvestingFunds : broker.regularInvesting;
    } else {
      fundTradePrice = broker.fundTrade;
    }
    tradingCost += fundTradePrice * tradesPerType;
  }

  if (buyingETFs && (broker.etfTrade !== null)) {
    let etfPrice;
    if (isRegular && broker.regularInvesting !== null && broker.regularInvesting !== undefined) {
      etfPrice = broker.regularInvesting;
    } else {
      etfPrice = broker.etfTrade;
    }
    tradingCost += etfPrice * tradesPerType;
  }

  if (buyingShares && (broker.shareTrade !== null || broker.etfTrade !== null)) {
    let sharePrice;
    if (isRegular && broker.regularInvesting !== null && broker.regularInvesting !== undefined) {
      sharePrice = broker.regularInvesting;
    } else {
      sharePrice = broker.shareTrade !== null ? broker.shareTrade : (broker.etfTrade !== null ? broker.etfTrade : 0);
    }
    tradingCost += sharePrice * tradesPerType;
  }

  if (buyingBonds && broker.bondTrade) {
    tradingCost += broker.bondTrade * tradesPerType;
  }

  // Revolut special: 0.25% per trade after 1 free/month
  if (broker.name === 'Revolut') {
    // Reset trading cost — we calculate it all here
    tradingCost = 0;
    const relevantTrades = (buyingETFs ? tradesPerType : 0) + (buyingShares ? tradesPerType : 0);
    if (relevantTrades > 0) {
      const paidTrades = Math.max(0, relevantTrades - 12); // 1 free/month
      const avgTradeSize = pv / Math.max(relevantTrades, 1);
      tradingCost = paidTrades * avgTradeSize * 0.0025;
    }
  }

  // Interactive Investor plan selection
  if (broker.name === 'Interactive Investor') {
    const coreFee = broker.plans.core;
    const plusFee = broker.plans.plus;

    // Determine per-trade cost based on what user is buying
    let corePerTrade, plusPerTrade;
    if (buyingFunds && !buyingETFs && !buyingShares) {
      corePerTrade = broker.fundTradeCore;
      plusPerTrade = broker.fundTradePlus;
    } else {
      // ETFs/shares use the higher trade fee on Core, lower on Plus
      corePerTrade = broker.etfTradeCore || broker.fundTradeCore;
      plusPerTrade = broker.etfTradePlus || broker.fundTradePlus;
    }

    const coreTradeCost = tradesPerYear * corePerTrade;
    const plusTradeCost = tradesPerYear * plusPerTrade;

    if (coreFee + coreTradeCost <= plusFee + plusTradeCost) {
      platformFee = coreFee;
      tradingCost = coreTradeCost;
    } else {
      platformFee = plusFee;
      tradingCost = plusTradeCost;
    }
    if (isRegular) tradingCost = 0; // free regular investing on both plans
  }

  // ─── FX Costs ───
  let fxCost = 0;
  let fxNotDisclosed = broker.fxRate === null || broker.fxRate === undefined;
  if (broker.fxRate > 0 && fxTrading !== 'rarely') {
    let fxFactor;
    switch (fxTrading) {
      case 'sometimes': fxFactor = 0.03; break;
      case 'frequently': fxFactor = 0.10; break;
      default: fxFactor = 0;
    }
    // If they're buying international shares AND said they do FX trading, increase factor
    if (buyingIntl && fxTrading === 'frequently') {
      fxFactor = Math.max(fxFactor, 0.12);
    }
    fxCost = pv * broker.fxRate * fxFactor;
  }
  // FX dividends (HL) — only if user actually trades internationally
  if (broker.fxDividends && buyingIntl && fxTrading !== 'rarely') {
    fxCost += pv * broker.fxDividends * 0.02; // ~2% yield assumption
  }

  // ─── Drawdown ───
  let drawdownCost = 0;
  if (needsDrawdown && broker.sippDrawdownFee) {
    drawdownCost = broker.sippDrawdownFee;
  }

  const totalCost = platformFee + sippCost + tradingCost + fxCost + drawdownCost;

  return {
    platformFee: Math.round(platformFee * 100) / 100,
    sippCost: Math.round(sippCost * 100) / 100,
    tradingCost: Math.round(tradingCost * 100) / 100,
    fxCost: Math.round(fxCost * 100) / 100,
    drawdownCost: Math.round(drawdownCost * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    fxNotDisclosed
  };
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
    if (invTypes.length === 1 && invTypes[0] === 'funds') { eligible = false; }
    warnings.push('No funds available');
  }
  if (buyingShares && broker.shareTrade === null && !broker.investmentTypes.includes('shareUK') && !broker.investmentTypes.includes('shareIntl')) {
    if (invTypes.length === 1 && (invTypes[0] === 'sharesUK' || invTypes[0] === 'sharesIntl')) { eligible = false; }
    warnings.push('No individual shares');
  }
  if (buyingBonds && !broker.investmentTypes.includes('bond')) {
    if (invTypes.length === 1 && invTypes[0] === 'bonds') { eligible = false; }
    warnings.push('No bonds/gilts available');
  }
  if (buyingETFs && broker.etfTrade === null && !broker.investmentTypes.includes('etf')) {
    if (invTypes.length === 1 && invTypes[0] === 'etfs') { eligible = false; }
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
    const normalizedPriority = 100 * (b.priorityScore / maxPriorityScore);
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
  slider.oninput = function() {
    const val = parseInt(this.value);
    document.getElementById('whatifValue').textContent = formatCurrency(val);
    const modifiedAnswers = { ...answers, portfolioSize: val };
    recalculateAndRender(modifiedAnswers);
  };

  // Encode answers to URL for sharing
  encodeAnswersToURL();

  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderBrokerCards(eligible, ineligible, initialShow, maxCost) {
  const list = document.getElementById('brokerList');
  let html = '';

  const toShow = showingAll ? eligible : eligible.slice(0, initialShow);

  toShow.forEach((item, idx) => {
    html += renderBrokerCard(item, idx + 1, maxCost);
  });

  list.innerHTML = html;

  // Show/hide "show all" button
  const showAllBtn = document.getElementById('showAllBtn');
  if (eligible.length > initialShow && !showingAll) {
    showAllBtn.style.display = 'block';
    showAllBtn.textContent = `Show all ${eligible.length} eligible brokers`;
  } else {
    showAllBtn.style.display = 'none';
  }

  // Update compare button
  updateCompareButton();
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
  if (allWarnings.length > 0) {
    warningsHTML = '<div class="detail-warnings">';
    allWarnings.forEach(w => {
      warningsHTML += `<div class="warning-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>${w}</div>`;
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
        <span class="detail-value">${broker.fxRate === null ? 'Not disclosed' : broker.fxRate ? (broker.fxRate * 100).toFixed(2) + '%' : 'N/A'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Regular investing</span>
        <span class="detail-value">${broker.regularInvesting !== null && broker.regularInvesting !== undefined ? (broker.regularInvesting === 0 ? 'Free' : formatCurrency(broker.regularInvesting) + '/trade') : 'N/A'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Entry/exit fees</span>
        <span class="detail-value">${broker.entryExit}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Category</span>
        <span class="detail-value">${broker.category === 'flat' ? 'Flat fee' : broker.category === 'percentage' ? 'Percentage fee' : 'Trading platform'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Cash interest</span>
        <span class="detail-value">${broker.cashInterest || 'Check with provider'}</span>
      </div>
    </div>
    ${warningsHTML}
    ${broker.notes ? `<div class="detail-notes">${broker.notes}</div>` : ''}
  `;

  const isCompared = compareSet.has(broker.name);

  return `
    <div class="broker-card ${isTopPick ? 'top-pick' : ''}" data-broker="${broker.name}">
      <div class="card-header" data-broker-name="${broker.name.replace(/"/g, '&quot;')}" onclick="toggleDetails(this.dataset.brokerName)" tabindex="0" role="button" aria-expanded="false" aria-label="Show details for ${broker.name}">
        <span class="card-rank">${rank}</span>
        <div class="card-info">
          <h3>${broker.name}</h3>
          <span class="broker-reason">${reason}</span>
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
          <input type="checkbox" ${isCompared ? 'checked' : ''} onchange="toggleCompare(this.closest('.broker-card').dataset.broker, this.checked)">
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
function toggleCompare(brokerName, checked) {
  if (checked && compareSet.size < 3) {
    compareSet.add(brokerName);
  } else {
    compareSet.delete(brokerName);
  }
  updateCompareButton();
}

function updateCompareButton() {
  const btn = document.getElementById('btnCompare');
  if (compareSet.size >= 2) {
    btn.style.display = 'inline-block';
    btn.textContent = `Compare ${compareSet.size} brokers`;
  } else {
    btn.style.display = 'none';
  }
}

function showComparison() {
  if (compareSet.size < 2) return;
  document.getElementById('comparison').classList.add('active');

  const selected = rankedBrokers.filter(b => compareSet.has(b.broker.name));
  const table = document.getElementById('comparisonTable');

  const headers = selected.map(s => `<th>${s.broker.name}</th>`).join('');

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
    { label: 'FX rate', fn: s => s.broker.fxRate === null ? 'Not disclosed' : s.broker.fxRate ? (s.broker.fxRate * 100).toFixed(2) + '%' : 'N/A' },
    { label: 'Regular investing', fn: s => s.broker.regularInvesting !== null && s.broker.regularInvesting !== undefined ? (s.broker.regularInvesting === 0 ? 'Free' : formatCurrency(s.broker.regularInvesting)) : 'N/A' },
    { label: 'SIPP available', fn: s => s.broker.hasSIPP ? 'Yes' : 'No' },
    { label: 'Drawdown', fn: s => s.broker.hasDrawdown ? 'Yes' : 'No' },
    { label: 'Entry/exit', fn: s => s.broker.entryExit },
    { label: 'Cash interest', fn: s => s.broker.cashInterest || 'Check with provider' },
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
          </svg>
          <div>
            <strong>FSCS overlap:</strong> ${names.join(' and ')} share the same FSCS investment protection (\u00a385,000 combined limit across both). Using both does NOT give you \u00a3170,000 of protection.
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
  params.forEach((value, key) => {
    if (multiFields.includes(key)) {
      restored[key] = value.split(',');
    } else if (key === 'portfolioSize' && !isNaN(Number(value))) {
      restored[key] = Number(value);
    } else {
      restored[key] = value;
    }
  });
  return Object.keys(restored).length > 0 ? restored : null;
}

function copyShareLink(btn) {
  navigator.clipboard.writeText(window.location.href).then(() => {
    btn.textContent = 'Link copied!';
    setTimeout(() => { btn.textContent = 'Share results'; }, 2000);
  });
}

// ═══════════════════════════════════════════════════
// KEYBOARD NAVIGATION
// ═══════════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  if (!document.getElementById('wizard').classList.contains('active')) return;
  if (e.key === 'Enter') {
    const btnNext = document.getElementById('btnNext');
    if (!btnNext.disabled) nextStep();
  }
});

// ═══════════════════════════════════════════════════
// INITIALISE
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  await loadBrokers();

  // Observe broker list for cost bar animation
  const brokerList = document.getElementById('brokerList');
  if (brokerList) {
    const observer = new MutationObserver(() => animateCostBars());
    observer.observe(brokerList, { childList: true });
  }

  // Check for URL-encoded answers (shared link)
  const saved = decodeAnswersFromURL();
  if (saved) {
    answers = saved;
    showResults();
  }
});
