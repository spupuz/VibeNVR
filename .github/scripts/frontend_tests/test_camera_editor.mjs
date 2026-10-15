// Run after the required manual rebuild: node .github/scripts/frontend_tests/test_camera_editor.mjs
// In-memory fixtures only. No real cameras, credentials, or API requests.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = fileURLToPath(new URL('../../../frontend/', import.meta.url));
const require = createRequire(`${frontend}package.json`);
const parserRequire = createRequire(require.resolve('i18next-parser'));
const { build } = parserRequire('esbuild');
const result = await build({
    stdin: {
        resolveDir: frontend,
        loader: 'jsx',
        contents: `
            import assert from 'node:assert/strict';
            import React from 'react';
            import { renderToStaticMarkup } from 'react-dom/server';
            import { createMemoryRouter, RouterProvider } from 'react-router';
            import { CameraEditor } from './src/pages/CameraEditor.jsx';
            import { Cameras } from './src/pages/Cameras.jsx';
            import { cameraDraftSnapshot, cameraToDraft, createCameraDraft } from './src/utils/cameraEditorUtils.js';

            const first = createCameraDraft();
            const second = createCameraDraft();
            assert.notEqual(first, second);
            assert.equal(first.preserve_movies, 'For One Week');
            assert.equal(first.archive_storage_profile_id, null);
            const saved = { ...first, id: 7, name: 'Fixture camera', rtsp_url: 'rtsp://fixture:fixture-password@example.invalid/live' };
            const draft = cameraToDraft(saved);
            assert.equal(draft.rtsp_username, 'fixture');
            assert.equal(draft.rtsp_password, 'fixture-password');
            assert.equal(draft.rtsp_host, 'example.invalid/live');
            const baseline = cameraDraftSnapshot(draft);
            assert.equal(baseline, cameraDraftSnapshot({ ...draft, show_password: true }));
            assert.notEqual(baseline, cameraDraftSnapshot({ ...draft, name: 'Changed' }));
            assert.notEqual(baseline, cameraDraftSnapshot({ ...draft, rtsp_password: 'different-fixture-password' }));
            assert.equal(baseline, cameraDraftSnapshot(Object.fromEntries(Object.entries(draft).reverse())));
            assert.equal(saved.rtsp_username, '');
            assert.equal(saved.rtsp_password, '');

            const noSideEffects = () => { throw new Error('Unexpected render side effect'); };
            const props = {
                editingId: 7, activeTab: 'storage', setActiveTab: noSideEffects,
                newCamera: draft, setNewCamera: noSideEffects, storageProfiles: [],
                cameras: [saved], token: null, stats: null,
                handleCreate: noSideEffects, handleCleanup: noSideEffects,
                handleTestNotification: noSideEffects, setShowCopyModal: noSideEffects,
                globalSettings: null, onLeave: noSideEffects, isDirty: true, isSaving: false
            };
            const render = (extra = {}) => renderToStaticMarkup(<CameraEditor {...props} {...extra} />);
            const edit = render();
            assert.ok(edit.includes('Edit Camera'));
            assert.ok(edit.includes('Unsaved changes'));
            assert.ok(edit.includes('Save Changes'));
            assert.ok(edit.includes('Apply'));
            assert.ok(edit.includes('Back to cameras'));
            assert.ok(edit.includes('sticky bottom-0'));
            assert.ok(edit.includes('<nav'));
            assert.ok(!edit.includes('max-h-[60vh]'));
            assert.ok(!edit.includes('overflow-y-auto'));
            assert.ok(!edit.includes('role="dialog"'));
            assert.ok(!edit.includes('Source Camera'));
            assert.ok(!edit.includes('fixture-password'));
            const add = render({ editingId: null, newCamera: first, isDirty: false });
            assert.ok(add.includes('Add New Camera'));
            assert.ok(add.includes('Source Camera'));
            assert.ok(add.includes('Create Camera'));
            assert.ok(!add.includes('Copy Settings to...'));
            const busy = render({ isSaving: true });
            assert.ok(busy.includes('<fieldset disabled=""'));
            assert.ok(busy.includes('Saving...'));
            const edge = render({ newCamera: { ...draft, detect_engine: 'ONVIF Edge' } });
            assert.ok(!edge.includes('Motion Zones'));
            assert.ok(!edge.includes('AI &amp; Tracking'));

            const router = createMemoryRouter([{ path: '/cameras/*', element: <Cameras /> }], { initialEntries: ['/cameras/7/edit'] });
            try {
                const viewer = renderToStaticMarkup(<RouterProvider router={router} />);
                assert.ok(!viewer.includes('Edit Camera'));
                assert.ok(!viewer.includes('Save Changes'));
            } finally {
                router.dispose();
            }
            console.log('Camera editor render and draft checks passed. Interactive navigation/save checks still require a browser.');
        `
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    plugins: [{
        name: 'camera-editor-fixtures',
        setup(build) {
            build.onResolve({ filter: /^react-i18next$/ }, () => ({ path: 'translations', namespace: 'fixture' }));
            build.onResolve({ filter: /\/contexts\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
            build.onResolve({ filter: /\/contexts\/ToastContext$/ }, () => ({ path: 'toast', namespace: 'fixture' }));
            build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
                contents: path === 'auth'
                    ? 'export const useAuth = () => ({ user: { role: "viewer" }, token: null });'
                    : path === 'toast'
                        ? 'export const useToast = () => ({ showToast: () => {} });'
                        : 'export const useTranslation = () => ({ t: (_key, fallback, values = {}) => fallback.replace(/{{(\\w+)}}/g, (_match, name) => values[name] ?? "") }); export const Trans = ({ children, defaults }) => children ?? defaults ?? null;'
            }));
        }
    }]
});

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
try {
    globalThis.fetch = () => { throw new Error('Render must not call an API'); };
    globalThis.localStorage = { getItem: () => null };
    const module = { exports: {} };
    new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
} finally {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
}
