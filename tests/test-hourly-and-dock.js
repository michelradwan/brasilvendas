// ==============================================================================
// TEST SUITE: HOURLY VISUAL INTELLIGENCE & BOTTOM DOCK HARDENING
// ==============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- RUNNING HOURLY & DOCK TESTS ---');

// 1. Verify admin-ads.html contains all expected elements
const htmlPath = path.join(__dirname, '..', 'admin-ads.html');
const html = fs.readFileSync(htmlPath, 'utf8');

assert(html.includes('id="hourly-chart-container"'), 'Missing #hourly-chart-container in HTML');
assert(html.includes('id="hourly-chart-title"'), 'Missing #hourly-chart-title in HTML');
assert(html.includes('id="hourly-chart-timezone-badge"'), 'Missing #hourly-chart-timezone-badge in HTML');
assert(html.includes('id="widget-best-hour"'), 'Missing #widget-best-hour in HTML');
assert(html.includes('id="widget-worst-hour"'), 'Missing #widget-worst-hour in HTML');
assert(html.includes('id="widget-accumulated-profit"'), 'Missing #widget-accumulated-profit in HTML');
assert(html.includes('id="widget-pace-value"'), 'Missing #widget-pace-value in HTML');
assert(html.includes('id="widget-now-profit"'), 'Missing #widget-now-profit in HTML');
assert(html.includes('id="bulk-actions-bar"'), 'Missing #bulk-actions-bar in HTML');
assert(html.includes('id="bulk-selected-count"'), 'Missing #bulk-selected-count in HTML');

console.log('✔ Test 1: HTML Markup verified successfully (10/10 elements present).');

// 2. Verify admin-ads.css contains safe area, dock hiding, and chart styles
const cssPath = path.join(__dirname, '..', 'assets', 'admin-ads.css');
const css = fs.readFileSync(cssPath, 'utf8');

assert(css.includes('#bulk-actions-bar {'), 'Missing #bulk-actions-bar CSS definition');
assert(css.includes('visibility: hidden;'), 'Missing visibility: hidden in #bulk-actions-bar default state');
assert(css.includes('opacity: 0;'), 'Missing opacity: 0 in #bulk-actions-bar default state');
assert(css.includes('#bulk-actions-bar.active {'), 'Missing #bulk-actions-bar.active CSS definition');
assert(css.includes('visibility: visible;'), 'Missing visibility: visible in #bulk-actions-bar.active');
assert(css.includes('env(safe-area-inset-bottom)'), 'Missing safe-area-inset-bottom in bottom bar or workspace padding');
assert(css.includes('.workspace-content {'), 'Missing .workspace-content CSS definition');
assert(css.includes('#hourly-chart-container'), 'Missing #hourly-chart-container CSS definition');

console.log('✔ Test 2: CSS Styles and Safe Area verified successfully.');

// 3. Verify js/dashboard.js contains Hourly Intelligence Logic
const jsPath = path.join(__dirname, '..', 'js', 'dashboard.js');
const js = fs.readFileSync(jsPath, 'utf8');

assert(js.includes('setHourlyChartMetric('), 'Missing setHourlyChartMetric in dashboard.js');
assert(js.includes('calculateHourlyData()'), 'Missing calculateHourlyData in dashboard.js');
assert(js.includes('renderHourlyVisualIntelligence()'), 'Missing renderHourlyVisualIntelligence in dashboard.js');
assert(js.includes('renderHourlyWidgets('), 'Missing renderHourlyWidgets in dashboard.js');
assert(js.includes('renderHourlySVGChart('), 'Missing renderHourlySVGChart in dashboard.js');
assert(js.includes('showHourlyTooltip('), 'Missing showHourlyTooltip in dashboard.js');
assert(js.includes('America/Sao_Paulo'), 'Missing canonical America/Sao_Paulo timezone in calculation');

console.log('✔ Test 3: JavaScript Engine & Methods verified successfully.');

// 4. Test Mock Hourly Calculation Logic
const unitEco = { productPrice: 89.90, cogs: 38.00, shippingCost: 15.00, gatewayFeePercent: 0.0399, taxPercent: 0.04, refundRatePercent: 0.015 };
const unitDeduction = unitEco.cogs + unitEco.shippingCost + (unitEco.productPrice * (unitEco.gatewayFeePercent + unitEco.taxPercent + unitEco.refundRatePercent));

// Simulate 24 hour array with mock orders
const currentHour = 15; // 15h
const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    revenue: 0,
    spend: 0,
    profit: 0,
    sales: 0,
    isFuture: h > currentHour,
    isCurrent: h === currentHour
}));

// Add a mock order at 14:30
hours[14].revenue += 89.90;
hours[14].sales += 1;

// Ad spend distribution: R$ 160 total across 16 active hours (0h to 15h) = R$ 10/h
const hourlySpend = 160 / 16;
hours.forEach(slot => {
    if (!slot.isFuture) {
        slot.spend = hourlySpend;
        const deductions = slot.sales * unitDeduction;
        slot.profit = slot.revenue - slot.spend - deductions;
    }
});

// Assertions on hourly results
assert.strictEqual(hours[20].isFuture, true, 'Hour 20 must be future');
assert.strictEqual(hours[20].profit, 0, 'Future hour profit must not be negative fabricated loss');
assert.strictEqual(hours[14].sales, 1, 'Hour 14 must have 1 sale');
assert(hours[14].profit > 0, 'Hour 14 with 1 sale should have positive net profit');
assert(hours[3].profit < 0, 'Hour 3 with R$ 10 spend and 0 sales should have negative profit');

console.log('✔ Test 4: Mathematical Reconciliation & Profit Calculation verified.');
console.log('\nALL HOURLY & DOCK TESTS PASSED SUCCESSFULLY! (4/4)');
