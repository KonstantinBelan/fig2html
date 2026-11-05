// src/decompiler/css.js
const {
    toRem,
    toEm,
    toVw,
    toVh,
    formatFluidFontSize,
    formatFluidSpacing,
    formatFluidDimension,
    formatEffectsWithUnits
} = require('./units');

/**
 * Maps an image MIME type to its standard file extension
 * @param {string} mime
 * @returns {string} File extension ('jpg', 'png', 'svg', 'webp', 'gif')
 */
function getExtensionForMime(mime) {
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/svg+xml') return 'svg';
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/avif') return 'avif';
    if (mime === 'image/gif') return 'gif';
    return 'png';
}

/**
 * Converts a Figma normalized RGBA color object to a CSS color string
 * @param {{ r: number, g: number, b: number, a?: number }} color
 * @param {number} [opacityMultiplier=1]
 * @returns {string} CSS color (hex or rgba)
 */
function formatColor(color, opacityMultiplier = 1) {
    if (!color) return 'transparent';
    const r = Math.round((color.r || 0) * 255);
    const g = Math.round((color.g || 0) * 255);
    const b = Math.round((color.b || 0) * 255);
    const rawA = color.a !== undefined ? color.a : 1.0;
    const a = Math.round(rawA * opacityMultiplier * 1000) / 1000;

    if (a <= 0) return 'transparent';
    if (a >= 1.0) {
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Calculates CSS linear gradient angle from Figma 2x3 affine matrix
 * @param {{ m00: number, m01: number, m02: number, m10: number, m11: number, m12: number }} transform
 * @returns {number} Angle in degrees [0..360)
 */
function getLinearGradientAngle(transform) {
    if (!transform) return 180;
    const rad = Math.atan2(transform.m01 || 0, transform.m00 || 0);
    let deg = Math.round((rad * (180 / Math.PI) + 90 + 360) % 360);
    return deg;
}

/**
 * Formats a Figma gradient paint object into CSS gradient string
 * @param {object} paint
 * @returns {string|null} CSS gradient
 */
function formatGradient(paint) {
    if (!paint || !paint.stops || paint.stops.length < 2) return null;

    const stopStrings = paint.stops.map(s => {
        const col = formatColor(s.color, paint.opacity);
        const pos = Math.round((s.position !== undefined ? s.position : 0) * 100);
        return `${col} ${pos}%`;
    });

    if (paint.type === 'GRADIENT_LINEAR') {
        const angle = getLinearGradientAngle(paint.transform);
        return `linear-gradient(${angle}deg, ${stopStrings.join(', ')})`;
    }

    if (paint.type === 'GRADIENT_RADIAL') {
        return `radial-gradient(circle at center, ${stopStrings.join(', ')})`;
    }

    return null;
}

/**
 * Formats Figma shadow and blur effects into CSS declarations
 * @param {Array<object>} effects
 * @param {object} [options={}]
 * @returns {{ boxShadow: string|null, filter: string|null, backdropFilter: string|null }}
 */
function formatEffects(effects, options = {}) {
    if (!Array.isArray(effects) || effects.length === 0) {
        return { boxShadow: null, filter: null, backdropFilter: null };
    }

    if (options.layoutMode === 'fluid' || options.layoutMode === 'relative') {
        return formatEffectsWithUnits(effects, options, formatColor);
    }

    const shadows = [];
    let filter = null;
    let backdropFilter = null;

    for (const eff of effects) {
        if (!eff || eff.visible === false) continue;

        if (eff.type === 'DROP_SHADOW' || eff.type === 'INNER_SHADOW') {
            const isInset = eff.type === 'INNER_SHADOW';
            const ox = Math.round((eff.offset?.x || 0) * 10) / 10;
            const oy = Math.round((eff.offset?.y || 0) * 10) / 10;
            const blur = Math.round((eff.radius || 0) * 10) / 10;
            const spread = Math.round((eff.spread || 0) * 10) / 10;
            const col = formatColor(eff.color);

            let s = `${ox}px ${oy}px ${blur}px ${spread ? spread + 'px ' : ''}${col}`.trim();
            if (isInset) s = `inset ${s}`;
            shadows.push(s);
        } else if (eff.type === 'FOREGROUND_BLUR') {
            const r = Math.round((eff.radius || 0) * 10) / 10;
            if (r > 0) filter = `blur(${r}px)`;
        } else if (eff.type === 'BACKGROUND_BLUR') {
            const r = Math.round((eff.radius || 0) * 10) / 10;
            if (r > 0) backdropFilter = `blur(${r}px)`;
        }
    }

    return {
        boxShadow: shadows.length > 0 ? shadows.join(', ') : null,
        filter,
        backdropFilter
    };
}

/**
 * Formats Figma image paintFilter adjustments into CSS filter functions
 * (exposure, contrast, saturation/vibrance, temperature, tint, highlights, shadows)
 * @param {object} paintFilter
 * @returns {string|null} CSS filter string
 */
function formatPaintFilter(paintFilter) {
    if (!paintFilter || typeof paintFilter !== 'object') return null;
    const parts = [];

    // 1. Exposure (Brightness) [-1..1]
    const exposure = paintFilter.exposure || 0;
    if (Math.abs(exposure) > 0.01) {
        const bVal = Math.max(0, Math.round((1 + exposure) * 100) / 100);
        parts.push(`brightness(${bVal})`);
    }

    // 2. Contrast [-1..1]
    const contrast = paintFilter.contrast || 0;
    if (Math.abs(contrast) > 0.01) {
        const cVal = Math.max(0, Math.round((1 + contrast) * 100) / 100);
        parts.push(`contrast(${cVal})`);
    }

    // 3. Saturation / Vibrance [-1..1]
    const sat = (paintFilter.vibrance !== undefined ? paintFilter.vibrance : paintFilter.saturation) || 0;
    if (Math.abs(sat) > 0.01) {
        if (sat <= -0.99) {
            parts.push('grayscale(1)');
        } else {
            const sVal = Math.max(0, Math.round((1 + sat) * 100) / 100);
            parts.push(`saturate(${sVal})`);
        }
    }

    // 4. Temperature [-1..1] (Warmth / Coolness)
    const temp = paintFilter.temperature || 0;
    if (Math.abs(temp) > 0.01) {
        if (temp > 0) {
            parts.push(`sepia(${Math.round(temp * 40)}%)`);
        } else {
            parts.push(`hue-rotate(${Math.round(temp * 30)}deg)`);
        }
    }

    // 5. Tint [-1..1]
    const tint = paintFilter.tint || 0;
    if (Math.abs(tint) > 0.01) {
        parts.push(`hue-rotate(${Math.round(tint * 45)}deg)`);
    }

    return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Parses font style and weight names to numeric font-weight and italic style
 * @param {string} fontStyleName E.g. "Bold", "Semi Bold Italic", "Medium", "Light"
 * @returns {{ fontWeight: number, fontStyle: string }}
 */
function parseFontWeightAndStyle(fontStyleName) {
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

function isVectorNodeCheck(n) {
    if (!n) return false;
    return ['VECTOR', 'STAR', 'REGULAR_POLYGON', 'BOOLEAN_OPERATION'].includes(n.type) || (n.vectorData && (!n.children || n.children.length === 0));
}

function isVectorContainerCheck(n) {
    if (!n || !Array.isArray(n.children) || n.children.length === 0) return false;
    if (!['FRAME', 'GROUP', 'INSTANCE', 'SYMBOL', 'BOOLEAN_OPERATION'].includes(n.type)) return false;
    const hasImageFill = Array.isArray(n.fillPaints) && n.fillPaints.some(f => f.type === 'IMAGE' && f.visible !== false);
    if (hasImageFill) return false;
    return n.children.every(c => isVectorNodeCheck(c) || c.type === 'LINE');
}

/**
 * Generates an object of CSS styles for a Figma node
 * @param {object} node
 * @param {object} parentNode
 * @param {Map<string, object>} imageRegistry
 * @param {object} [options={}]
 * @returns {Record<string, string>} CSS styles as key-value pairs
 */
function computeNodeStyles(node, parentNode, imageRegistry, options = {}) {
    const styles = {};

    const layoutMode = options.layoutMode || (options.fluid ? 'fluid' : (options.relative || options.rem ? 'relative' : 'default'));
    const isFluid = layoutMode === 'fluid';
    const isRelative = layoutMode === 'relative';
    const useRelativeUnits = isFluid || isRelative;
    const cw = options.canvasWidth || 1440;
    const ch = options.canvasHeight || 900;

    const fmtSpacing = (val) => {
        if (isFluid) return formatFluidSpacing(val, cw);
        if (isRelative) return toRem(val);
        return `${Math.round(val * 10) / 10}px`;
    };
    const fmtW = (w) => {
        if (isFluid) return formatFluidDimension(w, cw, true);
        if (isRelative) return toRem(w);
        return `${Math.round(w)}px`;
    };
    const fmtH = (h) => {
        if (isFluid) return formatFluidDimension(h, ch, false);
        if (isRelative) return toRem(h);
        return `${Math.round(h)}px`;
    };

    const isSvgVector = node.type === 'VECTOR' || node.type === 'STAR' || node.type === 'REGULAR_POLYGON' || node.type === 'BOOLEAN_OPERATION' || (node.vectorData && (!node.children || node.children.length === 0));

    // 1. Fills & Backgrounds
    if (!isSvgVector && Array.isArray(node.fillPaints) && node.fillPaints.length > 0) {
        const visibleFills = node.fillPaints.filter(f => f.visible !== false);

        if (node.type === 'TEXT') {
            // Text color
            const solid = visibleFills.find(f => f.type === 'SOLID');
            if (solid) {
                styles['color'] = formatColor(solid.color, solid.opacity);
            }
        } else {
            // Backgrounds
            const bgImages = [];
            let bgColor = null;

            for (const fill of visibleFills) {
                if (fill.type === 'SOLID') {
                    bgColor = formatColor(fill.color, fill.opacity);
                } else if (fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL') {
                    const grad = formatGradient(fill);
                    if (grad) bgImages.push(grad);
                } else if (fill.type === 'IMAGE' && fill.image?.hash) {
                    const isNativeImg = (node.type === 'RECTANGLE' || node.type === 'ROUNDED_RECTANGLE') && (!node.children || node.children.length === 0);
                    if (isNativeImg) {
                        styles['object-fit'] = fill.imageScaleMode === 'FIT' ? 'contain' : 'cover';
                    } else {
                        const hashHex = Buffer.from(fill.image.hash).toString('hex').toLowerCase();
                        const imgObj = imageRegistry.get(hashHex);
                        if (imgObj) {
                            const ext = imgObj.ext || getExtensionForMime(imgObj.mime);
                            const prefix = options.cssAssetUrlPrefix || options.assetUrlPrefix || (options.extractCss ? '../img/' : 'img/');
                            const mainFile = imgObj.mainFileName || `${hashHex}.${ext}`;
                            const imgUrl = options.inlineImages !== false
                                ? (imgObj.mainBase64 || imgObj.base64)
                                : `${prefix}${mainFile}`;
                            bgImages.push(`url('${imgUrl}')`);

                            if (fill.imageScaleMode === 'FIT') {
                                styles['background-size'] = 'contain';
                                styles['background-repeat'] = 'no-repeat';
                                styles['background-position'] = 'center';
                            } else if (fill.imageScaleMode === 'TILE') {
                                styles['background-repeat'] = 'repeat';
                            } else {
                                styles['background-size'] = 'cover';
                                styles['background-position'] = 'center';
                            }
                        }
                    }
                }
            }

            if (bgImages.length > 0) {
                styles['background-image'] = bgImages.join(', ');
            }
            if (bgColor && bgColor !== 'transparent') {
                styles['background-color'] = bgColor;
            }
        }
    }

    // 2. Borders & Strokes
    if (!isSvgVector && Array.isArray(node.strokePaints) && node.strokePaints.length > 0 && node.strokeWeight > 0) {
        const solidStroke = node.strokePaints.find(s => s.visible !== false && s.type === 'SOLID');
        if (solidStroke) {
            const strokeColor = formatColor(solidStroke.color, solidStroke.opacity);

            const fmtBorderW = (w) => useRelativeUnits ? (w <= 1 ? '1px' : toRem(w)) : `${w}px`;

            if (node.borderStrokeWeightsIndependent) {
                const topW = node.borderTopWeight || 0;
                const rightW = node.borderRightWeight || 0;
                const bottomW = node.borderBottomWeight || 0;
                const leftW = node.borderLeftWeight || 0;

                if (topW > 0) styles['border-top'] = `${fmtBorderW(topW)} solid ${strokeColor}`;
                if (rightW > 0) styles['border-right'] = `${fmtBorderW(rightW)} solid ${strokeColor}`;
                if (bottomW > 0) styles['border-bottom'] = `${fmtBorderW(bottomW)} solid ${strokeColor}`;
                if (leftW > 0) styles['border-left'] = `${fmtBorderW(leftW)} solid ${strokeColor}`;
            } else {
                styles['border'] = `${fmtBorderW(node.strokeWeight)} solid ${strokeColor}`;
            }
        }
    }

    // 3. Border Radius
    const fmtRadius = (r) => useRelativeUnits ? toRem(r) : `${r}px`;
    if (node.type === 'ELLIPSE') {
        styles['border-radius'] = '50%';
    } else if (node.rectangleCornerRadiiIndependent) {
        const tl = node.rectangleTopLeftCornerRadius || 0;
        const tr = node.rectangleTopRightCornerRadius || 0;
        const br = node.rectangleBottomRightCornerRadius || 0;
        const bl = node.rectangleBottomLeftCornerRadius || 0;
        if (tl || tr || br || bl) {
            if (tl === tr && tr === br && br === bl) {
                styles['border-radius'] = fmtRadius(tl);
            } else {
                styles['border-radius'] = `${fmtRadius(tl)} ${fmtRadius(tr)} ${fmtRadius(br)} ${fmtRadius(bl)}`;
            }
        }
    } else if (node.cornerRadius && node.cornerRadius > 0) {
        styles['border-radius'] = fmtRadius(node.cornerRadius);
    }

    if (isSvgVector) {
        styles['flex-shrink'] = '0';
    }

    // 4. Effects (Shadows & Blurs)
    const eff = formatEffects(node.effects, { layoutMode });
    if (eff.boxShadow) styles['box-shadow'] = eff.boxShadow;
    if (eff.filter) styles['filter'] = eff.filter;
    if (eff.backdropFilter) styles['backdrop-filter'] = eff.backdropFilter;

    // 4b. Image Paint Adjustments (Exposure, Contrast, Saturation, Temperature, Tint)
    let paintFilterStr = null;
    if (Array.isArray(node.fillPaints)) {
        for (const paint of node.fillPaints) {
            if (paint && paint.visible !== false && paint.paintFilter) {
                paintFilterStr = formatPaintFilter(paint.paintFilter);
                if (paintFilterStr) break;
            }
        }
    }
    if (paintFilterStr) {
        styles['filter'] = styles['filter'] ? `${styles['filter']} ${paintFilterStr}` : paintFilterStr;
    }

    // 5. Opacity & Blend Mode
    if (node.opacity !== undefined && node.opacity !== null && node.opacity < 1.0) {
        styles['opacity'] = String(Math.round(node.opacity * 100) / 100);
    }
    if (node.blendMode && node.blendMode !== 'NORMAL') {
        styles['mix-blend-mode'] = node.blendMode.toLowerCase().replace('_', '-');
    }
    if (node.clipsContent || node.frameMaskDisabled === false) {
        styles['overflow'] = 'hidden';
    }

    // 6. Typography
    if (node.type === 'TEXT') {
        if (node.fontSize) {
            if (isFluid) {
                styles['font-size'] = formatFluidFontSize(node.fontSize, cw);
            } else if (isRelative) {
                styles['font-size'] = toRem(node.fontSize);
            } else {
                styles['font-size'] = `${node.fontSize}px`;
            }
        }

        if (node.fontName) {
            if (node.fontName.family) {
                const fam = node.fontName.family;
                if (fam.toLowerCase().includes('mono')) {
                    styles['font-family'] = `'${fam}', ui-monospace, Menlo, Consolas, monospace`;
                } else {
                    styles['font-family'] = `'${fam}', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
                }
            }
            const { fontWeight, fontStyle } = parseFontWeightAndStyle(node.fontName.style);
            if (fontWeight !== 400) styles['font-weight'] = String(fontWeight);
            if (fontStyle !== 'normal') styles['font-style'] = fontStyle;
        }

        if (node.lineHeight) {
            if (typeof node.lineHeight === 'number') {
                const lh = Math.round(node.lineHeight * 10) / 10;
                styles['line-height'] = useRelativeUnits ? toRem(lh) : `${lh}px`;
            } else if (node.lineHeight.units === 'AUTO' || (node.lineHeight.units === 'PERCENT' && Math.round(node.lineHeight.value) === 100)) {
                styles['line-height'] = 'normal';
            } else if (node.lineHeight.units === 'RAW' && typeof node.lineHeight.value === 'number') {
                styles['line-height'] = String(Math.round(node.lineHeight.value * 100) / 100);
            } else if (node.lineHeight.units === 'PERCENT' && typeof node.lineHeight.value === 'number') {
                const val = node.lineHeight.value > 10 ? node.lineHeight.value / 100 : node.lineHeight.value;
                styles['line-height'] = String(Math.round(val * 100) / 100);
            } else if (node.lineHeight.units === 'PIXELS' && typeof node.lineHeight.value === 'number') {
                const lh = Math.round(node.lineHeight.value * 10) / 10;
                styles['line-height'] = useRelativeUnits ? toRem(lh) : `${lh}px`;
            }
        }

        if (node.letterSpacing && typeof node.letterSpacing.value === 'number') {
            if (node.letterSpacing.units === 'PERCENT') {
                const emVal = Math.round((node.letterSpacing.value / 100) * 1000) / 1000;
                styles['letter-spacing'] = `${emVal}em`;
            } else if (node.letterSpacing.units === 'PIXELS') {
                const ls = Math.round(node.letterSpacing.value * 10) / 10;
                styles['letter-spacing'] = useRelativeUnits ? toEm(ls, node.fontSize || 16) : `${ls}px`;
            } else if (node.letterSpacing.units === 'RAW') {
                styles['letter-spacing'] = `${Math.round(node.letterSpacing.value * 1000) / 1000}em`;
            }
        } else if (typeof node.letterSpacing === 'number') {
            const ls = Math.round(node.letterSpacing * 10) / 10;
            styles['letter-spacing'] = useRelativeUnits ? toEm(ls, node.fontSize || 16) : `${ls}px`;
        } else if (typeof node.textTracking === 'number') {
            const emVal = Math.abs(node.textTracking) > 1 ? node.textTracking / 1000 : node.textTracking;
            styles['letter-spacing'] = `${Math.round(emVal * 1000) / 1000}em`;
        }

        if (node.textAlignHorizontal) {
            const align = node.textAlignHorizontal.toLowerCase();
            if (align === 'center' || align === 'right' || align === 'justify') {
                styles['text-align'] = align;
            }
        }

        if (node.textAlignVertical === 'CENTER') {
            styles['display'] = 'flex';
            styles['align-items'] = 'center';
            if (node.textAlignHorizontal === 'CENTER') {
                styles['justify-content'] = 'center';
            } else if (node.textAlignHorizontal === 'RIGHT') {
                styles['justify-content'] = 'flex-end';
            }
        } else if (node.textAlignVertical === 'BOTTOM') {
            styles['display'] = 'flex';
            styles['align-items'] = 'flex-end';
            if (node.textAlignHorizontal === 'CENTER') {
                styles['justify-content'] = 'center';
            } else if (node.textAlignHorizontal === 'RIGHT') {
                styles['justify-content'] = 'flex-end';
            }
        }

        if (node.textCase === 'UPPER') styles['text-transform'] = 'uppercase';
        else if (node.textCase === 'LOWER') styles['text-transform'] = 'lowercase';
        else if (node.textCase === 'TITLE') styles['text-transform'] = 'capitalize';

        if (node.textDecoration === 'UNDERLINE') styles['text-decoration'] = 'underline';
        else if (node.textDecoration === 'STRIKETHROUGH') styles['text-decoration'] = 'line-through';

        if (node.textTruncation === 'ENDING' || node.textAutoResize === 'TRUNCATE') {
            if (node.maxLines && node.maxLines > 1) {
                styles['display'] = '-webkit-box';
                styles['-webkit-line-clamp'] = String(node.maxLines);
                styles['-webkit-box-orient'] = 'vertical';
                styles['overflow'] = 'hidden';
            } else {
                styles['overflow'] = 'hidden';
                styles['text-overflow'] = 'ellipsis';
                styles['white-space'] = 'nowrap';
            }
        }
    }

    // 7. Auto Layout (Container Properties)
    const isAutoLayout = node.stackMode === 'HORIZONTAL' || node.stackMode === 'VERTICAL';
    if (isAutoLayout) {
        const isGridContainer = (layoutMode === 'grid' || node.isGrid || node.layoutType === 'GRID' || Boolean(node.gridColumns)) && Array.isArray(node.children) && node.children.length > 1 && (
            node.stackWrap === 'WRAP' ||
            /grid/i.test(node.name || '') ||
            Boolean(node.gridColumns || node.gridRows) ||
            Boolean(node.stackCounterSpacing && node.stackCounterSpacing > 0 && node.stackWrap === 'WRAP') ||
            Boolean(node.isGrid || node.layoutType === 'GRID')
        );

        if (isGridContainer) {
            styles['display'] = 'grid';
            if (node.gridColumns) {
                styles['grid-template-columns'] = `repeat(${node.gridColumns}, 1fr)`;
            } else if (node.stackMode === 'HORIZONTAL') {
                const childW = node.children[0]?.size?.x || 200;
                const containerW = node.size?.x || cw;
                const approxCols = Math.max(1, Math.min(node.children.length, Math.round(containerW / Math.max(50, childW))));
                styles['grid-template-columns'] = `repeat(${approxCols}, 1fr)`;
            } else {
                styles['grid-template-columns'] = '1fr';
            }
            if (node.gridColumnGap !== undefined || node.gridRowGap !== undefined) {
                if (node.gridColumnGap) styles['column-gap'] = fmtSpacing(node.gridColumnGap);
                if (node.gridRowGap) styles['row-gap'] = fmtSpacing(node.gridRowGap);
                if (!styles['column-gap'] && !styles['row-gap'] && node.stackSpacing) {
                    styles['gap'] = fmtSpacing(node.stackSpacing);
                }
            } else {
                if (node.stackSpacing && node.stackSpacing > 0) {
                    styles['gap'] = fmtSpacing(node.stackSpacing);
                }
                if (node.stackCounterSpacing && node.stackCounterSpacing > 0) {
                    styles['row-gap'] = fmtSpacing(node.stackCounterSpacing);
                    styles['column-gap'] = fmtSpacing(node.stackSpacing || node.stackCounterSpacing);
                }
            }
        } else {
            styles['display'] = 'flex';
            styles['flex-direction'] = node.stackMode === 'HORIZONTAL' ? 'row' : 'column';

            if (node.stackSpacing && node.stackSpacing > 0) {
                styles['gap'] = fmtSpacing(node.stackSpacing);
            }
            if (node.stackWrap === 'WRAP') {
                styles['flex-wrap'] = 'wrap';
                if (node.stackCounterSpacing && node.stackCounterSpacing > 0) {
                    if (node.stackMode === 'HORIZONTAL') styles['row-gap'] = fmtSpacing(node.stackCounterSpacing);
                    else styles['column-gap'] = fmtSpacing(node.stackCounterSpacing);
                }
            }
        }

        // Padding
        const pt = node.stackVerticalPadding || 0;
        const pr = node.stackPaddingRight !== undefined ? node.stackPaddingRight : (node.stackHorizontalPadding || 0);
        const pb = node.stackPaddingBottom !== undefined ? node.stackPaddingBottom : (node.stackVerticalPadding || 0);
        const pl = node.stackHorizontalPadding || 0;

        if (pt || pr || pb || pl) {
            if (pt === pb && pr === pl && pt === pr) {
                styles['padding'] = fmtSpacing(pt);
            } else if (pt === pb && pr === pl) {
                styles['padding'] = `${fmtSpacing(pt)} ${fmtSpacing(pr)}`;
            } else {
                styles['padding'] = `${fmtSpacing(pt)} ${fmtSpacing(pr)} ${fmtSpacing(pb)} ${fmtSpacing(pl)}`;
            }
        }

        // Justify content (primary axis)
        if (node.stackPrimaryAlignItems === 'CENTER') styles['justify-content'] = 'center';
        else if (node.stackPrimaryAlignItems === 'MAX') styles['justify-content'] = 'flex-end';
        else if (node.stackPrimaryAlignItems === 'SPACE_BETWEEN') styles['justify-content'] = 'space-between';

        // Align items (cross axis)
        if (node.stackCounterAlignItems === 'CENTER') styles['align-items'] = 'center';
        else if (node.stackCounterAlignItems === 'MAX') styles['align-items'] = 'flex-end';
        else if (node.stackCounterAlignItems === 'MIN' && node.stackMode === 'HORIZONTAL') styles['align-items'] = 'flex-start';
        else if (node.stackCounterAlignItems === 'BASELINE') styles['align-items'] = 'baseline';
    }

    // 8. Sizing & Position relative to parent
    const parentIsAutoLayout = parentNode && (parentNode.stackMode === 'HORIZONTAL' || parentNode.stackMode === 'VERTICAL');
    const parentHasMask = Boolean(parentNode && Array.isArray(parentNode.children) && parentNode.children.some(c => c.mask === true || c.isMask === true));
    const isAbsolute = node.stackPositioning === 'ABSOLUTE' || (!parentIsAutoLayout && parentNode && !parentHasMask);

    // If current node has absolute children or is a slide/card, or is a container with children and not auto-layout
    const isContainer = ['FRAME', 'GROUP', 'INSTANCE', 'SYMBOL', 'COMPONENT'].includes(node.type);
    const isSlideOrCard = Boolean(node.name && node.name.toLowerCase().split(/\s+/).some(w => w === 'slide' || w === 'card'));
    const hasAbsoluteChildren = Array.isArray(node.children) && node.children.some(c => {
        return c.stackPositioning === 'ABSOLUTE' || (!isAutoLayout && isContainer);
    });
    const hasMaskChild = Array.isArray(node.children) && node.children.some(c => c.mask === true || c.isMask === true);

    if ((hasAbsoluteChildren || isSlideOrCard || (isContainer && !isAutoLayout && node.children?.length > 0)) && !styles['position']) {
        styles['position'] = 'relative';
    }

    // Overflow clipping for frames with corner radius, slides/cards, masks, or clipsContent
    // Note: Synthesized virtual frames should NEVER clip content unless explicitly marked clipsContent
    if (!node.isSynthesized && (node.clipsContent || isSlideOrCard || hasMaskChild || (node.type === 'FRAME' && node.cornerRadius && node.children?.length))) {
        styles['overflow'] = 'hidden';
    }

    if (hasMaskChild && !styles['border-radius']) {
        const maskChild = node.children.find(c => c.mask === true || c.isMask === true);
        if (maskChild) {
            if (maskChild.type === 'ELLIPSE') {
                styles['border-radius'] = '50%';
            } else if (maskChild.cornerRadius) {
                styles['border-radius'] = useRelativeUnits ? toRem(maskChild.cornerRadius) : `${maskChild.cornerRadius}px`;
            }
        }
    }

    // In-flow positioning relative to absolute siblings
    const parentHasAbsoluteChildren = parentNode && Array.isArray(parentNode.children) && parentNode.children.some(c => c.stackPositioning === 'ABSOLUTE');
    if (parentHasAbsoluteChildren && !isAbsolute && !styles['position']) {
        styles['position'] = 'relative';
    }

    if (isAbsolute && parentNode) {
        styles['position'] = 'absolute';
        const posX = Math.round((node.transform?.m02 || 0) * 10) / 10;
        const posY = Math.round((node.transform?.m12 || 0) * 10) / 10;

        if (isFluid) {
            styles['left'] = toVw(posX, cw);
            styles['top'] = toVh(posY, ch);
        } else if (isRelative) {
            styles['left'] = toRem(posX);
            styles['top'] = toRem(posY);
        } else {
            styles['left'] = `${posX}px`;
            styles['top'] = `${posY}px`;
        }

        // Overlay z-index calculation:
        // Overlays and floating elements must be elevated above in-flow content
        if (node.isDecorativeOverlay || node.stackPositioning === 'ABSOLUTE') {
            const childIndex = Array.isArray(parentNode.children) ? parentNode.children.indexOf(node) : 0;
            styles['z-index'] = String(10 + Math.max(0, childIndex));
        }

        if (node.size?.x) styles['width'] = fmtW(node.size.x);
        if (node.size?.y) styles['height'] = fmtH(node.size.y);
    } else if (parentHasMask) {
        // Masked child filling its container
        styles['width'] = '100%';
        styles['height'] = '100%';
        styles['display'] = 'block';
    } else if (parentIsAutoLayout) {
        // Flow child in Auto Layout
        const isGrow = node.stackChildPrimaryGrow === 1.0 || node.layoutGrow === 1.0 || node.layoutGrow === 1;
        if (isGrow) {
            styles['flex'] = '1';
            // In flexbox, text truncation with ellipsis requires min-width: 0 to allow shrinking below content
            if (styles['text-overflow'] === 'ellipsis' || styles['overflow'] === 'hidden') {
                if (parentNode.stackMode === 'HORIZONTAL') {
                    styles['min-width'] = '0';
                }
            }
        }

        const rawAlignSelf = (node.stackChildAlignSelf && node.stackChildAlignSelf !== 'AUTO')
            ? node.stackChildAlignSelf
            : (node.layoutAlign || 'INHERIT');
        if (rawAlignSelf === 'STRETCH') styles['align-self'] = 'stretch';
        else if (rawAlignSelf === 'CENTER') styles['align-self'] = 'center';
        else if (rawAlignSelf === 'MIN') styles['align-self'] = 'flex-start';
        else if (rawAlignSelf === 'MAX') styles['align-self'] = 'flex-end';

        const alignSelfVal = rawAlignSelf;

        const parentIsGrid = (layoutMode === 'grid' || parentNode?.isGrid || parentNode?.layoutType === 'GRID' || Boolean(parentNode?.gridColumns)) && parentNode && (
            parentNode.stackWrap === 'WRAP' ||
            /grid/i.test(parentNode.name || '') ||
            Boolean(parentNode.gridColumns || parentNode.gridRows) ||
            Boolean(parentNode.isGrid || parentNode.layoutType === 'GRID')
        );
        if (parentIsGrid) {
            if (alignSelfVal === 'MIN') {
                styles['justify-self'] = 'start';
            } else if (alignSelfVal === 'CENTER') {
                styles['justify-self'] = 'center';
            } else if (alignSelfVal === 'MAX') {
                styles['justify-self'] = 'end';
            }
        }

        // Child margins
        const mt = node.stackChildMarginTop || 0;
        const mr = node.stackChildMarginRight || 0;
        const mb = node.stackChildMarginBottom || 0;
        const ml = node.stackChildMarginLeft || 0;
        if (mt && !mr && !mb && !ml) {
            styles['margin-top'] = fmtSpacing(mt);
        } else if (!mt && !mr && mb && !ml) {
            styles['margin-bottom'] = fmtSpacing(mb);
        } else if (!mt && mr && !mb && !ml) {
            styles['margin-right'] = fmtSpacing(mr);
        } else if (!mt && !mr && !mb && ml) {
            styles['margin-left'] = fmtSpacing(ml);
        } else if (mt || mr || mb || ml) {
            if (mt === mb && mr === ml && mt === mr) {
                styles['margin'] = fmtSpacing(mt);
            } else if (mt === mb && mr === ml) {
                styles['margin'] = `${fmtSpacing(mt)} ${fmtSpacing(mr)}`;
            } else {
                styles['margin'] = `${fmtSpacing(mt)} ${fmtSpacing(mr)} ${fmtSpacing(mb)} ${fmtSpacing(ml)}`;
            }
        }

        // Sizing in Auto Layout
        const isRow = parentNode.stackMode === 'HORIZONTAL';
        const isShapeOrImage = ['ELLIPSE', 'RECTANGLE', 'VECTOR', 'REGULAR_POLYGON', 'STAR', 'LINE'].includes(node.type);
        const isIconContainer = isVectorContainerCheck(node);
        const isButton = Boolean(node.isButton || (/^(btn|button)/i.test(node.name || '')));

        if (isButton) {
            styles['cursor'] = 'pointer';
        }

        const nodeIsAutoLayout = node.stackMode === 'HORIZONTAL' || node.stackMode === 'VERTICAL';
        let nodeHorizontalSizing = null;
        let nodeVerticalSizing = null;

        if (nodeIsAutoLayout) {
            const isHorizontal = node.stackMode === 'HORIZONTAL';
            const primaryIsFixed = node.stackPrimarySizing === 'FIXED';
            const counterIsHug = node.stackCounterSizing === 'RESIZE_TO_FIT' || node.stackCounterSizing === 'RESIZE_TO_FIT_WITH_IMPLICIT_SIZE';
            const counterIsFixed = !counterIsHug;

            nodeHorizontalSizing = isHorizontal ? (primaryIsFixed ? 'FIXED' : 'RESIZE_TO_FIT') : (counterIsFixed ? 'FIXED' : 'RESIZE_TO_FIT');
            nodeVerticalSizing = isHorizontal ? (counterIsFixed ? 'FIXED' : 'RESIZE_TO_FIT') : (primaryIsFixed ? 'FIXED' : 'RESIZE_TO_FIT');
        }

        let isFixedX = false;
        let isFixedY = false;

        if (nodeIsAutoLayout) {
            isFixedX = (nodeHorizontalSizing === 'FIXED');
            isFixedY = (nodeVerticalSizing === 'FIXED');
        } else if (isIconContainer) {
            isFixedX = true;
            isFixedY = true;
        } else if (isShapeOrImage) {
            isFixedX = true;
            isFixedY = true;
        } else if (node.type === 'TEXT') {
            isFixedX = (node.textAutoResize === 'HEIGHT' || node.textAutoResize === 'NONE');
            isFixedY = (node.textAutoResize === 'NONE');
        } else {
            // Non-auto-layout frame, instance, or group inside Auto Layout
            isFixedX = true;
            isFixedY = true;
        }

        // Special handling for button-like elements, synthesized containers, and equal-dimension groups
        if (isButton) {
            isFixedX = false;
            isFixedY = false;
        }

        if (node.isSynthesized) {
            isFixedX = false;
            isFixedY = false;
        }

        if (node.isEqualWidthGroup || node.layoutGrow === 1) {
            isFixedX = false;
            if (!styles['flex'] && !styles['flex-grow']) {
                styles['flex'] = '1';
                styles['min-width'] = '0';
            }
        }

        if (node.isEqualHeightGroup) {
            isFixedY = false;
        }

        // In a vertical flex container, check if child width stretches across container content
        if (!isRow && parentNode && parentNode.size?.x) {
            const padL = parentNode.stackPaddingLeft || parentNode.stackHorizontalPadding || 0;
            const padR = parentNode.stackPaddingRight || parentNode.stackHorizontalPadding || 0;
            const contentW = parentNode.size.x - padL - padR;
            if (contentW > 0 && node.size?.x && Math.abs(node.size.x - contentW) <= 6) {
                isFixedX = false;
            }
        }

        // If align-self is stretch, cross-axis is not fixed
        if (styles['align-self'] === 'stretch') {
            if (isRow) {
                isFixedY = false;
            } else {
                isFixedX = false;
            }
        }

        // Primary & counter axis sizing
        if (parentIsGrid) {
            styles['width'] = '100%';
            if (isFixedY && node.size?.y && !node.isEqualHeightGroup && !isButton && !node.isSynthesized) {
                styles['height'] = fmtH(node.size.y);
            }
        } else if (isRow) {
            // Primary axis: Width
            if (!styles['flex'] && !styles['flex-grow']) {
                if (isFixedX && node.size?.x && !isButton && !node.isSynthesized) {
                    styles['width'] = fmtW(node.size.x);
                    styles['flex-shrink'] = '0';
                }
            }
            // Counter axis: Height
            if (styles['align-self'] !== 'stretch' && !node.isEqualHeightGroup && !isButton && !node.isSynthesized) {
                if (isFixedY && node.size?.y) {
                    styles['height'] = fmtH(node.size.y);
                }
            }
        } else {
            // Primary axis: Height
            if (!styles['flex'] && !styles['flex-grow']) {
                if (isFixedY && node.size?.y && !node.isEqualHeightGroup && !isButton && !node.isSynthesized) {
                    styles['height'] = fmtH(node.size.y);
                    styles['flex-shrink'] = '0';
                }
            }
            // Counter axis: Width
            if (styles['align-self'] !== 'stretch' && !node.isEqualWidthGroup && !isButton && !node.isSynthesized) {
                if (isFixedX && node.size?.x) {
                    styles['width'] = fmtW(node.size.x);
                }
            }
        }
    } else {
        // Root element or independent artboard
        if (isFluid) {
            styles['width'] = '100vw';
            styles['min-height'] = '100dvh';
            styles['max-width'] = '100%';
            styles['box-sizing'] = 'border-box';
            styles['margin'] = '0 auto';
            styles['position'] = 'relative';
        } else if (isRelative) {
            styles['width'] = '100vw';
            styles['min-height'] = '100vh';
            styles['max-width'] = '100%';
            styles['box-sizing'] = 'border-box';
            styles['margin'] = '0 auto';
            styles['position'] = 'relative';
        } else {
            styles['width'] = '100%';
            if (node.size?.x) styles['max-width'] = `${Math.round(node.size.x)}px`;
            if (node.size?.y) styles['min-height'] = `${Math.round(node.size.y)}px`;
            styles['box-sizing'] = 'border-box';
            styles['margin'] = '0 auto';
            if (node.children && node.children.length > 0) {
                styles['position'] = 'relative';
            }
        }
    }

    // 9. Element-specific normalizations
    const nodeName = node.name || '';
    const lowerName = nodeName.toLowerCase().trim();

    if (nodeName.startsWith('Input[') && nodeName.endsWith(']')) {
        styles['outline'] = 'none';
    } else if ((nodeName === 'Checkbox' || nodeName === 'Radio') && node.size?.x <= 24) {
        styles['cursor'] = 'pointer';
    } else if (lowerName.startsWith('btn') || lowerName === 'button') {
        if (!styles['border']) styles['border'] = 'none';
        styles['cursor'] = 'pointer';
    }

    return styles;
}

/**
 * Converts a style object into an inline CSS style attribute string
 * @param {Record<string, string>} styleObj
 * @returns {string} E.g. "display: flex; gap: 16px;"
 */
function toStyleString(styleObj) {
    if (!styleObj) return '';
    return Object.entries(styleObj)
        .filter(([_, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}: ${String(v).replace(/"/g, "'")};`)
        .join(' ');
}

module.exports = {
    getExtensionForMime,
    formatColor,
    getLinearGradientAngle,
    formatGradient,
    formatEffects,
    formatPaintFilter,
    parseFontWeightAndStyle,
    computeNodeStyles,
    toStyleString
};
