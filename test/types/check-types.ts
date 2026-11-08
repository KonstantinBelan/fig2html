import figmatik, {
    convertFigToHtml,
    generateFigFile,
    convertHtmlToNodes,
    readFigFile,
    buildSceneTree,
    generateFullHtmlDocument,
    getCompiledSchema,
    ImageRegistry,
    parseColor,
    parseGradient,
    parseAllEffects,
    FigToHtmlOptions,
    FigToHtmlResult,
    HtmlToFigOptions,
    HtmlToFigResult,
    RGBAColor,
    GradientPaint,
    Effect,
    SceneTreeResult,
    FigmaGuid,
    ImageFormat,
    LayoutMode,
    ClassScopeMode
} from '../../index.js';

// 1. Verify FigToHtmlOptions and convertFigToHtml
const figOptions: FigToHtmlOptions = {
    outputHtmlPath: './dist/index.html',
    pageName: 'Page 1',
    multiPage: true,
    singlePage: false,
    pageTag: '[page]',
    excludeTag: '[exclude]',
    outlierDetection: true,
    pages: 'Home,About',
    allCanvases: false,
    minPageWidth: 320,
    minPageHeight: 400,
    classScope: 'modifier',
    responsive: true,
    breakpoints: [1440, 768, 375],
    mobileFirst: true,
    separateFiles: true,
    extractCss: true,
    cssFile: 'css/style.css',
    noInlineImages: false,
    assetsDir: 'img',
    inlineStyles: false,
    imageScale: 2,
    responsiveImages: true,
    compress: true,
    imageFormat: 'webp',
    layoutMode: 'fluid',
    tokens: 'tokens.json',
    spacingTokens: true,
    lang: 'en',
    smartLayout: true,
    title: 'Test Page',
    verbose: false,
    onProgress: (percent: number, message: string) => {
        console.log(percent, message);
    }
};

async function testConvertFigToHtml(): Promise<FigToHtmlResult> {
    const result: FigToHtmlResult = await convertFigToHtml(Buffer.from([]), figOptions);
    const html: string = result.html;
    const css: string | null = result.css;
    const totalNodes: number = result.totalNodes;
    const isMultiPage: boolean | undefined = result.isMultiPage;
    return result;
}

// 2. Verify HtmlToFigOptions and generateFigFile
const htmlToFigOpts: HtmlToFigOptions = {
    htmlPath: 'test/test.html',
    htmlContent: '<div>Hello</div>',
    outputPath: 'output.fig',
    templatePath: 'templates/template.fig',
    pageName: 'Page 1',
    allowRemoteImages: true,
    allowExternalPaths: false,
    allowPrivateHosts: false,
    verbose: true,
    onProgress: (percent: number, message: string, step?: string) => {
        console.log(percent, message, step);
    }
};

async function testGenerateFigFile(): Promise<HtmlToFigResult> {
    const result: HtmlToFigResult = await generateFigFile(htmlToFigOpts);
    const outputPath: string = result.outputPath;
    const fileSizeBytes: number = result.fileSizeBytes;
    const generatedNodes: number = result.generatedNodes;
    return result;
}

// 3. Verify convertHtmlToNodes & ImageRegistry
async function testConvertHtmlToNodes(): Promise<void> {
    const canvasGuid: FigmaGuid = { sessionID: 0, localID: 1 };
    const registry = new ImageRegistry({ allowRemote: false });
    const converted = await convertHtmlToNodes('<h1>Test</h1>', canvasGuid, {
        baseDir: '.',
        allowRemoteImages: false,
        imageRegistry: registry,
        blobOffset: 0,
        verbose: false
    });
    const nodesCount: number = converted.nodeChanges.length;
    const blobsCount: number = converted.blobs.length;
    const textNodes: number = converted.stats.textNodes;
}

// 4. Verify readFigFile, buildSceneTree, generateFullHtmlDocument & getCompiledSchema
function testDecompilerPipeline(): void {
    const figData = readFigFile(Buffer.from([]));
    const changes: any[] = figData.nodeChanges;
    const blobs: Buffer[] = figData.blobs;
    const images = figData.images;

    const sceneTree: SceneTreeResult = buildSceneTree(changes, {
        pageName: 'Page 1',
        smartLayout: true,
        verbose: false
    });
    const rootNodes: any[] = sceneTree.rootNodes;
    const docString: string = generateFullHtmlDocument(rootNodes, images, {
        title: 'Scene Tree Export',
        layoutMode: 'relative'
    });

    const schema = getCompiledSchema();
}

// 5. Verify Parsers (color, gradient, effects)
function testParsers(): void {
    const color: RGBAColor | null = parseColor('#ff0000');
    if (color) {
        const r: number = color.r;
        const g: number = color.g;
        const b: number = color.b;
        const a: number = color.a;
    }

    const gradient: GradientPaint | null = parseGradient('linear-gradient(to right, red, blue)');
    if (gradient) {
        const type: 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' = gradient.type;
        const stops = gradient.stops;
    }

    const effects: Effect[] = parseAllEffects('0 4px 6px rgba(0,0,0,0.1)', 'blur(5px)');
    for (const effect of effects) {
        const effectType = effect.type;
    }
}

// 6. Verify default export figmatik
function testDefaultExport(): void {
    const { convertFigToHtml: cF2H, generateFigFile: gFF } = figmatik;
    figmatik.parseColor('#ffffff');
}
