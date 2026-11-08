// src/converter/rich-text.js
const { parseColor } = require('../parsers/color');
const { parseFontStyle, parseTextDecoration } = require('../parsers/typography');

/**
 * Checks if an element is a pure inline text container with mixed inline child nodes
 */
function isRichTextContainer(element) {
    if (!element || !element.children || element.children.length === 0) return false;
    const text = element.textContent.trim();
    if (!text) return false;

    const inlineTags = ['b', 'strong', 'i', 'em', 'u', 's', 'del', 'span', 'a', 'small', 'mark', 'code', 'br', 'sub', 'sup'];
    for (const child of element.children) {
        const tag = child.tagName.toLowerCase();
        if (!inlineTags.includes(tag)) {
            return false;
        }
        if (child.children.length > 0) {
            for (const grandChild of child.children) {
                if (!inlineTags.includes(grandChild.tagName.toLowerCase())) {
                    return false;
                }
            }
        }
        // Exclude shape elements (e.g. class="dot", class="avatar", or empty span shapes)
        if (child.classList && (
            child.classList.contains('dot') ||
            child.classList.contains('avatar') ||
            child.classList.contains('swatch-color') ||
            child.classList.contains('color-swatch') ||
            child.classList.contains('icon')
        )) {
            return false;
        }
        if (tag === 'span' && child.textContent.trim().length === 0) {
            return false;
        }
    }
    return true;
}

/**
 * Extracts rich text with character-level style overrides
 */
function extractRichText(element, win, defaultStyles, resolveVar = null, varMap = null, colorToVarMap = null, createColorVar = null) {
    let fullText = '';
    const charStyles = [];
    const styleOverrideTable = [];
    const styleMap = new Map();
    let nextStyleId = 1;

    function colorToHexKey(col) {
        if (!col || typeof col.r !== 'number') return '';
        const r = Math.round(col.r * 255).toString(16).padStart(2, '0');
        const g = Math.round(col.g * 255).toString(16).padStart(2, '0');
        const b = Math.round(col.b * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`.toLowerCase();
    }

    function traverse(node, currentStyle) {
        if (node.nodeType === 3) { // TEXT_NODE
            let text = node.textContent.replace(/[\r\n\t]+/g, ' ').replace(/ +/g, ' ');
            if (fullText.length === 0 || fullText.endsWith('\n')) {
                text = text.replace(/^ +/, '');
            }
            if (!text) return;
            for (let i = 0; i < text.length; i++) {
                fullText += text[i];
                charStyles.push(currentStyle.styleId || 0);
            }
        } else if (node.nodeType === 1) { // ELEMENT_NODE
            const tag = node.tagName.toLowerCase();
            if (tag === 'br') {
                while (fullText.endsWith(' ') || fullText.endsWith('\t')) {
                    fullText = fullText.slice(0, -1);
                    charStyles.pop();
                }
                fullText += '\n';
                charStyles.push(currentStyle.styleId || 0);
                return;
            }

            const computed = win.getComputedStyle(node);
            const inline = node.style;
            const getProp = (p, c) => {
                const raw = inline[c] || inline.getPropertyValue(p) || computed[c] || computed.getPropertyValue(p);
                return resolveVar ? resolveVar(raw, node) : raw;
            };

            const colorParsed = parseColor(getProp('color', 'color'), defaultStyles.color);
            const fontWeight = getProp('font-weight', 'fontWeight') || defaultStyles.fontWeight;
            const fontStyle = getProp('font-style', 'fontStyle') || defaultStyles.fontStyle;
            const fontSize = parseFloat(getProp('font-size', 'fontSize')) || defaultStyles.fontSize;
            const textDec = parseTextDecoration(getProp('text-decoration', 'textDecoration'));

            const { styleName, postscript, cleanFamily } = parseFontStyle(
                fontWeight,
                fontStyle,
                getProp('font-family', 'fontFamily') || defaultStyles.fontFamily
            );

            // Check if different from root text style
            const isDifferent =
                (colorParsed && (colorParsed.r !== defaultStyles.color.r || colorParsed.g !== defaultStyles.color.g || colorParsed.b !== defaultStyles.color.b)) ||
                fontWeight !== defaultStyles.fontWeight ||
                fontStyle !== defaultStyles.fontStyle ||
                fontSize !== defaultStyles.fontSize ||
                textDec !== 'NONE';

            let styleId = 0;
            if (isDifferent) {
                const key = `${cleanFamily}_${styleName}_${fontSize}_${JSON.stringify(colorParsed)}_${textDec}`;
                if (styleMap.has(key)) {
                    styleId = styleMap.get(key);
                } else {
                    styleId = nextStyleId++;
                    styleMap.set(key, styleId);

                    const override = {
                        styleID: styleId,
                        fontSize: fontSize,
                        fontName: { family: cleanFamily, style: styleName, postscript: postscript },
                        textDecoration: textDec
                    };
                    if (colorParsed) {
                        const richColorRaw = inline.color || inline.getPropertyValue('color') || computed.color || computed.getPropertyValue('color');
                        const richVarName = richColorRaw ? (richColorRaw.match(/var\(\s*(--[a-zA-Z0-9-_]+)/) || [])[1] : null;
                        const richVar = (richVarName && varMap && varMap.get(richVarName)) ||
                            (colorParsed.a === 1 && colorToVarMap ? colorToVarMap.get(colorToHexKey(colorParsed)) : null);
                        const richPaint = {
                            type: 'SOLID',
                            color: colorParsed,
                            opacity: colorParsed.a,
                            visible: true,
                            blendMode: 'NORMAL'
                        };
                        if (createColorVar && richVar) {
                            const cVar = createColorVar(richVar);
                            if (cVar) richPaint.colorVar = cVar;
                        }
                        override.fillPaints = [richPaint];
                    }
                    styleOverrideTable.push(override);
                }
            }

            for (const child of node.childNodes) {
                traverse(child, { ...currentStyle, styleId });
            }
        }
    }

    for (const child of element.childNodes) {
        traverse(child, { styleId: 0 });
    }

    while (fullText.endsWith(' ') || fullText.endsWith('\t')) {
        fullText = fullText.slice(0, -1);
        charStyles.pop();
    }

    return {
        characters: fullText,
        characterStyleIDs: charStyles,
        styleOverrideTable: styleOverrideTable
    };
}

module.exports = {
    isRichTextContainer,
    extractRichText
};
