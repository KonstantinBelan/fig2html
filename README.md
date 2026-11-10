<div align="center">

<img src="docs/logo.jpeg" alt="figmatik logo" width="380" style="border-radius: 20px; margin-bottom: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);">

# Figmatik

### Figma (.fig) to Clean Responsive HTML/CSS & Bi-Directional Engine 2.0

[![npm version](https://img.shields.io/npm/v/figmatik.svg?style=for-the-badge&logo=npm)](https://www.npmjs.com/package/figmatik)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981.svg?style=for-the-badge)](LICENSE)
[![Tests: 238 passed](https://img.shields.io/badge/tests-238%20passed-22c55e.svg?style=for-the-badge&logo=node.js&logoColor=white)](docs/TESTING.md)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933.svg?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript: Ready](https://img.shields.io/badge/TypeScript-Ready-3178c6.svg?style=for-the-badge&logo=typescript&logoColor=white)](index.d.ts)
[![Telegram](https://img.shields.io/badge/Telegram-@konstantin__belan-229ED9.svg?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/konstantin_belan)
[![Figma Kiwi](https://img.shields.io/badge/Kiwi%20Schema-v101-f24e1e.svg?style=for-the-badge&logo=figma&logoColor=white)](https://www.figma.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-8b5cf6.svg?style=for-the-badge)](https://github.com/KonstantinBelan/figmatik/pulls)

<p align="center">
  <b>Figmatik</b> — швейцарский нож для работы с Figma: превращает бинарные файлы <code>.fig</code> в чистый, живой и адаптивный <b>HTML5/CSS, Tailwind CSS (v3/v4), React, Vue и Svelte</b> за миллисекунды, а также компилирует веб-разметку обратно в нативный <code>.fig</code> с честным Auto Layout v4.<br><br>
  <b>Без плагинов. Без открытой Figma. Без облачных API. 100% автономно в вашем CLI или Node.js.</b>
</p>

<p align="center">
  <a href="#-быстрый-старт-за-1-минуту">🚀 Быстрый старт</a> •
  <a href="#-почему-figmatik">⚡ Преимущества</a> •
  <a href="#-библиотека-документации">📚 Документация</a> •
  <a href="#-автор-и-контакты">👤 Контакты</a>
</p>

</div>

---

## 📺 Демонстрация работы в CLI

<p align="center">
  <img src="docs/cli-demo.svg" alt="Figmatik Bi-Directional CLI Demo" width="100%">
</p>

---

## ⚡ Почему Figmatik?

- 🎯 **100% нативный `.fig` без плагинов** — прямое чтение и запись бинарного формата Kiwi Schema v101 со сжатием Zstandard. Файлы открываются в Figma Desktop и Web простым перетаскиванием.
- 🧼 **Чистый код вместо `position: absolute`** — эвристический движок *Layout Synthesis Engine* превращает даже небрежные макеты без Auto Layout в семантический Flexbox, CSS Grid или чистые утилиты Tailwind.
- 📱 **Автоматическая адаптивность** — объединяет разрозненные артборды (Desktop, Tablet, Mobile) в единый адаптивный сайт с плавной математической интерполяцией `clamp()` и медиа-запросами.
- ⚛️ **Готовые компоненты для фреймворков** — экспорт дизайн-макета сразу в типизированный **React TSX**, **Vue 3 SFC** или **Svelte**.
- 🌊 **Enterprise Tailwind CSS (v3 & v4)** — поддержка Oxide / CSS-first `@theme`, умная привязка к 4px сетке и генерация готовых к сборке production-проектов (`--scaffold`).
- 🖼 **Retina @2x и современные форматы** — аппаратное сжатие графики через Sharp, конвертация в WebP/AVIF, адаптивный `srcset` и удаление белого фона логотипов (Multiply-to-Alpha).
- 🛡️ **Enterprise Security** — встроенная трехуровневая защита от SSRF, DNS Rebinding, Zip Slip, Path Traversal и DoS для безопасного запуска в SaaS и Cloud API.

---

## 🚀 Быстрый старт за 1 минуту

### 1. Установка

```bash
# Глобально через npm:
npm install -g figmatik

# Или запуск без установки через npx:
npx figmatik design.fig -s --webp
```

### 2. Три ключевых сценария

```bash
# 1. Декомпиляция: .fig ➔ чистый HTML + внешний CSS + картинки WebP:
figmatik design.fig dist/index.html -s --webp --compress

# 2. Экспорт в типизированный React TSX компонент с Tailwind:
figmatik card.fig src/components/PricingCard.tsx --react --tailwind

# 3. Прямая компиляция: HTML/CSS ➔ нативный .fig файл для Figma:
figmatik landing.html landing.fig
```

---

## 📚 Библиотека документации

Вся подробная техническая информация и руководства вынесены в специализированные разделы:

| Документ | Описание |
| :--- | :--- |
| [⚡ **Возможности и архитектура (docs/FEATURES.md)**](docs/FEATURES.md) | Полный каталог возможностей: Layout Synthesis, Multi-breakpoint, Tailwind, A11y, токены, рендеринг. |
| [💻 **Справка по CLI и рецепты (docs/CLI.md)**](docs/CLI.md) | Полный перечень всех 40+ флагов командной строки и 15 практических one-liners на каждый день. |
| [🛠 **Программный API (docs/API.md)**](docs/API.md) | Руководство по интеграции в Node.js / TypeScript (`convertFigToHtml`, `generateFigFile`, типы, примеры). |
| [🛡️ **Безопасность (docs/SECURITY.md)**](docs/SECURITY.md) | Модель угроз, защита от Anti-SSRF, DNS Rebinding, Zip Slip, System Path Guard и чек-лист для SaaS. |
| [🧪 **Тестирование (docs/TESTING.md)**](docs/TESTING.md) | Пирамида тестов (238 тестов: unit, integration, e2e), запуск, фильтрация и проверка типов. |
| [🎨 **Руководство для дизайнеров (docs/figma-design-guide.md)**](docs/figma-design-guide.md) | Советы по подготовке макетов в Figma для идеального 100% Pixel-Perfect экспорта. |
| [📜 **История изменений (docs/CHANGELOG.md)**](docs/CHANGELOG.md) | История всех релизов проекта от 1.0.0 до 1.6.0 в стандарте *Keep a Changelog*. |

---

## 💻 Краткий обзор CLI-команд

Команда **`figmatik`** универсальна и сама понимает, что нужно сделать:

```bash
# Декомпиляция (.fig -> HTML):
figmatik input.fig [output.html] [options]

# Компиляция (HTML -> .fig):
figmatik input.html [output.fig] [options]
```

Для узкоспециализированных пайплайнов также доступны прямые алиасы:
- `fig2html` / `fig-to-html` — только декомпилятор (`.fig ➔ HTML/CSS`);
- `html-to-fig` / `html2fig` — только компилятор (`HTML ➔ .fig`).

---

## 🛠 Программный Node.js / TypeScript API

```typescript
import { convertFigToHtml, generateFigFile } from 'figmatik';

// 1. Декомпиляция .fig в адаптивный HTML с WebP
const webResult = await convertFigToHtml('landing.fig', {
    outputHtmlPath: 'dist/index.html',
    separateFiles: true,
    imageFormat: 'webp',
    responsive: true
});

// 2. Компиляция HTML в бинарный .fig
const figResult = await generateFigFile({
    htmlPath: 'templates/invoice.html',
    outputPath: 'build/invoice.fig',
    pageName: 'Invoice Template'
});
```

*Подробные сигнатуры, TypeScript-интерфейсы и примеры интеграции смотрите в [docs/API.md](docs/API.md).*

---

## 👤 Автор и контакты

**Константин Белан (Konstantin Belan)**

- 💬 **Telegram**: [@konstantin_belan](https://t.me/konstantin_belan)
- ✉️ **Email**: [kosbelan@yandex.ru](mailto:kosbelan@yandex.ru)
- 🐙 **GitHub**: [@KonstantinBelan](https://github.com/KonstantinBelan)

По вопросам коммерческой интеграции, кастомизации под требования компании или предложений по развитию движка — пишите напрямую в Telegram [@konstantin_belan](https://t.me/konstantin_belan).

---

## 📄 Лицензия

Проект распространяется под открытой лицензией [MIT](LICENSE).
