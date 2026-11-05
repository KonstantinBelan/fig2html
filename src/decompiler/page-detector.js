// src/decompiler/page-detector.js

// Cyrillic to Latin transliteration table
const RU_MAP = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
};

const DEFAULT_PAGE_TAGS = ['[page]', '[страница]', '[p]', '#page', '/page'];
const DEFAULT_MIN_PAGE_WIDTH = 320;
const DEFAULT_MIN_PAGE_HEIGHT = 400;

// Common page semantic name mappings (Russian and English to canonical slugs)
const COMMON_PAGE_SLUGS = {
    'home': 'index',
    'главная': 'index',
    'главная страница': 'index',
    'домашняя': 'index',
    'index': 'index',
    'main': 'index',
    'start': 'index',
    'desktop': 'index',
    'welcome': 'index',
    'landing': 'index',
    'о нас': 'about',
    'о компании': 'about',
    'о проекте': 'about',
    'about': 'about',
    'about us': 'about',
    'about-us': 'about',
    'каталог': 'catalog',
    'каталог товаров': 'catalog',
    'catalog': 'catalog',
    'продукты': 'products',
    'товары': 'products',
    'products': 'products',
    'контакты': 'contacts',
    'связаться': 'contacts',
    'contacts': 'contacts',
    'contact': 'contact',
    'contact us': 'contact',
    'pricing': 'pricing',
    'цены': 'pricing',
    'тарифы': 'pricing',
    'прайс': 'pricing',
    'корзина': 'cart',
    'cart': 'cart',
    'checkout': 'checkout',
    'оформление': 'checkout',
    'доставка': 'delivery',
    'delivery': 'delivery',
    'новости': 'news',
    'news': 'news',
    'блог': 'blog',
    'blog': 'blog',
    'отзывы': 'reviews',
    'reviews': 'reviews',
    'портфолио': 'portfolio',
    'проекты': 'portfolio',
    'portfolio': 'portfolio',
    'услуги': 'services',
    'сервисы': 'services',
    'services': 'services',
    'вход': 'login',
    'авторизация': 'login',
    'login': 'login',
    'signin': 'login',
    'регистрация': 'register',
    'register': 'register',
    'signup': 'register',
    'профиль': 'profile',
    'аккаунт': 'profile',
    'profile': 'profile',
    'account': 'profile',
    'помощь': 'faq',
    'faq': 'faq',
    '404': '404',
    'not-found': '404',
    'error-404': '404',
    'ошибка 404': '404'
};

/**
 * Transliterates a Russian string to Latin based on RU_MAP
 * @param {string} str
 * @returns {string}
 */
function transliterate(str) {
    if (!str || typeof str !== 'string') return '';
    return str.split('').map(ch => {
        const lower = ch.toLowerCase();
        if (RU_MAP[lower] !== undefined) {
            const mapped = RU_MAP[lower];
            return ch === lower ? mapped : (mapped.charAt(0).toUpperCase() + mapped.slice(1));
        }
        return ch;
    }).join('');
}

/**
 * Checks if a layer name has a page tag and extracts the clean title
 * @param {string} rawName
 * @param {Array<string>|string} [customTags]
 * @returns {{ isTagged: boolean, cleanName: string, tag: string|null }}
 */
function stripPageTag(rawName, customTags) {
    if (!rawName || typeof rawName !== 'string') {
        return { isTagged: false, cleanName: '', tag: null };
    }

    let tags = DEFAULT_PAGE_TAGS;
    if (customTags) {
        if (Array.isArray(customTags)) {
            tags = customTags.filter(Boolean);
        } else if (typeof customTags === 'string') {
            tags = customTags.split(',').map(t => t.trim()).filter(Boolean);
        }
    }

    const trimmed = rawName.trim();
    for (const tag of tags) {
        const tagLower = tag.toLowerCase();
        if (trimmed.toLowerCase().startsWith(tagLower)) {
            let rest = trimmed.slice(tag.length).trim();
            // Remove leading delimiters (: - / _ .)
            rest = rest.replace(/^[:\-\/_\s.]+/, '').trim();
            const cleanName = rest || tag.replace(/[^a-zA-Z0-9а-яА-ЯёЁ]/g, '') || 'Page';
            return {
                isTagged: true,
                cleanName,
                tag
            };
        }
    }

    return {
        isTagged: false,
        cleanName: trimmed,
        tag: null
    };
}

