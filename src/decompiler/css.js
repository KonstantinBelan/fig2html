// src/decompiler/css.js

/**
 * Maps an image MIME type to its standard file extension
 * @param {string} mime
 * @returns {string} File extension ('jpg', 'png', 'svg', 'webp', 'gif')
 */
function getExtensionForMime(mime) {
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/svg+xml') return 'svg';
    if (mime === 'image/webp') return 'webp';
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
 * @returns {{ boxShadow: string|null, filter: string|null, backdropFilter: string|null }}
 */
function formatEffects(effects) {
    if (!Array.isArray(effects) || effects.length === 0) {
        return { boxShadow: null, filter: null, backdropFilter: null };
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
                            const ext = getExtensionForMime(imgObj.mime);
                            const prefix = options.cssAssetUrlPrefix || options.assetUrlPrefix || (options.extractCss ? '../img/' : 'img/');
                            const imgUrl = options.inlineImages !== false
                                ? imgObj.base64
                                : `${prefix}${hashHex}.${ext}`;
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

            if (node.borderStrokeWeightsIndependent) {
                const topW = node.borderTopWeight || 0;
                const rightW = node.borderRightWeight || 0;
                const bottomW = node.borderBottomWeight || 0;
                const leftW = node.borderLeftWeight || 0;

                if (topW > 0) styles['border-top'] = `${topW}px solid ${strokeColor}`;
                if (rightW > 0) styles['border-right'] = `${rightW}px solid ${strokeColor}`;
                if (bottomW > 0) styles['border-bottom'] = `${bottomW}px solid ${strokeColor}`;
                if (leftW > 0) styles['border-left'] = `${leftW}px solid ${strokeColor}`;
            } else {
                styles['border'] = `${node.strokeWeight}px solid ${strokeColor}`;
            }
        }
    }

    // 3. Border Radius
    if (node.type === 'ELLIPSE') {
        styles['border-radius'] = '50%';
    } else if (node.rectangleCornerRadiiIndependent) {
        const tl = node.rectangleTopLeftCornerRadius || 0;
        const tr = node.rectangleTopRightCornerRadius || 0;
        const br = node.rectangleBottomRightCornerRadius || 0;
        const bl = node.rectangleBottomLeftCornerRadius || 0;
        if (tl || tr || br || bl) {
            if (tl === tr && tr === br && br === bl) {
                styles['border-radius'] = `${tl}px`;
            } else {
                styles['border-radius'] = `${tl}px ${tr}px ${br}px ${bl}px`;
            }
        }
    } else if (node.cornerRadius && node.cornerRadius > 0) {
        styles['border-radius'] = `${node.cornerRadius}px`;
    }

    if (isSvgVector) {
        styles['flex-shrink'] = '0';
    }

    // 4. Effects (Shadows & Blurs)
    const eff = formatEffects(node.effects);
    if (eff.boxShadow) styles['box-shadow'] = eff.boxShadow;
    if (eff.filter) styles['filter'] = eff.filter;
    if (eff.backdropFilter) styles['backdrop-filter'] = eff.backdropFilter;

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
            styles['font-size'] = `${node.fontSize}px`;
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
            if (node.lineHeight.units === 'PERCENT' && node.lineHeight.value && node.lineHeight.value !== 100) {
                styles['line-height'] = String(Math.round(node.lineHeight.value) / 100);
            } else if (node.lineHeight.units === 'PIXELS' && node.lineHeight.value) {
                styles['line-height'] = `${Math.round(node.lineHeight.value * 10) / 10}px`;
            }
        }

        if (node.letterSpacing && node.letterSpacing.value) {
            if (node.letterSpacing.units === 'PERCENT') {
                styles['letter-spacing'] = `${Math.round((node.letterSpacing.value / 100) * 100) / 100}em`;
            } else if (node.letterSpacing.units === 'PIXELS') {
                styles['letter-spacing'] = `${Math.round(node.letterSpacing.value * 10) / 10}px`;
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
        }
    }

    // 7. Auto Layout (Container Properties)
    const isAutoLayout = node.stackMode === 'HORIZONTAL' || node.stackMode === 'VERTICAL';
    if (isAutoLayout) {
        styles['display'] = 'flex';
        styles['flex-direction'] = node.stackMode === 'HORIZONTAL' ? 'row' : 'column';

        if (node.stackSpacing && node.stackSpacing > 0) {
            styles['gap'] = `${Math.round(node.stackSpacing * 10) / 10}px`;
        }
        if (node.stackWrap === 'WRAP') {
            styles['flex-wrap'] = 'wrap';
            if (node.stackCounterSpacing && node.stackCounterSpacing > 0) {
                if (node.stackMode === 'HORIZONTAL') styles['row-gap'] = `${node.stackCounterSpacing}px`;
                else styles['column-gap'] = `${node.stackCounterSpacing}px`;
            }
        }

        // Padding
        const pt = node.stackVerticalPadding || 0;
        const pr = node.stackPaddingRight !== undefined ? node.stackPaddingRight : (node.stackHorizontalPadding || 0);
        const pb = node.stackPaddingBottom !== undefined ? node.stackPaddingBottom : (node.stackVerticalPadding || 0);
        const pl = node.stackHorizontalPadding || 0;

        if (pt || pr || pb || pl) {
            if (pt === pb && pr === pl && pt === pr) {
                styles['padding'] = `${pt}px`;
            } else if (pt === pb && pr === pl) {
                styles['padding'] = `${pt}px ${pr}px`;
            } else {
                styles['padding'] = `${pt}px ${pr}px ${pb}px ${pl}px`;
            }
        }

        // Justify content (primary axis)
        if (node.stackPrimaryAlignItems === 'CENTER') styles['justify-content'] = 'center';
        else if (node.stackPrimaryAlignItems === 'MAX') styles['justify-content'] = 'flex-end';
        else if (node.stackPrimaryAlignItems === 'SPACE_BETWEEN') styles['justify-content'] = 'space-between';

        // Align items (cross axis)
        if (node.stackCounterAlignItems === 'CENTER') styles['align-items'] = 'center';
        else if (node.stackCounterAlignItems === 'MAX') styles['align-items'] = 'flex-end';
        else if (node.stackCounterAlignItems === 'BASELINE') styles['align-items'] = 'baseline';
    }

    // 8. Sizing & Position relative to parent
    const parentIsAutoLayout = parentNode && (parentNode.stackMode === 'HORIZONTAL' || parentNode.stackMode === 'VERTICAL');
    const isAbsolute = node.stackPositioning === 'ABSOLUTE' || (!parentIsAutoLayout && parentNode);

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

    // Overflow clipping for frames with absolute children, corner radius, slides/cards, masks, or clipsContent
    if (node.clipsContent || hasAbsoluteChildren || isSlideOrCard || hasMaskChild || (node.type === 'FRAME' && node.cornerRadius && node.children?.length)) {
        styles['overflow'] = 'hidden';
    }

    if (hasMaskChild && !styles['border-radius']) {
        const maskChild = node.children.find(c => c.mask === true || c.isMask === true);
        if (maskChild) {
            if (maskChild.type === 'ELLIPSE') {
                styles['border-radius'] = '50%';
            } else if (maskChild.cornerRadius) {
                styles['border-radius'] = `${maskChild.cornerRadius}px`;
            }
        }
    }

    // If parent has absolute children and this node is in-flow, elevate it above absolute backgrounds
    const parentHasAbsoluteChildren = parentNode && Array.isArray(parentNode.children) && parentNode.children.some(c => c.stackPositioning === 'ABSOLUTE');
    if (parentHasAbsoluteChildren && !isAbsolute && !styles['position']) {
        styles['position'] = 'relative';
        styles['z-index'] = '1';
    }

    if (isAbsolute && parentNode) {
        styles['position'] = 'absolute';
        const posX = Math.round((node.transform?.m02 || 0) * 10) / 10;
        const posY = Math.round((node.transform?.m12 || 0) * 10) / 10;
        styles['left'] = `${posX}px`;
        styles['top'] = `${posY}px`;

        if (node.size?.x) styles['width'] = `${Math.round(node.size.x)}px`;
        if (node.size?.y) styles['height'] = `${Math.round(node.size.y)}px`;
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

        const alignSelfVal = node.stackChildAlignSelf || node.layoutAlign;
        if (alignSelfVal === 'STRETCH') styles['align-self'] = 'stretch';
        else if (alignSelfVal === 'CENTER') styles['align-self'] = 'center';
        else if (alignSelfVal === 'MIN') styles['align-self'] = 'flex-start';
        else if (alignSelfVal === 'MAX') styles['align-self'] = 'flex-end';

        // Child margins
        const mt = node.stackChildMarginTop || 0;
        const mr = node.stackChildMarginRight || 0;
        const mb = node.stackChildMarginBottom || 0;
        const ml = node.stackChildMarginLeft || 0;
        if (mt || mr || mb || ml) {
            if (mt === mb && mr === ml && mt === mr) {
                styles['margin'] = `${mt}px`;
            } else if (mt === mb && mr === ml) {
                styles['margin'] = `${mt}px ${mr}px`;
            } else {
                styles['margin'] = `${mt}px ${mr}px ${mb}px ${ml}px`;
            }
        }

        // Sizing in Auto Layout
        const isRow = parentNode.stackMode === 'HORIZONTAL';
        const isShapeOrImage = ['ELLIPSE', 'RECTANGLE', 'VECTOR', 'REGULAR_POLYGON', 'STAR', 'LINE'].includes(node.type);
        const isIconContainer = isVectorContainerCheck(node);

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
            // Non-auto-layout frame, instance, or group
            isFixedX = !node.resizeToFit;
            isFixedY = !node.resizeToFit;
        }

        // Primary & counter axis sizing
        if (isRow) {
            // Primary axis: Width
            if (!styles['flex'] && !styles['flex-grow'] && styles['align-self'] !== 'stretch') {
                if (isFixedX && node.size?.x) {
                    styles['width'] = `${Math.round(node.size.x)}px`;
                    styles['flex-shrink'] = '0';
                }
            }
            // Counter axis: Height
            if (styles['align-self'] !== 'stretch') {
                if (isFixedY && node.size?.y) {
                    styles['height'] = `${Math.round(node.size.y)}px`;
                }
            }
        } else {
            // Primary axis: Height
            if (!styles['flex'] && !styles['flex-grow'] && styles['align-self'] !== 'stretch') {
                if (isFixedY && node.size?.y) {
                    styles['height'] = `${Math.round(node.size.y)}px`;
                    styles['flex-shrink'] = '0';
                }
            }
            // Counter axis: Width
            if (styles['align-self'] !== 'stretch') {
                if (isFixedX && node.size?.x) {
                    styles['width'] = `${Math.round(node.size.x)}px`;
                }
            }
        }
    } else {
        // Root element or independent artboard
        if (node.size?.x) styles['width'] = `${Math.round(node.size.x)}px`;
        if (node.size?.y) styles['min-height'] = `${Math.round(node.size.y)}px`;
        styles['margin'] = '0 auto';
        if (node.children && node.children.length > 0) {
            styles['position'] = 'relative';
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
    parseFontWeightAndStyle,
    computeNodeStyles,
    toStyleString
};
