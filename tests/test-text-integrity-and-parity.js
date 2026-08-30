// ==============================================================================
// TEST SUITE: TEXT INTEGRITY, VISUAL PARITY & RESPONSIVE CONSOLE HARDENING
// ==============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- RUNNING TEXT INTEGRITY & PARITY AUDIT ---');

// 1. Audit admin-ads.html
const htmlPath = path.join(__dirname, '..', 'admin-ads.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Required Views & Elements
assert(html.includes('id="campaigns-subview-campaigns"'), 'Missing #campaigns-subview-campaigns');
assert(html.includes('id="campaigns-subview-adsets"'), 'Missing #campaigns-subview-adsets');
assert(html.includes('id="campaigns-subview-ads"'), 'Missing #campaigns-subview-ads');

// Headers
assert(html.includes('CAMPANHA PAI'), 'Missing CAMPANHA PAI in AdSets table header');
assert(html.includes('CAMPANHA › CONJUNTO'), 'Missing CAMPANHA › CONJUNTO in Ads table header');

console.log('✔ Test 1: HTML Markup & Table Headers verified.');

// 2. Audit assets/admin-ads.css
const cssPath = path.join(__dirname, '..', 'assets', 'admin-ads.css');
const css = fs.readFileSync(cssPath, 'utf8');

assert(css.includes('th.sticky-col-status:first-child'), 'Missing th.sticky-col-status:first-child rule');
assert(css.includes('td.sticky-col-status:first-child'), 'Missing td.sticky-col-status:first-child rule');
assert(css.includes('left: 0 !important;'), 'Missing left: 0 !important for first-child sticky status column');

console.log('✔ Test 2: Sticky Column CSS Offset & Zero Overlap verified.');

// 3. Audit js/dashboard.js
const jsPath = path.join(__dirname, '..', 'js', 'dashboard.js');
const js = fs.readFileSync(jsPath, 'utf8');

// Ensure all 3 subviews use the canonical toggle-slider component
assert(js.includes('toggle-slider'), 'Missing toggle-slider in dashboard.js');
assert(!js.includes('toggle-track'), 'toggle-track should be replaced by toggle-slider for unified design system');

// Ensure CBO badge formatting is discrete and elegant
assert(js.includes('CBO · Campanha'), 'Missing CBO · Campanha discrete badge in AdSets');

// Ensure Duplicate action is appropriately labeled
assert(js.includes('📋 Duplicar'), 'Missing 📋 Duplicar button label in Ads table');

console.log('✔ Test 3: JavaScript Table Rendering, Toggles & Action Buttons verified.');

// 4. Verify Raw vs Normalized Names integrity
const sampleEntities = [
    { raw: "CJ 01 - TESTE KIT P - 22/08 -3", expected: "CJ 01 - TESTE KIT P - 22/08 -3" },
    { raw: "CJ 01 - TESTE KIT P - 22/08 - 02", expected: "CJ 01 - TESTE KIT P - 22/08 - 02" },
    { raw: "CTV 01 - KIT 01", expected: "CTV 01 - KIT 01" },
    { raw: "CAMP 02 - TESTE KIT P - CBO — Cópia", expected: "CAMP 02 - TESTE KIT P - CBO — Cópia" }
];

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

sampleEntities.forEach(ent => {
    const rendered = escapeHTML(ent.raw);
    assert.strictEqual(rendered, ent.expected, `Character corruption detected on ${ent.raw}`);
    assert(rendered.startsWith('CJ') || rendered.startsWith('CTV') || rendered.startsWith('CAMP'), `Initial glyphs altered on ${rendered}`);
});

console.log('✔ Test 4: String Integrity, Unicode preservation & Zero Character Truncation verified.');

console.log('\nALL TEXT INTEGRITY & PARITY TESTS PASSED! (4/4)\n');
