// src/schema.js
const zlib = require('zlib');
const kiwi = require('@open-pencil/kiwi');

let cachedCompiledSchema = null;
let cachedSchemaDeflated = null;

/**
 * Decompresses and compiles the Figma Kiwi binary schema
 * @param {Buffer|Uint8Array} schemaDeflated
 * @returns {object} Compiled Kiwi Schema
 */
function getCompiledSchema(schemaDeflated) {
    if (cachedCompiledSchema && cachedSchemaDeflated === schemaDeflated) {
        return cachedCompiledSchema;
    }

    let schemaBytes;
    try {
        schemaBytes = zlib.inflateRawSync(schemaDeflated);
    } catch (_) {
        schemaBytes = zlib.inflateSync(schemaDeflated);
    }

    const bb = new kiwi.ByteBuffer(schemaBytes);
    const originalSchema = kiwi.decodeBinarySchema(bb);
    cachedCompiledSchema = kiwi.compileSchema(originalSchema);
    cachedSchemaDeflated = schemaDeflated;

    return cachedCompiledSchema;
}

module.exports = {
    getCompiledSchema
};
