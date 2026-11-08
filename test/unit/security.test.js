// Auto-generated test module
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPathInsideBaseDir, isPrivateOrRestrictedHost } from '../../src/parsers/images.js';

export default async function run(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };

    it('verifies Path Traversal protection in ImageRegistry', () => {
        const baseDir = '/Users/test/project';

        assert.strictEqual(isPathInsideBaseDir('img/logo.png', baseDir), true);
        assert.strictEqual(isPathInsideBaseDir('/Users/test/project/assets/photo.jpg', baseDir), true);
        assert.strictEqual(isPathInsideBaseDir('../../etc/passwd', baseDir), false);
        assert.strictEqual(isPathInsideBaseDir('/etc/passwd', baseDir), false);
        assert.strictEqual(isPathInsideBaseDir('/Users/test/other-secret/.env', baseDir), false);
    });

    it('verifies SSRF and private/restricted host blocking', () => {

        // Loopback and internal names
        assert.strictEqual(isPrivateOrRestrictedHost('localhost'), true);
        assert.strictEqual(isPrivateOrRestrictedHost('sub.localhost'), true);
        assert.strictEqual(isPrivateOrRestrictedHost('service.local'), true);
        assert.strictEqual(isPrivateOrRestrictedHost('api.internal'), true);

        // IPv4 private & reserved
        assert.strictEqual(isPrivateOrRestrictedHost('127.0.0.1'), true);
        assert.strictEqual(isPrivateOrRestrictedHost('10.10.1.1'), true);
        assert.strictEqual(isPrivateOrRestrictedHost('172.16.5.4'), true);
        assert.strictEqual(isPrivateOrRestrictedHost('172.31.255.1'), true);
        assert.strictEqual(isPrivateOrRestrictedHost('192.168.0.1'), true);
        assert.strictEqual(isPrivateOrRestrictedHost('169.254.169.254'), true); // AWS metadata
        assert.strictEqual(isPrivateOrRestrictedHost('0.0.0.0'), true);
        assert.strictEqual(isPrivateOrRestrictedHost('255.255.255.255'), true);

        // Integer and hex IP evasions
        assert.strictEqual(isPrivateOrRestrictedHost('2130706433'), true); // 127.0.0.1 in decimal
        assert.strictEqual(isPrivateOrRestrictedHost('0x7f000001'), true); // 127.0.0.1 in hex

        // IPv6 loopback & link-local
        assert.strictEqual(isPrivateOrRestrictedHost('::1'), true);
        assert.strictEqual(isPrivateOrRestrictedHost('fe80::1'), true);
        assert.strictEqual(isPrivateOrRestrictedHost('fc00::1'), true);

        // Public domains & IPs
        assert.strictEqual(isPrivateOrRestrictedHost('example.com'), false);
        assert.strictEqual(isPrivateOrRestrictedHost('github.com'), false);
        assert.strictEqual(isPrivateOrRestrictedHost('93.184.216.34'), false);
    });

};

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
    let passed = 0, failed = 0;
    const itSync = (name, fn) => {
        try { fn(); console.log("  \x1b[32m✔\x1b[0m " + name); passed++; }
        catch (e) { failed++; console.error("  \x1b[31m✖\x1b[0m " + name + "\n    " + e.message); }
    };
    const itAsyncLocal = async (name, fn) => {
        try { await fn(); console.log("  \x1b[32m✔\x1b[0m " + name); passed++; }
        catch (e) { failed++; console.error("  \x1b[31m✖\x1b[0m " + name + "\n    " + (e.stack || e.message)); }
    };
    run(itSync, itAsyncLocal).then(() => {
        console.log("\nPassed: " + passed + ", Failed: " + failed);
        if (failed > 0) process.exit(1);
    }).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
