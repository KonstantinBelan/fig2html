# 🗺️ Roadmap: Улучшения и доработки текущего функционала figmatik

В данном документе собраны ключевые инженерные улучшения для оптимизации производительности, удобства использования (DX) и масштабирования текущего функционала `figmatik`.

---

## 1. Параллелизация и оптимизация Image Optimizer

### Проблема
В макетах с десятками картинок и при включенных флагах `--webp` / `--avif` / `--compress` обработка через `sharp` выполняется последовательно или нагружает основной поток Node.js. В тесте `test/hard.fig` (6 слайдов, 7 картинок в нескольких разрешениях и AVIF) обработка занимает более минуты.

### Решение
1. **Пул воркеров и ограничение конкурентности (`p-limit`)**:
   Ограничение одновременных задач `sharp` количеством логических ядер процессора (`os.cpus().length`):
   ```javascript
   const pLimit = require('p-limit');
   const limit = pLimit(Math.max(2, os.cpus().length - 1));
   await Promise.all(images.map(img => limit(() => optimizeImage(img))));
   ```
2. **Контентное кэширование (Content-Addressable Cache)**:
   Так как Figma идентифицирует картинки по SHA-1 хешу, картинки с одинаковым хешем (даже используемые в разных фреймах/экранах) должны оптимизироваться ровно **один раз**.
3. **Lazy AVIF/WebP encoding**:
   Если изображение не претерпело масштабирования или обрезки и уже находится в нужном формате, выполнять прямой pass-through без повторного перекодирования.

---

## 2. Файл конфигурации `figmatik.config.js`

### Проблема
При интеграции в CI/CD или командный репозиторий неудобно передавать 15 аргументов в CLI:
`$ fig2html input.fig -s --webp --fluid --spacing-tokens --breakpoints 1440,768,375 --assets-dir assets/img`

### Решение
Поддержка конфигурационного файла `figmatik.config.js` (или `figmatik.config.json`):

```javascript
// figmatik.config.js
module.exports = {
  // Настройки декомпилятора (.fig -> HTML)
  decompiler: {
    separateFiles: true,
    imageFormat: 'webp',
    layoutMode: 'fluid',
    spacingTokens: true,
    classScope: 'modifier',
    breakpoints: [1440, 768, 375],
    assetsDir: 'public/images',
    cssFile: 'styles/design-system.css',
    outlierDetection: true
  },

  // Настройки компилятора (HTML -> .fig)
  compiler: {
    template: 'templates/template.fig',
    allowRemoteImages: true,
    pageName: 'Production Web'
  },

  // Кастомные алиасы селекторов и типографики
  theme: {
    fontMapping: {
      'Custom Sans': 'Inter'
    }
  }
};
```
Автоматический поиск конфига через стандартный `cosmiconfig` или проверку `figmatik.config.js` в корне проекта.

---

## 3. Интернационализация документации (Global Reach)

### Проблема
Figma и веб-разработка — глобальные рынки. Текущий подробный `README.md` на 740+ строк написан полностью на русском языке. Это ограничивает виральность на Reddit, Hacker News, Product Hunt, GitHub Trending и в Figma Community.

### Решение
1. Основной [README.md](file:///Users/kosbelan/Desktop/GitHub/html-to-fig/README.md) переводится на чистый профессиональный английский язык (как стандарт Open Source).
2. Создается файл [README.ru.md](file:///Users/kosbelan/Desktop/GitHub/html-to-fig/README.ru.md) с полной русскоязычной документацией.
3. В шапке обоих документов размещается удобный переключатель языков:
   ```markdown
   <p align="center">
     <b>English</b> • <a href="README.ru.md">Русский</a>
   </p>
   ```

---

## 4. Семантический версионинг и `CHANGELOG.md`

### Проблема
В проекте выходят мажорные фичи (поддержка брейкпоинтов, A11y, векторные пути, многостраничность), но история релизов не документирована в виде `CHANGELOG.md`.

### Решение
1. Внедрить инструмент `@changesets/cli` или `conventional-changelog`.
2. Автоматическая генерация `CHANGELOG.md` при каждом релизе по стандарту [Keep a Changelog](https://keepachangelog.com/).
3. Публикация GitHub Releases с прикреплением бинарных артефактов и перечислением изменений.

---

## 5. Интеллектуальный Watch Mode с дифференциальной пересборкой

### Проблема
Флаг `-w` (`--watch`) при любом изменении файла перезапускает полный цикл компиляции.

### Решение
1. **Дебаунсинг файловых событий** (300мс) для предотвращения спама событий от IDE.
2. **Инкрементальный рендер**: кэширование скомпилированного Kiwi Schema в памяти демона (устраняет необходимость каждый раз читать и компилировать `schemaDeflated` заново).
3. **Локальный Dev-сервер с Live Reload**: флаг `--serve` (или `-l`), который поднимает локальный HTTP-сервер на порту 3000 и перезагружает вкладку браузера через Server-Sent Events (SSE) без необходимости обновлять страницу вручную.
