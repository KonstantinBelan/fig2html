// src/decompiler/tailwind/frameworks.js

/**
 * HTML void elements that must be self-closing in JSX / XML
 */
const VOID_ELEMENTS = ['img', 'input', 'hr', 'br', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr', 'path', 'circle', 'rect', 'line', 'polygon', 'polyline', 'ellipse'];

/**
 * Converts CSS inline style string "color: red; margin-top: 10px;" to React JSX style object string
 * @param {string} styleStr
 * @returns {string} e.g. '{{ color: "red", marginTop: "10px" }}'
 */
export function convertStyleStringToJsx(styleStr) {
    if (!styleStr || typeof styleStr !== 'string') return '';
    const clean = styleStr.trim();
    if (!clean) return '';

    const declarations = clean.split(';').map(d => d.trim()).filter(Boolean);
    const objProps = [];

    for (const decl of declarations) {
        const colonIdx = decl.indexOf(':');
        if (colonIdx === -1) continue;
        const prop = decl.slice(0, colonIdx).trim();
        const val = decl.slice(colonIdx + 1).trim();

        // Convert kebab-case to camelCase (e.g. margin-top -> marginTop, -webkit-line-clamp -> WebkitLineClamp)
        let camelProp = prop;
        if (prop.startsWith('-')) {
            camelProp = prop.slice(1).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
            camelProp = camelProp.charAt(0).toUpperCase() + camelProp.slice(1);
        } else {
            camelProp = prop.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        }

        objProps.push(`${camelProp}: ${JSON.stringify(val)}`);
    }

    return `{{ ${objProps.join(', ')} }}`;
}

/**
 * Transforms an HTML string into valid React JSX / TSX
 * @param {string} htmlString
 * @param {object} [options={}]
 * @returns {string} Clean JSX string
 */
export function transformHtmlToJsx(htmlString, options = {}) {
    if (!htmlString) return '';

    let jsx = htmlString;

    // 1. Replace class="..." with className="..."
    jsx = jsx.replace(/\bclass="/g, 'className="');
    jsx = jsx.replace(/\bclass='/g, "className='");

    // 2. Replace for="..." with htmlFor="..."
    jsx = jsx.replace(/\bfor="/g, 'htmlFor="');

    // 3. Replace tabindex with tabIndex
    jsx = jsx.replace(/\btabindex="/g, 'tabIndex="');

    // 4. Replace autocomplete with autoComplete
    jsx = jsx.replace(/\bautocomplete="/g, 'autoComplete="');

    // 5. Replace inline style="..." with style={{ ... }}
    jsx = jsx.replace(/\bstyle="([^"]*)"/g, (match, styleContent) => {
        const jsxStyle = convertStyleStringToJsx(styleContent);
        return jsxStyle ? `style=${jsxStyle}` : '';
    });

    // 6. Ensure void elements are self-closing (e.g. <img ...> -> <img ... />)
    for (const tag of VOID_ELEMENTS) {
        const regex = new RegExp(`<(${tag})\\b([^>]*?)(?<!/)>`, 'gi');
        jsx = jsx.replace(regex, '<$1$2 />');
    }

    return jsx;
}

/**
 * Generates a full React Functional Component (.tsx or .jsx)
 * @param {string} htmlSnippet HTML/JSX snippet of the component body
 * @param {string} [componentName='FigmaComponent']
 * @param {object} [options={}]
 * @param {boolean} [options.typescript=true]
 * @returns {string} Full React component source code
 */
export function generateReactComponent(htmlSnippet, componentName = 'FigmaComponent', options = {}) {
    const isTs = options.typescript !== false;
    const cleanName = (componentName || 'FigmaComponent').replace(/[^a-zA-Z0-9_]/g, '');
    const jsxBody = transformHtmlToJsx(htmlSnippet, options);

    if (isTs) {
        return `import React from 'react';

export interface ${cleanName}Props {
  className?: string;
  children?: React.ReactNode;
}

export const ${cleanName}: React.FC<${cleanName}Props> = ({
  className = '',
  children
}) => {
  return (
${jsxBody.split('\n').map(l => '    ' + l).join('\n')}
  );
};

export default ${cleanName};
`;
    }

    return `import React from 'react';

export const ${cleanName} = ({ className = '', children }) => {
  return (
${jsxBody.split('\n').map(l => '    ' + l).join('\n')}
  );
};

export default ${cleanName};
`;
}

/**
 * Generates a Vue 3 Single File Component (.vue)
 * @param {string} htmlSnippet
 * @param {string} [componentName='FigmaComponent']
 * @returns {string}
 */
export function generateVueComponent(htmlSnippet, componentName = 'FigmaComponent') {
    return `<template>
${htmlSnippet.split('\n').map(l => '  ' + l).join('\n')}
</template>

<script setup>
// Component: ${componentName}
</script>
`;
}

/**
 * Generates a Svelte Component (.svelte)
 * @param {string} htmlSnippet
 * @param {string} [componentName='FigmaComponent']
 * @returns {string}
 */
export function generateSvelteComponent(htmlSnippet, componentName = 'FigmaComponent') {
    return `<script>
  // Component: ${componentName}
  export let className = '';
</script>

${htmlSnippet}
`;
}
