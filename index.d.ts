/// <reference types="node" />

export type ImageFormat = 'original' | 'webp' | 'avif';
export type LayoutMode = 'default' | 'relative' | 'fluid' | 'grid';
export type ClassScopeMode = 'modifier' | 'scoped' | 'numbered';
export type ScaleMode = 'FILL' | 'FIT' | 'CROP' | 'TILE';
export type EffectType = 'DROP_SHADOW' | 'INNER_SHADOW' | 'FOREGROUND_BLUR' | 'BACKGROUND_BLUR';

export interface FigmaGuid {
    sessionID: number;
    localID: number;
}

export interface RGBAColor {
    r: number;
    g: number;
    b: number;
    a: number;
}

export interface GradientStop {
    position: number;
    color: RGBAColor;
}

export interface AffineMatrix {
    m00: number;
    m01: number;
    m02: number;
    m10: number;
    m11: number;
    m12: number;
}

export interface GradientPaint {
    type: 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL';
    transform: AffineMatrix;
    stops: GradientStop[];
}

export interface Effect {
    type: EffectType;
    color?: RGBAColor;
    offset?: { x: number; y: number };
    radius?: number;
    spread?: number;
    visible?: boolean;
}

export interface ConversionStats {
    frames: number;
    textNodes: number;
    images: number;
    shapes: number;
    variables?: number;
}

export interface FigToHtmlPage {
    name: string;
    fileName: string;
    html: string;
}

export interface FigToHtmlOptions {
    /** Output directory or HTML file path */
    outputHtmlPath?: string;
    /** Canvas or page name in Figma to decompile (default: "Page 1") */
    pageName?: string;
    /** Enable multi-page export mode (default: true) */
    multiPage?: boolean;
    /** Force single page export */
    singlePage?: boolean;
    /** Custom page tag in frame name (default: [page],[страница]) */
    pageTag?: string;
    /** Frame exclusion tag (default: [exclude],[исключить]) */
    excludeTag?: string;
    /** Filter modals and popups using median size clustering (default: true) */
    outlierDetection?: boolean;
    /** Comma-separated list of specific page names to export */
    pages?: string;
    /** Export all Canvas tabs in Figma document (default: false) */
    allCanvases?: boolean;
    /** Min frame width to recognize as page (default: 320) */
    minPageWidth?: number;
    /** Min frame height to recognize as page (default: 400) */
    minPageHeight?: number;
    /** Conflict class isolation mode: 'modifier' | 'scoped' | 'numbered' (default: 'modifier') */
    classScope?: ClassScopeMode;
    /** Responsive merge into single adaptive page with clamp() (default: true) */
    responsive?: boolean;
    /** Custom breakpoint target widths (e.g. "1440,768,375" or [1440, 768, 375]) */
    breakpoints?: number[] | string;
    /** Generate mobile-first media queries (min-width instead of max-width) */
    mobileFirst?: boolean;
    /** Extract external CSS and images instead of self-contained HTML */
    separateFiles?: boolean;
    /** Extract stylesheet into a separate .css file */
    extractCss?: boolean;
    /** Output path for external stylesheet (default: "css/style.css") */
    cssFile?: string;
    /** Do not inline images into Base64 (extract to files) */
    noInlineImages?: boolean;
    /** Directory for extracted images (default: "img") */
    assetsDir?: string;
    /** Generate inline style="..." attributes instead of classes */
    inlineStyles?: boolean;
    /** Image multiplier for Retina displays (default: 2) */
    imageScale?: number;
    /** Generate adaptive srcset & sizes attributes (default: true) */
    responsiveImages?: boolean;
    /** Lossless image compression via Sharp/MozJPEG */
    compress?: boolean;
    /** Target format for images: 'original' | 'webp' | 'avif' (default: 'original') */
    imageFormat?: ImageFormat;
    /** Layout strategy: 'default' | 'relative' | 'fluid' | 'grid' */
    layoutMode?: LayoutMode;
    /** Path to export design tokens JSON (default: tokens.json) */
    tokens?: string | boolean;
    /** Generate primitive :root spacing tokens (--space-*) (default: true) */
    spacingTokens?: boolean;
    /** Document language code (e.g. 'en', 'ru'; auto-detected by default) */
    lang?: string;
    /** Synthesize clean Flexbox & Grid without absolute positioning (default: true) */
    smartLayout?: boolean;
    /** Custom document title */
    title?: string;
    /** Print verbose execution logs */
    verbose?: boolean;
    /** Progress callback (0-100%, message) */
    onProgress?: (percent: number, message: string) => void;
}

export interface FigToHtmlResult {
    html: string;
    css: string | null;
    outputPath: string | null;
    cssPath: string | null;
    assetsDir: string | null;
    totalNodes: number;
    imagesCount: number;
    durationMs: number;
    stats: ConversionStats;
    isMultiPage?: boolean;
    pages?: FigToHtmlPage[];
}

