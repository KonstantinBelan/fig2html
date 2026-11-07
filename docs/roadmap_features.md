# 🚀 Roadmap: Прорывные функции и инструменты figmatik 2.0

В данном документе описаны стратегические направления развития, способные превратить `figmatik` из CLI-декомпилятора в лидирующую экосистему трансформации дизайна в код.

---

## 1. Экспорт в Tailwind CSS & компонентные фреймворки (React, Vue, Svelte)

### Контекст
Подавляющее большинство современных веб-разработчиков не пишут чистый ванильный CSS со специфичными именами классов. Доминирующий стек современной индустрии — **Tailwind CSS + React (Next.js) / Vue (Nuxt) / Svelte**.

### Функционал
* Флаг `--tailwind`: вместо классов `.frame-12` генерируются семантические Tailwind-утилиты:
  ```html
  <!-- Вместо: <div class="card-hero-1"> -->
  <div class="flex flex-col gap-4 p-6 bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-100">
  ```
* Флаг `--framework react` / `--react`:
  Генерация готовых функциональных компонентов (`.tsx` / `.jsx`):
  ```tsx
  import React from 'react';

  export interface HeroSectionProps {
      title?: string;
      ctaText?: string;
  }

  export const HeroSection: React.FC<HeroSectionProps> = ({
      title = "Smart Design Engine",
      ctaText = "Get Started"
  }) => {
      return (
          <section className="flex flex-col items-center justify-center p-8 md:p-16 ...">
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 ...">{title}</h1>
              <button className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition">
                  {ctaText}
              </button>
          </section>
      );
  };
  ```

---

## 2. Поддержка Figma URL и прямого скачивания через REST API

### Контекст
Сейчас пользователю необходимо вручную открывать десктопную Figma, сохранять локальную копию `.fig` на диск, и только потом запускать CLI.

### Функционал
* Поддержка прямых ссылок на проекты Figma:
  ```bash
  $ fig2html https://www.figma.com/design/AbCdEf12345/My-Landing --token figma_pat_xxxx
  ```
* Figmatik использует персональный токен доступа (PAT) для:
  1. Автоматического скачивания файла через Figma API.
  2. Либо прямого преобразования Figma Document AST (JSON) в структуры Figmatik.
* Интеграция с переменной окружения `FIGMA_TOKEN`.

---

## 3. Официальный Figma Community Plugin ("Figmatik Plugin")

### Контекст
Многие UI/UX-дизайнеры и верстальщики предпочитают работать прямо внутри редактора Figma без открытия терминала.

### Функционал
* Плагин в Figma Community:
  * Выделил любой фрейм или компонент на холсте ➔ Нажал кнопку **"Copy as HTML"** / **"Copy as Tailwind"** / **"Copy as React"**.
  * Превью сгенерированного кода прямо во всплывающем окне плагина.
  * Экспорт выбранных экранов в архив с чистым сайтом в один клик.
* Двусторонняя синхронизация: вставка HTML-кода из буфера обмена обратно на холст Figma в виде нативных фреймов и Auto Layout.

---

## 4. Режим "AI / LLM-ready Context" (`--format ai`)

### Контекст
Разработчики массово используют AI-ассистентов (Cursor, Windsurf, Claude 3.7 Sonnet, GPT-4.5) для генерации кода. Однако передать дизайн в нейросеть сейчас сложно: скриншоты не передают точных отступов и цветов, а сырой HTML перегружен стилями и съедает контекстное окно.

### Функционал
* Флаг `fig2html design.fig --format ai` или `figmatik ai design.fig`:
* Генерирует **ультра-компактный, токено-эффективный Markdown/JSON манифест**, оптимизированный под системный промпт LLM:
  ```markdown
  ### Screen: LandingPage (1440x900)
  - Layout: Flex column, padding: [64px, 128px], gap: 48px
  - Colors:
    * Background: #0f172a (Slate 900)
    * Accent: #3b82f6 (Blue 500)
  - Components:
    * Navbar: [Logo, Links(Home, Pricing, About), Button(Sign In)]
    * Hero:
      - H1: "Transform design into code" (Inter 56px Bold, tracking -1px)
      - Subtitle: "Offline bidirectional compiler..." (Inter 20px Regular)
      - CTA Button: Fill #3b82f6, radius 12px, text "Get Started"
  ```
  Это позволяет скормить макет в Cursor/Claude и получить чистый полнофункциональный код с бизнес-логикой.

---

## 5. Браузерный Web Playground (WebAssembly / Client-side)

### Контекст
Многие потенциальные пользователи хотят протестировать конвертер "на лету" без установки Node.js и npm.

### Функционал
* Онлайн-песочница (например, на `https://figmatik.dev`):
  * Движок Kiwi и zstd собираются в чистый браузерный JS/WASM.
  * Вместо Node.js `sharp` используется нативный HTML5 `Canvas` / `OffscreenCanvas`.
  * Пользователь перетаскивает `.fig` файл в окно браузера ➔ мгновенно видит интерактивный адаптивный сайт и вкладки с кодом (HTML, CSS, Tailwind, React).
  * 100% приватность: все вычисления происходят прямо в браузере пользователя, файлы не отправляются на сторонние серверы.

---

## 6. W3C Design Tokens (DTCG) & Style Dictionary

### Контекст
Крупные компании строят кроссплатформенные дизайн-системы для Web, iOS (SwiftUI) и Android (Jetpack Compose).

### Функционал
* Экспорт нативных Figma Variables в официальный стандарт [W3C Design Tokens Community Group (DTCG)](https://design-tokens.github.io/community-group/format/):
  ```json
  {
    "color": {
      "brand": {
        "primary": {
          "$value": "#2563eb",
          "$type": "color",
          "$description": "Primary brand color"
        }
      }
    },
    "spacing": {
      "sm": { "$value": "8px", "$type": "dimension" },
      "md": { "$value": "16px", "$type": "dimension" }
    }
  }
  ```
* Прямая интеграция со **Style Dictionary**: генерация артефактов для iOS (`Color.swift`), Android (`Colors.kt`), Web (`variables.css`, `tokens.ts`) в одном пайплайне.
