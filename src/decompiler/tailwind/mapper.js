// src/decompiler/tailwind/mapper.js
import { snapSpacing, snapRadius, snapBorderWidth } from './scale-snapper.js';
import { matchColor, parseColor } from './color-matcher.js';
import { parsePxValue } from '../responsive-css.js';

/**
 * Standard font size scale mapping (px -> tailwind name)
 */
export const FONT_SIZE_SCALE = [
    { key: 'xs', px: 12 },
    { key: 'sm', px: 14 },
    { key: 'base', px: 16 },
    { key: 'lg', px: 18 },
    { key: 'xl', px: 20 },
    { key: '2xl', px: 24 },
    { key: '3xl', px: 30 },
    { key: '4xl', px: 36 },
    { key: '5xl', px: 48 },
    { key: '6xl', px: 60 },
    { key: '7xl', px: 72 },
    { key: '8xl', px: 96 },
    { key: '9xl', px: 128 }
];

/**
 * Standard font weight mapping
 */
export const FONT_WEIGHT_MAP = {
    100: 'font-thin',
    200: 'font-extralight',
    300: 'font-light',
    400: 'font-normal',
    500: 'font-medium',
    600: 'font-semibold',
    700: 'font-bold',
    800: 'font-extrabold',
    900: 'font-black'
};

/**
 * Standard letter spacing scale
 */
export const TRACKING_SCALE = [
    { key: 'tighter', em: -0.05 },
    { key: 'tight', em: -0.025 },
    { key: 'normal', em: 0 },
    { key: 'wide', em: 0.025 },
    { key: 'wider', em: 0.05 },
    { key: 'widest', em: 0.1 }
];

/**
 * Standard line height scale
 */
export const LEADING_SCALE = [
    { key: 'none', val: 1 },
    { key: 'tight', val: 1.25 },
    { key: 'snug', val: 1.375 },
    { key: 'normal', val: 1.5 },
    { key: 'relaxed', val: 1.625 },
    { key: 'loose', val: 2 }
];

/**
 * Maps a single font size to Tailwind class
 */
export function mapFontSize(pxVal, options = {}) {
    const tolerance = options.tolerance !== undefined ? options.tolerance : 1;
    let closest = null;
    let minDiff = Infinity;

    for (const item of FONT_SIZE_SCALE) {
        const diff = Math.abs(item.px - pxVal);
        if (diff < minDiff) {
            minDiff = diff;
            closest = item;
        }
    }

    if (closest && minDiff <= tolerance) {
        return `text-${closest.key}`;
    }

    return `text-[${Math.round(pxVal * 10) / 10}px]`;
}

/**
 * Maps letter spacing to Tailwind class
 */
export function mapLetterSpacing(valStr) {
    if (!valStr) return null;
    let em = 0;
    if (valStr.endsWith('em')) {
        em = parseFloat(valStr);
    } else if (valStr.endsWith('px')) {
        em = parseFloat(valStr) / 16;
    } else {
        em = parseFloat(valStr);
    }
    if (isNaN(em)) return null;

    let closest = null;
    let minDiff = Infinity;
    for (const item of TRACKING_SCALE) {
        const diff = Math.abs(item.em - em);
        if (diff < minDiff) {
            minDiff = diff;
            closest = item;
        }
    }

    if (closest && minDiff <= 0.01) {
        return closest.key === 'normal' ? 'tracking-normal' : `tracking-${closest.key}`;
    }

    return `tracking-[${Math.round(em * 1000) / 1000}em]`;
}

/**
 * Maps line height to Tailwind class
 */
export function mapLineHeight(valStr, fontSizePx = 16) {
    if (!valStr || valStr === 'normal') return 'leading-normal';
    let ratio = 1.5;
    if (valStr.endsWith('px')) {
        const px = parseFloat(valStr);
        ratio = fontSizePx > 0 ? px / fontSizePx : 1.5;
    } else if (valStr.endsWith('rem')) {
        const px = parseFloat(valStr) * 16;
        ratio = fontSizePx > 0 ? px / fontSizePx : 1.5;
    } else {
        ratio = parseFloat(valStr);
    }
    if (isNaN(ratio)) return null;

    let closest = null;
    let minDiff = Infinity;
    for (const item of LEADING_SCALE) {
        const diff = Math.abs(item.val - ratio);
        if (diff < minDiff) {
            minDiff = diff;
            closest = item;
        }
    }

    if (closest && minDiff <= 0.08) {
        return `leading-${closest.key}`;
    }

    return `leading-[${Math.round(ratio * 100) / 100}]`;
}