export interface HtmlToFigOptions {
    /** Path to source HTML file */
    htmlPath?: string;
    /** Direct HTML content string */
    htmlContent?: string;
    /** Path for generated .fig file (default: output.fig) */
    outputPath?: string;
    /** Path to custom .fig template */
    templatePath?: string;
    /** Canvas page name in Figma (default: "Page 1") */
    pageName?: string;
    /** Allow remote HTTP/HTTPS image downloads (default: true) */
    allowRemoteImages?: boolean;
    /** Allow local absolute file paths */
    allowExternalPaths?: boolean;
    /** Allow private/local network hosts (SSRF guard) */
    allowPrivateHosts?: boolean;
    /** Print verbose execution logs */
    verbose?: boolean;
    /** Progress callback */
    onProgress?: (percent: number, message: string, step?: string) => void;
}

export interface HtmlToFigResult {
    outputPath: string;
    fileSizeBytes: number;
    totalNodes: number;
    generatedNodes: number;
    embeddedImagesCount: number;
    encodedBytes: number;
    compressedBytes: number;
    compressionRatio: string;
    durationMs: number;
    stats: ConversionStats;
}

export interface ExtractedImage {
    buffer: Buffer;
    mime: string;
    base64: string;
}

export interface ImageRegistryItem {
    sha1Hex: string;
    name: string;
    buffer: Buffer;
    mime: string;
    width?: number;
    height?: number;
}

export interface ImageRegistryOptions {
    baseDir?: string;
    allowRemote?: boolean;
    allowExternalPaths?: boolean;
    allowPrivateHosts?: boolean;
}

export class ImageRegistry {
    constructor(options?: ImageRegistryOptions);
    registerBuffer(buffer: Buffer, nameHint?: string): ImageRegistryItem;
    registerImage(source: string | Buffer): Promise<ImageRegistryItem | null>;
    registerSvg(svgString: string, nameHint?: string): Promise<ImageRegistryItem>;
    getImage(sha1Hex: string): Buffer | undefined;
    getAllImages(): Map<string, Buffer>;
    createImagePaint(item: ImageRegistryItem, scaleMode?: ScaleMode): object;
}

export interface SceneTreeOptions {
    pageName?: string;
    smartLayout?: boolean;
    verbose?: boolean;
}

export interface SceneTreeResult {
    document: any;
    canvas: any;
    canvases: any[];
    rootNodes: any[];
    allNodesMap: Map<string, any>;
    variableSets: any[];
    variables: any[];
}

export interface HtmlDocumentOptions {
    title?: string;
    separateFiles?: boolean;
    cssFileName?: string;
    inlineStyles?: boolean;
    layoutMode?: LayoutMode;
    lang?: string;
    responsive?: boolean;
    breakpoints?: number[] | string;
    mobileFirst?: boolean;
}

/** Converts a Figma .fig binary file into clean responsive HTML/CSS */
export function convertFigToHtml(
    figInput: string | Buffer,
    options?: FigToHtmlOptions
): Promise<FigToHtmlResult>;

/** Generates a native Figma .fig file from an HTML document or string */
export function generateFigFile(
    options: HtmlToFigOptions
): Promise<HtmlToFigResult>;

/** Translates HTML string into Figma Kiwi AST nodes */
export function convertHtmlToNodes(
    htmlString: string,
    parentCanvasGuid: FigmaGuid,
    options?: {
        baseDir?: string;
        allowRemoteImages?: boolean;
        imageRegistry?: ImageRegistry;
        blobOffset?: number;
        verbose?: boolean;
    }
): Promise<{
    nodeChanges: any[];
    imageRegistry: ImageRegistry;
    blobs: (Buffer | Uint8Array)[];
    stats: ConversionStats;
}>;

/** Reads and decompresses .fig binary file into raw Kiwi nodes and image blobs */
export function readFigFile(figInput: string | Buffer): {
    nodeChanges: any[];
    blobs: Buffer[];
    images: Map<string, ExtractedImage>;
};

/** Reconstructs visual scene hierarchy, component instances and overrides */
export function buildSceneTree(
    nodeChanges: any[],
    options?: SceneTreeOptions
): SceneTreeResult;

/** Generates complete standalone semantic HTML5 document with CSS and scripts */
export function generateFullHtmlDocument(
    rootNodes: any[],
    imageRegistry: any,
    options?: HtmlDocumentOptions
): string;

/** Compiled Kiwi schema cache */
export function getCompiledSchema(schemaDeflated?: Uint8Array | Buffer): any;

/** CSS Color parser */
export function parseColor(colorStr: string): RGBAColor | null;

/** CSS Gradient parser */
export function parseGradient(gradientStr: string): GradientPaint | null;

/** CSS Shadows and filters parser */
export function parseAllEffects(
    boxShadowStr?: string | null,
    filterStr?: string | null,
    backdropFilterStr?: string | null
): Effect[];

declare const figmatik: {
    convertFigToHtml: typeof convertFigToHtml;
    generateFigFile: typeof generateFigFile;
    convertHtmlToNodes: typeof convertHtmlToNodes;
    readFigFile: typeof readFigFile;
    buildSceneTree: typeof buildSceneTree;
    generateFullHtmlDocument: typeof generateFullHtmlDocument;
    getCompiledSchema: typeof getCompiledSchema;
    ImageRegistry: typeof ImageRegistry;
    parseColor: typeof parseColor;
    parseGradient: typeof parseGradient;
    parseAllEffects: typeof parseAllEffects;
};

export default figmatik;
