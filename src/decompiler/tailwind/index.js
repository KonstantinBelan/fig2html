// src/decompiler/tailwind/index.js

export {
    SPACING_SCALE,
    RADIUS_SCALE,
    BORDER_WIDTH_SCALE,
    findNearestScaleKey,
    snapSpacing,
    snapRadius,
    snapBorderWidth
} from './scale-snapper.js';

export {
    TAILWIND_COLORS,
    ALPHA_SCALE,
    parseColor,
    rgbToHex,
    matchAlpha,
    matchColor
} from './color-matcher.js';

export {
    FONT_SIZE_SCALE,
    FONT_WEIGHT_MAP,
    TRACKING_SCALE,
    LEADING_SCALE,
    mapFontSize,
    mapLetterSpacing,
    mapLineHeight,
    mapBoxShadow,
    mapStylesToTailwind,
    deduplicateTailwindClasses
} from './mapper.js';

export {
    mapAutoLayoutToTailwind,
    resolveNodeTailwindClasses
} from './layout.js';

