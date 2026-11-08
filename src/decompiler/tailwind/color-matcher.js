// src/decompiler/tailwind/color-matcher.js

/**
 * Standard Tailwind CSS color palette (v3/v4)
 * Hex values for 50..950 steps
 */
export const TAILWIND_COLORS = {
    slate: {
        50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8',
        50: '#f8fafc', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617'
    },
    gray: {
        50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db', 400: '#9ca3af',
        500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827', 950: '#030712'
    },
    zinc: {
        50: '#fafafa', 100: '#f4f4f5', 200: '#e4e4e7', 300: '#d4d4d8', 400: '#a1a1aa',
        500: '#71717a', 600: '#52525b', 700: '#3f3f46', 800: '#27272a', 900: '#18181b', 950: '#09090b'
    },
    neutral: {
        50: '#fafafa', 100: '#f5f5f5', 200: '#e5e5e5', 300: '#d4d4d4', 400: '#a3a3a3',
        500: '#737373', 600: '#525252', 700: '#404040', 800: '#262626', 900: '#171717', 950: '#0a0a0a'
    },
    stone: {
        50: '#fafaf9', 100: '#f5f5f4', 200: '#e7e5e4', 300: '#d6d3d1', 400: '#a8a29e',
        500: '#78716c', 600: '#57534e', 700: '#44403c', 800: '#292524', 900: '#1c1917', 950: '#0c0a09'
    },
    red: {
        50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171',
        500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d', 950: '#450a0a'
    },
    orange: {
        50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c',
        500: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412', 900: '#7c2d12', 950: '#431407'
    },
    amber: {
        50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24',
        500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03'
    },
    yellow: {
        50: '#fefce8', 100: '#fef9c3', 200: '#fef08a', 300: '#fde047', 400: '#facc15',
        500: '#eab308', 600: '#ca8a04', 700: '#a16207', 800: '#854d0e', 900: '#713f12', 950: '#422006'
    },
    lime: {
        50: '#f7fee7', 100: '#ecfccb', 200: '#d9f99d', 300: '#bef264', 400: '#a3e635',
        500: '#84cc16', 600: '#65a30d', 700: '#4d7c0f', 800: '#3f6212', 900: '#365314', 950: '#1a2e05'
    },
    green: {
        50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80',
        500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d', 950: '#052e16'
    },
    emerald: {
        50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399',
        500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b', 950: '#022c22'
    },
    teal: {
        50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf',
        500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e'
    },
    cyan: {
        50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9', 400: '#22d3ee',
        500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75', 900: '#164e63', 950: '#083344'
    },
    sky: {
        50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8',
        500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985', 900: '#0c4a6e', 950: '#082f49'
    },
    blue: {
        50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa',
        500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#172554'
    },
    indigo: {
        50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8',
        500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81', 950: '#1e1b4b'
    },
    violet: {
        50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa',
        500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065'
    },
    purple: {
        50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe', 400: '#c084fc',
        500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 800: '#6b21a8', 900: '#581c87', 950: '#3b0764'
    },
    fuchsia: {
        50: '#fdf4ff', 100: '#fae8ff', 200: '#f5d0fe', 300: '#f0abfc', 400: '#e879f9',
        500: '#d946ef', 600: '#c026d3', 700: '#a21caf', 800: '#86198f', 900: '#701a75', 950: '#4a044e'
    },
    pink: {
        50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4', 400: '#f472b6',
        500: '#ec4899', 600: '#db2777', 700: '#be185d', 800: '#9d174d', 900: '#831843', 950: '#500724'
    },
    rose: {
        50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185',
        500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337', 950: '#4c0519'
    }
};

/**
 * Precomputed RGB array of standard Tailwind colors for ultra-fast lookup
 */
const PALETTE_ENTRIES = [];

