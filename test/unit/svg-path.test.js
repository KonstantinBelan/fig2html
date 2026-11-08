// Auto-generated test module
const assert = require("assert");
const { parseCommandsBlob, parseVectorNetworkBlob, isVectorNode } = require("../../src/decompiler/vector");
const { convertHtmlToNodes } = require("../../src/converter");

module.exports = async function(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };

    it('decodes binary commandsBlob into SVG path stream', () => {
        // Construct binary buffer: MoveTo (10, 20), LineTo (30, 40), ClosePath
        const buf = Buffer.alloc(1 + 8 + 1 + 8 + 1);
        let off = 0;
        buf.writeUInt8(1, off); off += 1;
        buf.writeFloatLE(10, off); off += 4;
        buf.writeFloatLE(20, off); off += 4;
        buf.writeUInt8(2, off); off += 1;
        buf.writeFloatLE(30, off); off += 4;
        buf.writeFloatLE(40, off); off += 4;
        buf.writeUInt8(0, off); off += 1;

        const pathStr = parseCommandsBlob(buf);
        assert.strictEqual(pathStr, 'M 10 20 L 30 40 Z');
    });

    it('decodes binary VectorNetwork into SVG path with curve segments', () => {
        // 2 vertices (0,0) and (10,10), 1 straight segment
        const buf = Buffer.alloc(12 + 24 + 28);
        let off = 0;
        buf.writeUInt32LE(2, off); off += 4; // numVertices
        buf.writeUInt32LE(1, off); off += 4; // numSegments
        buf.writeUInt32LE(0, off); off += 4; // numRegions

        // Vertex 0: (0, 0)
        buf.writeUInt32LE(0, off); off += 4;
        buf.writeFloatLE(0, off); off += 4;
        buf.writeFloatLE(0, off); off += 4;

        // Vertex 1: (10, 10)
        buf.writeUInt32LE(0, off); off += 4;
        buf.writeFloatLE(10, off); off += 4;
        buf.writeFloatLE(10, off); off += 4;

        // Segment 0: start 0, ts(0,0), end 1, te(0,0)
        buf.writeUInt32LE(0, off); off += 4;
        buf.writeUInt32LE(0, off); off += 4;
        buf.writeFloatLE(0, off); off += 4;
        buf.writeFloatLE(0, off); off += 4;
        buf.writeUInt32LE(1, off); off += 4;
        buf.writeFloatLE(0, off); off += 4;
        buf.writeFloatLE(0, off); off += 4;

        const pathStr = parseVectorNetworkBlob(buf);
        assert.strictEqual(pathStr, 'M 0 0 L 10 10');
    });


    await itAsync('compiles SVG path and shapes to native Kiwi VECTOR nodes with binary blobs', async () => {
        const { convertHtmlToNodes } = require('../../src/converter');
        const { parseCommandsBlob, parseVectorNetworkBlob } = require('../../src/decompiler/vector');

        const html = `
        <div style="display: flex; gap: 10px;">
          <svg width="24" height="24" viewBox="0 0 24 24" id="custom-icon">
            <path d="M12 2L2 22h20Z" fill="#ff0000" stroke="#00ff00" stroke-width="2"/>
            <circle cx="12" cy="12" r="10" stroke="#0000ff" stroke-width="1.5"/>
          </svg>
        </div>
        `;

        const res = await convertHtmlToNodes(html, { sessionID: 0, localID: 1 });
        assert(res.blobs && res.blobs.length >= 4, 'Should generate binary commandsBlob and vectorNetworkBlob for shapes');

        const vectors = res.nodeChanges.filter(n => n.type === 'VECTOR');
        assert.strictEqual(vectors.length, 2, 'Should create 2 native VECTOR nodes (path and circle)');

        // First vector: path
        const pathNode = vectors[0];
        assert.strictEqual(pathNode.type, 'VECTOR');
        assert(pathNode.fillGeometry && pathNode.fillGeometry.length === 1);
        assert.strictEqual(pathNode.strokeWeight, 2);
        assert(pathNode.vectorData && typeof pathNode.vectorData.vectorNetworkBlob === 'number');

        // Verify commandsBlob decodes to valid path
        const decodedCommands = parseCommandsBlob(res.blobs[pathNode.fillGeometry[0].commandsBlob]);
        assert(decodedCommands.includes('M') && decodedCommands.includes('Z'));

        // Verify vectorNetworkBlob decodes to valid topology
        const decodedVN = parseVectorNetworkBlob(res.blobs[pathNode.vectorData.vectorNetworkBlob]);
        assert(decodedVN.includes('M') && decodedVN.includes('L'));

        // Second vector: circle
        const circleNode = vectors[1];
        assert.strictEqual(circleNode.type, 'VECTOR');
        assert.strictEqual(circleNode.strokeWeight, 1.5);
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
