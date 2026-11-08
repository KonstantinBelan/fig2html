// test/unit/tailwind-mapper.test.js
import assert from 'node:assert';
import {
    snapSpacing,
    snapRadius,
    snapBorderWidth,
    parseColor,
    matchColor,
    mapFontSize,
    mapLetterSpacing,
    mapLineHeight,
    mapBoxShadow,
    mapStylesToTailwind,
    deduplicateTailwindClasses
} from '../../src/decompiler/tailwind/index.js';

export default function ({ it }) {
    // 1. Scale Snapper
    it('snaps exact standard spacing scale values', () => {
        assert.strictEqual(snapSpacing(0), '0');
        assert.strictEqual(snapSpacing(1), 'px');
        assert.strictEqual(snapSpacing(2), '0.5');
        assert.strictEqual(snapSpacing(4), '1');
        assert.strictEqual(snapSpacing(8), '2');
        assert.strictEqual(snapSpacing(12), '3');
        assert.strictEqual(snapSpacing(16), '4');
        assert.strictEqual(snapSpacing(20), '5');
        assert.strictEqual(snapSpacing(24), '6');
        assert.strictEqual(snapSpacing(32), '8');
        assert.strictEqual(snapSpacing(48), '12');
        assert.strictEqual(snapSpacing(64), '16');
        assert.strictEqual(snapSpacing(96), '24');
    });

    it('snaps spacing within tolerance threshold to standard scale', () => {
        // 15.8px within tolerance 1.0 of 16px -> '4'
        assert.strictEqual(snapSpacing(15.8, { tolerance: 1 }), '4');
        assert.strictEqual(snapSpacing(24.2, { tolerance: 1 }), '6');
    });

    it('generates clean arbitrary value when outside tolerance', () => {
        assert.strictEqual(snapSpacing(18, { tolerance: 1 }), '[18px]');
        assert.strictEqual(snapSpacing(342, { tolerance: 1 }), '[342px]');
    });

    it('supports negative spacing values', () => {
        assert.strictEqual(snapSpacing(-16), '-4');
        assert.strictEqual(snapSpacing(-18), '-[18px]');
    });

    it('snaps border radius correctly', () => {
        assert.strictEqual(snapRadius(0), 'none');
        assert.strictEqual(snapRadius(2), 'sm');
        assert.strictEqual(snapRadius(4), 'DEFAULT');
        assert.strictEqual(snapRadius(6), 'md');
        assert.strictEqual(snapRadius(8), 'lg');
        assert.strictEqual(snapRadius(12), 'xl');
        assert.strictEqual(snapRadius(16), '2xl');
        assert.strictEqual(snapRadius(24), '3xl');
        assert.strictEqual(snapRadius('50%'), 'full');
        assert.strictEqual(snapRadius(9999), 'full');
        assert.strictEqual(snapRadius(10), '[10px]');
    });

    it('snaps border width correctly', () => {
        assert.strictEqual(snapBorderWidth(0), '0');
        assert.strictEqual(snapBorderWidth(1), 'DEFAULT');
        assert.strictEqual(snapBorderWidth(2), '2');
        assert.strictEqual(snapBorderWidth(4), '4');
        assert.strictEqual(snapBorderWidth(3), '[3px]');
    });

    // 2. Color Matcher
    it('matches transparent, white, and black colors', () => {
        assert.strictEqual(matchColor('transparent').classSuffix, 'transparent');
        assert.strictEqual(matchColor('#ffffff').classSuffix, 'white');
        assert.strictEqual(matchColor('#000000').classSuffix, 'black');
        assert.strictEqual(matchColor('rgba(0, 0, 0, 0)').classSuffix, 'transparent');
    });

    it('matches standard Tailwind palette colors', () => {
        const blue = matchColor('#3b82f6');
        assert.strictEqual(blue.name, 'blue-500');
        assert.strictEqual(blue.classSuffix, 'blue-500');

        const slate = matchColor('#0f172a');
        assert.strictEqual(slate.name, 'slate-900');
    });

    it('handles alpha opacity channel correctly', () => {
        const semiBlue = matchColor('rgba(59, 130, 246, 0.5)');
        assert.strictEqual(semiBlue.classSuffix, 'blue-500/50');

        const semiBlack = matchColor('rgba(0, 0, 0, 0.8)');
        assert.strictEqual(semiBlack.classSuffix, 'black/80');
    });

    it('falls back to arbitrary hex when outside palette distance', () => {
        const customHex = matchColor('#1a2332');
        assert.strictEqual(customHex.isArbitrary, true);
        assert.strictEqual(customHex.classSuffix, '[#1a2332]');
    });

    it('prioritizes Figma variables and Design Tokens map', () => {
        const varMap = new Map([
            ['#3b82f6', 'brand-primary']
        ]);
        const matched = matchColor('#3b82f6', { variableMap: varMap });
        assert.strictEqual(matched.name, 'brand-primary');
        assert.strictEqual(matched.classSuffix, 'brand-primary');
    });

    // 3. Style Mapper
    it('maps Flexbox layout properties into Tailwind classes', () => {
        const styles = {
            'display': 'flex',
            'flex-direction': 'column',
            'justify-content': 'space-between',
            'align-items': 'center',
            'gap': '16px'
        };
        const { classes } = mapStylesToTailwind(styles);
        assert.ok(classes.includes('flex'));
        assert.ok(classes.includes('flex-col'));
        assert.ok(classes.includes('justify-between'));
        assert.ok(classes.includes('items-center'));
        assert.ok(classes.includes('gap-4'));
    });

    it('maps CSS Grid and repeat columns', () => {
        const styles = {
            'display': 'grid',
            'grid-template-columns': 'repeat(3, 1fr)',
            'gap': '24px'
        };
        const { classes } = mapStylesToTailwind(styles);
        assert.ok(classes.includes('grid'));
        assert.ok(classes.includes('grid-cols-3'));
        assert.ok(classes.includes('gap-6'));
    });

    it('maps padding and margins with symmetric shorthand', () => {
        const { classes: pClasses } = mapStylesToTailwind({ 'padding': '16px 24px' });
        assert.ok(pClasses.includes('py-4'));
        assert.ok(pClasses.includes('px-6'));

        const { classes: mClasses } = mapStylesToTailwind({ 'margin': 'auto' });
        assert.ok(mClasses.includes('m-auto'));
    });

    it('maps positioning, sizing, and constraints', () => {
        const styles = {
            'position': 'absolute',
            'top': '16px',
            'right': '16px',
            'width': '100%',
            'height': '100vh',
            'z-index': '50',
            'flex-grow': '1',
            'flex-shrink': '0'
        };
        const { classes } = mapStylesToTailwind(styles);
        assert.ok(classes.includes('absolute'));
        assert.ok(classes.includes('top-4'));
        assert.ok(classes.includes('right-4'));
        assert.ok(classes.includes('w-full'));
        assert.ok(classes.includes('h-screen'));
        assert.ok(classes.includes('z-50'));
        assert.ok(classes.includes('flex-1'));
        assert.ok(classes.includes('shrink-0'));
    });

    it('maps typography, font size, weight, and line-height', () => {
        const styles = {
            'font-size': '24px',
            'font-weight': '700',
            'text-align': 'center',
            'text-transform': 'uppercase',
            'text-decoration': 'underline',
            'white-space': 'nowrap'
        };
        const { classes } = mapStylesToTailwind(styles);
        assert.ok(classes.includes('text-2xl'));
        assert.ok(classes.includes('font-bold'));
        assert.ok(classes.includes('text-center'));
        assert.ok(classes.includes('uppercase'));
        assert.ok(classes.includes('underline'));
        assert.ok(classes.includes('whitespace-nowrap'));
    });

    it('maps visual effects, shadows, borders, and backdrop-blur', () => {
        const styles = {
            'background-color': '#3b82f6',
            'border-radius': '8px',
            'border': '1px solid #e2e8f0',
            'box-shadow': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            'backdrop-filter': 'blur(12px)',
            'opacity': '0.9'
        };
        const { classes } = mapStylesToTailwind(styles);
        assert.ok(classes.includes('bg-blue-500'));
        assert.ok(classes.includes('rounded-lg'));
        assert.ok(classes.includes('border'));
        assert.ok(classes.includes('border-slate-200'));
        assert.ok(classes.includes('shadow-md'));
        assert.ok(classes.includes('backdrop-blur-md'));
        assert.ok(classes.includes('opacity-90'));

        const rgbaBorder = mapStylesToTailwind({ border: '1px solid rgba(6, 182, 212, 0.3)' });
        assert.ok(rgbaBorder.classes.includes('border'));
        assert.ok(rgbaBorder.classes.includes('border-cyan-500/30'));
        assert.ok(!rgbaBorder.classes.includes('border-transparent'));

        const noneBorder = mapStylesToTailwind({ border: 'none' });
        assert.ok(!noneBorder.classes.includes('border'));
        assert.ok(!noneBorder.classes.includes('border-none'));
    });

    it('deduplicates and resolves conflicting classes', () => {
        const input = ['p-2', 'p-4', 'text-left', 'text-center', 'flex', 'block'];
        const deduped = deduplicateTailwindClasses(input);
        assert.ok(!deduped.includes('p-2'));
        assert.ok(deduped.includes('p-4'));
        assert.ok(!deduped.includes('text-left'));
        assert.ok(deduped.includes('text-center'));
        assert.ok(!deduped.includes('flex'));
        assert.ok(deduped.includes('block'));

        // font-family must not wipe font-weight
        const fonts = deduplicateTailwindClasses(['font-bold', 'font-sans']);
        assert.ok(fonts.includes('font-bold') && fonts.includes('font-sans'));

        // arbitrary text color must not be wiped by font size
        const textCls = deduplicateTailwindClasses(['text-[#05462e]', 'text-base']);
        assert.ok(textCls.includes('text-[#05462e]') && textCls.includes('text-base'));
        const textArb = deduplicateTailwindClasses(['text-[#05462e]', 'text-[15px]']);
        assert.ok(textArb.includes('text-[#05462e]') && textArb.includes('text-[15px]'));

        // background sub-properties are independent
        const bg = deduplicateTailwindClasses(['bg-white', 'bg-cover', 'bg-center', 'bg-no-repeat']);
        assert.strictEqual(bg.length, 4);

        // gap axes and corner radii are independent
        const gaps = deduplicateTailwindClasses(['gap-x-4', 'gap-y-6', 'rounded-tl-lg', 'rounded-br-lg']);
        assert.strictEqual(gaps.length, 4);

        // explicit side padding overrides axis shorthand
        const pads = deduplicateTailwindClasses(['py-3', 'px-2.5', 'pt-3', 'pb-0']);
        assert.ok(!pads.includes('py-3') && pads.includes('pb-0') && pads.includes('px-2.5'));

        // negative offsets are formatted as valid Tailwind classes
        const neg = mapStylesToTailwind({ position: 'absolute', top: '-42px', left: '285px' });
        assert.ok(neg.classes.includes('-top-[42px]'));
        assert.ok(!neg.classes.some(c => c.includes('top--')));

        // url()/multi-gradient backgrounds are preserved as inline styles
        const bgImg = mapStylesToTailwind({ 'background-image': "url('img/a.png')", 'background-size': 'cover', 'background-position': 'center' });
        assert.strictEqual(bgImg.remainingStyles['background-image'], "url('img/a.png')");
        assert.ok(bgImg.classes.includes('bg-cover') && bgImg.classes.includes('bg-center'));

        const gridWithFlex = deduplicateTailwindClasses(['grid', 'grid-cols-3', 'flex-row', 'flex-wrap']);
        assert.ok(gridWithFlex.includes('grid'));
        assert.ok(gridWithFlex.includes('grid-cols-3'));
        assert.ok(!gridWithFlex.includes('flex-row'));
        assert.ok(!gridWithFlex.includes('flex-wrap'));
    });
}
