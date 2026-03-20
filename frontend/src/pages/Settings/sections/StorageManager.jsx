import React from 'react';
import { HardDrive, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { InputField } from '../../../components/ui/FormControls';
import { StorageProfileManager } from '../../../components/StorageProfileManager';

export const StorageManager = ({
    globalSettings,
    setGlobalSettings,
    storageStats,
    occupationPercent,
    orphanSyncStatus,
    setOrphanSyncStatus,
    setConfirmConfig,
    showToast,
    fetchStats,
    token,
    currentUser,
    isOpen,
    onToggle
}) => {
    return (
        <CollapsibleSection
            id="storage"
            title="Storage Management"
            description="Configure global quotas, cleanup policies, and custom storage profiles."
            icon={<HardDrive className="w-6 h-6" />}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <div className="space-y-4">
                {/* Storage Occupation Display */}
                <div className="bg-muted/30 rounded-lg p-4 mb-4 border border-border/50">
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-sm font-medium">Storage Occupation</span>
                        <span className="text-xs text-muted-foreground">
                            {storageStats.used_gb} GB / {globalSettings.max_global_storage_gb > 0 ? globalSettings.max_global_storage_gb : storageStats.total_gb} GB
                            ({Math.round(occupationPercent)}%)
                        </span>
                    </div>
                    <div className="w-full h-3 bg-background rounded-full border border-border overflow-hidden">
                        <div
                            className={'h-full transition-all duration-500 rounded-full ' +
                                (occupationPercent > 90 ? 'bg-red-500' : occupationPercent > 70 ? 'bg-amber-500' : 'bg-green-500')
                            }
                            style={{ width: Math.min(occupationPercent, 100) + '%' }}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 italic opacity-70">
                        {globalSettings.max_global_storage_gb > 0
                            ? 'Currently using ' + storageStats.used_gb + ' GB of your ' + globalSettings.max_global_storage_gb + ' GB limit.'
                            : 'Total disk usage. No global limit set.'}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    <InputField
                        label="Storage Quota (GB)"
                        type="number"
                        help="Total space allowed for recordings. The system will start deleting old recordings when this limit is reached."
                        unit="GB"
                        value={globalSettings.max_global_storage_gb}
                        onChange={(val) => setGlobalSettings({ ...globalSettings, max_global_storage_gb: val })}
                    />
                    <div className="space-y-2">
                        <label className="block text-sm font-medium">Auto-Cleanup Policy</label>
                        <div className="p-3 bg-muted/50 rounded-lg border border-border/50 text-xs text-muted-foreground">
                            VibeNVR uses a "FIFO" (First In, First Out) cleanup strategy. When quota is exceeded or disk space is low (&lt; 5%), the oldest recordings are automatically removed.
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-2">Cleanup Interval (Hours)</label>
                    <select
                        value={globalSettings.cleanup_interval_hours}
                        onChange={(e) => setGlobalSettings({ ...globalSettings, cleanup_interval_hours: parseInt(e.target.value) })}
                        className="w-full max-w-full sm:max-w-xs bg-background border border-input rounded-lg px-3 py-2"
                    >
                        <option value="1">Every Hour</option>
                        <option value="6">Every 6 Hours</option>
                        <option value="12">Every 12 Hours</option>
                        <option value="24">Every 24 Hours</option>
                        <option value="48">Every 2 Days</option>
                        <option value="168">Every Week</option>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                        How often to check and clean up old recordings
                    </p>
                </div>

                <div className="pt-4 border-t border-border mt-4">
                    <StorageProfileManager />
                </div>

                {/* Maintenance Tools */}
                <div className="pt-4 border-t border-border mt-4 space-y-6">
                    <div>
                        <h4 className="text-sm font-semibold mb-3">Maintenance</h4>
                        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                            <div className="flex-1 min-w-[280px]">
                                <Button
                                    onClick={async () => {
                                        setConfirmConfig({
                                            isOpen: true,
                                            title: 'Manual Cleanup',
                                            message: 'Are you sure you want to trigger storage cleanup now? This will scan all camera folders and delete recordings that exceed set limits.',
                                            onConfirm: async () => {
                                                try {
                                                    await fetch('/api/settings/cleanup', {
                                                        method: 'POST',
                                                        headers: { Authorization: `Bearer ${token}` }
                                                    });
                                                    showToast('Cleanup triggered successfully!', 'success');
                                                    fetchStats();
                                                } catch (err) {
                                                    showToast('Failed to trigger cleanup: ' + err.message, 'error');
                                                }
                                                setConfirmConfig({ isOpen: false });
                                            },
                                            onCancel: () => setConfirmConfig({ isOpen: false })
                                        });
                                    }}
                                    variant="destructive"
                                    className="w-full sm:w-auto px-6 py-3 font-bold shadow-sm"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    <span>Clean Up Storage Now</span>
                                </Button>
                                <p className="text-xs text-muted-foreground mt-2">
                                    This will force an immediate check and deletion of recordings that exceed your storage limits or retention periods.
                                </p>
                            </div>

                            <div className="flex-1 min-w-[280px]">
                                <Button
                                    onClick={async () => {
                                        setConfirmConfig({
                                            isOpen: true,
                                            title: 'Recover Orphaned Recordings',
                                            message: 'This will scan all camera folders for recordings that exist on disk but are missing from the database, and import them into the timeline. This is useful after system updates or migration.',
                                            onConfirm: async () => {
                                                try {
                                                    const res = await fetch('/api/settings/sync-orphans', {
                                                        method: 'POST',
                                                        headers: { Authorization: `Bearer ${token}` }
                                                    });
                                                    if (res.status === 429) {
                                                        const data = await res.json();
                                                        showToast(data.detail, 'error');
                                                    } else if (res.ok) {
                                                        showToast('Recovery started in background. Please wait...', 'success');
                                                        setOrphanSyncStatus({ isSyncing: true, status: 'running' });
                                                    } else {
                                                        const data = await res.json();
                                                        showToast('Recovery failed: ' + data.detail, 'error');
                                                    }
                                                } catch (err) {
                                                    showToast('Failed to trigger recovery: ' + err.message, 'error');
                                                }
                                                setConfirmConfig({ isOpen: false });
                                            },
                                            onCancel: () => setConfirmConfig({ isOpen: false })
                                        });
                                    }}
                                    disabled={orphanSyncStatus.isSyncing}
                                    variant="outline"
                                    className={`w-full sm:w-auto px-6 py-3 font-bold shadow-sm ${orphanSyncStatus.isSyncing ? "opacity-75 cursor-not-allowed" : ""}`}
                                >
                                    <HardDrive className={`w-4 h-4 mr-2 ${orphanSyncStatus.isSyncing ? "animate-pulse" : ""}`} />
                                    <span>{orphanSyncStatus.isSyncing ? "Scanning..." : "Recover Orphaned Recordings"}</span>
                                </Button>
                                <p className="text-xs text-muted-foreground mt-2">
                                    Scans for video files on disk that aren't in the database and imports them into the timeline.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bulk Delete Section */}
                {currentUser?.role === 'admin' && (
                    <div className="pt-4 border-t border-border mt-4">
                        <h4 className="text-sm font-semibold mb-3">Bulk Deletion</h4>
                        <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3">
                            <Button
                                variant="outline"
                                className="w-full sm:w-auto border-red-500/50 text-red-500 hover:bg-red-500/10 py-3 h-auto min-h-[44px]"
                                onClick={() => setConfirmConfig({
                                    isOpen: true,
                                    title: 'Delete All Videos',
                                    message: 'Are you sure you want to delete ALL video recordings? This action cannot be undone and will free up disk space.',
                                    onConfirm: async () => {
                                        try {
                                            const res = await fetch('/api/events/bulk/all?event_type=video', {
                                                method: 'DELETE',
                                                headers: { Authorization: 'Bearer ' + token }
                                            });
                                            const data = await res.json();
                                            showToast(`Deleted ${data.deleted_count} videos (${data.deleted_size_mb} MB)`, 'success');
                                            fetchStats();
                                        } catch (e) {
                                            showToast('Failed to delete videos', 'error');
                                        }
                                        setConfirmConfig({ isOpen: false });
                                    }
                                })}
                            >
                                <Trash2 className="w-4 h-4 mr-2 shrink-0" />
                                <span className="truncate sm:whitespace-normal">Delete All Videos</span>
                            </Button>

                            <Button
                                variant="outline"
                                className="w-full sm:w-auto border-red-500/50 text-red-500 hover:bg-red-500/10 py-3 h-auto min-h-[44px]"
                                onClick={() => setConfirmConfig({
                                    isOpen: true,
                                    title: 'Delete All Pictures',
                                    message: 'Are you sure you want to delete ALL picture snapshots? This action cannot be undone.',
                                    onConfirm: async () => {
                                        try {
                                            const res = await fetch('/api/events/bulk/all?event_type=picture', {
                                                method: 'DELETE',
                                                headers: { Authorization: 'Bearer ' + token }
                                            });
                                            const data = await res.json();
                                            showToast(`Deleted ${data.deleted_count} pictures (${data.deleted_size_mb} MB)`, 'success');
                                            fetchStats();
                                        } catch (e) {
                                            showToast('Failed to delete pictures', 'error');
                                        }
                                        setConfirmConfig({ isOpen: false });
                                    }
                                })}
                            >
                                <Trash2 className="w-4 h-4 mr-2 shrink-0" />
                                <span className="truncate sm:whitespace-normal">Delete All Pictures</span>
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </CollapsibleSection>
    );
};
