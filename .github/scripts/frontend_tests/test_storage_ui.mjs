// Run after the required manual rebuild: node .github/scripts/frontend_tests/test_storage_ui.mjs
// Render-only fixtures: no API calls, database access, or persistent output.
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
            import { GeneralTab } from './src/components/Cameras/AddEditModal/Tabs/GeneralTab.jsx';
            import { MoviesTab } from './src/components/Cameras/AddEditModal/Tabs/MoviesTab.jsx';
            import { SnapshotsTab } from './src/components/Cameras/AddEditModal/Tabs/SnapshotsTab.jsx';
            import { StorageTab } from './src/components/Cameras/AddEditModal/Tabs/StorageTab.jsx';
            import { StorageManager } from './src/pages/Settings/sections/StorageManager.jsx';

            const noSideEffects = () => { throw new Error('Unexpected state change or API call'); };
            const render = (Component, props) => renderToStaticMarkup(<Component {...props} />);
            const camera = {
                name: 'Test camera', rtsp_url: '', live_view_mode: 'auto',
                storage_profile_id: null, motion_storage_profile_id: 7,
                continuous_storage_profile_id: null, snapshot_storage_profile_id: null,
                archive_storage_profile_id: 7, archive_after_hours: 24,
                preserve_movies: 'For One Week', preserve_pictures: 'Forever',
                recording_mode: 'Continuous', movie_quality: 75, picture_quality: 75,
                max_storage_gb: 20, max_pictures_storage_gb: 0
            };
            const cameraBefore = JSON.stringify(camera);
            const cameraProps = {
                newCamera: camera, setNewCamera: noSideEffects,
                storageProfiles: [{ id: 7, name: 'NFS', path: '/nfs' }]
            };
            const storage = render(StorageTab, cameraProps);
            assert.ok(storage.includes('1. Save recordings'));
            assert.ok(storage.includes('2. Move older recordings'));
            assert.ok(storage.includes('3. Delete older recordings'));
            assert.ok(storage.includes('value="7" selected=""'));
            assert.ok(storage.includes('value="24"'));
            assert.ok(storage.includes('aria-expanded="false"'));
            assert.ok(!storage.includes('id="camera-storage-routing"'));
            assert.ok(storage.includes('Save to Default.'));
            assert.ok(storage.includes('Move to NFS after 24 hours'));
            assert.ok(storage.includes('Videos: delete after 7 days.'));
            assert.ok(storage.includes('Snapshots: no age-based deletion.'));
            assert.ok(storage.includes('Motion Storage Profile: NFS'));
            assert.ok(storage.includes('Video size limit<!-- -->: 20') || storage.includes('Video size limit: 20'));
            assert.ok(!storage.includes('id="camera-storage-limits"'));
            assert.ok(storage.indexOf('3. Delete older recordings') < storage.indexOf('Advanced storage limits'));
            assert.ok(!render(StorageTab, {
                ...cameraProps, newCamera: { ...camera, archive_storage_profile_id: null }
            }).includes('Move after (hours)'));
            assert.ok(render(StorageTab, {
                ...cameraProps, newCamera: { ...camera, archive_after_hours: 0 }
            }).includes('No automatic move.'));
            const custom = render(StorageTab, {
                ...cameraProps, newCamera: { ...camera, preserve_movies: '14', preserve_pictures: 'For One Month' }
            });
            assert.ok(custom.includes('Videos: delete after 14 days.'));
            assert.ok(custom.includes('Snapshots: delete after 30 days.'));
            const paused = render(StorageTab, {
                ...cameraProps, globalSettings: { archival_enabled: false, cleanup_enabled: false }
            });
            assert.ok(paused.includes('Automatic moving is disabled'));
            assert.ok(paused.includes('Automatic cleanup is disabled'));
            assert.ok(storage.includes('value="For One Week" selected=""'));
            assert.ok(storage.includes('value="Forever" selected=""'));
            assert.ok(!render(GeneralTab, cameraProps).includes('Recording location'));
            assert.ok(!render(MoviesTab, cameraProps).includes('Delete videos after'));
            assert.ok(!render(SnapshotsTab, cameraProps).includes('Delete snapshots after'));
            assert.equal(JSON.stringify(camera), cameraBefore);

            const globalSettings = {
                max_global_storage_gb: 0, archival_enabled: true, cleanup_enabled: true,
                archival_interval_hours: 24, cleanup_interval_hours: 24
            };
            const settingsBefore = JSON.stringify(globalSettings);
            const settingsProps = {
                globalSettings, setGlobalSettings: noSideEffects,
                storageStats: { storage: { used_gb: 93, total_gb: 104, percent: 89, vibe_used_gb: 17.34 } },
                occupationPercent: 89, orphanSyncStatus: { isSyncing: false },
                currentUser: { role: 'admin' }, isOpen: true, onToggle: noSideEffects
            };
            const admin = render(StorageManager, settingsProps);
            assert.ok(admin.includes('93 GB / 104 GB (89%)'));
            assert.ok(admin.includes('17.34 GB'));
            assert.ok(admin.includes('No global recording quota set.'));
            assert.ok(admin.includes('Archive — move recordings'));
            assert.ok(admin.includes('Cleanup — delete recordings'));
            assert.ok(admin.includes('Delete All Videos'));
            const viewer = render(StorageManager, { ...settingsProps, currentUser: { role: 'viewer' } });
            assert.ok(!viewer.includes('Delete All Videos'));
            assert.ok(!viewer.includes('Delete All Pictures'));
            const quota = render(StorageManager, {
                ...settingsProps, globalSettings: { ...globalSettings, max_global_storage_gb: 50 },
                occupationPercent: 34.68
            });
            assert.ok(quota.includes('93 GB / 104 GB (89%)'));
            assert.ok(quota.includes(' / 50 GB (35%)'));
            assert.equal(JSON.stringify(globalSettings), settingsBefore);
            console.log('Storage UI render checks passed (labels, values, quota, admin bulk-action visibility).');
        `
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    plugins: [{
        name: 'render-fixtures',
        setup(build) {
            build.onResolve({ filter: /^react-i18next$/ }, () => ({ path: 'translations', namespace: 'fixture' }));
            build.onResolve({ filter: /\/StorageProfileManager$/ }, () => ({ path: 'profiles', namespace: 'fixture' }));
            build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
                contents: path === 'profiles'
                    ? 'export const StorageProfileManager = () => null;'
                    : 'export const useTranslation = () => ({ t: (_key, fallback, values = {}) => fallback.replace(/{{(\\w+)}}/g, (_match, name) => values[name] ?? "") });'
            }));
        }
    }]
});

const originalFetch = globalThis.fetch;
try {
    globalThis.fetch = () => { throw new Error('Render must not make API calls'); };
    const module = { exports: {} };
    new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
} finally {
    globalThis.fetch = originalFetch;
}