/**
 * Converts a page name into a clean, URL-safe slug
 * @param {string} name Page title
 * @param {object} [options={}]
 * @param {boolean} [options.isFirst=false]
 * @param {boolean} [options.isExplicitHome=false]
 * @returns {string} Slug string (e.g. "index", "about", "catalog")
 */
function slugifyPageName(name, options = {}) {
    if (!name || typeof name !== 'string') {
        return options.isFirst ? 'index' : 'page';
    }

    const clean = name.trim().toLowerCase();
    if (!clean) {
        return options.isFirst ? 'index' : 'page';
    }

    // Check semantic common page mapping
    if (COMMON_PAGE_SLUGS[clean]) {
        return COMMON_PAGE_SLUGS[clean];
    }

    // Check if transliterated version matches common slugs
    const transliterated = transliterate(clean).toLowerCase();
    if (COMMON_PAGE_SLUGS[transliterated]) {
        return COMMON_PAGE_SLUGS[transliterated];
    }

    // Check explicit home keywords
    const alphanumericOnly = transliterated.replace(/[^a-z0-9]/g, '');
    if (['home', 'index', 'main', 'glavnaya', 'start', 'desktop', 'welcome', 'landing'].includes(alphanumericOnly)) {
        return 'index';
    }

    // If it's the first page and has a generic placeholder name (e.g. "Page 1", "Artboard 1", "Desktop - 1")
    if (options.isFirst && /^(page|artboard|frame|screen|desktop)[-_ ]*[0-9]*$/i.test(clean)) {
        return 'index';
    }

    // General slugification
    let slug = transliterated
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');

    if (!slug) {
        return options.isFirst ? 'index' : 'page';
    }

    return slug;
}

/**
 * Generates a clean HTML filename from a slug
 * @param {string} slug
 * @returns {string} Filename (e.g. "about.html")
 */
function sanitizeFileName(slug) {
    if (!slug) return 'index.html';
    const clean = slug.replace(/[^a-z0-9_-]/gi, '-').replace(/^-+|-+$/g, '');
    return `${clean || 'page'}.html`;
}

/**
 * Assigns unique file names and slugs to an array of detected pages
 * @param {Array<object>} pages
 */
function assignUniqueFileNames(pages) {
    const usedSlugs = new Set();
    const hasIndex = pages.some(p => p.slug === 'index');

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        let slug = page.slug;

        // If no page explicitly claimed index, the first page gets index
        if (!hasIndex && i === 0) {
            slug = 'index';
        }

        if (usedSlugs.has(slug)) {
            let counter = 2;
            while (usedSlugs.has(`${slug}-${counter}`)) {
                counter++;
            }
            slug = `${slug}-${counter}`;
        }

        usedSlugs.add(slug);
        page.slug = slug;
        page.fileName = sanitizeFileName(slug);
    }
}

/**
 * Detects pages from scene tree according to 3-tier heuristic:
 * Priority 1: Explicit Tags ([page], [страница], [p], #page, /page)
 * Priority 2: Screen Artboards (width >= 320, height >= 400)
 * Priority 3: Native Figma Canvas tabs
 * Fallback: Single page
 *
 * @param {object} treeContext
 * @param {object} [treeContext.canvas] Target canvas
 * @param {Array<object>} [treeContext.canvases] All canvases in document
 * @param {Array<object>} [treeContext.rootNodes] Top-level nodes of target canvas
 * @param {Map<string, object>} [treeContext.allNodesMap]
 * @param {object} [options={}]
 * @returns {Array<object>} Detected pages array
 */
