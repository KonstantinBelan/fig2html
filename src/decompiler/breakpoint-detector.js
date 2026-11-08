// src/decompiler/breakpoint-detector.js

import { transliterate, stripPageTag, hasExcludeTag, slugifyPageName, sanitizeFileName } from './page-detector.js';

/**
 * Standard default device breakpoints and widths (in pixels)
 */
export const DEFAULT_BREAKPOINTS = {
    desktop: 1440,
    laptop: 1200,
    tablet: 768,
    mobile: 375
};

export const BREAKPOINT_NAMES = ['desktop', 'laptop', 'tablet', 'mobile'];

/**
 * Known keyword mappings for breakpoint tags in Russian and English
 */
export const BREAKPOINT_KEYWORDS = {
    'desktop': 'desktop',
    'десктоп': 'desktop',
    'пк': 'desktop',
    'компьютер': 'desktop',
    'large': 'desktop',
    'lg': 'desktop',
    'xl': 'desktop',
    'wide': 'desktop',
    '1440': 'desktop',
    '1920': 'desktop',

    'laptop': 'laptop',
    'ноутбук': 'laptop',
    'ноут': 'laptop',
    'md': 'laptop',
    '1200': 'laptop',

    'tablet': 'tablet',
    'планшет': 'tablet',
    'айпад': 'tablet',
    'ipad': 'tablet',
    'sm': 'tablet',
    'medium': 'tablet',
    '1024': 'tablet',
    '768': 'tablet',

    'mobile': 'mobile',
    'мобайл': 'mobile',
    'мобильный': 'mobile',
    'моб': 'mobile',
    'телефон': 'mobile',
    'phone': 'mobile',
    'xs': 'mobile',
    'small': 'mobile',
    '375': 'mobile',
    '390': 'mobile',
    '414': 'mobile',
    '360': 'mobile',
    '320': 'mobile'
};

/**
 * Parses breakpoint tag or suffix from layer name.
 * Supported syntaxes:
 *   - Square brackets: "Page 1 [desktop]", "Home [mobile]", "Header [768px]", "Hero [w:375]"
 *   - At-sign suffix: "Home @1440", "Home @mobile", "Catalog @375"
 *   - Slash delimiter: "Home / Desktop", "Landing / Mobile"
 *   - Dash delimiter: "Home - Desktop", "Home - Mobile"
 *   - Parentheses: "Home (Desktop)", "Home (Mobile)"
 *
 * @param {string} rawName
 * @returns {{ isBreakpointTagged: boolean, baseName: string, breakpoint: string|null, targetWidth: number|null, rawTag: string|null }}
 */
