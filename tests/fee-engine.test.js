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
  return {
    accounts: ['isa'],
    investmentTypes: ['etfs'],
    portfolioSize: 50000,
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

test('AJ Bell — ISA+GIA, 100% ETFs, £200k — cap should NOT apply', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 200000, makeAnswers({
    accounts: ['isa', 'gia'],
    investmentTypes: ['etfs'],
    portfolioSize: 200000
  }));
  // GIA present → no cap → full tiered fee: 200k * 0.0025 = 500
  assertEqual(result.platformFee, 500);
});

test('AJ Bell — ISA+GIA, 50/50 split, £200k — cap should NOT apply', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 200000, makeAnswers({
    accounts: ['isa', 'gia'],
    investmentTypes: ['funds', 'etfs'],
    portfolioSize: 200000,
    assetSplit: 50
  }));
  // fullFee = 500, fundFee = 250, shareFeeRaw = 250
  // GIA present → no cap → platformFee = 250 + 250 = 500
  assertEqual(result.platformFee, 500);
});

test('AJ Bell — ISA only, 100% ETFs, £200k — cap STILL applies', () => {
  const broker = getBroker('AJ Bell');
  const result = calculateCost(broker, 200000, makeAnswers({
    accounts: ['isa'],
    investmentTypes: ['etfs'],
    portfolioSize: 200000
  }));
  // ISA only, no GIA → cap applies → min(500, 42) = 42
  assertEqual(result.platformFee, 42);
});

test('Hargreaves Lansdown — ISA+GIA, 100% ETFs — cap should NOT apply', () => {
  const broker = getBroker('Hargreaves Lansdown');
  const result = calculateCost(broker, 200000, makeAnswers({
    accounts: ['isa', 'gia'],
    investmentTypes: ['etfs'],
    portfolioSize: 200000
  }));
  // 200k tiered: 200k * 0.0035 = 700, no cap due to GIA
  assertEqual(result.platformFee, 700);
});

test('Fidelity — ISA+GIA, 100% ETFs, £100k — cap should NOT apply', () => {
  const broker = getBroker('Fidelity');
  const result = calculateCost(broker, 100000, makeAnswers({
    accounts: ['isa', 'gia'],
    investmentTypes: ['etfs'],
    portfolioSize: 100000
  }));
  // 100k * 0.0035 = 350, GIA present → no cap
  assertEqual(result.platformFee, 350);
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
