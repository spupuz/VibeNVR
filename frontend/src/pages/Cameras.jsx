import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, Plus, Trash2, MapPin, Activity, Edit, Download, Upload, Film, Image, Copy, X } from 'lucide-react';
import { Toggle, Slider, InputField, SelectField, SectionHeader } from '../components/ui/FormControls';
import { GroupsManager } from '../components/GroupsManager';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ConfirmModal } from '../components/ui/ConfirmModal';

const CameraCard = ({ camera, onDelete, onEdit, onToggleActive }) => {
    const { user } = useAuth();
    return (
        <div className={`bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-all duration-300 group ${!camera.is_active ? 'opacity-70 grayscale-[0.5]' : ''}`}>
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Camera className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                            {camera.name}
                            <span className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded text-muted-foreground border border-border">
                                ID: {camera.id}
                            </span>
                        </h3>
                        <div className="flex items-center text-xs text-muted-foreground mt-1">
                            <MapPin className="w-3 h-3 mr-1" />
                            {camera.location || 'Unknown Location'}
                        </div>
                    </div>
                </div>
                {user?.role === 'admin' && (
                    <div onClick={(e) => e.stopPropagation()}>
                        <Toggle
                            checked={camera.is_active}
                            onChange={() => onToggleActive(camera)}
                            compact={true}
                        />
                    </div>
                )}
            </div>

            {user?.role === 'admin' && (
                <div className="space-y-2 text-sm text-muted-foreground mb-4">
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

            <div className="flex justify-end pt-4 border-t border-border space-x-2">
                {user?.role === 'admin' && (
                    <>
                        <button
                            onClick={() => window.open(`/api/cameras/${camera.id}/export`, '_blank')}
                            className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                            title="Export Camera Settings"
                        >
                            <Download className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => onEdit(camera)}
                            className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                            title="Edit Camera"
                        >
                            <Edit className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => onDelete(camera.id)}
                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Delete Camera"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export const Cameras = () => {
    const { user, token } = useAuth();
    const [cameras, setCameras] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
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
        max_movie_length: 0,
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
    const { showToast } = useToast();
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
                setNewCamera(camera);
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
            message: 'Are you sure you want to delete this camera? All associated recordings will be kept on disk but the camera configuration will be removed.',
            onConfirm: async () => {
                try {
                    await fetch(`/api/cameras/${id}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    fetchCameras();
                    showToast('Camera deleted successfully', 'success');
                } catch (err) {
                    showToast('Failed to delete: ' + err.message, 'error');
                }
                setConfirmConfig({ isOpen: false });
            },
            onCancel: () => setConfirmConfig({ isOpen: false })
        });
    };

    const handleEdit = (camera) => {
        // Parse RTSP URL into components
        let user = '', pass = '', host = camera.rtsp_url;
        const match = camera.rtsp_url.match(/^(rtsp|http|https|rtmp):\/\/([^:]+)(?::([^@]+))?@(.+)$/);

        if (match) {
            // match[1] protocol, match[2] user, match[3] pass, match[4] host
            // Simple approach: remove protocol
            const withoutProto = camera.rtsp_url.replace(/^(rtsp|http|https|rtmp):\/\//, '');
            // Check if user/pass exists
            if (withoutProto.includes('@')) {
                const [auth, ...rest] = withoutProto.split('@');
                host = rest.join('@');
                const [u, p] = auth.split(':');
                user = u;
                pass = p;
            } else {
                host = withoutProto;
            }
        } else {
            // Fallback helper if regex fails or simple URL
            if (camera.rtsp_url && camera.rtsp_url.includes('://')) {
                const withoutProto = camera.rtsp_url.split('://')[1];
                if (withoutProto.includes('@')) {
                    const [auth, h] = withoutProto.split('@');
                    host = h;
                    if (auth.includes(':')) {
                        const [u, p] = auth.split(':');
                        user = u;
                        pass = p;
                    } else {
                        user = auth;
                    }
                } else {
                    host = withoutProto;
                }
            }
        }

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
                        max_movie_length: 0,
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
                        enable_manual_snapshots: true
                    });
                    setEditingId(null);
                } else {
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
                // Fields to EXCLUDE (Unique items)
                const EXCLUDED_FIELDS = ['id', 'name', 'rtsp_url', 'stream_url', 'created_at', 'location', 'stream_port'];

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

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Cameras</h2>
                    <p className="text-muted-foreground mt-2">Manage your video sources.</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    {user?.role === 'admin' && view === 'cameras' && (
                        <>
                            <button
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
                                        max_movie_length: 0,
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
                                        enable_manual_snapshots: true
                                    });
                                    setShowAddModal(true);
                                }}
                                className="flex-1 sm:flex-initial flex items-center justify-center space-x-2 bg-primary text-primary-foreground px-4 h-10 rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap text-sm font-medium"
                            >
                                <Plus className="w-4 h-4" />
                                <span>Add Camera</span>
                            </button>
                            <button
                                onClick={() => window.open('/api/cameras/export/all', '_blank')}
                                className="flex-1 sm:flex-initial flex items-center justify-center space-x-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white px-4 h-10 rounded-lg hover:from-emerald-600 hover:to-green-700 transition-all shadow-sm hover:shadow-md whitespace-nowrap text-sm font-medium"
                                title="Export all cameras to JSON"
                            >
                                <Download className="w-4 h-4" />
                                <span>Export All</span>
                            </button>
                            <div className="flex-1 sm:flex-initial flex gap-1">
                                <label className="flex-1 sm:flex-initial flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 h-10 rounded-l-lg hover:from-blue-600 hover:to-indigo-700 transition-all shadow-sm hover:shadow-md cursor-pointer whitespace-nowrap text-sm font-medium border-r border-white/20" title="Import cameras from VibeNVR JSON">
                                    <Upload className="w-4 h-4" />
                                    <span>Import</span>
                                    <input
                                        type="file"
                                        accept=".json"
                                        className="hidden"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
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
                                                    showToast('Import failed: ' + err.detail, 'error');
                                                }
                                            } catch (err) {
                                                showToast('Import failed: ' + err.message, 'error');
                                            }
                                            e.target.value = '';
                                        }}
                                    />
                                </label>
                                <label className="flex-1 sm:flex-initial flex items-center justify-center px-4 h-10 bg-indigo-600 text-white rounded-r-lg hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md cursor-pointer whitespace-nowrap text-sm font-medium" title="Import from MotionEye backup (.tar.gz)">
                                    <div className="flex flex-col items-center leading-tight">
                                        <span className="text-[10px] opacity-70">from</span>
                                        <span className="text-xs">MotionEye</span>
                                    </div>
                                    <input
                                        type="file"
                                        accept=".tar.gz"
                                        className="hidden"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
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
                                                    showToast('MotionEye Import failed: ' + err.detail, 'error');
                                                }
                                            } catch (err) {
                                                showToast('Import error: ' + err.message, 'error');
                                            }
                                            e.target.value = '';
                                        }}
                                    />
                                </label>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {cameras.map(cam => (
                            <CameraCard key={cam.id} camera={cam} onDelete={handleDelete} onEdit={handleEdit} onToggleActive={handleToggleActive} />
                        ))}
                        {cameras.length === 0 && (
                            <div className="col-span-full text-center py-12 text-muted-foreground bg-card border border-dashed border-border rounded-xl">
                                <Camera className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                <p>No cameras found. Add one to get started.</p>
                            </div>
                        )}
                    </div>
                )
            }

            {/* Simple Modal */}
            {
                showAddModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-card p-6 rounded-xl w-full max-w-lg border border-border relative">
                            <button
                                onClick={() => {
                                    setShowAddModal(false);
                                    setEditingId(null);
                                }}
                                className="absolute right-4 top-4 text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted/50 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                            <h3 className="text-xl font-bold mb-4 pr-8">{editingId ? `Edit ${newCamera.name} (ID: ${editingId})` : 'Add New Camera'}</h3>

                            {/* Tabs */}
                            {!editingId && (
                                <div className="mb-4 p-4 bg-muted/30 rounded-lg border border-border">
                                    <label className="block text-sm font-medium mb-2">Clone Settings From (Optional)</label>
                                    <select
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        onChange={(e) => {
                                            const sourceId = parseInt(e.target.value);
                                            const sourceCam = cameras.find(c => c.id === sourceId);
                                            if (sourceCam) {
                                                // Clone everything but unique identity fields
                                                setNewCamera(prev => ({
                                                    ...sourceCam,
                                                    id: undefined,
                                                    name: prev.name, // Keep current input
                                                    rtsp_url: prev.rtsp_url, // Keep current input
                                                    stream_url: prev.stream_url,
                                                    location: prev.location,
                                                    created_at: undefined
                                                }));
                                            }
                                        }}
                                    >
                                        <option value="">-- Start Fresh --</option>
                                        {cameras.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="flex space-x-4 mb-4 border-b border-border text-xs overflow-x-auto scrollbar-hide flex-nowrap min-h-[40px]">
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

                            <form onSubmit={handleCreate} className="space-y-4 max-h-[60vh] overflow-y-auto">

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
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">Username (Optional)</label>
                                                    <input
                                                        type="text"
                                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                        value={newCamera.rtsp_username || ''}
                                                        onChange={(e) => {
                                                            const user = e.target.value;
                                                            const pass = newCamera.rtsp_password || '';
                                                            const host = newCamera.rtsp_host || '';
                                                            const url = `rtsp://${user}${pass ? ':' + pass : ''}${user || pass ? '@' : ''}${host}`;
                                                            setNewCamera({ ...newCamera, rtsp_username: user, rtsp_url: url });
                                                        }}
                                                        placeholder="admin"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">Password (Optional)</label>
                                                    <div className="relative">
                                                        <input
                                                            type={newCamera.show_password ? "text" : "password"}
                                                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm pr-10"
                                                            value={newCamera.rtsp_password || ''}
                                                            onChange={(e) => {
                                                                const pass = e.target.value;
                                                                const user = newCamera.rtsp_username || '';
                                                                const host = newCamera.rtsp_host || '';
                                                                const url = `rtsp://${user}${pass ? ':' + pass : ''}${user || pass ? '@' : ''}${host}`;
                                                                setNewCamera({ ...newCamera, rtsp_password: pass, rtsp_url: url });
                                                            }}
                                                            placeholder="••••••"
                                                        />
                                                        <button
                                                            type="button"
                                                            className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                                                            onClick={() => setNewCamera({ ...newCamera, show_password: !newCamera.show_password })}
                                                        >
                                                            {newCamera.show_password ? "Hide" : "Show"}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">RTSP Host & Path</label>
                                                <input
                                                    type="text"
                                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                    value={newCamera.rtsp_host || ''}
                                                    onChange={(e) => {
                                                        const host = e.target.value;
                                                        const user = newCamera.rtsp_username || '';
                                                        const pass = newCamera.rtsp_password || '';
                                                        const url = `rtsp://${user}${pass ? ':' + pass : ''}${user || pass ? '@' : ''}${host}`;
                                                        setNewCamera({ ...newCamera, rtsp_host: host, rtsp_url: url });
                                                    }}
                                                    placeholder="192.168.1.100:554/stream1"
                                                />
                                            </div>

                                            <div className="text-xs text-muted-foreground break-all">
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
                                                <div className="px-3 py-2 bg-muted/50 rounded-md border border-border text-muted-foreground">
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
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Left Text</label>
                                            <select
                                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                value={
                                                    newCamera.text_left === '' ? 'disabled' :
                                                        newCamera.text_left === '%$' ? 'name' :
                                                            newCamera.text_left === '%Y-%m-%d %H:%M:%S' ? 'timestamp' :
                                                                'custom'
                                                }
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === 'disabled') setNewCamera({ ...newCamera, text_left: '' });
                                                    else if (val === 'name') setNewCamera({ ...newCamera, text_left: '%$' });
                                                    else if (val === 'timestamp') setNewCamera({ ...newCamera, text_left: '%Y-%m-%d %H:%M:%S' });
                                                    else if (val === 'custom') setNewCamera({ ...newCamera, text_left: 'Custom Text' });
                                                }}
                                            >
                                                <option value="name">Camera Name</option>
                                                <option value="timestamp">Timestamp</option>
                                                <option value="custom">Custom Text</option>
                                                <option value="disabled">Disabled</option>
                                            </select>
                                            {/* Custom Input */}
                                            {!['', '%$', '%Y-%m-%d %H:%M:%S'].includes(newCamera.text_left) && (
                                                <input
                                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-2"
                                                    value={newCamera.text_left}
                                                    onChange={(e) => setNewCamera({ ...newCamera, text_left: e.target.value })}
                                                    placeholder="Enter custom text"
                                                />
                                            )}
                                        </div>

                                        {/* Right Text */}
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Right Text</label>
                                            <select
                                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                value={
                                                    newCamera.text_right === '' ? 'disabled' :
                                                        newCamera.text_right === '%$' ? 'name' :
                                                            newCamera.text_right === '%Y-%m-%d %H:%M:%S' ? 'timestamp' :
                                                                'custom'
                                                }
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === 'disabled') setNewCamera({ ...newCamera, text_right: '' });
                                                    else if (val === 'name') setNewCamera({ ...newCamera, text_right: '%$' });
                                                    else if (val === 'timestamp') setNewCamera({ ...newCamera, text_right: '%Y-%m-%d %H:%M:%S' });
                                                    else if (val === 'custom') setNewCamera({ ...newCamera, text_right: 'Custom Text' });
                                                }}
                                            >
                                                <option value="name">Camera Name</option>
                                                <option value="timestamp">Timestamp</option>
                                                <option value="custom">Custom Text</option>
                                                <option value="disabled">Disabled</option>
                                            </select>
                                            {!['', '%$', '%Y-%m-%d %H:%M:%S'].includes(newCamera.text_right) && (
                                                <input
                                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-2"
                                                    value={newCamera.text_right}
                                                    onChange={(e) => setNewCamera({ ...newCamera, text_right: e.target.value })}
                                                    placeholder="Enter custom text"
                                                />
                                            )}
                                        </div>

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
                                            options={['Motion Triggered', 'Continuous', 'Off']}
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
                                        <InputField
                                            label="Maximum Movie Length"
                                            type="number"
                                            value={newCamera.max_movie_length}
                                            onChange={(val) => setNewCamera({ ...newCamera, max_movie_length: val })}
                                            unit="seconds"
                                            placeholder="0 = infinite"
                                            help="Segment length for continuous recording or max length for motion events"
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
                                            options={['Forever', 'For One Month', 'For One Week', 'For One Day']}
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
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCleanup(editingId, 'video')}
                                                        className="text-xs flex items-center bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 px-2 py-1 rounded transition-colors"
                                                        title="Enforce storage limits now"
                                                    >
                                                        <Trash2 className="w-3 h-3 mr-1" />
                                                        Clean Up
                                                    </button>
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
                                            options={['Always', 'Working Schedule', 'Manual Toggle']}
                                        />

                                        {newCamera.detect_motion_mode === 'Working Schedule' && (
                                            <div className="bg-muted/30 p-4 rounded-lg border border-border">
                                                <div className="flex justify-between items-center mb-4">
                                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Weekly Schedule</p>
                                                    <button
                                                        type="button"
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
                                                        className="text-xs bg-primary/10 hover:bg-primary/20 text-primary px-2 py-1 rounded transition-colors flex items-center"
                                                    >
                                                        <Copy className="w-3 h-3 mr-1" />
                                                        Copy Mon to All
                                                    </button>
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
                                                                        className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
                                                                        value={newCamera[keyStart] || "00:00"}
                                                                        onChange={(e) => setNewCamera({ ...newCamera, [keyStart]: e.target.value })}
                                                                        disabled={!isActive}
                                                                    />
                                                                    <span className="text-muted-foreground">-</span>
                                                                    <input
                                                                        type="time"
                                                                        className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
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
                                                onChange={(val) => setNewCamera({ ...newCamera, captured_before: val })}
                                                unit="frames"
                                            />
                                            <InputField
                                                label="Captured After"
                                                type="number"
                                                value={newCamera.captured_after}
                                                onChange={(val) => setNewCamera({ ...newCamera, captured_after: val })}
                                                unit="frames"
                                            />
                                        </div>
                                        <InputField
                                            label="Minimum Motion Frames"
                                            type="number"
                                            value={newCamera.min_motion_frames}
                                            onChange={(val) => setNewCamera({ ...newCamera, min_motion_frames: val })}
                                            unit="frames"
                                        />

                                        <Toggle
                                            label="Show Frame Changes"
                                            checked={newCamera.show_frame_changes}
                                            onChange={(val) => setNewCamera({ ...newCamera, show_frame_changes: val })}
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
                                            options={['Forever', 'For One Month', 'For One Week', 'For One Day']}
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
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCleanup(editingId, 'snapshot')}
                                                        className="text-xs flex items-center bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 px-2 py-1 rounded transition-colors"
                                                        title="Enforce storage limits now"
                                                    >
                                                        <Trash2 className="w-3 h-3 mr-1" />
                                                        Clean Up
                                                    </button>
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
                                    <div className="space-y-6">
                                        <SectionHeader title="Motion Notifications" description="Send alerts when motion is detected" />
                                        <Toggle
                                            label="Send Email on Start"
                                            checked={newCamera.notify_start_email}
                                            onChange={(val) => setNewCamera({ ...newCamera, notify_start_email: val })}
                                        />
                                        <Toggle
                                            label="Send Telegram on Start"
                                            checked={newCamera.notify_start_telegram}
                                            onChange={(val) => setNewCamera({ ...newCamera, notify_start_telegram: val })}
                                        />
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

                                        {(newCamera.notify_start_webhook || newCamera.notify_end_webhook) && (
                                            <InputField
                                                label="Webhook URL"
                                                value={newCamera.notify_webhook_url}
                                                onChange={(val) => setNewCamera({ ...newCamera, notify_webhook_url: val })}
                                                placeholder="https://hooks.example.com/..."
                                            />
                                        )}

                                        {newCamera.notify_start_telegram && (
                                            <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
                                                <InputField
                                                    label="Telegram Bot Token"
                                                    value={newCamera.notify_telegram_token}
                                                    onChange={(val) => setNewCamera({ ...newCamera, notify_telegram_token: val })}
                                                    placeholder="123456:ABC-DEF..."
                                                />
                                                <InputField
                                                    label="Telegram Chat ID"
                                                    value={newCamera.notify_telegram_chat_id}
                                                    onChange={(val) => setNewCamera({ ...newCamera, notify_telegram_chat_id: val })}
                                                    placeholder="@chat_name or ID"
                                                />
                                            </div>
                                        )}

                                        {newCamera.notify_start_email && (
                                            <InputField
                                                label="Email Recipient"
                                                value={newCamera.notify_email_address}
                                                onChange={(val) => setNewCamera({ ...newCamera, notify_email_address: val })}
                                                placeholder="user@example.com"
                                            />
                                        )}


                                    </div>
                                )}

                                <div className="flex justify-between items-center mt-6 pt-4 border-t border-border">
                                    {editingId && (
                                        <button
                                            type="button"
                                            onClick={() => setShowCopyModal(true)}
                                            className="flex items-center space-x-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-3 py-2 rounded-lg transition-colors"
                                        >
                                            <Copy className="w-4 h-4" />
                                            <span>Copy Settings to...</span>
                                        </button>
                                    )}
                                    {!editingId && <div></div>} {/* Spacer */}

                                    <div className="flex space-x-3">
                                        <button
                                            type="button"
                                            onClick={() => setShowAddModal(false)}
                                            className="px-4 py-2 text-sm font-medium hover:bg-accent rounded-lg"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => handleCreate(e, false)}
                                            className="px-4 py-2 text-primary hover:bg-primary/10 text-sm font-medium rounded-lg transition-colors border border-primary/20"
                                        >
                                            Apply
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90"
                                        >
                                            {editingId ? 'Save Changes' : 'Create Camera'}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Copy Settings Modal */}
            {
                showCopyModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
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
                                <button
                                    onClick={() => { setShowCopyModal(false); setCopyTargets([]); }}
                                    className="px-4 py-2 text-sm font-medium hover:bg-accent rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCopySettings}
                                    disabled={copyTargets.length === 0}
                                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                                >
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy to {copyTargets.length} Cameras
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            <ConfirmModal {...confirmConfig} />
        </div >
    );
};