/**
 * Maps standard box-shadow CSS strings to Tailwind shadow utilities
 */
export function mapBoxShadow(shadowStr) {
    if (!shadowStr || shadowStr === 'none') return 'shadow-none';

    const clean = shadowStr.trim();
    if (clean.includes('inset')) return 'shadow-inner';

    // Standard tailwind shadow matchers based on blur radius
    // Match: <x> <y> <blur> where x and y can be 0 or Npx
    const shadowParts = clean.match(/(?:-?\d+(?:\.\d+)?(?:px)?\s+)(?:-?\d+(?:\.\d+)?(?:px)?\s+)(-?\d+(?:\.\d+)?)(?:px)?/);
    if (shadowParts) {
        const blur = Math.round(parseFloat(shadowParts[1]));
        if (blur <= 2) return 'shadow-sm';
        if (blur <= 4) return 'shadow';
        if (blur <= 7) return 'shadow-md';
        if (blur <= 16) return 'shadow-lg';
        if (blur <= 26) return 'shadow-xl';
        if (blur >= 27) return 'shadow-2xl';
    }

    // Arbitrary shadow syntax: replace spaces with underscores for safe Tailwind arbitrary value
    const formatted = clean.replace(/\s+/g, '_');
    return `shadow-[${formatted}]`;
}

/**
 * Splits CSS property values by whitespace while preserving functions like rgba(), rgb(), hsl(), var()
 * @param {string} val
 * @returns {Array<string>}
 */
export function splitCssValues(val) {
    if (!val || typeof val !== 'string') return [];
    const parts = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < val.length; i++) {
        const char = val[i];
        if (char === '(') depth++;
        else if (char === ')') depth = Math.max(0, depth - 1);

        if (/\s/.test(char) && depth === 0) {
            if (current.length > 0) {
                parts.push(current);
                current = '';
            }
        } else {
            current += char;
        }
    }
    if (current.length > 0) {
        parts.push(current);
    }
    return parts;
}

/**
 * Translates a complete dictionary of CSS styles into an array of clean Tailwind classes
 * @param {Record<string, string>} styles
 * @param {object} [options={}]
 * @returns {{ classes: Array<string>, remainingStyles: Record<string, string> }}
 */
