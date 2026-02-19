// ═══════════════════════════════════════════════════
// COMPOUND INTEREST CALCULATOR
// ═══════════════════════════════════════════════════

const defaults = {
  startingAmount: 10000,
  monthlyContribution: 500,
  growthRate: 7,
  platformFee: 0.25,
  fundOCF: 0.15,
  years: 20
};

let chartData = null;

function debounce(fn, delay) {
  let timer;
  return function() {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, arguments), delay);
  };
}

function getInputs() {
  const raw = {
    startingAmount: Math.max(0, parseFloat(document.getElementById('startingAmount').value) || 0),
    monthlyContribution: Math.max(0, parseFloat(document.getElementById('monthlyContribution').value) || 0),
    growthRate: Math.min(30, Math.max(0, parseFloat(document.getElementById('growthRate').value) || 0)),
    platformFee: Math.min(5, Math.max(0, parseFloat(document.getElementById('platformFee').value) || 0)),
    fundOCF: Math.min(5, Math.max(0, parseFloat(document.getElementById('fundOCF').value) || 0)),
    years: Math.min(40, Math.max(1, parseInt(document.getElementById('yearsSlider').value) || 20))
  };

  const inflationOn = document.getElementById('inflationToggle')?.checked;
  if (inflationOn) {
    const inflationRate = parseFloat(document.getElementById('inflationRate')?.value) || 2.5;
    raw.growthRate = Math.max(raw.growthRate - inflationRate, 0);
    raw.inflationAdjusted = true;
  }

  return raw;
}

function calculate() {
  const inputs = getInputs();
  const { startingAmount, monthlyContribution, growthRate, platformFee, fundOCF, years } = inputs;

  const annualGrowth = Math.max(growthRate, 0) / 100;
  const totalFeeRate = (platformFee + fundOCF) / 100;

  // Calculate year-by-year with fees
  let balanceWithFees = startingAmount;
  let balanceWithoutFees = startingAmount;
  let totalContributions = startingAmount;
  let totalFeesAccumulated = 0;

  const yearlyData = [{ year: 0, withFees: startingAmount, withoutFees: startingAmount, contributions: startingAmount, fees: 0 }];

  for (let y = 1; y <= years; y++) {
    // Monthly compounding with contributions
    for (let m = 0; m < 12; m++) {
      // Growth for the month
      balanceWithFees *= (1 + annualGrowth / 12);
      balanceWithoutFees *= (1 + annualGrowth / 12);

      // Deduct fees monthly (proportional)
      const monthlyFee = balanceWithFees * (totalFeeRate / 12);
      balanceWithFees -= monthlyFee;
      totalFeesAccumulated += monthlyFee;

      // Add contribution
      balanceWithFees += monthlyContribution;
      balanceWithoutFees += monthlyContribution;
      totalContributions += monthlyContribution;
    }

    yearlyData.push({
      year: y,
      withFees: balanceWithFees,
      withoutFees: balanceWithoutFees,
      contributions: totalContributions,
      fees: totalFeesAccumulated
    });
  }

  chartData = yearlyData;

  // Update results
  const finalWithFees = yearlyData[years].withFees;
  const finalWithoutFees = yearlyData[years].withoutFees;
  const totalGrowthWithFees = finalWithFees - totalContributions;
  const feeDrag = finalWithoutFees - finalWithFees;

  document.getElementById('finalValue').textContent = formatCurrency(Math.round(finalWithFees));
  document.getElementById('totalContributions').textContent = formatCurrency(Math.round(totalContributions));
  document.getElementById('totalGrowth').textContent = formatCurrency(Math.round(Math.abs(totalGrowthWithFees)));
  // Add loss indicator
  if (totalGrowthWithFees < 0) {
    document.getElementById('totalGrowth').textContent = '-' + formatCurrency(Math.round(Math.abs(totalGrowthWithFees)));
    document.getElementById('totalGrowth').style.color = 'var(--red)';
  } else {
    document.getElementById('totalGrowth').style.color = '';
  }
  document.getElementById('totalFees').textContent = formatCurrency(Math.round(totalFeesAccumulated));
  document.getElementById('feeDrag').textContent = formatCurrency(Math.round(feeDrag));
  document.getElementById('withoutFeesValue').textContent = formatCurrency(Math.round(finalWithoutFees));

  // Update contribution/growth bar
  const contribPercent = finalWithFees > 0 ? (totalContributions / finalWithFees * 100) : 0;
  document.getElementById('contribBar').style.width = Math.min(contribPercent, 100) + '%';
  document.getElementById('growthBar').style.width = Math.max(100 - contribPercent, 0) + '%';

  // Update labels based on inflation toggle
  const inflationOn = document.getElementById('inflationToggle')?.checked;
  const realLabel = inflationOn ? ' (in today\'s money)' : '';
  document.querySelector('.result-card.highlight .result-sub').textContent = 'after fees' + realLabel;

  document.getElementById('results').style.display = 'block';
  drawChart();
}

