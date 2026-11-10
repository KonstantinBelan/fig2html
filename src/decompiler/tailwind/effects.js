// src/decompiler/tailwind/effects.js
import { matchColor } from './color-matcher.js';
import { getLinearGradientAngle } from '../css/gradient-formatter.js';

/**
 * Maps a linear gradient angle in degrees to Tailwind gradient direction utility
 * @param {number} deg
 * @returns {string} e.g. 'bg-gradient-to-r'
 */
export function mapGradientAngleToDirection(deg) {
    // Normalize degree to 0..360
    const normalized = ((Math.round(deg) % 360) + 360) % 360;

    if (normalized >= 338 || normalized < 23) return 'bg-gradient-to-t';
    if (normalized >= 23 && normalized < 68) return 'bg-gradient-to-tr';
    if (normalized >= 68 && normalized < 113) return 'bg-gradient-to-r';
    if (normalized >= 113 && normalized < 158) return 'bg-gradient-to-br';
    if (normalized >= 158 && normalized < 203) return 'bg-gradient-to-b';
    if (normalized >= 203 && normalized < 248) return 'bg-gradient-to-bl';
    if (normalized >= 248 && normalized < 293) return 'bg-gradient-to-l';
    return 'bg-gradient-to-tl';
}

/**
 * Maps a Figma gradient paint object into Tailwind gradient classes
 * @param {object} gradient Figma paint object (GRADIENT_LINEAR or GRADIENT_RADIAL)
 * @param {object} [options={}]
 * @returns {Array<string>} e.g. ['bg-gradient-to-r', 'from-blue-500', 'to-indigo-600']
 */
export function mapGradientToTailwind(gradient, options = {}) {
    if (!gradient || !Array.isArray(gradient.stops) || gradient.stops.length === 0) {
        return [];
    }

    if (gradient.type === 'GRADIENT_LINEAR') {
        const classes = [];
        const angle = getLinearGradientAngle(gradient.transform);
        classes.push(mapGradientAngleToDirection(angle));

        const stops = gradient.stops;
        if (stops.length === 2) {
            const fromColor = matchColor(stops[0].color, options);
            const toColor = matchColor(stops[1].color, options);
            if (fromColor.classSuffix) classes.push(`from-${fromColor.classSuffix}`);
            if (toColor.classSuffix) classes.push(`to-${toColor.classSuffix}`);
        } else if (stops.length >= 3) {
            const fromColor = matchColor(stops[0].color, options);
            const viaColor = matchColor(stops[Math.floor(stops.length / 2)].color, options);
            const toColor = matchColor(stops[stops.length - 1].color, options);
            if (fromColor.classSuffix) classes.push(`from-${fromColor.classSuffix}`);
            if (viaColor.classSuffix) classes.push(`via-${viaColor.classSuffix}`);
            if (toColor.classSuffix) classes.push(`to-${toColor.classSuffix}`);
        }

        return classes;
    }

    // Radial gradient arbitrary fallback
    return ['bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))]'];
}

/**
 * Maps Figma blendMode to Tailwind mix-blend utility
 * @param {string} blendMode
 * @returns {string|null}
 */
export function mapBlendMode(blendMode) {
    if (!blendMode || blendMode === 'NORMAL' || blendMode === 'PASS_THROUGH') return null;

    const map = {
        'MULTIPLY': 'mix-blend-multiply',
        'SCREEN': 'mix-blend-screen',
        'OVERLAY': 'mix-blend-overlay',
        'DARKEN': 'mix-blend-darken',
        'LIGHTEN': 'mix-blend-lighten',
        'COLOR_DODGE': 'mix-blend-color-dodge',
        'COLOR_BURN': 'mix-blend-color-burn',
        'HARD_LIGHT': 'mix-blend-hard-light',
        'SOFT_LIGHT': 'mix-blend-soft-light',
        'DIFFERENCE': 'mix-blend-difference',
        'EXCLUSION': 'mix-blend-exclusion',
        'HUE': 'mix-blend-hue',
        'SATURATION': 'mix-blend-saturation',
        'COLOR': 'mix-blend-color',
        'LUMINOSITY': 'mix-blend-luminosity'
    };

    return map[blendMode] || `mix-blend-[${blendMode.toLowerCase().replace('_', '-')}]`;
}

/**
 * Maps SVG icon node attributes into Tailwind SVG utilities
 * @param {object} node
 * @param {object} [options={}]
 * @returns {Array<string>} e.g. ['w-5', 'h-5', 'text-current']
 */
export function mapSvgIconToTailwind(node, options = {}) {
    if (!node) return [];
    const classes = [];

    const w = node.size?.x || 24;
    const h = node.size?.y || 24;

    if (w === h) {
        if (w === 16) classes.push('w-4', 'h-4');
        else if (w === 20) classes.push('w-5', 'h-5');
        else if (w === 24) classes.push('w-6', 'h-6');
        else if (w === 32) classes.push('w-8', 'h-8');
        else classes.push(`w-[${Math.round(w)}px]`, `h-[${Math.round(h)}px]`);
    } else {
        classes.push(`w-[${Math.round(w)}px]`, `h-[${Math.round(h)}px]`);
    }

    classes.push('shrink-0');

    // Color inheritance
    classes.push('text-current');

    return classes;
}
