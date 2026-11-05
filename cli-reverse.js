#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { convertFigToHtml } = require('./src/decompiler');
const { ProgressBar } = require('./src/utils/progress-bar');
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
  ${colors.cyan}--multi-page${colors.reset}              Enable multi-page export mode (default: auto/enabled)
  ${colors.cyan}--single-page${colors.reset}             Force single-page export only
  ${colors.cyan}--page-tag <tag>${colors.reset}          Custom page tag or comma-separated list of tags
  ${colors.cyan}--exclude-tag <tag>${colors.reset}       Exclude frames containing tag(s) (e.g. "[exclude]", "[исключить]")
  ${colors.cyan}--no-outlier-detection${colors.reset}    Disable automatic screen artboard outlier filtering
  ${colors.cyan}--pages <names>${colors.reset}           Filter specific pages/frames to export comma-separated
  ${colors.cyan}--all-canvases${colors.reset}            Export all document canvas tabs as separate HTML pages
  ${colors.cyan}--min-page-width <px>${colors.reset}     Minimum frame width to recognize as screen artboard (default: 320)
  ${colors.cyan}--min-page-height <px>${colors.reset}    Minimum frame height to recognize as screen artboard (default: 400)
  ${colors.cyan}--class-scope <mode>${colors.reset}      CSS collision resolution: modifier, scoped, or numbered (default: modifier)
  ${colors.cyan}-w, --watch${colors.reset}                Watch input file and rebuild automatically on change
  ${colors.cyan}--responsive${colors.reset}              Auto-detect & merge responsive breakpoints into 1 page (default: true)
  ${colors.cyan}--no-responsive${colors.reset}           Disable responsive merge (export each frame as separate page)
  ${colors.cyan}--breakpoints <list>${colors.reset}      Custom target breakpoint widths (e.g. "1440,768,375")
  ${colors.cyan}--mobile-first${colors.reset}            Generate mobile-first CSS (min-width instead of max-width)
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
  ${colors.cyan}--layout <mode>${colors.reset}           Layout mode: default (px), relative (rem/em/vw/vh), fluid (clamp/min/max), or grid
  ${colors.cyan}--fluid${colors.reset}                   Shortcut for --layout fluid (100vw/100dvh, clamp(), rem, vw/vh)
  ${colors.cyan}--relative, --rem${colors.reset}         Shortcut for --layout relative (rem, em, vw/vh instead of px)
  ${colors.cyan}--grid${colors.reset}                    Shortcut for --layout grid (CSS Grid layout)
  ${colors.cyan}--tokens [path]${colors.reset}           Extract Figma Variables into design tokens JSON (default: tokens.json)
  ${colors.cyan}--smart-layout${colors.reset}           Synthesize clean Flexbox & Grid without absolute positioning (default: enabled)
  ${colors.cyan}--no-smart-layout${colors.reset}        Disable Smart Layout Synthesis and fallback to absolute positioning
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
        multiPage: true,
        singlePage: false,
        pageTag: null,
        pages: null,
        allCanvases: false,
        minPageWidth: 320,
        minPageHeight: 400,
        classScope: 'modifier',
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
        imageFormat: 'original',
        layoutMode: 'default',
        smartLayout: true,
        responsive: true,
        breakpoints: null,
        mobileFirst: false
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
        } else if (arg === '--multi-page') {
            options.multiPage = true;
            options.singlePage = false;
        } else if (arg === '--single-page') {
            options.singlePage = true;
            options.multiPage = false;
        } else if (arg === '--page-tag' || arg === '--tag') {
            options.pageTag = args[++i];
        } else if (arg === '--exclude-tag' || arg === '--exclude') {
            options.excludeTag = args[++i];
        } else if (arg === '--no-outlier-detection') {
            options.outlierDetection = false;
        } else if (arg === '--pages') {
            options.pages = args[++i];
        } else if (arg === '--all-canvases' || arg === '--all-pages') {
            options.allCanvases = true;
        } else if (arg === '--min-page-width') {
            options.minPageWidth = parseFloat(args[++i]);
        } else if (arg === '--min-page-height') {
            options.minPageHeight = parseFloat(args[++i]);
        } else if (arg === '--class-scope' || arg === '--scope') {
            options.classScope = args[++i];
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
        } else if (arg === '--no-srcset' || arg === '--no-responsive-images') {
            options.responsiveImages = false;
        } else if (arg === '--srcset' || arg === '--responsive-images') {
            options.responsiveImages = true;
        } else if (arg === '--responsive') {
            options.responsive = true;
        } else if (arg === '--no-responsive') {
            options.responsive = false;
            options.noResponsive = true;
        } else if (arg === '--breakpoints') {
            options.breakpoints = args[++i];
        } else if (arg === '--mobile-first') {
            options.mobileFirst = true;
        } else if (arg === '-c' || arg === '--compress' || arg === '--lossless' || arg === '--optimize' || arg === '--compress-images') {
            options.compress = true;
        } else if (arg === '--format' || arg === '--image-format') {
            options.imageFormat = args[++i];
        } else if (arg === '--webp') {
            options.imageFormat = 'webp';
        } else if (arg === '--avif') {
            options.imageFormat = 'avif';
        } else if (arg === '--layout' || arg === '--layout-mode' || arg === '--mode') {
            options.layoutMode = args[++i];
        } else if (arg === '--fluid') {
            options.layoutMode = 'fluid';
        } else if (arg === '--relative' || arg === '--rem') {
            options.layoutMode = 'relative';
        } else if (arg === '--grid') {
            options.layoutMode = 'grid';
        } else if (arg === '--tokens' || arg === '--extract-tokens') {
            options.extractTokens = true;
            if (args[i + 1] && !args[i + 1].startsWith('-')) {
                options.tokens = args[++i];
            } else {
                options.tokens = true;
            }
        } else if (arg === '--smart-layout' || arg === '--smart') {
            options.smartLayout = true;
        } else if (arg === '--no-smart-layout' || arg === '--no-smart') {
            options.smartLayout = false;
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

    const bar = options.verbose ? null : new ProgressBar();
    let result;
    try {
        result = await convertFigToHtml(inputPath, {
            outputHtmlPath: outputPath,
            pageName: options.page,
            multiPage: options.multiPage,
            singlePage: options.singlePage,
            pageTag: options.pageTag,
            excludeTag: options.excludeTag,
            outlierDetection: options.outlierDetection,
            pages: options.pages,
            allCanvases: options.allCanvases,
            minPageWidth: options.minPageWidth,
            minPageHeight: options.minPageHeight,
            classScope: options.classScope,
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
            imageFormat: options.imageFormat,
            layoutMode: options.layoutMode,
            smartLayout: options.smartLayout,
            responsive: options.responsive,
            noResponsive: options.noResponsive,
            breakpoints: options.breakpoints,
            mobileFirst: options.mobileFirst,
            extractTokens: options.extractTokens,
            tokens: options.tokens,
            onProgress: (pct, msg) => bar && bar.update(pct, msg)
        });
    } finally {
        if (bar) bar.stop();
    }

    const finalHtmlPath = result.outputPath && fs.existsSync(result.outputPath)
        ? result.outputPath
        : (fs.existsSync(outputPath) ? outputPath : null);
    const outStat = finalHtmlPath ? fs.statSync(finalHtmlPath) : null;

    console.log(`\n${colors.green}${colors.bold}✔ Decompilation complete in ${result.durationMs}ms!${colors.reset}`);
    console.log(`${colors.bold}┌─────────────────────────────────────────┐${colors.reset}`);
    if (result.isMultiPage && result.pages && result.pages.length > 1) {
        const strat = result.stats?.detectionStrategy || 'multi';
        console.log(`│ ${colors.bold}Pages:${colors.reset}      ${(result.pages.length + ' pages (' + strat + ')').padEnd(27)} │`);
        for (let i = 0; i < Math.min(result.pages.length, 4); i++) {
            const p = result.pages[i];
            const pStr = `${p.fileName} (${p.cleanName})`;
            console.log(`│   ${colors.dim}P${i + 1}:${colors.reset}       ${pStr.slice(0, 26).padEnd(27)} │`);
        }
        if (result.pages.length > 4) {
            console.log(`│   ${colors.dim}... +${result.pages.length - 4} more pages${colors.reset}             │`);
        }
    } else {
        console.log(`│ ${colors.bold}HTML:${colors.reset}       ${path.basename(finalHtmlPath || outputPath).padEnd(27)} │`);
        if (outStat) {
            console.log(`│ ${colors.bold}HTML Size:${colors.reset}  ${formatBytes(outStat.size).padEnd(27)} │`);
        }
    }
    if (options.layoutMode && options.layoutMode !== 'default') {
        const layoutLabel = options.layoutMode === 'fluid' ? 'Fluid (100vw/100dvh)' : (options.layoutMode === 'grid' ? 'CSS Grid' : 'Relative (rem/vw)');
        console.log(`│ ${colors.bold}Layout:${colors.reset}     ${layoutLabel.padEnd(27)} │`);
    }
    if (result.cssPath && fs.existsSync(result.cssPath)) {
        const cssStat = fs.statSync(result.cssPath);
        const relCss = path.relative(path.dirname(outputPath), result.cssPath);
        console.log(`│ ${colors.bold}CSS:${colors.reset}        ${(relCss + ' (' + formatBytes(cssStat.size) + ')').padEnd(27)} │`);
    }
    if (result.tokensPath && fs.existsSync(result.tokensPath)) {
        const tokensStat = fs.statSync(result.tokensPath);
        const relTokens = path.relative(path.dirname(outputPath), result.tokensPath);
        console.log(`│ ${colors.bold}Tokens:${colors.reset}     ${(relTokens + ' (' + formatBytes(tokensStat.size) + ')').padEnd(27)} │`);
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
