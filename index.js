// index.js
const { generateFigFile } = require('./src/generator');
const { convertHtmlToNodes } = require('./src/converter');
const { getCompiledSchema } = require('./src/schema');
const { ImageRegistry } = require('./src/parsers/images');
const { parseColor } = require('./src/parsers/color');
const { parseGradient } = require('./src/parsers/gradient');
const { parseAllEffects } = require('./src/parsers/effects');

// Programmatic API
module.exports = {
    generateFigFile,
    convertHtmlToNodes,
    getCompiledSchema,
    ImageRegistry,
    parseColor,
    parseGradient,
    parseAllEffects
};

// When run directly as `node index.js`
if (require.main === module) {
    const htmlPath = process.argv[2] || 'test.html';
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
