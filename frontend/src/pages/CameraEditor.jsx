import React, { useEffect } from 'react';
import { 
    ArrowLeft, Info, Settings2, Activity, EyeOff, Shield, Film, Image, Bell, Type, Copy, Check, Brain, Radio, HardDrive
} from 'lucide-react';
import { SelectField } from '../components/ui/FormControls';
import { Button } from '../components/ui/Button';
import { CAMERA_SETTINGS_CATEGORIES, CATEGORY_FIELD_MAP, EXCLUDED_FIELDS } from '../utils/cameraSettingsMapping';

// Import Tabs
import { GeneralTab } from '../components/Cameras/AddEditModal/Tabs/GeneralTab';
import { DeviceTab } from '../components/Cameras/AddEditModal/Tabs/DeviceTab';
import { MotionTab } from '../components/Cameras/AddEditModal/Tabs/MotionTab';
import { EventSourcesTab } from '../components/Cameras/AddEditModal/Tabs/EventSourcesTab';
import { PrivacyTab } from '../components/Cameras/AddEditModal/Tabs/PrivacyTab';
import { MotionZonesTab } from '../components/Cameras/AddEditModal/Tabs/MotionZonesTab';
import { MoviesTab } from '../components/Cameras/AddEditModal/Tabs/MoviesTab';
import { SnapshotsTab } from '../components/Cameras/AddEditModal/Tabs/SnapshotsTab';
import { StorageTab } from '../components/Cameras/AddEditModal/Tabs/StorageTab';
import { AlertsTab } from '../components/Cameras/AddEditModal/Tabs/AlertsTab';
import { OverlayTab } from '../components/Cameras/AddEditModal/Tabs/OverlayTab';
import { OnvifTab } from '../components/Cameras/AddEditModal/Tabs/OnvifTab';
import { AITab } from '../components/Cameras/AddEditModal/Tabs/AITab';
import { useTranslation } from 'react-i18next';

