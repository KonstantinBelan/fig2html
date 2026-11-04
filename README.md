# 🎨 HTML to .fig (Figma Binary Generator)

Высокопроизводительный генератор нативных бинарных файлов Figma (`.fig`) напрямую из HTML и CSS. Проект производит чистый бинарный поток по спецификации **Kiwi Schema v101**, упакованный в сжатый архив Zstandard (.fig контейнер) со всеми стилями, векторными нодами, Auto Layout параметрами и встроенными изображениями.

---

## ⚡ Особенности и возможности

- **100% нативный .fig формат**: Файлы открываются в Figma Desktop и Figma Web без плагинов — просто перетащите файл в окно Figma.
- **Поддержка Auto Layout (Flexbox)**:
  - `display: flex` / `inline-flex` (`flex-direction: row | column`)
  - Отступы `gap`, `row-gap`, `column-gap`
  - Перенос строк `flex-wrap: wrap`
  - Выравнивание `justify-content` (`flex-start`, `center`, `flex-end`, `space-between`, `space-evenly`)
  - Выравнивание `align-items` (`flex-start`, `center`, `flex-end`, `baseline`, `stretch`)
  - Дочерние параметры: `flex-grow`, `align-self` (`stretch`, `center`, `min`, `max`), `position: absolute`
  - Паддинги: `padding`, `padding-top/right/bottom/left`
- **Типографика и текст**:
  - `font-family`, `font-size`, `font-weight` (100–900, normal, bold, bolder, lighter)
  - `font-style` (`italic`, `normal`)
  - `line-height` (`normal`, `px`, `%`, множители `1.5`)
  - `letter-spacing` (`px`, `em`, `%`)
  - `text-align` (`left`, `center`, `right`, `justify`)
  - `text-transform` (`uppercase`, `lowercase`, `capitalize`)
  - `text-decoration` (`underline`, `line-through`, `none`)
  - **Rich Text**: поддержка смешанного форматирования внутри абзаца (`<b>`, `<i>`, `<span style="...">`, `<a>`) через `styleOverrideTable` и `characterStyleIDs`.
