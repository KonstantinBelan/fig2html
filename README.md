<div align="center">

# 🎨 HTML to .fig & .fig to HTML
### Figma Bi-Directional Engine 2.0

[![Version](https://img.shields.io/badge/version-1.5.0-6366f1.svg?style=for-the-badge)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981.svg?style=for-the-badge)](LICENSE)
[![Tests: 131 passed](https://img.shields.io/badge/tests-131%20passed-22c55e.svg?style=for-the-badge&logo=node.js&logoColor=white)](test/run-tests.js)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D16.0.0-339933.svg?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Figma Kiwi](https://img.shields.io/badge/Kiwi%20Schema-v101-f24e1e.svg?style=for-the-badge&logo=figma&logoColor=white)](https://www.figma.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-8b5cf6.svg?style=for-the-badge)](https://github.com/KonstantinBelan/html-to-fig/pulls)

<p align="center">
  Высокопроизводительный двусторонний компилятор и декомпилятор нативных бинарных файлов Figma (<code>.fig</code>).<br>
  <b>HTML/CSS ➔ .fig</b> по спецификации <b>Kiwi Schema v101</b> и <b>.fig ➔ семантический адаптивный HTML5</b> с поддержкой Flexbox Auto Layout v4, Retina 2x, WebP/AVIF и Fluid-вёрстки.
</p>

<p align="center">
  <a href="#-демонстрация-cli">📺 Демонстрация CLI</a> •
  <a href="#-установка-и-быстрый-старт">🚀 Быстрый старт</a> •
  <a href="#-особенности-и-возможности">⚡ Возможности</a> •
  <a href="docs/figma-design-guide.md">🎨 Руководство дизайнера</a> •
  <a href="#-cli-справка">💻 CLI Справка</a> •
  <a href="#-программный-api-nodejs">🛠 API</a> •
  <a href="#-тестирование">🧪 Тесты</a>
</p>

</div>

---

## 📺 Демонстрация CLI

<p align="center">
  <img src="docs/cli-demo.svg" alt="Figma Bi-Directional CLI Demo" width="100%">
</p>

<details>
<summary><b>Показать текстовый лог работы терминала</b></summary>

#### 1. Прямая конвертация: `html-to-fig`
```bash
$ html-to-fig showcase.html showcase.fig

┌──────────────────────────────────────────┐
│             HTML to Figma CLI            │
│               v1.5.0                     │
└──────────────────────────────────────────┘
⚡ Compiling: showcase.html -> showcase.fig...
[██░░░░░░░░]  20% • Loading Kiwi schema...
[█████░░░░░]  48% • Converting HTML to Figma nodes...
[███████░░░]  70% • Encoding Kiwi binary format...
[██████████] 100% • Packaging .fig archive... (0.7s)

✔ Build complete in 684ms!
┌─────────────────────────────────────────┐
│ File:       showcase.fig                │
│ Size:       54.1 KB                     │
│ Nodes:      49 generated                │
│   Frames:   23                          │
│   Text:     21                          │
│   Images:   2                           │
│   Shapes:   3                           │
│ Embedded:   2 image blobs               │
│ Zstd ratio: 3.14x                       │
└─────────────────────────────────────────┘

Drag and drop showcase.fig into Figma to open.
```

#### 2. Обратная конвертация с резиновой вёрсткой: `fig-to-html`
```bash
$ fig-to-html showcase.fig -s --fluid --webp

┌──────────────────────────────────────────┐
│             Figma to HTML CLI            │
│               v1.5.0                     │
└──────────────────────────────────────────┘
⚡ Decompiling: showcase.fig -> index.html (Fluid Layout)...
[██░░░░░░░░]  20% • Decoding Kiwi binary AST...
[████░░░░░░]  38% • Synthesizing smart layout...
[███████░░░]  70% • Optimizing images (7/7 WebP)...
[██████████] 100% • Writing dist/index.html... (0.1s)

✔ Decompilation complete in 66ms!
┌─────────────────────────────────────────┐
│ HTML:       dist/index.html (4.9 KB)    │
│ CSS:        dist/css/style.css (11.5 KB)│
│ Assets:     dist/img/ (7 WebP images)   │
│ Layout:     Fluid (100vw / 100dvh)      │
│ Nodes:      52 total in fig             │
│ Img Opt:    WEBP Lossless (-87%)        │
└─────────────────────────────────────────┘

Open dist/index.html in any browser.
```
</details>

---

## ⚡ Особенности и возможности

- **100% нативный .fig формат**: Файлы открываются в Figma Desktop и Figma Web без плагинов — просто перетащите файл в окно Figma.
- **Конвертация всей страницы целиком**:
  - Трансляция начинается непосредственно с корня документа (`<body>`).
  - Сохраняются реальные размеры холста (например, вертикальные посты/слайды 1080×1350 или десктопные лэндинги) и фон страницы.
- **Современный Auto Layout v4 (Flexbox)**:
  - Чистая спецификация разметки без устаревших параметров: никаких предупреждений *"New auto layout version available"* в Figma.
  - Направления: `display: flex` / `inline-flex` (`flex-direction: row | column`).
  - Режимы сайзинга: **Hug contents** (`RESIZE_TO_FIT`), **Fixed** (`FIXED`), **Fill container** (`STRETCH`) по обеим осям (`stackPrimarySizing`, `stackCounterSizing`).
  - Выравнивание: `justify-content` (`flex-start`, `center`, `flex-end`, `space-between`, `space-evenly`).
  - Выравнивание по поперечной оси: `align-items` (`flex-start`, `center`, `flex-end`, `baseline`, `stretch`) с автоматическим растягиванием дочерних блоков.
  - Дочерние параметры: `flex-grow`, `align-self: stretch`, `position: absolute`.
  - Отступы: `gap`, `row-gap`, `column-gap`.
  - Независимые паддинги: 4 стороны (`padding-top/right/bottom/left`).
  - **Пре-компьютированный Layout Pass**: движок заранее рассчитывает физические размеры фреймов и координаты дочерних элементов (`transform.m02` / `transform.m12`), обеспечивая 100% совпадение позиционирования с браузером.
  - **Эмуляция отступов (margin) для текста**: поскольку текстовые слои в Figma не имеют собственных полей `margin`, элементы с внешними отступами автоматически оборачиваются в Auto Layout контейнеры с сохранением разметки.
- **Поддержка CSS Grid**:
  - `display: grid` и `inline-grid`: автоматический парсинг `grid-template-columns` (`repeat(N, 1fr)`, `repeat(N, 200px)`, `1fr 2fr` и др.).
  - Интеллектуальная трансляция сетки в Auto Layout v4 с `stackWrap: WRAP` и точным вычислением ширины ячеек.
  - Декомпиляция в семантический CSS Grid: флаг `--layout grid` / `--grid`.
- **Нативные Figma Variables и Design Tokens**:
  - **HTML ➔ .fig**: экспорт `:root` CSS-переменных в нативные бинарные коллекции Figma (`VARIABLE_SET` и `VARIABLE` узлы: `COLOR`, `FLOAT`, `STRING`).
  - **.fig ➔ HTML**: чтение переменных Figma и генерация CSS-переменных `:root` с поддержкой мульти-режимов тем (`[data-theme="Dark"]`).
  - Экспорт дизайн-токенов в JSON: флаг `--tokens [path]` / `--extract-tokens`.
- **Интерактивные состояния и варианты компонентов**:
  - Автоматическое распознавание псевдоклассов `:hover`, `:active`, `:focus` в CSS.
  - Генерация нативных взаимодействий Figma: `prototypeInteractions` с триггером `WHILE_HOVERING` и переходом `SWAP_STATE`.
  - Декомпиляция вариантов (`SYMBOL` со `State=Hover`, `State=Active`) в чистые CSS-псевдоклассы без дублирования HTML-разметки.
- **Типографика, Google Fonts и точные метрики**:
  - Автоматическое обнаружение Google Fonts из `<link>` и `@import url(...)` с формированием единого предзагрузочного тега.
  - Встроенная таблица метрик популярных семейств шрифтов (`FONT_METRICS_TABLE`: Inter, Roboto, Montserrat, Poppins, Fira Code и др.) для расчета размеров текста с точностью до долей пикселя.
  - Полная поддержка CSS Custom Properties (`var(--font-display)`, `var(--text-color)`) с каскадным разрешением значений из `:root` и поддержкой fallbacks.
  - Семейства шрифтов: `font-family`, автоматическое сопоставление со стандартными библиотеками шрифтов Figma (Inter, Plus Jakarta Sans, SF Pro Display и др.).
  - Точное квантование весов `font-weight` (100–900, с поддержкой промежуточных значений вроде `510` -> `500 Medium`).
  - Начертание: `font-style` (`italic`, `normal`).
  - Межстрочный интервал: `line-height` (множители вроде `1.04` -> `104%`, проценты, фиксированные пиксели `px`, `normal`).
  - Межбуквенный интервал: `letter-spacing` (`px`, `em`, `%`).
  - Выравнивание: `text-align` (`left`, `center`, `right`, `justify`).
  - Трансформация: `text-transform` (`uppercase`, `lowercase`, `capitalize`).
  - Оформление: `text-decoration` (`underline`, `line-through`, `none`).
  - **Rich Text**: смешанное форматирование внутри одного блока текста (`<b>`, `<i>`, `<span style="...">`, `<a>`) через `styleOverrideTable` и `characterStyleIDs`.
- **Цвета и заливки**:
  - HEX (3, 4, 6, 8 символов: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`).
  - RGB и RGBA (`rgb(r, g, b)`, `rgba(r, g, b, a)`, современный синтаксис `rgb(255 0 0 / 50%)`).
  - HSL и HSLA (`hsl(h, s, l)`, `hsla(h, s, l, a)`).
  - Все 148 стандартных W3C именованных цветов (`crimson`, `aliceblue`, `transparent` и т.д.).
  - Динамический цвет `currentColor`.
- **Градиенты**:
  - `linear-gradient(...)`: математически точный расчёт 2x3 аффинной матрицы трансформации для любых углов (`deg`, `rad`, `turn`) и направлений (`to right`, `to bottom`, `to top right` и др.).
  - `radial-gradient(...)`.
  - Произвольное количество контрольных точек (color stops).
- **Скругления и границы**:
  - `border-radius`: единый радиус, 4 независимых угла (`border-top-left-radius` и др.), круг (`50%` -> `ELLIPSE`), пилюля (`9999px`).
  - Сглаживание углов (squircle / iOS smooth corners).
  - Границы: `border-width`, `border-style` (`solid`, `dashed`, `dotted`), `border-color`.
  - Независимые толщины сторон: `border-top-width`, `border-right-width`, `border-bottom-width`, `border-left-width`.
- **Эффекты, тени и режимы наложения**:
  - `box-shadow`: множественные тени, размытие `blur`, растяжение `spread`, смещение `offset`, а также внутренние тени `inset` (`INNER_SHADOW`).
  - Размытие слоев: `filter: blur(...)` (`FOREGROUND_BLUR`).
  - Размытие фона: `backdrop-filter: blur(...)` (`BACKGROUND_BLUR`).
  - Чистые режимы наложения: слои по умолчанию не засоряют инспектор свойств параметром `blendMode: NORMAL`, пока режим наложения явно не задан в CSS (`mix-blend-mode`).
- **Изображения и векторные иконки**:
  - `<img>`: локальные файлы, base64 data URIs (`data:image/png;base64,...`), удаленные URL (`http://`, `https://`).
  - Определение реальных размеров из бинарных заголовков (PNG, JPEG, GIF, WebP, SVG).
  - Режимы заполнения: `object-fit: cover` (`FILL`), `contain` (`FIT`), `fill` (`STRETCH`).
  - Хеширование через SHA-1 и встраивание файлов в директорию `images/<sha1>` архива `.fig`.
  - `<svg>`: встроенные SVG элементы, векторные иконки и иллюстрации.
  - Поддержка `<use href="#id">` и SVG-спрайтов с сохранением обводок (`stroke`, `stroke-width`, `currentColor`) и заливок.
- **Формы и компоненты**:
  - Кнопки `<button>`, `a.btn`, `a.cta` (адаптивные Auto Layout фреймы с автоматическим Hug / Fixed сайзингом).
  - Поля ввода `<input type="text|email|password|search">` с плейсхолдерами и чистыми параметрами типографики.
  - Чекбоксы `<input type="checkbox">` и радиокнопки `<input type="radio">`.
  - Разделители `<hr>` (`LINE` ноды).
  - Таблицы `<table>`, `<tr>`, `<td>`, `<th>`.
  - Списки `<ul>`, `<ol>`, `<li>`.

### 🔄 Декомпилятор .fig ➔ HTML/CSS
- **🖼 Graphic Subtree Collapsing & Cumulative Baking Engine (v1.5.0)**:
  - **Автоматическое схлопывание вырожденных графических цепочек**: устранение «мусорной» виртуальной вложенности слоев в Figma (`Group -> Group -> Mask Group -> Group -> Image`), порождаемой при сложном составлении иллюстраций и экспорте макетов.
  - **Кумулятивная 2D-аффинная геометрия**: матричное перемножение цепочки 2D-трансформаций ($M_{\text{cumulative}} = M_1 \times M_2 \times \dots \times M_n$) с извлечением результирующего угла поворота $\theta = \text{atan2}(b, a)$, масштабирования и смещения.
  - **Аппаратное запекание через Sharp**: поворот растра на вычисленный кумулятивный угол, наложение масок и центрирование под точные габариты холста с истинной альфа-прозрачностью (Retina @2x) в единый оптимизированный файл PNG/WebP без белых артефактов и обрезаний.
  - **Схлопывание дерева DOM**: замена 5+ уровней вложенных виртуальных слоёв-обёрток на один чистый семантический тег `<img>` (или карточку с единственным `<img>`) с точными габаритами и без каскадного сбоя CSS Box Model (без паразитных паддингов, паразитного `flex: 1`, относительных сдвигов и вложенных `rotate`).
- **🧭 Движок Smart Anchor & Constraint Resolution (v1.5.0)**:
  - **Интеллектуальный выбор CSS-привязок `right` и `bottom`**: для абсолютно позиционированных элементов (`position: absolute`) автоматический переход от жестких `top` / `left` к `bottom` и `right`.
  - **Приоритет дизайнерских Figma Constraints**: строгий учёт явных привязок к краям (`horizontalConstraint === 'MAX'` ➔ `right`, `verticalConstraint === 'MAX'` ➔ `bottom`).
  - **Геометрическая близость к граням родителя**: если элемент расположен ближе к правой или нижней грани контейнера ($|\text{distRight}| < |\text{distLeft}|$ или $|\text{distBottom}| < |\text{distTop}|$), движок автоматически генерирует `right` / `bottom`, сохраняя адаптивное поведение при ресайзе родительского фрейма.
  - **Адаптивные медиа-запросы**: автоматический сброс противоположных координат (`left: auto` / `right: auto`, `top: auto` / `bottom: auto`) при смене стороны привязки между брейкпоинтами.
- **📦 Сохранение явных размеров и отступов в Auto Layout (v1.5.0)**:
  - **Сохранение Fixed height в Bento-сетках**: корректная обработка `Fixed height` (например, `height: 200px`) у карточек внутри синтезированных вертикальных колонок (`Column`) в Bento-сетках.
  - Перенос `layoutGrow: 1` с дочерних карточек на саму синтезированную колонку и назначение `layoutAlign: STRETCH`, что предотвращает паразитное превращение карточек во `flex: 1` по высоте.
  - Защита нативных Auto Layout фреймов с фиксированной высотой от ошибочного снятия высоты через `isEqualHeightGroup`.
  - **Универсальная детекция асимметричных `padding` для всех осей**: прецизионный расчёт 4-сторонних отступов (`padding: top right bottom left`) для `HORIZONTAL`, `VERTICAL` и `GRID` контейнеров. Автоматическое восстановление опущенных в Kiwi нулевых сторон (`stackPaddingBottom: 0`, `stackPaddingRight: 0`), предотвращающее ошибочное схлопывание стилей в симметричный `padding: 24px 0px` вместо `padding: 24px 0px 0px 0px`.
  - **Аппаратное запекание Multiply в истинную альфа-прозрачность (Multiply-to-Alpha Baking)**: для растровых логотипов и изображений с режимом `blendMode: MULTIPLY` на светлом или белом фоне автоматическое математическое преобразование белого фона в честный альфа-канал через Sharp ($\alpha = 255 - \min(R,G,B)$). Решает проблему браузерных изолированных стековых контекстов (`opacity`, `overflow: hidden`), гарантируя чистое бесшовное отображение логотипов партнеров без белых фоновых плашек.
  - **Поддержка режима наложения Luminosity**: трансляция Figma `blendMode: LUMINOSITY` в связку CSS `mix-blend-mode: luminosity` и `filter: grayscale(1)`. Обеспечивает корректное монохромное отображение логотипов и графики на нейтральных и полупрозрачных фонах браузера в 100% соответствии с рендером Figma.
  - **Интеллектуальная защита иерархии наложения слоёв (Stacking Order Resolution)**: автоматическое обнаружение предшествующих блоков с не-обрезанными абсолютными дочерними элементами, выходящими за границы родительского фрейма (bleeding absolute children), с геометрической проверкой пересечения вертикальных координат ($y_{\text{bottom}} > y_{\text{siblingTop}}$). Назначение `position: relative; z-index: 1;` защищает последующие потоковые секции страницы от перекрытия выступающими элементами.
- **📱 Figma Adaptive Multi-Breakpoint Engine (v1.4.0)**:
  - **Кросс-девайсная адаптивная верстка из связанных фреймов**: автоматическое объединение макетов разных экранов (например, Desktop `1440px`, Tablet `768px`, Mobile `375px`) в **единый канонический HTML-документ** без дублирования DOM-дерева.
  - **AST Reconciliation & Similarity Matching**: интеллектуальный скоринг нод по контенту, именам слоев, типам и положению в иерархии с автоматическим связыванием соответствующих элементов.
  - **Гибридный синтез стилей (Fluid `clamp()` + Media Queries)**:
    - Непрерывные численные параметры (`font-size`, `padding`, `gap`, `border-radius`, `width`) интерполируются математической функцией `clamp(min, slope * 100vw + intercept, max)`, обеспечивая абсолютно плавное изменение размеров без скачков при ресайзе окна.
    - Дискретные изменения каркаса (`flex-direction: row` ➔ `column`, `grid-template-columns`, `order`) аккуратно выносятся в медиа-запросы `@media (max-width: 768px)`.
  - **Обработка эксклюзивных элементов (Exclusive Elements)**:
    - Десктопное меню (`.nav-links`) и мобильная кнопка (`.burger-btn`) сосуществуют в одном семантическом HTML-дереве и переключаются через чистый `display: none` / `display: flex` без JavaScript.
  - **Гибкая детекция и поддержка соглашений имён**:
    - Теги: `Home [desktop]`, `Home [mobile]`, `Catalog @1440`, `Catalog @375`, `Landing / Desktop`, `Home Mobile`.
  - **Поддержка Desktop-first и Mobile-first**:
    - По умолчанию Desktop-first (`@media (max-width: ...)`).
    - Флаг `--mobile-first` для генерации восходящих запросов (`@media (min-width: ...)`).
- **🌐 Figma Multi-Page Import Engine (v1.3.0)**:
  - **Многостраничный экспорт за одну команду**: декомпиляция проектов Figma с множеством экранов или вкладок в готовую модульную файловую структуру (`index.html`, `about.html`, `catalog.html`, `contacts.html`) с **единым оптимизированным файлом `css/style.css`**.
  - **Трёхуровневая детекция страниц**:
    - **Приоритет 1 (Явные теги и теги исключения)**: поиск маркированных фреймов (`[page]`, `[страница]`, `[p]`, `#page`, `/page` или кастомных через `--page-tag`). Имя страницы очищается и транслитерируется (`[page] Home` ➔ `index.html`, `[страница] О нас` ➔ `about.html`). Поддержка **тегов исключения** (`[exclude]`, `[исключить]`, `[исключение]`, `[ignore]`, `#exclude`, кастомных `--exclude-tag`), позволяющих исключить черновики, диалоги и модалки прямо в Figma.
    - **Приоритет 2 (Экранные артборды и Outlier Detection)**: автоматическое распознавание верхнеуровневых фреймов экрана (по умолчанию `width >= 320px`, `height >= 400px`) при отсутствии тегов. Первый экран становится `index.html`, остальные — `<slug>.html`. **Кластеризация по медианному размеру (Outlier Detection)** автоматически отсекает мелкие всплывающие окна и попапы от основного экрана.
    - **Приоритет 3 (Canvas вкладки)**: поддержка декомпиляции нативных страниц Figma (`CANVAS` узлы в Kiwi AST) по флагу `--all-canvases`.
  - **Smart DRY CSS**: слои на разных страницах с одинаковыми именами и полностью совпадающими стилями объединяются в единое правило (например, общий `.btn` или `.header`).
  - **Изоляция коллизий стилей (100% Conflict-Free)**: слои с одинаковыми именами, но разными параметрами автоматически изолируются страничными модификаторами (`.btn--cart`), предотвращая перезапись стилей.
  - **Разделение свойств `.main-container`**: базовые стили пишутся в `.main-container`, а индивидуальные параметры страницы — в модификатор (`.page-home-container`, `.page-about-container`).
  - **Единый пул ассетов и токенов**: изображения дедуплицируются по SHA-1 хешу в единую папку `img/`, а токены проекта объединяются в секцию `:root`.
- **📐 Интеллектуальный синтез адаптивной верстки (Layout Synthesis Engine)**:
  - **Полный отказ от `position: absolute`**: для макетов Figma, созданных дизайнерами **без единого Auto Layout**, движок автоматически группирует плоские абсолютные слои в гибкие Flexbox-контейнеры (`flex-direction: row | column`) и CSS Grid.
  - **Фаза 1. Spatial Normalization & Indexing**: точное вычисление 2D-габаритов (`BoundingBox`), пространственное индексирование и разрешение порядка наложения z-index.
  - **Фаза 2. Background & Container Induction**: автоматическое обнаружение прямоугольников-подложек (`RECTANGLE` с заливками, скруглениями или тенями), повышение их до семантических контейнеров и перенос стилей оформления на синтезированные `<div>` и `<button>` блоки.
  - **Фаза 3. Recursive XY-Cut & Fuzzy Clustering**: метод рекурсивного ортогонального разрезания пространства по 1D-профилям проекций с допуском неточностей дизайнера $\epsilon = 3\text{px}$ (Fuzzy Tolerance Clustering) для выравнивания строк, колонок и элементов (`align-items: center | flex-start`, `justify-content: space-between`).
  - **Фаза 4. Grid & Matrix Induction**: автоматическое распознавание регулярных матричных сеток карточек $N \times M$ и синтез нативного `display: grid; grid-template-columns: repeat(C, 1fr); column-gap: ...; row-gap: ...;` (с корректной трансляцией Kiwi-объектов `gridColumns.entries` в целочисленные повторения).
  - **Фаза 5. Flexbox Property Synthesis**: вычисление внутренних отступов (`padding`), промежутков (`gap`), правил растяжения (`align-self: stretch`, `width: 100%`) и изоляция декоративных оверлеев (`DECORATIVE_OVERLAY`).
  - **Иерархия слоёв и расчет `z-index`**: точное определение взаимного положения слоёв в Figma — фоновые подложки гарантированно получают `z-index: 0` и располагаются перед контентом, а для абсолютных фоновых декоративных изображений автоматически добавляется `pointer-events: none;`, предотвращая блокировку кликов по интерактивным элементам под ними.
  - **Корректная обработка Clip Content**: учёт параметра `frameMaskDisabled` в Figma Kiwi — если «Clip Content» отключён дизайнером, свойство `overflow: hidden` не добавляется, сохраняя естественное переполнение контента.
  - **Асимметричные отступы (`padding`)**: прецизионная трансляция 4-сторонних внутренних отступов с учётом опущенных нулевых значений из Kiwi (например, `padding: 64px 0px 0px 0px;`).
  - **Управление через CLI**: флаг `--smart-layout` (включен по умолчанию) и `--no-smart-layout` для отката к абсолютному позиционированию при необходимости.
- **Режимы вёрстки и адаптивность (Fluid & Relative)**:
  - **Fluid (резиновая вёрстка)**: главный контейнер страницы растягивается на всю ширину (`width: 100vw; min-height: 100dvh;`), для типографики и отступов генерируются гибкие выражения `clamp()`, `min()`, `max()`, подключается `<meta name="viewport" content="width=device-width, initial-scale=1">`, а вместо фиксированных пикселей используются `rem`, `em`, `vw`, `vh`.
  - **Relative (относительные единицы)**: замена всех фиксированных `px` на относительные единицы `rem`, `em`, `vw`, `vh` для гармоничного масштабирования шрифтов и отступов.
  - **Default**: классическая фиксированная вёрстка с точным соответствием размерам в Figma в `px`.
- **Оптимизация и обработка изображений**:
  - Автоматическое масштабирование картинок по размеру в CSS с множителем x2 для идеального Retina-качества.
  - Генерация адаптивных атрибутов `srcset` и `sizes` под экраны смартфонов, планшетов и компьютеров (с возможностью отключения через `--no-srcset`).
  - Сжатие картинок без потери качества (Lossless) через Sharp/MozJPEG.
  - Конвертация в ультрасовременные форматы `WebP` и `AVIF`.
- **Полный CSS Reset**: генерация современного сброса стилей (`*, *::before, *::after { box-sizing: border-box; }`, сброс кнопок, полей ввода, списков, таблиц, ссылок), гарантирующий консистентное отображение во всех браузерах.
- **Поддержка компонентов и переопределений (Instance Overrides)**:
  - Автоматическое разрешение `INSTANCE` нод через клонирование мастер-компонентов (`SYMBOL`).
  - Полное применение `symbolOverrides` и `componentPropAssignments`: подмена текста, переопределение размеров, заливок, обводок, видимости, `letterSpacing`, `lineHeight`, `fontSize`, `fontName`, скруглений и вариантов начертания.
- **Реконструкция векторной графики (SVG)**:
  - Декодирование бинарных потоков `commandsBlob` и `VectorNetwork` в нативные SVG `<path>`.
  - Автоматическое объединение чисто векторных фреймов и групп в единые цельные `<svg>` иконки.
  - Пропорциональное масштабирование координат векторов (`scale(sx, sy)`) под реальный размер фрейма.
  - Атрибут `vector-effect="non-scaling-stroke"` для защиты толщины линий от искажений при масштабировании.
- **Маски и запекание прозрачности (Mask Baking & Transparency)**:
  - **Автоматическое запекание масок в графические ассеты**: по умолчанию при экспорте слоёв с масками (`mask: true`), наложенными на изображения, движок через Sharp (`blend: 'dest-in'`) аппаратно запекает маску прямо в файл ассета с истинной альфа-прозрачностью (`hasAlpha: true`, PNG 32-bit / WebP).
  - Поддержка радиальных (`GRADIENT_RADIAL`) и линейных (`GRADIENT_LINEAR`) градиентных масок с сохранением углов и прозрачности, геометрических форм (`ELLIPSE`, `cornerRadius`) и растровых масок (`IMAGE`).
  - Полное исключение костыльных `mix-blend-mode: darken` и искусственных белых фонов (`background-color: #ffffff;`), гарантирующее идеальное отображение на любых фонах в 100% браузеров без белых ореолов и проблем Safari.
  - **Ручной режим CSS-масок по тегу (`[mask]`, `[маска]`)**: при наличии тегов `[mask]`, `[маска]`, `#mask`, `/mask` запекание в файл пропускается и генерируется нативный CSS `mask-image` / `-webkit-mask-image`.
  - Сохранение фиксированных габаритов `width` и `height` у Mask Group контейнеров.
- **Прецизионный Auto Layout и Flexbox**:
  - Чёткое разделение основной и поперечной осей (`isRow` vs `!isRow`).
  - Сохранение фиксированных размеров на основной оси при растяжении (`align-self: stretch`) по поперечной (например, `width: 256px` у растянутого сайдбара).
  - Режимы распределения `SPACE_BETWEEN` и `SPACE_EVENLY` транслируются в чистый `justify-content: space-between`.
  - Поддержка режимов **Hug contents** (отсутствие жестких `width`/`height`), **Fixed** (`px`), и **Fill container** (`flex: 1`).
  - Автоматическое вертикальное центрирование текста при `textAlignVertical: CENTER`.
- **Типографика и обрезка текста**:
  - Поддержка множителей `line-height` (единицы `RAW`, `PERCENT`, `PIXELS`).
  - Межбуквенный интервал `letter-spacing` (относительные `em` и фиксированные `px`, включая отрицательные значения вроде `-3%` -> `-0.03em`).
  - **Градиентный текст**: поддержка линейных и радиальных градиентов для текстовых слоёв с автоматической генерацией `background-image: linear-gradient(...)`, `-webkit-background-clip: text`, `-webkit-text-fill-color: transparent`.
  - Параметр **Truncate text** из Figma: генерация `text-overflow: ellipsis; white-space: nowrap; overflow: hidden; min-width: 0`.
- **Типизированные `:root` CSS-переменные**:
  - Контекстно-зависимая группировка: радиусы (`--radius-*`), цвета (`--color-*`), шрифты (`--font-*`), габариты холстов (`--slide-*`).
  - Исключение случайной подстановки переменных одного типа в свойства другого (например, радиусов в ширину или отступы).

---

## 🚀 Установка и быстрый старт

### Запуск через CLI

#### 1. Прямая конвертация: HTML ➔ .fig
```bash
# Простой запуск для HTML файла:
node cli.js index.html

# Указание имени выходного файла:
node cli.js landing.html landing.fig

# Или через npm script:
npm run build
```

#### 2. Обратная конвертация: .fig ➔ HTML
```bash
# Декомпиляция .fig файла в чистый автономный HTML (Retina 2x + адаптивный srcset / sizes):
node cli-reverse.js design.fig

# Автоматическое слияние связанных экранов (Desktop, Tablet, Mobile) в единый responsive сайт (v1.4.0):
node cli-reverse.js design.fig index.html --responsive

# Явное указание целевых брейкпоинтов:
node cli-reverse.js design.fig index.html --breakpoints 1440,1024,768,375

# Подход Mobile-first (min-width вместо max-width):
node cli-reverse.js design.fig index.html --mobile-first -s

# Полноценная резиновая (fluid) вёрстка на всю ширину (100vw / 100dvh, clamp(), min(), max(), rem):
node cli-reverse.js design.fig index.html --fluid

# Использование относительных единиц измерения (rem, em, vw, vh вместо px):
node cli-reverse.js design.fig index.html --relative

# Декомпиляция с генерацией адаптивной CSS Grid сетки вместо Flexbox:
node cli-reverse.js design.fig index.html --grid
# или:
node cli-reverse.js design.fig index.html --layout grid

# Многостраничный экспорт в модульный сайт (dist/*.html + dist/css/style.css + dist/img/*):
node cli-reverse.js website.fig dist -s --webp

# Экспорт всех Canvas-вкладок документа Figma:
node cli-reverse.js website.fig dist --all-canvases -s

# Экспорт только выбранных страниц через фильтр:
node cli-reverse.js website.fig dist --pages "Home, About, Pricing" -s

# Экспорт нативных Figma Variables в файл дизайн-токенов JSON (W3C Design Tokens format):
node cli-reverse.js design.fig index.html --tokens tokens.json

# Декомпиляция с вынесением CSS в отдельный файл css/style.css и картинок в img/*:
node cli-reverse.js design.fig -s
# или:
node cli-reverse.js design.fig index.html --separate-files

# Резиновая вёрстка с отдельными WebP картинками и внешним CSS:
node cli-reverse.js design.fig index.html -s --fluid --webp

# Экспорт с картинками в современном формате WebP:
node cli-reverse.js design.fig index.html -s --webp

# Экспорт с картинками в формате AVIF и сжатием без потери качества (lossless):
node cli-reverse.js design.fig index.html -s --avif --compress

# Отключение адаптивного srcset (генерирует единую четкую 2x Retina картинку в src):
node cli-reverse.js design.fig index.html --no-srcset

# Декомпиляция макетов без Auto Layout в чистый Flexbox/Grid (включено по умолчанию):
node cli-reverse.js unorganized.fig index.html

# Принудительный откат к традиционному position: absolute:
node cli-reverse.js unorganized.fig index.html --no-smart-layout

# Указание имени выходного файла и страницы:
node cli-reverse.js showcase.fig output.html --page "Page 1"

# Тонкая настройка путей к CSS и картинкам:
node cli-reverse.js test/hard.fig index.html --extract-css --css-file styles/main.css --assets-dir assets
```

> 📖 **Подробное руководство для дизайнеров**: советы по созданию макетов для идеального 100% Pixel-Perfect экспорта в HTML/CSS читайте в [**docs/figma-design-guide.md**](docs/figma-design-guide.md).

Вы также можете связать утилиты глобально:
```bash
npm link
html-to-fig input.html output.fig
fig-to-html input.fig output.html
```

---

## 💻 CLI Справка

### html-to-fig
```text
USAGE:
  $ html-to-fig <input.html|.fig> [output] [options]
  $ html-to-fig -i <input.html> -o <output.fig>

ARGUMENTS:
  <input>           Путь к исходному HTML или .fig файлу
  [output]          Путь к создаваемому файлу (по умолчанию: <имя-файла>.fig или .html)

OPTIONS:
  -i, --input <file>       Входной файл
  -o, --output <file>      Выходной файл
  -t, --template <file>    Файл шаблона .fig (по умолчанию: templates/template.fig)
  -p, --page <name>        Имя страницы в Figma (по умолчанию: "Page 1")
  -w, --watch              Режим наблюдения (автосборка при изменении)
  --no-remote-images     Отключить скачивание внешних картинок (HTTP/HTTPS)
  -v, --verbose            Подробные логи процесса сборки
  -h, --help               Справка по командам
  -V, --version            Версия утилиты
```

### fig-to-html
```text
USAGE:
  $ fig-to-html <input.fig> [output.html] [options]
  $ fig-to-html -i <input.fig> -o <output.html>

OPTIONS:
  -i, --input <file>       Входной .fig файл
  -o, --output <file>      Выходной .html файл или директория
  -p, --page <name>        Имя страницы в Figma (по умолчанию: "Page 1")
  --multi-page             Включить многостраничный режим (по умолчанию: включен при наличии страниц)
  --single-page            Принудительный экспорт только одной (первой/указанной) страницы
  --page-tag <tag>         Кастомный тег или список тегов в названии фреймов ([page],[страница])
  --exclude-tag <tag>      Тег или список тегов для исключения фреймов из экспорта ([exclude],[исключить])
  --no-outlier-detection   Отключить фильтрацию модалок и диалогов по медианному размеру
  --pages <names>          Список конкретных страниц/фреймов для экспорта через запятую
  --all-canvases           Экспортировать все Canvas-вкладки документа Figma как отдельные страницы
  --min-page-width <px>    Минимальная ширина фрейма для признания отдельной страницей (по умолчанию: 320)
  --min-page-height <px>   Минимальная высота фрейма для признания отдельной страницей (по умолчанию: 400)
  --class-scope <mode>     Режим изоляции конфликтующих классов: modifier, scoped, numbered (по умолчанию: modifier)
  -w, --watch              Режим наблюдения (авторебилд при изменении .fig)
  --responsive             Автоматическое слияние связанных экранов в единый responsive сайт (по умолчанию: включено)
  --no-responsive          Отключить слияние брейкпоинтов (экспортировать каждый экран отдельной HTML страницей)
  --breakpoints <list>     Целевые ширины брейкпоинтов через запятую (например: "1440,768,375")
  --mobile-first           Генерация стилей Mobile-first (min-width вместо max-width)
  -s, --separate-files     Извлекать отдельный CSS (css/style.css) и картинки (img/*)
  --extract-css            Вынести стили в отдельный .css файл вместо <style> в <head>
  --css-file <path>        Путь для внешнего файла стилей (по умолчанию: "css/style.css")
  --no-inline-images       Извлекать изображения в отдельные файлы вместо Base64
  --assets-dir <dir>       Папка для извлеченных картинок (по умолчанию: "img")
  --inline-styles          Генерировать инлайн-атрибуты style="..." вместо классов
  --image-scale <n>        Множитель размера картинок от размера в CSS (по умолчанию: 2 для Retina x2)
  --no-srcset              Отключить адаптивный srcset / sizes для разных устройств
  -c, --compress           Сжатие изображений без потери качества (lossless)
  --format <fmt>           Конвертация в современный формат: webp, avif, original (по умолчанию: original)
  --webp                   Шорткат для --format webp
  --avif                   Шорткат для --format avif
  --layout <mode>          Режим вёрстки: default (px), relative (rem/em/vw/vh), fluid (clamp/min/max) или grid
  --fluid                  Шорткат для --layout fluid (100vw/100dvh, clamp(), rem, vw/vh)
  --relative, --rem        Шорткат для --layout relative (rem, em, vw/vh вместо px)
  --grid                   Шорткат для --layout grid (CSS Grid разметка)
  --tokens [path]          Экспорт Figma Variables в файл дизайн-токенов JSON (по умолчанию: tokens.json)
  --smart-layout           Синтез адаптивного Flexbox/Grid без position: absolute (по умолчанию: включен)
  --no-smart-layout        Отключить синтез разметки и использовать абсолютное позиционирование
  -v, --verbose            Подробные логи процесса
  -h, --help               Справка по командам
  -V, --version            Версия утилиты
```

---

## 🛠 Программный API (Node.js)

Вы можете использовать библиотеку в своих скриптах и бэкендах для обоих направлений:

### Прямая конвертация (HTML ➔ .fig)
```javascript
const { generateFigFile } = require('html-to-fig');

async function build() {
    const result = await generateFigFile({
        htmlPath: 'test/hard.html',
        outputPath: 'output.fig',
        templatePath: 'templates/template.fig', // опционально
        pageName: 'Page 1',
        verbose: true
    });

    console.log(`Создано ${result.generatedNodes} нод за ${result.durationMs}мс!`);
    console.log(`Файл: ${result.outputPath} (${result.fileSizeBytes} байт)`);
}

build();
```

### Обратная конвертация (.fig ➔ HTML)
```javascript
const { convertFigToHtml } = require('html-to-fig');

async function decompile() {
    // 1. Автономный единый HTML файл (все стили в <head><style>, картинки в Base64):
    const result1 = await convertFigToHtml('showcase.fig', {
        outputHtmlPath: 'output.html',
        pageName: 'Page 1',
        inlineImages: true,
        verbose: true
    });

    // 2. Модульная структура с отдельным CSS (css/style.css), картинками WebP и сжатием без потерь:
    const result2 = await convertFigToHtml('showcase.fig', {
        outputHtmlPath: 'dist/index.html',
        separateFiles: true, // создает dist/css/style.css и dist/img/*
        imageScale: 2,       // масштабирование под CSS размер x2 для Retina качества
        responsiveImages: true, // генерация srcset и sizes под разные устройства
        compress: true,      // сжатие без потери качества (lossless)
        imageFormat: 'webp', // современные форматы: 'webp', 'avif' или 'original'
        verbose: true
    });

    // 3. Полноценная резиновая (fluid) вёрстка на всю ширину страницы:
    const result3 = await convertFigToHtml('showcase.fig', {
        outputHtmlPath: 'dist/fluid.html',
        layoutMode: 'fluid', // 'fluid' (100vw, 100dvh, clamp, min, max, rem) | 'relative' (rem, em, vw, vh) | 'default' (px)
        separateFiles: true,
        imageFormat: 'webp',
        verbose: true
    });

    // 4. Полноценный многостраничный экспорт сайта (index.html, about.html, catalog.html + css/style.css):
    const result4 = await convertFigToHtml('website.fig', {
        outputHtmlPath: 'dist/index.html',
        multiPage: true,      // автоопределение тегов [page] и экранных артбордов
        separateFiles: true,  // единый оптимизированный css/style.css и дедуплицированный пул img/*
        imageFormat: 'webp',
        verbose: true
    });

    // 5. Адаптивное слияние связанных экранов (Desktop, Tablet, Mobile) в единый сайт (v1.4.0):
    const result5 = await convertFigToHtml('responsive.fig', {
        outputHtmlPath: 'dist/index.html',
        responsive: true,     // объединяет связанные фреймы в 1 канонический HTML-документ
        separateFiles: true,  // dist/index.html + dist/css/style.css
        breakpoints: '1440,768,375'
    });
    console.log(`Экспортировано ${result4.pages.length} страниц: ${result4.pages.map(p => p.fileName).join(', ')}`);

    console.log(`Декомпилировано ${result2.totalNodes} нод за ${result2.durationMs}мс!`);
    console.log(`HTML: ${result2.outputPath}, CSS: ${result2.cssPath}, Assets: ${result2.assetsDir}`);
}

decompile();
```

---

## 🧪 Тестирование

Проект покрыт всесторонними автоматическими тестами (131 тест):
- Парсинг цветов (HEX, RGB, RGBA, HSL, HSLA, named, modern space-slash syntax, alpha)
- Линейные и радиальные градиенты, расчёт и обратный пересчет углов матриц трансформации
- Тени (drop-shadow, inset, multiple, zero spread) и фильтры размытия
- Типографика (font-weight, style, line-height multipliers, letter-spacing, Rich Text)
- Определение габаритов изображений и хеширование SHA-1
- Сквозная генерация и проверка валидности структуры декодером Figma Kiwi
- Тестирование на сложных реальных макетах (`test/showcase.html` и `test/hard.html`)
- Декомпиляция .fig в валидный адаптивный HTML с сохранением семантики, Flexbox и графики
- Автоматическое формирование `:root` переменных и семантических классов слоев с транслитерацией
- Определение форматов изображений по Magic Bytes и экспорт раздельных файлов (`css/style.css`, `img/*`)
- Изменение размера изображений по размеру в CSS с множителем x2 для лучшего Retina-качества
- Добавление адаптивных размеров под разные устройства (mobile, tablet, desktop) через `srcset` и `sizes`
- Возможность отключения `srcset` / `sizes` через параметр CLI (`--no-srcset`)
- Сжатие размера и качества картинок без потери качества (lossless, mozjpeg, webp/avif lossless)
- Конвертация изображений в современные медиа-форматы (`WebP`, `AVIF`) через параметры CLI
- Относительные единицы измерения (`rem`, `em`, `vw`, `vh`) вместо фиксированных `px` (`--relative`, `--rem`)
- Полноценная резиновая (fluid) вёрстка на всю ширину страницы (`width: 100vw; min-height: 100dvh;`) с функциями `min()`, `max()`, `clamp()` (`--fluid`)
- Добавление `<meta name="viewport" content="width=device-width, initial-scale=1">` для полной мобильной адаптивности
- Полный Round-Trip тест: HTML ➔ .fig ➔ HTML с проверкой целостности всех элементов
- Декодирование бинарных `commandsBlob` и `VectorNetwork` в масштабируемые SVG пути
- Сохранение фиксированных габаритов Auto Layout при растяжении по поперечной оси (`align-self: stretch`)
- Полная поддержка `symbolOverrides` для инстансов компонентов (подмена текста, переопределения `letter-spacing`, `line-height` и стилей)
- Корректная обработка масок и встраивание замаскированных картинок в поток документа
- Поддержка нативных переменных Figma (`VARIABLE_SET`, `VARIABLE`) и экспорт дизайн-токенов в JSON (`--tokens`)
- Трансляция CSS Grid (`repeat(N, 1fr)`) в Auto Layout Wrap и обратная декомпиляция (`--layout grid`, `--grid`)
- Генерация интерактивных связей прототипа (`prototypeInteractions`) для состояний `:hover`
- Интерактивный терминальный прогресс-бар в реальном времени с процентами, этапами и таймером для конвертации больших файлов (`cli.js`, `cli-reverse.js`)
- Трансляция Figma Auto line-height (100% или AUTO) в нативный CSS `line-height: normal` (вместо жесткого `1`)
- Автоматическое обнаружение Google Fonts и расчет размеров текста по таблице метрик `FONT_METRICS_TABLE`
- Оптимизация памяти при чтении бинарных `.fig` (ленивое декодирование изображений в Base64)
- **Layout Synthesis Engine**:
  - Геометрические операции `BoundingBox`: вычисление пересечений, объединений, расстояний и частичных перекрытий границ
  - 1D-проекции и нечеткая кластеризация интервалов (Fuzzy Interval Clustering, $\epsilon = 3\text{px}$)
  - Детекция карточек-подложек и повышение прямоугольников до семантических контейнеров с переносом стилей
  - Изоляция декоративных оверлеев (бейджи, кнопки закрытия) с сохранением локального `position: absolute`
  - Распознавание $N \times M$ матричных сеток элементов с равномерным шагом и отступами
  - Рекурсивный синтез разметки Recursive XY-Cut: построение колонок и строк Flexbox с автоматическим вычислением gap и padding
  - Равномерное адаптивное распределение `flex: 1` для карточек и элементов равной ширины с поддержкой смешанных строк (outlier items сохраняют фиксированную ширину)
  - Приоритет верхнего выравнивания (`align-items: flex-start`) для строк карточек и блоков при совпадении верхних границ (`allTopsAligned`) для аккуратной адаптивности при разной высоте контента
  - Снятие избыточных `width` и `height` с кнопок (`.btn-*`, `button`) и синтезированных строк/контейнеров
  - Корректная иерархия наложения абсолютных оверлеев с назначением `z-index` (>= 10) над контентом карточек и предотвращением обрезки через `overflow: hidden`
  - Предварительная изоляция выступающих за границы холста или перекрывающих элементы оверлеев, предотвращающая искажение внутренних отступов (`padding`) контейнеров
  - Поддержка настроек цветокоррекции изображений Figma (`paintFilter`: Exposure, Contrast, Saturation, Temperature, Tint) с трансляцией в CSS `filter`
  - Адаптивный резиновый корневой контейнер `.main-container` с `max-width` вместо фиксированного `width`
  - Интеллектуальный расчет ритма секций: при неравномерных зазорах дочерним блокам назначаются точечные `margin-top` вместо искусственного общего `gap`
  - Трансляция Auto Layout `SPACE_BETWEEN` и `SPACE_EVENLY` в `justify-content: space-between`
  - Интеллектуальный расчет взаимного порядка слоев и `z-index` (фоновые подложки с `z-index: 0` vs контент с `z-index: 1`) с добавлением `pointer-events: none` для фоновых декоративных изображений
  - Сохранение фиксированных размеров `width` и `height` у Mask Group контейнеров
  - Парсинг объектов `gridColumns.entries` в Kiwi в целочисленный синтаксис `repeat(N, 1fr)` в CSS Grid
  - Наложение линейных и радиальных градиентов на текст (`-webkit-background-clip: text`, `-webkit-text-fill-color: transparent`, `background-image: linear-gradient(...)`)
  - Прецизионное сохранение 4-сторонних асимметричных `padding` с восстановлением опущенных Kiwi нулевых сторон
  - Отключение `overflow: hidden` при отключенном Clip Content (`frameMaskDisabled: true`)
  - Парсинг CLI-флагов `--smart-layout` и `--no-smart-layout`
  - End-to-End декомпиляция макетов без единого Auto Layout фрейма в чистый Flexbox и CSS Grid без `position: absolute`
  - Проверка сохранения традиционного абсолютного позиционирования при флаге `--no-smart-layout`
- **Figma Multi-Page Import Engine (v1.3.0)**:
  - Транслитерация кириллических названий страниц в URL-совместимые латинские имена файлов (`RU_MAP`)
  - Распознавание явных тегов страниц (`[page]`, `[страница]`, `[p]`, `#page`, `/page`) и кастомных тегов (`--page-tag`)
  - Поддержка тегов исключения (`[exclude]`, `[исключить]`, `[исключение]`, `[ignore]`, `#exclude`, `--exclude-tag`)
  - Автоматическое определение страниц по экранным артбордам (`width >= 320px`, `height >= 400px`)
  - Кластеризация по медианному размеру (Outlier Detection) для отсечения модальных окон и диалогов
  - Экспорт нативных Canvas-вкладок Figma документа (`--all-canvases`, `--pages`, `--single-page`)
  - Интеллектуальная дедупликация идентичных стилей между страницами в единый CSS-класс (Smart DRY CSS)
  - Автоматическое разрешение коллизий стилей при одинаковых именах слоев через страничный модификатор (`.btn--cart`)
  - Разделение свойств корневого `.main-container` и страницы (`.page-index-container`, `.page-about-container`)
  - Сквозной E2E-тест многостраничного экспорта: генерация сайта `dist/*.html` с общим `dist/css/style.css` и дедуплицированными ассетами
- **Figma Adaptive Multi-Breakpoint Engine (v1.4.0) & Mask Baking**:
  - Распознавание тегов брейкпоинтов во всех синтаксисах (`[desktop]`, `[mobile]`, `@1440`, `@375`, `/desktop`, `Mobile`)
  - Группировка экранных фреймов в канонические адаптивные страницы
  - AST Similarity Matching и сопоставление соответствующих элементов между вьюпортами
  - Изоляция эксклюзивных десктопных и мобильных элементов (`display: none` / `display: flex`)
  - Синтез непрерывных формул `clamp()` и дискретных `@media` запросов
  - Сквозная декомпиляция мульти-брейкпоинт проектов в единый канонический HTML-документ
  - Автоматическое запекание радиальных/линейных масок в растровые изображения через Sharp (`dest-in`) с истинным альфа-каналом и исключение артефактов `mix-blend-mode`
  - Поддержка явных тегов `[mask]`, `[маска]`, `#mask`, `/mask` для сохранения CSS `mask-image`
- **Graphic Subtree Collapsing & Cumulative Baking Engine (v1.5.0)**:
  - Математическое умножение 2D-матриц Figma Kiwi и кумулятивное накопление трансформаций
  - Вычисление результирующего угла поворота $\theta = \text{atan2}(b, a)$, масштаба и трансляции
  - Детекция вырожденных графических цепочек (`detectGraphicSubtreeChain`)
  - Защита от ложных срабатываний: отклонение поддеревьев с текстом, кнопками или параллельным контентом
  - Аппаратное запекание составного ассета через Sharp с поворотом, маской и масштабированием Retina 2x под точные габариты холста
  - Схлопывание виртуальных слоёв в дереве DOM и генерация чистого семантического `<img>` без паразитных отступов и `flex`
  - Декомпиляция аффинных вращений из матриц трансформации с сохранением координат дочерних элементов
- **Bento & Smart Anchors Engine (v1.5.0)**:
  - Сохранение явного `Fixed height` (200px) у карточек внутри синтезированных Bento-колонок
  - Разрешение привязок `bottom`/`right` vs `top`/`left` на основе геометрической близости к граням и Figma Constraints (`MAX`)
  - Автоматический сброс противоположных координат (`auto`) при смене стороны привязки в адаптивных медиа-запросах
  - Сохранение асимметричного 4-стороннего `padding` для всех типов Auto Layout контейнеров (`HORIZONTAL`, `VERTICAL`, `GRID`)
  - Защита иерархии наложения слоёв (`position: relative; z-index: 1`) с проверкой физических вертикальных координат перекрытия
  - Аппаратное запекание растровых изображений с `blendMode: MULTIPLY` в альфа-прозрачность (`bakeMultiplyImages`)
  - Поддержка `blendMode: LUMINOSITY` в CSS с автоматической генерацией `filter: grayscale(1)`

Запуск тестов:
```bash
npm test
```

---

## 📁 Структура проекта

```text
html-to-fig/
├── cli.js                  # Главный CLI интерфейс (HTML -> FIG и автодетекция)
├── cli-reverse.js          # CLI интерфейс декомпилятора (FIG -> HTML)
├── index.js                # Главная точка входа программного API (двусторонний)
├── package.json            # Зависимости и метаданные проекта
├── docs/
│   └── cli-demo.svg        # Векторная демонстрация работы терминала (SVG)
├── templates/
│   └── template.fig        # Эталонный бинарный шаблон Figma контейнера
├── src/
│   ├── generator.js        # Оркестратор сборки бинарного .fig (Kiwi + Zstd)
│   ├── converter.js        # HTML/CSS -> Figma AST транслятор (Auto Layout, Layout Pass)
│   ├── schema.js           # Компилятор и кэш Kiwi схемы
│   ├── decompiler/         # ДВИЖОК ОБРАТНОЙ КОНВЕРТАЦИИ (FIG -> HTML)
│   │   ├── index.js        # Главный оркестратор декомпиляции
│   │   ├── graphic-collapser.js # Кумулятивная аффинная геометрия и схлопывание поддеревьев (v1.5.0)
│   │   ├── page-detector.js # Детекция страниц (теги, артборды, Canvas) и санитизация URL
│   │   ├── breakpoint-detector.js # Детекция брейкпоинтов и группировка адаптивных страниц
│   │   ├── ast-aligner.js  # AST Similarity Matching и сопоставление нод между экранами
│   │   ├── geometry.js     # BoundingBox, 1D-проекции, Fuzzy Clustering и интервалы
│   │   ├── container-detector.js # Обнаружение карточек-подложек и изолирование оверлеев
│   │   ├── synthesizer.js  # Recursive XY-Cut, детекция сеток N x M и Auto Layout синтез
│   │   ├── reader.js       # Чтение .fig ZIP, декомпрессия Kiwi и извлечение картинок
│   │   ├── tree.js         # Восстановление иерархии сцены, инстансы компонентов и overrides
│   │   ├── stylesheet.js   # Менеджер CSS-классов, генерация :root переменных, дедупликация и транслитерация
│   │   ├── css.js          # Трансляция Figma AST стилей в чистый CSS, Smart Anchors (v1.5.0)
│   │   ├── responsive-css.js # Генерация адаптивных медиа-запросов и fluid clamp() формул
│   │   ├── units.js        # Преобразование единиц (rem, em, vw, vh) и fluid-расчеты (clamp, min, max)
│   │   ├── html.js         # Генерация семантического HTML5, форм и Rich Text
│   │   ├── image-optimizer.js # Оптимизация картинок (Retina 2x, WebP/AVIF, srcset) и запекание масок
│   │   └── vector.js       # Декодирование бинарных VectorNetwork и commandsBlob в SVG
│   ├── parsers/
│   │   ├── color.js        # Парсер всех типов CSS цветов
│   │   ├── gradient.js     # Парсер линейных и радиальных градиентов
│   │   ├── effects.js      # Парсер теней и размытий
│   │   ├── typography.js   # Шрифты, стили текста, CSS переменные, габариты
│   │   ├── images.js       # Реестр изображений, SHA-1, base64, remote fetch
│   │   └── svg.js          # Обработчик встроенного SVG и <use> символов
│   └── utils/
│       └── guid.js         # Генератор GUID и лексикографических индексов
└── test/
    ├── run-tests.js        # Автоматический тестовый запуск (131 тест)
    ├── test.html           # Базовый тестовый HTML
    ├── showcase.html       # Демонстрационный макет со всеми базовыми фичами
    └── hard.html           # Сложный макет (Instagram deck, CSS vars, SVG use, сетки)
```

---

## 📄 Лицензия

MIT
