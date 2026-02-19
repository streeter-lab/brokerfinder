// ═══════════════════════════════════════════════════
// FEE CALCULATION ENGINE (shared by compare.js and check.js)
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
  if (broker.platformFeePerAccount && broker.platformFee && broker.platformFee.minimum) {
    const accountCount = accounts.filter(a => broker.accounts.includes(a)).length;
    const minimumTotal = broker.platformFee.minimum * accountCount;
    platformFee = Math.max(platformFee, minimumTotal);
  }

  // Platform fee caps — only apply when user holds exclusively ETFs/shares (no funds or bonds)
  const hasOnlyETFsOrShares = !invTypes.includes('funds') && !invTypes.includes('bonds');
  const capsApply = hasOnlyETFsOrShares;
  if (broker.platformFeeCaps && capsApply) {
    let totalCap = 0;
    let hasCap = false;
    if (accounts.includes('isa') && broker.platformFeeCaps.isa) {
      totalCap += broker.platformFeeCaps.isa; hasCap = true;
    }
    if (needsSIPP && broker.platformFeeCaps.sipp) {
      totalCap += broker.platformFeeCaps.sipp; hasCap = true;
    }
    if (accounts.includes('lisa') && broker.platformFeeCaps.lisa) {
      totalCap += broker.platformFeeCaps.lisa; hasCap = true;
    }
    if (hasCap) platformFee = Math.min(platformFee, totalCap);
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
  const tradesPerType = tradesPerYear / typeCount;

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

  if (buyingShares) {
    const supportsShares = broker.investmentTypes.includes('shareUK') || broker.investmentTypes.includes('shareIntl');
    if (supportsShares && (broker.shareTrade !== null || broker.etfTrade !== null)) {
      let sharePrice;
      if (isRegular && broker.regularInvesting !== null && broker.regularInvesting !== undefined) {
        sharePrice = broker.regularInvesting;
      } else {
        sharePrice = broker.shareTrade !== null ? broker.shareTrade : (broker.etfTrade !== null ? broker.etfTrade : 0);
        // GIA-specific share trading fees
        if (accounts.includes('gia') && !accounts.includes('isa') && broker.shareTradeGIA_UK) {
          sharePrice = broker.shareTradeGIA_UK;
        }
      }
      tradingCost += sharePrice * tradesPerType;
    }
  }

  if (buyingBonds) {
    const bondPrice = broker.bondTrade ?? broker.shareTrade ?? broker.etfTrade ?? null;
    if (bondPrice !== null) {
      if (isRegular && broker.regularInvesting !== null && broker.regularInvesting !== undefined) {
        tradingCost += broker.regularInvesting * tradesPerType;
      } else {
        tradingCost += bondPrice * tradesPerType;
      }
    }
  }

  // Revolut special: 0.25% per trade after 1 free/month
  if (brokerSlug(broker.name) === 'revolut') {
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
  if (brokerSlug(broker.name) === 'interactive-investor') {
    const coreFee = broker.plans.core;
    const plusFee = broker.plans.plus;

    // Calculate full per-asset-class trading cost under each plan
    const coreFundPrice = broker.fundTradeCore;
    const plusFundPrice = broker.fundTradePlus;
    const coreEtfSharePrice = broker.etfTradeCore || broker.fundTradeCore;
    const plusEtfSharePrice = broker.etfTradePlus || broker.fundTradePlus;

    function iiTradingCost(fundPrice, etfSharePrice) {
      if (isRegular) return 0;
      let cost = 0;
      if (buyingFunds) cost += fundPrice * tradesPerType;
      if (buyingETFs) cost += etfSharePrice * tradesPerType;
      if (buyingShares) cost += etfSharePrice * tradesPerType;
      if (buyingBonds) cost += etfSharePrice * tradesPerType;
      return cost;
    }

    const coreTradeCost = iiTradingCost(coreFundPrice, coreEtfSharePrice);
    const plusTradeCost = iiTradingCost(plusFundPrice, plusEtfSharePrice);

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
  let effectiveFxRate = broker.fxRate || 0;
  if (broker.fxRates) {
    // If user needs SIPP and broker has tiered FX, use the premium rate
    if (needsSIPP && broker.fxRates.plus !== undefined) {
      effectiveFxRate = broker.fxRates.plus;
    }
  }
  if (effectiveFxRate > 0 && fxTrading !== 'rarely') {
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
    fxCost = pv * effectiveFxRate * fxFactor;
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

  const pf = Math.round(platformFee * 100) / 100;
  const sc = Math.round(sippCost * 100) / 100;
  const tc = Math.round(tradingCost * 100) / 100;
  const fc = Math.round(fxCost * 100) / 100;
  const dc = Math.round(drawdownCost * 100) / 100;

  return {
    platformFee: pf,
    sippCost: sc,
    tradingCost: tc,
    fxCost: fc,
    drawdownCost: dc,
    totalCost: Math.round((pf + sc + tc + fc + dc) * 100) / 100,
    fxNotDisclosed
  };
}

// Utility: generate slug from broker name
function brokerSlug(name) {
  return name
    .toLowerCase()
    .replace(/[\/]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