function drawChart() {
  if (!chartData) return;

  // Read colours from CSS custom properties
  const styles = getComputedStyle(document.documentElement);
  const gridColor = styles.getPropertyValue('--border').trim();
  const labelColor = styles.getPropertyValue('--text-muted').trim();
  const accentColor = styles.getPropertyValue('--accent').trim();
  const textSecondary = styles.getPropertyValue('--text-secondary').trim();

  const maxVal = Math.max(...chartData.map(d => d.withoutFees));
  if (maxVal === 0) {
    // Nothing to chart — clear canvas and return
    const canvas = document.getElementById('growthChart');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = labelColor;
    ctx.font = '13px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Enter a starting amount or monthly contribution to see the chart', rect.width / 2, rect.height / 2);
    return;
  }

  const canvas = document.getElementById('growthChart');
  const ctx = canvas.getContext('2d');

  // High DPI support
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const padding = { top: 30, right: 20, bottom: 40, left: 65 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  // Clear
  ctx.clearRect(0, 0, w, h);
  const years = chartData.length - 1;

  function xPos(year) { return padding.left + (year / years) * chartW; }
  function yPos(val) {
    if (maxVal === 0 || !isFinite(val)) return padding.top + chartH;
    return padding.top + chartH - (val / maxVal) * chartH;
  }

  // Grid lines
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + (i / gridLines) * chartH;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();

    // Y labels
    const val = maxVal * (1 - i / gridLines);
    ctx.fillStyle = labelColor;
    ctx.font = '11px "DM Sans", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatCurrency(Math.round(val)), padding.left - 8, y + 4);
  }

  // X labels
  ctx.textAlign = 'center';
  const xStep = years <= 10 ? 1 : years <= 20 ? 2 : 5;
  for (let y = 0; y <= years; y += xStep) {
    ctx.fillStyle = labelColor;
    ctx.fillText(`Yr ${y}`, xPos(y), h - padding.bottom + 20);
  }

  // Contributions area
  ctx.beginPath();
  ctx.moveTo(xPos(0), yPos(chartData[0].contributions));
  for (let i = 1; i < chartData.length; i++) {
    ctx.lineTo(xPos(i), yPos(chartData[i].contributions));
  }
  ctx.lineTo(xPos(years), yPos(0));
  ctx.lineTo(xPos(0), yPos(0));
  ctx.closePath();
  ctx.fillStyle = accentColor + '14';
  ctx.fill();

  // Without fees line
  ctx.beginPath();
  ctx.moveTo(xPos(0), yPos(chartData[0].withoutFees));
  for (let i = 1; i < chartData.length; i++) {
    ctx.lineTo(xPos(i), yPos(chartData[i].withoutFees));
  }
  ctx.strokeStyle = labelColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // With fees line
  ctx.beginPath();
  ctx.moveTo(xPos(0), yPos(chartData[0].withFees));
  for (let i = 1; i < chartData.length; i++) {
    ctx.lineTo(xPos(i), yPos(chartData[i].withFees));
  }
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Contributions line
  ctx.beginPath();
  ctx.moveTo(xPos(0), yPos(chartData[0].contributions));
  for (let i = 1; i < chartData.length; i++) {
    ctx.lineTo(xPos(i), yPos(chartData[i].contributions));
  }
  ctx.strokeStyle = accentColor + '4d';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Legend
  const legendY = 12;
  ctx.font = '11px "DM Sans", sans-serif';

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(padding.left, legendY);
  ctx.lineTo(padding.left + 20, legendY);
  ctx.stroke();
  ctx.fillStyle = textSecondary;
  ctx.textAlign = 'left';
  ctx.fillText('With fees', padding.left + 25, legendY + 4);

  const leg2x = padding.left + 100;
  ctx.strokeStyle = labelColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(leg2x, legendY);
  ctx.lineTo(leg2x + 20, legendY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillText('Without fees', leg2x + 25, legendY + 4);

  const leg3x = leg2x + 110;
  ctx.fillStyle = accentColor + '4d';
  ctx.fillRect(leg3x, legendY - 5, 20, 10);
  ctx.fillStyle = textSecondary;
  ctx.fillText('Contributions', leg3x + 25, legendY + 4);
}

