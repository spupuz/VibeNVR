// Test the actual controller expressions without rendering or making API calls.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const frontend = fileURLToPath(new URL('../../../frontend/', import.meta.url));
const require = createRequire(`${frontend}package.json`);
const babelRequire = createRequire(require.resolve('@babel/core'));
const { parse } = babelRequire('@babel/parser');
const source = await readFile(`${frontend}src/pages/Settings.jsx`, 'utf8');
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
const objects = [];
let saveHandler;

const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'ObjectExpression') objects.push(node);
    if (node.type === 'VariableDeclarator' && node.id.name === 'handleSave') saveHandler = node.init;
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
    }
};
visit(ast);

const property = (object, key) => object.properties.find(item => (item.key?.name || item.key?.value) === key);
const expression = (node) => source.slice(node.start, node.end);
const lifecycleObject = (identifier) => objects.find(object => {
    const cleanup = property(object, 'cleanup_enabled');
    return cleanup && expression(cleanup.value).includes(identifier);
});
const initial = objects.find(object => property(object, 'cleanup_enabled')?.value.type === 'BooleanLiteral');
const loaded = lifecycleObject('data.cleanup_enabled');
const saved = lifecycleObject('settingsToSave.cleanup_enabled');
assert.ok(initial && loaded && saved, 'Find the settings initial/load/save objects');

for (const key of ['archival_enabled', 'archival_interval_hours']) {
    assert.ok(property(initial, key), `${key} needs initial state`);
    assert.ok(property(loaded, key), `${key} needs loading`);
    assert.ok(property(saved, key), `${key} needs serialization`);
}
const evaluate = (object, key, bindings = {}) => runInNewContext(expression(property(object, key).value), bindings, { timeout: 1000 });
assert.equal(evaluate(initial, 'archival_enabled'), true);
assert.equal(evaluate(initial, 'archival_interval_hours'), 24);

const prev = { archival_enabled: true, archival_interval_hours: 24 };
for (const [value, expected] of [['true', true], ['True', true], ['false', false], ['False', false], [true, true], [false, false]]) {
    assert.equal(evaluate(loaded, 'archival_enabled', { data: { archival_enabled: { value } }, prev }), expected);
}
assert.equal(evaluate(loaded, 'archival_enabled', { data: {}, prev }), true);
assert.equal(evaluate(loaded, 'archival_enabled', { data: { archival_enabled: { value: null } }, prev }), true);
assert.equal(evaluate(loaded, 'archival_interval_hours', { data: { archival_interval_hours: { value: '0.5' } }, prev }), 0.5);
assert.equal(evaluate(loaded, 'archival_interval_hours', { data: {}, prev }), 24);
for (const enabled of [true, false]) {
    const settingsToSave = { archival_enabled: enabled, archival_interval_hours: 6 };
    assert.equal(evaluate(saved, 'archival_enabled', { settingsToSave }), String(enabled));
    assert.equal(evaluate(saved, 'archival_interval_hours', { settingsToSave }), '6');
}
assert.ok(expression(saveHandler).includes('if (!res.ok)'), 'Rejected settings updates must not report success');
console.log('Archival settings initial/load/save contract checks passed (no network or credentials).');
