// src/utils/guid.js

/**
 * Generates unique GUIDs for Figma nodes in a given session.
 */
class GuidGenerator {
    constructor(sessionId = 1, startLocalId = 100) {
        this.sessionId = sessionId;
        this.localIdCounter = startLocalId;
    }

    next() {
        return {
            sessionID: this.sessionId,
            localID: this.localIdCounter++
        };
    }
}

/**
 * Generates ordered position strings for Figma parentIndex.
 * Figma sorts layer order using ASCII byte-order comparison of `parentIndex.position`.
 * Printable ASCII starts at 33 ('!') and ends at 126 ('~').
 * For up to 90 items, single characters '!'..'z' are used.
 * For more items, multi-character lexicographical strings are generated.
 */
class FractionalIndexer {
    static getPosition(index) {
        const minChar = 33; // '!'
        const maxChar = 125; // '}'
        const range = maxChar - minChar;

        if (index < range) {
            return String.fromCharCode(minChar + index);
        }

        // For large numbers of siblings, generate multi-character strings
        let prefixIdx = Math.floor(index / range);
        let suffixIdx = index % range;

        let prefix = String.fromCharCode(minChar + Math.min(prefixIdx, range - 1));
        let suffix = String.fromCharCode(minChar + suffixIdx);

        return `${prefix}${suffix}`;
    }
}

module.exports = {
    GuidGenerator,
    FractionalIndexer
};