function hexToRgb(hex) {
    const clean = hex.replace(/^#/, '');
    const num = parseInt(clean, 16);
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}

// Populate palette entries
for (const [family, shades] of Object.entries(TAILWIND_COLORS)) {
    for (const [shade, hex] of Object.entries(shades)) {
        const rgb = hexToRgb(hex);
        PALETTE_ENTRIES.push({
            name: `${family}-${shade}`,
            hex,
            r: rgb.r,
            g: rgb.g,
            b: rgb.b
        });
    }
}

/**
 * Standard alpha opacity stops
 */
export const ALPHA_SCALE = [
    { key: '0', val: 0 },
    { key: '5', val: 0.05 },
    { key: '10', val: 0.1 },
    { key: '20', val: 0.2 },
    { key: '25', val: 0.25 },
    { key: '30', val: 0.3 },
    { key: '40', val: 0.4 },
    { key: '50', val: 0.5 },
    { key: '60', val: 0.6 },
    { key: '70', val: 0.7 },
    { key: '75', val: 0.75 },
    { key: '80', val: 0.8 },
    { key: '90', val: 0.9 },
    { key: '95', val: 0.95 },
    { key: '100', val: 1 }
];

/**
 * Parses any color format (hex, rgb, rgba, hsl, figma {r,g,b,a}) into normalized { r, g, b, a }
 * r, g, b: 0..255; a: 0..1
 * @param {string|object} color
 * @returns {{ r: number, g: number, b: number, a: number }|null}
 */
export function parseColor(color) {
    if (!color) return null;

    if (typeof color === 'object') {
        let r = color.r ?? 0;
        let g = color.g ?? 0;
        let b = color.b ?? 0;
        let a = color.a !== undefined ? color.a : 1;

        // Figma Kiwi float color format (0..1)
        if (r <= 1.0 && g <= 1.0 && b <= 1.0 && (r > 0 || g > 0 || b > 0 || a < 1)) {
            r = Math.round(r * 255);
            g = Math.round(g * 255);
            b = Math.round(b * 255);
        }
        return { r, g, b, a: Math.round(a * 100) / 100 };
    }

    if (typeof color !== 'string') return null;

    const trimmed = color.trim().toLowerCase();
    if (trimmed === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    if (trimmed === 'currentcolor' || trimmed === 'inherit') return null;

    // Hex syntax
    if (trimmed.startsWith('#')) {
        const hex = trimmed.slice(1);
        if (hex.length === 3 || hex.length === 4) {
            const r = parseInt(hex[0] + hex[0], 16);
            const g = parseInt(hex[1] + hex[1], 16);
            const b = parseInt(hex[2] + hex[2], 16);
            const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
            return { r, g, b, a: Math.round(a * 100) / 100 };
        }
        if (hex.length === 6 || hex.length === 8) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
            return { r, g, b, a: Math.round(a * 100) / 100 };
        }
    }

    // rgb(...) / rgba(...)
    const rgbMatch = trimmed.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.%]+))?\s*\)$/);
    if (rgbMatch) {
        const r = Math.round(parseFloat(rgbMatch[1]));
        const g = Math.round(parseFloat(rgbMatch[2]));
        const b = Math.round(parseFloat(rgbMatch[3]));
        let a = 1;
        if (rgbMatch[4]) {
            a = rgbMatch[4].endsWith('%') ? parseFloat(rgbMatch[4]) / 100 : parseFloat(rgbMatch[4]);
        }
        return { r, g, b, a: Math.round(a * 100) / 100 };
    }

    return null;
}

/**
 * Converts r, g, b to 6-digit hex string
 */
