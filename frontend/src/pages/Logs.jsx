import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Terminal, Download, Search, Pause, Play, RefreshCw, FileText, Settings as SettingsIcon } from 'lucide-react';
import { ConfirmModal } from '../components/ui/ConfirmModal';

export const Logs = () => {
    const { token, user } = useAuth();
    const { showToast } = useToast();
    const [logs, setLogs] = useState([]);
    const [service, setService] = useState('backend');
    const [lines, setLines] = useState(100);
    const [search, setSearch] = useState('');
    const [autoScroll, setAutoScroll] = useState(true);
    const [loading, setLoading] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false });
    const [showSettings, setShowSettings] = useState(false);

    // Services map
    const services = [
        { id: 'all', label: 'All Services (Aggregated)' },
        { id: 'backend', label: 'Backend API' },
        { id: 'engine', label: 'Video Engine' },
        { id: 'frontend_access', label: 'Frontend Access' },
        { id: 'frontend_error', label: 'Frontend Errors' }
    ];

    const logsEndRef = useRef(null);

    // Fetch logs
    const fetchLogs = async () => {
        try {
            const params = new URLSearchParams({
                service: service,
                lines: lines
            });
            if (search) params.append('search', search);

            const res = await fetch(`/api/logs/?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                setLogs(data);
                if (autoScroll) {
                    setTimeout(() => {
                        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                }
            } else {
                // If 403, maybe redirect
            }
        } catch (err) {
            console.error("Failed to fetch logs", err);
        }
    };

    // Auto-refresh effect
    useEffect(() => {
        if (!token || user?.role !== 'admin') return;

        // Initial fetch
        fetchLogs();

        // Poll
        if (autoScroll) {
            const interval = setInterval(fetchLogs, 2000); // 2 seconds poll
            return () => clearInterval(interval);
        }
    }, [token, service, lines, search, autoScroll, user]);

    // Handle Download
    const handleDownload = () => {
        setConfirmConfig({
            isOpen: true,
            title: 'Download Sanitized Logs',
            message: 'You are about to download a system report containing logs from all containers. Steps will be taken to redact sensitive information (tokens, passwords, external IPs), but please review the files before sharing.',
            onConfirm: async () => {
                try {
                    const res = await fetch('/api/logs/download', {
                        headers: { Authorization: `Bearer ${token}` }
                    });

                    if (res.ok) {
                        const blob = await res.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `vibenvr_logs_${new Date().toISOString().slice(0, 10)}.zip`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        showToast('Logs downloaded successfully', 'success');
                    } else {
                        showToast('Download failed', 'error');
                    }
                } catch (err) {
                    showToast('Download error: ' + err.message, 'error');
                }
                setConfirmConfig({ isOpen: false });
            },
            onCancel: () => setConfirmConfig({ isOpen: false })
        });
    };

    if (user?.role !== 'admin') {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh] text-muted-foreground">
                <FileText className="w-16 h-16 mb-4 opacity-20" />
                <h2 className="text-xl font-semibold">Access Denied</h2>
                <p>Only administrators can view system logs.</p>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-8rem)] flex flex-col space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        System Logs
                    </h2>
                    <p className="text-muted-foreground mt-1">View and analyze system activity.</p>
                </div>
                <button
                    onClick={handleDownload}
                    className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm"
                >
                    <Download className="w-4 h-4" />
                    <span>Download Report</span>
                </button>
            </div>

            {/* Controls Bar */}
            <div className="bg-card border border-border p-3 rounded-lg flex flex-wrap gap-4 items-center shadow-sm">

                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Service:</span>
                    <select
                        className="bg-background border border-input rounded px-2 py-1.5 text-sm min-w-[140px]"
                        value={service}
                        onChange={(e) => setService(e.target.value)}
                    >
                        {services.map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2 flex-grow max-w-sm">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search logs..."
                        className="bg-background border border-input rounded px-3 py-1.5 text-sm w-full"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Lines:</span>
                    <input
                        type="number"
                        className="bg-background border border-input rounded px-2 py-1.5 text-sm w-20"
                        value={lines}
                        onChange={(e) => setLines(parseInt(e.target.value) || 100)}
                        min="50"
                        max="2000"
                    />
                </div>

                <div className="flex items-center gap-2 ml-auto">
                    <button
                        onClick={() => setAutoScroll(!autoScroll)}
                        className={`p-2 rounded-md border transition-colors ${autoScroll ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-background border-border text-muted-foreground'}`}
                        title={autoScroll ? "Pause Auto-scroll" : "Resume Auto-scroll"}
                    >
                        {autoScroll ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={fetchLogs}
                        className="p-2 rounded-md hover:bg-accent text-muted-foreground"
                        title="Refresh Now"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setShowSettings(true)}
                        className="p-2 rounded-md hover:bg-accent text-muted-foreground"
                        title="Log Settings"
                    >
                        <SettingsIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Logs Window */}
            <div className="flex-1 bg-black rounded-lg border border-gray-800 overflow-hidden flex flex-col font-mono text-xs md:text-sm shadow-inner">
                <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                    {logs.length === 0 ? (
                        <div className="text-gray-500 italic">No logs found or waiting for data...</div>
                    ) : (
                        logs.map((line, idx) => {
                            // Syntax highlighting logic
                            let colorClass = "text-gray-300";
                            const lower = line.toLowerCase();
                            if (lower.includes('error') || lower.includes('exception') || lower.includes('critical') || lower.includes('fail')) {
                                colorClass = "text-red-400 font-bold";
                            } else if (lower.includes('warn')) {
                                colorClass = "text-amber-400";
                            } else if (lower.includes('info')) {
                                colorClass = "text-blue-300";
                            } else if (lower.includes('debug')) {
                                colorClass = "text-gray-500";
                            }

                            // Highlight search term
                            if (search && lower.includes(search.toLowerCase())) {
                                const parts = line.split(new RegExp(`(${search})`, 'gi'));
                                return (
                                    <div key={idx} className={`${colorClass} whitespace-pre-wrap break-all border-b border-gray-900/50 pb-0.5`}>
                                        <span className="text-gray-600 mr-2 select-none w-8 inline-block text-right">{idx + 1}</span>
                                        {parts.map((part, i) =>
                                            part.toLowerCase() === search.toLowerCase()
                                                ? <span key={i} className="bg-yellow-600/50 text-white rounded px-0.5">{part}</span>
                                                : part
                                        )}
                                    </div>
                                );
                            }

                            return (
                                <div key={idx} className={`${colorClass} whitespace-pre-wrap break-all border-b border-gray-900/50 pb-0.5`}>
                                    <span className="text-gray-600 mr-2 select-none w-8 inline-block text-right">{idx + 1}</span>
                                    {line}
                                </div>
                            );
                        })
                    )}
                    <div ref={logsEndRef} />
                </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
                Logs show sanitized output. Real-time entries may be delayed by a few seconds.
            </p>

            <ConfirmModal {...confirmConfig} />
            <LogSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} token={token} showToast={showToast} />
        </div>
    );
};