export function parseBreakpointTag(rawName) {
    if (!rawName || typeof rawName !== 'string') {
        return { isBreakpointTagged: false, baseName: '', breakpoint: null, targetWidth: null, rawTag: null };
    }

    const trimmed = rawName.trim();

    // 0. Direct keyword match: "Desktop", "Mobile", "Tablet", "1440", "375"
    const directBp = resolveBreakpointName(trimmed);
    if (directBp) {
        const num = parseInt(trimmed, 10);
        return {
            isBreakpointTagged: true,
            baseName: 'Page',
            breakpoint: directBp,
            targetWidth: !isNaN(num) ? num : null,
            rawTag: trimmed
        };
    }

    // 1. Bracket syntax: "Name [desktop]", "Name [w:1440]", "Name [768px]"
    const bracketMatch = trimmed.match(/^(.*?)\s*\[(?:w(?:idth)?:?\s*)?([a-zA-Z0-9а-яА-ЯёЁ_-]+(?:\s*px)?)\]\s*$/i);
    if (bracketMatch) {
        const base = bracketMatch[1].trim();
        const tagContent = bracketMatch[2].trim().toLowerCase().replace(/px$/, '');
        const bp = resolveBreakpointName(tagContent);
        const parsedNum = parseInt(tagContent, 10);
        const width = !isNaN(parsedNum) ? parsedNum : null;
        if (bp || width) {
            return {
                isBreakpointTagged: true,
                baseName: base || 'Page',
                breakpoint: bp || (width ? categorizeWidth(width) : 'custom'),
                targetWidth: width,
                rawTag: bracketMatch[0]
            };
        }
    }

    // 2. At-sign syntax: "Name @1440", "Name @mobile", "Name @desktop"
    const atMatch = trimmed.match(/^(.*?)\s*@([a-zA-Z0-9а-яА-ЯёЁ_-]+(?:\s*px)?)\s*$/i);
    if (atMatch) {
        const base = atMatch[1].trim();
        const tagContent = atMatch[2].trim().toLowerCase().replace(/px$/, '');
        const bp = resolveBreakpointName(tagContent);
        const parsedNum = parseInt(tagContent, 10);
        const width = !isNaN(parsedNum) ? parsedNum : null;
        if (bp || width) {
            return {
                isBreakpointTagged: true,
                baseName: base || 'Page',
                breakpoint: bp || (width ? categorizeWidth(width) : 'custom'),
                targetWidth: width,
                rawTag: atMatch[0]
            };
        }
    }

    // 3. Delimiter syntax: "Name / Desktop", "Name - Desktop", "Name (Desktop)"
    const delimMatch = trimmed.match(/^(.*?)\s*(?:[\/\-–—]|\()\s*([a-zA-Zа-яА-ЯёЁ0-9_-]+(?:\s*px)?)\s*\)?\s*$/i);
    if (delimMatch) {
        const base = delimMatch[1].trim();
        const tagContent = delimMatch[2].trim().toLowerCase().replace(/px$/, '');
        const bp = resolveBreakpointName(tagContent);
        const parsedNum = parseInt(tagContent, 10);
        const width = !isNaN(parsedNum) ? parsedNum : null;
        if (bp) {
            return {
                isBreakpointTagged: true,
                baseName: base || 'Page',
                breakpoint: bp,
                targetWidth: width,
                rawTag: delimMatch[0]
            };
        }
    }

    // 4. Space delimiter syntax: "Name Desktop", "Name Mobile", "Landing Tablet"
    const spaceMatch = trimmed.match(/^(.*?)\s+([a-zA-Zа-яА-ЯёЁ0-9_-]+(?:\s*px)?)\s*$/i);
    if (spaceMatch) {
        const base = spaceMatch[1].trim();
        const tagContent = spaceMatch[2].trim().toLowerCase().replace(/px$/, '');
        const bp = resolveBreakpointName(tagContent);
        const parsedNum = parseInt(tagContent, 10);
        const width = !isNaN(parsedNum) ? parsedNum : null;
        if (bp) {
            return {
                isBreakpointTagged: true,
                baseName: base || 'Page',
                breakpoint: bp,
                targetWidth: width,
                rawTag: spaceMatch[2]
            };
        }
    }

    return {
        isBreakpointTagged: false,
        baseName: trimmed,
        breakpoint: null,
        targetWidth: null,
        rawTag: null
    };
}

/**
 * Resolves keyword or number string to standard breakpoint identifier
 * @param {string} token
 * @returns {string|null}
 */
export function resolveBreakpointName(token) {
    if (!token) return null;
    const clean = token.trim().toLowerCase();
    if (BREAKPOINT_KEYWORDS[clean]) {
        return BREAKPOINT_KEYWORDS[clean];
    }
    const num = parseInt(clean, 10);
    if (!isNaN(num) && num > 0) {
        return categorizeWidth(num);
    }
    return null;
}

/**
 * Categorizes a numeric screen width into standard breakpoint buckets
 * @param {number} width
 * @returns {string} 'desktop' | 'laptop' | 'tablet' | 'mobile'
 */
export function categorizeWidth(width) {
    if (width >= 1300) return 'desktop';
    if (width >= 1050) return 'laptop';
    if (width >= 650) return 'tablet';
    return 'mobile';
}

/**
 * Normalizes page base name by stripping common prefixes, tags, and numbers
 * @param {string} rawName
 * @returns {string}
 */
export function normalizeBaseName(rawName) {
    if (!rawName) return 'Page';
    // First strip page tags if any ([page], #page, etc.)
    const stripped = stripPageTag(rawName);
    const text = stripped.cleanName || rawName;
    const bpParsed = parseBreakpointTag(text);
    const base = bpParsed.baseName || text;
    return base.trim();
}

/**
 * Groups candidate screen frames into responsive page units.
 * Each responsive page unit contains:
 *   - pageName: Canonical page title
 *   - slug: URL slug (e.g. "index", "about")
 *   - fileName: "index.html"
 *   - isResponsive: true if multiple screen widths are matched
 *   - baseBreakpoint: the primary breakpoint (usually desktop / widest)
 *   - breakpoints: Array of sorted breakpoints (descending by width)
 *
 * @param {Array<object>} frames Array of top-level screen frame nodes
 * @param {object} [options={}]
 * @returns {Array<object>} Array of grouped responsive page definitions
 */