function initChartTooltip() {
  const canvas = document.getElementById('growthChart');
  const tooltip = document.getElementById('chartTooltip');
  if (!canvas || !tooltip) return;

  function showTooltip(clientX) {
    if (!chartData || chartData.length < 2) return;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const w = rect.width;
    const padding = { left: 65, right: 20 };
    const chartW = w - padding.left - padding.right;
    const years = chartData.length - 1;

    const relX = x - padding.left;
    if (relX < 0 || relX > chartW) {
      tooltip.style.display = 'none';
      return;
    }
    const yearIndex = Math.round((relX / chartW) * years);
    const clamped = Math.max(0, Math.min(yearIndex, years));
    const d = chartData[clamped];

    const tooltipX = padding.left + (clamped / years) * chartW;
    const flipSide = tooltipX > w * 0.65;
    tooltip.style.display = 'block';
    tooltip.style.left = flipSide ? (tooltipX - tooltip.offsetWidth - 12) + 'px' : (tooltipX + 12) + 'px';
    tooltip.style.top = '40px';

    document.getElementById('tooltipYear').textContent = 'Year ' + d.year;
    document.getElementById('tooltipWithFees').textContent = 'With fees: ' + formatCurrency(Math.round(d.withFees));
    document.getElementById('tooltipWithoutFees').textContent = 'Without fees: ' + formatCurrency(Math.round(d.withoutFees));
    document.getElementById('tooltipContribs').textContent = 'Contributed: ' + formatCurrency(Math.round(d.contributions));
    document.getElementById('tooltipFees').textContent = 'Fees paid: ' + formatCurrency(Math.round(d.fees));
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
  }

  canvas.addEventListener('mousemove', (e) => showTooltip(e.clientX));
  canvas.addEventListener('mouseleave', hideTooltip);
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length > 0) showTooltip(e.touches[0].clientX);
  }, { passive: false });
  canvas.addEventListener('touchend', hideTooltip);
}

function updateYearsLabel() {
  const val = document.getElementById('yearsSlider').value;
  document.getElementById('yearsValue').textContent = val + ' years';
}

// ── URL Parameter Encoding/Decoding ──
function decodeCalcParamsFromURL() {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const result = {};
  if (params.has('start')) result.startingAmount = parseFloat(params.get('start'));
  if (params.has('monthly')) result.monthlyContribution = parseFloat(params.get('monthly'));
  if (params.has('growth')) result.growthRate = parseFloat(params.get('growth'));
  if (params.has('fee')) result.platformFee = parseFloat(params.get('fee'));
  if (params.has('ocf')) result.fundOCF = parseFloat(params.get('ocf'));
  if (params.has('years')) result.years = parseInt(params.get('years'));
  if (params.has('broker')) result.brokerName = params.get('broker');
  if (params.has('inflation')) result.inflation = parseFloat(params.get('inflation'));
  return Object.keys(result).length > 0 ? result : null;
}

function encodeCalcParamsToURL() {
  // Use raw input values (not inflation-adjusted) for URL
  const params = new URLSearchParams({
    start: parseFloat(document.getElementById('startingAmount').value) || 0,
    monthly: parseFloat(document.getElementById('monthlyContribution').value) || 0,
    growth: parseFloat(document.getElementById('growthRate').value) || 0,
    fee: parseFloat(document.getElementById('platformFee').value) || 0,
    ocf: parseFloat(document.getElementById('fundOCF').value) || 0,
    years: parseInt(document.getElementById('yearsSlider').value) || 20
  });
  const inflationOn = document.getElementById('inflationToggle')?.checked;
  if (inflationOn) {
    params.set('inflation', document.getElementById('inflationRate')?.value || '2.5');
  }
  history.replaceState(null, '', '#' + params.toString());
}

