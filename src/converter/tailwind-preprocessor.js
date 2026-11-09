// src/converter/tailwind-preprocessor.js
import { SPACING_SCALE, RADIUS_SCALE } from '../decompiler/tailwind/scale-snapper.js';
import { TAILWIND_COLORS } from '../decompiler/tailwind/color-matcher.js';

// Fast lookup maps for spacing and radius
const SPACING_MAP = new Map(SPACING_SCALE.map(s => [s.key, `${s.px}px`]));
const RADIUS_MAP = new Map(RADIUS_SCALE.map(r => [r.key, `${r.px}px`]));
RADIUS_MAP.set('DEFAULT', '4px');
RADIUS_MAP.set('', '4px');

// Tailwind max-width scale map (rem * 16px)
const TAILWIND_MAX_WIDTH_MAP = new Map([
    ['0', '0px'],
    ['none', 'none'],
    ['xs', '320px'],
    ['sm', '384px'],
    ['md', '448px'],
    ['lg', '512px'],
    ['xl', '576px'],
    ['2xl', '672px'],
    ['3xl', '768px'],
    ['4xl', '896px'],
    ['5xl', '1024px'],
    ['6xl', '1152px'],
    ['7xl', '1280px'],
    ['full', '100%'],
    ['min', 'min-content'],
    ['max', 'max-content'],
    ['fit', 'fit-content'],
    ['prose', '65ch'],
    ['screen-sm', '640px'],
    ['screen-md', '768px'],
    ['screen-lg', '1024px'],
    ['screen-xl', '1280px'],
    ['screen-2xl', '1536px'],
]);

// Color lookup map (e.g. 'blue-500' -> '#3b82f6')
const COLOR_HEX_MAP = new Map();
COLOR_HEX_MAP.set('white', '#ffffff');
COLOR_HEX_MAP.set('black', '#000000');
COLOR_HEX_MAP.set('transparent', 'transparent');

for (const [family, shades] of Object.entries(TAILWIND_COLORS)) {
    for (const [shade, hex] of Object.entries(shades)) {
        COLOR_HEX_MAP.set(`${family}-${shade}`, hex);
    }
}

/**
 * Resolves a Tailwind spacing key to a CSS pixel string
 * @param {string} key e.g. '4', '6', 'px', '[17px]'
 * @returns {string|null}
 */
export function resolveTailwindSpacing(key) {
    if (!key) return null;
    if (key.startsWith('[') && key.endsWith(']')) {
        return key.slice(1, -1);
    }
    return SPACING_MAP.get(key) || null;
}

/**
 * Resolves a Tailwind color key to a CSS hex/rgba string
 * @param {string} colorKey e.g. 'blue-600', 'slate-900/50', '[#123456]'
 * @returns {string|null}
 */
