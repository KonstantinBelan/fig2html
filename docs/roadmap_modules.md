# 🗺️ Roadmap: Модуляризация и рефакторинг ядра figmatik

## 1. Контекст и цели
В текущей версии (v1.5.x) проект содержит несколько очень крупных монолитных файлов:
* `src/converter.js` — **~2450 строк**: сочетает в себе парсинг DOM через JSDOM, вычисление геометрии и стилей, трансляцию псевдоклассов `:hover`, создание Kiwi-нод, резолв CSS-переменных, обработку Rich Text и генерацию интерактивных компонентов.
* `src/decompiler/css.js` — **~1450 строк**: парсер цветов, градиентов, фильтров, теней, расчет матриц аффинных трансформаций, CSS-правила, эвристики якорного позиционирования.
* `test/run-tests.js` — **~4400 строк**: все 140+ тестов собраны в единый файл без разбиения по доменам.

### Цели рефакторинга:
1. **Разделение ответственности (Single Responsibility Principle)**: каждый модуль отвечает за одну четкую область.
2. **Изолированное тестирование**: возможность запускать и покрывать тестами отдельные модули без выполнения всей цепочки сборки.
3. **Упрощение онбординга и контрибьютинга**: упростить чтение кодовой базы внешними разработчиками.
4. **Устранение дублирования кода**: вынос общих геометрических и цветовых функций.

---

## 2. Целевая архитектура модулей

### 2.1 Декомпозиция `src/converter/` (HTML ➔ Figma)
Вместо монолитного `src/converter.js` создается директория `src/converter/`:

```
src/converter/
├── index.js                  # Главная точка входа: convertHtmlToNodes(html, parentGuid, options)
├── dom-traversal.js          # Рекурсивный обход дерева DOM, контекст Flex/Grid/Absolute
├── style-resolver.js         # Каскадное вычисление стилей, парсинг inline и CSS-правил
├── variables-collector.js    # Извлечение :root CSS Custom Properties и маппинг в VARIABLE_SET
├── rich-text.js              # Разбиение на подстроки, characterStyleIDs и styleOverrideTable
├── element-processors/       # Специализированные процессоры тегов:
│   ├── container.js          # div, section, article, main, header, footer, form
│   ├── text.js               # p, span, h1-h6, b, i, a, label
│   ├── image.js              # img, picture
│   ├── svg.js                # svg, path, rect, circle, line (интеграция с svg-path.js)
│   ├── interactive.js        # button, input, select, a (ссылки) и псевдоклассы (:hover)
│   └── media.js              # hr, table, video/iframe заглушки
└── layout-engine.js          # Расчет Auto Layout v4, padding, margin, constraints, sizing
```

### 2.2 Декомпозиция `src/decompiler/` (Figma ➔ HTML)
Рефакторинг `src/decompiler/css.js`:
```
src/decompiler/css/
├── index.js                  # Реэкспорт computeNodeStyles и toStyleString
├── color-formatter.js        # formatColor, hex, rgba, hsla
├── gradient-formatter.js     # formatGradient, расчет углов матрицы affine transform
├── effects-formatter.js      # formatEffects, drop-shadow, inner-shadow, blur, backdrop-blur
├── filter-formatter.js       # formatPaintFilter (exposure, contrast, saturation, temperature, tint)
├── typography-formatter.js   # parseFontWeightAndStyle, line-height, letter-spacing
└── layout-styles.js          # Flexbox, Grid, absolute positioning, margins/paddings
```

### 2.3 Модуляризация тестовой базы (`test/`)
Вместо одного монолита `test/run-tests.js` на 4400 строк:
```
test/
├── runner.js                 # Легковесный тестовый раннер с поддержкой фильтрации (--grep / --domain)
├── unit/
│   ├── color.test.js
│   ├── gradient.test.js
│   ├── typography.test.js
│   ├── effects.test.js
│   ├── svg-path.test.js
│   ├── security.test.js      # Path Traversal & SSRF тесты
│   └── units.test.js
├── integration/
│   ├── layout-synthesis.test.js
│   ├── multi-page.test.js
│   ├── responsive-breakpoints.test.js
│   └── tokens.test.js
└── e2e/
    ├── html-to-fig.test.js
    ├── fig-to-html.test.js
    └── roundtrip.test.js
```

---

## 3. Этапы реализации (Milestones)

| Этап | Задача | Ожидаемый результат | Риски |
|---|---|---|---|
| **Этап 1** | Вынос парсеров цветов и градиентов из `css.js` в `src/decompiler/css/*` | Сокращение `css.js` на 40%, 100% обратная совместимость | Минимальные |
| **Этап 2** | Разделение `test/run-tests.js` на модульные файлы в `test/unit/`, `test/e2e/` с запуском через общий `test/runner.js` | Быстрый выборочный запуск тестов (`npm test -- --grep "svg"`) | Минимальные |
| **Этап 3** | Декомпозиция `src/converter.js` на модули внутри `src/converter/` | `index.js` в `converter/` становится компактным контроллером (~150 строк) | Необходимость полного прогона регрессионных тестов |
| **Этап 4** | Удаление устаревших монолитных файлов, обновление экспортов в корневом `index.js` | Чистая архитектура v1.6.0 | Нулевые |
