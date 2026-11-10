// src/decompiler/tailwind/scaffold.js
import { generateTailwindV3Config, generateTailwindV4ThemeCss } from './theme-exporter.js';

/**
 * Generates production-ready project scaffolding files for Tailwind CSS
 * @param {object} params
 * @param {string} [params.projectName='figmatik-tailwind-app']
 * @param {'v3'|'v4'} [params.version='v4']
 * @param {object} [params.themeData={}] Extracted Figma variables & design tokens
 * @param {string} [params.htmlContent='']
 * @returns {Record<string, string>} Map of relative file paths to file contents
 */
export function generateTailwindScaffold(params = {}) {
    const {
        projectName = 'figmatik-tailwind-app',
        version = 'v4',
        themeData = {},
        htmlContent = '<!DOCTYPE html>\n<html><body></body></html>'
    } = params;

    const files = {};

    if (version === 'v4') {
        // Tailwind CSS v4 Zero-Config / Oxide Scaffolding
        files['package.json'] = JSON.stringify({
            name: projectName,
            version: '1.0.0',
            private: true,
            type: 'module',
            scripts: {
                dev: '@tailwindcss/cli -i ./src/app.css -o ./dist/output.css --watch',
                build: '@tailwindcss/cli -i ./src/app.css -o ./dist/output.css --minify'
            },
            devDependencies: {
                '@tailwindcss/cli': '^4.0.0',
                tailwindcss: '^4.0.0'
            }
        }, null, 2) + '\n';

        files['src/app.css'] = generateTailwindV4ThemeCss(themeData);
    } else {
        // Tailwind CSS v3 Classic Scaffolding
        files['package.json'] = JSON.stringify({
            name: projectName,
            version: '1.0.0',
            private: true,
            scripts: {
                dev: 'tailwindcss -i ./src/input.css -o ./dist/output.css --watch',
                build: 'tailwindcss -i ./src/input.css -o ./dist/output.css --minify'
            },
            devDependencies: {
                tailwindcss: '^3.4.10',
                postcss: '^8.4.40',
                autoprefixer: '^10.4.20'
            }
        }, null, 2) + '\n';

        files['tailwind.config.js'] = generateTailwindV3Config(themeData);

        files['postcss.config.js'] = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;

        files['src/input.css'] = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;
    }

    // Link output stylesheet in HTML if not already linked
    let processedHtml = htmlContent;
    if (!processedHtml.includes('output.css')) {
        processedHtml = processedHtml.replace(
            '</head>',
            '  <link rel="stylesheet" href="./output.css">\n</head>'
        );
    }
    files['dist/index.html'] = processedHtml;

    return files;
}

/**
 * Injects zero-dependency Tailwind Play CDN and theme into standalone HTML document
 * @param {string} htmlContent
 * @param {object} [themeData={}]
 * @returns {string} Self-contained HTML with working Tailwind in any browser
 */
export function injectTailwindCdn(htmlContent, themeData = {}) {
    if (!htmlContent) return '';

    const { colors = {}, spacing = {}, radii = {}, fonts = {}, fontFamily = {} } = themeData;
    const fontsMap = Object.keys(fontFamily).length > 0 ? fontFamily : fonts;
    const hasThemeOverrides = Object.keys(colors).length > 0 ||
                              Object.keys(spacing).length > 0 ||
                              Object.keys(radii).length > 0 ||
                              Object.keys(fontsMap).length > 0;

    let cdnTags = '<script src="https://cdn.tailwindcss.com"></script>\n';

    if (hasThemeOverrides) {
        const extendLines = [];
        if (Object.keys(colors).length > 0) extendLines.push(`          colors: ${JSON.stringify(colors)},`);
        if (Object.keys(spacing).length > 0) extendLines.push(`          spacing: ${JSON.stringify(spacing)},`);
        if (Object.keys(radii).length > 0) extendLines.push(`          borderRadius: ${JSON.stringify(radii)},`);
        if (Object.keys(fontsMap).length > 0) extendLines.push(`          fontFamily: ${JSON.stringify(fontsMap)},`);

        if (extendLines.length > 0) {
            extendLines[extendLines.length - 1] = extendLines[extendLines.length - 1].replace(/,$/, '');
        }

        const configScript = `  <script>
    tailwind.config = {
      theme: {
        extend: {
${extendLines.join('\n')}
        }
      }
    };
  </script>\n`;
        cdnTags += configScript;
    }

    if (htmlContent.includes('</head>')) {
        return htmlContent.replace('</head>', `  ${cdnTags}</head>`);
    }

    return `${cdnTags}${htmlContent}`;
}
