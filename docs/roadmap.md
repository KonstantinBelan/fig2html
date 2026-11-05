# 🗺 Дорожная карта развития (Roadmap & Status)

Документ содержит статус реализации ключевых архитектурных улучшений движка **`html-to-fig`** (Figma Bi-Directional Engine).

---

## ✅ 1. Поддержка Figma Variables и Design Tokens — [РЕАЛИЗОВАНО в v2.1]

- **HTML ➔ .fig**:
  - CSS-переменные из `:root` автоматически компилируются в нативные коллекции Figma (`VARIABLE_SET` и `VARIABLE` узлы: `COLOR`, `FLOAT`, `STRING`).
  - Переменные привязываются к Kiwi-схеме холста с поддержкой режимов.
- **.fig ➔ HTML**:
  - Автоматическое чтение бинарных узлов `VARIABLE` и `VARIABLE_SET`.
  - Извлечение значений в CSS-переменные `:root` и поддержка мульти-режимов тем (`[data-theme="Dark"]`, `@media (prefers-color-scheme: dark)`).
  - Экспорт дизайн-токенов в JSON-формат через CLI флаг `--tokens [path]` или API-опцию `extractTokens: true`.

---

## ✅ 2. Поддержка CSS Grid — [РЕАЛИЗОВАНО в v2.1]

- **HTML ➔ .fig**:
  - Поддержка `display: grid` и `inline-grid`.
  - Парсинг `grid-template-columns` (`repeat(N, 1fr)`, `repeat(N, 200px)`, `1fr 2fr`, `auto`).
  - Трансляция в современный Auto Layout v4 со `stackWrap: WRAP`, вычислением точных пропорций и ширины колонок, а также отступов `gap`, `row-gap`, `column-gap`.
- **.fig ➔ HTML**:
  - Поддержка режима декомпиляции `--layout grid` / `--grid`.
  - Генерация чистого CSS Grid: `display: grid; grid-template-columns: repeat(N, 1fr); gap: ...`.

---

## ✅ 3. Оптимизация памяти и потоковая обработка — [РЕАЛИЗОВАНО в v2.1]

- **Lazy Image Base64 Extraction**:
  - Буферы изображений в `readFigFile` больше не разворачиваются жадно в гигабайтные base64-строки при чтении файла.
  - Base64 генерируется по требованию через геттер только при прямой вставке `inlineImages: true`, экономя память при раздельном экспорте в файлы (`--separate-files` / `img/*`).
- **Индексация сцены за один проход**:
  - Быстрое построение дерева сцены за O(N) с `Map` и очисткой служебных ссылок.

---

## ✅ 4. Компоненты, варианты и интерактивные состояния — [РЕАЛИЗОВАНО в v2.1]

- **HTML ➔ .fig**:
  - Автоматическое распознавание интерактивных CSS-правил `:hover`, `:active`, `:focus`.
  - Генерация нативных взаимодействий Figma: `prototypeInteractions` с триггером `WHILE_HOVERING` и действием `SWAP_STATE` (Smart Animate 180ms).
- **.fig ➔ HTML**:
  - Распознавание вариантов компонентов в `StylesheetManager`.
  - Вычисление диффа стилей вариантов (`State=Hover`, `State=Active`) и генерация соответствующих CSS-псевдоклассов (`:hover`, `:active`, `:focus`) без дублирования HTML-элементов в разметке.

---

## ✅ 5. Точные метрики шрифтов и Google Web Fonts — [РЕАЛИЗОВАНО в v2.1]

- **Google Fonts API**:
  - Парсинг ссылок Google Fonts из `<link rel="stylesheet">` и `@import url(...)` (`parseGoogleFontsUrl`, `extractWebFonts`).
  - Автоматическая генерация тегов `<link rel="preconnect">` и `<link href="https://fonts.googleapis.com/css2?..." rel="stylesheet">` в декомпилированном HTML.
- **Справочник метрик шрифтов (`FONT_METRICS_TABLE`)**:
  - Точные коэффициенты средней ширины символов (`avgCharWidthRatio`), высоты заглавных (`capHeightRatio`) и межстрочных интервалов для популярных шрифтов: Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Fira Code, JetBrains Mono, Arial, Georgia и др.
  - Использование метрик в `estimateTextDimensions` для точного расчета ширины строк.
