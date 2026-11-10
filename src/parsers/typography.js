// src/parsers/typography.js

/**
 * Standard font metrics dictionary for accurate text measurement and line wrap estimation
 */
export const FONT_METRICS_TABLE = {
    'inter': { avgCharWidthRatio: 0.525, capHeightRatio: 0.727, xHeightRatio: 0.528, defaultLineHeight: 1.35 },
    'roboto': { avgCharWidthRatio: 0.520, capHeightRatio: 0.710, xHeightRatio: 0.530, defaultLineHeight: 1.30 },
    'open sans': { avgCharWidthRatio: 0.540, capHeightRatio: 0.714, xHeightRatio: 0.536, defaultLineHeight: 1.35 },
    'lato': { avgCharWidthRatio: 0.510, capHeightRatio: 0.718, xHeightRatio: 0.505, defaultLineHeight: 1.35 },
    'montserrat': { avgCharWidthRatio: 0.565, capHeightRatio: 0.700, xHeightRatio: 0.530, defaultLineHeight: 1.40 },
    'poppins': { avgCharWidthRatio: 0.555, capHeightRatio: 0.698, xHeightRatio: 0.540, defaultLineHeight: 1.45 },
    'plus jakarta sans': { avgCharWidthRatio: 0.535, capHeightRatio: 0.715, xHeightRatio: 0.525, defaultLineHeight: 1.35 },
    'sf pro': { avgCharWidthRatio: 0.520, capHeightRatio: 0.720, xHeightRatio: 0.520, defaultLineHeight: 1.30 },
    'sf pro display': { avgCharWidthRatio: 0.520, capHeightRatio: 0.720, xHeightRatio: 0.520, defaultLineHeight: 1.30 },
    'sf pro text': { avgCharWidthRatio: 0.530, capHeightRatio: 0.720, xHeightRatio: 0.530, defaultLineHeight: 1.32 },
    'arial': { avgCharWidthRatio: 0.518, capHeightRatio: 0.718, xHeightRatio: 0.518, defaultLineHeight: 1.25 },
    'helvetica': { avgCharWidthRatio: 0.518, capHeightRatio: 0.718, xHeightRatio: 0.523, defaultLineHeight: 1.25 },
    'georgia': { avgCharWidthRatio: 0.540, capHeightRatio: 0.693, xHeightRatio: 0.482, defaultLineHeight: 1.35 },
    'times new roman': { avgCharWidthRatio: 0.450, capHeightRatio: 0.662, xHeightRatio: 0.450, defaultLineHeight: 1.25 },
    'fira code': { avgCharWidthRatio: 0.600, capHeightRatio: 0.690, xHeightRatio: 0.485, defaultLineHeight: 1.40 },
    'jetbrains mono': { avgCharWidthRatio: 0.600, capHeightRatio: 0.710, xHeightRatio: 0.530, defaultLineHeight: 1.40 },
    'sf mono': { avgCharWidthRatio: 0.600, capHeightRatio: 0.700, xHeightRatio: 0.515, defaultLineHeight: 1.40 },
    'monospace': { avgCharWidthRatio: 0.600, capHeightRatio: 0.700, xHeightRatio: 0.500, defaultLineHeight: 1.40 }
};

/**
 * Returns font metrics for a given font family
 * @param {string} family
 * @returns {object}
 */