export function resolveTailwindColor(colorKey) {
    if (!colorKey) return null;

    // Handle arbitrary [hex]
    if (colorKey.startsWith('[') && colorKey.endsWith(']')) {
        return colorKey.slice(1, -1);
    }

    // Handle opacity slash syntax: blue-500/50
    const [baseName, alphaPart] = colorKey.split('/');
    let hex = null;

    if (baseName.startsWith('[') && baseName.endsWith(']')) {
        hex = baseName.slice(1, -1);
    } else {
        hex = COLOR_HEX_MAP.get(baseName);
    }

    if (!hex) return null;
    if (!alphaPart) return hex;

    // Convert hex + alpha to rgba
    const alphaNum = parseFloat(alphaPart.startsWith('[') ? alphaPart.slice(1, -1) : alphaPart) / (alphaPart.includes('.') ? 1 : 100);
    const cleanHex = hex.replace(/^#/, '');
    if (cleanHex.length === 6) {
        const r = parseInt(cleanHex.slice(0, 2), 16);
        const g = parseInt(cleanHex.slice(2, 4), 16);
        const b = parseInt(cleanHex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${Math.round(alphaNum * 100) / 100})`;
    }

    return hex;
}

/**
 * Translates a single Tailwind class token into CSS declaration string
 * @param {string} cls e.g. 'flex', 'gap-4', 'bg-blue-600', 'rounded-xl'
 * @returns {string|null} e.g. 'display: flex;'
 */
export function translateClassToCss(cls) {
    if (!cls || typeof cls !== 'string') return null;

    // 1. Display
    if (cls === 'flex') return 'display: flex;';
    if (cls === 'inline-flex') return 'display: inline-flex;';
    if (cls === 'grid') return 'display: grid;';
    if (cls === 'inline-grid') return 'display: inline-grid;';
    if (cls === 'block') return 'display: block;';
    if (cls === 'inline-block') return 'display: inline-block;';
    if (cls === 'hidden') return 'display: none;';

    // 2. Flex Direction & Wrap
    if (cls === 'flex-row') return 'flex-direction: row;';
    if (cls === 'flex-col') return 'flex-direction: column;';
    if (cls === 'flex-wrap') return 'flex-wrap: wrap;';
    if (cls === 'flex-nowrap') return 'flex-wrap: nowrap;';

    // 3. Justify & Align
    if (cls === 'justify-start') return 'justify-content: flex-start;';
    if (cls === 'justify-center') return 'justify-content: center;';
    if (cls === 'justify-end') return 'justify-content: flex-end;';
    if (cls === 'justify-between') return 'justify-content: space-between;';
    if (cls === 'justify-around') return 'justify-content: space-around;';
    if (cls === 'justify-evenly') return 'justify-content: space-evenly;';

    if (cls === 'items-start') return 'align-items: flex-start;';
    if (cls === 'items-center') return 'align-items: center;';
    if (cls === 'items-end') return 'align-items: flex-end;';
    if (cls === 'items-baseline') return 'align-items: baseline;';
    if (cls === 'items-stretch') return 'align-items: stretch;';

    if (cls === 'self-stretch') return 'align-self: stretch;';
    if (cls === 'self-center') return 'align-self: center;';
    if (cls === 'self-start') return 'align-self: flex-start;';
    if (cls === 'self-end') return 'align-self: flex-end;';

    if (cls === 'flex-1') return 'flex: 1 1 0%;';
    if (cls === 'shrink-0') return 'flex-shrink: 0;';
    if (cls === 'grow') return 'flex-grow: 1;';

    // 4. Grid columns
    const gridColsMatch = cls.match(/^grid-cols-(\d+)$/);
    if (gridColsMatch) return `grid-template-columns: repeat(${gridColsMatch[1]}, 1fr);`;

    // 5. Gap
    if (cls.startsWith('gap-x-')) {
        const val = resolveTailwindSpacing(cls.slice(6));
        if (val) return `column-gap: ${val};`;
    } else if (cls.startsWith('gap-y-')) {
        const val = resolveTailwindSpacing(cls.slice(6));
        if (val) return `row-gap: ${val};`;
    } else if (cls.startsWith('gap-')) {
        const val = resolveTailwindSpacing(cls.slice(4));
        if (val) return `gap: ${val}; row-gap: ${val}; column-gap: ${val};`;
    }

    // 6. Padding
    if (cls.startsWith('px-')) {
        const val = resolveTailwindSpacing(cls.slice(3));
        if (val) return `padding-left: ${val}; padding-right: ${val};`;
    } else if (cls.startsWith('py-')) {
        const val = resolveTailwindSpacing(cls.slice(3));
        if (val) return `padding-top: ${val}; padding-bottom: ${val};`;
    } else if (cls.startsWith('pt-')) {
        const val = resolveTailwindSpacing(cls.slice(3));
        if (val) return `padding-top: ${val};`;
    } else if (cls.startsWith('pr-')) {
        const val = resolveTailwindSpacing(cls.slice(3));
        if (val) return `padding-right: ${val};`;
    } else if (cls.startsWith('pb-')) {
        const val = resolveTailwindSpacing(cls.slice(3));
        if (val) return `padding-bottom: ${val};`;
    } else if (cls.startsWith('pl-')) {
        const val = resolveTailwindSpacing(cls.slice(3));
        if (val) return `padding-left: ${val};`;
    } else if (cls.startsWith('p-')) {
        const val = resolveTailwindSpacing(cls.slice(2));
        if (val) return `padding: ${val}; padding-top: ${val}; padding-right: ${val}; padding-bottom: ${val}; padding-left: ${val};`;
    }

    // 7. Margin
    if (cls === 'm-auto') return 'margin: auto;';
    if (cls === 'mx-auto') return 'margin-left: auto; margin-right: auto;';
    if (cls.startsWith('mx-')) {
        const val = resolveTailwindSpacing(cls.slice(3));
        if (val) return `margin-left: ${val}; margin-right: ${val};`;
    } else if (cls.startsWith('my-')) {
        const val = resolveTailwindSpacing(cls.slice(3));
        if (val) return `margin-top: ${val}; margin-bottom: ${val};`;
    } else if (cls.startsWith('mt-')) {
        const val = resolveTailwindSpacing(cls.slice(3));
        if (val) return `margin-top: ${val};`;
    } else if (cls.startsWith('mr-')) {
        const val = resolveTailwindSpacing(cls.slice(3));
        if (val) return `margin-right: ${val};`;
    } else if (cls.startsWith('mb-')) {
        const val = resolveTailwindSpacing(cls.slice(3));
        if (val) return `margin-bottom: ${val};`;
    } else if (cls.startsWith('ml-')) {
        const val = resolveTailwindSpacing(cls.slice(3));
        if (val) return `margin-left: ${val};`;
    } else if (cls.startsWith('m-')) {
        const val = resolveTailwindSpacing(cls.slice(2));
        if (val) return `margin: ${val};`;
    }

    // 8. Sizing
    if (cls === 'w-full') return 'width: 100%;';
    if (cls === 'h-full') return 'height: 100%;';
    if (cls === 'w-screen') return 'width: 100vw;';
    if (cls === 'h-screen') return 'height: 100vh;';
    if (cls === 'w-fit') return 'width: fit-content;';
    if (cls === 'h-fit') return 'height: fit-content;';
    if (cls.startsWith('w-')) {
        const val = resolveTailwindSpacing(cls.slice(2));
        if (val) return `width: ${val};`;
    }
    if (cls.startsWith('h-')) {
        const val = resolveTailwindSpacing(cls.slice(2));
        if (val) return `height: ${val};`;
    }
    if (cls === 'min-w-0') return 'min-width: 0px;';
    if (cls === 'min-w-full') return 'min-width: 100%;';
    if (cls === 'min-w-min') return 'min-width: min-content;';
    if (cls === 'min-w-max') return 'min-width: max-content;';
    if (cls === 'min-w-fit') return 'min-width: fit-content;';
    if (cls.startsWith('min-w-')) {
        const val = resolveTailwindSpacing(cls.slice(6));
        if (val) return `min-width: ${val};`;
    }
    if (cls.startsWith('max-w-')) {
        const sub = cls.slice(6);
        const mapVal = TAILWIND_MAX_WIDTH_MAP.get(sub);
        if (mapVal) return `max-width: ${mapVal};`;
        const val = resolveTailwindSpacing(sub);
        if (val) return `max-width: ${val};`;
    }
    if (cls === 'min-h-0') return 'min-height: 0px;';
    if (cls === 'min-h-full') return 'min-height: 100%;';
    if (cls === 'min-h-screen') return 'min-height: 100vh;';
    if (cls === 'min-h-min') return 'min-height: min-content;';
    if (cls === 'min-h-max') return 'min-height: max-content;';
    if (cls === 'min-h-fit') return 'min-height: fit-content;';
    if (cls.startsWith('min-h-')) {
        const val = resolveTailwindSpacing(cls.slice(6));
        if (val) return `min-height: ${val};`;
    }
    if (cls === 'max-h-full') return 'max-height: 100%;';
    if (cls === 'max-h-screen') return 'max-height: 100vh;';
    if (cls === 'max-h-min') return 'max-height: min-content;';
    if (cls === 'max-h-max') return 'max-height: max-content;';
    if (cls === 'max-h-fit') return 'max-height: fit-content;';
    if (cls.startsWith('max-h-')) {
        const val = resolveTailwindSpacing(cls.slice(6));
        if (val) return `max-height: ${val};`;
    }

    // 9. Positioning
    if (['relative', 'absolute', 'fixed', 'sticky'].includes(cls)) {
        return `position: ${cls};`;
    }
    if (cls.startsWith('top-')) {
        const val = resolveTailwindSpacing(cls.slice(4));
        if (val) return `top: ${val};`;
    }
    if (cls.startsWith('right-')) {
        const val = resolveTailwindSpacing(cls.slice(6));
        if (val) return `right: ${val};`;
    }
    if (cls.startsWith('bottom-')) {
        const val = resolveTailwindSpacing(cls.slice(7));
        if (val) return `bottom: ${val};`;
    }
    if (cls.startsWith('left-')) {
        const val = resolveTailwindSpacing(cls.slice(5));
        if (val) return `left: ${val};`;
    }
    if (cls.startsWith('z-')) {
        return `z-index: ${cls.slice(2)};`;
    }

    // 10. Background Color
    if (cls.startsWith('bg-')) {
        const color = resolveTailwindColor(cls.slice(3));
        if (color) return `background-color: ${color};`;
    }

    // 11. Text Color
    if (cls.startsWith('text-')) {
        const color = resolveTailwindColor(cls.slice(5));
        if (color) return `color: ${color};`;
    }

    // 12. Border & Radius
    if (cls === 'rounded') return 'border-radius: 4px;';
    if (cls.startsWith('rounded-')) {
        const rKey = cls.slice(8);
        if (rKey === 'full') return 'border-radius: 9999px;';
        if (rKey.startsWith('[') && rKey.endsWith(']')) {
            return `border-radius: ${rKey.slice(1, -1)};`;
        }
        const rVal = RADIUS_MAP.get(rKey);
        if (rVal) return `border-radius: ${rVal};`;
    }

    if (cls === 'border') return 'border-width: 1px; border-style: solid;';
    if (cls === 'border-t') return 'border-top-width: 1px; border-top-style: solid;';
    if (cls === 'border-b') return 'border-bottom-width: 1px; border-bottom-style: solid;';
    if (cls === 'border-l') return 'border-left-width: 1px; border-left-style: solid;';
    if (cls === 'border-r') return 'border-right-width: 1px; border-right-style: solid;';
    if (cls === 'border-x') return 'border-left-width: 1px; border-right-width: 1px; border-left-style: solid; border-right-style: solid;';
    if (cls === 'border-y') return 'border-top-width: 1px; border-bottom-width: 1px; border-top-style: solid; border-bottom-style: solid;';

    const dirBorderMatch = cls.match(/^border-([tblrxy])-(\d+)$/);
    if (dirBorderMatch) {
        const [, dir, w] = dirBorderMatch;
        const widthPx = `${w}px`;
        if (dir === 't') return `border-top-width: ${widthPx}; border-top-style: solid;`;
        if (dir === 'b') return `border-bottom-width: ${widthPx}; border-bottom-style: solid;`;
        if (dir === 'l') return `border-left-width: ${widthPx}; border-left-style: solid;`;
        if (dir === 'r') return `border-right-width: ${widthPx}; border-right-style: solid;`;
        if (dir === 'x') return `border-left-width: ${widthPx}; border-right-width: ${widthPx}; border-left-style: solid; border-right-style: solid;`;
        if (dir === 'y') return `border-top-width: ${widthPx}; border-bottom-width: ${widthPx}; border-top-style: solid; border-bottom-style: solid;`;
    }

    if (cls.startsWith('border-')) {
        const sub = cls.slice(7);
        if (/^\d+$/.test(sub)) {
            return `border-width: ${sub}px; border-style: solid;`;
        }
        if (sub === 'solid') return 'border-style: solid;';
        if (sub === 'dashed') return 'border-style: dashed;';
        if (sub === 'dotted') return 'border-style: dotted;';
        if (sub === 'double') return 'border-style: double;';
        if (sub === 'none') return 'border-style: none; border-width: 0px;';
        const color = resolveTailwindColor(sub);
        if (color) return `border-color: ${color};`;
    }

    // 13. Typography
    const fontSizeMap = {
        'text-xs': '12px', 'text-sm': '14px', 'text-base': '16px', 'text-lg': '18px',
        'text-xl': '20px', 'text-2xl': '24px', 'text-3xl': '30px', 'text-4xl': '36px',
        'text-5xl': '48px', 'text-6xl': '60px'
    };
    if (fontSizeMap[cls]) return `font-size: ${fontSizeMap[cls]};`;

    const fontWeightMap = {
        'font-thin': '100', 'font-extralight': '200', 'font-light': '300', 'font-normal': '400',
        'font-medium': '500', 'font-semibold': '600', 'font-bold': '700', 'font-extrabold': '800', 'font-black': '900'
    };
    if (fontWeightMap[cls]) return `font-weight: ${fontWeightMap[cls]};`;

    if (cls === 'text-center') return 'text-align: center;';
    if (cls === 'text-left') return 'text-align: left;';
    if (cls === 'text-right') return 'text-align: right;';
    if (cls === 'uppercase') return 'text-transform: uppercase;';
    if (cls === 'lowercase') return 'text-transform: lowercase;';
    if (cls === 'capitalize') return 'text-transform: capitalize;';
    if (cls === 'underline') return 'text-decoration: underline;';
    if (cls === 'line-through') return 'text-decoration: line-through;';

    // 14. Box Shadow
    const shadowMap = {
        'shadow-sm': 'box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);',
        'shadow': 'box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);',
        'shadow-md': 'box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);',
        'shadow-lg': 'box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);',
        'shadow-xl': 'box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);',
        'shadow-2xl': 'box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);',
        'shadow-inner': 'box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);'
    };
    if (shadowMap[cls]) return shadowMap[cls];

    // 15. Opacity
    if (cls.startsWith('opacity-')) {
        const op = parseInt(cls.slice(8), 10);
        if (!isNaN(op)) return `opacity: ${op / 100};`;
    }

    return null;
}

/**
 * Ingests and compiles all Tailwind classes found in a JSDOM document,
 * injecting a computed <style> tag into <head> so JSDOM evaluates all styles accurately.
 * Respects existing document styles so user-defined classes are never overridden.
 * @param {Document} doc JSDOM Document
 * @returns {number} Count of compiled rules
 */
export function injectTailwindStylesToDom(doc) {
    if (!doc || !doc.querySelectorAll) return 0;

    // Collect all class names already explicitly declared in existing <style> tags
    const existingDeclaredClasses = new Set();
    for (const styleEl of doc.querySelectorAll('style')) {
        if (styleEl.id === '__figmatik_tailwind_computed__') continue;
        const text = styleEl.textContent || '';
        const matches = text.match(/\.([a-zA-Z0-9_-]+)/g);
        if (matches) {
            for (const m of matches) {
                existingDeclaredClasses.add(m.slice(1));
            }
        }
    }

    const elementsWithClass = doc.querySelectorAll('[class]');
    const uniqueClasses = new Set();

    for (const el of elementsWithClass) {
        const classAttr = el.getAttribute('class') || '';
        const tokens = classAttr.trim().split(/\s+/);
        for (const token of tokens) {
            // Only process class if not already explicitly styled in document
            if (token && !existingDeclaredClasses.has(token)) {
                uniqueClasses.add(token);
            }
        }
    }

    if (uniqueClasses.size === 0) return 0;

    const PSEUDO_PREFIXES = new Set([
        'hover', 'active', 'focus', 'focus-visible', 'focus-within',
        'disabled', 'visited', 'checked', 'group-hover', 'peer-hover', 'peer-checked'
    ]);

    const cssRules = [];
    for (const cls of uniqueClasses) {
        // Handle prefixes (e.g. "hover:bg-blue-500", "md:flex")
        const colonIdx = cls.indexOf(':');
        let prefix = null;
        let effectiveCls = cls;
        if (colonIdx !== -1) {
            prefix = cls.slice(0, colonIdx);
            effectiveCls = cls.slice(colonIdx + 1);
        }

        const cssDecl = translateClassToCss(effectiveCls);
        if (cssDecl) {
            // Escape special characters in CSS selector (e.g. colons, slashes, brackets)
            const escapedSelector = cls.replace(/([/:.[\]])/g, '\\$1');
            if (prefix && PSEUDO_PREFIXES.has(prefix)) {
                // Emit with pseudo-class so static evaluation in JSDOM retains base styling
                cssRules.push(`.${escapedSelector}:${prefix} { ${cssDecl} }`);
            } else {
                cssRules.push(`.${escapedSelector} { ${cssDecl} }`);
            }
        }
    }

    if (cssRules.length === 0) return 0;

    const head = doc.head || doc.querySelector('head') || doc.body;
    if (head) {
        const styleEl = doc.createElement('style');
        styleEl.setAttribute('id', '__figmatik_tailwind_computed__');
        styleEl.textContent = cssRules.join('\n');
        // Prepend before user stylesheets so user styles maintain priority
        if (head.firstChild) {
            head.insertBefore(styleEl, head.firstChild);
        } else {
            head.appendChild(styleEl);
        }
    }

    return cssRules.length;
}
