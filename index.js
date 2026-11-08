/**
 * figmatik
 * Figma (.fig) to clean responsive HTML/CSS decompiler and bidirectional HTML-to-Figma compiler
 * 
 * @author Konstantin Belan <kosbelan@yandex.ru>
 * @see https://t.me/konstantin_belan
 * @see https://github.com/KonstantinBelan/figmatik
 * @license MIT
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFigFile } from './src/generator.js';
import { convertHtmlToNodes } from './src/converter/index.js';
import { getCompiledSchema } from './src/schema.js';
import { ImageRegistry } from './src/parsers/images.js';
import { parseColor } from './src/parsers/color.js';
import { parseGradient } from './src/parsers/gradient.js';
import { parseAllEffects } from './src/parsers/effects.js';
import {
    convertFigToHtml,
    readFigFile,
    buildSceneTree,
    generateFullHtmlDocument
} from './src/decompiler/index.js';

// Programmatic API
export {
    // HTML -> Figma (.fig)
    generateFigFile,
    convertHtmlToNodes,
    getCompiledSchema,
    ImageRegistry,
    parseColor,
    parseGradient,
    parseAllEffects,

    // Figma (.fig) -> HTML
    convertFigToHtml,
    readFigFile,
    buildSceneTree,
    generateFullHtmlDocument
};

export default {
    // HTML -> Figma (.fig)
    generateFigFile,
    convertHtmlToNodes,
    getCompiledSchema,
    ImageRegistry,
    parseColor,
    parseGradient,
    parseAllEffects,

    // Figma (.fig) -> HTML
    convertFigToHtml,
    readFigFile,
    buildSceneTree,
    generateFullHtmlDocument
};

// When run directly as `node index.js`
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
    const htmlPath = process.argv[2] || 'test/test.html';
    const outputPath = process.argv[3] || 'output.fig';
    const templatePath = process.argv[4] || 'templates/template.fig';

    console.log(`\x1b[36m⚡ Converting ${htmlPath} to ${outputPath}...\x1b[0m`);

    generateFigFile({
        htmlPath,
        outputPath,
        templatePath,
        verbose: true
    }).then(res => {
        console.log(`\n\x1b[32m✔ Build successful in ${res.durationMs}ms!\x1b[0m`);
        console.log(`Saved to: ${res.outputPath} (${(res.fileSizeBytes / 1024).toFixed(1)} KB)`);
        console.log(`Generated ${res.generatedNodes} Figma nodes (${res.stats.frames} frames, ${res.stats.textNodes} text nodes, ${res.stats.images} images, ${res.stats.shapes} shapes)`);
    }).catch(err => {
        console.error('\x1b[31m✖ Build failed:\x1b[0m', err.message);
        process.exit(1);
    });
}