export function getFontMetrics(family) {
    if (!family) return FONT_METRICS_TABLE['inter'];
    const clean = String(family).toLowerCase().replace(/['"]/g, '').trim();
    if (FONT_METRICS_TABLE[clean]) {
        return FONT_METRICS_TABLE[clean];
    }
    // Substring match (e.g. "Inter, sans-serif" or "SF Pro Display")
    for (const [key, metrics] of Object.entries(FONT_METRICS_TABLE)) {
        if (clean.includes(key)) {
            return metrics;
        }
    }
    return FONT_METRICS_TABLE['inter'];
}

/**
 * Parses Google Fonts stylesheet URL and extracts requested font families, weights and styles
 * Example: https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Open+Sans:ital,wght@1,600&display=swap
 * @param {string} url
 * @returns {Array<{ family: string, weights: number[], hasItalic: boolean }>}
 */
export function parseGoogleFontsUrl(url) {
    if (!url || typeof url !== 'string' || !url.includes('fonts.googleapis.com')) {
        return [];
    }

    const results = [];
    try {
        const queryPart = url.includes('?') ? url.split('?')[1] : url;
        const searchParams = new URLSearchParams(queryPart);
        const families = searchParams.getAll('family');

        for (const famStr of families) {
            // Format 1: "Roboto:wght@400;700" or "Open+Sans:ital,wght@0,400;1,700"
            // Format 2: "Roboto:400,700" (CSS v1 API)
            const parts = famStr.split(':');
            const familyName = parts[0].replace(/\+/g, ' ').trim();
            const weights = new Set();
            let hasItalic = false;

            if (parts.length > 1) {
                const spec = parts[1];
                if (spec.includes('@')) {
                    const [axes, values] = spec.split('@');
                    const valList = values.split(';');
                    for (const v of valList) {
                        const vTokens = v.split(',');
                        if (axes.includes('ital')) {
                            const isItal = vTokens[0] === '1';
                            if (isItal) hasItalic = true;
                            const w = parseInt(vTokens[1] || vTokens[0], 10);
                            if (w) weights.add(w);
                        } else {
                            const w = parseInt(vTokens[0], 10);
                            if (w) weights.add(w);
                        }
                    }
                } else {
                    // v1 syntax: 400,700,700i
                    const tokens = spec.split(',');
                    for (const tok of tokens) {
                        if (tok.includes('i')) hasItalic = true;
                        const w = parseInt(tok, 10);
                        if (w) weights.add(w);
                    }
                }
            }

            results.push({
                family: familyName,
                weights: weights.size > 0 ? Array.from(weights).sort((a, b) => a - b) : [400],
                hasItalic
            });
        }
    } catch (_) {}

    return results;
}

/**
 * Extracts all Google Fonts references from HTML Document (both <link> tags and @import rules)
 * @param {Document} doc JSDOM document
 * @returns {Map<string, { family: string, weights: number[], hasItalic: boolean, originalUrl: string }>}
 */
export function extractWebFonts(doc) {
    const fontMap = new Map();
    if (!doc) return fontMap;

    // 1. Check <link> tags
    const links = doc.querySelectorAll('link[rel="stylesheet"], link[rel="preload"]');
    for (const link of links) {
        const href = link.getAttribute('href');
        if (href && href.includes('fonts.googleapis.com')) {
            const fonts = parseGoogleFontsUrl(href);
            for (const f of fonts) {
                fontMap.set(f.family.toLowerCase(), { ...f, originalUrl: href });
            }
        }
    }

    // 2. Check <style> tags with @import url(...)
    const styles = doc.querySelectorAll('style');
    for (const style of styles) {
        const text = style.textContent || '';
        const importRegex = /@import\s+(?:url\(['"]?([^'")]+)['"]?\)|['"]([^'"]+)['"])/g;
        let match;
        while ((match = importRegex.exec(text)) !== null) {
            const importUrl = match[1] || match[2];
            if (importUrl && importUrl.includes('fonts.googleapis.com')) {
                const fonts = parseGoogleFontsUrl(importUrl);
                for (const f of fonts) {
                    fontMap.set(f.family.toLowerCase(), { ...f, originalUrl: importUrl });
                }
            }
        }
    }

    return fontMap;
}

/**
 * Generates Google Fonts <link> HTML tags for specified font families
 * Used by decompiler when generating standalone HTML document
 * @param {Iterable<string>} fontFamilies
 * @returns {string}
 */
export function generateGoogleFontsLink(fontFamilies) {
    if (!fontFamilies) return '';
    const uniqueFamilies = Array.from(new Set(
        Array.from(fontFamilies)
            .map(f => String(f).trim().replace(/['"]/g, ''))
            .filter(f => f && !['inter', 'system-ui', 'sans-serif', 'serif', 'monospace', 'arial', 'helvetica', 'times new roman', 'georgia'].includes(f.toLowerCase()))
    ));

    if (uniqueFamilies.length === 0) return '';

    const familyParams = uniqueFamilies.map(f => `family=${encodeURIComponent(f)}:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,700`).join('&');
    const href = `https://fonts.googleapis.com/css2?${familyParams}&display=swap`;

    return `<link rel="preconnect" href="https://fonts.googleapis.com">\n` +
           `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n` +
           `<link href="${href}" rel="stylesheet">`;
}

/**
 * Parses font weight, style and family into Figma font representation
 */
export function parseFontStyle(weightStr, styleStr, family = 'Inter') {
    const isItalic = styleStr === 'italic' || styleStr === 'oblique';
    let weightNum = parseInt(weightStr, 10);

    if (weightStr === 'bold' || weightStr === 'bolder') weightNum = 700;
    else if (weightStr === 'lighter') weightNum = 300;
    else if (weightStr === 'normal' || !weightNum) weightNum = 400;

    // Round weight to nearest 100 for font style mapping (e.g. 510 -> 500 = Medium)
    const roundedWeight = Math.round(weightNum / 100) * 100;

    let styleName = 'Regular';
    let psSuffix = 'Regular';

    if (roundedWeight <= 100) { styleName = 'Thin'; psSuffix = 'Thin'; }
    else if (roundedWeight <= 200) { styleName = 'Extra Light'; psSuffix = 'ExtraLight'; }
    else if (roundedWeight <= 300) { styleName = 'Light'; psSuffix = 'Light'; }
    else if (roundedWeight <= 400) { styleName = 'Regular'; psSuffix = 'Regular'; }
    else if (roundedWeight <= 500) { styleName = 'Medium'; psSuffix = 'Medium'; }
    else if (roundedWeight <= 600) { styleName = 'Semi Bold'; psSuffix = 'SemiBold'; }
    else if (roundedWeight <= 700) { styleName = 'Bold'; psSuffix = 'Bold'; }
    else if (roundedWeight <= 800) { styleName = 'Extra Bold'; psSuffix = 'ExtraBold'; }
    else { styleName = 'Black'; psSuffix = 'Black'; }

    if (isItalic) {
        styleName = styleName === 'Regular' ? 'Italic' : `${styleName} Italic`;
        psSuffix = psSuffix === 'Regular' ? 'Italic' : `${psSuffix}Italic`;
    }

    // Extract primary real font family from fallback list, skipping synthetic keywords
    let cleanFamily = 'Inter';
    if (family) {
        let famStr = String(family);
        if (famStr.includes('var(')) {
            famStr = famStr.replace(/var\([^)]+\)/g, '').trim();
        }

        const genericAndSystemFonts = new Set([
            'ui-monospace', 'ui-sans-serif', 'ui-serif', 'ui-rounded',
            '-apple-system', 'blinkmacsystemfont', 'system-ui',
            'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy'
        ]);

        const candidates = famStr.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
        let chosen = null;
        for (const c of candidates) {
            const lower = c.toLowerCase();
            if (!genericAndSystemFonts.has(lower)) {
                chosen = c;
                break;
            }
        }

        if (chosen) {
            cleanFamily = chosen;
        } else {
            const isMono = candidates.some(c => c.toLowerCase().includes('mono'));
            const isSerif = candidates.some(c => c.toLowerCase().includes('serif'));
            if (isMono) {
                cleanFamily = 'SF Mono';
            } else if (isSerif) {
                cleanFamily = 'Georgia';
            } else {
                cleanFamily = 'Inter';
            }
        }
    }

    const postscript = `${cleanFamily.replace(/[\s\-_]+/g, '')}-${psSuffix}`;

    return { styleName, postscript, cleanFamily, weightNum };
}

/**
 * Parses CSS line-height into Figma Number struct (using explicit PIXELS to ensure exact display in Figma)
 */
export function parseLineHeight(lhValue, fontSize = 16) {
    if (!lhValue || lhValue === 'normal' || lhValue === 'auto') {
        return { value: 100, units: 'PERCENT' };
    }

    const str = String(lhValue).trim();

    if (str.endsWith('px')) {
        const val = parseFloat(str) || fontSize * 1.2;
        return { value: Math.round(val * 10) / 10, units: 'PIXELS' };
    }
    if (str.endsWith('%')) {
        const pct = parseFloat(str) || 100;
        const px = (pct / 100) * fontSize;
        return { value: Math.round(px * 10) / 10, units: 'PIXELS' };
    }

    const num = parseFloat(str);
    if (!isNaN(num)) {
        if (num > 3) {
            return { value: Math.round(num * 10) / 10, units: 'PIXELS' };
        }
        const px = num * fontSize;
        return { value: Math.round(px * 10) / 10, units: 'PIXELS' };
    }

    return { value: 100, units: 'PERCENT' };
}

/**
 * Parses CSS letter-spacing into Figma struct and tracking value
 */
export function parseLetterSpacing(lsValue, fontSize = 16) {
    if (!lsValue || lsValue === 'normal' || lsValue === '0' || lsValue === '0px') {
        return {
            struct: { value: 0, units: 'PERCENT' },
            tracking: 0
        };
    }

    const str = String(lsValue).trim();

    if (str.endsWith('em')) {
        const emVal = parseFloat(str) || 0;
        return {
            struct: { value: emVal * 100, units: 'PERCENT' },
            tracking: emVal * 100
        };
    }

    if (str.endsWith('%')) {
        const pct = parseFloat(str) || 0;
        return {
            struct: { value: pct, units: 'PERCENT' },
            tracking: pct
        };
    }

    if (str.endsWith('px')) {
        const px = parseFloat(str) || 0;
        return {
            struct: { value: px, units: 'PIXELS' },
            tracking: fontSize > 0 ? (px / fontSize) * 100 : 0
        };
    }

    return {
        struct: { value: 0, units: 'PERCENT' },
        tracking: 0
    };
}

/**
 * Parses text-decoration
 */
export function parseTextDecoration(tdValue) {
    if (!tdValue) return 'NONE';
    const clean = tdValue.toLowerCase();
    if (clean.includes('underline')) return 'UNDERLINE';
    if (clean.includes('line-through')) return 'STRIKETHROUGH';
    return 'NONE';
}

/**
 * Parses text-transform
 */
export function parseTextTransform(ttValue) {
    if (!ttValue) return 'ORIGINAL';
    const clean = ttValue.toLowerCase();
    if (clean === 'uppercase') return 'UPPER';
    if (clean === 'lowercase') return 'LOWER';
    if (clean === 'capitalize') return 'TITLE';
    return 'ORIGINAL';
}

/**
 * Parses CSS text-align into valid Figma TextAlignHorizontal enum
 * @param {string} taValue
 * @returns {'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'}
 */
export function parseTextAlign(taValue) {
    if (!taValue) return 'LEFT';
    const clean = String(taValue).toLowerCase().trim();
    if (clean === 'center') return 'CENTER';
    if (clean === 'right' || clean === 'end') return 'RIGHT';
    if (clean === 'justify') return 'JUSTIFIED';
    return 'LEFT';
}

/**
 * Estimates text dimensions based on character content, font metrics, and container constraints
 */
export function estimateTextDimensions(text, fontSize = 16, explicitWidth = 0, isParagraph = false, family = 'Inter') {
    const metrics = getFontMetrics(family);
    const charWidth = fontSize * (metrics.avgCharWidthRatio || 0.53);
    const lineHeight = Math.round(fontSize * (metrics.defaultLineHeight || 1.35));
    const rawLines = String(text || '').split('\n');

    if (rawLines.length > 1) {
        let totalLines = 0;
        let maxLineWidth = 0;
        for (const line of rawLines) {
            const lineLen = line.length;
            const singleW = Math.ceil(lineLen * charWidth);
            if (singleW > maxLineWidth) maxLineWidth = singleW;
            if (isParagraph && explicitWidth > 100 && singleW > explicitWidth) {
                const charsPerLine = Math.max(1, Math.floor(explicitWidth / charWidth));
                totalLines += Math.max(1, Math.ceil(lineLen / charsPerLine));
            } else {
                totalLines += 1;
            }
        }
        return {
            width: explicitWidth > 0 ? explicitWidth : Math.max(10, maxLineWidth),
            height: totalLines * lineHeight,
            autoResize: explicitWidth > 0 ? 'HEIGHT' : 'WIDTH_AND_HEIGHT'
        };
    }

    const singleLineWidth = Math.ceil(text.length * charWidth);
    if (isParagraph && explicitWidth > 100 && singleLineWidth > explicitWidth) {
        const charsPerLine = Math.max(1, Math.floor(explicitWidth / charWidth));
        const linesCount = Math.max(1, Math.ceil(text.length / charsPerLine));
        return {
            width: explicitWidth,
            height: linesCount * lineHeight,
            autoResize: 'HEIGHT'
        };
    }

    return {
        width: explicitWidth > 0 ? explicitWidth : Math.max(10, singleLineWidth),
        height: lineHeight,
        autoResize: explicitWidth > 0 ? 'HEIGHT' : 'WIDTH_AND_HEIGHT'
    };
}
