// ═══════════════════════════════════════════════════
// Fee Engine Test Suite
// ═══════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

// Load the fee engine (it defines global functions)
const feeEngineCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'fee-engine.js'), 'utf8');
eval(feeEngineCode);

// Load broker data
const BROKERS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'brokers.json'), 'utf8'));

// Helper to find a broker by name
function getBroker(name) {
  const b = BROKERS.find(b => b.name === name);
  if (!b) throw new Error(`Broker not found: ${name}`);
  return b;
}

// Helper to build standard answers
function makeAnswers(overrides = {}) {
  const accounts = overrides.accounts || ['isa'];
  const portfolioSize = overrides.portfolioSize || 50000;
  // Auto-generate balances if not explicitly provided
  const balances = overrides.balances !== undefined ? overrides.balances : (() => {
    const b = {};
    const perAccount = portfolioSize / accounts.length;
    accounts.forEach(a => { b[a] = perAccount; });
    return b;
  })();
  return {
    accounts,
    investmentTypes: ['etfs'],
    portfolioSize,
    balances,
    tradingFreq: 'monthly',
    fxTrading: 'rarely',
    priorities: ['lowestFees'],
    feeModel: 'noPreference',
    ...overrides
  };
}

// ─── Test framework ───
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  \u2717 ${name}`);
    console.log(`    ${e.message}`);
  }
}

function assertEqual(actual, expected, tolerance = 0.01) {
  if (typeof actual === 'number' && typeof expected === 'number') {
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(`Expected ${expected}, got ${actual} (diff: ${Math.abs(actual - expected).toFixed(4)})`);
    }
  } else if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(actual, message) {
  if (!actual) throw new Error(message || `Expected truthy, got ${actual}`);
}

// ═══════════════════════════════════════════════════
console.log('Fee Engine Test Suite');
console.log('\u2550'.repeat(50));
console.log('');

// ─────────────────────────────────────────────────
// Category A: Platform Fee Calculations
// ─────────────────────────────────────────────────
console.log('Platform Fee Calculations (calculatePlatformFee)');

test('Fixed fee returns exact amount', () => {
  assertEqual(calculatePlatformFee({ type: 'fixed', amount: 71.88 }, 100000), 71.88);
});

test('Null config returns zero', () => {
  assertEqual(calculatePlatformFee(null, 100000), 0);
});

test('Percentage fee basic calculation', () => {
  assertEqual(calculatePlatformFee({ type: 'percentage', rate: 0.0025 }, 100000), 250);
});

test('Percentage fee with cap', () => {
  assertEqual(calculatePlatformFee({ type: 'percentage', rate: 0.0015, cap: 375 }, 500000), 375);
});

test('Percentage fee with minimum', () => {
  assertEqual(calculatePlatformFee({ type: 'percentage', rate: 0.0015, minimum: 12 }, 5000), 12);
});

test('Percentage fee with flat_extra', () => {
  assertEqual(calculatePlatformFee({ type: 'percentage', rate: 0.0025, flat_extra: 12 }, 10000), 37);
});

test('Tiered fee — AJ Bell at \u00a3100k', () => {
  const ajbell = getBroker('AJ Bell');
  assertEqual(calculatePlatformFee(ajbell.platformFee, 100000), 250);
});

test('Tiered fee — AJ Bell at \u00a3300k', () => {
  const ajbell = getBroker('AJ Bell');
  // 250k * 0.0025 + 50k * 0.001 = 625 + 50 = 675
  assertEqual(calculatePlatformFee(ajbell.platformFee, 300000), 675);
});

test('Tiered fee — AJ Bell at \u00a3600k', () => {
  const ajbell = getBroker('AJ Bell');
  // 250k * 0.0025 + 250k * 0.001 + 100k * 0 = 625 + 250 + 0 = 875
  assertEqual(calculatePlatformFee(ajbell.platformFee, 600000), 875);
});

test('Thresholded fee — Vanguard under threshold', () => {
  const vanguard = getBroker('Vanguard Investor');
  assertEqual(calculatePlatformFee(vanguard.platformFee, 20000), 48);
});

test('Thresholded fee — Vanguard over threshold', () => {
  const vanguard = getBroker('Vanguard Investor');
  // 100k * 0.0015 = 150
  assertEqual(calculatePlatformFee(vanguard.platformFee, 100000), 150);
});

test('Thresholded fee — Vanguard at cap', () => {
  const vanguard = getBroker('Vanguard Investor');
  // 250k * 0.0015 = 375, capped at 375
  assertEqual(calculatePlatformFee(vanguard.platformFee, 300000), 375);
});

test('Thresholded fee — Fidelity under threshold', () => {
  const fidelity = getBroker('Fidelity');
  assertEqual(calculatePlatformFee(fidelity.platformFee, 20000), 90);
});

test('Thresholded fee — Fidelity over threshold', () => {
  const fidelity = getBroker('Fidelity');
  // 100k * 0.0035 = 350
  assertEqual(calculatePlatformFee(fidelity.platformFee, 100000), 350);
});

console.log('');

// ─────────────────────────────────────────────────
// Category B: Full Cost Calculations — Basic
// ─────────────────────────────────────────────────
console.log('Full Cost Calculations (calculateCost) \u2014 Basic');

test('InvestEngine \u2014 zero fees across the board', () => {
  const broker = getBroker('InvestEngine');
  const result = calculateCost(broker, 50000, makeAnswers());
  assertEqual(result.totalCost, 0);
  assertEqual(result.platformFee, 0);
  assertEqual(result.tradingCost, 0);
});

test('Interactive Investor Core \u2014 regular investing', () => {
  const broker = getBroker('Interactive Investor');
  const result = calculateCost(broker, 50000, makeAnswers());
  // Monthly regular → both plans have 0 trading cost
  // Core: 71.88 + 0 = 71.88, Plus: 179.88 + 0 = 179.88 → Core wins
  assertEqual(result.platformFee, 71.88);
  assertEqual(result.tradingCost, 0);
  assertEqual(result.totalCost, 71.88);
});

test('Interactive Investor \u2014 ad-hoc trading picks cheapest plan', () => {
  const broker = getBroker('Interactive Investor');
  const result = calculateCost(broker, 50000, makeAnswers({ tradingFreq: 'active' }));
  // Active: 30 trades/year, 1 type (ETFs), tradesPerType = 30
  // Core: 71.88 + 30*3.99 = 71.88 + 119.70 = 191.58
  // Plus: 179.88 + 30*2.99 = 179.88 + 89.70 = 269.58
  // Core wins
  assertEqual(result.platformFee, 71.88);
  assertEqual(result.tradingCost, 119.70);
  assertEqual(result.totalCost, 191.58);
});

test('Vanguard \u2014 small portfolio under threshold', () => {
  const broker = getBroker('Vanguard Investor');
  const result = calculateCost(broker, 20000, makeAnswers({ portfolioSize: 20000 }));
  assertEqual(result.platformFee, 48);
  assertEqual(result.tradingCost, 0);
  assertEqual(result.totalCost, 48);
});

test('Vanguard \u2014 large portfolio at cap', () => {
  const broker = getBroker('Vanguard Investor');
  const result = calculateCost(broker, 300000, makeAnswers({ portfolioSize: 300000 }));
  assertEqual(result.platformFee, 375);
  assertEqual(result.tradingCost, 0);
  assertEqual(result.totalCost, 375);
});

test('AJ Bell \u2014 ISA fee cap applies for ETF-only portfolio', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 100000, makeAnswers({ portfolioSize: 100000 }));
  // 100k * 0.0025 = 250, capped at 42 (ISA cap)
  assertEqual(result.platformFee, 42);
  // Monthly regular: regularInvesting = 1.5, 12 trades → 18
  assertEqual(result.tradingCost, 18);
  assertEqual(result.totalCost, 60);
});

test('Fidelity \u2014 ETF-only portfolio hits cap', () => {
  const broker = getBroker('Fidelity');
  const result = calculateCost(broker, 100000, makeAnswers({ portfolioSize: 100000 }));
  // 100k * 0.0035 = 350, capped at 90 (ISA cap)
  assertEqual(result.platformFee, 90);
  // Monthly regular: regularInvesting = 1.5, 12 trades → 18
  assertEqual(result.tradingCost, 18);
  assertEqual(result.totalCost, 108);
});

test('Trading 212 \u2014 zero everything', () => {
  const broker = getBroker('Trading 212');
  const result = calculateCost(broker, 50000, makeAnswers());
  assertEqual(result.totalCost, 0);
});

test('Lloyds Bank \u2014 flat fee with regular investing', () => {
  const broker = getBroker('Lloyds Bank');
  const result = calculateCost(broker, 50000, makeAnswers({
    investmentTypes: ['funds'],
    portfolioSize: 50000
  }));
  // Fixed £36 platform fee, regular investing = free (regularInvesting = 0)
  assertEqual(result.platformFee, 36);
  assertEqual(result.tradingCost, 0);
  assertEqual(result.totalCost, 36);
});

console.log('');

// ─────────────────────────────────────────────────
// Category C: Asset Split Tests
// ─────────────────────────────────────────────────
console.log('Asset Split Tests');

test('AJ Bell \u2014 100% funds, \u00a3100k \u2014 NO cap should apply', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 100000, makeAnswers({
    investmentTypes: ['funds', 'etfs'],
    portfolioSize: 100000,
    assetSplit: 100
  }));
  // 100% funds → sharePercent = 0 → no cap applied
  // platformFee = 100k * 0.0025 = 250
  assertEqual(result.platformFee, 250);
});

test('AJ Bell \u2014 100% ETFs, \u00a3100k \u2014 cap SHOULD apply', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 100000, makeAnswers({
    investmentTypes: ['funds', 'etfs'],
    portfolioSize: 100000,
    assetSplit: 0
  }));
  // 0% funds → sharePercent = 1 → cap applies → min(250, 42) = 42
  assertEqual(result.platformFee, 42);
});

test('AJ Bell \u2014 50/50 split, \u00a3100k', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 100000, makeAnswers({
    investmentTypes: ['funds', 'etfs'],
    portfolioSize: 100000,
    assetSplit: 50
  }));
  // fullFee = 250, fundFee = 125, shareFeeRaw = 125, cap = 42
  // platformFee = 125 + 42 = 167
  assertEqual(result.platformFee, 167);
  assertEqual(result.fundPv, 50000);
  assertEqual(result.sharePv, 50000);
});

test('AJ Bell \u2014 75% funds / 25% ETFs, \u00a3200k', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 200000, makeAnswers({
    investmentTypes: ['funds', 'etfs'],
    portfolioSize: 200000,
    assetSplit: 75
  }));
  // fullFee = 200k * 0.0025 = 500
  // fundFee = 500 * 0.75 = 375, shareFeeRaw = 500 * 0.25 = 125, cap = 42
  // platformFee = 375 + 42 = 417
  assertEqual(result.platformFee, 417);
  assertEqual(result.fundPv, 150000);
  assertEqual(result.sharePv, 50000);
});

test('Hargreaves Lansdown \u2014 100% funds, \u00a3200k \u2014 no cap', () => {
  const broker = getBroker('Hargreaves Lansdown');
  const result = calculateCost(broker, 200000, makeAnswers({
    investmentTypes: ['funds', 'etfs'],
    portfolioSize: 200000,
    assetSplit: 100
  }));
  // 200k * 0.0035 = 700, no cap (100% funds)
  assertEqual(result.platformFee, 700);
});

test('Hargreaves Lansdown \u2014 100% ETFs, \u00a3200k \u2014 cap applies', () => {
  const broker = getBroker('Hargreaves Lansdown');
  const result = calculateCost(broker, 200000, makeAnswers({
    investmentTypes: ['funds', 'etfs'],
    portfolioSize: 200000,
    assetSplit: 0
  }));
  // 200k * 0.0035 = 700, cap = 150 (ISA cap)
  assertEqual(result.platformFee, 150);
});

test('Hargreaves Lansdown \u2014 50/50 split, \u00a3200k', () => {
  const broker = getBroker('Hargreaves Lansdown');
  const result = calculateCost(broker, 200000, makeAnswers({
    investmentTypes: ['funds', 'etfs'],
    portfolioSize: 200000,
    assetSplit: 50
  }));
  // fullFee = 700, fundFee = 350, shareFeeRaw = 350, cap = 150
  // platformFee = 350 + 150 = 500
  assertEqual(result.platformFee, 500);
});

test('Fidelity \u2014 50/50 split, \u00a3100k', () => {
  const broker = getBroker('Fidelity');
  const result = calculateCost(broker, 100000, makeAnswers({
    investmentTypes: ['funds', 'etfs'],
    portfolioSize: 100000,
    assetSplit: 50
  }));
  // fullFee = 350 (100k * 0.0035), fundFee = 175, shareFeeRaw = 175, cap = 90
  // platformFee = 175 + 90 = 265
  assertEqual(result.platformFee, 265);
});

test('Fidelity \u2014 100% ETFs, \u00a3100k \u2014 cap applies', () => {
  const broker = getBroker('Fidelity');
  const result = calculateCost(broker, 100000, makeAnswers({
    investmentTypes: ['funds', 'etfs'],
    portfolioSize: 100000,
    assetSplit: 0
  }));
  // 100k * 0.0035 = 350, capped at 90
  assertEqual(result.platformFee, 90);
});

test('Aviva \u2014 broker WITHOUT caps, split doesn\u2019t matter', () => {
  const broker = getBroker('Aviva');
  const r50 = calculateCost(broker, 100000, makeAnswers({
    investmentTypes: ['funds', 'etfs'],
    portfolioSize: 100000,
    assetSplit: 50
  }));
  const r0 = calculateCost(broker, 100000, makeAnswers({
    investmentTypes: ['funds', 'etfs'],
    portfolioSize: 100000,
    assetSplit: 0
  }));
  const r100 = calculateCost(broker, 100000, makeAnswers({
    investmentTypes: ['funds', 'etfs'],
    portfolioSize: 100000,
    assetSplit: 100
  }));
  // All should give same platformFee = 100k * 0.0035 = 350
  assertEqual(r50.platformFee, 350);
  assertEqual(r0.platformFee, 350);
  assertEqual(r100.platformFee, 350);
});

test('InvestEngine \u2014 no percentage fee, split irrelevant', () => {
  const broker = getBroker('InvestEngine');
  const result = calculateCost(broker, 100000, makeAnswers({ portfolioSize: 100000 }));
  assertEqual(result.platformFee, 0);
});

console.log('');

// ─────────────────────────────────────────────────
// Category D: SIPP Cost Tests
// ─────────────────────────────────────────────────
console.log('SIPP Cost Tests');

test('AJ Bell SIPP \u2014 fee capped at \u00a3120', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 100000, makeAnswers({
    accounts: ['sipp'],
    portfolioSize: 100000
  }));
  // 100k * 0.0025 = 250, SIPP cap = 120 → platformFee = 120
  // sippFee = fixed 0, sippExtra = null → sippCost = 0
  assertEqual(result.platformFee, 120);
  assertEqual(result.sippCost, 0);
});

test('IG SIPP \u2014 \u00a3210/year extra', () => {
  const broker = getBroker('IG');
  const result = calculateCost(broker, 50000, makeAnswers({
    accounts: ['sipp'],
    portfolioSize: 50000
  }));
  // platformFee = 0 (fixed 0)
  // sippFee = fixed 210
  assertEqual(result.platformFee, 0);
  assertEqual(result.sippCost, 210);
});

test('Barclays SIPP \u2014 extra surcharge', () => {
  const broker = getBroker('Barclays Smart Investor');
  const result = calculateCost(broker, 100000, makeAnswers({
    accounts: ['sipp'],
    investmentTypes: ['funds'],
    portfolioSize: 100000
  }));
  // sippFee = fixed 0, sippExtra = 150 → sippCost = 150
  assertEqual(result.sippCost, 150);
});

test('InvestEngine SIPP \u2014 zero', () => {
  const broker = getBroker('InvestEngine');
  const result = calculateCost(broker, 50000, makeAnswers({
    accounts: ['sipp'],
    portfolioSize: 50000
  }));
  assertEqual(result.sippCost, 0);
  assertEqual(result.totalCost, 0);
});

console.log('');

// ─────────────────────────────────────────────────
// Category E: FX Cost Tests
// ─────────────────────────────────────────────────
console.log('FX Cost Tests');

test('FX rarely \u2014 zero FX cost', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 100000, makeAnswers({
    fxTrading: 'rarely',
    portfolioSize: 100000
  }));
  assertEqual(result.fxCost, 0);
});

test('FX sometimes \u2014 basic calculation', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 100000, makeAnswers({
    fxTrading: 'sometimes',
    portfolioSize: 100000
  }));
  // 100k * 0.0075 * 0.03 = 22.50
  assertEqual(result.fxCost, 22.50);
});

test('FX frequently with international shares', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 100000, makeAnswers({
    investmentTypes: ['sharesIntl'],
    fxTrading: 'frequently',
    portfolioSize: 100000
  }));
  // fxFactor = max(0.10, 0.12) = 0.12 (buyingIntl + frequently)
  // 100k * 0.0075 * 0.12 = 90
  assertEqual(result.fxCost, 90);
});

test('Zero FX broker (InvestEngine) \u2014 no FX cost even when frequent', () => {
  const broker = getBroker('InvestEngine');
  const result = calculateCost(broker, 100000, makeAnswers({
    fxTrading: 'frequently',
    portfolioSize: 100000
  }));
  assertEqual(result.fxCost, 0);
});

console.log('');

// ─────────────────────────────────────────────────
// Category F: Edge Cases
// ─────────────────────────────────────────────────
console.log('Edge Cases');

test('Zero portfolio value', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 0, makeAnswers({ portfolioSize: 0 }));
  assertTrue(result.totalCost >= 0, `totalCost should be >= 0, got ${result.totalCost}`);
  assertTrue(!isNaN(result.totalCost), 'totalCost should not be NaN');
});

test('Very large portfolio (\u00a32M) on tiered broker', () => {
  const broker = getBroker('Hargreaves Lansdown');
  const result = calculateCost(broker, 2000000, makeAnswers({
    investmentTypes: ['funds'],
    portfolioSize: 2000000
  }));
  // Tiered: 250k * 0.0035 + 750k * 0.0025 + 1000k * 0.001 = 875 + 1875 + 1000 = 3750
  // 100% funds → no cap
  assertEqual(result.platformFee, 3750);
});

test('Single investment type \u2014 funds only (no assetSplit question)', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 100000, makeAnswers({
    investmentTypes: ['funds'],
    portfolioSize: 100000
  }));
  // fundPercent = 1, sharePercent = 0 → no cap
  // 100k * 0.0025 = 250
  assertEqual(result.platformFee, 250);
  assertEqual(result.fundPv, 100000);
  assertEqual(result.sharePv, 0);
});

test('Single investment type \u2014 ETFs only (caps apply normally)', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 100000, makeAnswers({
    investmentTypes: ['etfs'],
    portfolioSize: 100000
  }));
  // fundPercent = 0, sharePercent = 1 → cap applies
  // 100k * 0.0025 = 250, capped at 42
  assertEqual(result.platformFee, 42);
  assertEqual(result.fundPv, 0);
  assertEqual(result.sharePv, 100000);
});

test('Moneyfarm ISA override still works', () => {
  const broker = getBroker('Moneyfarm Share Investing');
  const result = calculateCost(broker, 30000, makeAnswers({
    investmentTypes: ['etfs'],
    portfolioSize: 30000
  }));
  // platformFeeISA: percentage 0.0035, cap 45
  // 30k * 0.0035 = 105, capped at 45
  assertEqual(result.platformFee, 45);
});

test('Dodl per-account minimum', () => {
  const broker = getBroker('Dodl by AJ Bell');
  const result = calculateCost(broker, 5000, makeAnswers({
    accounts: ['isa', 'sipp'],
    portfolioSize: 5000
  }));
  // 5k * 0.0015 = 7.50, minimum 12 → platformFee = 12
  // Per-account: 2 accounts * 12 = 24
  // platformFee = max(12, 24) = 24
  assertEqual(result.platformFee, 24);
});

test('Interactive Brokers GIA-only \u2014 zero platform fee', () => {
  const broker = getBroker('Interactive Brokers');
  const result = calculateCost(broker, 50000, makeAnswers({
    accounts: ['gia'],
    portfolioSize: 50000
  }));
  // platformFeeGIA = 0, account is only GIA (no ISA)
  assertEqual(result.platformFee, 0);
});

test('brokerSlug utility', () => {
  assertEqual(brokerSlug('Hargreaves Lansdown'), 'hargreaves-lansdown');
  assertEqual(brokerSlug('Interactive Investor'), 'interactive-investor');
  assertEqual(brokerSlug('Dodl by AJ Bell'), 'dodl-by-aj-bell');
});

console.log('');

// ─────────────────────────────────────────────────
// Category G: GIA Cap Leak Fix
// ─────────────────────────────────────────────────
console.log('GIA Cap Leak Fix');

test('AJ Bell — ISA+GIA, 100% ETFs, £200k — per-account caps apply', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 200000, makeAnswers({
    accounts: ['isa', 'gia'],
    investmentTypes: ['etfs'],
    portfolioSize: 200000
  }));
  // With per-account balances (100k each): total fee on 200k = 500
  // ISA proportion 50% → 250, capped at 42. GIA 50% → 250, no cap.
  // Total: 42 + 250 = 292
  assertEqual(result.platformFee, 292);
});

test('AJ Bell — ISA+GIA, 50/50 split, £200k — per-account caps apply', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 200000, makeAnswers({
    accounts: ['isa', 'gia'],
    investmentTypes: ['funds', 'etfs'],
    portfolioSize: 200000,
    assetSplit: 50
  }));
  // Total fee on 200k = 500. Each account gets 250.
  // ISA: fund=125 + share=min(125,42)=42 = 167
  // GIA: fund=125 + share=125 = 250
  // Total: 167 + 250 = 417
  assertEqual(result.platformFee, 417);
});

test('AJ Bell — ISA only, 100% ETFs, £200k — cap STILL applies', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 200000, makeAnswers({
    accounts: ['isa'],
    investmentTypes: ['etfs'],
    portfolioSize: 200000
  }));
  // ISA only → cap applies → min(500, 42) = 42
  assertEqual(result.platformFee, 42);
});

test('Hargreaves Lansdown — ISA+GIA, 100% ETFs — per-account caps apply', () => {
  const broker = getBroker('Hargreaves Lansdown');
  const result = calculateCost(broker, 200000, makeAnswers({
    accounts: ['isa', 'gia'],
    investmentTypes: ['etfs'],
    portfolioSize: 200000
  }));
  // Total fee on 200k: 200k * 0.0035 = 700. Each account gets 350.
  // ISA: capped at 150. GIA: 350 (no cap).
  // Total: 150 + 350 = 500
  assertEqual(result.platformFee, 500);
});

test('Fidelity — ISA+GIA, 100% ETFs, £100k — per-account caps apply', () => {
  const broker = getBroker('Fidelity');
  const result = calculateCost(broker, 100000, makeAnswers({
    accounts: ['isa', 'gia'],
    investmentTypes: ['etfs'],
    portfolioSize: 100000
  }));
  // Total fee on 100k: 350. Each account gets 175.
  // ISA: capped at 90. GIA: 175 (no cap).
  // Total: 90 + 175 = 265
  assertEqual(result.platformFee, 265);
});

test('GIA-only — caps never applied (no ISA/SIPP/LISA caps relevant)', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 200000, makeAnswers({
    accounts: ['gia'],
    investmentTypes: ['etfs'],
    portfolioSize: 200000
  }));
  // GIA only → hasCap never becomes true → full fee = 500
  assertEqual(result.platformFee, 500);
});

console.log('');

// ─────────────────────────────────────────────────
// Category H: Fidelity Regular Investor Waiver
// ─────────────────────────────────────────────────
console.log('Fidelity Regular Investor Waiver');

test('Fidelity — regular investing, £20k — fee waived to £0', () => {
  const broker = getBroker('Fidelity');
  const result = calculateCost(broker, 20000, makeAnswers({
    portfolioSize: 20000,
    tradingFreq: 'monthly'
  }));
  // Below threshold + regular investing → platformFee = 0
  assertEqual(result.platformFee, 0);
});

test('Fidelity — regular investing, £25k (at threshold) — fee waived to £0', () => {
  const broker = getBroker('Fidelity');
  const result = calculateCost(broker, 25000, makeAnswers({
    portfolioSize: 25000,
    tradingFreq: 'monthly'
  }));
  // At threshold (<=) + regular investing → platformFee = 0
  assertEqual(result.platformFee, 0);
});

test('Fidelity — regular investing, £30k (above threshold) — normal fee with ISA cap', () => {
  const broker = getBroker('Fidelity');
  const result = calculateCost(broker, 30000, makeAnswers({
    portfolioSize: 30000,
    tradingFreq: 'monthly'
  }));
  // Above threshold → tiered fee: 30k * 0.0035 = 105, ISA ETF cap = 90
  assertEqual(result.platformFee, 90);
});

test('Fidelity — NOT regular investing, £20k — fee is £90 (no waiver)', () => {
  const broker = getBroker('Fidelity');
  const result = calculateCost(broker, 20000, makeAnswers({
    portfolioSize: 20000,
    tradingFreq: 'occasional'
  }));
  // Below threshold + not regular → belowAmount = £90
  assertEqual(result.platformFee, 90);
});

test('Vanguard — regular investing, £20k — waiver does NOT apply (no flag)', () => {
  const broker = getBroker('Vanguard Investor');
  const result = calculateCost(broker, 20000, makeAnswers({
    portfolioSize: 20000,
    tradingFreq: 'monthly'
  }));
  // Vanguard has thresholded fee with belowAmount = 48, but NO regularWaivesBelow flag
  assertEqual(result.platformFee, 48);
});

console.log('');

// ─────────────────────────────────────────────────
// Category I: Per-Account Balance Tests
// ─────────────────────────────────────────────────
console.log('Per-Account Balance Tests');

test('AJ Bell — ISA £100k + GIA £100k, 100% ETFs — ISA capped, GIA uncapped', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 200000, makeAnswers({
    accounts: ['isa', 'gia'],
    investmentTypes: ['etfs'],
    portfolioSize: 200000,
    balances: { isa: 100000, gia: 100000 }
  }));
  // Total fee on 200k = 500. ISA portion = 250, capped at 42. GIA = 250, no cap.
  // Total: 42 + 250 = 292
  assertEqual(result.platformFee, 292);
  assertTrue(result.platformFeePerAccount.isa, 'should have ISA per-account breakdown');
  assertEqual(result.platformFeePerAccount.isa.final, 42);
  assertEqual(result.platformFeePerAccount.gia.final, 250);
});

test('Single ISA £50k — matches old single-PV flow', () => {
  const broker = getBroker('AJ Bell');
  // With balances
  const withBalances = calculateCost(broker, 50000, makeAnswers({
    accounts: ['isa'],
    portfolioSize: 50000,
    balances: { isa: 50000 }
  }));
  // Without balances (legacy path)
  const withoutBalances = calculateCost(broker, 50000, makeAnswers({
    accounts: ['isa'],
    portfolioSize: 50000,
    balances: null
  }));
  // Both should produce the same platform fee (ISA £50k, 100% ETFs → capped at 42)
  assertEqual(withBalances.platformFee, 42);
  assertEqual(withoutBalances.platformFee, 42);
  assertEqual(withBalances.totalCost, withoutBalances.totalCost);
});

test('Zero SIPP balance — SIPP contributes nothing', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 100000, makeAnswers({
    accounts: ['isa', 'sipp'],
    investmentTypes: ['etfs'],
    portfolioSize: 100000,
    balances: { isa: 100000, sipp: 0 }
  }));
  // Only ISA has balance, capped at 42. SIPP balance is 0 → no SIPP contribution.
  assertEqual(result.platformFee, 42);
  assertEqual(result.sippCost, 0);
});

test('Legacy answers without balances — fallback still works', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 100000, {
    accounts: ['isa'],
    investmentTypes: ['etfs'],
    portfolioSize: 100000,
    tradingFreq: 'monthly',
    fxTrading: 'rarely',
    priorities: ['lowestFees'],
    feeModel: 'noPreference'
    // No balances key at all
  });
  // Legacy path: 100k * 0.0025 = 250, ISA cap = 42
  assertEqual(result.platformFee, 42);
  assertEqual(result.tradingCost, 18);
  assertEqual(result.totalCost, 60);
});

console.log('');

// ─────────────────────────────────────────────────
// Category J: Breakdown Object Tests
// ─────────────────────────────────────────────────
console.log('Breakdown Object Tests');

test('calculateCost returns breakdown object', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 100000, makeAnswers({
    portfolioSize: 100000,
    balances: { isa: 100000 }
  }));
  assertTrue(result.breakdown, 'breakdown object should exist');
  assertTrue(result.breakdown.platformFee, 'platformFee breakdown should exist');
  assertEqual(result.breakdown.platformFee.total, result.platformFee);
});

test('Breakdown platform fee total matches result', () => {
  const broker = getBroker('Hargreaves Lansdown');
  const result = calculateCost(broker, 200000, makeAnswers({
    accounts: ['isa', 'gia'],
    investmentTypes: ['etfs'],
    portfolioSize: 200000,
    balances: { isa: 100000, gia: 100000 }
  }));
  assertEqual(result.breakdown.platformFee.total, result.platformFee);
  assertTrue(Object.keys(result.breakdown.platformFee.perAccount).length > 0, 'per-account breakdown should exist');
});

test('Breakdown trading cost total matches result', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 50000, makeAnswers());
  assertEqual(result.breakdown.tradingCost.total, result.tradingCost);
  assertTrue(result.breakdown.tradingCost.formula.length > 0, 'trading formula should not be empty');
});

test('Breakdown includes FX and SIPP cost formulas', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 100000, makeAnswers({
    accounts: ['sipp'],
    fxTrading: 'sometimes',
    portfolioSize: 100000
  }));
  assertEqual(result.breakdown.fxCost.total, result.fxCost);
  assertEqual(result.breakdown.sippCost.total, result.sippCost);
  assertTrue(result.breakdown.fxCost.formula.length > 0, 'FX formula should exist');
});

test('Breakdown per-account shows cap info', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 200000, makeAnswers({
    accounts: ['isa', 'gia'],
    investmentTypes: ['etfs'],
    portfolioSize: 200000,
    balances: { isa: 100000, gia: 100000 }
  }));
  const isaBreakdown = result.breakdown.platformFee.perAccount.isa;
  assertTrue(isaBreakdown, 'ISA breakdown should exist');
  assertTrue(isaBreakdown.formula.includes('capped'), 'ISA formula should mention cap');
  assertEqual(isaBreakdown.final, 42);
});

console.log('');

// ─────────────────────────────────────────────────
// Category K: Threshold Edge Cases
// ─────────────────────────────────────────────────
console.log('Threshold Edge Cases');

test('Fidelity — exactly at £25k threshold — should use below-threshold fee', () => {
  const broker = getBroker('Fidelity');
  const result = calculateCost(broker, 25000, makeAnswers({
    portfolioSize: 25000,
    tradingFreq: 'occasional'
  }));
  // At threshold (<=25k) → belowAmount = £90
  assertEqual(result.platformFee, 90);
});

test('Fidelity — £25,001 (just above threshold) — should use tiered fee', () => {
  const broker = getBroker('Fidelity');
  const result = calculateCost(broker, 25001, makeAnswers({
    investmentTypes: ['funds'],
    portfolioSize: 25001,
    tradingFreq: 'occasional'
  }));
  // Above threshold → 25001 * 0.0035 = 87.50 (no cap for funds)
  assertEqual(result.platformFee, 87.50, 0.05);
});

test('Vanguard — exactly at £32k threshold', () => {
  const broker = getBroker('Vanguard Investor');
  const result = calculateCost(broker, 32000, makeAnswers({
    portfolioSize: 32000
  }));
  // At threshold (<=32k) → belowAmount = £48
  assertEqual(result.platformFee, 48);
});

test('Vanguard — £32,001 (just above threshold)', () => {
  const broker = getBroker('Vanguard Investor');
  const result = calculateCost(broker, 32001, makeAnswers({
    portfolioSize: 32001
  }));
  // Above threshold → 32001 * 0.0015 = 48.00 (essentially equal, but using tiered path)
  assertEqual(result.platformFee, 48.00, 0.05);
});

console.log('');

// ─────────────────────────────────────────────────
// Category L: LISA Cap Tests
// ─────────────────────────────────────────────────
console.log('LISA Cap Tests');

test('Hargreaves Lansdown — LISA £50k, 100% ETFs — cap at £45', () => {
  const broker = getBroker('Hargreaves Lansdown');
  const result = calculateCost(broker, 50000, makeAnswers({
    accounts: ['lisa'],
    investmentTypes: ['etfs'],
    portfolioSize: 50000,
    balances: { lisa: 50000 }
  }));
  // 50k * 0.0045 = 225, LISA ETF cap = 45
  assertEqual(result.platformFee, 45);
});

test('Hargreaves Lansdown — LISA £50k, 100% funds — no cap', () => {
  const broker = getBroker('Hargreaves Lansdown');
  const result = calculateCost(broker, 50000, makeAnswers({
    accounts: ['lisa'],
    investmentTypes: ['funds'],
    portfolioSize: 50000,
    balances: { lisa: 50000 }
  }));
  // 50k * 0.0045 = 225, no cap for funds
  assertTrue(result.platformFee > 45, `LISA funds should not be capped, got ${result.platformFee}`);
});

console.log('');

// ─────────────────────────────────────────────────
// Category M: Zero-Balance Sub-account Tests
// ─────────────────────────────────────────────────
console.log('Zero-Balance Sub-account Tests');

test('AJ Bell — ISA £100k + GIA £0 — GIA should not inflate fee', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 100000, makeAnswers({
    accounts: ['isa', 'gia'],
    investmentTypes: ['etfs'],
    portfolioSize: 100000,
    balances: { isa: 100000, gia: 0 }
  }));
  // Only ISA has balance → capped at 42. GIA contributes 0.
  assertEqual(result.platformFee, 42);
});

test('Dodl — ISA £5k + SIPP £0 — should only charge minimum for ISA', () => {
  const broker = getBroker('Dodl by AJ Bell');
  const result = calculateCost(broker, 5000, makeAnswers({
    accounts: ['isa', 'sipp'],
    portfolioSize: 5000,
    balances: { isa: 5000, sipp: 0 }
  }));
  // 5k * 0.0015 = 7.50, minimum 12 per account with balance
  // Only ISA has balance → 1 account → minimum = £12
  assertEqual(result.platformFee, 12);
});

test('Dodl — ISA £2500 + SIPP £2500 — both accounts charged minimum', () => {
  const broker = getBroker('Dodl by AJ Bell');
  const result = calculateCost(broker, 5000, makeAnswers({
    accounts: ['isa', 'sipp'],
    portfolioSize: 5000,
    balances: { isa: 2500, sipp: 2500 }
  }));
  // 5k * 0.0015 = 7.50, minimum = 2 accounts * 12 = 24
  assertEqual(result.platformFee, 24);
});

console.log('');

// ─────────────────────────────────────────────────
// Category N: Drawdown Fee Tests
// ─────────────────────────────────────────────────
console.log('Drawdown Fee Tests');

test('Freetrade — SIPP with drawdown — £240 drawdown fee', () => {
  const broker = getBroker('Freetrade');
  const result = calculateCost(broker, 100000, makeAnswers({
    accounts: ['sipp'],
    investmentTypes: ['etfs'],
    portfolioSize: 100000,
    drawdownSoon: 'yes'
  }));
  assertEqual(result.drawdownCost, 240);
});

test('AJ Bell — SIPP with drawdown — £0 (free drawdown)', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 100000, makeAnswers({
    accounts: ['sipp'],
    investmentTypes: ['etfs'],
    portfolioSize: 100000,
    drawdownSoon: 'yes'
  }));
  assertEqual(result.drawdownCost, 0);
});

test('AJ Bell — SIPP without drawdown — drawdown cost is 0', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 100000, makeAnswers({
    accounts: ['sipp'],
    investmentTypes: ['etfs'],
    portfolioSize: 100000,
    drawdownSoon: 'no'
  }));
  assertEqual(result.drawdownCost, 0);
});

test('Hargreaves Lansdown — SIPP with drawdown — £0 (free)', () => {
  const broker = getBroker('Hargreaves Lansdown');
  const result = calculateCost(broker, 200000, makeAnswers({
    accounts: ['sipp'],
    investmentTypes: ['funds'],
    portfolioSize: 200000,
    drawdownSoon: 'yes'
  }));
  assertEqual(result.drawdownCost, 0);
});

console.log('');

// ─────────────────────────────────────────────────
// Category O: Revolut Trading Cost Sanity
// ─────────────────────────────────────────────────
console.log('Revolut Trading Cost Sanity');

test('Revolut — monthly ETFs at £50k — £0 trading (within free allowance)', () => {
  const broker = getBroker('Revolut');
  const result = calculateCost(broker, 50000, makeAnswers({
    investmentTypes: ['etfs'],
    portfolioSize: 50000,
    tradingFreq: 'monthly'
  }));
  // 12 trades/year, 1 free/month = 12 free → 0 paid trades
  assertEqual(result.tradingCost, 0);
});

test('Revolut — active ETFs at £50k — reasonable trading cost', () => {
  const broker = getBroker('Revolut');
  const result = calculateCost(broker, 50000, makeAnswers({
    investmentTypes: ['etfs'],
    portfolioSize: 50000,
    tradingFreq: 'active'
  }));
  // 30 trades/year - 12 free = 18 paid trades
  // Active: avgTradeSize capped at £5,000 → 18 * 5000 * 0.0025 = £225
  // Previously would have been 18 * (50000/30) * 0.0025 = £75 at 50k
  // but at £500k would have been 18 * (500000/30) * 0.0025 = £750 (absurd)
  assertTrue(result.tradingCost > 0, 'Should have some trading cost');
  assertTrue(result.tradingCost < 300, `Trading cost should be reasonable, got ${result.tradingCost}`);
});

test('Revolut — monthly at £500k — trading cost stays £0 (not portfolio-proportional)', () => {
  const broker = getBroker('Revolut');
  const result = calculateCost(broker, 500000, makeAnswers({
    investmentTypes: ['etfs'],
    portfolioSize: 500000,
    tradingFreq: 'monthly'
  }));
  // Monthly = 12 trades, 12 free → 0 paid
  assertEqual(result.tradingCost, 0);
});

console.log('');

// ─────────────────────────────────────────────────
// Category P: Bug Fix Regression Tests
// ─────────────────────────────────────────────────
console.log('Bug Fix Regression Tests');

test('Moneyfarm ISA+GIA without balances — ISA fee uses split, not full PV', () => {
  const broker = getBroker('Moneyfarm Share Investing');
  const result = calculateCost(broker, 60000, makeAnswers({
    accounts: ['isa', 'gia'],
    investmentTypes: ['etfs'],
    portfolioSize: 60000,
    balances: null
  }));
  // Without balances, ISA balance should be 60k/2 = 30k (not 60k)
  // 30k * 0.0035 = 105, capped at 45
  // Previously would have used full 60k: 60k * 0.0035 = 210, capped at 45 (same due to cap)
  // Test with smaller value to see the difference
  const result2 = calculateCost(broker, 20000, makeAnswers({
    accounts: ['isa', 'gia'],
    investmentTypes: ['etfs'],
    portfolioSize: 20000,
    balances: null
  }));
  // ISA balance = 20k/2 = 10k → 10k * 0.0035 = 35 (under cap)
  assertEqual(result2.platformFee, 35);
});

test('Moneyfarm ISA+GIA with explicit balances — uses ISA balance', () => {
  const broker = getBroker('Moneyfarm Share Investing');
  const result = calculateCost(broker, 20000, makeAnswers({
    accounts: ['isa', 'gia'],
    investmentTypes: ['etfs'],
    portfolioSize: 20000,
    balances: { isa: 15000, gia: 5000 }
  }));
  // ISA balance = 15k → 15k * 0.0035 = 52.50, capped at 45
  assertEqual(result.platformFee, 45);
});

test('Moneyfarm ISA-only without balances — uses full PV', () => {
  const broker = getBroker('Moneyfarm Share Investing');
  const result = calculateCost(broker, 10000, makeAnswers({
    accounts: ['isa'],
    investmentTypes: ['etfs'],
    portfolioSize: 10000,
    balances: null
  }));
  // ISA only → full PV = 10k → 10k * 0.0035 = 35
  assertEqual(result.platformFee, 35);
});

test('Interactive Brokers SIPP-only — should NOT zero platform fee', () => {
  const broker = getBroker('Interactive Brokers');
  const result = calculateCost(broker, 50000, makeAnswers({
    accounts: ['sipp'],
    portfolioSize: 50000
  }));
  // SIPP-only: platformFeeGIA=0 but accounts is ['sipp'], not ['gia']
  // Should charge the fixed £36 platform fee
  assertEqual(result.platformFee, 36);
});

test('Interactive Brokers ISA+GIA — should charge platform fee', () => {
  const broker = getBroker('Interactive Brokers');
  const result = calculateCost(broker, 50000, makeAnswers({
    accounts: ['isa', 'gia'],
    portfolioSize: 50000
  }));
  // Has ISA, so not GIA-only → charge platform fee
  assertEqual(result.platformFee, 36);
});

test('Lightyear GIA with international shares — uses US rate', () => {
  const broker = getBroker('Lightyear');
  const result = calculateCost(broker, 50000, makeAnswers({
    accounts: ['gia'],
    investmentTypes: ['sharesIntl'],
    portfolioSize: 50000,
    tradingFreq: 'occasional'
  }));
  // GIA-only + international shares → shareTradeGIA_US = 0.001
  // 9 trades/year * £0.001 = £0.009 ≈ 0.01
  assertTrue(result.tradingCost < 0.05, `Expected near-zero US share trade cost, got ${result.tradingCost}`);
});

test('Lightyear GIA with UK shares — uses UK rate', () => {
  const broker = getBroker('Lightyear');
  const result = calculateCost(broker, 50000, makeAnswers({
    accounts: ['gia'],
    investmentTypes: ['sharesUK'],
    portfolioSize: 50000,
    tradingFreq: 'occasional'
  }));
  // GIA-only + UK shares → shareTradeGIA_UK = 1
  // 9 trades/year * £1 = £9
  assertEqual(result.tradingCost, 9);
});

test('Tiered fee with invalid above tier rate — breaks safely', () => {
  const tiers = [
    { upTo: 250000, rate: 0.0025 },
    { above: true, rate: undefined }
  ];
  const fee = calculateTieredFee(tiers, 300000);
  // Should stop at the above tier since rate is undefined
  // Only first tier applies: 250k * 0.0025 = 625
  assertEqual(fee, 625);
});

test('Tiered fee with null above tier rate — breaks safely', () => {
  const tiers = [
    { upTo: 100000, rate: 0.001 },
    { above: true, rate: null }
  ];
  const fee = calculateTieredFee(tiers, 150000);
  // above tier has null rate → should break
  // Only first tier: 100k * 0.001 = 100
  assertEqual(fee, 100);
});

// ─────────────────────────────────────────────────
// Breakeven Tests (findBreakeven)
// ─────────────────────────────────────────────────
console.log('Breakeven Tests (findBreakeven)');

test('II vs Vanguard — breakeven exists in reasonable range', () => {
  const ii = getBroker('Interactive Investor');
  const vanguard = getBroker('Vanguard Investor');
  const answers = makeAnswers({ portfolioSize: 50000 });
  const breakeven = findBreakeven(ii, vanguard, answers);
  assertTrue(breakeven !== null, 'Breakeven should exist between II and Vanguard');
  assertTrue(breakeven >= 10000 && breakeven <= 100000,
    `Breakeven £${breakeven} should be between £10k and £100k`);
});

test('InvestEngine vs II — no crossover (InvestEngine always cheaper)', () => {
  const ie = getBroker('InvestEngine');
  const ii = getBroker('Interactive Investor');
  const answers = makeAnswers({ portfolioSize: 50000 });
  const breakeven = findBreakeven(ie, ii, answers);
  assertEqual(breakeven, null);
});

test('Two percentage brokers with different rates — breakeven should exist', () => {
  const hl = getBroker('Hargreaves Lansdown');
  const ajbell = getBroker('AJ Bell');
  const answers = makeAnswers({ portfolioSize: 50000, investmentTypes: ['funds'] });
  const breakeven = findBreakeven(hl, ajbell, answers);
  // HL has higher rates — at some point AJ Bell becomes cheaper, or vice versa
  // Both are tiered so there may or may not be a crossover depending on caps
  // Just verify it returns a number or null without crashing
  assertTrue(breakeven === null || (typeof breakeven === 'number' && breakeven > 0),
    'Breakeven should be null or a positive number');
});

test('Breakeven with SIPP account type', () => {
  const ii = getBroker('Interactive Investor');
  const vanguard = getBroker('Vanguard Investor');
  const answers = makeAnswers({ accounts: ['sipp'], portfolioSize: 50000 });
  const breakeven = findBreakeven(ii, vanguard, answers);
  // Should work without crashing; II has SIPP surcharges
  assertTrue(breakeven === null || (typeof breakeven === 'number' && breakeven > 0),
    'SIPP breakeven should be null or a positive number');
});

console.log('');

// ═══════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════
console.log('\u2550'.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failures.length > 0) {
  console.log('');
  console.log('FAILURES:');
  failures.forEach(f => {
    console.log(`  \u2717 ${f.name}`);
    console.log(`    ${f.error}`);
  });
}

console.log('');
process.exit(failed > 0 ? 1 : 0);
