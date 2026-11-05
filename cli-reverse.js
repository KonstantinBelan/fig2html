#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { convertFigToHtml } = require('./src/decompiler');
const pkg = require('./package.json');

const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    gray: '\x1b[90m'
};

function printBanner() {
    console.log(`
${colors.magenta}${colors.bold}┌──────────────────────────────────────────┐
│             Figma to HTML CLI            │
│               v${pkg.version.padEnd(25)} │
└──────────────────────────────────────────┘${colors.reset}`);
}

function printHelp() {
    printBanner();
    console.log(`
${colors.bold}USAGE:${colors.reset}
  $ fig-to-html <input.fig> [output.html] [options]
  $ fig-to-html -i <input.fig> -o <output.html>

${colors.bold}ARGUMENTS:${colors.reset}
  ${colors.green}<input.fig>${colors.reset}       Path to the source .fig file
  ${colors.green}[output.html]${colors.reset}     Path for the generated .html file (default: <input-basename>.html)

${colors.bold}OPTIONS:${colors.reset}
  ${colors.cyan}-i, --input <file>${colors.reset}         Path to input .fig file
  ${colors.cyan}-o, --output <file>${colors.reset}        Path to output .html file
  ${colors.cyan}-p, --page <name>${colors.reset}          Target Figma page name (default: "Page 1")
  ${colors.cyan}-w, --watch${colors.reset}                Watch input file and rebuild automatically on change
  ${colors.cyan}-s, --separate-files${colors.reset}      Extract external CSS (css/style.css) and images (img/)
  ${colors.cyan}--extract-css${colors.reset}              Extract stylesheet to a separate CSS file instead of <style>
  ${colors.cyan}--css-file <path>${colors.reset}          Path for external CSS file (default: "css/style.css")
  ${colors.cyan}--no-inline-images${colors.reset}       Extract images to separate files instead of Base64
  ${colors.cyan}--assets-dir <dir>${colors.reset}        Directory for extracted images (default: "img")
  ${colors.cyan}--inline-styles${colors.reset}          Generate inline style attributes instead of <style> classes
  ${colors.cyan}--image-scale <n>${colors.reset}         Image scaling multiplier based on CSS size (default: 2 for 2x retina)
  ${colors.cyan}--no-srcset${colors.reset}               Disable responsive srcset/sizes for different devices
  ${colors.cyan}-c, --compress, --lossless${colors.reset} Compress images losslessly without quality loss
  ${colors.cyan}--format <fmt>${colors.reset}             Convert images to modern format: webp, avif, or original (default: original)
  ${colors.cyan}--webp${colors.reset}                     Shortcut for --format webp
  ${colors.cyan}--avif${colors.reset}                     Shortcut for --format avif
  ${colors.cyan}-v, --verbose${colors.reset}              Print verbose execution logs
  ${colors.cyan}-h, --help${colors.reset}                 Display this help message
  ${colors.cyan}-V, --version${colors.reset}              Display version number

${colors.bold}EXAMPLES:${colors.reset}
  ${colors.gray}# Simple reverse conversion (single self-contained HTML):${colors.reset}
  $ fig-to-html design.fig

  ${colors.gray}# Extract separate CSS (css/style.css) and images (img/*) with WebP format:${colors.reset}
  $ fig-to-html design.fig -s --webp

  ${colors.gray}# Lossless image compression with modern AVIF format:${colors.reset}
  $ fig-to-html design.fig -s --avif --compress

  ${colors.gray}# Disable responsive srcset (generate single 2x retina image):${colors.reset}
  $ fig-to-html design.fig --no-srcset

  ${colors.gray}# Custom CSS file and assets directory:${colors.reset}
  $ fig-to-html test/hard.fig index.html --extract-css --css-file styles/main.css --assets-dir img
`);
}