function showBrokerBanner(brokerName) {
  // Remove existing banner if present
  const existing = document.querySelector('.broker-context-banner');
  if (existing) existing.remove();
  const banner = document.createElement('div');
  banner.className = 'broker-context-banner';
  banner.innerHTML = `Modelling fees for <strong id="bannerBrokerName"></strong> — <a href="/compare/" style="color:var(--accent)">back to comparison</a>`;
  const calcInputs = document.getElementById('calcForm');
  calcInputs.parentNode.insertBefore(banner, calcInputs);
  document.querySelector('#bannerBrokerName').textContent = brokerName;
}

function copyCalcLink(btn) {
  navigator.clipboard.writeText(window.location.href).then(() => {
    btn.textContent = 'Link copied!';
    setTimeout(() => { btn.textContent = 'Share this scenario'; }, 2000);
  });
}

// Initialise
document.addEventListener('DOMContentLoaded', () => {
  // Set defaults
  document.getElementById('startingAmount').value = defaults.startingAmount;
  document.getElementById('monthlyContribution').value = defaults.monthlyContribution;
  document.getElementById('growthRate').value = defaults.growthRate;
  document.getElementById('platformFee').value = defaults.platformFee;
  document.getElementById('fundOCF').value = defaults.fundOCF;
  document.getElementById('yearsSlider').value = defaults.years;
  updateYearsLabel();

  // Check for URL parameters (e.g. from broker comparison link)
  const urlParams = decodeCalcParamsFromURL();
  if (urlParams) {
    if (urlParams.startingAmount !== undefined) document.getElementById('startingAmount').value = urlParams.startingAmount;
    if (urlParams.monthlyContribution !== undefined) document.getElementById('monthlyContribution').value = urlParams.monthlyContribution;
    if (urlParams.growthRate !== undefined) document.getElementById('growthRate').value = urlParams.growthRate;
    if (urlParams.platformFee !== undefined) document.getElementById('platformFee').value = urlParams.platformFee;
    if (urlParams.fundOCF !== undefined) document.getElementById('fundOCF').value = urlParams.fundOCF;
    if (urlParams.years !== undefined) {
      document.getElementById('yearsSlider').value = urlParams.years;
      updateYearsLabel();
    }
    if (urlParams.brokerName) {
      showBrokerBanner(urlParams.brokerName);
    }
    if (urlParams.inflation !== undefined) {
      document.getElementById('inflationToggle').checked = true;
      document.getElementById('inflationRate').value = urlParams.inflation;
      document.getElementById('inflationHint').style.display = 'block';
    }
  }

  // Debounced versions of calculate + URL update
  const debouncedCalc = debounce(() => { calculate(); encodeCalcParamsToURL(); }, 150);

  // Auto-calculate on any input change
  document.querySelectorAll('#calcForm input').forEach(input => {
    // Skip inflation inputs — they have their own handlers
    if (input.id === 'inflationToggle' || input.id === 'inflationRate') return;
    input.addEventListener('input', () => {
      if (input.id === 'yearsSlider') {
        updateYearsLabel();
        calculate();
        encodeCalcParamsToURL();
      } else {
        debouncedCalc();
      }
    });
  });

  // Inflation toggle and rate
  const inflationToggle = document.getElementById('inflationToggle');
  const inflationHint = document.getElementById('inflationHint');
  const inflationRateInput = document.getElementById('inflationRate');

  if (inflationToggle) {
    inflationToggle.addEventListener('change', () => {
      inflationHint.style.display = inflationToggle.checked ? 'block' : 'none';
      calculate();
      encodeCalcParamsToURL();
    });
  }
  if (inflationRateInput) {
    inflationRateInput.addEventListener('input', () => {
      debouncedCalc();
    });
  }

  // Bind share button
  const btnShareCalc = document.getElementById('btnShareCalc');
  if (btnShareCalc) btnShareCalc.addEventListener('click', () => copyCalcLink(btnShareCalc));

  // Initial calculation
  calculate();
  if (urlParams) encodeCalcParamsToURL();
  initChartTooltip();

  // Redraw chart on resize (debounced)
  const debouncedResize = debounce(() => { if (chartData) drawChart(); }, 200);
  window.addEventListener('resize', debouncedResize);
});
