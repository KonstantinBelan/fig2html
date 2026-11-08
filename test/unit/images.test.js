// Auto-generated test module
const assert = require("assert");
const { ImageRegistry, getImageDimensions } = require("../../src/parsers/images");

module.exports = async function(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };

    it('detects PNG dimensions from binary header', () => {
        const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAA8AAAAKCAYAAAC3zUkeAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const buf = Buffer.from(pngBase64, 'base64');
        const dims = getImageDimensions(buf);
        assert.strictEqual(dims.width, 15);
        assert.strictEqual(dims.height, 10);
    });
    it('registers buffer, computes SHA-1, and creates image paint', () => {
        const reg = new ImageRegistry();
        const buf = Buffer.from('test-image-data');
        const item = reg.registerBuffer(buf, 'test');
        assert.strictEqual(item.sha1Hex.length, 40);
        assert.strictEqual(reg.getAllImages().size, 1);

        const paint = reg.createImagePaint(item, 'FILL');
        assert.strictEqual(paint.type, 'IMAGE');
        assert.strictEqual(paint.imageScaleMode, 'FILL');
    });

    // 6. CLI Arguments
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
