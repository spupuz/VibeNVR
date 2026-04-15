import React, { useEffect } from 'react';
import { 
    X, Info, Settings2, Activity, EyeOff, Shield, Film, Image, Bell, Type, Copy, Check 
} from 'lucide-react';
import { Portal } from '../../ui/Portal';
import { SelectField } from '../../ui/FormControls';
import { Button } from '../../ui/Button';
import { CAMERA_SETTINGS_CATEGORIES, CATEGORY_FIELD_MAP, EXCLUDED_FIELDS } from '../../../utils/cameraSettingsMapping';

// Import Tabs
import { GeneralTab } from './Tabs/GeneralTab';
import { DeviceTab } from './Tabs/DeviceTab';
import { MotionTab } from './Tabs/MotionTab';
import { PrivacyTab } from './Tabs/PrivacyTab';
import { MotionZonesTab } from './Tabs/MotionZonesTab';
import { MoviesTab } from './Tabs/MoviesTab';
import { SnapshotsTab } from './Tabs/SnapshotsTab';
import { AlertsTab } from './Tabs/AlertsTab';
import { OverlayTab } from './Tabs/OverlayTab';
import { OnvifTab } from './Tabs/OnvifTab';

export const CameraAddEditModal = ({
    showAddModal,
    setShowAddModal,
    editingId,
    setEditingId,
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
    setShowCopyModal
}) => {
    const [cloneSourceId, setCloneSourceId] = React.useState('');
    const [selectedCloneCategories, setSelectedCloneCategories] = React.useState(CAMERA_SETTINGS_CATEGORIES.map(c => c.id));

    // Redirect away from motion_zones if engine is ONVIF Edge
    useEffect(() => {
        if (newCamera && activeTab === 'motion_zones' && newCamera.detect_engine === 'ONVIF Edge') {
            setActiveTab('motion');
        }
    }, [newCamera?.detect_engine, activeTab, setActiveTab]);

    if (!showAddModal) return null;

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
            name: prev.name || `Copy of ${source.name}`,
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
        { id: 'general', label: 'General', icon: Info },
        { id: 'video', label: 'Device', icon: Settings2 },
        { id: 'motion', label: 'Motion', icon: Activity },
        { id: 'privacy', label: 'Privacy Mask', icon: EyeOff },
        { id: 'motion_zones', label: 'Motion Zones', icon: Shield },
        { id: 'movies', label: 'Movies', icon: Film },
        { id: 'still_images', label: 'Snapshots', icon: Image },
        { id: 'notifications', label: 'Alerts', icon: Bell },
        { id: 'overlay', label: 'Overlay', icon: Type },
        { id: 'onvif', label: 'ONVIF', icon: Shield },
    ].filter(tab => {
        if (tab.id === 'motion_zones' && newCamera.detect_engine === 'ONVIF Edge') return false;
        return true;
    });

    return (
        <Portal>
            <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-[2000] overflow-y-auto pt-20 sm:pt-6 p-4 lg:pl-64">
                <div className="bg-card p-4 sm:p-6 rounded-xl w-full max-w-lg border border-border relative">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-xl font-bold">{editingId ? 'Edit Camera' : 'Add New Camera'}</h2>
                            <p className="text-xs text-muted-foreground mt-1">
                                {editingId ? `Configuring ${newCamera.name}` : 'Connect and configure your RTSP camera'}
                            </p>
                        </div>
                        <button
                            onClick={() => { setShowAddModal(false); setEditingId(null); setCloneSourceId(''); }}
                            className="p-2 hover:bg-muted rounded-full transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {!editingId && (
                        <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300 shadow-sm">
                            <div className="flex items-center gap-2 mb-3 text-primary">
                                <Copy className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wider">Clone Settings</span>
                            </div>
                            
                            <SelectField
                                label="Source Camera"
                                value={cloneSourceId}
                                onChange={(val) => {
                                    setCloneSourceId(val);
                                    if (val) {
                                        performClone(val, selectedCloneCategories);
                                    }
                                }}
                                options={[
                                    { value: '', label: '-- Start Fresh --' },
                                    ...cameras.map(c => ({ value: c.id, label: c.name }))
                                ]}
                            />

                            {cloneSourceId && (
                                <div className="mt-4 animate-in fade-in zoom-in-95 duration-200">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-primary/70">Categories to Import</span>
                                        <div className="flex gap-2">
                                            <button type="button" className="text-[10px] uppercase font-bold text-blue-600 hover:underline" onClick={() => { setSelectedCloneCategories(CAMERA_SETTINGS_CATEGORIES.map(c => c.id)); performClone(cloneSourceId, CAMERA_SETTINGS_CATEGORIES.map(c => c.id)); }}>All</button>
                                            <button type="button" className="text-[10px] uppercase font-bold text-muted-foreground hover:underline" onClick={() => { setSelectedCloneCategories([]); performClone(cloneSourceId, []); }}>None</button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 bg-background/50 p-2 rounded-lg border border-primary/10">
                                        {CAMERA_SETTINGS_CATEGORIES.map(cat => (
                                            <div
                                                key={cat.id}
                                                className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors border ${selectedCloneCategories.includes(cat.id) ? 'bg-primary/10 border-primary/20 text-primary font-medium' : 'hover:bg-muted border-transparent text-muted-foreground'}`}
                                                onClick={() => toggleCloneCategory(cat.id)}
                                            >
                                                <span className="text-[11px] truncate">{cat.label}</span>
                                                <div className={`w-3.5 h-3.5 rounded border transition-colors flex items-center justify-center shrink-0 ${selectedCloneCategories.includes(cat.id) ? 'bg-primary border-primary' : 'border-muted-foreground/30'}`}>
                                                    {selectedCloneCategories.includes(cat.id) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-2 italic">* Unique settings (URLs, ONVIF credentials, Storage Profiles) are never cloned.</p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex space-x-4 mb-4 border-b border-border text-[11px] overflow-x-auto flex-nowrap min-h-[40px] pb-1 scrollbar-hide scroll-smooth relative">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                className={`pb-2 flex items-center gap-1.5 flex-shrink-0 transition-all ${activeTab === tab.id ? 'border-b-2 border-primary font-bold text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <tab.icon className="w-3.5 h-3.5" />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <form onSubmit={handleCreate} className="space-y-4">
                        <div className="max-h-[60vh] overflow-y-auto pr-2 -mr-2">
                            {activeTab === 'general' && (
                                <GeneralTab 
                                    newCamera={newCamera} 
                                    setNewCamera={setNewCamera} 
                                    storageProfiles={storageProfiles} 
                                />
                            )}
                            {activeTab === 'video' && (
                                <DeviceTab 
                                    newCamera={newCamera} 
                                    setNewCamera={setNewCamera} 
                                />
                            )}
                            {activeTab === 'motion' && (
                                <MotionTab 
                                    newCamera={newCamera} 
                                    setNewCamera={setNewCamera} 
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
                                    editingId={editingId} 
                                    newCamera={newCamera} 
                                    setNewCamera={setNewCamera} 
                                    stats={stats} 
                                    handleCleanup={handleCleanup} 
                                />
                            )}
                            {activeTab === 'still_images' && (
                                <SnapshotsTab 
                                    editingId={editingId} 
                                    newCamera={newCamera} 
                                    setNewCamera={setNewCamera} 
                                    stats={stats} 
                                    handleCleanup={handleCleanup} 
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
                        </div>

                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pt-4 border-t border-border mt-4 gap-4">
                            {editingId && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setShowCopyModal(true)}
                                    className="flex items-center justify-center space-x-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-4 py-2 rounded-lg transition-colors border-blue-100 dark:border-blue-900/30 w-full sm:w-auto whitespace-nowrap"
                                >
                                    <Copy className="w-4 h-4" />
                                    <span>Copy Settings to...</span>
                                </Button>
                            )}
                            {!editingId && <div className="hidden sm:block"></div>}

                            <div className="flex space-x-3 w-full sm:w-auto">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => { setShowAddModal(false); setEditingId(null); setCloneSourceId(''); }}
                                    className="flex-1 sm:flex-none border border-border sm:border-none"
                                >
                                    Cancel
                                </Button>
                                {editingId && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={(e) => handleCreate(e, false)}
                                        className="flex-1 sm:flex-none text-primary hover:bg-primary/10 border-primary/20"
                                    >
                                        Apply
                                    </Button>
                                )}
                                <Button
                                    type="submit"
                                    className="flex-1 sm:flex-none"
                                >
                                    {editingId ? 'Save Changes' : 'Create Camera'}
                                </Button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </Portal>
    );
};
