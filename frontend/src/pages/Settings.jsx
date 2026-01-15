import React, { useState, useEffect } from 'react';
import { Monitor, Save, HardDrive, Clock, Trash2 } from 'lucide-react';

export const Settings = () => {
    const [liveViewColumns, setLiveViewColumns] = useState(() => {
        return localStorage.getItem('liveViewColumns') || 'auto';
    });

    // Global settings from backend
    const [globalSettings, setGlobalSettings] = useState({
        max_global_storage_gb: 0,
        cleanup_enabled: true,
        cleanup_interval_hours: 24
    });
    const [storageStats, setStorageStats] = useState({ used_gb: 0, total_gb: 0, percent: 0 });
    const [loading, setLoading] = useState(true);

    const occupationPercent = globalSettings.max_global_storage_gb > 0
        ? (storageStats.used_gb / globalSettings.max_global_storage_gb) * 100
        : storageStats.percent;

    useEffect(() => {
        fetchSettings();
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const res = await fetch('http://localhost:5000/stats/');
            if (res.ok) {
                const data = await res.json();
                setStorageStats(data.storage);
            }
        } catch (err) {
            console.error('Failed to fetch stats', err);
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch('http://localhost:5000/settings/');
            if (res.ok) {
                const data = await res.json();
                setGlobalSettings({
                    max_global_storage_gb: parseFloat(data.max_global_storage_gb?.value) || 0,
                    cleanup_enabled: data.cleanup_enabled?.value === 'true',
                    cleanup_interval_hours: parseInt(data.cleanup_interval_hours?.value) || 24
                });
            }
        } catch (err) {
            console.error('Failed to fetch settings', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        // Save localStorage settings
        localStorage.setItem('liveViewColumns', liveViewColumns);

        // Save backend settings
        try {
            await fetch('http://localhost:5000/settings/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    max_global_storage_gb: globalSettings.max_global_storage_gb.toString(),
                    cleanup_enabled: globalSettings.cleanup_enabled.toString(),
                    cleanup_interval_hours: globalSettings.cleanup_interval_hours.toString()
                })
            });
            alert('Settings saved successfully!');
        } catch (err) {
            alert('Failed to save settings: ' + err.message);
        }
    };

    const initDefaults = async () => {
        try {
            await fetch('http://localhost:5000/settings/init-defaults', { method: 'POST' });
            fetchSettings();
        } catch (err) {
            console.error('Failed to init defaults', err);
        }
    };

    useEffect(() => {
        initDefaults();
    }, []);

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground mt-2">Configure your VibeNVR preferences.</p>
            </div>

            {/* Storage Settings */}
            <div className="bg-card border border-border rounded-xl p-6 space-y-6">
                <div className="flex items-center space-x-3 pb-4 border-b border-border">
                    <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                        <HardDrive className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-lg">Storage Management</h3>
                        <p className="text-sm text-muted-foreground">Control disk space usage for recordings</p>
                    </div>
                </div>

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
                                className={`h-full transition-all duration-500 rounded-full ${occupationPercent > 90 ? 'bg-red-500' : occupationPercent > 70 ? 'bg-amber-500' : 'bg-green-500'
                                    }`}
                                style={{ width: `${Math.min(occupationPercent, 100)}%` }}
                            />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2 italic">
                            {globalSettings.max_global_storage_gb > 0
                                ? `Currently using ${storageStats.used_gb} GB of your ${globalSettings.max_global_storage_gb} GB limit.`
                                : `Total disk usage. No global limit set.`}
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">Maximum Global Storage (GB)</label>
                        <input
                            type="number"
                            value={globalSettings.max_global_storage_gb}
                            onChange={(e) => setGlobalSettings({ ...globalSettings, max_global_storage_gb: parseFloat(e.target.value) || 0 })}
                            className="w-full max-w-xs bg-background border border-input rounded-lg px-3 py-2"
                            min="0"
                            step="1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Set total storage limit for all cameras. 0 = unlimited. When exceeded, oldest recordings are deleted.
                        </p>
                    </div>

                    <div className="flex items-center justify-between max-w-xs">
                        <label className="text-sm font-medium">Enable Automatic Cleanup</label>
                        <button
                            type="button"
                            onClick={() => setGlobalSettings({ ...globalSettings, cleanup_enabled: !globalSettings.cleanup_enabled })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${globalSettings.cleanup_enabled ? 'bg-primary' : 'bg-muted'
                                }`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${globalSettings.cleanup_enabled ? 'translate-x-6' : 'translate-x-1'
                                }`} />
                        </button>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">Cleanup Interval (Hours)</label>
                        <select
                            value={globalSettings.cleanup_interval_hours}
                            onChange={(e) => setGlobalSettings({ ...globalSettings, cleanup_interval_hours: parseInt(e.target.value) })}
                            className="w-full max-w-xs bg-background border border-input rounded-lg px-3 py-2"
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
                </div>
            </div>

            {/* Live View Settings */}
            <div className="bg-card border border-border rounded-xl p-6 space-y-6">
                <div className="flex items-center space-x-3 pb-4 border-b border-border">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Monitor className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-lg">Live View Layout</h3>
                        <p className="text-sm text-muted-foreground">Customize how cameras are displayed</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">Grid Columns</label>
                        <select
                            value={liveViewColumns}
                            onChange={(e) => setLiveViewColumns(e.target.value)}
                            className="w-full max-w-xs bg-background border border-input rounded-lg px-3 py-2"
                        >
                            <option value="auto">Auto (Based on camera count)</option>
                            <option value="1">1 Column</option>
                            <option value="2">2 Columns</option>
                            <option value="3">3 Columns</option>
                            <option value="4">4 Columns</option>
                        </select>
                        <p className="text-xs text-muted-foreground mt-1">
                            Choose how many columns to display in the Live View grid
                        </p>
                    </div>
                </div>
            </div>

            {/* Clean Up Button */}
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                        <Trash2 className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-lg">Maintenance</h3>
                        <p className="text-sm text-muted-foreground">Manual system maintenance tasks</p>
                    </div>
                </div>
                <div>
                    <button
                        onClick={async () => {
                            if (confirm('Are you sure you want to trigger storage cleanup now?')) {
                                try {
                                    await fetch('http://localhost:5000/settings/cleanup', { method: 'POST' });
                                    alert('Cleanup triggered successfully!');
                                    fetchStats();
                                } catch (err) {
                                    alert('Failed to trigger cleanup: ' + err.message);
                                }
                            }
                        }}
                        className="flex items-center space-x-2 bg-amber-500 text-white px-6 py-3 rounded-lg hover:bg-amber-600 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                        <span>Clean Up Storage Now</span>
                    </button>
                    <p className="text-xs text-muted-foreground mt-2">
                        This will force an immediate check and deletion of recordings that exceed your storage limits or retention periods.
                    </p>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    className="flex items-center space-x-2 bg-primary text-primary-foreground px-6 py-2 rounded-lg hover:bg-primary/90 transition-colors"
                >
                    <Save className="w-4 h-4" />
                    <span>Save Settings</span>
                </button>
            </div>
        </div>
    );
};
