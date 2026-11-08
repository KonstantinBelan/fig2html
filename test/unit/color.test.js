// Auto-generated test module
const assert = require("assert");
const { parseColor } = require("../../src/parsers/color");

module.exports = async function(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };

    it('parses 6-digit hex color (#ff0000)', () => {
        const c = parseColor('#ff0000');
        assert.deepStrictEqual(c, { r: 1, g: 0, b: 0, a: 1 });
    });
    it('parses 3-digit hex color (#0f0)', () => {
        const c = parseColor('#0f0');
        assert.deepStrictEqual(c, { r: 0, g: 1, b: 0, a: 1 });
    });
    it('parses 8-digit hex color with alpha (#0000ff80)', () => {
        const c = parseColor('#0000ff80');
        assert.strictEqual(c.r, 0);
        assert.strictEqual(c.g, 0);
        assert.strictEqual(c.b, 1);
        assert(Math.abs(c.a - 0.5) < 0.01);
    });
    it('parses rgb() and rgba() colors', () => {
        const rgb = parseColor('rgb(255, 128, 0)');
        assert.strictEqual(rgb.r, 1);
        assert(Math.abs(rgb.g - 0.5) < 0.01);
        assert.strictEqual(rgb.b, 0);
        assert.strictEqual(rgb.a, 1);

        const rgba = parseColor('rgba(100, 150, 200, 0.4)');
        assert.strictEqual(rgba.a, 0.4);
    });
    it('parses modern space/slash rgba syntax (rgb(255 0 0 / 50%))', () => {
        const c = parseColor('rgb(255 0 0 / 50%)');
        assert.deepStrictEqual(c, { r: 1, g: 0, b: 0, a: 0.5 });
    });
    it('parses hsl() and hsla()', () => {
        const hsl = parseColor('hsl(0, 100%, 50%)');
        assert.strictEqual(hsl.r, 1);
        assert.strictEqual(hsl.g, 0);
        assert.strictEqual(hsl.b, 0);
        assert.strictEqual(hsl.a, 1);
    });
    it('parses named colors and transparent', () => {
        const crimson = parseColor('crimson');
        assert(crimson && crimson.r > 0.8);
        const trans = parseColor('transparent');
        assert.strictEqual(trans.a, 0);
    });

    // 2. Gradient Parser
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