function parseArgs(args) {
    const options = {
        input: null,
        output: null,
        page: 'Page 1',
        watch: false,
        inlineImages: true,
        inlineStyles: false,
        separateFiles: false,
        extractCss: false,
        cssFile: 'css/style.css',
        assetsDir: 'img',
        verbose: false,
        imageScale: 2,
        responsiveImages: true,
        compress: false,
        imageFormat: 'original'
    };

    const positionals = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '-h' || arg === '--help') {
            printHelp();
            process.exit(0);
        } else if (arg === '-V' || arg === '--version') {
            console.log(`v${pkg.version}`);
            process.exit(0);
        } else if (arg === '-i' || arg === '--input') {
            options.input = args[++i];
        } else if (arg === '-o' || arg === '--output') {
            options.output = args[++i];
        } else if (arg === '-p' || arg === '--page') {
            options.page = args[++i];
        } else if (arg === '-w' || arg === '--watch') {
            options.watch = true;
        } else if (arg === '-s' || arg === '--separate-files' || arg === '--split') {
            options.separateFiles = true;
            options.extractCss = true;
            options.inlineImages = false;
        } else if (arg === '--extract-css' || arg === '--external-css') {
            options.extractCss = true;
        } else if (arg === '--css-file' || arg === '--css') {
            options.extractCss = true;
            options.cssFile = args[++i];
        } else if (arg === '--no-inline-images') {
            options.inlineImages = false;
        } else if (arg === '--inline-styles') {
            options.inlineStyles = true;
        } else if (arg === '--assets-dir' || arg === '--img-dir') {
            options.assetsDir = args[++i];
            options.inlineImages = false;
        } else if (arg === '--image-scale' || arg === '--scale') {
            options.imageScale = parseFloat(args[++i]);
        } else if (arg === '--no-srcset' || arg === '--no-responsive' || arg === '--no-responsive-images') {
            options.responsiveImages = false;
        } else if (arg === '--srcset' || arg === '--responsive' || arg === '--responsive-images') {
            options.responsiveImages = true;
        } else if (arg === '-c' || arg === '--compress' || arg === '--lossless' || arg === '--optimize' || arg === '--compress-images') {
            options.compress = true;
        } else if (arg === '--format' || arg === '--image-format') {
            options.imageFormat = args[++i];
        } else if (arg === '--webp') {
            options.imageFormat = 'webp';
        } else if (arg === '--avif') {
            options.imageFormat = 'avif';
        } else if (arg === '-v' || arg === '--verbose') {
            options.verbose = true;
        } else if (!arg.startsWith('-')) {
            positionals.push(arg);
        }
    }

    if (!options.input && positionals.length > 0) {
        options.input = positionals[0];
    }
    if (!options.output && positionals.length > 1) {
        options.output = positionals[1];
    }

    if (!options.output && options.input) {
        const ext = path.extname(options.input);
        const base = path.basename(options.input, ext);
        options.output = `${base}.html`;
    }

    return options;
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function runConversion(options) {
    const inputPath = path.resolve(options.input);
    const outputPath = path.resolve(options.output);

    console.log(`${colors.magenta}⚡ Decompiling:${colors.reset} ${path.basename(inputPath)} -> ${path.basename(outputPath)}...`);

    const result = await convertFigToHtml(inputPath, {
        outputHtmlPath: outputPath,
        pageName: options.page,
        inlineImages: options.inlineImages,
        inlineStyles: options.inlineStyles,
        separateFiles: options.separateFiles,
        extractCss: options.extractCss,
        cssFile: options.cssFile,
        assetsDir: options.assetsDir,
        verbose: options.verbose,
        imageScale: options.imageScale,
        responsiveImages: options.responsiveImages,
        compress: options.compress,
        imageFormat: options.imageFormat
    });

    const outStat = fs.statSync(outputPath);

    console.log(`\n${colors.green}${colors.bold}✔ Decompilation complete in ${result.durationMs}ms!${colors.reset}`);
    console.log(`${colors.bold}┌─────────────────────────────────────────┐${colors.reset}`);
    console.log(`│ ${colors.bold}HTML:${colors.reset}       ${path.basename(outputPath).padEnd(27)} │`);
    console.log(`│ ${colors.bold}HTML Size:${colors.reset}  ${formatBytes(outStat.size).padEnd(27)} │`);
    if (result.cssPath && fs.existsSync(result.cssPath)) {
        const cssStat = fs.statSync(result.cssPath);
        const relCss = path.relative(path.dirname(outputPath), result.cssPath);
        console.log(`│ ${colors.bold}CSS:${colors.reset}        ${(relCss + ' (' + formatBytes(cssStat.size) + ')').padEnd(27)} │`);
    }
    if (result.assetsDir && fs.existsSync(result.assetsDir)) {
        const relAssets = path.relative(path.dirname(outputPath), result.assetsDir);
        const filesCount = fs.readdirSync(result.assetsDir).length;
        console.log(`│ ${colors.bold}Assets:${colors.reset}     ${(relAssets + '/ (' + filesCount + ' files)').padEnd(27)} │`);
    }
    console.log(`│ ${colors.bold}Nodes:${colors.reset}      ${String(result.totalNodes + ' total in fig').padEnd(27)} │`);
    console.log(`│   ${colors.dim}Frames:${colors.reset}   ${String(result.stats.frames).padEnd(27)} │`);
    console.log(`│   ${colors.dim}Text:${colors.reset}     ${String(result.stats.textNodes).padEnd(27)} │`);
    console.log(`│   ${colors.dim}Images:${colors.reset}   ${String(result.stats.images).padEnd(27)} │`);
    console.log(`│   ${colors.dim}Shapes:${colors.reset}   ${String(result.stats.shapes).padEnd(27)} │`);
    if (result.stats.imageOptimization && result.stats.imageOptimization.optimizedCount > 0) {
        const opt = result.stats.imageOptimization;
        const fmtStr = options.imageFormat !== 'original' ? options.imageFormat.toUpperCase() : 'Retina 2x';
        const ratio = opt.totalBeforeBytes > 0
            ? Math.round((1 - opt.totalAfterBytes / opt.totalBeforeBytes) * 100)
            : 0;
        const ratioStr = ratio > 0 ? `-${ratio}%` : `${formatBytes(opt.totalAfterBytes)}`;
        console.log(`│ ${colors.bold}Img Opt:${colors.reset}    ${(`${fmtStr} (${ratioStr})`).padEnd(27)} │`);
    }
    console.log(`${colors.bold}└─────────────────────────────────────────┘${colors.reset}`);
    console.log(`\n${colors.gray}Open ${colors.bold}${outputPath}${colors.reset}${colors.gray} in any browser.${colors.reset}\n`);

    return result;
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        printHelp();
        process.exit(1);
    }

    const options = parseArgs(args);

    if (!options.input) {
        console.error(`${colors.red}Error: No input .fig file specified.${colors.reset}`);
        console.log(`Run ${colors.magenta}fig-to-html --help${colors.reset} for usage information.`);
        process.exit(1);
    }

    if (!fs.existsSync(options.input)) {
        console.error(`${colors.red}Error: Input file "${options.input}" not found.${colors.reset}`);
        process.exit(1);
    }

    printBanner();

    try {
        await runConversion(options);

        // Watch mode
        if (options.watch) {
            console.log(`${colors.yellow}👀 Watching for file changes on "${options.input}"... (Ctrl+C to stop)${colors.reset}`);

            let debounceTimer = null;
            fs.watch(options.input, (eventType) => {
                if (eventType === 'change') {
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(async () => {
                        console.log(`\n${colors.cyan}🔄 File changed, re-converting...${colors.reset}`);
                        try {
                            await runConversion(options);
                        } catch (err) {
                            console.error(`${colors.red}Conversion failed: ${err.message}${colors.reset}`);
                        }
                    }, 200);
                }
            });
        }
    } catch (err) {
        console.error(`\n${colors.red}${colors.bold}✖ Error during decompilation:${colors.reset} ${err.message}`);
        if (options.verbose) {
            console.error(err.stack);
        }
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    parseArgs,
    runConversion
};