// Sub-component for Settings Modal
const LogSettingsModal = ({ isOpen, onClose, token, showToast }) => {
    const [settings, setSettings] = useState({
        log_max_size_mb: '50',
        log_backup_count: '5',
        log_rotation_check_minutes: '60'
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        // Fetch current settings
        const fetchSettings = async () => {
            setLoading(true);
            try {
                // We fetch individually or we could update the bulk endpoint to support fetching? No, GET /settings is all.
                const res = await fetch('/api/settings', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setSettings({
                        log_max_size_mb: data.log_max_size_mb?.value || '50',
                        log_backup_count: data.log_backup_count?.value || '5',
                        log_rotation_check_minutes: data.log_rotation_check_minutes?.value || '60'
                    });
                }
            } catch (err) {
                console.error(err);
                showToast('Failed to load settings', 'error');
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, [isOpen, token]);

    const handleSave = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/settings/bulk', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });

            if (res.ok) {
                showToast('Log settings saved', 'success');
                onClose();
            } else {
                showToast('Failed to save settings', 'error');
            }
        } catch (err) {
            showToast('Error saving: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-md p-6 space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <SettingsIcon className="w-5 h-5" />
                    Log Rotation Settings
                </h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Max Log Size (MB)</label>
                        <input
                            type="number"
                            className="w-full bg-background border border-input rounded px-3 py-2"
                            value={settings.log_max_size_mb}
                            onChange={e => setSettings({ ...settings, log_max_size_mb: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground mt-1">If a file exceeds this size, it will be rotated.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Backup Count</label>
                        <input
                            type="number"
                            className="w-full bg-background border border-input rounded px-3 py-2"
                            value={settings.log_backup_count}
                            onChange={e => setSettings({ ...settings, log_backup_count: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground mt-1">Number of old log files to keep (e.g. 5 = keep .1 to .5).</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Check Interval (Minutes)</label>
                        <input
                            type="number"
                            className="w-full bg-background border border-input rounded px-3 py-2"
                            value={settings.log_rotation_check_minutes}
                            onChange={e => setSettings({ ...settings, log_rotation_check_minutes: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground mt-1">How often the system checks for large files.</p>
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded text-sm font-medium hover:bg-accent"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="px-4 py-2 rounded text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {loading ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};
