import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, Plus, Trash2, MapPin, Activity, Edit, Download, Upload, Film, Image, Copy, X } from 'lucide-react';
import { Toggle, Slider, InputField, SelectField, SectionHeader } from '../components/ui/FormControls';
import { GroupsManager } from '../components/GroupsManager';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Portal } from '../components/ui/Portal';
import { Button } from '../components/ui/Button';

const CameraCard = ({ camera, onDelete, onEdit, onToggleActive, isSelected, onSelect }) => {
    const { user, token } = useAuth();
    const { showToast } = useToast();
    return (
        <div
            className={`bg-card border-2 rounded-xl flex flex-col hover:shadow-lg transition-all duration-300 group relative overflow-hidden
                ${!camera.is_active ? 'opacity-70 grayscale-[0.5]' : ''}
                ${isSelected ? 'border-primary ring-1 ring-primary/20' : 'border-border'}
            `}
        >
            {/* Selection Checkbox */}
            {user?.role === 'admin' && (
                <div
                    className={`absolute top-4 left-4 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-all cursor-pointer ${isSelected ? 'bg-primary border-primary' : 'bg-background/80 border-border group-hover:border-primary/50'
                        }`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect?.(camera.id);
                    }}
                >
                    {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </div>
            )}

            <div className="p-6 flex-1">
                <div className="flex justify-between items-center mb-4">
                    <div className={`p-2 rounded-lg transition-colors ml-2 ${isSelected ? 'bg-primary text-white' : 'bg-primary/10 text-primary'}`}>
                        <Camera className="w-6 h-6" />
                    </div>
                    {user?.role === 'admin' && (
                        <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                            <Toggle
                                checked={camera.is_active}
                                onChange={() => onToggleActive(camera)}
                                compact={true}
                            />
                        </div>
                    )}
                </div>

                <div className="mb-4">
                    <h3 className="font-semibold text-lg flex items-center flex-wrap gap-2">
                        <span className="mr-1">{camera.name}</span>
                        <span className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded text-muted-foreground border border-border whitespace-nowrap">
                            ID: {camera.id}
                        </span>
                    </h3>
                    <div className="flex items-center text-xs text-muted-foreground mt-1">
                        <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                        <span className="truncate" title={camera.location}>{camera.location || 'Unknown Location'}</span>
                    </div>
                </div>

                {user?.role === 'admin' && (
                    <div className="space-y-2 text-sm text-muted-foreground">
                        <p className="truncate">
                            <span className="font-medium text-foreground">RTSP:</span> {(() => {
                                try {
                                    if (camera.rtsp_url && camera.rtsp_url.includes('@')) {
                                        const parts = camera.rtsp_url.split('@');
                                        const protocol = parts[0].split('://')[0] + '://';
                                        return protocol + parts[1];
                                    }
                                    return camera.rtsp_url;
                                } catch (e) {
                                    return camera.rtsp_url;
                                }
                            })()}
                        </p>
                    </div>
                )}
            </div>

            <div className="flex justify-end p-4 bg-muted/10 border-t border-border space-x-2">
                {user?.role === 'admin' && (
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                                try {
                                    const res = await fetch(`/api/cameras/${camera.id}/export`, {
                                        headers: { Authorization: `Bearer ${token}` }
                                    });
                                    if (res.ok) {
                                        const blob = await res.blob();
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;

                                        const disposition = res.headers.get('Content-Disposition');
                                        let filename = `vibenvr_camera_${camera.name.replace(' ', '_')}_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
                                        if (disposition && disposition.includes('filename=')) {
                                            filename = disposition.split('filename=')[1].replace(/"/g, '');
                                        }
                                        a.download = filename;

                                        document.body.appendChild(a);
                                        a.click();
                                        window.URL.revokeObjectURL(url);
                                        document.body.removeChild(a);
                                        showToast("Camera settings exported successfully", "success");
                                    } else {
                                        showToast("Failed to export settings", "error");
                                    }
                                } catch (e) {
                                    showToast("Export error: " + e.message, "error");
                                }
                            }}
                            className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/40"
                            title="Export Camera Settings"
                        >
                            <Download className="w-5 h-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(camera)}
                            className="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                            title="Edit Camera"
                        >
                            <Edit className="w-5 h-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDelete(camera.id)}
                            className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40"
                            title="Delete Camera"
                        >
                            <Trash2 className="w-5 h-5" />
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
};

const parseRtspUrl = (url) => {
    let user = '', pass = '', host = url || '';
    if (!url) return { user, pass, host };

    try {
        // Handle various formats: 
        // 1. rtsp://user:pass@host:port/path
        // 2. rtsp://user@host:port/path
        // 3. rtsp://host:port/path
        const withoutProto = url.replace(/^(rtsp|http|https|rtmp):\/\//, '');

        if (withoutProto.includes('@')) {
            const atIndex = withoutProto.lastIndexOf('@');
            const authPart = withoutProto.substring(0, atIndex);
            host = withoutProto.substring(atIndex + 1);

            if (authPart.includes(':')) {
                const colonIndex = authPart.indexOf(':');
                user = authPart.substring(0, colonIndex);
                pass = authPart.substring(colonIndex + 1);
            } else {
                user = authPart;
            }
        } else {
            host = withoutProto;
        }
    } catch (e) {
        console.error("URL parsing error", e);
    }
    // Decode URL-encoded credentials for display (e.g., %21 -> !)
    try {
        user = decodeURIComponent(user);
        pass = decodeURIComponent(pass);
    } catch (e) {
        // Keep as-is if decoding fails
    }
    return { user, pass, host };
};

export const Cameras = () => {
    const { user, token } = useAuth();
    const [cameras, setCameras] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const fileInputRef = useRef(null);
    const motionEyeInputRef = useRef(null);
    const [newCamera, setNewCamera] = useState({
        name: '',
        rtsp_url: '',
        stream_url: '',
        location: '',
        resolution_width: 800,
        resolution_height: 600,
        framerate: 15,
        rotation: 0,
        text_left: '%N',
        text_right: '%Y-%m-%d %H:%M:%S',
        storage_path: '',
        root_directory: '',
        movie_file_name: '%Y-%m-%d/%H-%M-%S',
        movie_passthrough: true,
        movie_quality: 75,
        recording_mode: 'Motion Triggered',
        max_movie_length: 120,
        preserve_movies: 'For One Week',
        auto_threshold_tuning: true,
        auto_noise_detection: true,
        light_switch_detection: 0,
        despeckle_filter: false,
        motion_gap: 10,
        threshold: 1500,
        captured_before: 30,
        captured_after: 30,
        min_motion_frames: 2,
        mask: false,
        show_frame_changes: true,
        create_debug_media: false,

        // Scheduling
        schedule_monday: true,
        schedule_monday_start: '00:00',
        schedule_monday_end: '23:59',
        schedule_tuesday: true,
        schedule_tuesday_start: '00:00',
        schedule_tuesday_end: '23:59',
        schedule_wednesday: true,
        schedule_wednesday_start: '00:00',
        schedule_wednesday_end: '23:59',
        schedule_thursday: true,
        schedule_thursday_start: '00:00',
        schedule_thursday_end: '23:59',
        schedule_friday: true,
        schedule_friday_start: '00:00',
        schedule_friday_end: '23:59',
        schedule_saturday: true,
        schedule_saturday_start: '00:00',
        schedule_saturday_end: '23:59',
        schedule_sunday: true,
        schedule_sunday_start: '00:00',
        schedule_sunday_end: '23:59',

        notify_start_email: false,
        notify_start_telegram: false,
        notify_start_webhook: false,
        notify_end_webhook: false,
        notify_webhook_url: '',
        notify_telegram_token: '',
        notify_telegram_chat_id: '',
        notify_email_address: '',
        notify_health_email: false,
        notify_health_telegram: false,
        notify_health_webhook: false,
        detect_motion_mode: 'Always',
        picture_file_name: '%Y-%m-%d/%H-%M-%S-%q',
        picture_quality: 75,
        picture_recording_mode: 'Manual',
        preserve_pictures: 'Forever',
        max_pictures_storage_gb: 0,
        enable_manual_snapshots: true
    });
    const [stats, setStats] = useState(null);
    const [activeTab, setActiveTab] = useState('general');
    const [editingId, setEditingId] = useState(null);
    const [view, setView] = useState('cameras');
    const [isGroupView, setIsGroupView] = useState(() => {
        return localStorage.getItem('camerasGroupBy') === 'true';
    });

    const handleGroupViewToggle = (val) => {
        setIsGroupView(val);
        localStorage.setItem('camerasGroupBy', val);
    };
    const { showToast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingMessage, setProcessingMessage] = useState({ title: 'Processing', text: 'Please wait...' });
    const [selectedCameraIds, setSelectedCameraIds] = useState([]);
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false });

    const [searchParams, setSearchParams] = useSearchParams();

    // Fetch Cameras
    useEffect(() => {
        if (!token) return;
        fetchCameras();
        fetchStats();
    }, [token]);

    const fetchStats = async () => {
        try {
            const res = await fetch('/api/stats', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) setStats(await res.json());
        } catch (err) {
            console.error("Failed to fetch stats", err);
        }
    };

    // Check for edit parameter in URL
    useEffect(() => {
        const editId = searchParams.get('edit');
        if (editId && cameras.length > 0) {
            const camera = cameras.find(c => c.id === parseInt(editId));
            if (camera) {
                const { user, pass, host } = parseRtspUrl(camera.rtsp_url);
                setNewCamera({
                    ...camera,
                    rtsp_username: user,
                    rtsp_password: pass,
                    rtsp_host: host
                });
                setEditingId(camera.id);
                setShowAddModal(true);
                // Clear the URL parameter after opening modal
                setSearchParams({});
            }
        }
    }, [cameras, searchParams]);

    // Handle ESC key to close modal
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && showAddModal) {
                setShowAddModal(false);
                setEditingId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showAddModal]);

    const fetchCameras = async () => {
        try {
            const res = await fetch('/api/cameras', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCameras(data);
            }
        } catch (err) {
            console.error("Failed to fetch cameras", err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Delete Camera',
            message: 'Are you sure you want to delete this camera? This will stop its recording process and remove its configuration.',
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/cameras/${id}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        setCameras(prev => prev.filter(c => c.id !== id));
                        setSelectedCameraIds(prev => prev.filter(sid => sid !== id));
                        showToast('Camera deleted', 'success');
                    }
                } catch (err) {
                    showToast('Failed to delete camera', 'error');
                }
                setConfirmConfig({ isOpen: false });
            },
            onCancel: () => setConfirmConfig({ isOpen: false })
        });
    };

    const handleBulkDelete = async () => {
        if (selectedCameraIds.length === 0) return;

        setConfirmConfig({
            isOpen: true,
            title: 'Bulk Delete',
            message: `Are you sure you want to delete ${selectedCameraIds.length} camera(s)? This action is permanent and will stop all related processes and delete media files.`,
            onConfirm: async () => {
                setProcessingMessage({
                    title: 'Deleting Cameras',
                    text: `Removing ${selectedCameraIds.length} camera(s) and their associated data...`
                });
                setIsProcessing(true);
                setConfirmConfig({ isOpen: false });
                try {
                    const res = await fetch('/api/cameras/bulk-delete', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify(selectedCameraIds)
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setCameras(prev => prev.filter(c => !selectedCameraIds.includes(c.id)));
                        setSelectedCameraIds([]);
                        showToast(data.message, 'success');
                    } else {
                        showToast('Bulk delete failed', 'error');
                    }
                } catch (err) {
                    showToast('Failed to perform bulk delete: ' + err.message, 'error');
                } finally {
                    setIsProcessing(false);
                }
            },
            onCancel: () => setConfirmConfig({ isOpen: false })
        });
    };

    const handleSelectCamera = (id) => {
        setSelectedCameraIds(prev =>
            prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
        );
    };

    const handleSelectAll = (ids) => {
        const allInIdsSelected = ids.every(id => selectedCameraIds.includes(id));
        if (allInIdsSelected) {
            setSelectedCameraIds(prev => prev.filter(id => !ids.includes(id)));
        } else {
            setSelectedCameraIds(prev => Array.from(new Set([...prev, ...ids])));
        }
    };

    const handleEdit = (camera) => {
        const { user, pass, host } = parseRtspUrl(camera.rtsp_url);
        setNewCamera({
            ...camera,
            rtsp_username: user,
            rtsp_password: pass,
            rtsp_host: host
        });
        setEditingId(camera.id);
        setShowAddModal(true);
    };

    const handleCleanup = async (cameraId, type) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Storage Cleanup',
            message: `Are you sure you want to clean up ${type} storage for this camera? This will enforce retention limits immediately.`,
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/cameras/${cameraId}/cleanup?type=${type}`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        showToast(data.message, 'success');
                        fetchStats();
                    } else {
                        const err = await res.json();
                        showToast('Cleanup failed: ' + err.detail, 'error');
                    }
                } catch (err) {
                    showToast('Cleanup failed: ' + err.message, 'error');
                }
                setConfirmConfig({ isOpen: false });
            },
            onCancel: () => setConfirmConfig({ isOpen: false })
        });
    };

    const handleToggleActive = async (camera) => {
        try {
            const res = await fetch(`/api/cameras/${camera.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    // Must include required fields if schema enforces them, 
                    // but usually partial updates prefer explicit fields or full object.
                    // To be safe, spread camera.
                    ...camera,
                    is_active: !camera.is_active,
                    // Ensure excluded fields don't cause validation error if API is strict
                    // But backend usually ignores extra fields or we use same schema.
                    // Just spreading camera is usually safest if schema matches read model.
                })
            });
            if (res.ok) {
                fetchCameras();
                showToast(`Camera ${camera.name} ${!camera.is_active ? 'Enabled' : 'Disabled'}`, 'success');
            } else {
                showToast("Failed to toggle camera", "error");
            }
        } catch (err) {
            console.error(err);
            showToast("Error toggling camera", "error");
        }
    };

    const [showCopyModal, setShowCopyModal] = useState(false);
    const [copyTargets, setCopyTargets] = useState([]);

    const handleCreate = async (e, shouldClose = true) => {
        if (e) e.preventDefault();
        try {
            const url = editingId
                ? `/api/cameras/${editingId}`
                : '/api/cameras';

            const method = editingId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(newCamera)
            });
            if (res.ok) {
                const savedCamera = await res.json();

                if (shouldClose) {
                    setShowAddModal(false);
                    setNewCamera({
                        name: '',
                        rtsp_url: '',
                        stream_url: '',
                        location: '',
                        resolution_width: 800,
                        resolution_height: 600,
                        framerate: 15,
                        rotation: 0,
                        text_left: 'Camera Name',
                        text_right: '%Y-%m-%d %H:%M:%S',
                        storage_path: '',
                        root_directory: '',
                        movie_file_name: '%Y-%m-%d/%H-%M-%S',
                        movie_passthrough: true,
                        movie_quality: 75,
                        recording_mode: 'Motion Triggered',
                        max_movie_length: 120,
                        preserve_movies: 'For One Week',
                        max_storage_gb: 0,
                        auto_threshold_tuning: true,
                        auto_noise_detection: true,
                        light_switch_detection: 0,
                        despeckle_filter: false,
                        motion_gap: 10,
                        threshold: 1500,
                        captured_before: 30,
                        captured_after: 30,
                        min_motion_frames: 2,
                        mask: false,
                        show_frame_changes: true,
                        create_debug_media: false,
                        notify_start_email: false,
                        notify_start_telegram: false,
                        notify_start_webhook: false,
                        notify_end_webhook: false,
                        notify_webhook_url: '',
                        notify_telegram_token: '',
                        notify_telegram_chat_id: '',
                        notify_email_address: '',
                        notify_health_email: false,
                        notify_health_telegram: false,
                        notify_health_webhook: false,
                        detect_motion_mode: 'Always',
                        picture_file_name: '%Y-%m-%d/%H-%M-%S-%q',
                        picture_quality: 75,
                        picture_recording_mode: 'Manual',
                        preserve_pictures: 'Forever',
                        max_pictures_storage_gb: 0,
                        enable_manual_snapshots: true,
                        notify_attach_image_email: true,
                        notify_attach_image_telegram: true
                    });
                    setEditingId(null);
                } else {
                    // Update state to reflect that we are now editing an existing camera
                    setEditingId(savedCamera.id);
                    const { user, pass, host } = parseRtspUrl(savedCamera.rtsp_url);
                    setNewCamera({
                        ...savedCamera,
                        rtsp_username: user,
                        rtsp_password: pass,
                        rtsp_host: host
                    });
                    showToast("Settings saved successfully.", "success");
                }
                fetchCameras();
            }
        } catch (err) {
            console.error("Failed to save", err);
            showToast("Failed to save: " + err.message, "error");
        }
    };

    const handleCopySettings = async () => {
        if (copyTargets.length === 0) return;

        setConfirmConfig({
            isOpen: true,
            title: 'Copy Settings',
            message: `Overwrite settings for ${copyTargets.length} cameras?`,
            onConfirm: async () => {
                // Fields to EXCLUDE (Unique/Hardware specific items)
                const EXCLUDED_FIELDS = [
                    'id', 'name', 'rtsp_url', 'stream_url', 'created_at', 'location', 'stream_port',
                    'resolution_width', 'resolution_height', 'auto_resolution'
                ];

                const settingsToCopy = Object.keys(newCamera).reduce((acc, key) => {
                    if (!EXCLUDED_FIELDS.includes(key)) {
                        acc[key] = newCamera[key];
                    }
                    return acc;
                }, {});

                for (const targetId of copyTargets) {
                    const targetCam = cameras.find(c => c.id === targetId);
                    if (!targetCam) continue;

                    const updatedCam = { ...targetCam, ...settingsToCopy };
                    try {
                        const res = await fetch(`/api/cameras/${targetId}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${token}`
                            },
                            body: JSON.stringify(updatedCam)
                        });
                        if (!res.ok) throw new Error(`Camera ${targetId} failed`);
                    } catch (err) {
                        console.error(`Failed to update camera ${targetId}`, err);
                        showToast(`Failed to copy to camera ${targetCam.name}: ${err.message}`, 'error');
                    }
                }

                setShowCopyModal(false);
                setCopyTargets([]);
                fetchCameras();
                showToast("Settings copied to selected cameras.", "success");
                setConfirmConfig({ isOpen: false });
            },
            onCancel: () => setConfirmConfig({ isOpen: false })
        });
    };

    const handleTestNotification = async (channel, config = {}) => {
        setProcessingMessage({ title: 'Sending Test', text: `Testing ${channel} notification...` });
        setIsProcessing(true);
        try {
            const res = await fetch('/api/settings/test-notify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    channel,
                    settings: config
                })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message, 'success');
            } else {
                showToast(data.detail || 'Test failed', 'error');
            }
        } catch (err) {
            showToast('Test failed: ' + err.message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight flex items-baseline gap-2">
                        Cameras
                        <span className="text-lg font-normal text-muted-foreground">({cameras.length} cameras)</span>
                    </h2>
                    <p className="text-muted-foreground mt-2">Manage your video sources.</p>
                </div>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 w-full sm:w-auto overflow-hidden">
                    {/* Group View Toggle - visible to all users */}
                    {view === 'cameras' && (
                        <div className="flex items-center gap-4">
                            <Toggle
                                checked={isGroupView}
                                onChange={handleGroupViewToggle}
                                label="Group View"
                                help="Group cameras by assigned groups"
                            />
                            {user?.role === 'admin' && cameras.length > 0 && (
                                <button
                                    onClick={() => handleSelectAll(cameras.map(c => c.id))}
                                    className="flex items-center justify-center space-x-2 bg-muted hover:bg-secondary text-foreground px-3 h-8 rounded-lg transition-all whitespace-nowrap text-xs font-bold border border-border shadow-sm active:scale-95"
                                >
                                    <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${cameras.every(c => selectedCameraIds.includes(c.id)) ? 'bg-primary border-primary' : 'bg-background border-border'}`}>
                                        {cameras.every(c => selectedCameraIds.includes(c.id)) && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={5} d="M5 13l4 4L19 7" /></svg>}
                                    </div>
                                    <span>{cameras.every(c => selectedCameraIds.includes(c.id)) ? 'Deselect All' : 'Select All'}</span>
                                </button>
                            )}
                        </div>
                    )}
                    {user?.role === 'admin' && view === 'cameras' && (
                        <>

                            <Button
                                onClick={() => {
                                    setEditingId(null);
                                    setNewCamera({
                                        name: '',
                                        rtsp_url: '',
                                        rtsp_username: '',
                                        rtsp_password: '',
                                        rtsp_host: '',
                                        stream_url: '',
                                        location: '',
                                        resolution_width: 800,
                                        resolution_height: 600,
                                        framerate: 15,
                                        rotation: 0,
                                        text_left: '%N',
                                        text_right: '%Y-%m-%d %H:%M:%S',
                                        storage_path: '',
                                        root_directory: '',
                                        movie_file_name: '%Y-%m-%d/%H-%M-%S',
                                        movie_passthrough: true,
                                        movie_quality: 75,
                                        recording_mode: 'Motion Triggered',
                                        max_movie_length: 120,
                                        preserve_movies: 'For One Week',
                                        max_storage_gb: 0,
                                        auto_threshold_tuning: true,
                                        auto_noise_detection: true,
                                        light_switch_detection: 0,
                                        despeckle_filter: false,
                                        motion_gap: 10,
                                        threshold: 1500,
                                        captured_before: 30,
                                        captured_after: 30,
                                        min_motion_frames: 2,
                                        mask: false,
                                        show_frame_changes: true,
                                        create_debug_media: false,
                                        notify_start_email: false,
                                        notify_start_telegram: false,
                                        notify_start_webhook: false,
                                        notify_end_webhook: false,
                                        notify_webhook_url: '',
                                        notify_telegram_token: '',
                                        notify_telegram_chat_id: '',
                                        notify_email_address: '',
                                        detect_motion_mode: 'Always',
                                        picture_file_name: '%Y-%m-%d/%H-%M-%S-%q',
                                        picture_quality: 75,
                                        picture_recording_mode: 'Manual',
                                        preserve_pictures: 'Forever',
                                        max_pictures_storage_gb: 0,
                                        enable_manual_snapshots: true,
                                        notify_attach_image_email: true,
                                        notify_attach_image_telegram: true
                                    });
                                    setShowAddModal(true);
                                }}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                <span>Add Camera</span>
                            </Button>

                            <Button
                                variant="outline"
                                onClick={async () => {
                                    try {
                                        const res = await fetch('/api/cameras/export/all', {
                                            headers: { Authorization: `Bearer ${token}` }
                                        });
                                        if (res.ok) {
                                            const blob = await res.blob();
                                            const url = window.URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;

                                            const disposition = res.headers.get('Content-Disposition');
                                            let filename = `vibenvr_cameras_export_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
                                            if (disposition && disposition.includes('filename=')) {
                                                filename = disposition.split('filename=')[1].replace(/"/g, '');
                                            }
                                            a.download = filename;

                                            document.body.appendChild(a);
                                            a.click();
                                            window.URL.revokeObjectURL(url);
                                            document.body.removeChild(a);
                                            showToast("All cameras exported successfully", "success");
                                        } else {
                                            showToast('Failed to export cameras', 'error');
                                        }
                                    } catch (e) {
                                        showToast('Export error: ' + e.message, 'error');
                                    }
                                }}
                                title="Export all cameras to JSON"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                <span>Export All</span>
                            </Button>

                            <div className="flex gap-px shrink-0">
                                {/* Hidden inputs triggered by buttons */}
                                <input
                                    type="file"
                                    accept=".json"
                                    className="hidden"
                                    ref={fileInputRef}
                                    disabled={isProcessing}
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        setProcessingMessage({ title: 'Importing Cameras', text: 'Uploading and processing VibeNVR configuration...' });
                                        setIsProcessing(true);
                                        showToast('Importing cameras...', 'info');
                                        const formData = new FormData();
                                        formData.append('file', file);
                                        try {
                                            const res = await fetch('/api/cameras/import', {
                                                method: 'POST',
                                                body: formData,
                                                headers: { Authorization: `Bearer ${token}` }
                                            });
                                            if (res.ok) {
                                                const data = await res.json();
                                                showToast(data.message, 'success');
                                                fetchCameras();
                                            } else {
                                                const err = await res.json();
                                                showToast('Import failed: ' + (err.detail || 'Unknown error'), 'error');
                                            }
                                        } catch (err) {
                                            showToast('Import failed: ' + err.message, 'error');
                                        } finally {
                                            setIsProcessing(false);
                                        }
                                        e.target.value = '';
                                    }}
                                />
                                <input
                                    type="file"
                                    accept=".tar.gz"
                                    className="hidden"
                                    ref={motionEyeInputRef}
                                    disabled={isProcessing}
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        setProcessingMessage({ title: 'MotionEye Import', text: 'Extracting backup and configuring cameras...' });
                                        setIsProcessing(true);
                                        showToast('Importing from MotionEye...', 'info');
                                        const formData = new FormData();
                                        formData.append('file', file);
                                        try {
                                            const res = await fetch('/api/cameras/import/motioneye', {
                                                method: 'POST',
                                                body: formData,
                                                headers: { Authorization: `Bearer ${token}` }
                                            });
                                            if (res.ok) {
                                                const data = await res.json();
                                                showToast(data.message, 'success');
                                                fetchCameras();
                                            } else {
                                                const err = await res.json();
                                                showToast('MotionEye Import failed: ' + (err.detail || 'Unknown error'), 'error');
                                            }
                                        } catch (err) {
                                            showToast('Import error: ' + err.message, 'error');
                                        } finally {
                                            setIsProcessing(false);
                                        }
                                        e.target.value = '';
                                    }}
                                />

                                <Button
                                    variant="outline"
                                    className="rounded-r-none border-r-0"
                                    onClick={() => fileInputRef.current.click()}
                                    title="Import cameras from VibeNVR JSON"
                                >
                                    <Upload className="w-4 h-4 mr-2" />
                                    <span>Import</span>
                                </Button>
                                <Button
                                    variant="outline"
                                    className="rounded-l-none"
                                    onClick={() => motionEyeInputRef.current.click()}
                                    title="Import from MotionEye backup (.tar.gz)"
                                >
                                    <div className="flex flex-col items-center leading-tight">
                                        <span className="text-[10px] opacity-70">from</span>
                                        <span className="text-xs">MotionEye</span>
                                    </div>
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>


            {/* Tabs */}
            <div className="flex space-x-1 border-b border-border mb-6">
                <button
                    onClick={() => setView('cameras')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${view === 'cameras' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                    Cameras
                </button>
                <button
                    onClick={() => setView('groups')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${view === 'groups' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                    Groups
                </button>
            </div>

            {
                view === 'groups' ? (
                    <GroupsManager cameras={cameras} />
                ) : loading ? (
                    <div className="flex justify-center p-12"><Activity className="animate-spin w-8 h-8 text-primary" /></div>
                ) : (
                    <>
                        {isGroupView && cameras.length > 0 ? (
                            <div className="space-y-12">
                                {(() => {
                                    const grouped = {};
                                    const ungrouped = [];
                                    cameras.forEach(cam => {
                                        if (cam.groups && cam.groups.length > 0) {
                                            cam.groups.forEach(g => {
                                                if (!grouped[g.name]) grouped[g.name] = [];
                                                if (!grouped[g.name].find(c => c.id === cam.id)) {
                                                    grouped[g.name].push(cam);
                                                }
                                            });
                                        } else {
                                            ungrouped.push(cam);
                                        }
                                    });

                                    const sortedGroupNames = Object.keys(grouped).sort();

                                    return (
                                        <>
                                            {sortedGroupNames.map(groupName => {
                                                const groupCamIds = grouped[groupName].map(c => c.id);
                                                const allInGroupSelected = groupCamIds.every(id => selectedCameraIds.includes(id));
                                                return (
                                                    <div key={groupName} className="relative">
                                                        <h3 className="text-xl font-bold mb-6 text-foreground/90 flex items-center border-b pb-2">
                                                            <span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-md text-sm mr-3 font-mono">
                                                                {grouped[groupName].length}
                                                            </span>
                                                            {groupName}
                                                            {user?.role === 'admin' && (
                                                                <button
                                                                    onClick={() => handleSelectAll(groupCamIds)}
                                                                    className="ml-auto text-[10px] font-bold px-2 py-1 bg-muted hover:bg-secondary rounded-md transition-all border border-border flex items-center gap-1.5 uppercase tracking-tight"
                                                                >
                                                                    <div className={`w-3 h-3 rounded-sm border flex items-center justify-center transition-colors ${allInGroupSelected ? 'bg-primary border-primary' : 'bg-background border-border'}`}>
                                                                        {allInGroupSelected && <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={6} d="M5 13l4 4L19 7" /></svg>}
                                                                    </div>
                                                                    {allInGroupSelected ? 'Deselect Group' : 'Select Group'}
                                                                </button>
                                                            )}
                                                        </h3>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                            {grouped[groupName].map(cam => (
                                                                <CameraCard
                                                                    key={`${groupName}-${cam.id}`}
                                                                    camera={cam}
                                                                    onDelete={handleDelete}
                                                                    onEdit={handleEdit}
                                                                    onToggleActive={handleToggleActive}
                                                                    isSelected={selectedCameraIds.includes(cam.id)}
                                                                    onSelect={handleSelectCamera}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {ungrouped.length > 0 && (
                                                <div className="relative">
                                                    {sortedGroupNames.length > 0 && (
                                                        <h3 className="text-xl font-bold mb-6 text-foreground/90 flex items-center border-b pb-2 pt-4 opacity-80">
                                                            Ungrouped Cameras
                                                            {user?.role === 'admin' && (
                                                                <button
                                                                    onClick={() => handleSelectAll(ungrouped.map(c => c.id))}
                                                                    className="ml-auto text-[10px] font-bold px-2 py-1 bg-muted hover:bg-secondary rounded-md transition-all border border-border flex items-center gap-1.5 uppercase tracking-tight"
                                                                >
                                                                    <div className={`w-3 h-3 rounded-sm border flex items-center justify-center transition-colors ${ungrouped.every(c => selectedCameraIds.includes(c.id)) ? 'bg-primary border-primary' : 'bg-background border-border'}`}>
                                                                        {ungrouped.every(c => selectedCameraIds.includes(c.id)) && <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={6} d="M5 13l4 4L19 7" /></svg>}
                                                                    </div>
                                                                    {ungrouped.every(c => selectedCameraIds.includes(c.id)) ? 'Deselect Ungrouped' : 'Select Ungrouped'}
                                                                </button>
                                                            )}
                                                        </h3>
                                                    )}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                        {ungrouped.map(cam => (
                                                            <CameraCard
                                                                key={cam.id}
                                                                camera={cam}
                                                                onDelete={handleDelete}
                                                                onEdit={handleEdit}
                                                                onToggleActive={handleToggleActive}
                                                                isSelected={selectedCameraIds.includes(cam.id)}
                                                                onSelect={handleSelectCamera}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {cameras.map(cam => (
                                    <CameraCard
                                        key={cam.id}
                                        camera={cam}
                                        onDelete={handleDelete}
                                        onEdit={handleEdit}
                                        onToggleActive={handleToggleActive}
                                        isSelected={selectedCameraIds.includes(cam.id)}
                                        onSelect={handleSelectCamera}
                                    />
                                ))}
                            </div>
                        )}

                        {cameras.length === 0 && (
                            <div className="text-center py-12 text-muted-foreground bg-card border border-dashed border-border rounded-xl">
                                <Camera className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                <p>No cameras found. Add one to get started.</p>
                            </div>
                        )}
                    </>
                )
            }

            {/* Simple Modal */}
            {
                showAddModal && (
                    <Portal>
                        <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-[2000] overflow-y-auto pt-20 sm:pt-6 p-4 lg:pl-64">
                            <div className="bg-card p-4 sm:p-6 rounded-xl w-full max-w-lg border border-border relative">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setShowAddModal(false);
                                        setEditingId(null);
                                    }}
                                    className="absolute right-4 top-4 h-8 w-8 p-0 hover:bg-muted/50"
                                >
                                    <X className="w-5 h-5" />
                                </Button>
                                <h3 className="text-xl font-bold mb-4 pr-8">{editingId ? `Edit ${newCamera.name} (ID: ${editingId})` : 'Add New Camera'}</h3>

                                {/* Tabs */}
                                {!editingId && (
                                    <div className="mb-4">
                                        <SelectField
                                            label="Clone Settings From (Optional)"
                                            className="w-full"
                                            onChange={(val) => {
                                                const sourceId = parseInt(val);
                                                const sourceCam = cameras.find(c => c.id === sourceId);
                                                if (sourceCam) {
                                                    // Clone everything but unique identity fields and active status
                                                    setNewCamera(prev => ({
                                                        ...sourceCam,
                                                        id: undefined,
                                                        name: prev.name, // Keep current input
                                                        rtsp_url: prev.rtsp_url, // Keep current input
                                                        stream_url: prev.stream_url,
                                                        location: prev.location,
                                                        is_active: prev.is_active, // Don't overwrite active status
                                                        created_at: undefined
                                                    }));
                                                }
                                            }}
                                            options={[
                                                { value: '', label: '-- Start Fresh --' },
                                                ...cameras.map(c => ({ value: c.id, label: c.name }))
                                            ]}
                                        />
                                    </div>
                                )}

                                <div className="flex space-x-4 mb-4 border-b border-border text-xs overflow-x-auto flex-nowrap min-h-[40px] pb-1">
                                    <button
                                        className={`pb-2 ${activeTab === 'general' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
                                        onClick={() => setActiveTab('general')}
                                    >
                                        General
                                    </button>
                                    <button
                                        className={`pb-2 ${activeTab === 'video' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
                                        onClick={() => setActiveTab('video')}
                                    >
                                        Video Device
                                    </button>
                                    <button
                                        className={`pb-2 ${activeTab === 'movies' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
                                        onClick={() => setActiveTab('movies')}
                                    >
                                        Movies
                                    </button>
                                    <button
                                        className={`pb-2 ${activeTab === 'motion' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
                                        onClick={() => setActiveTab('motion')}
                                    >
                                        Motion Detection
                                    </button>
                                    <button
                                        className={`pb-2 ${activeTab === 'still_images' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
                                        onClick={() => setActiveTab('still_images')}
                                    >
                                        Still Images
                                    </button>
                                    <button
                                        className={`pb-2 ${activeTab === 'notifications' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
                                        onClick={() => setActiveTab('notifications')}
                                    >
                                        Notifications
                                    </button>
                                    <button
                                        className={`pb-2 flex-shrink-0 ${activeTab === 'overlay' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
                                        onClick={() => setActiveTab('overlay')}
                                    >
                                        Text Overlay
                                    </button>
                                </div>

                                <form onSubmit={handleCreate} className="space-y-4">
                                    <div className="max-h-[60vh] overflow-y-auto pr-2 -mr-2">

                                        {activeTab === 'general' && (
                                            <div className="space-y-6">
                                                <SectionHeader title="Camera Identity" description="Basic camera information" />
                                                <InputField
                                                    label="Camera Name"
                                                    value={newCamera.name}
                                                    onChange={(val) => setNewCamera({ ...newCamera, name: val })}
                                                    placeholder="Enter camera name"
                                                />
                                                <InputField
                                                    label="Location"
                                                    value={newCamera.location}
                                                    onChange={(val) => setNewCamera({ ...newCamera, location: val })}
                                                    placeholder="e.g. Front Door, Backyard"
                                                />
                                                <SectionHeader title="Connection" description="Video source configuration" />
                                                <div className="bg-muted/30 p-4 rounded-lg border border-border space-y-4">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <InputField
                                                            label="Username (Optional)"
                                                            value={newCamera.rtsp_username || ''}
                                                            onChange={(val) => {
                                                                const pass = newCamera.rtsp_password || '';
                                                                const host = newCamera.rtsp_host || '';
                                                                const url = `rtsp://${val}${pass ? ':' + pass : ''}${val || pass ? '@' : ''}${host}`;
                                                                setNewCamera({ ...newCamera, rtsp_username: val, rtsp_url: url });
                                                            }}
                                                            placeholder="admin"
                                                        />
                                                        <InputField
                                                            label="Password (Optional)"
                                                            type={newCamera.show_password ? "text" : "password"}
                                                            value={newCamera.rtsp_password || ''}
                                                            onChange={(val) => {
                                                                const user = newCamera.rtsp_username || '';
                                                                const host = newCamera.rtsp_host || '';
                                                                const url = `rtsp://${user}${val ? ':' + val : ''}${user || val ? '@' : ''}${host}`;
                                                                setNewCamera({ ...newCamera, rtsp_password: val, rtsp_url: url });
                                                            }}
                                                            placeholder="••••••"
                                                            showPasswordToggle
                                                            showPassword={newCamera.show_password}
                                                            onTogglePassword={() => setNewCamera({ ...newCamera, show_password: !newCamera.show_password })}
                                                        />
                                                    </div>

                                                    <InputField
                                                        label="RTSP Host & Path"
                                                        value={newCamera.rtsp_host || ''}
                                                        onChange={(val) => {
                                                            const user = newCamera.rtsp_username || '';
                                                            const pass = newCamera.rtsp_password || '';
                                                            const url = `rtsp://${user}${pass ? ':' + pass : ''}${user || pass ? '@' : ''}${val}`;
                                                            setNewCamera({ ...newCamera, rtsp_host: val, rtsp_url: url });
                                                        }}
                                                        placeholder="192.168.1.100:554/stream1"
                                                    />

                                                    <div className="text-[10px] text-muted-foreground break-all p-2 bg-background/50 rounded border border-border/50">
                                                        <span className="font-semibold">Full URL:</span> {
                                                            newCamera.rtsp_url?.replace(/:([^:@]+)@/, ':********@') || ''
                                                        }
                                                    </div>
                                                </div>


                                            </div>
                                        )}

                                        {activeTab === 'video' && (
                                            <div className="space-y-6">
                                                <SectionHeader title="Resolution" description="Configure video resolution settings" />
                                                <Toggle
                                                    label="Auto-Detect Resolution"
                                                    checked={newCamera.auto_resolution !== false}
                                                    onChange={(val) => setNewCamera({ ...newCamera, auto_resolution: val })}
                                                    help="Automatically detect camera resolution on save. Disable to set manually."
                                                />
                                                {newCamera.auto_resolution !== false ? (
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">Video Resolution</label>
                                                        <div className="px-3 py-2 bg-muted/50 rounded-lg border border-border text-muted-foreground">
                                                            {newCamera.resolution_width}x{newCamera.resolution_height} (Auto-Detected)
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">Resolution will be detected automatically when you save.</p>
                                                    </div>
                                                ) : (
                                                    <SelectField
                                                        label="Video Resolution"
                                                        value={`${newCamera.resolution_width}x${newCamera.resolution_height}`}
                                                        onChange={(val) => {
                                                            const [w, h] = val.split('x').map(Number);
                                                            setNewCamera({ ...newCamera, resolution_width: w, resolution_height: h });
                                                        }}
                                                        options={[
                                                            { value: '320x240', label: '320x240 (QVGA)' },
                                                            { value: '640x480', label: '640x480 (VGA)' },
                                                            { value: '800x600', label: '800x600 (SVGA)' },
                                                            { value: '1280x720', label: '1280x720 (HD)' },
                                                            { value: '1920x1080', label: '1920x1080 (Full HD)' },
                                                            { value: '2560x1440', label: '2560x1440 (QHD)' },
                                                            { value: '3840x2160', label: '3840x2160 (4K)' }
                                                        ]}
                                                    />
                                                )}
                                                <SelectField
                                                    label="Video Rotation"
                                                    value={`${newCamera.rotation}°`}
                                                    onChange={(val) => setNewCamera({ ...newCamera, rotation: parseInt(val) })}
                                                    options={[
                                                        { value: '0', label: '0°' },
                                                        { value: '90', label: '90°' },
                                                        { value: '180', label: '180°' },
                                                        { value: '270', label: '270°' }
                                                    ]}
                                                />
                                                <SectionHeader title="Frame Rate" description="Frames captured per second" />
                                                <Slider
                                                    label="Frame Rate"
                                                    value={newCamera.framerate}
                                                    onChange={(val) => setNewCamera({ ...newCamera, framerate: val })}
                                                    min={1}
                                                    max={30}
                                                    step={1}
                                                    unit=" fps"
                                                    marks={['1', '5', '10', '15', '20', '25', '30']}
                                                />
                                            </div>
                                        )}



                                        {activeTab === 'overlay' && (
                                            <div className="space-y-6">
                                                <SectionHeader title="Text Overlay" description="Configure on-screen text display" />

                                                {/* Left Text */}
                                                <SelectField
                                                    label="Left Text"
                                                    value={
                                                        newCamera.text_left === '' ? 'disabled' :
                                                            newCamera.text_left === '%$' ? 'name' :
                                                                newCamera.text_left === '%Y-%m-%d %H:%M:%S' ? 'timestamp' :
                                                                    'custom'
                                                    }
                                                    onChange={(val) => {
                                                        if (val === 'disabled') setNewCamera({ ...newCamera, text_left: '' });
                                                        else if (val === 'name') setNewCamera({ ...newCamera, text_left: '%$' });
                                                        else if (val === 'timestamp') setNewCamera({ ...newCamera, text_left: '%Y-%m-%d %H:%M:%S' });
                                                        else if (val === 'custom') setNewCamera({ ...newCamera, text_left: 'Custom Text' });
                                                    }}
                                                    options={[
                                                        { value: 'name', label: 'Camera Name' },
                                                        { value: 'timestamp', label: 'Timestamp' },
                                                        { value: 'custom', label: 'Custom Text' },
                                                        { value: 'disabled', label: 'Disabled' }
                                                    ]}
                                                />
                                                {/* Custom Input */}
                                                {!['', '%$', '%Y-%m-%d %H:%M:%S'].includes(newCamera.text_left) && (
                                                    <InputField
                                                        value={newCamera.text_left}
                                                        onChange={(val) => setNewCamera({ ...newCamera, text_left: val })}
                                                        placeholder="Enter custom text"
                                                    />
                                                )}

                                                {/* Right Text */}
                                                <SelectField
                                                    label="Right Text"
                                                    value={
                                                        newCamera.text_right === '' ? 'disabled' :
                                                            newCamera.text_right === '%$' ? 'name' :
                                                                newCamera.text_right === '%Y-%m-%d %H:%M:%S' ? 'timestamp' :
                                                                    'custom'
                                                    }
                                                    onChange={(val) => {
                                                        if (val === 'disabled') setNewCamera({ ...newCamera, text_right: '' });
                                                        else if (val === 'name') setNewCamera({ ...newCamera, text_right: '%$' });
                                                        else if (val === 'timestamp') setNewCamera({ ...newCamera, text_right: '%Y-%m-%d %H:%M:%S' });
                                                        else if (val === 'custom') setNewCamera({ ...newCamera, text_right: 'Custom Text' });
                                                    }}
                                                    options={[
                                                        { value: 'name', label: 'Camera Name' },
                                                        { value: 'timestamp', label: 'Timestamp' },
                                                        { value: 'custom', label: 'Custom Text' },
                                                        { value: 'disabled', label: 'Disabled' }
                                                    ]}
                                                />
                                                {!['', '%$', '%Y-%m-%d %H:%M:%S'].includes(newCamera.text_right) && (
                                                    <InputField
                                                        value={newCamera.text_right}
                                                        onChange={(val) => setNewCamera({ ...newCamera, text_right: val })}
                                                        placeholder="Enter custom text"
                                                    />
                                                )}

                                                <Slider
                                                    label="Text Scale"
                                                    value={newCamera.text_scale || 1}
                                                    onChange={(val) => setNewCamera({ ...newCamera, text_scale: val })}
                                                    min={1}
                                                    max={50}
                                                    step={1}
                                                    unit="x"
                                                />
                                            </div>
                                        )}

                                        {activeTab === 'movies' && (
                                            <div className="space-y-6">
                                                <SectionHeader title="Recording Settings" description="Configure video recording options" />
                                                <SelectField
                                                    label="Recording Mode"
                                                    value={newCamera.recording_mode}
                                                    onChange={(val) => setNewCamera({ ...newCamera, recording_mode: val })}
                                                    options={[
                                                        { value: 'Motion Triggered', label: 'Motion Triggered' },
                                                        { value: 'Continuous', label: 'Continuous' },
                                                        { value: 'Off', label: 'Off' }
                                                    ]}
                                                />
                                                <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/50 p-3 rounded-lg text-xs mb-4">
                                                    <Toggle
                                                        label="Passthrough Recording (CPU Saver)"
                                                        checked={!!newCamera.movie_passthrough}
                                                        onChange={(val) => setNewCamera({ ...newCamera, movie_passthrough: val })}
                                                    />
                                                    <p className="mt-1 text-muted-foreground ml-1">
                                                        Directly saves the video stream without re-encoding. <br />
                                                        <span className="font-semibold text-green-600 dark:text-green-400">Pros:</span> Near-zero CPU usage, original quality. <br />
                                                        <span className="font-semibold text-red-600 dark:text-red-400">Cons:</span> No Text Overylays, potential start delay, MP4 container only.
                                                    </p>
                                                </div>
                                                <Slider
                                                    label="Movie Quality"
                                                    value={newCamera.movie_quality}
                                                    onChange={(val) => setNewCamera({ ...newCamera, movie_quality: val })}
                                                    min={10}
                                                    max={100}
                                                    step={5}
                                                    unit="%"
                                                    marks={['10%', '25%', '50%', '75%', '100%']}
                                                />
                                                <Slider
                                                    label="Maximum Movie Length"
                                                    value={newCamera.max_movie_length || 120}
                                                    onChange={(val) => setNewCamera({ ...newCamera, max_movie_length: val })}
                                                    min={60}
                                                    max={300}
                                                    step={30}
                                                    unit=" sec"
                                                    marks={['1m', '2m', '3m', '4m', '5m']}
                                                    help="Recording segments will be split at this length"
                                                />
                                                <SectionHeader title="File Naming" />
                                                <InputField
                                                    label="Movie File Name"
                                                    value={newCamera.movie_file_name}
                                                    onChange={(val) => setNewCamera({ ...newCamera, movie_file_name: val })}
                                                    placeholder="%Y-%m-%d/%H-%M-%S"
                                                />
                                                <SelectField
                                                    label="Preserve Movies"
                                                    value={newCamera.preserve_movies}
                                                    onChange={(val) => setNewCamera({ ...newCamera, preserve_movies: val })}
                                                    options={[
                                                        { value: 'Forever', label: 'Forever' },
                                                        { value: 'For One Month', label: 'For One Month' },
                                                        { value: 'For One Week', label: 'For One Week' },
                                                        { value: 'For One Day', label: 'For One Day' }
                                                    ]}
                                                />
                                                <SectionHeader title="Storage Limit" description="Auto-delete old files when limit is reached" />
                                                {stats?.details?.cameras?.[editingId] && (
                                                    <div className="mb-6 p-4 bg-muted/30 rounded-lg border border-border">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div className="flex items-center space-x-2">
                                                                <div className="p-1.5 bg-blue-500/10 rounded text-blue-500">
                                                                    <Film className="w-4 h-4" />
                                                                </div>
                                                                <span className="font-semibold text-sm">Movies Storage</span>
                                                            </div>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => handleCleanup(editingId, 'video')}
                                                                className="h-7 text-[10px] px-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-900/50"
                                                            >
                                                                <Trash2 className="w-3 h-3 mr-1" />
                                                                Clean Up
                                                            </Button>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-4 mb-3">
                                                            <div>
                                                                <p className="text-xs text-muted-foreground">Disk Usage</p>
                                                                <p className="text-lg font-bold">{stats.details.cameras[editingId].movies.size_gb} GB</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-muted-foreground">Total Files</p>
                                                                <p className="text-lg font-bold">{stats.details.cameras[editingId].movies.count}</p>
                                                            </div>
                                                        </div>

                                                        {/* Progress Bar */}
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-muted-foreground">
                                                                    {newCamera.max_storage_gb > 0
                                                                        ? `${Math.round((stats.details.cameras[editingId].movies.size_gb / newCamera.max_storage_gb) * 100)}% Used`
                                                                        : 'Unlimited Storage'}
                                                                </span>
                                                                <span className="text-muted-foreground">
                                                                    Limit: {newCamera.max_storage_gb > 0 ? `${newCamera.max_storage_gb} GB` : 'None'}
                                                                </span>
                                                            </div>
                                                            <div className="h-2 w-full bg-secondary/50 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full ${newCamera.max_storage_gb > 0 && stats.details.cameras[editingId].movies.size_gb > newCamera.max_storage_gb ? 'bg-red-500' : 'bg-blue-500'}`}
                                                                    style={{
                                                                        width: newCamera.max_storage_gb > 0
                                                                            ? `${Math.min((stats.details.cameras[editingId].movies.size_gb / newCamera.max_storage_gb) * 100, 100)}%`
                                                                            : '0%'
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                <InputField
                                                    label="Maximum Storage (GB)"
                                                    type="number"
                                                    value={newCamera.max_storage_gb || 0}
                                                    onChange={(val) => setNewCamera({ ...newCamera, max_storage_gb: val })}
                                                    unit="GB"
                                                    placeholder="0 = unlimited"
                                                />
                                                <p className="text-xs text-muted-foreground">Set to 0 for unlimited storage. When exceeded, oldest files are deleted.</p>
                                            </div>
                                        )}

                                        {activeTab === 'motion' && (
                                            <div className="space-y-6">
                                                <SectionHeader title="Detection Schedule" description="When should motion detection be active?" />
                                                <SelectField
                                                    label="Motion Schedule Mode"
                                                    value={newCamera.detect_motion_mode}
                                                    onChange={(val) => setNewCamera({ ...newCamera, detect_motion_mode: val })}
                                                    options={[
                                                        { value: 'Always', label: 'Always' },
                                                        { value: 'Working Schedule', label: 'Working Schedule' },
                                                        { value: 'Manual Toggle', label: 'Manual Toggle' }
                                                    ]}
                                                />

                                                {newCamera.detect_motion_mode === 'Working Schedule' && (
                                                    <div className="bg-muted/30 p-4 rounded-lg border border-border">
                                                        <div className="flex justify-between items-center mb-4">
                                                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Weekly Schedule</p>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => {
                                                                    const monActive = newCamera.schedule_monday !== false;
                                                                    const monStart = newCamera.schedule_monday_start || "00:00";
                                                                    const monEnd = newCamera.schedule_monday_end || "23:59";

                                                                    const updates = {};
                                                                    ['tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].forEach(day => {
                                                                        updates[`schedule_${day}`] = monActive;
                                                                        updates[`schedule_${day}_start`] = monStart;
                                                                        updates[`schedule_${day}_end`] = monEnd;
                                                                    });
                                                                    setNewCamera(prev => ({ ...prev, ...updates }));
                                                                    showToast('Copied Monday settings to all days', 'success');
                                                                }}
                                                                className="h-7 text-[10px] px-2 bg-primary/5 hover:bg-primary/10 text-primary border-primary/20"
                                                            >
                                                                <Copy className="w-3 h-3 mr-1" />
                                                                Copy Mon to All
                                                            </Button>
                                                        </div>

                                                        <div className="space-y-3">
                                                            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
                                                                const key = `schedule_${day.toLowerCase()}`;
                                                                const keyStart = `${key}_start`;
                                                                const keyEnd = `${key}_end`;
                                                                const isActive = newCamera[key] !== false;

                                                                return (
                                                                    <div key={day} className={`grid grid-cols-12 gap-2 items-center text-sm ${!isActive ? 'opacity-50' : ''}`}>
                                                                        <div className="col-span-4 flex items-center space-x-2">
                                                                            <input
                                                                                type="checkbox"
                                                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                                                checked={isActive}
                                                                                onChange={(e) => setNewCamera({ ...newCamera, [key]: e.target.checked })}
                                                                            />
                                                                            <span className="font-medium w-20">{day}</span>
                                                                        </div>
                                                                        <div className="col-span-8 flex items-center space-x-2">
                                                                            <input
                                                                                type="time"
                                                                                className="flex-1 rounded-lg border border-input bg-background px-2 py-1 text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                                                                value={newCamera[keyStart] || "00:00"}
                                                                                onChange={(e) => setNewCamera({ ...newCamera, [keyStart]: e.target.value })}
                                                                                disabled={!isActive}
                                                                            />
                                                                            <span className="text-muted-foreground">-</span>
                                                                            <input
                                                                                type="time"
                                                                                className="flex-1 rounded-lg border border-input bg-background px-2 py-1 text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                                                                value={newCamera[keyEnd] || "23:59"}
                                                                                onChange={(e) => setNewCamera({ ...newCamera, [keyEnd]: e.target.value })}
                                                                                disabled={!isActive}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="border-t border-border my-4"></div>
                                                <SectionHeader title="Automatic Detection" description="Motion detection tuning options" />
                                                <div className="space-y-1">
                                                    <Slider
                                                        label="Motion Sensitivity (Threshold)"
                                                        value={newCamera.threshold || 1500}
                                                        onChange={(val) => setNewCamera({ ...newCamera, threshold: val })}
                                                        min={100}
                                                        max={10000}
                                                        step={100}
                                                    />
                                                    <div className="flex justify-between text-[10px] text-muted-foreground px-1 -mt-2">
                                                        <span>High Sensitivity</span>
                                                        <span>Low Sensitivity</span>
                                                    </div>
                                                    <p className="text-[11px] text-muted-foreground pt-1">
                                                        Controls how many pixels must change to trigger motion. <br />
                                                        <span className="font-semibold">Lower value (left)</span> = Detects small movements (falling leaves, bugs). <br />
                                                        <span className="font-semibold">Higher value (right)</span> = Detects only big objects (people, cars).
                                                    </p>
                                                </div>
                                                <Toggle
                                                    label="Despeckle Filter"
                                                    checked={newCamera.despeckle_filter}
                                                    onChange={(val) => setNewCamera({ ...newCamera, despeckle_filter: val })}
                                                />

                                                <SectionHeader title="Capture Settings" description="Pre/post motion capture options" />
                                                <InputField
                                                    label="Motion Gap"
                                                    type="number"
                                                    value={newCamera.motion_gap}
                                                    onChange={(val) => setNewCamera({ ...newCamera, motion_gap: val })}
                                                    unit="seconds"
                                                />
                                                <div className="grid grid-cols-2 gap-4">
                                                    <InputField
                                                        label="Captured Before"
                                                        type="number"
                                                        value={newCamera.captured_before}
                                                        onChange={(val) => {
                                                            // Enforce max 5s limit
                                                            if (val > 5) val = 5;
                                                            setNewCamera({ ...newCamera, captured_before: val })
                                                        }}
                                                        unit="seconds"
                                                        max={5}
                                                        min={0}
                                                    />
                                                    <InputField
                                                        label="Captured After"
                                                        type="number"
                                                        value={newCamera.captured_after}
                                                        onChange={(val) => setNewCamera({ ...newCamera, captured_after: val })}
                                                        unit="seconds"
                                                    />
                                                </div>
                                                <InputField
                                                    label="Minimum Motion Frames"
                                                    type="number"
                                                    value={newCamera.min_motion_frames}
                                                    onChange={(val) => setNewCamera({ ...newCamera, min_motion_frames: val })}
                                                    unit="frames"
                                                />


                                            </div>
                                        )}

                                        {activeTab === 'still_images' && (
                                            <div className="space-y-6">
                                                <SectionHeader title="Still Image Settings" description="Configure snapshot recording options" />
                                                <Toggle
                                                    label="Auto-save Snapshots on Motion"
                                                    checked={newCamera.picture_recording_mode === 'Motion Triggered'}
                                                    onChange={(val) => setNewCamera({ ...newCamera, picture_recording_mode: val ? 'Motion Triggered' : 'Manual' })}
                                                />
                                                <Slider
                                                    label="Image Quality"
                                                    value={newCamera.picture_quality}
                                                    onChange={(val) => setNewCamera({ ...newCamera, picture_quality: val })}
                                                    min={10}
                                                    max={100}
                                                    step={5}
                                                    unit="%"
                                                    marks={['10%', '25%', '50%', '75%', '100%']}
                                                />
                                                <SectionHeader title="File Naming" />
                                                <InputField
                                                    label="Image File Name"
                                                    value={newCamera.picture_file_name}
                                                    onChange={(val) => setNewCamera({ ...newCamera, picture_file_name: val })}
                                                    placeholder="%Y-%m-%d/%H-%M-%S-%q"
                                                />
                                                <SelectField
                                                    label="Preserve Pictures"
                                                    value={newCamera.preserve_pictures}
                                                    onChange={(val) => setNewCamera({ ...newCamera, preserve_pictures: val })}
                                                    options={[
                                                        { value: 'Forever', label: 'Forever' },
                                                        { value: 'For One Month', label: 'For One Month' },
                                                        { value: 'For One Week', label: 'For One Week' },
                                                        { value: 'For One Day', label: 'For One Day' }
                                                    ]}
                                                />
                                                <InputField
                                                    label="Maximum Pictures Storage (GB)"
                                                    type="number"
                                                    value={newCamera.max_pictures_storage_gb}
                                                    onChange={(val) => setNewCamera({ ...newCamera, max_pictures_storage_gb: val })}
                                                    unit="GB"
                                                />
                                                {stats?.details?.cameras?.[editingId] && (
                                                    <div className="-mt-4 mb-6 p-4 bg-muted/30 rounded-lg border border-border">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div className="flex items-center space-x-2">
                                                                <div className="p-1.5 bg-green-500/10 rounded text-green-500">
                                                                    <Image className="w-4 h-4" />
                                                                </div>
                                                                <span className="font-semibold text-sm">Snapshots Storage</span>
                                                            </div>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => handleCleanup(editingId, 'snapshot')}
                                                                className="h-7 text-[10px] px-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-900/50"
                                                            >
                                                                <Trash2 className="w-3 h-3 mr-1" />
                                                                Clean Up
                                                            </Button>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-4 mb-3">
                                                            <div>
                                                                <p className="text-xs text-muted-foreground">Disk Usage</p>
                                                                <p className="text-lg font-bold">{stats.details.cameras[editingId].images.size_gb} GB</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-muted-foreground">Total Files</p>
                                                                <p className="text-lg font-bold">{stats.details.cameras[editingId].images.count}</p>
                                                            </div>
                                                        </div>

                                                        {/* Progress Bar */}
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-muted-foreground">
                                                                    {newCamera.max_pictures_storage_gb > 0
                                                                        ? `${Math.round((stats.details.cameras[editingId].images.size_gb / newCamera.max_pictures_storage_gb) * 100)}% Used`
                                                                        : 'Unlimited Storage'}
                                                                </span>
                                                                <span className="text-muted-foreground">
                                                                    Limit: {newCamera.max_pictures_storage_gb > 0 ? `${newCamera.max_pictures_storage_gb} GB` : 'None'}
                                                                </span>
                                                            </div>
                                                            <div className="h-2 w-full bg-secondary/50 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full ${newCamera.max_pictures_storage_gb > 0 && stats.details.cameras[editingId].images.size_gb > newCamera.max_pictures_storage_gb ? 'bg-red-500' : 'bg-green-500'}`}
                                                                    style={{
                                                                        width: newCamera.max_pictures_storage_gb > 0
                                                                            ? `${Math.min((stats.details.cameras[editingId].images.size_gb / newCamera.max_pictures_storage_gb) * 100, 100)}%`
                                                                            : '0%'
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                <Toggle
                                                    label="Show Manual Snapshot Button"
                                                    checked={newCamera.enable_manual_snapshots}
                                                    onChange={(val) => setNewCamera({ ...newCamera, enable_manual_snapshots: val })}
                                                />
                                                <p className="text-xs text-muted-foreground">Enables the 'Take Snapshot' button in Live View.</p>
                                            </div>
                                        )}

                                        {activeTab === 'notifications' && (
                                            <div className="space-y-8">
                                                {/* Email Section */}
                                                <div className="space-y-4">
                                                    <SectionHeader title="Email Notifications" description="Send alerts via SMTP Email" />

                                                    {/* Motion Email */}
                                                    <div className="space-y-3">
                                                        <Toggle
                                                            label="Send Email on Start"
                                                            checked={newCamera.notify_start_email}
                                                            onChange={(val) => setNewCamera({ ...newCamera, notify_start_email: val })}
                                                        />
                                                        {newCamera.notify_start_email && (
                                                            <div className="ml-9 p-3 bg-muted/30 rounded-lg border border-border space-y-3 animate-in fade-in slide-in-from-top-1">
                                                                <InputField
                                                                    label="Recipient"
                                                                    value={newCamera.notify_email_address}
                                                                    onChange={(val) => setNewCamera({ ...newCamera, notify_email_address: val })}
                                                                    placeholder="Leave empty to use Global Settings"
                                                                />
                                                                <Toggle
                                                                    label="Attach Snapshot Image"
                                                                    checked={newCamera.notify_attach_image_email !== false}
                                                                    onChange={(val) => setNewCamera({ ...newCamera, notify_attach_image_email: val })}
                                                                    compact={true}
                                                                />
                                                                <div className="flex justify-end">
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => handleTestNotification('email', { recipient: newCamera.notify_email_address })}
                                                                        className="h-8 text-xs font-medium"
                                                                    >
                                                                        Test Email
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Health Email */}
                                                    <div className="space-y-3">
                                                        <Toggle
                                                            label="Notify Health via Email"
                                                            checked={newCamera.notify_health_email}
                                                            onChange={(val) => setNewCamera({ ...newCamera, notify_health_email: val })}
                                                        />
                                                        {newCamera.notify_health_email && (
                                                            <div className="ml-9 p-3 bg-muted/30 rounded-lg border border-border animate-in fade-in slide-in-from-top-1">
                                                                <InputField
                                                                    label="Health Recipient"
                                                                    value={newCamera.notify_health_email_recipient}
                                                                    onChange={(val) => setNewCamera({ ...newCamera, notify_health_email_recipient: val })}
                                                                    placeholder="Leave empty to use Global Settings"
                                                                />
                                                                <div className="flex justify-end mt-2">
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => handleTestNotification('email', { recipient: newCamera.notify_health_email_recipient })}
                                                                        className="h-8 text-xs font-medium"
                                                                    >
                                                                        Test Health Email
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Telegram Section */}
                                                <div className="space-y-4">
                                                    <SectionHeader title="Telegram Notifications" description="Send alerts via Telegram Bot" />

                                                    {/* Motion Telegram */}
                                                    <div className="space-y-3">
                                                        <Toggle
                                                            label="Send Telegram Message"
                                                            checked={newCamera.notify_start_telegram}
                                                            onChange={(val) => setNewCamera({ ...newCamera, notify_start_telegram: val })}
                                                        />
                                                        {newCamera.notify_start_telegram && (
                                                            <div className="ml-9 p-3 bg-muted/30 rounded-lg border border-border space-y-3 animate-in fade-in slide-in-from-top-1">
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                    <InputField
                                                                        label="Bot Token"
                                                                        value={newCamera.notify_telegram_token}
                                                                        onChange={(val) => setNewCamera({ ...newCamera, notify_telegram_token: val })}
                                                                        placeholder="Global Default"
                                                                    />
                                                                    <InputField
                                                                        label="Chat ID"
                                                                        value={newCamera.notify_telegram_chat_id}
                                                                        onChange={(val) => setNewCamera({ ...newCamera, notify_telegram_chat_id: val })}
                                                                        placeholder="Global Default"
                                                                    />
                                                                </div>
                                                                <Toggle
                                                                    label="Attach Snapshot Image"
                                                                    checked={newCamera.notify_attach_image_telegram !== false}
                                                                    onChange={(val) => setNewCamera({ ...newCamera, notify_attach_image_telegram: val })}
                                                                    compact={true}
                                                                />
                                                                <div className="flex justify-end">
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => handleTestNotification('telegram', {
                                                                            telegram_bot_token: newCamera.notify_telegram_token,
                                                                            telegram_chat_id: newCamera.notify_telegram_chat_id
                                                                        })}
                                                                        className="h-8 text-xs font-medium"
                                                                    >
                                                                        Test Telegram
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Health Telegram */}
                                                    <div className="space-y-3">
                                                        <Toggle
                                                            label="Notify Health via Telegram"
                                                            checked={newCamera.notify_health_telegram}
                                                            onChange={(val) => setNewCamera({ ...newCamera, notify_health_telegram: val })}
                                                        />
                                                        {newCamera.notify_health_telegram && (
                                                            <div className="ml-9 p-3 bg-muted/30 rounded-lg border border-border animate-in fade-in slide-in-from-top-1">
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                    <InputField
                                                                        label="Health Bot Token"
                                                                        value={newCamera.notify_health_telegram_token}
                                                                        onChange={(val) => setNewCamera({ ...newCamera, notify_health_telegram_token: val })}
                                                                        placeholder="Global Default"
                                                                    />
                                                                    <InputField
                                                                        label="Health Chat ID"
                                                                        value={newCamera.notify_health_telegram_chat_id}
                                                                        onChange={(val) => setNewCamera({ ...newCamera, notify_health_telegram_chat_id: val })}
                                                                        placeholder="Global Default"
                                                                    />
                                                                </div>
                                                                <div className="flex justify-end mt-2">
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => handleTestNotification('telegram', {
                                                                            telegram_bot_token: newCamera.notify_health_telegram_token,
                                                                            telegram_chat_id: newCamera.notify_health_telegram_chat_id
                                                                        })}
                                                                        className="h-8 text-xs font-medium"
                                                                    >
                                                                        Test Health Telegram
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Webhook Section */}
                                                <div className="space-y-4">
                                                    <SectionHeader title="Webhook Notifications" description="Call external URL on events" />

                                                    {/* Motion Webhook */}
                                                    <div className="space-y-3">
                                                        <div className="flex flex-col gap-2">
                                                            <Toggle
                                                                label="Call Webhook on Start"
                                                                checked={newCamera.notify_start_webhook}
                                                                onChange={(val) => setNewCamera({ ...newCamera, notify_start_webhook: val })}
                                                            />
                                                            <Toggle
                                                                label="Call Webhook on End"
                                                                checked={newCamera.notify_end_webhook}
                                                                onChange={(val) => setNewCamera({ ...newCamera, notify_end_webhook: val })}
                                                            />
                                                        </div>
                                                        {(newCamera.notify_start_webhook || newCamera.notify_end_webhook) && (
                                                            <div className="ml-9 p-3 bg-muted/30 rounded-lg border border-border animate-in fade-in slide-in-from-top-1">
                                                                <InputField
                                                                    label="Webhook URL"
                                                                    value={newCamera.notify_webhook_url}
                                                                    onChange={(val) => setNewCamera({ ...newCamera, notify_webhook_url: val })}
                                                                    placeholder="Leave empty to use Global Settings"
                                                                />
                                                                <div className="flex justify-end mt-2">
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => handleTestNotification('webhook', { notify_webhook_url: newCamera.notify_webhook_url })}
                                                                        className="h-8 text-xs font-medium"
                                                                    >
                                                                        Test Webhook
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Health Webhook */}
                                                    <div className="space-y-3">
                                                        <Toggle
                                                            label="Notify Health via Webhook"
                                                            checked={newCamera.notify_health_webhook}
                                                            onChange={(val) => setNewCamera({ ...newCamera, notify_health_webhook: val })}
                                                        />
                                                        {newCamera.notify_health_webhook && (
                                                            <div className="ml-9 p-3 bg-muted/30 rounded-lg border border-border animate-in fade-in slide-in-from-top-1">
                                                                <InputField
                                                                    label="Health Webhook URL"
                                                                    value={newCamera.notify_health_webhook_url}
                                                                    onChange={(val) => setNewCamera({ ...newCamera, notify_health_webhook_url: val })}
                                                                    placeholder="Leave empty to use Global Settings"
                                                                />
                                                                <div className="flex justify-end mt-2">
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => handleTestNotification('webhook', { notify_webhook_url: newCamera.notify_health_webhook_url })}
                                                                        className="h-8 text-xs font-medium"
                                                                    >
                                                                        Test Health Webhook
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
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
                                        {!editingId && <div className="hidden sm:block"></div>} {/* Spacer */}

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
                )
            }

            {/* Copy Settings Modal */}
            {
                showCopyModal && (
                    <Portal>
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] lg:pl-64 p-4">
                            <div className="bg-card p-6 rounded-xl w-full max-w-md border border-border shadow-xl">
                                <h3 className="text-lg font-bold mb-2">Copy Settings</h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Select cameras to overwrite with current settings. <br />
                                    <span className="text-xs text-yellow-600 dark:text-yellow-400">Warning: This will replace configuration for selected cameras.</span>
                                </p>

                                <div className="space-y-2 max-h-[300px] overflow-y-auto mb-6 bg-muted/20 p-2 rounded-lg border border-border/50">
                                    {cameras.filter(c => c.id !== editingId).map(cam => (
                                        <div
                                            key={cam.id}
                                            className="flex items-center p-2 hover:bg-accent rounded cursor-pointer"
                                            onClick={() => {
                                                if (copyTargets.includes(cam.id)) {
                                                    setCopyTargets(copyTargets.filter(id => id !== cam.id));
                                                } else {
                                                    setCopyTargets([...copyTargets, cam.id]);
                                                }
                                            }}
                                        >
                                            <div className={`w-5 h-5 mr-3 rounded border-2 flex items-center justify-center transition-colors ${copyTargets.includes(cam.id)
                                                ? 'bg-primary border-primary'
                                                : 'border-gray-400 dark:border-gray-500'
                                                }`}>
                                                {copyTargets.includes(cam.id) && (
                                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                            <span className="font-medium">{cam.name}</span>
                                            <span className="text-xs text-muted-foreground ml-auto">{cam.resolution_width}x{cam.resolution_height}</span>
                                        </div>
                                    ))}
                                    {cameras.filter(c => c.id !== editingId).length === 0 && (
                                        <p className="text-sm text-center py-4 text-muted-foreground">No other cameras available.</p>
                                    )}
                                </div>

                                <div className="flex justify-end space-x-3">
                                    <Button
                                        variant="ghost"
                                        onClick={() => { setShowCopyModal(false); setCopyTargets([]); }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleCopySettings}
                                        disabled={copyTargets.length === 0}
                                        className="bg-blue-600 hover:bg-blue-700 text-white"
                                    >
                                        <Copy className="w-4 h-4 mr-2" />
                                        Copy to {copyTargets.length} Cameras
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </Portal>
                )
            }
            {/* Bulk Actions Floating Bar */}
            {
                selectedCameraIds.length > 0 && !showAddModal && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="bg-card/95 backdrop-blur-md border border-primary/20 shadow-2xl rounded-2xl px-6 py-4 flex items-center space-x-6 text-foreground min-w-[320px]">
                            <div className="flex-1">
                                <p className="font-bold text-sm">{selectedCameraIds.length} Camera(s) selected</p>
                                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Bulk Actions</p>
                            </div>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => setSelectedCameraIds([])}
                                    className="px-3 py-1.5 text-xs font-semibold hover:bg-muted/50 rounded-lg transition-colors"
                                >
                                    Clear
                                </button>
                                <button
                                    onClick={handleBulkDelete}
                                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-all flex items-center shadow-lg shadow-red-500/20 active:scale-95"
                                >
                                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                    Delete Selected
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Global Processing Overlay */}
            {
                isProcessing && (
                    <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[140] flex flex-col items-center justify-center animate-in fade-in duration-300">
                        <div className="bg-card border border-border p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm text-center">
                            <div className="flex items-center justify-center space-x-6 mb-6">
                                <div className="p-3 bg-primary/10 rounded-2xl">
                                    {processingMessage.title.includes('Delete') ? (
                                        <Trash2 className="w-10 h-10 text-red-500" />
                                    ) : (
                                        <Upload className="w-10 h-10 text-primary" />
                                    )}
                                </div>
                                <Activity className="w-12 h-12 text-primary animate-spin opacity-50" />
                            </div>
                            <h3 className="text-xl font-bold mb-2">{processingMessage.title}</h3>
                            <p className="text-muted-foreground text-sm">
                                {processingMessage.text}
                            </p>
                        </div>
                    </div>
                )
            }

            <ConfirmModal {...confirmConfig} />
        </div >
    );
};