export const CameraEditor = ({
    editingId,
    activeTab,
    setActiveTab,
    newCamera,
    setNewCamera,
    storageProfiles,
    cameras,
    token,
    stats,
    handleCreate,
    handleCleanup,
    handleTestNotification,
    setShowCopyModal,
    globalSettings,
    onLeave,
    isDirty,
    isSaving
}) => {
    const { t } = useTranslation();
    const [cloneSourceId, setCloneSourceId] = React.useState('');
    const [selectedCloneCategories, setSelectedCloneCategories] = React.useState(CAMERA_SETTINGS_CATEGORIES.map(c => c.id));

    // Redirect away from motion_zones if engine is ONVIF Edge
    // OR away from AI tab if engine is not AI
    useEffect(() => {
        if (newCamera && activeTab === 'motion_zones' && newCamera.detect_engine === 'ONVIF Edge') {
            setActiveTab('motion');
        }
        if (newCamera && activeTab === 'ai' && newCamera.detect_engine !== 'AI') {
            setActiveTab('motion');
        }
    }, [newCamera?.detect_engine, activeTab, setActiveTab]);

    const performClone = (sourceId, categories) => {
        const source = cameras.find(c => c.id === parseInt(sourceId));
        if (!source) return;

        // Determine which fields to copy
        const fieldsToCopy = [];
        categories.forEach(cat => {
            if (CATEGORY_FIELD_MAP[cat]) {
                fieldsToCopy.push(...CATEGORY_FIELD_MAP[cat]);
            }
        });

        const settingsToCopy = Object.keys(source).reduce((acc, key) => {
            if (fieldsToCopy.includes(key) && !EXCLUDED_FIELDS.includes(key)) {
                acc[key] = source[key];
            }
            return acc;
        }, {});

        setNewCamera(prev => ({
            ...prev,
            ...settingsToCopy,
            id: undefined,
            name: prev.name || t('camera_editor.clone_name', 'Copy of {{name}}', { name: source.name }),
            location: prev.location || source.location,
            is_active: source.is_active,
            created_at: undefined
        }));
    };

    const toggleCloneCategory = (id) => {
        const next = selectedCloneCategories.includes(id)
            ? selectedCloneCategories.filter(c => c !== id)
            : [...selectedCloneCategories, id];
        setSelectedCloneCategories(next);
        if (cloneSourceId) {
            performClone(cloneSourceId, next);
        }
    };

    const tabs = [
        { id: 'general', label: t('cameras.general', 'General'), icon: Info },
        { id: 'video', label: t('cameras.device', 'Device'), icon: Settings2 },
        { id: 'event_sources', label: t('cameras.event_sources', 'Event Sources'), icon: Radio },
        { id: 'motion', label: t('cameras.motion', 'Motion'), icon: Activity },
        { id: 'privacy', label: t('cameras.privacy_mask', 'Privacy Mask'), icon: EyeOff },
        { id: 'motion_zones', label: t('cameras.motion_zones', 'Motion Zones'), icon: Shield },
        { id: 'movies', label: t('cameras.movies', 'Movies'), icon: Film },
        { id: 'still_images', label: t('cameras.snapshots', 'Snapshots'), icon: Image },
        { id: 'storage', label: t('cameras.storage', 'Storage'), icon: HardDrive },
        { id: 'notifications', label: t('cameras.alerts', 'Alerts'), icon: Bell },
        { id: 'overlay', label: t('cameras.overlay', 'Overlay'), icon: Type },
        { id: 'onvif', label: t('cameras.onvif', 'ONVIF'), icon: Shield },
        { id: 'ai', label: t('cameras.ai_tracking', 'AI & Tracking'), icon: Brain },
    ].filter(tab => {
        if (tab.id === 'motion_zones' && newCamera.detect_engine === 'ONVIF Edge') return false;
        if (tab.id === 'ai' && newCamera.detect_engine !== 'AI') return false;
        return true;
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold">{editingId ? t('cameras.edit_camera', 'Edit Camera') : t('cameras.add_new_camera', 'Add New Camera')}</h1>
                    <p className="text-xs text-muted-foreground mt-1">
                        {editingId ? t('cameras.configuring_camera', 'Configuring {{name}}', { name: newCamera.name }) : t('cameras.connect_configure', 'Connect and configure your RTSP camera')}
                    </p>
                </div>
                <Button type="button" variant="outline" onClick={onLeave} disabled={isSaving}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    {t('camera_editor.back', 'Back to cameras')}
                </Button>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col gap-6 min-h-[70vh]">
                <fieldset disabled={isSaving} className="min-w-0 flex-1 space-y-6">
                    {!editingId && (
                        <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300 shadow-sm">
                            <div className="flex items-center gap-2 mb-3 text-primary">
                                <Copy className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wider">{t('cameras.clone_settings', 'Clone Settings')}</span>
                            </div>
                            
                            <SelectField
                                label={t('camera_editor.source', 'Source Camera')}
                                value={cloneSourceId}
                                onChange={(val) => {
                                    setCloneSourceId(val);
                                    if (val) {
                                        performClone(val, selectedCloneCategories);
                                    }
                                }}
                                options={[
                                    { value: '', label: t('cameras.start_fresh', '-- Start Fresh --') },
                                    ...cameras.map(c => ({ value: c.id, label: c.name }))
                                ]}
                            />

                            {cloneSourceId && (
                                <div className="mt-4 animate-in fade-in zoom-in-95 duration-200">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-primary/70">{t('cameras.categories_to_import', 'Categories to Import')}</span>
                                        <div className="flex gap-2">
                                            <button type="button" className="text-[10px] uppercase font-bold text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm" onClick={() => { setSelectedCloneCategories(CAMERA_SETTINGS_CATEGORIES.map(c => c.id)); performClone(cloneSourceId, CAMERA_SETTINGS_CATEGORIES.map(c => c.id)); }}>{t('cameras.all', 'All')}</button>
                                            <button type="button" className="text-[10px] uppercase font-bold text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm" onClick={() => { setSelectedCloneCategories([]); performClone(cloneSourceId, []); }}>{t('cameras.none', 'None')}</button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 bg-background/50 p-2 rounded-lg border border-primary/10">
                                        {CAMERA_SETTINGS_CATEGORIES.map(cat => (
                                            <button
                                                key={cat.id}
                                                type="button"
                                                aria-pressed={selectedCloneCategories.includes(cat.id)}
                                                className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors border ${selectedCloneCategories.includes(cat.id) ? 'bg-primary/10 border-primary/20 text-primary font-medium' : 'hover:bg-muted border-transparent text-muted-foreground'}`}
                                                onClick={() => toggleCloneCategory(cat.id)}
                                            >
                                                <span className="text-[11px] truncate">{cat.label}</span>
                                                <div className={`w-3.5 h-3.5 rounded border transition-colors flex items-center justify-center shrink-0 ${selectedCloneCategories.includes(cat.id) ? 'bg-primary border-primary' : 'border-muted-foreground/30'}`}>
                                                    {selectedCloneCategories.includes(cat.id) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-2 italic">{t('cameras.unique_settings_urls_onvi', '* Unique settings (URLs, ONVIF credentials, Storage Profiles) are never cloned.')}</p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)] gap-6 items-start">
                        <div className="lg:hidden">
                            <SelectField
                                label={t('cameras.settings_categories', 'Settings Categories')}
                                value={activeTab}
                                onChange={setActiveTab}
                                options={tabs.map(tab => ({ value: tab.id, label: tab.label }))}
                            />
                        </div>
                        <nav aria-label={t('cameras.settings_categories', 'Settings Categories')} className="hidden lg:block sticky top-4 rounded-xl border border-border bg-card p-2">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    aria-current={activeTab === tab.id ? 'true' : undefined}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${activeTab === tab.id ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                                >
                                    <tab.icon className="w-4 h-4 shrink-0" />
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                        <div className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6 min-h-[65vh]">
                            {activeTab === 'general' && (
                                <GeneralTab 
                                    newCamera={newCamera} 
                                    setNewCamera={setNewCamera} 
                                />
                            )}
                            {activeTab === 'video' && (
                                <DeviceTab 
                                    newCamera={newCamera} 
                                    setNewCamera={setNewCamera} 
                                />
                            )}
                            {activeTab === 'storage' && (
                                <StorageTab
                                    editingId={editingId}
                                    newCamera={newCamera}
                                    setNewCamera={setNewCamera}
                                    storageProfiles={storageProfiles}
                                    stats={stats}
                                    handleCleanup={handleCleanup}
                                    globalSettings={globalSettings}
                                />
                            )}
                            {activeTab === 'event_sources' && (
                                <EventSourcesTab
                                    newCamera={newCamera}
                                    setNewCamera={setNewCamera}
                                    globalSettings={globalSettings}
                                    setActiveTab={setActiveTab}
                                />
                            )}
                            {activeTab === 'motion' && (
                                <MotionTab 
                                    newCamera={newCamera} 
                                    setNewCamera={setNewCamera} 
                                    globalSettings={globalSettings}
                                />
                            )}
                            {activeTab === 'privacy' && (
                                <PrivacyTab 
                                    editingId={editingId} 
                                    token={token} 
                                    newCamera={newCamera} 
                                    setNewCamera={setNewCamera} 
                                />
                            )}
                            {activeTab === 'motion_zones' && (
                                <MotionZonesTab 
                                    editingId={editingId} 
                                    token={token} 
                                    newCamera={newCamera} 
                                    setNewCamera={setNewCamera} 
                                />
                            )}
                            {activeTab === 'movies' && (
                                <MoviesTab 
                                    newCamera={newCamera} 
                                    setNewCamera={setNewCamera} 
                                />
                            )}
                            {activeTab === 'still_images' && (
                                <SnapshotsTab 
                                    newCamera={newCamera} 
                                    setNewCamera={setNewCamera} 
                                />
                            )}
                            {activeTab === 'notifications' && (
                                <AlertsTab 
                                    newCamera={newCamera} 
                                    setNewCamera={setNewCamera} 
                                    handleTestNotification={handleTestNotification} 
                                />
                            )}
                            {activeTab === 'overlay' && (
                                <OverlayTab 
                                    newCamera={newCamera} 
                                    setNewCamera={setNewCamera} 
                                />
                            )}
                            {activeTab === 'onvif' && (
                                <OnvifTab 
                                    newCamera={newCamera} 
                                    setNewCamera={setNewCamera} 
                                />
                            )}
                            {activeTab === 'ai' && (
                                <AITab 
                                    newCamera={newCamera} 
                                    setNewCamera={setNewCamera} 
                                    globalSettings={globalSettings}
                                />
                            )}
                        </div>
                    </div>
                </fieldset>

                <div className="sticky bottom-0 z-20 p-3 sm:p-4 border border-border bg-card/95 backdrop-blur-sm rounded-xl shadow-sm flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground" role="status">{isSaving ? t('camera_editor.saving', 'Saving...') : isDirty ? t('camera_editor.unsaved', 'Unsaved changes') : t('camera_editor.saved', 'No unsaved changes')}</p>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        <Button type="button" variant="ghost" onClick={onLeave} disabled={isSaving} className="flex-1 sm:flex-none">
                            {t('camera_editor.back', 'Back to cameras')}
                        </Button>
                        {editingId && (
                            <Button type="button" variant="outline" onClick={() => setShowCopyModal(true)} disabled={isSaving} title={t('cameras.copy_settings_to', 'Copy Settings to...')} aria-label={t('cameras.copy_settings_to', 'Copy Settings to...')}>
                                <Copy className="w-4 h-4" />
                                <span className="hidden xl:inline ml-2">{t('cameras.copy_settings_to', 'Copy Settings to...')}</span>
                            </Button>
                        )}
                        {editingId && (
                            <Button type="button" variant="outline" onClick={(e) => handleCreate(e, false)} disabled={isSaving} className="flex-1 sm:flex-none">
                                {t('actions.apply', 'Apply')}
                            </Button>
                        )}
                        <Button type="submit" disabled={isSaving} className="flex-1 sm:flex-none">
                            {editingId ? t('actions.save_changes', 'Save Changes') : t('actions.create_camera', 'Create Camera')}
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );
};
