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

function getInputs() {
  return {
    startingAmount: parseFloat(document.getElementById('startingAmount').value) || 0,
    monthlyContribution: parseFloat(document.getElementById('monthlyContribution').value) || 0,
    growthRate: parseFloat(document.getElementById('growthRate').value) || 0,
    platformFee: parseFloat(document.getElementById('platformFee').value) || 0,
    fundOCF: parseFloat(document.getElementById('fundOCF').value) || 0,
    years: parseInt(document.getElementById('yearsSlider').value) || 20
  };
}

function calculate() {
  const inputs = getInputs();
  const { startingAmount, monthlyContribution, growthRate, platformFee, fundOCF, years } = inputs;

  const annualGrowth = growthRate / 100;
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
  document.getElementById('totalGrowth').textContent = formatCurrency(Math.round(totalGrowthWithFees));
  document.getElementById('totalFees').textContent = formatCurrency(Math.round(totalFeesAccumulated));
  document.getElementById('feeDrag').textContent = formatCurrency(Math.round(feeDrag));
  document.getElementById('withoutFeesValue').textContent = formatCurrency(Math.round(finalWithoutFees));

  // Update contribution/growth bar
  const contribPercent = totalContributions / finalWithFees * 100;
  document.getElementById('contribBar').style.width = Math.min(contribPercent, 100) + '%';
  document.getElementById('growthBar').style.width = Math.max(100 - contribPercent, 0) + '%';

  document.getElementById('results').style.display = 'block';
  drawChart();
}

function drawChart() {
  if (!chartData) return;

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

  const maxVal = Math.max(...chartData.map(d => d.withoutFees));
  const years = chartData.length - 1;

  function xPos(year) { return padding.left + (year / years) * chartW; }
  function yPos(val) { return padding.top + chartH - (val / maxVal) * chartH; }

  // Grid lines
  ctx.strokeStyle = '#2a2a2a';
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
    ctx.fillStyle = '#666';
    ctx.font = '11px "DM Sans", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatCurrency(Math.round(val)), padding.left - 8, y + 4);
  }

  // X labels
  ctx.textAlign = 'center';
  const xStep = years <= 10 ? 1 : years <= 20 ? 2 : 5;
  for (let y = 0; y <= years; y += xStep) {
    ctx.fillStyle = '#666';
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
  ctx.fillStyle = 'rgba(46, 196, 182, 0.08)';
  ctx.fill();

  // Without fees line
  ctx.beginPath();
  ctx.moveTo(xPos(0), yPos(chartData[0].withoutFees));
  for (let i = 1; i < chartData.length; i++) {
    ctx.lineTo(xPos(i), yPos(chartData[i].withoutFees));
  }
  ctx.strokeStyle = '#666';
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
  ctx.strokeStyle = '#2ec4b6';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Contributions line
  ctx.beginPath();
  ctx.moveTo(xPos(0), yPos(chartData[0].contributions));
  for (let i = 1; i < chartData.length; i++) {
    ctx.lineTo(xPos(i), yPos(chartData[i].contributions));
  }
  ctx.strokeStyle = 'rgba(46, 196, 182, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Legend
  const legendY = 12;
  ctx.font = '11px "DM Sans", sans-serif';

  ctx.strokeStyle = '#2ec4b6';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(padding.left, legendY);
  ctx.lineTo(padding.left + 20, legendY);
  ctx.stroke();
  ctx.fillStyle = '#9a9590';
  ctx.textAlign = 'left';
  ctx.fillText('With fees', padding.left + 25, legendY + 4);

  const leg2x = padding.left + 100;
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(leg2x, legendY);
  ctx.lineTo(leg2x + 20, legendY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillText('Without fees', leg2x + 25, legendY + 4);

  const leg3x = leg2x + 110;
  ctx.fillStyle = 'rgba(46, 196, 182, 0.3)';
  ctx.fillRect(leg3x, legendY - 5, 20, 10);
  ctx.fillStyle = '#9a9590';
  ctx.fillText('Contributions', leg3x + 25, legendY + 4);
}

function updateYearsLabel() {
  const val = document.getElementById('yearsSlider').value;
  document.getElementById('yearsValue').textContent = val + ' years';
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

  // Auto-calculate on any input change
  document.querySelectorAll('#calcForm input').forEach(input => {
    input.addEventListener('input', () => {
      if (input.id === 'yearsSlider') updateYearsLabel();
      calculate();
    });
  });

  // Initial calculation
  calculate();

  // Redraw chart on resize
  window.addEventListener('resize', () => {
    if (chartData) drawChart();
  });
});