function detectPages(treeContext = {}, options = {}) {
    const isSinglePageForced = options.singlePage === true || options.multiPage === false;
    const minPageWidth = options.minPageWidth !== undefined ? Number(options.minPageWidth) : DEFAULT_MIN_PAGE_WIDTH;
    const minPageHeight = options.minPageHeight !== undefined ? Number(options.minPageHeight) : DEFAULT_MIN_PAGE_HEIGHT;
    const customTags = options.pageTag || options.tags || null;
    const pageFilter = options.pages ? String(options.pages).split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : null;

    const targetCanvas = treeContext.canvas || (treeContext.canvases && treeContext.canvases[0]);
    const allCanvases = (treeContext.canvases || (targetCanvas ? [targetCanvas] : [])).filter(c => c && c.type === 'CANVAS' && c.name !== 'Internal Only Canvas');
    const rootNodes = treeContext.rootNodes || (targetCanvas?.children) || [];

    // Helper to filter detected pages by --pages option
    function applyPageFilter(pagesList) {
        if (!pageFilter || pageFilter.length === 0) return pagesList;
        const filtered = pagesList.filter(p => {
            const raw = (p.name || '').toLowerCase();
            const clean = (p.cleanName || '').toLowerCase();
            const slug = (p.slug || '').toLowerCase();
            return pageFilter.some(filter =>
                raw.includes(filter) ||
                clean.includes(filter) ||
                slug === filter ||
                slug.includes(filter)
            );
        });
        return filtered.length > 0 ? filtered : pagesList;
    }

    // Fallback single page generator
    function makeSinglePage() {
        const title = targetCanvas?.name || 'Page 1';
        return [{
            id: targetCanvas ? `${targetCanvas.guid?.sessionID}:${targetCanvas.guid?.localID}` : 'canvas-root',
            name: title,
            cleanName: title,
            slug: 'index',
            fileName: 'index.html',
            strategy: 'single',
            node: targetCanvas,
            canvas: targetCanvas,
            rootNodes: rootNodes,
            width: Math.round(targetCanvas?.size?.x || rootNodes[0]?.size?.x || 1440),
            height: Math.round(targetCanvas?.size?.y || rootNodes[0]?.size?.y || 900)
        }];
    }

    if (isSinglePageForced) {
        return makeSinglePage();
    }

    // =========================================================================
    // Priority 1: Explicit Tags in top-level frames
    // =========================================================================
    let candidateNodes = options.allCanvases
        ? allCanvases.flatMap(c => c.children || [])
        : rootNodes;

    // If there is a single top-level container/wrapper frame that is not itself tagged,
    // and its children contain tagged frames or screen artboards, unwrap to children
    if (!options.allCanvases && candidateNodes.length === 1 && Array.isArray(candidateNodes[0].children) && candidateNodes[0].children.length >= 2) {
        const topTag = stripPageTag(candidateNodes[0].name, customTags);
        if (!topTag.isTagged) {
            const hasTaggedChildren = candidateNodes[0].children.some(c => stripPageTag(c.name, customTags).isTagged);
            const hasScreenChildren = candidateNodes[0].children.filter(c => (c.type === 'FRAME' || c.type === 'COMPONENT') && (c.size?.x || 0) >= minPageWidth && (c.size?.y || 0) >= minPageHeight).length >= 2;
            if (hasTaggedChildren || hasScreenChildren) {
                candidateNodes = candidateNodes[0].children;
            }
        }
    }

    const taggedFrames = [];
    for (const node of candidateNodes) {
        if (!node || node.visible === false) continue;
        const tagInfo = stripPageTag(node.name, customTags);
        if (tagInfo.isTagged) {
            taggedFrames.push({
                node,
                cleanName: tagInfo.cleanName,
                tag: tagInfo.tag
            });
        }
    }

    if (taggedFrames.length > 0) {
        // Sort tagged frames spatially: Left to Right (X), then Top to Bottom (Y)
        taggedFrames.sort((a, b) => {
            const xA = a.node.transform?.m02 !== undefined ? a.node.transform.m02 : 0;
            const xB = b.node.transform?.m02 !== undefined ? b.node.transform.m02 : 0;
            const diffX = xA - xB;
            if (Math.abs(diffX) > 20) return diffX;
            const yA = a.node.transform?.m12 !== undefined ? a.node.transform.m12 : 0;
            const yB = b.node.transform?.m12 !== undefined ? b.node.transform.m12 : 0;
            return yA - yB;
        });

        const pages = taggedFrames.map((item, idx) => {
            const node = item.node;
            const cleanName = item.cleanName;
            const isFirst = idx === 0;
            const slug = slugifyPageName(cleanName, { isFirst });
            const w = Math.round(node.size?.x || 1440);
            const h = Math.round(node.size?.y || 900);

            return {
                id: node.guid ? `${node.guid.sessionID}:${node.guid.localID}` : `tagged-${idx}`,
                name: node.name,
                cleanName,
                slug,
                fileName: sanitizeFileName(slug),
                strategy: 'tag',
                node,
                canvas: targetCanvas,
                rootNodes: [node],
                width: w,
                height: h
            };
        });

        assignUniqueFileNames(pages);
        return applyPageFilter(pages);
    }

    // =========================================================================
    // Priority 2: Screen Artboards (width >= 320, height >= 400)
    // =========================================================================
    const screenFrames = [];
    for (const node of candidateNodes) {
        if (!node || node.visible === false) continue;
        const isFrameLike = node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE' || node.type === 'GROUP';
        if (!isFrameLike) continue;

        const w = node.size?.x || 0;
        const h = node.size?.y || 0;
        if (w >= minPageWidth && h >= minPageHeight) {
            screenFrames.push(node);
        }
    }

    if (screenFrames.length >= 2) {
        // Sort screen frames: Left to Right (X), then Top to Bottom (Y)
        screenFrames.sort((a, b) => {
            const xA = a.transform?.m02 !== undefined ? a.transform.m02 : 0;
            const xB = b.transform?.m02 !== undefined ? b.transform.m02 : 0;
            const diffX = xA - xB;
            if (Math.abs(diffX) > 20) return diffX;
            const yA = a.transform?.m12 !== undefined ? a.transform.m12 : 0;
            const yB = b.transform?.m12 !== undefined ? b.transform.m12 : 0;
            return yA - yB;
        });

        const pages = screenFrames.map((node, idx) => {
            const isFirst = idx === 0;
            const cleanName = node.name || `Screen ${idx + 1}`;
            const slug = slugifyPageName(cleanName, { isFirst });
            const w = Math.round(node.size?.x || 1440);
            const h = Math.round(node.size?.y || 900);

            return {
                id: node.guid ? `${node.guid.sessionID}:${node.guid.localID}` : `artboard-${idx}`,
                name: node.name,
                cleanName,
                slug,
                fileName: sanitizeFileName(slug),
                strategy: 'artboard',
                node,
                canvas: targetCanvas,
                rootNodes: [node],
                width: w,
                height: h
            };
        });

        assignUniqueFileNames(pages);
        return applyPageFilter(pages);
    }

    // =========================================================================
    // Priority 3: Native Figma Canvas Tabs (CANVAS nodes)
    // =========================================================================
    const nonEmptyCanvases = allCanvases.filter(c => Array.isArray(c.children) && c.children.length > 0);
    const shouldExportAllCanvases = options.allCanvases || options.allPages || (nonEmptyCanvases.length >= 2 && !options.singlePage);

    if (shouldExportAllCanvases && nonEmptyCanvases.length >= 2) {
        const pages = nonEmptyCanvases.map((c, idx) => {
            const isFirst = idx === 0;
            const cleanName = c.name || `Page ${idx + 1}`;
            const slug = slugifyPageName(cleanName, { isFirst });
            const firstChild = c.children[0];
            const w = Math.round(c.size?.x || firstChild?.size?.x || 1440);
            const h = Math.round(c.size?.y || firstChild?.size?.y || 900);

            return {
                id: c.guid ? `${c.guid.sessionID}:${c.guid.localID}` : `canvas-${idx}`,
                name: c.name,
                cleanName,
                slug,
                fileName: sanitizeFileName(slug),
                strategy: 'canvas',
                node: c,
                canvas: c,
                rootNodes: c.children || [],
                width: w,
                height: h
            };
        });

        assignUniqueFileNames(pages);
        return applyPageFilter(pages);
    }

    // =========================================================================
    // Fallback: Single page export
    // =========================================================================
    return makeSinglePage();
}

module.exports = {
    RU_MAP,
    DEFAULT_PAGE_TAGS,
    DEFAULT_MIN_PAGE_WIDTH,
    DEFAULT_MIN_PAGE_HEIGHT,
    COMMON_PAGE_SLUGS,
    transliterate,
    stripPageTag,
    slugifyPageName,
    sanitizeFileName,
    assignUniqueFileNames,
    detectPages
};
