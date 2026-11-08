// test/runner.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Parse CLI flags
const args = process.argv.slice(2);
let grepFilter = null;
let domainFilter = null;
const specificFiles = [];

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--grep' || arg === '-g') {
        grepFilter = (args[++i] || '').toLowerCase();
    } else if (arg.startsWith('--grep=')) {
        grepFilter = arg.slice(7).toLowerCase();
    } else if (arg === '--domain' || arg === '-d') {
        domainFilter = (args[++i] || '').toLowerCase();
    } else if (arg.startsWith('--domain=')) {
        domainFilter = arg.slice(9).toLowerCase();
    } else if (!arg.startsWith('-')) {
        specificFiles.push(arg);
    }
}

function shouldRun(testName, suiteTitle = '', filePath = '') {
    if (domainFilter) {
        const matchesDomain = filePath.includes(domainFilter) || suiteTitle.toLowerCase().includes(domainFilter);
        if (!matchesDomain) return false;
    }
    if (grepFilter) {
        const matchesGrep = testName.toLowerCase().includes(grepFilter) || suiteTitle.toLowerCase().includes(grepFilter);
        if (!matchesGrep) return false;
    }
    return true;
}

let currentSuiteTitle = '';
let currentSuiteFile = '';
let suitePrinted = false;

function ensureSuitePrinted() {
    if (!suitePrinted) {
        console.log(`\n\x1b[1m${currentSuiteTitle}\x1b[0m`);
        suitePrinted = true;
    }
}

function it(name, fn) {
    if (!shouldRun(name, currentSuiteTitle, currentSuiteFile)) return;
    ensureSuitePrinted();
    totalTests++;
    try {
        fn();
        console.log(`  \x1b[32m✔\x1b[0m ${name}`);
        passedTests++;
    } catch (e) {
        failedTests++;
        console.error(`  \x1b[31m✖\x1b[0m ${name}`);
        console.error(`    ${e.stack || e.message}`);
    }
}

async function itAsync(name, fn) {
    if (!shouldRun(name, currentSuiteTitle, currentSuiteFile)) return;
    ensureSuitePrinted();
    totalTests++;
    try {
        await fn();
        console.log(`  \x1b[32m✔\x1b[0m ${name}`);
        passedTests++;
    } catch (e) {
        failedTests++;
        console.error(`  \x1b[31m✖\x1b[0m ${name}`);
        console.error(`    ${e.stack || e.message}`);
    }
}

const SUITES = [
    { title: '1. Color Parser Tests', file: './unit/color.test.js' },
    { title: '2. Gradient Parser Tests', file: './unit/gradient.test.js' },
    { title: '3. Effects Parser Tests', file: './unit/effects.test.js' },
    { title: '4. Typography Parser Tests', file: './unit/typography.test.js' },
    { title: '5. Image Registry Tests', file: './unit/images.test.js' },
    { title: '6. CLI Arguments Tests', file: './unit/cli.test.js' },
    { title: '7. End-to-End Generation Tests', file: './e2e/html-to-fig.test.js' },
    { title: '8. Decompiler (Figma -> HTML) Tests', file: './integration/decompiler.test.js' },
    { title: '8.1 Unit Tests (Units & Responsive Values)', file: './unit/units.test.js' },
    { title: '8.2 Decompiler E2E Showcase & Output Tests', file: './e2e/fig-to-html.test.js' },
    { title: '8.3 Round-Trip Verification Tests', file: './e2e/roundtrip.test.js' },
    { title: '8.4 Native Vector Compilation Tests', file: './unit/svg-path.test.js' },
    { title: '9. Roadmap 2.1 Enhancements Tests', file: './integration/tokens.test.js' },
    { title: '10. Layout Synthesis Engine Tests', file: './integration/layout-synthesis.test.js' },
    { title: '11. Multi-Page Import Engine Tests (v1.3.0)', file: './integration/multi-page.test.js' },
    { title: '12. Adaptive Multi-Breakpoint Engine Tests (v1.4.0)', file: './integration/responsive-breakpoints.test.js' },
    { title: '35. Graphic Subtree Collapsing & Cumulative Baking Engine Tests', file: './integration/graphic-collapser.test.js' },
    { title: '36. SmartSteam Complex Landing Page Decompilation & Visual Accuracy Tests', file: './integration/visual-accuracy.test.js' },
    { title: '37. Semantic Styles, A11y Standards & Spacing Tokens Engine Tests', file: './integration/semantic-styles.test.js' },
    { title: '38. Security Guards & SSRF Protection Tests', file: './unit/security.test.js' },
    { title: '39. Tailwind CSS Core Engine & Mapper Tests (Sprint 1)', file: './unit/tailwind-mapper.test.js' },
    { title: '40. Tailwind CSS Auto Layout & Grid Synthesis Tests (Sprint 2)', file: './integration/tailwind-layout.test.js' },
    { title: '41. Tailwind CSS Typography, Gradients & Effects Tests (Sprint 3)', file: './unit/tailwind-effects.test.js' },
    { title: '42. Tailwind CSS Responsive Multi-Breakpoint Tests (Sprint 4)', file: './integration/tailwind-responsive.test.js' }
];

async function run() {
    console.log('\n\x1b[1m\x1b[36m=== HTML to Figma Test Suite ===\x1b[0m');

    let suitesToRun = SUITES;
    if (specificFiles.length > 0) {
        suitesToRun = specificFiles.map(filePath => {
            const rel = filePath.startsWith('test/') ? filePath.slice(5) : filePath;
            return {
                title: `Running ${filePath}`,
                file: rel.startsWith('.') ? rel : `./${rel}`
            };
        });
    }

    for (const suite of suitesToRun) {
        currentSuiteTitle = suite.title;
        currentSuiteFile = suite.file;
        suitePrinted = false;

        const resolvedPath = path.resolve(__dirname, suite.file);
        if (fs.existsSync(resolvedPath)) {
            const mod = await import(pathToFileURL(resolvedPath).href);
            const runFn = mod.default || mod;
            if (typeof runFn === 'function') {
                await runFn({ it, itAsync }, it, itAsync);
            }
        } else {
            console.error(`\x1b[31mSuite file not found: ${suite.file}\x1b[0m`);
        }
    }

    console.log(`\n\x1b[1mTest Results: ${passedTests}/${totalTests} passed\x1b[0m`);
    if (failedTests === 0 && totalTests > 0) {
        console.log('\x1b[32mAll tests passed successfully! 🚀\x1b[0m\n');
        process.exit(0);
    } else {
        console.log(`\x1b[31m${failedTests} tests failed.\x1b[0m\n`);
        process.exit(1);
    }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
    run().catch(err => {
        console.error('Test runner fatal error:', err);
        process.exit(1);
    });
}

export { run, it, itAsync };
export default { run, it, itAsync };