export function groupFramesIntoResponsivePages(frames, options = {}) {
    if (!Array.isArray(frames) || frames.length === 0) {
        return [];
    }

    const customBreakpoints = options.breakpoints
        ? String(options.breakpoints).split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n) && n > 0).sort((a, b) => b - a)
        : null;

    // Grouping map: normalized pageKey -> Array<{ frame, parsed, width, height }>
    const groups = new Map();

    for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        if (!frame || frame.visible === false) continue;
        if (hasExcludeTag(frame.name, options.excludeTag)) continue;

        const rawName = frame.name || `Screen ${i + 1}`;
        const pageTagInfo = stripPageTag(rawName, options.pageTag);
        const nameWithoutPageTag = pageTagInfo.cleanName || rawName;

        const bpInfo = parseBreakpointTag(nameWithoutPageTag);
        const frameW = Math.round(frame.size?.x || (bpInfo.breakpoint ? DEFAULT_BREAKPOINTS[bpInfo.breakpoint] : 1440));
        const frameH = Math.round(frame.size?.y || 900);

        const bpName = bpInfo.breakpoint || categorizeWidth(frameW);
        let bpWidth = bpInfo.targetWidth || frameW;

        if (customBreakpoints && customBreakpoints.length > 0) {
            let closest = customBreakpoints[0];
            let minDiff = Math.abs(bpWidth - closest);
            for (const cb of customBreakpoints) {
                const diff = Math.abs(bpWidth - cb);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = cb;
                }
            }
            bpWidth = closest;
        }

        // Determine base page key
        const baseName = bpInfo.baseName || nameWithoutPageTag;
        const pageKey = baseName.trim().toLowerCase();

        if (!groups.has(pageKey)) {
            groups.set(pageKey, {
                baseName,
                originalName: rawName,
                isTagged: bpInfo.isBreakpointTagged || pageTagInfo.isTagged,
                frames: []
            });
        }

        groups.get(pageKey).frames.push({
            frame,
            bpName,
            width: bpWidth,
            height: frameH,
            isTagged: bpInfo.isBreakpointTagged
        });
    }

    // Now resolve each group into a responsive page definition
    const responsivePages = [];
    const usedSlugs = new Set();

    let pageIndex = 0;
    for (const [key, group] of groups.entries()) {
        const rawFrames = group.frames;

        // Deduplicate and sort breakpoints descending by width
        rawFrames.sort((a, b) => b.width - a.width);

        // Keep highest-resolution frame per distinct width/breakpoint
        const uniqueBreakpoints = [];
        const seenWidths = new Set();
        const seenBpNames = new Set();

        for (const item of rawFrames) {
            // Cluster widths within 40px tolerance as the same breakpoint
            let isDuplicate = false;
            for (const w of seenWidths) {
                if (Math.abs(w - item.width) <= 40) {
                    isDuplicate = true;
                    break;
                }
            }
            if (!isDuplicate && !seenBpNames.has(item.bpName)) {
                seenWidths.add(item.width);
                seenBpNames.add(item.bpName);
                uniqueBreakpoints.push({
                    name: item.bpName,
                    width: item.width,
                    height: item.height,
                    frame: item.frame,
                    isBase: uniqueBreakpoints.length === 0 // Widest is base
                });
            }
        }

        const isResponsive = uniqueBreakpoints.length > 1;
        const baseBp = uniqueBreakpoints[0];

        // Slugify page name
        const slug = slugifyPageName(group.baseName, { isFirst: pageIndex === 0 });
        let finalSlug = slug;
        if (usedSlugs.has(finalSlug)) {
            let counter = 2;
            while (usedSlugs.has(`${slug}-${counter}`)) {
                counter++;
            }
            finalSlug = `${slug}-${counter}`;
        }
        usedSlugs.add(finalSlug);

        responsivePages.push({
            pageName: group.baseName,
            cleanName: group.baseName,
            slug: finalSlug,
            fileName: sanitizeFileName(finalSlug),
            isResponsive,
            baseBreakpoint: baseBp,
            breakpoints: uniqueBreakpoints,
            rootNodes: [baseBp.frame],
            width: baseBp.width,
            height: baseBp.height,
            node: baseBp.frame
        });

        pageIndex++;
    }

    return responsivePages;
}