- **Цвета и заливки**:
  - HEX (3, 4, 6, 8 символов: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`)
  - RGB и RGBA (`rgb(r, g, b)`, `rgba(r, g, b, a)`, современный синтаксис `rgb(255 0 0 / 50%)`)
  - HSL и HSLA (`hsl(h, s, l)`, `hsla(h, s, l, a)`)
  - Все 148 стандартных W3C именованных цветов (`crimson`, `aliceblue`, `transparent` и т.д.)
  - `currentcolor`
- **Градиенты**:
  - `linear-gradient(...)`: точный расчёт 2x3 матрицы трансформации для любых углов (`deg`, `rad`, `turn`) и направлений (`to right`, `to bottom`, `to top right` и др.)
  - `radial-gradient(...)`
  - Поддержка произвольного числа промежуточных color stops
- **Скругления и границы**:
  - `border-radius`: единый радиус, 4 независимых угла (`border-top-left-radius` и др.), круг (`50%` -> `ELLIPSE`), пилюля (`9999px`)
  - Плавные скругления углов (squircle / iOS smooth corners)
  - Границы: `border-width`, `border-style` (`solid`, `dashed`, `dotted`), `border-color`
  - Независимые толщины сторон: `border-top-width`, `border-right-width`, `border-bottom-width`, `border-left-width`
- **Эффекты и тени**:
  - `box-shadow`: поддержка множественных теней, размытия `blur`, растяжения `spread`, смещения `offset`, а также внутренних теней `inset` (`INNER_SHADOW`)
  - Размытие слоев: `filter: blur(...)` (`FOREGROUND_BLUR`)
  - Размытие фона: `backdrop-filter: blur(...)` (`BACKGROUND_BLUR`)
- **Изображения и иконки**:
  - `<img>`: локальные пути, base64 data URIs (`data:image/png;base64,...`), удаленные URL (`http://`, `https://`)
  - Определение реальных размеров из заголовков (PNG, JPEG, GIF, WebP, SVG)
  - `object-fit: cover` (`FILL`), `contain` (`FIT`), `fill` (`STRETCH`)
  - Хеширование через SHA-1 и встраивание файлов в директорию `images/<sha1>` архива `.fig`
  - `<svg>`: встроенные SVG элементы (иконки, логотипы) сериализуются и сохраняются с векторной точностью
- **Формы и компоненты**:
  - Кнопки `<button>` (центрированный Auto Layout фрейм с текстом/иконками)
  - Поля ввода `<input type="text|email|password|search">` с плейсхолдерами
  - Чекбоксы `<input type="checkbox">` и радиокнопки `<input type="radio">`
  - Разделители `<hr>` (`LINE` ноды)
  - Таблицы `<table>`, `<tr>`, `<td>`, `<th>`
  - Списки `<ul>`, `<ol>`, `<li>`

---

## 🚀 Установка и быстрый старт

### Запуск через CLI

```bash
# Простой запуск для HTML файла:
node cli.js index.html

# Указание имени выходного файла:
node cli.js landing.html landing.fig

# Или через npm script:
npm run build
```

Вы также можете связать утилиту глобально:
```bash
npm link
html-to-fig input.html output.fig
```

---

## 💻 CLI Справка

```text
USAGE:
  $ html-to-fig <input.html> [output.fig] [options]
  $ html-to-fig -i <input.html> -o <output.fig>

ARGUMENTS:
  <input.html>      Путь к исходному HTML файлу
  [output.fig]      Путь к создаваемому .fig файлу (по умолчанию: <имя-файла>.fig)

OPTIONS:
  -i, --input <file>       Входной HTML файл
  -o, --output <file>      Выходной .fig файл
  -t, --template <file>    Файл шаблона .fig (по умолчанию: template.fig)
  -p, --page <name>        Имя страницы в Figma (по умолчанию: "Page 1")
  -w, --watch              Режим наблюдения (автосборка при изменении HTML)
  --no-remote-images     Отключить скачивание внешних картинок (HTTP/HTTPS)
  -v, --verbose            Подробные логи процесса сборки
  -h, --help               Справка по командам
  -V, --version            Версия утилиты

ПРИМЕРЫ:
  $ html-to-fig test.html
  $ html-to-fig test/showcase.html showcase.fig --verbose
  $ html-to-fig index.html -w
```

---

## 🛠 Программный API (Node.js)

Вы можете использовать генератор как библиотеку в своих скриптах и бэкендах:

```javascript
const { generateFigFile } = require('html-to-fig');

async function build() {
    const result = await generateFigFile({
        htmlPath: 'test.html',
        outputPath: 'output.fig',
        templatePath: 'template.fig',
        pageName: 'Page 1',
        verbose: true
    });

    console.log(`Создано ${result.generatedNodes} нод за ${result.durationMs}мс!`);
    console.log(`Файл: ${result.outputPath} (${result.fileSizeBytes} байт)`);
}

build();
```

---

## 🧪 Тестирование

Проект покрыт автоматическими тестами:
- Парсинг цветов (HEX, RGB, RGBA, HSL, HSLA, named, alpha)
- Линейные и радиальные градиенты, расчёт матриц трансформации
- Тени (drop-shadow, inset, multiple) и фильтры размытия
- Типографика (font-weight, style, line-height, letter-spacing)
- Определение габаритов изображений и хеширование SHA-1
- Сквозная генерация и проверка валидности структуры декодером Figma Kiwi

Запуск тестов:
```bash
npm test
```

---

## 📁 Структура проекта

```text
html-to-fig/
├── cli.js                  # CLI интерфейс и watch режим
├── index.js                # Главная точка входа программного API
├── converter.js            # Модуль обратной совместимости
├── package.json            # Зависимости и метаданные проекта
├── template.fig            # Эталонный шаблон Figma контейнера
├── test.html               # Базовый тестовый HTML
├── src/
│   ├── generator.js        # Оркестратор сборки бинарного .fig
│   ├── converter.js        # HTML/CSS -> Figma AST транслятор
│   ├── schema.js           # Компилятор и кэш Kiwi схемы
│   ├── parsers/
│   │   ├── color.js        # Парсер всех типов CSS цветов
│   │   ├── gradient.js     # Парсер линейных и радиальных градиентов
│   │   ├── effects.js      # Парсер теней и размытий
│   │   ├── typography.js   # Шрифты, стили текста, оценка габаритов
│   │   ├── images.js       # Реестр изображений, SHA-1, base64, remote fetch
│   │   └── svg.js          # Обработчик встроенного SVG
│   └── utils/
│       └── guid.js         # Генератор GUID и лексикографических индексов
└── test/
    ├── run-tests.js        # Автоматический тестовый запуск
    └── showcase.html       # Полный демонстрационный макет со всеми фичами
```

---

## 📄 Лицензия

MIT
