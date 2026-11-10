# 💻 Справочник по интерфейсу командной строки (CLI)

Утилита **Figmatik** предоставляет полнофункциональный консольный интерфейс для двусторонней работы с файлами Figma (`.fig`) и веб-разметкой.

---

## 📑 Содержание

1. [Установка и запуск](#1-установка-и-запуск)
2. [Обзор исполняемых команд](#2-обзор-исполняемых-команд)
3. [Декомпилятор: fig2html (.fig ➔ HTML/CSS)](#3-декомпилятор-fig2html-fig-➔-htmlcss)
   - 3.1. [Синтаксис и аргументы](#31-синтаксис-и-аргументы)
   - 3.2. [Категории опций](#32-категории-опций)
4. [Компилятор: html-to-fig (HTML ➔ .fig)](#4-компилятор-html-to-fig-html-➔-fig)
   - 4.1. [Синтаксис и аргументы](#41-синтаксис-и-аргументы)
   - 4.2. [Опции компилятора](#42-опции-компилятора)
5. [Практические рецепты использования (One-Liners)](#5-практические-рецепты-использования-one-liners)

---

## 1. Установка и запуск

### Глобальная установка в систему
```bash
npm install -g figmatik
```

### Запуск без предварительной установки (через npx)
```bash
npx figmatik design.fig -s --webp
```

### Установка локально в проект как dev-зависимость
```bash
npm install -D figmatik
```

---

## 2. Обзор исполняемых команд

Пакет регистрирует в системе универсальную команду, а также специализированные алиасы:

| Команда | Описание |
| :--- | :--- |
| **`figmatik`** | **Универсальный CLI-швейцарский нож**. Автоматически определяет направление конвертации по расширению входного файла (`.fig` ➔ декомпиляция, `.html` ➔ компиляция). |
| **`fig2html`** / **`fig-to-html`** | Специализированный CLI декомпилятора (`.fig ➔ HTML/CSS/Tailwind`). |
| **`html-to-fig`** / **`html2fig`** | Специализированный CLI прямого компилятора (`HTML/CSS ➔ .fig`). |

---

## 3. Декомпилятор: fig2html (.fig ➔ HTML/CSS)

### 3.1. Синтаксис и аргументы

```text
USAGE:
  $ figmatik <input.fig> [output.html|dir] [options]
  $ fig2html <input.fig> [output.html|dir] [options]
  $ fig-to-html <input.fig> [output.html|dir] [options]

ARGUMENTS:
  <input.fig>         Путь к исходному файлу Figma (.fig)
  [output.html|dir]   Путь к выходному HTML-файлу или целевой директории
```

---

### 3.2. Категории опций

#### 1. Файлы и структура вывода
| Опция | Описание | По умолчанию |
| :--- | :--- | :--- |
| `-o, --output <path>` | Явный путь к выходному файлу или папке | `<имя-файла>.html` |
| `-s, --separate-files` | Извлекать отдельный CSS (`css/style.css`) и картинки (`img/*`) | `false` (все в одном HTML) |
| `--extract-css` | Вынести стили в отдельный `.css` файл вместо `<style>` | `false` |
| `--css-file <path>` | Пользовательский путь к файлу стилей | `css/style.css` |
| `--no-inline-images` | Сохранять картинки в файлы на диск вместо Base64 | `false` |
| `--assets-dir <dir>` | Название папки для сохраняемых картинок | `img` |
| `--inline-styles` | Генерировать встроенные атрибуты `style="..."` вместо классов | `false` |

#### 2. Разметка и синтез верстки
| Опция | Описание | По умолчанию |
| :--- | :--- | :--- |
| `--layout <mode>` | Режим верстки: `default` (px), `relative` (rem/vw), `fluid` (clamp) или `grid` | `default` |
| `--fluid` | Шорткат для `--layout fluid` (резиновая верстка на 100vw/100dvh с функциями clamp()) | `false` |
| `--relative`, `--rem` | Шорткат для `--layout relative` (замена px на rem, em, vw, vh) | `false` |
| `--grid` | Шорткат для `--layout grid` (генерация CSS Grid сетки вместо Flexbox) | `false` |
| `--smart-layout` | Автоматический синтез адаптивного Flexbox/Grid для макетов без Auto Layout | `true` |
| `--no-smart-layout` | Принудительный откат к абсолютному позиционированию (`position: absolute`) | `false` |

#### 3. Адаптивность и брейкпоинты
| Опция | Описание | По умолчанию |
| :--- | :--- | :--- |
| `--responsive` | Автоматическое слияние связанных экранов в единый канонический сайт | `true` |
| `--no-responsive` | Отключить слияние (экспортировать каждый экран отдельной HTML-страницей) | `false` |
| `--breakpoints <list>`| Список целевых брейкпоинтов через запятую (например, `"1440,768,375"`) | Авто-детекция |
| `--mobile-first` | Генерация восходящих медиа-запросов Mobile-first (`min-width` вместо `max-width`) | `false` (Desktop-first) |

#### 4. Многостраничный экспорт
| Опция | Описание | По умолчанию |
| :--- | :--- | :--- |
| `--multi-page` | Включить многостраничный экспорт при обнаружении страниц | `true` |
| `--single-page` | Принудительный экспорт только одной (первой/указанной) страницы | `false` |
| `--pages <list>` | Список конкретных страниц для экспорта через запятую (`"Home, Pricing"`) | Все страницы |
| `--all-canvases` | Экспортировать все Canvas-вкладки документа Figma как страницы | `false` |
| `--page-tag <tag>` | Пользовательский тег в названиях фреймов страниц (например, `[page]`) | `[page]`, `[страница]` |
| `--exclude-tag <tag>`| Тег для исключения фреймов из экспорта (например, `[exclude]`) | `[exclude]`, `[исключить]` |
| `--no-outlier-detection`| Отключить отсечение модальных окон и диалогов по медианному размеру | `false` |
| `--min-page-width <px>`| Минимальная ширина фрейма для признания страницей | `320` |
| `--min-page-height <px>`| Минимальная высота фрейма для признания страницей | `400` |
| `--class-scope <mode>`| Режим изоляции стилей страниц: `modifier`, `scoped`, `numbered` | `modifier` |

#### 5. Enterprise Tailwind CSS и компоненты
| Опция | Описание | По умолчанию |
| :--- | :--- | :--- |
| `--tailwind` | Включить генерацию утилит Tailwind CSS | `false` |
| `--tailwind-version <v>`| Целевая версия Tailwind: `v3` или `v4` | `v4` |
| `--tailwind-mode <mode>`| Режим: `utility` (классы в разметке) или `hybrid` (BEM + `@apply`) | `utility` |
| `--tailwind-tolerance <n>`| Допустимое отклонение в px для привязки к 4px сетке | `1` |
| `--tailwind-arbitrary <s>`| Стратегия JIT-значений `[...]`: `auto`, `snap` или `strict` | `auto` |
| `--tailwind-prefix <pfx>`| Префикс генерируемых классов (например, `"tw-"`) | `""` |
| `--no-tailwind-cdn` | Отключить автоматическое внедрение скрипта Tailwind Play CDN | `false` |
| `--framework <fmt>` | Экспорт в компонентный формат: `html`, `react`, `vue`, `svelte` | `html` |
| `--react`, `--jsx`, `--tsx`| Шорткат для `--framework react` (генерация React TSX компонента) | `false` |
| `--vue` | Шорткат для `--framework vue` (генерация Vue 3 SFC) | `false` |
| `--svelte` | Шорткат для `--framework svelte` (генерация Svelte компонента) | `false` |
| `--scaffold [dir]` | Скаффолдинг готового production-репозитория с `package.json` и сборщиком | — |

#### 6. Изображения и оптимизация
| Опция | Описание | По умолчанию |
| :--- | :--- | :--- |
| `--format <fmt>` | Конвертация графики в формат: `webp`, `avif`, `original` | `original` |
| `--webp` | Шорткат для `--format webp` | `false` |
| `--avif` | Шорткат для `--format avif` | `false` |
| `-c, --compress` | Сжатие изображений без потери качества (lossless Sharp/MozJPEG) | `false` |
| `--image-scale <n>` | Множитель масштаба картинок относительно CSS (2 для Retina @2x) | `2` |
| `--no-srcset` | Отключить адаптивный атрибут `srcset` / `sizes` | `false` |

#### 7. Токены, локализация и отладка
| Опция | Описание | По умолчанию |
| :--- | :--- | :--- |
| `--tokens [path]` | Экспорт Figma Variables в файл W3C Design Tokens JSON | `tokens.json` |
| `--spacing-tokens` | Извлечение повторяющихся отступов в `:root { --space-* }` | `true` |
| `--no-spacing-tokens` | Отключить генерацию `:root` spacing-токенов | `false` |
| `--lang <code>` | Язык HTML-документа (`en`, `ru`) | Автоопределение |
| `-w, --watch` | Режим наблюдения: авто-пересборка при изменении `.fig` файла | `false` |
| `-v, --verbose` | Вывод расширенных технических логов | `false` |
| `-V, --version` | Показать версию программы | — |
| `-h, --help` | Показать справку по командам | — |

---

## 4. Компилятор: html-to-fig (HTML ➔ .fig)

### 4.1. Синтаксис и аргументы

```text
USAGE:
  $ figmatik <input.html> [output.fig] [options]
  $ html-to-fig <input.html> [output.fig] [options]
  $ html2fig <input.html> [output.fig] [options]

ARGUMENTS:
  <input.html>        Путь к исходному HTML файлу
  [output.fig]        Путь к результирующему файлу Figma (.fig)
```

---

### 4.2. Опции компилятора

| Опция | Описание | По умолчанию |
| :--- | :--- | :--- |
| `-i, --input <file>` | Явный путь к входному файлу | — |
| `-o, --output <file>`| Явный путь к выходному `.fig` файлу | `<имя-файла>.fig` |
| `-t, --template <file>`| Пользовательский шаблон бинарного `.fig` файла | `templates/template.fig` |
| `-p, --page <name>` | Название страницы в создаваемом документе Figma | `"Page 1"` |
| `-w, --watch` | Автоматическая сборка `.fig` при изменении HTML/CSS | `false` |
| `--no-remote-images`| Отключить скачивание удаленных картинок по HTTP/HTTPS | `false` |
| `-v, --verbose` | Вывод подробных логов этапов генерации | `false` |
| `-V, --version` | Показать версию компилятора | — |
| `-h, --help` | Справка по опциям компилятора | — |

---

## 5. Практические рецепты использования (One-Liners)

### 1. Автономный просмотр макета в браузере (быстрый предпросмотр)
Создает единый автономный HTML-файл со встроенными картинками и стилями:
```bash
figmatik landing.fig
```

### 2. Экспорт для продакшн-верстки (чистый HTML, внешний CSS и WebP)
```bash
figmatik landing.fig dist/index.html -s --webp --compress
```

### 3. Резиновая вёрстка на всю ширину экрана (Fluid Layout)
Растягивает контейнер на `100vw / 100dvh` с формулами `clamp()` и единицами `rem`:
```bash
figmatik design.fig -s --fluid --webp
```

### 4. Объединение экранов (Desktop + Tablet + Mobile) в единый сайт
```bash
figmatik app.fig dist/index.html --responsive -s --webp
```

### 5. Декомпиляция с утилитами Tailwind CSS и CDN превью
```bash
figmatik showcase.fig --tailwind
```

### 6. Экспорт в типизированный компонент React TSX
```bash
figmatik card.fig src/components/HeroCard.tsx --react --tailwind
```

### 7. Экспорт в Single File Component Vue 3
```bash
figmatik navbar.fig src/components/Navbar.vue --vue --tailwind
```

### 8. Скаффолдинг готового production-проекта Tailwind v4
Разворачивает полноценный проект с `package.json`, сборщиком и стилями:
```bash
figmatik website.fig --scaffold ./my-tailwind-website
```

### 9. Гибридный режим (семантический HTML + @apply в CSS)
```bash
figmatik design.fig dist -s --tailwind --tailwind-mode hybrid
```

### 10. Экспорт дизайн-токенов Figma Variables в W3C JSON
```bash
figmatik design.fig --tokens tokens.json
```

### 11. Экспорт всех Canvas-вкладок многостраничного документа Figma
```bash
figmatik design-system.fig dist --all-canvases -s --webp
```

### 12. Прямая компиляция HTML-страницы в нативный .fig
```bash
figmatik landing.html landing.fig
```

### 13. Компиляция верстки с утилитами Tailwind в нативный .fig
```bash
html-to-fig tailwind-page.html native-auto-layout.fig
```

### 14. Режим непрерывного наблюдения и автосборки (Watch Mode)
```bash
html-to-fig index.html output.fig --watch
```

### 15. Декомпиляция в семантический CSS Grid вместо Flexbox
```bash
figmatik dashboard.fig dist -s --grid --webp
```
