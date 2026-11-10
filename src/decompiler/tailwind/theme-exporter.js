// src/decompiler/tailwind/theme-exporter.js
import { formatColor } from '../css/color-formatter.js';
import { mapStylesToTailwind } from './mapper.js';

/**
 * Extracts and formats Figma variables into Tailwind theme configuration
 * @param {Array<object>} variables Native Figma variable objects
 * @param {Array<object>} variableSets Native Figma variable sets (collections)
 * @returns {{ colors: Record<string, string>, spacing: Record<string, string>, radii: Record<string, string>, fonts: Record<string, string> }}
 */
export function extractFigmaVariablesTheme(variables = [], variableSets = []) {
    const colors = {};
    const spacing = {};
    const radii = {};
    const fonts = {};

    if (!Array.isArray(variables) || variables.length === 0) {
        return { colors, spacing, radii, fonts };
    }

    // Helper to sanitize name into clean camelCase / kebab-case key
    const sanitizeKey = (name) => {
        return name
            .toLowerCase()
            .replace(/[/_ ]+/g, '-')
            .replace(/[^a-z0-9-]+/g, '')
            .replace(/^-+|-+$/g, '');
    };

    for (const v of variables) {
        if (!v || !v.name) continue;
        const key = sanitizeKey(v.name);

        if (v.type === 'COLOR') {
            const rawVal = v.valuesByMode ? Object.values(v.valuesByMode)[0] : v.value;
            if (rawVal) {
                const hex = formatColor(rawVal, rawVal.a ?? 1);
                colors[key] = hex;
            }
        } else if (v.type === 'FLOAT') {
            const rawVal = v.valuesByMode ? Object.values(v.valuesByMode)[0] : v.value;
            if (typeof rawVal === 'number') {
                if (key.includes('radius') || key.includes('corner')) {
                    radii[key] = `${rawVal}px`;
                } else if (key.includes('space') || key.includes('gap') || key.includes('padding') || key.includes('margin')) {
                    spacing[key] = `${rawVal}px`;
                } else {
                    spacing[key] = `${rawVal}px`;
                }
            }
        } else if (v.type === 'STRING') {
            const rawVal = v.valuesByMode ? Object.values(v.valuesByMode)[0] : v.value;
            if (typeof rawVal === 'string' && (key.includes('font') || key.includes('family'))) {
                fonts[key] = rawVal;
            }
        }
    }

    return { colors, spacing, radii, fonts };
}

/**
 * Generates tailwind.config.js file contents for Tailwind CSS v3
 * @param {object} themeData
 * @returns {string}
 */
export function generateTailwindV3Config(themeData = {}) {
    const { colors = {}, spacing = {}, radii = {}, fonts = {} } = themeData;

    return `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./src/**/*.{html,js,ts,jsx,tsx,vue,svelte}"
  ],
  theme: {
    extend: {
      colors: ${JSON.stringify(colors, null, 6).replace(/\n/g, '\n      ')},
      spacing: ${JSON.stringify(spacing, null, 6).replace(/\n/g, '\n      ')},
      borderRadius: ${JSON.stringify(radii, null, 6).replace(/\n/g, '\n      ')},
      fontFamily: ${JSON.stringify(fonts, null, 6).replace(/\n/g, '\n      ')}
    }
  },
  plugins: []
};
`;
}

/**
 * Generates modern CSS-first @theme block for Tailwind CSS v4
 * @param {object} themeData
 * @returns {string}
 */
export function generateTailwindV4ThemeCss(themeData = {}) {
    const { colors = {}, spacing = {}, radii = {}, fonts = {} } = themeData;
    const lines = ['@import "tailwindcss";', '', '@theme {'];

    for (const [key, val] of Object.entries(colors)) {
        lines.push(`  --color-${key}: ${val};`);
    }
    for (const [key, val] of Object.entries(spacing)) {
        lines.push(`  --spacing-${key}: ${val};`);
    }
    for (const [key, val] of Object.entries(radii)) {
        lines.push(`  --radius-${key}: ${val};`);
    }
    for (const [key, val] of Object.entries(fonts)) {
        lines.push(`  --font-${key}: "${val}", sans-serif;`);
    }

    lines.push('}');
    lines.push('');
    return lines.join('\n');
}

/**
 * Generates Hybrid CSS (BEM + @apply) stylesheet from unique CSS rules
 * Translates traditional styles into Tailwind @apply statements
 * @param {Map<string, Record<string, string>>|object} rulesMap className -> style dictionary
 * @param {object} [options={}]
 * @returns {string} Clean CSS stylesheet with @apply directives
 */
export function generateHybridApplyStylesheet(rulesMap = {}, options = {}) {
    const entries = rulesMap instanceof Map ? Array.from(rulesMap.entries()) : Object.entries(rulesMap);
    const cssBlocks = ['@tailwind base;', '@tailwind components;', '@tailwind utilities;', ''];

    for (const [className, styles] of entries) {
        if (!className || !styles || Object.keys(styles).length === 0) continue;

        const { classes } = mapStylesToTailwind(styles, options);
        if (classes.length > 0) {
            const cleanSelector = className.startsWith('.') ? className : `.${className}`;
            cssBlocks.push(`${cleanSelector} {`);
            cssBlocks.push(`  @apply ${classes.join(' ')};`);
            cssBlocks.push('}');
            cssBlocks.push('');
        }
    }

    return cssBlocks.join('\n');
}