export function rgbToHex(r, g, b) {
    const toHex = (n) => {
        const hex = Math.max(0, Math.min(255, Math.round(n))).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Calculates weighted Euclidean color distance between two RGB colors (approximates human eye sensitivity)
 */
function colorDistance(r1, g1, b1, r2, g2, b2) {
    const rMean = (r1 + r2) / 2;
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    // Redmean color difference formula
    return Math.sqrt((((512 + rMean) * dr * dr) >> 8) + 4 * dg * dg + (((767 - rMean) * db * db) >> 8));
}

/**
 * Matches an alpha value to standard Tailwind alpha stop
 */
export function matchAlpha(alpha, tolerance = 0.03) {
    if (alpha >= 0.99) return '';

    let closest = ALPHA_SCALE[0];
    let minDiff = Infinity;
    for (const stop of ALPHA_SCALE) {
        const diff = Math.abs(stop.val - alpha);
        if (diff < minDiff) {
            minDiff = diff;
            closest = stop;
        }
    }

    if (minDiff <= tolerance) {
        return `/${closest.key}`;
    }

    return `/[${Math.round(alpha * 100) / 100}]`;
}

/**
 * Matches a color to the Tailwind palette or arbitrary hex syntax
 * @param {string|object} colorInput Color string or { r, g, b, a }
 * @param {object} [options={}]
 * @param {number} [options.maxDistance=4.0] Threshold for matching named palette (0 = exact match)
 * @param {Map<string, string>|object} [options.variableMap] Figma variable bindings
 * @returns {{ name: string, alphaStr: string, classSuffix: string, isArbitrary: boolean }}
 */
export function matchColor(colorInput, options = {}) {
    const parsed = parseColor(colorInput);
    if (!parsed) {
        if (typeof colorInput === 'string') {
            if (colorInput === 'currentColor' || colorInput === 'inherit') {
                return { name: 'current', alphaStr: '', classSuffix: 'current', isArbitrary: false };
            }
            if (colorInput.startsWith('var(')) {
                return { name: `[${colorInput}]`, alphaStr: '', classSuffix: `[${colorInput}]`, isArbitrary: true };
            }
        }
        return { name: 'transparent', alphaStr: '', classSuffix: 'transparent', isArbitrary: false };
    }

    const { r, g, b, a } = parsed;

    // 1. Transparent
    if (a === 0) {
        return { name: 'transparent', alphaStr: '', classSuffix: 'transparent', isArbitrary: false };
    }

    // 2. Pure White & Black check
    const hex = rgbToHex(r, g, b);
    const alphaStr = matchAlpha(a);

    // 3. Variable Map Check (Figma Variables & Design Tokens have highest priority!)
    if (options.variableMap) {
        const varMap = options.variableMap instanceof Map ? options.variableMap : new Map(Object.entries(options.variableMap));
        if (varMap.has(hex)) {
            const varName = varMap.get(hex);
            return {
                name: varName,
                alphaStr,
                classSuffix: `${varName}${alphaStr}`,
                isArbitrary: false
            };
        }
    }

    if (r >= 254 && g >= 254 && b >= 254) {
        return { name: 'white', alphaStr, classSuffix: `white${alphaStr}`, isArbitrary: false };
    }
    if (r <= 2 && g <= 2 && b <= 2) {
        return { name: 'black', alphaStr, classSuffix: `black${alphaStr}`, isArbitrary: false };
    }

    // 4. Palette Match
    const maxDist = options.maxDistance !== undefined ? options.maxDistance : 4.0;
    let bestMatch = null;
    let minDistance = Infinity;

    for (const entry of PALETTE_ENTRIES) {
        const dist = colorDistance(r, g, b, entry.r, entry.g, entry.b);
        if (dist < minDistance) {
            minDistance = dist;
            bestMatch = entry;
        }
    }

    if (bestMatch && minDistance <= maxDist) {
        return {
            name: bestMatch.name,
            alphaStr,
            classSuffix: `${bestMatch.name}${alphaStr}`,
            isArbitrary: false
        };
    }

    // 5. Arbitrary Fallback
    const arbitraryName = `[${hex}]`;
    return {
        name: arbitraryName,
        alphaStr,
        classSuffix: `${arbitraryName}${alphaStr}`,
        isArbitrary: true
    };
}
