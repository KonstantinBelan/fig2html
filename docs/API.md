# 🛠 Программный API (Node.js & TypeScript)

Библиотека **Figmatik** предоставляет полнофункциональный программный API для Node.js и TypeScript. Вы можете встраивать двустороннюю компиляцию и декомпиляцию Figma в свои серверные обработчики, microservices, SaaS-платформы, CI/CD-скрипты и генераторы дизайн-систем.

---

## 📑 Содержание

1. [Установка и импорт](#1-установка-и-импорт)
2. [Декомпилятор: convertFigToHtml](#2-декомпилятор-convertfigtohtml)
   - 2.1. [Сигнатура функции](#21-сигнатура-функции)
   - 2.2. [Параметры опций (FigToHtmlOptions)](#22-параметры-опций-figtohtmloptions)
   - 2.3. [Возвращаемый результат (FigToHtmlResult)](#23-возвращаемый-результат-figtohtmlresult)
   - 2.4. [Примеры интеграции](#24-примеры-интеграции)
3. [Компилятор: generateFigFile](#3-компилятор-generatefigfile)
   - 3.1. [Сигнатура функции](#31-сигнатура-функции)
   - 3.2. [Параметры опций (HtmlToFigOptions)](#32-параметры-опций-htmltofigoptions)
   - 3.3. [Возвращаемый результат (HtmlToFigResult)](#33-возвращаемый-результат-htmltofigresult)
   - 3.4. [Примеры интеграции](#34-примеры-интеграции)
4. [Низкоуровневые экспорты](#4-низкоуровневые-экспорты)
5. [Обработка ошибок и мониторинг прогресса](#5-обработка-ошибок-и-мониторинг-прогресса)

---

## 1. Установка и импорт

```bash
npm install figmatik
```

Пакет поставляется как нативный **Pure ES Module (ESM)** с официальными определениями типов TypeScript:

```typescript
// JavaScript (ESM)
import { convertFigToHtml, generateFigFile } from 'figmatik';

// TypeScript
import { 
    convertFigToHtml, 
    generateFigFile, 
    type FigToHtmlOptions, 
    type FigToHtmlResult,
    type HtmlToFigOptions,
    type HtmlToFigResult 
} from 'figmatik';
```

---

## 2. Декомпилятор: convertFigToHtml

Функция `convertFigToHtml` выполняет парсинг бинарного архива `.fig`, декодирует дерево Kiwi AST и генерирует семантическую веб-разметку, стили и оптимизированную графику.

### 2.1. Сигнатура функции

```typescript
async function convertFigToHtml(
    figPathOrBuffer: string | Buffer,
    options?: FigToHtmlOptions
): Promise<FigToHtmlResult>
```

---

### 2.2. Параметры опций (FigToHtmlOptions)

| Свойство | Тип | По умолчанию | Описание |
| :--- | :--- | :--- | :--- |
| `outputHtmlPath` | `string` | `null` | Путь для записи выходного HTML-файла или директории |
| `pageName` | `string` | `'Page 1'` | Имя страницы (холста) в Figma для декомпиляции |
| `separateFiles` | `boolean` | `false` | Выносить стили в отдельный `.css` и картинки в папку |
| `extractCss` | `boolean` | `false` | Выносить CSS в отдельный файл |
| `cssFile` | `string` | `'css/style.css'` | Путь к внешнему файлу стилей |
| `assetsDir` | `string` | `'img'` | Папка для извлекаемых картинок |
| `noInlineImages` | `boolean` | `false` | Сохранять картинки файлами вместо Base64 |
| `layoutMode` | `'default' \| 'relative' \| 'fluid' \| 'grid'` | `'default'` | Режим верстки |
| `smartLayout` | `boolean` | `true` | Синтезировать Flexbox/Grid для макетов без Auto Layout |
| `responsive` | `boolean` | `true` | Объединять связанные экраны в единый сайт |
| `breakpoints` | `number[] \| string` | авто | Целевые брейкпоинты (`"1440,768,375"`) |
| `mobileFirst` | `boolean` | `false` | Генерировать медиа-запросы `min-width` |
| `multiPage` | `boolean` | `true` | Многостраничный экспорт сайтов |
| `singlePage` | `boolean` | `false` | Принудительный экспорт только одной страницы |
| `allCanvases` | `boolean` | `false` | Экспорт всех Canvas-вкладок как отдельных страниц |
| `pages` | `string` | `undefined` | Список конкретных страниц для экспорта (`"Home, Pricing"`) |
| `pageTag` | `string` | `undefined` | Пользовательский тег страниц (например, `[page]`) |
| `excludeTag` | `string` | `undefined` | Пользовательский тег исключения (например, `[exclude]`) |
| `outlierDetection`| `boolean`| `true` | Фильтрация модальных окон по медианному размеру |
| `imageFormat` | `'original' \| 'webp' \| 'avif'` | `'original'` | Целевой формат графических ассетов |
| `imageScale` | `number` | `2` | Множитель масштаба растра (Retina @2x) |
| `responsiveImages`| `boolean`| `true` | Генерация атрибутов `srcset` и `sizes` |
| `compress` | `boolean` | `false` | Lossless-сжатие картинок через Sharp |
| `tokens` | `string \| boolean` | `false` | Экспорт W3C Design Tokens в JSON файл |
| `spacingTokens` | `boolean` | `true` | Генерация примитивных токенов `:root { --space-* }` |
| `lang` | `string` | авто | Язык документа (`'en'`, `'ru'`) |
| `tailwind` | `boolean` | `false` | Активировать генерацию классов Tailwind CSS |
| `tailwindVersion`| `'v3' \| 'v4'` | `'v4'` | Целевая версия Tailwind |
| `tailwindMode` | `'utility' \| 'hybrid'` | `'utility'` | Режим классов или BEM + `@apply` |
| `tailwindTolerance`| `number` | `1` | Допуск привязки к 4px шкале в пикселях |
| `framework` | `'html' \| 'react' \| 'vue' \| 'svelte'` | `'html'` | Компонентный формат экспорта |
| `scaffold` | `boolean \| string` | `false` | Скаффолдинг готового production-репозитория |
| `componentName` | `string` | `undefined` | Имя генерируемого React/Vue/Svelte компонента |
| `verbose` | `boolean` | `false` | Вывод подробных логов в консоль |
| `onProgress` | `(percent, message) => void` | `undefined` | Функция обратного вызова для прогресса |

---

### 2.3. Возвращаемый результат (FigToHtmlResult)

```typescript
export interface FigToHtmlResult {
    html: string;                 // Результирующий HTML-код
    css: string | null;           // CSS-стили (если включен separateFiles или extractCss)
    outputPath: string | null;    // Путь к записанному HTML-файлу
    cssPath: string | null;       // Путь к записанному CSS-файлу
    assetsDir: string | null;     // Путь к директории изображений
    totalNodes: number;           // Количество обработанных узлов сцены
    imagesCount: number;          // Количество извлеченных изображений
    durationMs: number;           // Время конвертации в миллисекундах
    stats: {
        frames: number;
        textNodes: number;
        images: number;
        shapes: number;
        variables?: number;
    };
    isMultiPage?: boolean;        // Флаг многостраничного экспорта
    pages?: FigToHtmlPage[];      // Список сгенерированных страниц { name, fileName, html }
    tokens?: any;                 // Объект извлеченных дизайн-токенов
    tokensPath?: string | null;   // Путь к записанному tokens.json
    tailwind?: boolean;           // Флаг использования Tailwind
    framework?: string;           // Целевой фреймворк
    componentCode?: string | null;// Исходный код сгенерированного React/Vue/Svelte компонента
    componentPath?: string | null;// Путь к файлу компонента
    scaffoldDir?: string | null;  // Директория созданного проекта
    scaffoldFiles?: string[] | null; // Список файлов проекта
}
```

---

### 2.4. Примеры интеграции

#### Пример 1: Быстрая декомпиляция в память (in-memory)
```typescript
import fs from 'node:fs';
import { convertFigToHtml } from 'figmatik';

const buffer = fs.readFileSync('design.fig');
const result = await convertFigToHtml(buffer, {
    layoutMode: 'fluid',
    imageFormat: 'webp'
});

console.log(`HTML сгенерирован за ${result.durationMs}ms`);
console.log(result.html);
```

#### Пример 2: Продакшн-экспорт модульного сайта
```typescript
import { convertFigToHtml } from 'figmatik';

const result = await convertFigToHtml('website.fig', {
    outputHtmlPath: 'dist/index.html',
    separateFiles: true,
    imageFormat: 'webp',
    compress: true,
    responsive: true,
    breakpoints: [1440, 768, 375],
    tokens: 'dist/tokens.json'
});

console.log(`Сайт сохранен в ${result.outputPath}`);
console.log(`CSS стили: ${result.cssPath}`);
console.log(`Ассеты: ${result.assetsDir} (${result.imagesCount} изображений)`);
```

#### Пример 3: Генерация React TSX компонента с Tailwind
```typescript
import { convertFigToHtml } from 'figmatik';

const result = await convertFigToHtml('card.fig', {
    outputHtmlPath: 'src/components/PricingCard.tsx',
    tailwind: true,
    tailwindVersion: 'v4',
    framework: 'react',
    componentName: 'PricingCard'
});

console.log('React TSX компонент сгенерирован:');
console.log(result.componentCode);
```

---

## 3. Компилятор: generateFigFile

Функция `generateFigFile` выполняет прямой компиляционный проход: парсит HTML/CSS, строит дерево элементов, применяет каскадные стили, вычисляет Auto Layout разметку и упаковывает результат в валидный бинарный архив Figma `.fig` (Kiwi Schema v101 + Zstandard).

### 3.1. Сигнатура функции

```typescript
async function generateFigFile(
    options: HtmlToFigOptions
): Promise<HtmlToFigResult>
```

---

### 3.2. Параметры опций (HtmlToFigOptions)

| Свойство | Тип | По умолчанию | Описание |
| :--- | :--- | :--- | :--- |
| `htmlPath` | `string` | `undefined` | Путь к входному HTML-файлу на диске |
| `htmlContent` | `string` | `undefined` | Прямая строка HTML-разметки (in-memory) |
| `outputPath` | `string` | `'output.fig'`| Путь для сохранения бинарного файла `.fig` |
| `templatePath`| `string` | `templates/template.fig` | Путь к эталонному бинарному шаблону Figma |
| `pageName` | `string` | `'Page 1'` | Название страницы в документе Figma |
| `allowRemoteImages` | `boolean` | `true` | Разрешать загрузку внешних картинок (HTTP/HTTPS) |
| `allowPrivateHosts` | `boolean` | `false` | Разрешать обращение к приватным IP (Anti-SSRF guard) |
| `verbose` | `boolean` | `false` | Вывод подробных логов этапов Kiwi сборки |
| `onProgress` | `(percent, message, step) => void` | `undefined` | Коллбэк прогресса сборки |

---

### 3.3. Возвращаемый результат (HtmlToFigResult)

```typescript
export interface HtmlToFigResult {
    outputPath: string;           // Путь к созданному .fig файлу
    fileSizeBytes: number;        // Размер итогового файла в байтах
    totalNodes: number;           // Общее количество узлов в документе
    generatedNodes: number;       // Количество сгенерированных узлов
    embeddedImagesCount: number;  // Количество внедренных растровых блобов
    encodedBytes: number;         // Несжатый размер бинарного Kiwi AST
    compressedBytes: number;      // Размер после Zstandard-компрессии
    compressionRatio: string;     // Коэффициент сжатия (например, "3.14x")
    durationMs: number;           // Время сборки в миллисекундах
    stats: {
        frames: number;
        textNodes: number;
        images: number;
        shapes: number;
        variables?: number;
    };
}
```

---

### 3.4. Примеры интеграции

#### Пример 1: Компиляция локального HTML-файла в .fig
```typescript
import { generateFigFile } from 'figmatik';

const result = await generateFigFile({
    htmlPath: 'templates/landing.html',
    outputPath: 'build/landing.fig',
    pageName: 'Landing Page'
});

console.log(`Файл создан: ${result.outputPath} (${(result.fileSizeBytes / 1024).toFixed(1)} KB)`);
console.log(`Сгенерировано нод: ${result.generatedNodes} за ${result.durationMs}ms`);
```

#### Пример 2: Генерация .fig на лету из строки HTML (SaaS / API Worker)
```typescript
import { generateFigFile } from 'figmatik';

const dynamicHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; background: #0f172a; font-family: Inter, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #1e293b; padding: 32px; border-radius: 24px; border: 1px solid #334155; box-shadow: 0 20px 40px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 16px; width: 360px; }
    .badge { align-self: flex-start; padding: 6px 12px; background: #3b82f6; color: white; border-radius: 9999px; font-size: 12px; font-weight: 700; }
    .title { color: #f8fafc; font-size: 24px; font-weight: 700; margin: 0; }
    .desc { color: #94a3b8; font-size: 15px; line-height: 1.5; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">PRO FEATURE</div>
    <h1 class="title">Enterprise Automation</h1>
    <p class="desc">Seamlessly synchronize layouts, design tokens and UI components between code and Figma.</p>
  </div>
</body>
</html>
`;

const result = await generateFigFile({
    htmlContent: dynamicHtml,
    outputPath: 'dist/card.fig',
    allowPrivateHosts: false // Строгая защита от SSRF
});

console.log(`Готово: ${result.outputPath}`);
```

---

## 4. Низкоуровневые экспорты

Для глубокой кастомизации пайплайна Figmatik экспортирует внутренние парсеры и контроллеры:

```typescript
import {
    // Парсеры стилей
    parseColor,          // Преобразование цветов (HEX, RGB, HSL) в Figma RGBA
    parseGradient,       // Вычисление аффинных матриц для градиентов
    parseAllEffects,     // Парсинг box-shadow, blur и backdrop-filter

    // Работа с Kiwi схемой
    getCompiledSchema,   // Возвращает скомпилированную Kiwi Schema v101

    // Реестр изображений
    ImageRegistry,       // Потоковое хеширование SHA-1 и извлечение размеров

    // Низкоуровневая декомпиляция
    readFigFile,         // Распаковка .fig ZIP и декомпрессия Kiwi AST
    buildSceneTree,      // Восстановление иерархии нод и инстансов
    generateFullHtmlDocument // Генерация семантического HTML дерева
} from 'figmatik';
```

---

## 5. Обработка ошибок и мониторинг прогресса

Обе функции поддерживают отслеживание прогресса в реальном времени через коллбэк `onProgress`:

```typescript
await convertFigToHtml('large-project.fig', {
    outputHtmlPath: 'dist/index.html',
    onProgress: (percent, message) => {
        console.log(`[${percent}%] ${message}`);
    }
});
```

В случае возникновения ошибок (например, поврежденный бинарный архив, неразрешенный IP в Anti-SSRF или ошибка валидации) функции генерируют типизированное исключение `Error`:

```typescript
try {
    await convertFigToHtml('untrusted.fig', { outputHtmlPath: 'dist/index.html' });
} catch (err) {
    console.error('Ошибка конвертации:', err.message);
}
```
