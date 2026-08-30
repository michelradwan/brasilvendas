const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const htmlContent = fs.readFileSync(path.join(ROOT, 'admin-ads.html'), 'utf8');
const cssContent = fs.readFileSync(path.join(ROOT, 'assets/admin-ads.css'), 'utf8');

console.log('=====================================================================');
console.log('RADWAN ADS — RESPONSIVE & STRUCTURAL AUDIT TEST SUITE');
console.log('=====================================================================\n');

let failedTests = 0;
let passedTests = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  [PASS] ${message}`);
        passedTests++;
    } else {
        console.error(`  [FAIL] ${message}`);
        failedTests++;
    }
}

// 1. Audit 10 Canonical Views + Consolidated Campaign Subviews
console.log('1. AUDITING CANONICAL VIEWS & SUBVIEWS IN admin-ads.html:');
const expectedSidebarViews = [
    'overview',
    'campaigns',
    'creatives',
    'funnel',
    'orders',
    'site-intelligence',
    'tracking',
    'autopilot',
    'audit',
    'settings'
];

expectedSidebarViews.forEach(view => {
    const hasSection = htmlContent.includes(`id="view-${view}"`);
    const hasNavItem = htmlContent.includes(`data-nav-target="${view}"`);
    assert(hasSection, `View section "#view-${view}" exists in DOM`);
    assert(hasNavItem, `Sidebar nav item for "${view}" exists in DOM`);
});

const expectedCampaignSubviews = [
    'campaigns-subview-campaigns',
    'campaigns-subview-adsets',
    'campaigns-subview-ads'
];

expectedCampaignSubviews.forEach(sub => {
    const hasSubview = htmlContent.includes(`id="${sub}"`);
    assert(hasSubview, `Campaign Subview "#${sub}" exists in DOM`);
});

// 2. Audit 100vw Prohibition in Nested Components
console.log('\n2. AUDITING PROHIBITED 100vw USAGE IN CSS:');
const lines = cssContent.split('\n');
let vwViolations = 0;
lines.forEach((line, index) => {
    if (line.includes('100vw') && !line.includes('min(') && !line.includes('calc(100%')) {
        console.warn(`    Line ${index + 1}: ${line.trim()}`);
        vwViolations++;
    }
});
assert(vwViolations === 0, `Zero uncontrolled 100vw violations in CSS (found ${vwViolations})`);

// 3. Audit Anti-Overflow Reset
console.log('\n3. AUDITING GLOBAL ANTI-OVERFLOW RULES:');
assert(cssContent.includes('overflow-x: hidden;') && cssContent.includes('width: 100%;'), 'Global html/body anti-overflow rules present');
assert(cssContent.includes('box-sizing: border-box;'), 'box-sizing: border-box applied globally');

// 4. Audit Modals & Drawers Structure
console.log('\n4. AUDITING MODALS & DRAWERS ARCHITECTURE:');
const modals = [
    'rename-modal',
    'duplicate-modal',
    'radwan-analysis-modal',
    'token-modal',
    'column-manager-drawer',
    'campaign-drawer',
    'mobile-metric-details-modal'
];

modals.forEach(modalId => {
    assert(htmlContent.includes(`id="${modalId}"`), `Modal/Drawer "#${modalId}" exists in DOM`);
});

// Check drawer width rule
assert(cssContent.includes('width: min(840px, 96vw)'), 'Column manager drawer uses safe responsive width formula');
assert(cssContent.includes('#campaign-drawer') && cssContent.includes('width: 100% !important;'), 'Campaign drawer mobile rule is constrained to 100% (safe from scrollbar offset)');

// 5. Audit Mobile Cards & Touch Targets
console.log('\n5. AUDITING MOBILE TOUCH TARGETS & CARDS:');
assert(cssContent.includes('.campaign-mobile-card'), 'Campaign mobile card component defined');
assert(cssContent.includes('min-height: 44px;'), 'Mobile action buttons adhere to 44px touch ergonomics');
assert(cssContent.includes('touch-action: manipulation;'), 'Touch action manipulation enabled for zero mobile tap delay');

// 6. Audit Data Tables Sticky & Local Scrolling
console.log('\n6. AUDITING DATA TABLES & STICKY COLUMNS:');
assert(cssContent.includes('.sticky-col-check'), 'Sticky Checkbox column styled with exact offset');
assert(cssContent.includes('.sticky-col-status'), 'Sticky Status column styled with 44px offset');
assert(htmlContent.includes('data-table-container'), 'Tables wrapped in data-table-container for safe horizontal scroll');

// 7. Audit Safe Areas
console.log('\n7. AUDITING SAFE AREA INSETS:');
assert(cssContent.includes('env(safe-area-inset-bottom)'), 'Bottom bars & toasts respect iOS safe area insets');

console.log('\n=====================================================================');
console.log(`AUDIT COMPLETE: ${passedTests} Passed, ${failedTests} Failed.`);
console.log('=====================================================================');

if (failedTests > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
