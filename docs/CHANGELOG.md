# 📜 Changelog

All notable changes to the **Figmatik** (`figmatik`) project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.6.0] - 2026-11-10

### Added
- **Enterprise Tailwind CSS Engine (v3 & v4 Oxide)**:
  - Full bidirectional support: декомпиляция `.fig ➔ HTML/JSX/Vue/Svelte` с утилитами Tailwind и компиляция `HTML+Tailwind ➔ .fig` с нативным Auto Layout.
  - Поддержка **Tailwind v4 (Oxide / CSS-first)**: генерация `@import "tailwindcss";` и директив `@theme` с CSS-переменными темы.
  - Поддержка **Tailwind v3**: создание классических конфигураций `tailwind.config.js` и `postcss.config.js`.
  - **Component Framework Exporters**:
    - React JSX/TSX (`--react`, `--jsx`, `--tsx`): генерация типизированных функциональных компонентов с `className`, интерфейсом `Props` и самозакрывающимися тегами.
    - Vue 3 SFC (`--vue`): генерация Single File Components с секциями `<template>`, `<script setup lang="ts">` и `<style scoped>`.
    - Svelte (`--svelte`): генерация чистых компонентов `.svelte`.
  - **Full Project Scaffolding (`--scaffold <dir>`)**: автоматическое развертывание готового production-проекта со сборщиком, `package.json`, скриптами `dev`/`build` и структурой файлов.
  - **Hybrid BEM + `@apply` Mode (`--tailwind-mode hybrid`)**: сохранение семантических классов в HTML и вынос утилит в CSS через `@apply`.
  - **Smart 4px Scale Snapping**: интеллектуальная привязка числовых значений к стандартной сетке Tailwind с поддержкой настраиваемого порога (`--tailwind-tolerance`) и генерацией произвольных JIT-значений `[17px]`.
  - **Zero-Dependency Preview**: автоматическое внедрение официального скрипта Tailwind Play CDN в автономный HTML (отключается флагом `--no-tailwind-cdn`).
  - Всесторонний маппинг Auto Layout, Flexbox, CSS Grid, градиентов (`bg-gradient-to-*`), типографики, теней, blend modes и SVG-иконок.
- **Расширение тестового покрытия**:
  - Общий объем тестов увеличен до **238 тестов** в 47 тестовых группах (100% passed).

### Security
- **Comprehensive Security Hardening Suite**:
  - **Anti-SSRF Engine**: строгая блокировка обращения к приватным и служебным IP-диапазонам (RFC 1918, RFC 3927 Cloud Metadata `169.254.169.254`, IPv6 loopback и ULA `fc00::/7`).
  - **Pre-Connection DNS Resolution**: предварительное разрешение всех A и AAAA записей домена через `dns.promises.lookup({ all: true })` перед открытием соединения.
  - **Socket-Level DNS Rebinding Protection (TOCTOU)**: инспекция физического адреса `socket.remoteAddress` на событии `'connect'` для предотвращения атак с подменой IP на лету.
  - **HTTP Redirect Hardening**: ограничение глубины цепочки редиректов (максимум 5 хопов), белый список протоколов (`http:`, `https:`) и повторная валидация IP на каждом шаге.
  - **Safe Atomic File Writing**: безопасная запись файлов на диск через генерацию уникальных временных файлов с последующим атомарным вызовом `renameSync`, исключающим повреждение данных и гонки процессов.
  - **Zip Slip & Symlink Traversal Defense**: строгая нормализация путей и проверка выхода за пределы целевой директории через `path.relative` при распаковке ассетов из `.fig`.
  - **CLI System Path Guard**: защита критических системных путей (`/`, `/etc`, `/bin`, `/usr`, `C:\Windows`) от непреднамеренной перезаписи при указании аргументов CLI.
  - **Decompression Bomb Protection**: строгие лимиты при распаковке Kiwi/Zstd архивов (максимум 100 МБ распакованного размера, коэффициент сжатия не более 100:1).
  - **SVG Sanitization**: очистка векторных SVG от `<script>`, внедренных событий `onload`/`onerror`, внешних сущностей (XXE) и опасных протоколов `javascript:`.
  - **Call Stack & Resource Limits**: ограничение максимальной глубины обхода DOM-дерева для защиты от переполнения стека (Call Stack Overflow DoS).

---

## [1.5.5] - 2026-11-08

### Added
- **Официальные декларации типов TypeScript (`index.d.ts`)**:
  - Полная типизация функций `convertFigToHtml` и `generateFigFile`.
  - Строгие типы опций компилятора (`GenerateFigOptions`), декомпилятора (`ConvertFigOptions`), структур страниц (`PageResult`), результатов (`ConvertFigResult`, `GenerateFigResult`) и Kiwi AST нод.
- **Интеграция TypeScript в CI**:
  - Файл конфигурации `tsconfig.json` в режиме `NodeNext`.
  - Скрипт `npm run test:types` (`tsc --noEmit`) с автоматической валидацией в GitHub Actions.
