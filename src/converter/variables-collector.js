// src/converter/variables-collector.js
const { parseColor } = require('../parsers/color');

function colorToHexKey(col) {
    if (!col || typeof col.r !== 'number') return '';
    const r = Math.round(col.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(col.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(col.b * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`.toLowerCase();
}

function createColorVar(varInfo) {
    if (!varInfo || varInfo.varType !== 'COLOR') return undefined;
    return {
        value: {
            alias: {
                guid: varInfo.guid
            }
        },
        dataType: 'ALIAS',
        resolvedDataType: 'COLOR'
    };
}

function createFloatVar(varInfo) {
    if (!varInfo || varInfo.varType !== 'FLOAT') return undefined;
    return {
        value: {
            alias: {
                guid: varInfo.guid
            }
        },
        dataType: 'ALIAS',
        resolvedDataType: 'FLOAT'
    };
}

/**
 * Collects CSS custom properties from stylesheets and builds Figma VARIABLE / VARIABLE_SET nodes
 */
function collectVariables(doc, guidGen, options = {}) {
    const rootVars = {};
    const ruleVars = [];

    for (const styleEl of doc.querySelectorAll('style')) {
        const css = styleEl.textContent || '';
        const ruleRegex = /([^{]+)\{([^}]+)\}/g;
        let match;
        while ((match = ruleRegex.exec(css)) !== null) {
            const selector = match[1].trim();
            const body = match[2];
            const varRegex = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g;
            let vMatch;
            const vars = {};
            let hasVars = false;
            while ((vMatch = varRegex.exec(body)) !== null) {
                vars[vMatch[1].trim()] = vMatch[2].trim();
                hasVars = true;
            }
            if (hasVars) {
                if (selector === ':root' || selector === 'html' || selector === '*') {
                    Object.assign(rootVars, vars);
                } else {
                    ruleVars.push({ selector, vars });
                }
            }
        }
    }

    function resolveVar(str, element) {
        if (!str || typeof str !== 'string' || !str.includes('var(')) return str;
        let resolved = str;
        let iterations = 0;
        while (resolved.includes('var(') && iterations < 5) {
            iterations++;
            resolved = resolved.replace(/var\(\s*(--[a-zA-Z0-9-_]+)(?:\s*,\s*([^)]+))?\s*\)/g, (m, varName, fallback) => {
                let curr = element;
                while (curr && curr.matches) {
                    for (let i = ruleVars.length - 1; i >= 0; i--) {
                        const r = ruleVars[i];
                        try {
                            if (curr.matches(r.selector) && r.vars[varName] !== undefined) {
                                return r.vars[varName];
                            }
                        } catch (_) {}
                    }
                    curr = curr.parentElement;
                }
                if (rootVars[varName] !== undefined) {
                    return rootVars[varName];
                }
                return fallback ? fallback.trim() : m;
            });
        }
        return resolved;
    }

    const variableChanges = [];
    const varKeys = Object.keys(rootVars);
    const varMap = new Map();
    const colorToVarMap = new Map();
    const floatToVarMap = new Map();
    const radiusToVarMap = new Map();
    const spaceToVarMap = new Map();

    if (options.createVariables !== false && varKeys.length > 0) {
        const varSetGuid = guidGen.next();
        const modeId = { sessionID: options.sessionId || 1, localID: 1 };
        const docGuid = options.documentGuid || { sessionID: 0, localID: 2 };

        const varSetNode = {
            guid: varSetGuid,
            phase: 'CREATED',
            parentIndex: {
                guid: docGuid,
                position: '!'
            },
            type: 'VARIABLE_SET',
            name: options.variableSetName || 'Web Tokens',
            isPublishable: false,
            visible: false,
            locked: true,
            variableSetModes: [
                {
                    id: modeId,
                    name: 'Default',
                    sortPosition: '!'
                }
            ],
            isCollectionExtendable: true
        };
        variableChanges.push(varSetNode);

        for (const varName of varKeys) {
            const rawVal = rootVars[varName];
            if (!rawVal) continue;

            const cleanName = varName.replace(/^--/, '').replace(/-/g, '/');
            let varType = 'STRING';
            let anyValue = { textValue: String(rawVal) };

            const parsedColor = parseColor(rawVal);
            if (parsedColor && (rawVal.startsWith('#') || rawVal.startsWith('rgb') || rawVal.startsWith('hsl'))) {
                varType = 'COLOR';
                anyValue = { colorValue: parsedColor };
            } else if (rawVal.endsWith('px') || (!isNaN(parseFloat(rawVal)) && !rawVal.includes(' '))) {
                varType = 'FLOAT';
                anyValue = { floatValue: parseFloat(rawVal) || 0 };
            }

            const varGuid = guidGen.next();
            const varInfo = {
                guid: varGuid,
                varType,
                cleanName,
                rawVal,
                anyValue,
                colorValue: parsedColor,
                floatValue: parseFloat(rawVal) || 0
            };
            varMap.set(varName, varInfo);
            varMap.set(cleanName, varInfo);
            varMap.set(varName.replace(/^--/, ''), varInfo);

            if (varType === 'COLOR' && parsedColor && parsedColor.a === 1) {
                const hex = colorToHexKey(parsedColor);
                if (hex && !colorToVarMap.has(hex)) {
                    colorToVarMap.set(hex, varInfo);
                }
            } else if (varType === 'FLOAT' && varInfo.floatValue > 0) {
                const lowerName = varName.toLowerCase();
                if (lowerName.includes('radius')) {
                    if (!radiusToVarMap.has(varInfo.floatValue)) radiusToVarMap.set(varInfo.floatValue, varInfo);
                } else if (lowerName.includes('space') || lowerName.includes('gap') || lowerName.includes('pad')) {
                    if (!spaceToVarMap.has(varInfo.floatValue)) spaceToVarMap.set(varInfo.floatValue, varInfo);
                }
                if (!floatToVarMap.has(varInfo.floatValue)) {
                    floatToVarMap.set(varInfo.floatValue, varInfo);
                }
            }

            const varNode = {
                guid: varGuid,
                phase: 'CREATED',
                parentIndex: {
                    guid: docGuid,
                    position: '!'
                },
                type: 'VARIABLE',
                name: cleanName,
                isPublishable: false,
                visible: false,
                locked: true,
                variableSetID: {
                    guid: varSetGuid
                },
                variableResolvedType: varType,
                variableScopes: ['ALL_SCOPES'],
                variableDataValues: {
                    entries: [
                        {
                            modeID: modeId,
                            variableData: {
                                value: anyValue,
                                dataType: varType,
                                resolvedDataType: varType
                            }
                        }
                    ]
                }
            };
            variableChanges.push(varNode);
        }
    }

    return {
        rootVars,
        ruleVars,
        resolveVar,
        variableChanges,
        varMap,
        colorToVarMap,
        floatToVarMap,
        radiusToVarMap,
        spaceToVarMap,
        createColorVar,
        createFloatVar,
        colorToHexKey
    };
}

module.exports = {
    collectVariables,
    colorToHexKey,
    createColorVar,
    createFloatVar
};
