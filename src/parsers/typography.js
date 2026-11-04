// src/parsers/typography.js

/**
 * Parses font weight, style and family into Figma font representation
 */
function parseFontStyle(weightStr, styleStr, family = 'Inter') {
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
function parseLineHeight(lhValue, fontSize = 16) {
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
function parseLetterSpacing(lsValue, fontSize = 16) {
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
function parseTextDecoration(tdValue) {
    if (!tdValue) return 'NONE';
    const clean = tdValue.toLowerCase();
    if (clean.includes('underline')) return 'UNDERLINE';
    if (clean.includes('line-through')) return 'STRIKETHROUGH';
    return 'NONE';
}

/**
 * Parses text-transform
 */
function parseTextTransform(ttValue) {
    if (!ttValue) return 'ORIGINAL';
    const clean = ttValue.toLowerCase();
    if (clean === 'uppercase') return 'UPPER';
    if (clean === 'lowercase') return 'LOWER';
    if (clean === 'capitalize') return 'TITLE';
    return 'ORIGINAL';
}

/**
 * Estimates text dimensions based on character content and container constraints
 */
function estimateTextDimensions(text, fontSize = 16, explicitWidth = 0, isParagraph = false) {
    const charWidth = fontSize * 0.58;
    const lineHeight = Math.round(fontSize * 1.35);
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

    if (isParagraph && explicitWidth > 100) {
        const charsPerLine = Math.max(1, Math.floor(explicitWidth / charWidth));
        const linesCount = Math.max(1, Math.ceil(text.length / charsPerLine));
        return {
            width: explicitWidth,
            height: linesCount * lineHeight,
            autoResize: 'HEIGHT'
        };
    }

    const singleLineWidth = Math.ceil(text.length * charWidth);
    return {
        width: explicitWidth > 0 ? explicitWidth : Math.max(10, singleLineWidth),
        height: lineHeight,
        autoResize: explicitWidth > 0 ? 'HEIGHT' : 'WIDTH_AND_HEIGHT'
    };
}

module.exports = {
    parseFontStyle,
    parseLineHeight,
    parseLetterSpacing,
    parseTextDecoration,
    parseTextTransform,
    estimateTextDimensions
};