- **Авторская информация и контакты**:
  - Официальные контакты автора в Telegram ([@konstantin_belan](https://t.me/konstantin_belan)) и email.

---

## [1.5.4] - 2026-11-08

### Changed
- **100% Pure ES Modules (ESM)**:
  - Полный переход кодовой базы на стандарты ECMAScript Modules (`"type": "module"`, `import`/`export`, префиксы `node:*`).
  - Бесшовная работа в Node.js 18, 20, 22 без необходимости использования транспиляторов (No Build Step).
- **Модульная декомпозиция конвертера и декомпилятора**:
  - Декомпозиция генератора стилей `css.js` на модули: `color-formatter.js`, `gradient-formatter.js`, `effects-formatter.js`, `typography-formatter.js`, `layout-styles.js`.
  - Декомпозиция компилятора `converter.js` на процессоры элементов: `container.js`, `text.js`, `image.js`, `svg.js`, `interactive.js`, `media.js`.
- **Модульный тестовый раннер**:
  - Разделение наборов тестов на категории: `test/unit/`, `test/integration/`, `test/e2e/` с поддержкой фильтрации по домену (`--domain`) и шаблону (`--grep`).

---

## [1.5.3] - 2026-11-07

### Added
- **Глобальная дедупликация стилей (DRY CSS & Class Reuse)**:
  - Алгоритмический анализ сигнатур стилей элементов для слияния идентичных безымянных слоев в переиспользуемые CSS-классы.
- **Шкала примитивных Spacing-токенов (`:root`)**:
  - Автоматическое извлечение повторяющихся значений отступов (`padding`, `margin`, `gap`) в шкалу токенов `--space-1`...`--space-N`.
- **Изоляция пространств имен токенов**:
  - Предотвращение коллизий между токенами скруглений (`--radius-*`) и отступов (`--space-*`) при совпадении числовых значений.
- **Стандарты доступности (Accessibility / A11y)**:
  - Добавление `alt=""` и `aria-hidden="true"` для декоративной графики, `focusable="false"` для SVG.
  - Автоматическое вычисление семантического `aria-label` для кнопок-иконок без текста.
  - Встроенный глобальный доступный фокус `:focus-visible`.
- **Автоматическое определение языка (i18n)**:
  - Анализ соотношения кириллицы и латиницы в тексте макета для генерации `<html lang="en">` или `<html lang="ru">`.
- **Иерархический анализатор заголовков**:
  - Строгий контроль ровно одного `<h1>` на страницу и фильтрация цен/счетчиков от ложного назначения заголовками.

### Changed
- Официальный ребрендинг проекта в **Figmatik** (`figmatik`).

---

## [1.5.2] - 2026-11-07

### Added
- **Предотвращение коллизий числовых суффиксов**:
  - Разделение авто-генерируемых классов (`.frame-2`) и слоев с явными именами (`Frame 2`).
- **Синтез параметрических фигур**:
  - Векторная генерация SVG-путей для звезд рейтинга (`STAR`) и многоугольников (`REGULAR_POLYGON`) со скруглением `cornerRadius`.
- **Матрицы с отражением ($\det < 0$)**:
  - Прецизионный расчет углов вращения для элементов с зеркальным отражением (`scaleX(-1)` / `scaleY(-1)`).
- **SVG `fill-rule="evenodd"`**:
  - Распознавание `windingRule: 'ODD'` в Kiwi Kiwi fillGeometry для исключения сплошной заливки отверстий в иконках.
- **Семантические списки `<ol>` и `<ul>`**:
  - Трансляция строк списков с сохранением маркеров, нумерации и интервалов `listSpacing`.
- **Ограничения `minSize` и `maxSize`**:
  - Маппинг габаритов в CSS `min-width`, `min-height`, `max-width`, `max-height`.
- **Вертикальное кадрирование шрифтов (`leadingTrim`)**:
  - Генерация свойств `text-box-trim: trim-both` и `text-box-edge: cap alphabetic`.
- **Расширенный каталог Google Fonts**:
  - Поддержка популярных шрифтов `Jura`, `Manrope`, `Outfit`, `Unbounded` и др.
- **Руководство для дизайнеров**:
  - Публикация подробного руководства `docs/figma-design-guide.md`.

---

## [1.5.1] - 2026-11-06

### Added
- **Graphic Subtree Collapsing & Cumulative 2D Baking Engine**:
  - Автоматическое обнаружение и схлопывание вырожденных графических цепочек (`Group -> Group -> Mask -> Image`) в единый чистый тег `<img>`.
  - Кумулятивное перемножение 2D-матриц трансформации с вычислением результирующего угла, масштаба и смещения.
  - Аппаратное запекание составных ассетов через Sharp с Retina @2x альфа-прозрачностью.
- **Multiply-to-Alpha Baking**:
  - Автоматическое преобразование белого фона растровых изображений с `blendMode: MULTIPLY` в честный альфа-канал ($\alpha = 255 - \min(R,G,B)$).
- **Поддержка режима наложения Luminosity**:
  - Трансляция `blendMode: LUMINOSITY` в связку CSS `mix-blend-mode: luminosity` и `filter: grayscale(1)`.

---

## [1.5.0] - 2026-11-06

### Added
- **Smart Anchor & Constraint Resolution**:
  - Интеллектуальный переход к привязкам `right` и `bottom` для абсолютных элементов на основе Figma Constraints (`MAX`) и геометрической близости к граням.
  - Автоматический сброс противоположных координат (`auto`) в адаптивных медиа-запросах.
- **Сохранение Fixed height в Bento-сетках**:
  - Корректная обработка фиксированной высоты карточек внутри вертикальных синтезированных колонок.
- **Универсальная детекция 4-сторонних асимметричных `padding`**:
  - Прецизионный расчет отступов для всех типов контейнеров с восстановлением опущенных нулевых значений из Kiwi.
- **Stacking Order Resolution**:
  - Геометрическая проверка вертикального пересечения с выступающими абсолютными элементами и изоляция наложения через `position: relative; z-index: 1`.

---

## [1.4.0] - 2026-11-05

### Added
- **Adaptive Multi-Breakpoint Engine**:
  - Автоматическое объединение связанных макетов экранов (Desktop, Tablet, Mobile) в единый канонический HTML-документ без дублирования DOM.
  - AST Similarity Matching для сопоставления соответствующих элементов между экранами.
  - Непрерывная плавная интерполяция размеров через `clamp(min, slope * 100vw + intercept, max)`.
  - Вынос структурных различий в медиа-запросы `@media` с поддержкой режимов Desktop-first и Mobile-first (`--mobile-first`).
  - Управление эксклюзивными элементами (десктопное меню vs бургер) через селекторы видимости.
- **Аппаратное запекание масок через Sharp (`dest-in`)**:
  - Запекание градиентных и растровых масок в альфа-канал файла ассета с устранением артефактов `mix-blend-mode`.
  - Поддержка тегов `[mask]` для принудительной генерации CSS `mask-image`.

---

## [1.3.0] - 2026-11-05

### Added
- **Figma Multi-Page Import Engine**:
  - Многостраничный экспорт за одну команду (`dist/*.html` + единый `css/style.css` + пул `img/*`).
  - Трёхуровневая детекция страниц: явные теги (`[page]`, `[страница]`), экранные артборды с Outlier Detection (отсечение модалок по медианному размеру), Canvas-вкладки (`--all-canvases`).
  - Поддержка тегов исключения (`[exclude]`, `[исключить]`).
  - Транслитерация кириллических названий страниц в URL-совместимые имена файлов.
  - Smart DRY CSS дедупликация между страницами и изолирование страничных модификаторов.

---

## [1.2.0] - 2026-11-04

### Added
- **Layout Synthesis Engine**:
  - Алгоритмический синтез адаптивного Flexbox и CSS Grid для плоских макетов Figma без Auto Layout (5 фаз: нормализация, контейнеры, Recursive XY-Cut, Grid-матрицы, свойства флексбокса).
  - CLI флаги `--smart-layout` (по умолчанию) и `--no-smart-layout` (откат к `position: absolute`).
- **Режимы верстки Fluid & Relative**:
  - Режим `--fluid`: резиновая верстка на всю ширину (100vw/100dvh, clamp(), min(), max(), rem).
  - Режим `--relative` (`--rem`): замена фиксированных px на относительные rem, em, vw, vh.
- **Нативные Figma Variables и дизайн-токены**:
  - Экспорт `:root` CSS переменных в Kiwi узлы `VARIABLE_SET` и `VARIABLE`.
  - Декомпиляция переменных Figma в W3C Design Tokens JSON файл (`--tokens`).
- **Интерактивные состояния прототипа**:
  - Поддержка псевдоклассов `:hover` с трансляцией в `prototypeInteractions` (`WHILE_HOVERING`).
- **Google Fonts**:
  - Автообнаружение шрифтов из `<link>` и расчет габаритов по таблице `FONT_METRICS_TABLE`.

---

## [1.1.0] - 2026-11-03

### Added
- **Auto Layout v4 (Flexbox)**:
  - Направления `row` и `column`, `gap`, независимые 4-сторонние отступы, сайзинг Hug / Fixed / Fill.
  - Пре-компьютированный Layout Pass для прецизионного совпадения координат слоев с браузером.
- **Rich Text**:
  - Смешанное форматирование внутри одного блока текста через `styleOverrideTable` и `characterStyleIDs`.
- **Градиенты и эффекты**:
  - Расчет 2x3 аффинной матрицы для линейных и радиальных градиентов.
  - Множественные тени `box-shadow`, внутренние тени `inset`, размытия `blur` и `backdrop-filter`.
- **Базовый декомпилятор (`.fig ➔ HTML/CSS`)**:
  - Декодирование Kiwi AST, восстановление дерева сцены и экспорт стилей.

---

## [1.0.0] - 2026-11-01

### Added
- Первоначальный релиз: компилятор HTML/CSS в нативный бинарный формат Figma `.fig`.
- Спецификация Kiwi Schema v101 и компрессия Zstandard.
- Базовые парсеры цветов (HEX, RGB, RGBA, HSL, named), типографики, изображений и SVG.
- CLI утилиты `html-to-fig` и `fig2html`.
