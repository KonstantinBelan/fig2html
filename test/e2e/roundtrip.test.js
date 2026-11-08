// Auto-generated test module
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const { generateFigFile } = require("../../src/generator");
const { convertFigToHtml } = require("../../src/decompiler");

module.exports = async function(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };

    await itAsync('performs full round-trip HTML -> .fig -> HTML and verifies content', async () => {
        const roundFig = path.resolve('test/roundtrip.fig');
        const roundHtml = path.resolve('test/roundtrip.html');

        // 1. HTML -> .fig
        await generateFigFile({
            htmlPath: 'test/test.html',
            outputPath: roundFig
        });
        assert(fs.existsSync(roundFig));

        // 2. .fig -> HTML
        const res = await convertFigToHtml(roundFig, {
            outputHtmlPath: roundHtml,
            inlineImages: true
        });
        assert(fs.existsSync(roundHtml));

        const roundHtmlContent = fs.readFileSync(roundHtml, 'utf8');

        // Verify key components survived round-trip
        assert(roundHtmlContent.includes('Сгенерировано из HTML'));
        assert(roundHtmlContent.includes('Auto Layout Active'));
        assert(roundHtmlContent.includes('Этот фрейм собран напрямую'));
        assert(roundHtmlContent.includes('Скорость'));
        assert(roundHtmlContent.includes('Меньше 15мс на генерацию'));
        assert(roundHtmlContent.includes('Чистый вектор'));
        assert(roundHtmlContent.includes('Редактируемые слои'));
        assert(roundHtmlContent.includes('Открыть проект'));
        assert(roundHtmlContent.includes('display: flex'));

        // Clean up
        fs.unlinkSync(roundFig);
        fs.unlinkSync(roundHtml);
    });

};

if (require.main === module) {
    let passed = 0, failed = 0;
    const itSync = (name, fn) => {
        try { fn(); console.log("  \x1b[32m✔\x1b[0m " + name); passed++; }
        catch (e) { failed++; console.error("  \x1b[31m✖\x1b[0m " + name + "\n    " + e.message); }
    };
    const itAsyncLocal = async (name, fn) => {
        try { await fn(); console.log("  \x1b[32m✔\x1b[0m " + name); passed++; }
        catch (e) { failed++; console.error("  \x1b[31m✖\x1b[0m " + name + "\n    " + (e.stack || e.message)); }
    };
    module.exports(itSync, itAsyncLocal).then(() => {
        console.log("\nPassed: " + passed + ", Failed: " + failed);
        if (failed > 0) process.exit(1);
    }).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
