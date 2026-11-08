// src/decompiler/css/index.js
const {
    toRem,
    toEm,
    toVw,
    toVh,
    formatFluidFontSize,
    formatFluidSpacing,
    formatFluidDimension,
    formatEffectsWithUnits
} = require("../units");

const {
    getExtensionForMime,
    formatColor
} = require("./color-formatter");

const {
    getLinearGradientAngle,
    parseTransformMatrix,
    getNodeTransformInfo,
    formatGradient
} = require("./gradient-formatter");

const {
    formatEffects,
    formatPaintFilter
} = require("./effects-formatter");

const {
    parseFontWeightAndStyle
} = require("./typography-formatter");

const {
    hasExplicitMaskTag,
    parseGridAxisCount,
    isImageNode,
    isVectorNode,
    isVectorContainer,
    resolveSmartAbsoluteAnchors
} = require("./layout-styles");

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

    const isSvgVector = node.type === 'VECTOR' || node.type === 'STAR' || node.type === 'REGULAR_POLYGON' || node.type === 'BOOLEAN_OPERATION' || (node.vectorData && (!node.children || node.children.length === 0) && node.type !== 'RECTANGLE' && node.type !== 'ROUNDED_RECTANGLE' && node.type !== 'ELLIPSE');

    // 1. Fills & Backgrounds
    if (!isSvgVector && Array.isArray(node.fillPaints) && node.fillPaints.length > 0) {
        const visibleFills = node.fillPaints.filter(f => f.visible !== false);

        if (node.type === 'TEXT') {
            // Text color & gradients (top-most visible fill in Figma paint stack takes precedence)
            const topFill = visibleFills[visibleFills.length - 1];
            const gradient = (topFill && (topFill.type === 'GRADIENT_LINEAR' || topFill.type === 'GRADIENT_RADIAL'))
                ? topFill
                : [...visibleFills].reverse().find(f => f.type === 'GRADIENT_LINEAR' || f.type === 'GRADIENT_RADIAL');
            const solid = (topFill && topFill.type === 'SOLID')
                ? topFill
                : [...visibleFills].reverse().find(f => f.type === 'SOLID');
            if (gradient && (!topFill || topFill.type !== 'SOLID')) {
                const gradCss = formatGradient(gradient);
                if (gradCss) {
                    const firstStop = gradient.stops?.[0];
                    if (firstStop) {
                        styles['color'] = formatColor(firstStop.color, gradient.opacity ?? 1);
                    }
                    styles['background'] = gradCss;
                    styles['-webkit-background-clip'] = 'text';
                    styles['-webkit-text-fill-color'] = 'transparent';
                    styles['background-clip'] = 'text';
                }
            } else if (solid) {
                styles['color'] = formatColor(solid.color, solid.opacity);
            }
        } else {
            // Backgrounds
            const bgImages = [];
            const bgBlendModes = [];
            let bgColor = null;

            const hasImageFill = visibleFills.some(f => f.type === 'IMAGE' && f.image?.hash);
            const isNativeImg = (node.isCollapsedGraphicRoot || ((node.type === 'RECTANGLE' || node.type === 'ROUNDED_RECTANGLE') && hasImageFill)) && (!node.children || node.children.length === 0);
            const isFillsBaked = Boolean(node.isImageFillsBaked || node.isMaskBaked);

            for (const fill of visibleFills) {
                const isNormalBlend = !fill.blendMode || fill.blendMode === 'NORMAL' || fill.blendMode === 'PASS_THROUGH';
                const fillBlendCss = isNormalBlend ? 'normal' : fill.blendMode.toLowerCase().replace('_', '-');
                if (fill.type === 'SOLID') {
                    if (!isFillsBaked && !isNativeImg) {
                        const isOpaqueSolid = isNormalBlend && (fill.opacity ?? 1) >= 0.999 && (fill.color?.a ?? 1) >= 0.999;
                        if (isOpaqueSolid) {
                            bgImages.length = 0;
                            bgBlendModes.length = 0;
                        }
                        bgColor = formatColor(fill.color, fill.opacity);
                    }
                } else if (fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL') {
                    if (!isFillsBaked && !isNativeImg) {
                        const isOpaqueGrad = isNormalBlend && (fill.opacity ?? 1) >= 0.999 &&
                            Array.isArray(fill.stops) && fill.stops.length > 0 &&
                            fill.stops.every(s => (s.color?.a ?? 1) >= 0.999);
                        if (isOpaqueGrad) {
                            bgImages.length = 0;
                            bgBlendModes.length = 0;
                            bgColor = null;
                        }
                        const grad = formatGradient(fill);
                        if (grad) {
                            bgImages.push(grad);
                            bgBlendModes.push(fillBlendCss);
                        }
                    }
                } else if (fill.type === 'IMAGE' && fill.image?.hash) {
                    if (isNativeImg) {
                        styles['object-fit'] = fill.imageScaleMode === 'FIT' ? 'contain' : 'cover';
                    } else {
                        const hashHex = (typeof fill.image.hash === 'string')
                            ? fill.image.hash.toLowerCase()
                            : Buffer.from(fill.image.hash).toString('hex').toLowerCase();
                        const imgObj = (imageRegistry && typeof imageRegistry.get === 'function') ? imageRegistry.get(hashHex) : null;
                        if (imgObj) {
                            const ext = imgObj.ext || getExtensionForMime(imgObj.mime);
                            const prefix = options.cssAssetUrlPrefix || options.assetUrlPrefix || (options.extractCss ? '../img/' : 'img/');
                            const mainFile = imgObj.mainFileName || `${hashHex}.${ext}`;
                            const imgUrl = options.inlineImages !== false
                                ? (imgObj.mainBase64 || imgObj.base64)
                                : `${prefix}${mainFile}`;
                            bgImages.push(`url('${imgUrl}')`);
                            bgBlendModes.push(fillBlendCss);

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

            if (bgImages.length > 0 && !(isNativeImg && hasImageFill)) {
                styles['background-image'] = bgImages.slice().reverse().join(', ');
                if (bgColor && bgColor !== 'transparent') {
                    if (bgBlendModes.some(m => m !== 'normal')) {
                        styles['background-blend-mode'] = bgBlendModes.slice().reverse().join(', ');
                    }
                } else {
                    if (bgImages.length > 1 && bgBlendModes.slice(1).some(m => m !== 'normal')) {
                        styles['background-blend-mode'] = [...bgBlendModes.slice(1).reverse(), 'normal'].join(', ');
                    }
                    if (bgBlendModes[0] && bgBlendModes[0] !== 'normal' && (!node.children || node.children.length === 0) && (!node.blendMode || node.blendMode === 'NORMAL' || node.blendMode === 'PASS_THROUGH')) {
                        styles['mix-blend-mode'] = bgBlendModes[0];
                    }
                }
            }
            if (bgColor && bgColor !== 'transparent' && !node.isMaskBaked && !node.isImageFillsBaked && !(isNativeImg && hasImageFill)) {
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
    if (node.type === 'TEXT') {
        if (eff.textShadow) styles['text-shadow'] = eff.textShadow;
    } else if (eff.boxShadow) {
        styles['box-shadow'] = eff.boxShadow;
    }
    if (eff.filter) styles['filter'] = eff.filter;
    if (eff.backdropFilter) styles['backdrop-filter'] = eff.backdropFilter;

    // 4b. Image Paint Adjustments (Exposure, Contrast, Saturation, Temperature, Tint)
    let paintFilterStr = null;
    const shouldOmitPaintFilter = Boolean(node.isImageFillsBaked || node.isMaskBaked);
    if (!shouldOmitPaintFilter && Array.isArray(node.fillPaints)) {
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
    if (node.blendMode && node.blendMode !== 'NORMAL' && node.blendMode !== 'PASS_THROUGH' && !node.isMaskBaked && !node.isMultiplyBaked) {
        styles['mix-blend-mode'] = node.blendMode.toLowerCase().replace('_', '-');
    }
    const hasLuminosity = node.blendMode === 'LUMINOSITY' || (Array.isArray(node.fillPaints) && node.fillPaints.some(f => f.visible !== false && f.blendMode === 'LUMINOSITY'));
    if (hasLuminosity) {
        styles['filter'] = styles['filter'] ? `${styles['filter']} grayscale(1)` : 'grayscale(1)';
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

        if (node.leadingTrim === 'CAP_HEIGHT') {
            styles['text-box-trim'] = 'trim-both';
            styles['text-box-edge'] = 'cap alphabetic';
        }

        const hasListLines = Array.isArray(node.textData?.lines) && node.textData.lines.length > 0 &&
            node.textData.lines.every(l => l.lineType === 'ORDERED_LIST' || l.lineType === 'UNORDERED_LIST');
        if (hasListLines) {
            const isOrderedList = node.textData.lines.every(l => l.lineType === 'ORDERED_LIST');
            styles['list-style-type'] = isOrderedList ? 'decimal' : 'disc';
            styles['margin'] = '0';
            styles['padding-left'] = '20px';
            if (node.listSpacing && node.listSpacing > 0) {
                styles['display'] = 'flex';
                styles['flex-direction'] = 'column';
                styles['gap'] = `${Math.round(node.listSpacing)}px`;
            }
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
        } else if (node.textAutoResize === 'WIDTH_AND_HEIGHT') {
            const rawChars = String(node.textData?.characters ?? node.characters ?? '');
            const isSingleLine = !rawChars.includes('\n') && (!node.size?.y || !node.fontSize || node.size.y <= node.fontSize * 1.85);
            if (isSingleLine && parentNode && parentNode.size?.x && node.size?.x) {
                const pLeft = parentNode.stackHorizontalPadding ?? parentNode.paddingLeft ?? 0;
                const pRight = parentNode.stackPaddingRight ?? parentNode.stackHorizontalPadding ?? parentNode.paddingRight ?? 0;
                const parentInnerW = parentNode.size.x - pLeft - pRight;
                if (parentInnerW > 0 && node.size.x >= parentInnerW - 4) {
                    styles['white-space'] = 'nowrap';
                }
            }
        }
    }

    // 7. Auto Layout (Container Properties)
    const isAutoLayout = !node.isCollapsedGraphicRoot && (node.stackMode === 'HORIZONTAL' || node.stackMode === 'VERTICAL');
    if (isAutoLayout) {
        const numGridCols = parseGridAxisCount(node.gridColumns);
        const numGridRows = parseGridAxisCount(node.gridRows);
        const isGridContainer = (layoutMode === 'grid' || node.isGrid || node.layoutType === 'GRID' || Boolean(numGridCols)) && Array.isArray(node.children) && node.children.length > 1 && (
            node.stackWrap === 'WRAP' ||
            /grid/i.test(node.name || '') ||
            Boolean(numGridCols || numGridRows) ||
            Boolean(node.stackCounterSpacing && node.stackCounterSpacing > 0 && node.stackWrap === 'WRAP') ||
            Boolean(node.isGrid || node.layoutType === 'GRID')
        );

        if (isGridContainer) {
            styles['display'] = 'grid';
            if (numGridCols && numGridCols > 0) {
                styles['grid-template-columns'] = `repeat(${numGridCols}, 1fr)`;
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
        const pt = node.stackPaddingTop !== undefined ? node.stackPaddingTop : (node.stackVerticalPadding || 0);
        const pl = node.stackPaddingLeft !== undefined ? node.stackPaddingLeft : (node.stackHorizontalPadding || 0);

        let pb = node.stackPaddingBottom !== undefined ? node.stackPaddingBottom : (node.stackVerticalPadding || 0);
        if (node.stackPaddingBottom === undefined && node.stackVerticalPadding && Array.isArray(node.children) && node.size?.y) {
            const inFlowChildren = node.children.filter(c => c.stackPositioning !== 'ABSOLUTE' && !c.isDecorativeOverlay && !c.isDecorativeUnderlay && c.visible !== false && c.size?.y);
            if (inFlowChildren.length > 0) {
                const minTop = Math.min(...inFlowChildren.map(c => c.transform?.m12 || 0));
                const maxBottom = Math.max(...inFlowChildren.map(c => (c.transform?.m12 || 0) + (c.size?.y || 0)));
                const actualBottomSpace = Math.round(node.size.y - maxBottom);
                if (Math.abs(minTop - pt) <= 1 && Math.abs(actualBottomSpace) <= 1) {
                    pb = 0;
                }
            }
        }

        let pr = node.stackPaddingRight !== undefined ? node.stackPaddingRight : (node.stackHorizontalPadding || 0);
        if (node.stackPaddingRight === undefined && node.stackHorizontalPadding && Array.isArray(node.children) && node.size?.x) {
            const inFlowChildren = node.children.filter(c => c.stackPositioning !== 'ABSOLUTE' && !c.isDecorativeOverlay && !c.isDecorativeUnderlay && c.visible !== false && c.size?.x);
            if (inFlowChildren.length > 0) {
                const minLeft = Math.min(...inFlowChildren.map(c => c.transform?.m02 || 0));
                const maxRight = Math.max(...inFlowChildren.map(c => (c.transform?.m02 || 0) + (c.size?.x || 0)));
                const actualRightSpace = Math.round(node.size.x - maxRight);
                if (Math.abs(minLeft - pl) <= 1 && Math.abs(actualRightSpace) <= 1) {
                    pr = 0;
                }
            }
        }

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
        const primaryAlign = node.stackPrimaryAlignItems || node.primaryAxisAlignItems;
        if (primaryAlign === 'CENTER') styles['justify-content'] = 'center';
        else if (primaryAlign === 'MAX') styles['justify-content'] = 'flex-end';
        else if (primaryAlign === 'SPACE_BETWEEN' || primaryAlign === 'SPACE_EVENLY') styles['justify-content'] = 'space-between';
        else if (primaryAlign === 'SPACE_AROUND') styles['justify-content'] = 'space-around';
        else if (primaryAlign === 'SPACE_EVENLY_CSS') styles['justify-content'] = 'space-evenly';

        // Align items (cross axis)
        if (node.stackCounterAlignItems === 'CENTER') styles['align-items'] = 'center';
        else if (node.stackCounterAlignItems === 'MAX') styles['align-items'] = 'flex-end';
        else if (node.stackCounterAlignItems === 'MIN') styles['align-items'] = 'flex-start';
        else if (node.stackCounterAlignItems === 'BASELINE') styles['align-items'] = 'baseline';
    }

    // 8. Sizing & Position relative to parent
    const parentIsAutoLayout = parentNode && (parentNode.stackMode === 'HORIZONTAL' || parentNode.stackMode === 'VERTICAL');
    const parentHasMask = Boolean(parentNode && (
        (parentNode.name && /mask(\s*group)?/i.test(parentNode.name)) ||
        parentNode.mask === true ||
        parentNode.isMask === true ||
        (Array.isArray(parentNode.children) && parentNode.children.some(c => c.mask === true || c.isMask === true))
    ));

    const nodeTransformInfo = getNodeTransformInfo(node);
    const hasOffset = Math.abs(node.transform?.m02 || 0) >= 0.5 || Math.abs(node.transform?.m12 || 0) >= 0.5;
    const hasTransform = Boolean(nodeTransformInfo);
    const isMaskFillChild = parentHasMask && !hasOffset && !hasTransform && node.stackPositioning !== 'ABSOLUTE';
    const isAbsolute = node.stackPositioning === 'ABSOLUTE' || (!parentIsAutoLayout && parentNode && !isMaskFillChild);

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

    const siblings = Array.isArray(parentNode?.children)
        ? parentNode.children.filter(c => c && c.visible !== false && c.mask !== true && c.isMask !== true)
        : [];
    const childIndex = siblings.indexOf(node);
    const inFlowIndices = [];
    siblings.forEach((c, i) => {
        const isChildAbs = c.stackPositioning === 'ABSOLUTE' || c.isDecorativeOverlay || c.isDecorativeUnderlay || c.isBleedingOverlay || (!parentIsAutoLayout && !parentHasMask);
        if (!isChildAbs) inFlowIndices.push(i);
    });
    const hasInFlow = inFlowIndices.length > 0;
    const minInFlow = hasInFlow ? inFlowIndices[0] : -1;
    const maxInFlow = hasInFlow ? inFlowIndices[inFlowIndices.length - 1] : -1;

    // Overflow clipping for frames with corner radius, slides/cards, masks, or clipsContent
    // Note: Synthesized virtual frames and Figma Groups (resizeToFit === true) should NEVER clip content unless explicitly a mask
    // In Figma, frameMaskDisabled === true means "Clip Content" was explicitly unchecked by the user!
    const isMaskNode = hasMaskChild || (node.name && /mask(\s*group)?/i.test(node.name)) || node.mask === true || node.isMask === true;
    const isClipExplicitlyDisabled = node.frameMaskDisabled === true || (node.resizeToFit === true && !isMaskNode);
    const isUnderlayNode = Boolean(
        node.isDecorativeUnderlay ||
        parentNode?.isDecorativeUnderlay ||
        (isAbsolute && hasInFlow && childIndex >= 0 && childIndex < minInFlow)
    );
    if (isUnderlayNode) {
        node.isDecorativeUnderlay = true;
    }

    if (!isClipExplicitlyDisabled && !isUnderlayNode && !node.isSynthesized && (node.clipsContent || node.frameMaskDisabled === false || isSlideOrCard || isMaskNode || (node.type === 'FRAME' && (node.cornerRadius || node.rectangleCornerRadiiIndependent) && node.children?.length))) {
        styles['overflow'] = 'hidden';
    } else if (isMaskNode && !isUnderlayNode && !node.isSynthesized) {
        styles['overflow'] = 'hidden';
    }

    if (hasMaskChild) {
        const maskChild = node.children.find(c => c.mask === true || c.isMask === true);
        const hasExplicitTag = hasExplicitMaskTag(node) || hasExplicitMaskTag(maskChild);

        if (maskChild) {
            // 1. Shape border-radius
            if (!styles['border-radius']) {
                if (maskChild.type === 'ELLIPSE') {
                    styles['border-radius'] = '50%';
                } else if (maskChild.cornerRadius) {
                    styles['border-radius'] = useRelativeUnits ? toRem(maskChild.cornerRadius) : `${maskChild.cornerRadius}px`;
                }
            }

            // 2. CSS mask-image is ONLY generated when explicitly requested via [mask] / [маска] / #mask tag.
            // Automatic Figma names like "Mask group" or untagged groups have masks baked directly into image assets.
            if (hasExplicitTag) {
                // Gradient masks (GRADIENT_RADIAL, GRADIENT_LINEAR)
                const gradPaint = Array.isArray(maskChild.fillPaints) && maskChild.fillPaints.find(f => f.visible !== false && (f.type === 'GRADIENT_RADIAL' || f.type === 'GRADIENT_LINEAR'));
                if (gradPaint) {
                    const gradCss = formatGradient(gradPaint);
                    if (gradCss) {
                        styles['-webkit-mask-image'] = gradCss;
                        styles['mask-image'] = gradCss;
                        styles['-webkit-mask-size'] = '100% 100%';
                        styles['mask-size'] = '100% 100%';
                        styles['-webkit-mask-repeat'] = 'no-repeat';
                        styles['mask-repeat'] = 'no-repeat';
                    }
                }

                // Image masks
                const imgPaint = Array.isArray(maskChild.fillPaints) && maskChild.fillPaints.find(f => f.visible !== false && f.type === 'IMAGE' && f.image?.hash);
                if (imgPaint) {
                    const hashHex = (typeof imgPaint.image.hash === 'string')
                        ? imgPaint.image.hash.toLowerCase()
                        : Buffer.from(imgPaint.image.hash).toString('hex').toLowerCase();
                    const imgObj = imageRegistry?.get(hashHex);
                    if (imgObj) {
                        const ext = imgObj.ext || getExtensionForMime(imgObj.mime);
                        const prefix = options.cssAssetUrlPrefix || options.assetUrlPrefix || (options.extractCss ? '../img/' : 'img/');
                        const mainFile = imgObj.mainFileName || `${hashHex}.${ext}`;
                        const imgUrl = options.inlineImages !== false
                            ? (imgObj.mainBase64 || imgObj.base64)
                            : `${prefix}${mainFile}`;
                        styles['-webkit-mask-image'] = `url('${imgUrl}')`;
                        styles['mask-image'] = `url('${imgUrl}')`;
                        styles['-webkit-mask-size'] = '100% 100%';
                        styles['mask-size'] = '100% 100%';
                        styles['-webkit-mask-repeat'] = 'no-repeat';
                        styles['mask-repeat'] = 'no-repeat';
                    }
                }
            }

            styles['overflow'] = 'hidden';
        }
    }

    // In-flow positioning relative to absolute siblings (or preceding siblings with unclipped bleeding absolute children)
    const parentHasAbsoluteChildren = parentNode && Array.isArray(parentNode.children) && parentNode.children.some(c => c.stackPositioning === 'ABSOLUTE' || c.isDecorativeUnderlay || c.isDecorativeOverlay);
    const precedingSiblingHasBleedingAbsoluteChild = !isAbsolute && childIndex > 0 && siblings.slice(0, childIndex).some((c, ci) => {
        if (!Array.isArray(c.children) || c.children.length === 0) return false;
        if (c.clipsContent || c.frameMaskDisabled === false) return false;
        const cw2 = c.size?.x || 0;
        const ch2 = c.size?.y || 0;
        const cTop = c.transform?.m12;
        const thisTop = node.transform?.m12;
        return c.children.some(gc => {
            const isGcAbs = gc.stackPositioning === 'ABSOLUTE' || gc.isDecorativeOverlay || gc.isDecorativeUnderlay;
            if (!isGcAbs) return false;
            const gx = gc.transform?.m02 || 0;
            const gy = gc.transform?.m12 || 0;
            const gw = gc.size?.x || 0;
            const gh = gc.size?.y || 0;
            const isBleeding = gx < -1 || gy < -1 || (cw2 > 0 && gx + gw > cw2 + 1) || (ch2 > 0 && gy + gh > ch2 + 1);
            if (!isBleeding) return false;
            if (typeof cTop === 'number' && typeof thisTop === 'number') {
                const gcBottom = cTop + gy + gh;
                return gcBottom > thisTop + 1;
            }
            return ci === childIndex - 1 && ch2 > 0 && (gy + gh > ch2 + 1);
        });
    });
    if ((parentHasAbsoluteChildren || precedingSiblingHasBleedingAbsoluteChild) && !isAbsolute) {
        if (!styles['position']) {
            styles['position'] = 'relative';
        }
        const hasUnderlay = precedingSiblingHasBleedingAbsoluteChild || siblings.some((c, i) => (c.isDecorativeUnderlay || i < minInFlow) && (c.stackPositioning === 'ABSOLUTE' || c.isDecorativeOverlay || c.isDecorativeUnderlay));
        if (hasUnderlay && !styles['z-index']) {
            styles['z-index'] = '1';
        }
    }

    if (isAbsolute && parentNode) {
        styles['position'] = 'absolute';
        const {
            horizontalProp,
            horizontalVal,
            verticalProp,
            verticalVal
        } = resolveSmartAbsoluteAnchors(node, parentNode, { parentHasMask, hasTransform });

        if (isFluid) {
            styles[horizontalProp] = toVw(horizontalVal, cw);
            styles[verticalProp] = toVh(verticalVal, ch);
        } else if (isRelative) {
            styles[horizontalProp] = toRem(horizontalVal);
            styles[verticalProp] = toRem(verticalVal);
        } else {
            styles[horizontalProp] = `${horizontalVal}px`;
            styles[verticalProp] = `${verticalVal}px`;
        }

        // Layer z-index calculation:
        // Correctly calculate layer in Figma relative to other elements
        if (node.isDecorativeOverlay || node.isDecorativeUnderlay || node.stackPositioning === 'ABSOLUTE' || isAbsolute) {
            const isUnderlay = Boolean(node.isDecorativeUnderlay || parentNode?.isDecorativeUnderlay);
            if (isUnderlay || (hasInFlow && childIndex < minInFlow)) {
                // Underlay / Background: placed behind in-flow content in Figma.
                // In DOM, underlays are ordered before in-flow content, and in-flow has z-index: 1.
                // By omitting z-index (z-index: auto), underlays stay under in-flow content (level 0 vs level 1)
                // without establishing an isolating Stacking Context. This allows mix-blend-mode
                // (luminosity, soft-light, screen, etc.) on or inside underlays to blend with the parent backdrop!
            } else if (!hasInFlow) {
                // Freeform / non-auto-layout canvas: layer index based on Figma layer order (1, 2, 3...)
                // For bottom layer (childIndex === 0) or pass-through groups with blended descendants,
                // leave as auto to prevent isolating stacking context
                const hasBlendedChild = (function checkBlend(n) {
                    if (!n || !Array.isArray(n.children)) return false;
                    for (const c of n.children) {
                        if (!c || c.visible === false) continue;
                        if (c.blendMode && c.blendMode !== 'NORMAL' && c.blendMode !== 'PASS_THROUGH') return true;
                        if (Array.isArray(c.fillPaints) && c.fillPaints.some(f => f.visible !== false && f.blendMode && f.blendMode !== 'NORMAL' && f.blendMode !== 'PASS_THROUGH')) return true;
                        if (checkBlend(c)) return true;
                    }
                    return false;
                })(node);
                const isPassThroughBlend = (!node.blendMode || node.blendMode === 'NORMAL' || node.blendMode === 'PASS_THROUGH') && hasBlendedChild;
                if (childIndex > 0 && !isPassThroughBlend) {
                    styles['z-index'] = String(childIndex + 1);
                }
            } else if (childIndex > maxInFlow) {
                // Overlay: placed above in-flow content in Figma
                styles['z-index'] = String(10 + Math.max(0, childIndex));
            } else if (childIndex > 0) {
                styles['z-index'] = String(childIndex);
            }
        }

        // Add pointer-events: none for images and vector decorations that should not intercept clicks
        const isImg = isImageNode(node) || Boolean(node.isCollapsedGraphicRoot) || (node.type === 'VECTOR' && (!node.children || node.children.length === 0));
        if (isImg && !node.isButton && !node.prototypeInteractions?.length) {
            styles['pointer-events'] = 'none';
        }
        if (node.isCollapsedGraphicRoot) {
            styles['object-fit'] = 'contain';
        }

        if (node.size?.x) styles['width'] = fmtW(node.size.x);
        if (node.size?.y) styles['height'] = fmtH(node.size.y);
        if ((isImg || isSvgVector) && styles['width']) {
            styles['max-width'] = 'none';
        }
    } else if (parentHasMask) {
        // Masked child filling its container
        styles['width'] = '100%';
        styles['height'] = '100%';
        styles['display'] = 'block';
        const isDirectImg = node.type === 'IMAGE' || (Array.isArray(node.fillPaints) && node.fillPaints.some(f => f.type === 'IMAGE' && f.visible !== false) && (!node.children || node.children.length === 0));
        if (isDirectImg && !styles['object-fit']) {
            styles['object-fit'] = 'cover';
        }
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

        const parentGridCols = parseGridAxisCount(parentNode?.gridColumns);
        const parentGridRows = parseGridAxisCount(parentNode?.gridRows);
        const parentIsGrid = (layoutMode === 'grid' || parentNode?.isGrid || parentNode?.layoutType === 'GRID' || Boolean(parentGridCols)) && parentNode && (
            parentNode.stackWrap === 'WRAP' ||
            /grid/i.test(parentNode.name || '') ||
            Boolean(parentGridCols || parentGridRows) ||
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
        const isIconContainer = isVectorContainer(node);
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

        // Cross-axis Hug contents: prevent flexbox default stretch when child hugs content in Figma
        if (!styles['align-self'] && rawAlignSelf !== 'STRETCH') {
            if (!isRow) {
                // In vertical container, cross-axis is horizontal (width)
                const isCrossHugX = nodeHorizontalSizing === 'RESIZE_TO_FIT' || (node.type === 'TEXT' && node.textAutoResize === 'WIDTH_AND_HEIGHT') || isButton;
                if (isCrossHugX) {
                    styles['align-self'] = parentNode.stackCounterAlignItems === 'CENTER'
                        ? 'center'
                        : (parentNode.stackCounterAlignItems === 'MAX' ? 'flex-end' : 'flex-start');
                }
            } else {
                // In horizontal container, cross-axis is vertical (height)
                const isCrossHugY = nodeVerticalSizing === 'RESIZE_TO_FIT' || (node.type === 'TEXT' && (node.textAutoResize === 'WIDTH_AND_HEIGHT' || node.textAutoResize === 'HEIGHT'));
                if (isCrossHugY) {
                    styles['align-self'] = parentNode.stackCounterAlignItems === 'CENTER'
                        ? 'center'
                        : (parentNode.stackCounterAlignItems === 'MAX' ? 'flex-end' : 'flex-start');
                }
            }
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
        const minW = node.minSize?.value?.x ?? node.minSize?.x ?? node.minWidth;
        const minH = node.minSize?.value?.y ?? node.minSize?.y ?? node.minHeight;
        const maxW = node.maxSize?.value?.x ?? node.maxSize?.x ?? node.maxWidth;
        const maxH = node.maxSize?.value?.y ?? node.maxSize?.y ?? node.maxHeight;
        if (minW && minW > 0) styles['min-width'] = fmtW(minW);
        if (minH && minH > 0) styles['min-height'] = fmtH(minH);
        if (maxW && maxW > 0) styles['max-width'] = fmtW(maxW);
        if (maxH && maxH > 0) styles['max-height'] = fmtH(maxH);

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
                    if (isIconContainer || isSvgVector) {
                        styles['max-width'] = 'none';
                    }
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
                    if (isIconContainer || isSvgVector) {
                        styles['max-width'] = 'none';
                    }
                }
            }
        }
    } else {
        // Root element or independent artboard
        if (node.isCollapsedGraphicRoot) {
            if (node.size?.x) styles['width'] = fmtW(node.size.x);
            if (node.size?.y) styles['height'] = fmtH(node.size.y);
        } else if (isFluid) {
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

    // 8.5 Affine Transformation (Rotation, Scale, Flip)
    if (nodeTransformInfo && !node.isCollapsedGraphicRoot) {
        const parts = [];
        if (nodeTransformInfo.rotateDeg) {
            parts.push(`rotate(${nodeTransformInfo.rotateDeg}deg)`);
        }
        if (nodeTransformInfo.scaleX === -1) {
            parts.push('scaleX(-1)');
        }
        if (nodeTransformInfo.scaleY === -1) {
            parts.push('scaleY(-1)');
        }
        if (parts.length > 0) {
            const transformStr = parts.join(' ');
            styles['transform'] = styles['transform'] ? `${styles['transform']} ${transformStr}` : transformStr;
            styles['transform-origin'] = '0 0';
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

    if (node.isCollapsedGraphicRoot) {
        delete styles['display'];
        delete styles['flex-direction'];
        delete styles['flex-wrap'];
        delete styles['gap'];
        delete styles['row-gap'];
        delete styles['column-gap'];
        delete styles['padding'];
        delete styles['padding-top'];
        delete styles['padding-bottom'];
        delete styles['padding-left'];
        delete styles['padding-right'];
        delete styles['align-items'];
        delete styles['justify-content'];
        styles['object-fit'] = 'contain';
        styles['pointer-events'] = 'none';
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
    parseTransformMatrix,
    getNodeTransformInfo,
    formatGradient,
    formatEffects,
    formatPaintFilter,
    parseFontWeightAndStyle,
    computeNodeStyles,
    resolveSmartAbsoluteAnchors,
    toStyleString,
    hasExplicitMaskTag
};
