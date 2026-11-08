// src/decompiler/css/typography-formatter.js

/**
 * Parses font style and weight names to numeric font-weight and italic style
 * @param {string} fontStyleName E.g. "Bold", "Semi Bold Italic", "Medium", "Light"
 * @returns {{ fontWeight: number, fontStyle: string }}
 */
export function parseFontWeightAndStyle(fontStyleName) {
    if (!fontStyleName) return { fontWeight: 400, fontStyle: 'normal' };
    const lower = String(fontStyleName).toLowerCase();

    let weight = 400;
    if (lower.includes('thin') || lower.includes('hairline')) weight = 100;
    else if (lower.includes('extra light') || lower.includes('ultra light')) weight = 200;
    else if (lower.includes('light')) weight = 300;
    else if (lower.includes('medium')) weight = 500;
    else if (lower.includes('semi bold') || lower.includes('semibold') || lower.includes('demi bold')) weight = 600;
    else if (lower.includes('extra bold') || lower.includes('ultrabold') || lower.includes('heavy')) weight = 800;
    else if (lower.includes('bold')) weight = 700;
    else if (lower.includes('black')) weight = 900;

    const isItalic = lower.includes('italic') || lower.includes('oblique');

    return {
        fontWeight: weight,
        fontStyle: isItalic ? 'italic' : 'normal'
    };
}
