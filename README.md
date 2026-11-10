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
  <b>English</b> • <b><a href="README.ru.md">Русский</a></b>
</p>

<p align="center">
  <b>Figmatik</b> is a Swiss Army knife for Figma: converts native binary <code>.fig</code> files into clean, responsive <b>HTML5/CSS, Tailwind CSS (v3/v4), React, Vue, and Svelte</b> code in milliseconds — and compiles web layouts back into native <code>.fig</code> with genuine Auto Layout v4.<br><br>
  <b>Zero plugins. No running Figma. No cloud APIs. 100% offline inside your CLI or Node.js.</b>
</p>

<p align="center">
  <a href="#-quick-start-in-1-minute">🚀 Quick Start</a> •
  <a href="#-why-figmatik">⚡ Highlights</a> •
  <a href="#-documentation-library">📚 Documentation</a> •
  <a href="#-author--contacts">👤 Author</a>
</p>

</div>

---

## 📺 CLI Terminal Preview

<p align="center">
  <img src="docs/cli-demo.svg" alt="Figmatik Bi-Directional CLI Demo" width="100%">
</p>

---

## ⚡ Why Figmatik?

- 🎯 **100% Native `.fig` Without Plugins** — Direct binary reading and writing via Kiwi Schema v101 and Zstandard compression. Resulting files open in Figma Desktop and Web via standard drag-and-drop.
- 🧼 **Clean Code, Zero `position: absolute`** — Heuristic *Layout Synthesis Engine* transforms even chaotic unorganized frames into semantic Flexbox, CSS Grid, or clean Tailwind utility classes.
- 📱 **Automated Multi-Breakpoint Responsiveness** — Fuses related artboards (Desktop, Tablet, Mobile) into a single canonical responsive website with smooth mathematical `clamp()` interpolation and clean `@media` queries.
- ⚛️ **Framework Components on the Fly** — Export your Figma design straight to typed **React TSX**, **Vue 3 SFC**, or **Svelte** components.
- 🌊 **Enterprise Tailwind CSS (v3 & v4)** — Support for Oxide / CSS-first `@theme`, intelligent 4px scale snapping, and complete production-ready project scaffolding (`--scaffold`).
- 🖼 **Retina @2x & Modern Media Formats** — Sharp hardware baking, lossless WebP/AVIF compression, responsive `srcset`, and Multiply-to-Alpha background removal for logos.
- 🛡️ **Enterprise Security** — Built-in 3-layer protection against SSRF, DNS Rebinding, Zip Slip, Path Traversal, and DoS for bulletproof SaaS and Cloud API deployments.

---

## 🚀 Quick Start in 1 Minute

### 1. Installation

```bash
# Globally via npm:
npm install -g figmatik

# Or run instantly without installation via npx:
npx figmatik design.fig -s --webp
```

### 2. Three Essential Workflows

```bash
# 1. Decompile: .fig ➔ clean HTML + external CSS + WebP images:
figmatik design.fig dist/index.html -s --webp --compress

# 2. Export to a typed React TSX component with Tailwind CSS:
figmatik card.fig src/components/PricingCard.tsx --react --tailwind

# 3. Direct compile: HTML/CSS ➔ native .fig file for Figma:
figmatik landing.html landing.fig
```

---

## 📚 Documentation Library

Explore comprehensive guides and deep architectural documentation:

| Guide | Description |
| :--- | :--- |
| [⚡ **Features & Engine Architecture (docs/FEATURES.md)**](docs/FEATURES.md) | Full technical catalog: Layout Synthesis, Multi-breakpoint, Tailwind, A11y, Tokens, and rendering. |
| [💻 **CLI Reference & One-Liners (docs/CLI.md)**](docs/CLI.md) | Complete reference for all 40+ flags across `figmatik`, `fig2html`, `html-to-fig`, plus 15 practical recipes. |
| [🛠 **Programmatic API (docs/API.md)**](docs/API.md) | Node.js & TypeScript SDK reference (`convertFigToHtml`, `generateFigFile`, types, and recipes). |
| [🛡️ **Security Architecture (docs/SECURITY.md)**](docs/SECURITY.md) | Threat model, Anti-SSRF, DNS Rebinding, Zip Slip, System Path Guard, and SaaS checklist. |
| [🧪 **Testing Suite (docs/TESTING.md)**](docs/TESTING.md) | Test pyramid (238 tests: unit, integration, e2e), running & filtering, TypeScript checks, CI/CD. |
| [🎨 **Designer Guide (docs/figma-design-guide.md)**](docs/figma-design-guide.md) | Practical guide for designers on structuring Figma files for 100% Pixel-Perfect export. |
| [📜 **Changelog (docs/CHANGELOG.md)**](docs/CHANGELOG.md) | Full release history from 1.0.0 to 1.6.0 following the *Keep a Changelog* standard. |

---

## 💻 CLI Quick Overview

The **`figmatik`** command automatically detects conversion direction by file extension:

```bash
# Decompile (.fig -> HTML):
figmatik input.fig [output.html] [options]

# Compile (HTML -> .fig):
figmatik input.html [output.fig] [options]
```

Dedicated CLI aliases are also available for specific pipelines:
- `fig2html` / `fig-to-html` — decompiler only (`.fig ➔ HTML/CSS/Tailwind`);
- `html-to-fig` / `html2fig` — compiler only (`HTML/CSS ➔ .fig`).

---

## 🛠 Programmatic Node.js / TypeScript API

```typescript
import { convertFigToHtml, generateFigFile } from 'figmatik';

// 1. Decompile .fig to responsive HTML with WebP
const webResult = await convertFigToHtml('landing.fig', {
    outputHtmlPath: 'dist/index.html',
    separateFiles: true,
    imageFormat: 'webp',
    responsive: true
});

// 2. Compile HTML back to native .fig
const figResult = await generateFigFile({
    htmlPath: 'templates/invoice.html',
    outputPath: 'build/invoice.fig',
    pageName: 'Invoice Template'
});
```

*For complete signatures, TypeScript interfaces, and integration examples, see [docs/API.md](docs/API.md).*

---

## 👤 Author & Contacts

**Konstantin Belan (Константин Белан)**

- 💬 **Telegram**: [@konstantin_belan](https://t.me/konstantin_belan)
- ✉️ **Email**: [kosbelan@yandex.ru](mailto:kosbelan@yandex.ru)
- 🐙 **GitHub**: [@KonstantinBelan](https://github.com/KonstantinBelan)

For commercial integration, custom feature requests, or partnership proposals, please reach out directly on Telegram [@konstantin_belan](https://t.me/konstantin_belan).

---

## 📄 License

This project is licensed under the [MIT](LICENSE) License.
