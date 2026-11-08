// Auto-generated test module
const assert = require("assert");
const { parseGradient, parseLinearDirection } = require("../../src/parsers/gradient");

module.exports = async function(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };

    it('parses linear gradient directions and degrees', () => {
        assert.strictEqual(parseLinearDirection('to top'), 0);
        assert.strictEqual(parseLinearDirection('to right'), 90);
        assert.strictEqual(parseLinearDirection('to bottom'), 180);
        assert.strictEqual(parseLinearDirection('to left'), 270);
        assert.strictEqual(parseLinearDirection('45deg'), 45);
    });
    it('parses linear-gradient paint object with transform matrix and stops', () => {
        const grad = parseGradient('linear-gradient(180deg, #ff0000 0%, #0000ff 100%)');
        assert.strictEqual(grad.type, 'GRADIENT_LINEAR');
        assert.strictEqual(grad.stops.length, 2);
        assert.strictEqual(grad.stops[0].position, 0);
        assert.strictEqual(grad.stops[1].position, 1);
        assert.deepStrictEqual(grad.stops[0].color, { r: 1, g: 0, b: 0, a: 1 });
        assert(grad.transform !== undefined);
    });
    it('parses radial-gradient paint object', () => {
        const grad = parseGradient('radial-gradient(circle, #fff, #000)');
        assert.strictEqual(grad.type, 'GRADIENT_RADIAL');
        assert.strictEqual(grad.stops.length, 2);
    });

    // 3. Effects Parser
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
