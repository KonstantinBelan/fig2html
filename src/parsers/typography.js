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

    let styleName = 'Regular';
    let psSuffix = 'Regular';

    if (weightNum <= 100) { styleName = 'Thin'; psSuffix = 'Thin'; }
    else if (weightNum <= 200) { styleName = 'Extra Light'; psSuffix = 'ExtraLight'; }
    else if (weightNum <= 300) { styleName = 'Light'; psSuffix = 'Light'; }
    else if (weightNum <= 400) { styleName = 'Regular'; psSuffix = 'Regular'; }
    else if (weightNum <= 500) { styleName = 'Medium'; psSuffix = 'Medium'; }
    else if (weightNum <= 600) { styleName = 'Semi Bold'; psSuffix = 'SemiBold'; }
    else if (weightNum <= 700) { styleName = 'Bold'; psSuffix = 'Bold'; }
    else if (weightNum <= 800) { styleName = 'Extra Bold'; psSuffix = 'ExtraBold'; }
    else { styleName = 'Black'; psSuffix = 'Black'; }

    if (isItalic) {
        styleName = styleName === 'Regular' ? 'Italic' : `${styleName} Italic`;
        psSuffix = psSuffix === 'Regular' ? 'Italic' : `${psSuffix}Italic`;
    }

    // Extract primary family from fallback list: "Inter, -apple-system, sans-serif" -> "Inter"
    let cleanFamily = 'Inter';
    if (family) {
        const first = family.split(',')[0].trim().replace(/['"]/g, '');
        if (first && first.toLowerCase() !== 'sans-serif' && first.toLowerCase() !== 'serif' && first.toLowerCase() !== 'monospace') {
            cleanFamily = first;
        } else if (first.toLowerCase() === 'monospace') {
            cleanFamily = 'Courier New';
        } else if (first.toLowerCase() === 'serif') {
            cleanFamily = 'Georgia';
        }
    }

    const postscript = `${cleanFamily.replace(/[\s\-_]+/g, '')}-${psSuffix}`;

    return { styleName, postscript, cleanFamily, weightNum };
}

/**
 * Parses CSS line-height into Figma Number struct
 */
function parseLineHeight(lhValue, fontSize = 16) {
    if (!lhValue || lhValue === 'normal' || lhValue === 'auto') {
        return { value: 100, units: 'PERCENT' };
    }

    const str = String(lhValue).trim();

    if (str.endsWith('px')) {
        return { value: parseFloat(str) || fontSize * 1.2, units: 'PIXELS' };
    }
    if (str.endsWith('%')) {
        return { value: parseFloat(str) || 100, units: 'PERCENT' };
    }

    const num = parseFloat(str);
    if (!isNaN(num)) {
        if (num > 3) {
            return { value: num, units: 'PIXELS' };
        }
        return { value: Math.round(num * 100), units: 'PERCENT' };
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
