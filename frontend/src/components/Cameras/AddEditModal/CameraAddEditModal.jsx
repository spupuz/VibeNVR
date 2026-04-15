import React, { useEffect } from 'react';
import { 
    X, Info, Settings2, Activity, EyeOff, Shield, Film, Image, Bell, Type, Copy 
} from 'lucide-react';
import { Portal } from '../../ui/Portal';
import { SelectField } from '../../ui/FormControls';
import { Button } from '../../ui/Button';

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
    if (!showAddModal) return null;
    
    // Redirect away from motion_zones if engine is ONVIF Edge
    useEffect(() => {
        if (activeTab === 'motion_zones' && newCamera.detect_engine === 'ONVIF Edge') {
            setActiveTab('motion');
        }
    }, [newCamera.detect_engine, activeTab, setActiveTab]);

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
                            onClick={() => setShowAddModal(false)}
                            className="p-2 hover:bg-muted rounded-full transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {!editingId && (
                        <div className="mb-6 p-3 bg-primary/5 border border-primary/20 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
                            <SelectField
                                label="Clone Settings From..."
                                onChange={(val) => {
                                    if (val) {
                                        const source = cameras.find(c => c.id === parseInt(val));
                                        if (source) {
                                            setNewCamera(prev => ({
                                                ...source,
                                                id: undefined,
                                                name: `Copy of ${source.name}`,
                                                location: source.location,
                                                is_active: source.is_active,
                                                created_at: undefined
                                            }));
                                        }
                                    }
                                }}
                                options={[
                                    { value: '', label: '-- Start Fresh --' },
                                    ...cameras.map(c => ({ value: c.id, label: c.name }))
                                ]}
                            />
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
                                    className="flex items-center justify-center space-x-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-4 py-2 rounded-lg transition-colors border-blue-100 dark:border-blue-900/30 w-full sm:w-auto"
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
                                    onClick={() => setShowAddModal(false)}
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