export function mapStylesToTailwind(styles = {}, options = {}) {
    const classes = [];
    const remainingStyles = {};

    // Helper to snap px values
    const snapPx = (valStr) => {
        const px = parsePxValue(valStr);
        return px !== null ? snapSpacing(px, options) : null;
    };

    // Helper to format signed classes (e.g. 'top', '-[42px]' -> '-top-[42px]')
    const formatSigned = (prop, snapped) => {
        if (!snapped) return null;
        if (snapped.startsWith('-')) {
            return `-${prop}-${snapped.slice(1)}`;
        }
        return `${prop}-${snapped}`;
    };

    // 1. Display
    if (styles['display']) {
        const d = styles['display'].trim().toLowerCase();
        if (d === 'flex') classes.push('flex');
        else if (d === 'inline-flex') classes.push('inline-flex');
        else if (d === 'grid') classes.push('grid');
        else if (d === 'inline-grid') classes.push('inline-grid');
        else if (d === 'block') classes.push('block');
        else if (d === 'inline-block') classes.push('inline-block');
        else if (d === 'inline') classes.push('inline');
        else if (d === 'none') classes.push('hidden');
        else remainingStyles['display'] = styles['display'];
    }

    const isGridDisplay = Boolean(
        (styles['display'] && styles['display'].trim().toLowerCase().includes('grid')) ||
        styles['grid-template-columns'] ||
        styles['grid-template-rows']
    );

    // 2. Flexbox Container Properties
    if (!isGridDisplay) {
        if (styles['flex-direction']) {
            const dir = styles['flex-direction'].trim().toLowerCase();
            if (dir === 'row') classes.push('flex-row');
            else if (dir === 'column') classes.push('flex-col');
            else if (dir === 'row-reverse') classes.push('flex-row-reverse');
            else if (dir === 'column-reverse') classes.push('flex-col-reverse');
        }
        if (styles['flex-wrap']) {
            const wrap = styles['flex-wrap'].trim().toLowerCase();
            if (wrap === 'wrap') classes.push('flex-wrap');
            else if (wrap === 'nowrap') classes.push('flex-nowrap');
            else if (wrap === 'wrap-reverse') classes.push('flex-wrap-reverse');
        }
    }
    if (styles['justify-content']) {
        const jc = styles['justify-content'].trim().toLowerCase();
        if (jc === 'flex-start' || jc === 'start') classes.push('justify-start');
        else if (jc === 'center') classes.push('justify-center');
        else if (jc === 'flex-end' || jc === 'end') classes.push('justify-end');
        else if (jc === 'space-between') classes.push('justify-between');
        else if (jc === 'space-around') classes.push('justify-around');
        else if (jc === 'space-evenly') classes.push('justify-evenly');
    }
    if (styles['align-items']) {
        const ai = styles['align-items'].trim().toLowerCase();
        if (ai === 'flex-start' || ai === 'start') classes.push('items-start');
        else if (ai === 'center') classes.push('items-center');
        else if (ai === 'flex-end' || ai === 'end') classes.push('items-end');
        else if (ai === 'baseline') classes.push('items-baseline');
        else if (ai === 'stretch') classes.push('items-stretch');
    }
    if (styles['align-self']) {
        const as = styles['align-self'].trim().toLowerCase();
        if (as === 'auto') classes.push('self-auto');
        else if (as === 'flex-start' || as === 'start') classes.push('self-start');
        else if (as === 'center') classes.push('self-center');
        else if (as === 'flex-end' || as === 'end') classes.push('self-end');
        else if (as === 'stretch') classes.push('self-stretch');
        else if (as === 'baseline') classes.push('self-baseline');
    }

    // 3. Grid Container Properties
    if (styles['grid-template-columns']) {
        const gtc = styles['grid-template-columns'].trim();
        const repeatMatch = gtc.match(/repeat\((\d+),\s*1fr\)/i);
        if (repeatMatch) {
            classes.push(`grid-cols-${repeatMatch[1]}`);
        } else if (gtc === '1fr') {
            classes.push('grid-cols-1');
        } else {
            classes.push(`grid-cols-[${gtc.replace(/\s+/g, '_')}]`);
        }
    }
    if (styles['grid-template-rows']) {
        const gtr = styles['grid-template-rows'].trim();
        const repeatMatch = gtr.match(/repeat\((\d+),\s*1fr\)/i);
        if (repeatMatch) {
            classes.push(`grid-rows-${repeatMatch[1]}`);
        } else {
            classes.push(`grid-rows-[${gtr.replace(/\s+/g, '_')}]`);
        }
    }

    // 4. Gap
    if (styles['gap']) {
        const s = snapPx(styles['gap']);
        if (s) classes.push(`gap-${s}`);
    }
    if (styles['column-gap'] && !styles['gap']) {
        const s = snapPx(styles['column-gap']);
        if (s) classes.push(`gap-x-${s}`);
    }
    if (styles['row-gap'] && !styles['gap']) {
        const s = snapPx(styles['row-gap']);
        if (s) classes.push(`gap-y-${s}`);
    }

    // 5. Padding
    if (styles['padding']) {
        const parts = styles['padding'].trim().split(/\s+/);
        if (parts.length === 1) {
            const s = snapPx(parts[0]);
            if (s) classes.push(`p-${s}`);
        } else if (parts.length === 2) {
            const py = snapPx(parts[0]);
            const px = snapPx(parts[1]);
            if (py) classes.push(`py-${py}`);
            if (px) classes.push(`px-${px}`);
        } else if (parts.length === 4) {
            const pt = snapPx(parts[0]);
            const pr = snapPx(parts[1]);
            const pb = snapPx(parts[2]);
            const pl = snapPx(parts[3]);
            if (pt === pb && pr === pl) {
                if (pt) classes.push(`py-${pt}`);
                if (pr) classes.push(`px-${pr}`);
            } else {
                if (pt) classes.push(`pt-${pt}`);
                if (pr) classes.push(`pr-${pr}`);
                if (pb) classes.push(`pb-${pb}`);
                if (pl) classes.push(`pl-${pl}`);
            }
        }
    } else {
        if (styles['padding-top']) {
            const s = snapPx(styles['padding-top']);
            if (s) classes.push(`pt-${s}`);
        }
        if (styles['padding-right']) {
            const s = snapPx(styles['padding-right']);
            if (s) classes.push(`pr-${s}`);
        }
        if (styles['padding-bottom']) {
            const s = snapPx(styles['padding-bottom']);
            if (s) classes.push(`pb-${s}`);
        }
        if (styles['padding-left']) {
            const s = snapPx(styles['padding-left']);
            if (s) classes.push(`pl-${s}`);
        }
    }

    // 6. Margin
    if (styles['margin']) {
        const parts = styles['margin'].trim().split(/\s+/);
        if (parts.length === 1) {
            if (parts[0] === 'auto') classes.push('m-auto');
            else {
                const s = snapPx(parts[0]);
                if (s) classes.push(formatSigned('m', s));
            }
        } else if (parts.length === 2) {
            const my = parts[0] === 'auto' ? 'auto' : snapPx(parts[0]);
            const mx = parts[1] === 'auto' ? 'auto' : snapPx(parts[1]);
            if (my) classes.push(my === 'auto' ? 'my-auto' : formatSigned('my', my));
            if (mx) classes.push(mx === 'auto' ? 'mx-auto' : formatSigned('mx', mx));
        }
    } else {
        if (styles['margin-top']) {
            const s = snapPx(styles['margin-top']);
            if (s) classes.push(formatSigned('mt', s));
        }
        if (styles['margin-right']) {
            const s = snapPx(styles['margin-right']);
            if (s) classes.push(formatSigned('mr', s));
        }
        if (styles['margin-bottom']) {
            const s = snapPx(styles['margin-bottom']);
            if (s) classes.push(formatSigned('mb', s));
        }
        if (styles['margin-left']) {
            const s = snapPx(styles['margin-left']);
            if (s) classes.push(formatSigned('ml', s));
        }
    }

    // 7. Positioning
    if (styles['position']) {
        const pos = styles['position'].trim().toLowerCase();
        if (['relative', 'absolute', 'fixed', 'sticky', 'static'].includes(pos)) {
            classes.push(pos);
        }
    }
    if (styles['top']) {
        const s = snapPx(styles['top']);
        if (s) classes.push(formatSigned('top', s));
    }
    if (styles['right']) {
        const s = snapPx(styles['right']);
        if (s) classes.push(formatSigned('right', s));
    }
    if (styles['bottom']) {
        const s = snapPx(styles['bottom']);
        if (s) classes.push(formatSigned('bottom', s));
    }
    if (styles['left']) {
        const s = snapPx(styles['left']);
        if (s) classes.push(formatSigned('left', s));
    }
    if (styles['z-index']) {
        const zVal = styles['z-index'].trim();
        if (['0', '10', '20', '30', '40', '50', 'auto'].includes(zVal)) {
            classes.push(`z-${zVal}`);
        } else {
            classes.push(`z-[${zVal}]`);
        }
    }

    // 8. Sizing (Width, Height, Min/Max)
    if (styles['width']) {
        const w = styles['width'].trim().toLowerCase();
        if (w === '100%') classes.push('w-full');
        else if (w === '100vw') classes.push('w-screen');
        else if (w === 'auto') classes.push('w-auto');
        else if (w === 'fit-content' || w === 'max-content') classes.push('w-fit');
        else if (w === 'min-content') classes.push('w-min');
        else {
            const s = snapPx(w);
            if (s) classes.push(`w-${s}`);
        }
    }
    if (styles['height']) {
        const h = styles['height'].trim().toLowerCase();
        if (h === '100%') classes.push('h-full');
        else if (h === '100vh' || h === '100dvh') classes.push('h-screen');
        else if (h === 'auto') classes.push('h-auto');
        else if (h === 'fit-content' || h === 'max-content') classes.push('h-fit');
        else if (h === 'min-content') classes.push('h-min');
        else {
            const s = snapPx(h);
            if (s) classes.push(`h-${s}`);
        }
    }
    if (styles['min-width']) {
        const mw = styles['min-width'].trim().toLowerCase();
        if (mw === '0' || mw === '0px') classes.push('min-w-0');
        else if (mw === '100%') classes.push('min-w-full');
        else {
            const s = snapPx(mw);
            if (s) classes.push(`min-w-${s}`);
        }
    }
    if (styles['max-width']) {
        const mw = styles['max-width'].trim().toLowerCase();
        if (mw === '100%') classes.push('max-w-full');
        else if (mw === 'none') classes.push('max-w-none');
        else {
            const s = snapPx(mw);
            if (s) classes.push(`max-w-${s}`);
        }
    }
    if (styles['min-height']) {
        const mh = styles['min-height'].trim().toLowerCase();
        if (mh === '0' || mh === '0px') classes.push('min-h-0');
        else if (mh === '100%') classes.push('min-h-full');
        else if (mh === '100vh' || mh === '100dvh') classes.push('min-h-screen');
        else {
            const s = snapPx(mh);
            if (s) classes.push(`min-h-${s}`);
        }
    }
    if (styles['max-height']) {
        const mh = styles['max-height'].trim().toLowerCase();
        if (mh === '100%') classes.push('max-h-full');
        else if (mh === '100vh' || mh === '100dvh') classes.push('max-h-screen');
        else if (mh === 'none') classes.push('max-h-none');
        else {
            const s = snapPx(mh);
            if (s) classes.push(`max-h-${s}`);
        }
    }

    // Flex child sizing
    if (styles['flex-grow'] === '1' || styles['flex'] === '1' || styles['flex'] === '1 1 0%') {
        classes.push('flex-1');
    } else if (styles['flex'] === 'none' || styles['flex'] === '0 0 auto') {
        classes.push('flex-none');
    }
    if (styles['flex-shrink'] === '0') {
        classes.push('shrink-0');
    } else if (styles['flex-shrink'] === '1') {
        classes.push('shrink');
    }

    // 9. Colors & Background
    if (styles['background-color']) {
        const matched = matchColor(styles['background-color'], options);
        if (matched.classSuffix) {
            classes.push(`bg-${matched.classSuffix}`);
        }
    }
    if (styles['background-size']) {
        const bs = styles['background-size'].trim().toLowerCase();
        if (bs === 'cover') classes.push('bg-cover');
        else if (bs === 'contain') classes.push('bg-contain');
        else if (bs === 'auto') classes.push('bg-auto');
        else remainingStyles['background-size'] = styles['background-size'];
    }
    if (styles['background-position']) {
        const bp = styles['background-position'].trim().toLowerCase();
        if (bp === 'center') classes.push('bg-center');
        else if (bp === 'top') classes.push('bg-top');
        else if (bp === 'bottom') classes.push('bg-bottom');
        else if (bp === 'left') classes.push('bg-left');
        else if (bp === 'right') classes.push('bg-right');
        else remainingStyles['background-position'] = styles['background-position'];
    }
    if (styles['background-repeat']) {
        const br = styles['background-repeat'].trim().toLowerCase();
        if (br === 'no-repeat') classes.push('bg-no-repeat');
        else if (br === 'repeat') classes.push('bg-repeat');
        else if (br === 'repeat-x') classes.push('bg-repeat-x');
        else if (br === 'repeat-y') classes.push('bg-repeat-y');
        else remainingStyles['background-repeat'] = styles['background-repeat'];
    }
    if (styles['background-image']) {
        remainingStyles['background-image'] = styles['background-image'];
    }
    if (styles['background-blend-mode']) {
        remainingStyles['background-blend-mode'] = styles['background-blend-mode'];
    }
    if (styles['color']) {
        const matched = matchColor(styles['color'], options);
        if (matched.classSuffix) {
            classes.push(`text-${matched.classSuffix}`);
        }
    }

    // 10. Borders & Radius
    if (styles['border-radius']) {
        const parts = styles['border-radius'].trim().split(/\s+/);
        if (parts.length === 1) {
            const r = snapRadius(parts[0], options);
            if (r === 'DEFAULT') classes.push('rounded');
            else if (r !== 'none') classes.push(`rounded-${r}`);
        } else if (parts.length === 4) {
            const tl = snapRadius(parts[0], options);
            const tr = snapRadius(parts[1], options);
            const br = snapRadius(parts[2], options);
            const bl = snapRadius(parts[3], options);
            if (tl !== 'none') classes.push(tl === 'DEFAULT' ? 'rounded-tl' : `rounded-tl-${tl}`);
            if (tr !== 'none') classes.push(tr === 'DEFAULT' ? 'rounded-tr' : `rounded-tr-${tr}`);
            if (br !== 'none') classes.push(br === 'DEFAULT' ? 'rounded-br' : `rounded-br-${br}`);
            if (bl !== 'none') classes.push(bl === 'DEFAULT' ? 'rounded-bl' : `rounded-bl-${bl}`);
        }
    }

    if (styles['border']) {
        const parts = splitCssValues(styles['border']);
        // e.g. "1px solid #e2e8f0" or "none"
        const styleVal = parts.find(p => ['solid', 'dashed', 'dotted', 'double', 'none'].includes(p));
        const widthVal = parts.find(p => p.endsWith('px') || /^\d+$/.test(p));
        const colorVal = parts.find(p => p.startsWith('#') || p.startsWith('rgb') || p.startsWith('hsl') || p.startsWith('var'));

        const isNone = styleVal === 'none' ||
                       (widthVal && parseFloat(widthVal) === 0) ||
                       styles['border'].trim() === 'none' ||
                       styles['border'].trim() === '0';

        if (!isNone) {
            if (widthVal) {
                const wNum = parseFloat(widthVal);
                const wKey = snapBorderWidth(wNum, options);
                if (wKey === 'DEFAULT') classes.push('border');
                else if (wKey !== '0') classes.push(`border-${wKey}`);
            } else {
                classes.push('border');
            }

            if (styleVal && styleVal !== 'solid') {
                classes.push(`border-${styleVal}`);
            }

            if (colorVal) {
                const matched = matchColor(colorVal, options);
                if (matched.classSuffix) classes.push(`border-${matched.classSuffix}`);
            }
        }
    }

    // 11. Box Shadow
    if (styles['box-shadow']) {
        classes.push(mapBoxShadow(styles['box-shadow']));
    }

    // 12. Opacity
    if (styles['opacity']) {
        const op = Math.round(parseFloat(styles['opacity']) * 100);
        if (!isNaN(op) && op < 100) {
            classes.push(`opacity-${op}`);
        }
    }

    // 13. Overflow
    if (styles['overflow']) {
        const of = styles['overflow'].trim().toLowerCase();
        if (['hidden', 'auto', 'scroll', 'visible'].includes(of)) {
            classes.push(`overflow-${of}`);
        }
    }

    // 14. Typography
    let currentFontSizePx = 16;
    if (styles['font-size']) {
        const px = parsePxValue(styles['font-size']);
        if (px !== null) {
            currentFontSizePx = px;
            classes.push(mapFontSize(px, options));
        }
    }
    if (styles['font-weight']) {
        const weight = parseInt(styles['font-weight'], 10);
        if (FONT_WEIGHT_MAP[weight]) {
            classes.push(FONT_WEIGHT_MAP[weight]);
        }
    }
    if (styles['font-style'] === 'italic') {
        classes.push('italic');
    }
    if (styles['text-align']) {
        const ta = styles['text-align'].trim().toLowerCase();
        if (['left', 'center', 'right', 'justify'].includes(ta)) {
            classes.push(`text-${ta}`);
        }
    }
    if (styles['text-transform']) {
        const tt = styles['text-transform'].trim().toLowerCase();
        if (tt === 'uppercase') classes.push('uppercase');
        else if (tt === 'lowercase') classes.push('lowercase');
        else if (tt === 'capitalize') classes.push('capitalize');
    }
    if (styles['text-decoration']) {
        const td = styles['text-decoration'].trim().toLowerCase();
        if (td === 'underline') classes.push('underline');
        else if (td === 'line-through') classes.push('line-through');
    }
    if (styles['letter-spacing']) {
        const tr = mapLetterSpacing(styles['letter-spacing']);
        if (tr) classes.push(tr);
    }
    if (styles['line-height']) {
        const lh = mapLineHeight(styles['line-height'], currentFontSizePx);
        if (lh) classes.push(lh);
    }
    if (styles['white-space'] === 'nowrap') {
        classes.push('whitespace-nowrap');
    }

    // 15. Backdrop Filter & Filter Blurs
    if (styles['backdrop-filter']) {
        const bf = styles['backdrop-filter'].trim();
        const blurMatch = bf.match(/blur\((\d+)px\)/i);
        if (blurMatch) {
            const bPx = parseInt(blurMatch[1], 10);
            if (bPx <= 4) classes.push('backdrop-blur-sm');
            else if (bPx <= 8) classes.push('backdrop-blur');
            else if (bPx <= 12) classes.push('backdrop-blur-md');
            else if (bPx <= 16) classes.push('backdrop-blur-lg');
            else if (bPx <= 24) classes.push('backdrop-blur-xl');
            else if (bPx <= 40) classes.push('backdrop-blur-2xl');
            else classes.push(`backdrop-blur-[${bPx}px]`);
        }
    }

    if (styles['cursor'] === 'pointer') {
        classes.push('cursor-pointer');
    }
    if (styles['pointer-events'] === 'none') {
        classes.push('pointer-events-none');
    } else if (styles['pointer-events'] === 'auto') {
        classes.push('pointer-events-auto');
    }
    if (styles['object-fit']) {
        const of = styles['object-fit'].trim().toLowerCase();
        if (['cover', 'contain', 'fill', 'none', 'scale-down'].includes(of)) {
            classes.push(`object-${of}`);
        }
    }
    for (const k of ['transform', 'transform-origin', 'filter', '-webkit-mask-image', 'mask-image', '-webkit-mask-size', 'mask-size', '-webkit-mask-repeat', 'mask-repeat']) {
        if (styles[k]) {
            remainingStyles[k] = styles[k];
        }
    }

    // Deduplicate and resolve internal conflicts
    const dedupedClasses = deduplicateTailwindClasses(classes);

    return {
        classes: dedupedClasses,
        remainingStyles
    };
}

