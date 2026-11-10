# 🧪 Тестирование и обеспечение качества

Проект **Figmatik** (`figmatik`) покрыт всесторонним набором автоматизированных тестов, насчитывающим **238 тестов** в 47 группах. Тесты проверяют корректность компилятора, декомпилятора, математических алгоритмов геометрии, движка Tailwind CSS, генераторов компонентов и механизмов безопасности.

---

## 📑 Содержание

1. [Обзор архитектуры тестирования](#1-обзор-архитектуры-тестирования)
2. [Пирамида тестирования](#2-пирамида-тестирования)
   - 2.1. [Unit Tests (Модульные тесты)](#21-unit-tests-модульные-тесты)
   - 2.2. [Integration Tests (Интеграционные тесты)](#22-integration-tests-интеграционные-тесты)
   - 2.3. [E2E Tests (Сквозные тесты)](#23-e2e-tests-сквозные-тесты)
3. [Проверка статических типов TypeScript](#3-проверка-статических-типов-typescript)
4. [Команды запуска и фильтрации](#4-команды-запуска-и-фильтрации)
5. [CI/CD автоматизация (GitHub Actions)](#5-cicd-автоматизация-github-actions)

---

## 1. Обзор архитектуры тестирования

- **Собственный легковесный ESM раннер**:
  - Тесты запускаются через нативный модуль `test/runner.js` без тяжелых внешних фреймворков (Jest/Mocha), что обеспечивает мгновенный холодный старт (~600 мс на весь набор из 238 тестов).
- **Детерминированность и воспроизводимость**:
  - Все тесты независимы, используют изолированные временные директории и очищают артефакты после выполнения.
- **Поддержка реальных сложных макетов**:
  - В тестовый набор входят реальные верстки: `test/test.html`, `test/showcase.html` и комплексный Instagram-макет `test/hard.html` (слайды, кастомные свойства, сетки, градиенты).

---

## 2. Пирамида тестирования

```text
       ▲
      / \     E2E Tests (10+ тестов)
     /   \    HTML ➔ .fig ➔ HTML, Roundtrip, сложные макеты
    /─────\
   /       \   Integration Tests (190+ тестов)
  /         \  Layout Synthesis, Tailwind (Sprints 1-8), Multi-page, Breakpoints
 /───────────\
/             \ Unit Tests (30+ тестов)
─────────────── Парсеры цветов, градиентов, шрифтов, Security, SVG
```

---

### 2.1. Unit Tests (Модульные тесты)

Расположены в директории `test/unit/`:
- **`color.test.js`**: парсинг цветов HEX (3, 4, 6, 8 символов), RGB, RGBA, HSL, HSLA, modern space/slash syntax, named colors.
- **`gradient.test.js`**: расчет 2x3 аффинных матриц трансформации, углы поворота, color stops.
- **`effects.test.js`**: множественные тени `box-shadow`, внутренние тени `inset`, размытия `blur` и `backdrop-filter`.
- **`typography.test.js`**: квантование весов шрифтов, стили, `line-height`, `letter-spacing`, выравнивания текста.
- **`images.test.js`**: определение размеров графики из бинарных заголовков (PNG, JPEG, GIF, WebP, SVG), SHA-1 хеширование.
- **`cli.test.js`**: парсинг позиционных аргументов и флагов командной строки.
- **`units.test.js`**: относительные единицы `rem`, `em`, `vw`, `vh` и формулы `clamp()`.
- **`svg-path.test.js`**: декодирование бинарных потоков `commandsBlob` и `VectorNetwork` в SVG пути.
- **`security.test.js`**:
  - Блокировка приватных IP (RFC 1918, RFC 3927 Cloud metadata, IPv6 loopback/ULA).
  - Предварительный DNS-резолвинг всех A/AAAA записей.
  - Защита от DNS Rebinding на уровне физического сокета.
  - Валидация цепочек редиректов и протоколов.
  - Защита от Zip Slip и Symlink traversal.
  - Защита от декомпрессионных бомб (Zip Bomb).
  - CLI System Path Guard.
  - Санитизация SVG от XSS и XXE.

---

### 2.2. Integration Tests (Интеграционные тесты)

Расположены в директории `test/integration/`:
- **`decompiler.test.js`**: чтение `.fig`, декодирование Kiwi AST, построение дерева сцены, генерация CSS.
- **`tokens.test.js`**: экспорт переменных Figma в JSON (W3C Design Tokens) и в `:root` CSS variables.
- **`layout-synthesis.test.js`**: 5 фаз Layout Synthesis Engine для макетов без Auto Layout (Spatial Normalization, Container Induction, Recursive XY-Cut, Matrix Grid, Flexbox).
- **`multi-page.test.js`**: трёхуровневая детекция страниц (`[page]`, Outlier Detection, Canvas вкладки), Smart DRY CSS, изоляция классов.
- **`responsive-breakpoints.test.js`**: слияние экранов Desktop, Tablet, Mobile, интерполяция `clamp()`, медиа-запросы, эксклюзивные элементы.
- **`graphic-collapser.test.js`**: схлопывание вырожденных графических цепочек, кумулятивное матричное умножение, аппаратное запекание через Sharp.
- **`visual-accuracy.test.js`**: Pixel-Perfect декомпиляция, параметрические фигуры `STAR` / `REGULAR_POLYGON`, матрицы с отражением ($\det < 0$), SVG `evenodd`, списки `<ol>/<ul>`, `leadingTrim`.
- **`semantic-styles.test.js`**: алгоритмическая DRY CSS дедупликация, примитивная шкала отступов `--space-*`, стандарты A11y (`aria-label`, `:focus-visible`), автоопределение языка (i18n).
- **Tailwind CSS Tests (Спринты 1–8)**:
  - *Sprint 1*: базовый маппер классов и утилит.
  - *Sprint 2*: трансляция Auto Layout, Flexbox и CSS Grid в классы Tailwind.
  - *Sprint 3*: типографика, градиенты, blend modes, обрезка текста, SVG.
  - *Sprint 4*: адаптивный синтез мульти-брейкпоинтов и префиксов (`sm:`, `md:`, `lg:`).
  - *Sprint 5*: генератор тем Tailwind v3/v4, гибридный режим BEM + `@apply`, внедрение Play CDN.
  - *Sprint 6*: компонентные экспортеры React TSX, Vue 3 SFC, Svelte.
  - *Sprint 7*: обратная компиляция `HTML+Tailwind ➔ .fig` с нативным Auto Layout.
  - *Sprint 8*: сквозные тесты CLI флагов, публичного API и скаффолдинга проектов.

---

### 2.3. E2E Tests (Сквозные тесты)

Расположены в директории `test/e2e/`:
- **`roundtrip.test.js`**: полный замкнутый цикл: `HTML ➔ .fig ➔ HTML` с проверкой целостности структуры, контента и стилей.
- **Сквозная компиляция**: генерация валидных бинарных файлов `output.fig`, `showcase.fig`, `hard.fig`.
- **Сквозная декомпиляция**: экспорт реальных файлов в валидный HTML с проверкой рендеринга и работы медиа-запросов.

---

## 3. Проверка статических типов TypeScript

Проект Figmatik полностью типизирован с помощью деклараций `index.d.ts`.

Для проверки типов используется официальный компилятор TypeScript в режиме валидации без генерации кода (`--noEmit`):

```bash
npm run test:types
```

Конфигурация описана в `tsconfig.json`:
- Режим модулей: `NodeNext`.
- Строгая проверка типов: `"strict": true`.
- Поддержка деклараций типов для Node.js 18+.

---

## 4. Команды запуска и фильтрации

### 1. Запуск всех 238 тестов
```bash
npm test
# или напрямую:
node test/runner.js
```

### 2. Фильтрация по названию теста (`--grep` / `-g`)
Позволяет запустить только тесты, содержащие определенное ключевое слово:
```bash
npm test -- --grep "security"
node test/runner.js -g "tailwind"
node test/runner.js -g "gradient"
```

### 3. Фильтрация по домену тестов (`--domain` / `-d`)
Запуск только одного уровня пирамиды тестирования:
```bash
# Только модульные тесты:
node test/runner.js --domain unit

# Только интеграционные тесты:
node test/runner.js -d integration

# Только сквозные E2E тесты:
node test/runner.js -d e2e
```

### 4. Прямой запуск отдельного тест-файла
```bash
node test/unit/security.test.js
node test/unit/color.test.js
node test/integration/tokens.test.js
node test/e2e/roundtrip.test.js
```

---

## 5. CI/CD автоматизация (GitHub Actions)

В репозитории настроен автоматический CI-пайплайн, который запускается при каждом pull request и коммите в ветку `main`:
1. Установка зависимостей (`npm ci`).
2. Проверка статических типов TypeScript (`npm run test:types`).
3. Запуск полного набора из 238 автоматических тестов (`npm test`).
4. Проверка сборки и чистоты выходных артефактов.
