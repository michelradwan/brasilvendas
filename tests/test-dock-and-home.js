// ==============================================================================
// TEST SUITE: RADWAN ADS — RESTORED HOME VIEW & BOTTOM DOCK HARDENING
// ==============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- RUNNING RESTORED HOME & DOCK TESTS ---');

// 1. Verify admin-ads.html contains clean 3-layer Home and bottom dock
const htmlPath = path.join(__dirname, '..', 'admin-ads.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Required Clean Home Elements
assert(html.includes('id="kpi-spend"'), 'Missing #kpi-spend in HTML');
assert(html.includes('id="kpi-revenue"'), 'Missing #kpi-revenue in HTML');
assert(html.includes('id="kpi-profit"'), 'Missing #kpi-profit in HTML');
assert(html.includes('id="kpi-roas"'), 'Missing #kpi-roas in HTML');
assert(html.includes('id="kpi-cpa"'), 'Missing #kpi-cpa in HTML');
assert(html.includes('id="kpi-purchases"'), 'Missing #kpi-purchases in HTML');
assert(html.includes('id="what-should-i-do-container"'), 'Missing #what-should-i-do-container in HTML');
assert(html.includes('id="kpi-ctr"'), 'Missing #kpi-ctr in HTML');
assert(html.includes('id="kpi-cpc"'), 'Missing #kpi-cpc in HTML');
assert(html.includes('id="top-opportunities-container"'), 'Missing #top-opportunities-container in HTML');
assert(html.includes('id="bulk-actions-bar"'), 'Missing #bulk-actions-bar in HTML');
assert(html.includes('id="bulk-selected-count"'), 'Missing #bulk-selected-count in HTML');

// Hourly Chart Elements MUST BE REMOVED
assert(!html.includes('id="hourly-chart-container"'), 'id="hourly-chart-container" must not be in HTML');
assert(!html.includes('id="hourly-chart-title"'), 'id="hourly-chart-title" must not be in HTML');
assert(!html.includes('id="widget-best-hour"'), 'id="widget-best-hour" must not be in HTML');
assert(!html.includes('id="widget-worst-hour"'), 'id="widget-worst-hour" must not be in HTML');
assert(!html.includes('id="widget-accumulated-profit"'), 'id="widget-accumulated-profit" must not be in HTML');

console.log('✔ Test 1: HTML Markup verified successfully (Clean Home restored, Hourly Chart removed).');

// 2. Verify admin-ads.css contains safe area and dock hiding, without dead chart styles
const cssPath = path.join(__dirname, '..', 'assets', 'admin-ads.css');
const css = fs.readFileSync(cssPath, 'utf8');

assert(css.includes('#bulk-actions-bar {'), 'Missing #bulk-actions-bar CSS definition');
assert(css.includes('visibility: hidden;'), 'Missing visibility: hidden in #bulk-actions-bar default state');
assert(css.includes('opacity: 0;'), 'Missing opacity: 0 in #bulk-actions-bar default state');
assert(css.includes('#bulk-actions-bar.active {'), 'Missing #bulk-actions-bar.active CSS definition');
assert(css.includes('visibility: visible;'), 'Missing visibility: visible in #bulk-actions-bar.active');
assert(css.includes('env(safe-area-inset-bottom)'), 'Missing safe-area-inset-bottom in bottom bar or workspace padding');
assert(css.includes('.workspace-content {'), 'Missing .workspace-content CSS definition');

assert(!css.includes('#hourly-chart-container'), '#hourly-chart-container must not be in CSS');
assert(!css.includes('.hourly-chart-tooltip'), '.hourly-chart-tooltip must not be in CSS');
assert(!css.includes('.hourly-crosshair'), '.hourly-crosshair must not be in CSS');

console.log('✔ Test 2: CSS Styles and Safe Area verified successfully (Dock preserved, Chart CSS eradicated).');

// 3. Verify js/dashboard.js contains clean Overview Methods without Hourly Dead Code
const jsPath = path.join(__dirname, '..', 'js', 'dashboard.js');
const js = fs.readFileSync(jsPath, 'utf8');

assert(js.includes('renderOverviewMetrics'), 'Missing renderOverviewMetrics in dashboard.js');
assert(js.includes('renderWhatShouldIDoNow'), 'Missing renderWhatShouldIDoNow in dashboard.js');

assert(!js.includes('renderHourlyVisualIntelligence'), 'renderHourlyVisualIntelligence must not exist in dashboard.js');
assert(!js.includes('setHourlyChartMetric'), 'setHourlyChartMetric must not exist in dashboard.js');
assert(!js.includes('calculateHourlyData'), 'calculateHourlyData must not exist in dashboard.js');
assert(!js.includes('showHourlyTooltip'), 'showHourlyTooltip must not exist in dashboard.js');

console.log('✔ Test 3: JavaScript Engine verified successfully (Clean Overview methods active, dead chart code purged).');

console.log('\nALL RESTORED HOME & DOCK TESTS PASSED SUCCESSFULLY! (3/3)');
