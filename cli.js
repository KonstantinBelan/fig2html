#!/usr/bin/env node

/**
 * figmatik - HTML to Figma CLI
 * 
 * @author Konstantin Belan <kosbelan@yandex.ru>
 * @see https://t.me/konstantin_belan
 * @see https://github.com/KonstantinBelan/figmatik
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFigFile } from './src/generator.js';
import { convertFigToHtml } from './src/decompiler/index.js';
import { ProgressBar } from './src/utils/progress-bar.js';
import { isSafeSystemOutputPath } from './src/parsers/images.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Terminal ANSI styling
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
${colors.cyan}${colors.bold}┌──────────────────────────────────────────┐
│             HTML to Figma CLI            │
│               v${pkg.version.padEnd(25)} │
│       Author: Konstantin Belan           │
│     Telegram: @konstantin_belan          │
└──────────────────────────────────────────┘${colors.reset}`);
}

function printHelp() {
    printBanner();
    console.log(`
${colors.bold}USAGE:${colors.reset}
  $ html-to-fig <input.html> [output.fig] [options]
  $ html-to-fig -i <input.html> -o <output.fig>

${colors.bold}ARGUMENTS:${colors.reset}
  ${colors.green}<input.html>${colors.reset}      Path to the source HTML file
  ${colors.green}[output.fig]${colors.reset}      Path for the generated .fig file (default: <input-basename>.fig)

${colors.bold}OPTIONS:${colors.reset}
  ${colors.cyan}-i, --input <file>${colors.reset}       Path to input HTML file
  ${colors.cyan}-o, --output <file>${colors.reset}      Path to output .fig file
  ${colors.cyan}-t, --template <file>${colors.reset}    Path to template .fig (default: templates/template.fig)
  ${colors.cyan}-p, --page <name>${colors.reset}        Target Figma page name (default: "Page 1")
  ${colors.cyan}-w, --watch${colors.reset}              Watch input file and rebuild automatically on change
  ${colors.cyan}--no-remote-images${colors.reset}     Disable downloading remote HTTP/HTTPS images
  ${colors.cyan}-v, --verbose${colors.reset}            Print verbose execution logs
  ${colors.cyan}-h, --help${colors.reset}               Display this help message
  ${colors.cyan}-V, --version${colors.reset}            Display version number

${colors.bold}EXAMPLES:${colors.reset}
  ${colors.gray}# Simple conversion:${colors.reset}
  $ html-to-fig index.html

  ${colors.gray}# Specify custom output:${colors.reset}
  $ html-to-fig landing.html landing-design.fig

  ${colors.gray}# Live reload / watch mode:${colors.reset}
  $ html-to-fig test/test.html -w

${colors.bold}AUTHOR & COMMUNITY:${colors.reset}
  Konstantin Belan <kosbelan@yandex.ru>
  Telegram: https://t.me/konstantin_belan
  GitHub:   https://github.com/KonstantinBelan/figmatik
`);
}

function parseArgs(args) {
    const options = {
        input: null,
        output: null,
        template: 'templates/template.fig',
        page: 'Page 1',
        watch: false,
        remoteImages: true,
        verbose: false
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
        } else if (arg === '-t' || arg === '--template') {
            options.template = args[++i];
        } else if (arg === '-p' || arg === '--page') {
            options.page = args[++i];
        } else if (arg === '-w' || arg === '--watch') {
            options.watch = true;
        } else if (arg === '--no-remote-images') {
            options.remoteImages = false;
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
        options.output = ext.toLowerCase() === '.fig' ? `${base}.html` : `${base}.fig`;
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

    if (!isSafeSystemOutputPath(outputPath)) {
        console.error(`${colors.red}Error: Writing to system directory "${outputPath}" is disallowed for security reasons.${colors.reset}`);
        process.exit(1);
    }

    const isReverse = inputPath.toLowerCase().endsWith('.fig');

    if (isReverse) {
        console.log(`${colors.magenta}⚡ Decompiling:${colors.reset} ${path.basename(inputPath)} -> ${path.basename(outputPath)}...`);

        const bar = options.verbose ? null : new ProgressBar();
        let result;
        try {
            result = await convertFigToHtml(inputPath, {
                outputHtmlPath: outputPath,
                pageName: options.page,
                inlineImages: true,
                verbose: options.verbose,
                onProgress: (pct, msg) => bar && bar.update(pct, msg)
            });
        } finally {
            if (bar) bar.stop();
        }

        const outStat = fs.statSync(outputPath);

        console.log(`\n${colors.green}${colors.bold}✔ Decompilation complete in ${result.durationMs}ms!${colors.reset}`);
        console.log(`${colors.bold}┌─────────────────────────────────────────┐${colors.reset}`);
        console.log(`│ ${colors.bold}File:${colors.reset}       ${path.basename(outputPath).padEnd(27)} │`);
        console.log(`│ ${colors.bold}Size:${colors.reset}       ${formatBytes(outStat.size).padEnd(27)} │`);
        console.log(`│ ${colors.bold}Nodes:${colors.reset}      ${String(result.totalNodes + ' total in fig').padEnd(27)} │`);
        console.log(`│   ${colors.dim}Frames:${colors.reset}   ${String(result.stats.frames).padEnd(27)} │`);
        console.log(`│   ${colors.dim}Text:${colors.reset}     ${String(result.stats.textNodes).padEnd(27)} │`);
        console.log(`│   ${colors.dim}Images:${colors.reset}   ${String(result.stats.images).padEnd(27)} │`);
        console.log(`│   ${colors.dim}Shapes:${colors.reset}   ${String(result.stats.shapes).padEnd(27)} │`);
        console.log(`│ ${colors.bold}Images:${colors.reset}     ${String(result.imagesCount + ' extracted').padEnd(27)} │`);
        console.log(`${colors.bold}└─────────────────────────────────────────┘${colors.reset}`);
        console.log(`\n${colors.gray}Open ${colors.bold}${outputPath}${colors.reset}${colors.gray} in any browser to view.${colors.reset}\n`);

        return result;
    }

    console.log(`${colors.cyan}⚡ Compiling:${colors.reset} ${path.basename(inputPath)} -> ${path.basename(outputPath)}...`);

    const bar = options.verbose ? null : new ProgressBar();
    let result;
    try {
        result = await generateFigFile({
            htmlPath: inputPath,
            outputPath: outputPath,
            templatePath: path.resolve(options.template),
            pageName: options.page,
            allowRemoteImages: options.remoteImages,
            verbose: options.verbose,
            onProgress: (pct, msg) => bar && bar.update(pct, msg)
        });
    } finally {
        if (bar) bar.stop();
    }

    console.log(`\n${colors.green}${colors.bold}✔ Build complete in ${result.durationMs}ms!${colors.reset}`);
    console.log(`${colors.bold}┌─────────────────────────────────────────┐${colors.reset}`);
    console.log(`│ ${colors.bold}File:${colors.reset}       ${path.basename(result.outputPath).padEnd(27)} │`);
    console.log(`│ ${colors.bold}Size:${colors.reset}       ${formatBytes(result.fileSizeBytes).padEnd(27)} │`);
    console.log(`│ ${colors.bold}Nodes:${colors.reset}      ${String(result.generatedNodes + ' generated').padEnd(27)} │`);
    console.log(`│   ${colors.dim}Frames:${colors.reset}   ${String(result.stats.frames).padEnd(27)} │`);
    console.log(`│   ${colors.dim}Text:${colors.reset}     ${String(result.stats.textNodes).padEnd(27)} │`);
    console.log(`│   ${colors.dim}Images:${colors.reset}   ${String(result.stats.images).padEnd(27)} │`);
    console.log(`│   ${colors.dim}Shapes:${colors.reset}   ${String(result.stats.shapes).padEnd(27)} │`);
    console.log(`│ ${colors.bold}Embedded:${colors.reset}   ${String(result.embeddedImagesCount + ' image blobs').padEnd(27)} │`);
    console.log(`│ ${colors.bold}Zstd ratio:${colors.reset} ${String(result.compressionRatio + 'x').padEnd(27)} │`);
    console.log(`${colors.bold}└─────────────────────────────────────────┘${colors.reset}`);
    console.log(`\n${colors.gray}Drag and drop ${colors.bold}${result.outputPath}${colors.reset}${colors.gray} into Figma to open.${colors.reset}\n`);

    return result;
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--reverse')) {
        const reverseArgs = args.filter(a => a !== '--reverse');
        process.argv = [process.argv[0], path.resolve(__dirname, 'cli-reverse.js'), ...reverseArgs];
        const reverseCli = await import('./cli-reverse.js');
        return await reverseCli.main();
    }

    if (args.length === 0) {
        printHelp();
        process.exit(1);
    }

    const options = parseArgs(args);

    if (!options.input) {
        console.error(`${colors.red}Error: No input HTML file specified.${colors.reset}`);
        console.log(`Run ${colors.cyan}html-to-fig --help${colors.reset} for usage information.`);
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
                        console.log(`\n${colors.magenta}🔄 File changed, re-converting...${colors.reset}`);
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
        console.error(`\n${colors.red}${colors.bold}✖ Error during generation:${colors.reset} ${err.message}`);
        if (options.verbose) {
            console.error(err.stack);
        }
        process.exit(1);
    }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
    main();
}

export {
    parseArgs,
    runConversion,
    main
};