/**
 * Deduplicates and resolves conflicts in a list of Tailwind classes
 * @param {Array<string>} classList
 * @returns {Array<string>}
 */
export function deduplicateTailwindClasses(classList) {
    if (!Array.isArray(classList) || classList.length <= 1) return classList || [];

    const isGrid = classList.some(c => c === 'grid' || c === 'inline-grid');
    const map = new Map();
    // Prefix / namespace extractor to prevent conflicts (e.g. p-4 overrides p-2, text-center overrides text-left)
    const getGroupKey = (cls) => {
        // e.g. "md:p-4" -> prefix "md:", base "p-4"
        const colonIdx = cls.lastIndexOf(':');
        const prefix = colonIdx !== -1 ? cls.slice(0, colonIdx + 1) : '';
        const base = colonIdx !== -1 ? cls.slice(colonIdx + 1) : cls;
        const unsignedBase = base.startsWith('-') ? base.slice(1) : base;

        if (unsignedBase.startsWith('p-') || unsignedBase.startsWith('px-') || unsignedBase.startsWith('py-') ||
            unsignedBase.startsWith('pt-') || unsignedBase.startsWith('pr-') || unsignedBase.startsWith('pb-') || unsignedBase.startsWith('pl-')) {
            const prop = unsignedBase.split('-')[0];
            return `${prefix}padding-${prop}`;
        }
        if (unsignedBase.startsWith('m-') || unsignedBase.startsWith('mx-') || unsignedBase.startsWith('my-') ||
            unsignedBase.startsWith('mt-') || unsignedBase.startsWith('mr-') || unsignedBase.startsWith('mb-') || unsignedBase.startsWith('ml-')) {
            const prop = unsignedBase.split('-')[0];
            return `${prefix}margin-${prop}`;
        }
        if (unsignedBase.startsWith('top-')) return `${prefix}top`;
        if (unsignedBase.startsWith('right-')) return `${prefix}right`;
        if (unsignedBase.startsWith('bottom-')) return `${prefix}bottom`;
        if (unsignedBase.startsWith('left-')) return `${prefix}left`;
        if (base.startsWith('w-')) return `${prefix}width`;
        if (base.startsWith('h-')) return `${prefix}height`;
        if (base.startsWith('bg-')) {
            if (['bg-cover', 'bg-contain', 'bg-auto'].includes(base)) return `${prefix}bg-size`;
            if (['bg-center', 'bg-top', 'bg-bottom', 'bg-left', 'bg-right', 'bg-left-top', 'bg-left-bottom', 'bg-right-top', 'bg-right-bottom'].includes(base)) return `${prefix}bg-position`;
            if (['bg-no-repeat', 'bg-repeat', 'bg-repeat-x', 'bg-repeat-y', 'bg-repeat-round', 'bg-repeat-space'].includes(base)) return `${prefix}bg-repeat`;
            if (base.startsWith('bg-clip-')) return `${prefix}bg-clip`;
            if (base.startsWith('bg-gradient-') || base === 'bg-none' || /^bg-\[(url|linear-gradient|radial-gradient)\(/i.test(base)) return `${prefix}bg-image`;
            return `${prefix}bg-color`;
        }
        if (base.startsWith('text-')) {
            if (['text-left', 'text-center', 'text-right', 'text-justify'].includes(base)) return `${prefix}text-align`;
            if (['text-wrap', 'text-nowrap', 'text-balance', 'text-pretty'].includes(base)) return `${prefix}text-wrap`;
            if (FONT_SIZE_SCALE.some(f => base === `text-${f.key}`)) return `${prefix}font-size`;
            if (base.startsWith('text-[') && base.endsWith(']')) {
                const inner = base.slice(6, -1);
                if (/^-?\d+(\.\d+)?(px|rem|em|vw|vh|%)$/i.test(inner) || inner.startsWith('length:') || inner.startsWith('clamp(')) {
                    return `${prefix}font-size`;
                }
                return `${prefix}text-color`;
            }
            return `${prefix}text-color`;
        }
        if (base.startsWith('font-')) {
            if (['font-sans', 'font-serif', 'font-mono', 'font-display'].includes(base)) return `${prefix}font-family`;
            if (['font-thin', 'font-extralight', 'font-light', 'font-normal', 'font-medium', 'font-semibold', 'font-bold', 'font-extrabold', 'font-black'].includes(base) || /^font-\[\d+\]$/.test(base)) {
                return `${prefix}font-weight`;
            }
            return `${prefix}font-family`;
        }
        if (base.startsWith('rounded-') || base === 'rounded') {
            if (base.startsWith('rounded-tl')) return `${prefix}rounded-tl`;
            if (base.startsWith('rounded-tr')) return `${prefix}rounded-tr`;
            if (base.startsWith('rounded-br')) return `${prefix}rounded-br`;
            if (base.startsWith('rounded-bl')) return `${prefix}rounded-bl`;
            if (base.startsWith('rounded-t-') || base === 'rounded-t') return `${prefix}rounded-t`;
            if (base.startsWith('rounded-r-') || base === 'rounded-r') return `${prefix}rounded-r`;
            if (base.startsWith('rounded-b-') || base === 'rounded-b') return `${prefix}rounded-b`;
            if (base.startsWith('rounded-l-') || base === 'rounded-l') return `${prefix}rounded-l`;
            return `${prefix}rounded`;
        }
        if (base.startsWith('shadow-') || base === 'shadow') return `${prefix}shadow`;
        if (base.startsWith('opacity-')) return `${prefix}opacity`;
        if (base.startsWith('justify-')) return `${prefix}justify`;
        if (base.startsWith('items-')) return `${prefix}items`;
        if (base.startsWith('self-')) return `${prefix}self`;
        if (base.startsWith('gap-x-')) return `${prefix}gap-x`;
        if (base.startsWith('gap-y-')) return `${prefix}gap-y`;
        if (base.startsWith('gap-')) return `${prefix}gap`;
        if (['flex', 'grid', 'block', 'inline-block', 'inline-flex', 'inline-grid', 'hidden'].includes(base)) return `${prefix}display`;
        if (['relative', 'absolute', 'fixed', 'sticky', 'static'].includes(base)) return `${prefix}position`;

        return `${prefix}${base}`;
    };

    for (const cls of classList) {
        if (!cls) continue;
        if (isGrid) {
            if (cls === 'flex' || cls === 'inline-flex' || cls === 'flex-row' || cls === 'flex-col' || cls === 'flex-row-reverse' || cls === 'flex-col-reverse' || cls === 'flex-wrap' || cls === 'flex-nowrap' || cls === 'flex-wrap-reverse') {
                continue;
            }
        }
        const group = getGroupKey(cls);
        const colonIdx = cls.lastIndexOf(':');
        const prefix = colonIdx !== -1 ? cls.slice(0, colonIdx + 1) : '';
        if (group === `${prefix}padding-pt` || group === `${prefix}padding-pb`) {
            map.delete(`${prefix}padding-py`);
            map.delete(`${prefix}padding-p`);
        } else if (group === `${prefix}padding-pr` || group === `${prefix}padding-pl`) {
            map.delete(`${prefix}padding-px`);
            map.delete(`${prefix}padding-p`);
        } else if (group === `${prefix}padding-py`) {
            map.delete(`${prefix}padding-pt`);
            map.delete(`${prefix}padding-pb`);
            map.delete(`${prefix}padding-p`);
        } else if (group === `${prefix}padding-px`) {
            map.delete(`${prefix}padding-pr`);
            map.delete(`${prefix}padding-pl`);
            map.delete(`${prefix}padding-p`);
        } else if (group === `${prefix}padding-p`) {
            map.delete(`${prefix}padding-py`);
            map.delete(`${prefix}padding-px`);
            map.delete(`${prefix}padding-pt`);
            map.delete(`${prefix}padding-pr`);
            map.delete(`${prefix}padding-pb`);
            map.delete(`${prefix}padding-pl`);
        }
        map.set(group, cls);
    }

    return Array.from(map.values());
}
