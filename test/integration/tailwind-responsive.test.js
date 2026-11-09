// test/integration/tailwind-responsive.test.js
import assert from 'node:assert';
import {
    getTailwindBreakpointPrefix,
    getClassDomain,
    mergeResponsiveTailwindClasses,
    synthesizeNodeResponsiveTailwind
} from '../../src/decompiler/tailwind/index.js';

export default function ({ it }) {
    it('maps viewport widths to standard Tailwind breakpoint prefixes', () => {
        assert.strictEqual(getTailwindBreakpointPrefix(640), 'sm:');
        assert.strictEqual(getTailwindBreakpointPrefix(768), 'md:');
        assert.strictEqual(getTailwindBreakpointPrefix(1024), 'lg:');
        assert.strictEqual(getTailwindBreakpointPrefix(1280), 'xl:');
        assert.strictEqual(getTailwindBreakpointPrefix(1536), '2xl:');
    });

    it('supports desktop-first max-* prefix generation', () => {
        assert.strictEqual(getTailwindBreakpointPrefix(768, false), 'max-md:');
        assert.strictEqual(getTailwindBreakpointPrefix(1024, false), 'max-lg:');
    });

    it('classifies Tailwind utility classes into correct CSS property domains', () => {
        assert.strictEqual(getClassDomain('flex-col'), 'flex-direction');
        assert.strictEqual(getClassDomain('flex-row'), 'flex-direction');
        assert.strictEqual(getClassDomain('p-4'), 'padding');
        assert.strictEqual(getClassDomain('px-6'), 'padding');
        assert.strictEqual(getClassDomain('gap-4'), 'gap');
        assert.strictEqual(getClassDomain('w-full'), 'width');
        assert.strictEqual(getClassDomain('text-2xl'), 'font-size');
        assert.strictEqual(getClassDomain('text-center'), 'text-align');
        assert.strictEqual(getClassDomain('text-blue-500'), 'text-color');
        assert.strictEqual(getClassDomain('bg-white'), 'background');
        assert.strictEqual(getClassDomain('hidden'), 'display');
    });

    it('merges responsive classes for layout direction changes (mobile-first)', () => {
        const mobileClasses = ['flex', 'flex-col', 'gap-4', 'p-4'];
        const tabletVariants = [
            { width: 768, classes: ['flex', 'flex-row', 'gap-6', 'p-6'] }
        ];

        const merged = mergeResponsiveTailwindClasses(mobileClasses, tabletVariants, { mobileFirst: true });
        assert.ok(merged.includes('flex'));
        assert.ok(merged.includes('flex-col'));
        assert.ok(merged.includes('md:flex-row'));
        assert.ok(merged.includes('gap-4'));
        assert.ok(merged.includes('md:gap-6'));
        assert.ok(merged.includes('p-4'));
        assert.ok(merged.includes('md:p-6'));
    });

    it('merges multi-breakpoint responsive styles across 3 screen sizes', () => {
        const mobileClasses = ['text-base', 'p-4'];
        const variants = [
            { width: 768, classes: ['text-xl', 'p-8'] },
            { width: 1280, classes: ['text-3xl', 'p-12'] }
        ];

        const merged = mergeResponsiveTailwindClasses(mobileClasses, variants, { mobileFirst: true });
        assert.ok(merged.includes('text-base'));
        assert.ok(merged.includes('md:text-xl'));
        assert.ok(merged.includes('xl:text-3xl'));
        assert.ok(merged.includes('p-4'));
        assert.ok(merged.includes('md:p-8'));
        assert.ok(merged.includes('xl:p-12'));
    });

    it('handles responsive element visibility toggling', () => {
        // Desktop only element: base is hidden, tablet+ is block
        const desktopOnly = ['hidden'];
        const desktopVariant = [{ width: 768, classes: ['block'] }];
        const mergedDesktop = mergeResponsiveTailwindClasses(desktopOnly, desktopVariant);
        assert.ok(mergedDesktop.includes('hidden'));
        assert.ok(mergedDesktop.includes('md:block'));

        // Mobile only element: base is block, tablet+ is hidden
        const mobileOnly = ['block'];
        const mobileVariant = [{ width: 768, classes: ['hidden'] }];
        const mergedMobile = mergeResponsiveTailwindClasses(mobileOnly, mobileVariant);
        assert.ok(mergedMobile.includes('block'));
        assert.ok(mergedMobile.includes('md:hidden'));
    });

    it('synthesizes multi-breakpoint responsive Tailwind classes for canonical AST nodes', () => {
        const desktopNode = {
            type: 'FRAME',
            name: 'actions-row',
            stackMode: 'HORIZONTAL',
            stackCounterAlignItems: 'CENTER',
            itemSpacing: 16
        };
        const mobileNode = {
            type: 'FRAME',
            name: 'actions-row',
            stackMode: 'VERTICAL',
            stackPrimaryAlignItems: 'CENTER',
            itemSpacing: 12
        };

        const canonicalNode = {
            ...desktopNode,
            responsiveMetadata: {
                alignedVariants: {
                    desktop: desktopNode,
                    mobile: mobileNode
                },
                visibility: { desktop: true, mobile: true },
                isExclusive: false
            }
        };

        const pageBreakpoints = [
            { name: 'desktop', width: 1080 },
            { name: 'mobile', width: 440 }
        ];

        const result = synthesizeNodeResponsiveTailwind(canonicalNode, pageBreakpoints, new Map(), { mobileFirst: false });
        assert.ok(result.classes.includes('flex'));
        assert.ok(result.classes.includes('flex-row'));
        assert.ok(result.classes.includes('max-[440px]:flex-col'));
        assert.ok(result.classes.includes('max-[440px]:justify-center'));
    });

    it('synthesizes desktop-only and mobile-only exclusive elements with responsive visibility', () => {
        // Desktop-only element
        const desktopOnlyNode = {
            type: 'FRAME',
            name: 'desktop-nav',
            stackMode: 'HORIZONTAL',
            responsiveMetadata: {
                alignedVariants: { desktop: { type: 'FRAME' } },
                visibility: { desktop: true, mobile: false },
                isExclusive: true,
                exclusiveMode: 'desktop-only'
            }
        };

        // Mobile-only element
        const mobileOnlyNode = {
            type: 'FRAME',
            name: 'mobile-drawer',
            stackMode: 'VERTICAL',
            responsiveMetadata: {
                alignedVariants: { mobile: { type: 'FRAME' } },
                visibility: { desktop: false, mobile: true },
                isExclusive: true,
                exclusiveMode: 'mobile-only'
            }
        };

        const pageBreakpoints = [
            { name: 'desktop', width: 1080 },
            { name: 'mobile', width: 440 }
        ];

        const dtResult = synthesizeNodeResponsiveTailwind(desktopOnlyNode, pageBreakpoints, new Map(), { mobileFirst: false });
        assert.ok(dtResult.classes.includes('max-[440px]:hidden'));

        const mbResult = synthesizeNodeResponsiveTailwind(mobileOnlyNode, pageBreakpoints, new Map(), { mobileFirst: false });
        assert.ok(mbResult.classes.includes('hidden'));
        assert.ok(mbResult.classes.includes('max-[440px]:flex'));
    });
}
