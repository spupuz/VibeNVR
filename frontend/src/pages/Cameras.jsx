import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, Plus, Trash2, MapPin, Activity, Download, Upload, Search } from 'lucide-react';
import { Toggle } from '../components/ui/FormControls';
import { GroupsManager } from '../components/GroupsManager';
import { CameraScanner } from '../components/CameraScanner';

import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useToast } from '../contexts/ToastContext';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Button } from '../components/ui/Button';
import { CameraCard } from '../components/Cameras/CameraCard';
import { SortableCameraCard } from '../components/Cameras/SortableCameraCard';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';
import { CameraAddEditModal } from '../components/Cameras/AddEditModal/CameraAddEditModal';
import { CopySettingsModal } from '../components/Cameras/CopySettingsModal';
import { parseRtspUrl } from '../utils/cameraUtils';
import { DEFAULT_CAMERA_STATE } from '../constants/cameraDefaults';
import { CATEGORY_FIELD_MAP, EXCLUDED_FIELDS } from '../utils/cameraSettingsMapping';
import { BulkActionsBar } from '../components/Cameras/BulkActionsBar';
import { ProcessingOverlay } from '../components/Cameras/ProcessingOverlay';
import { ImportSelectionModal } from '../components/Cameras/ImportSelectionModal';

export const Cameras = () => {
    const { user, token } = useAuth();
    const { t } = useTranslation();
    const [cameras, setCameras] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const fileInputRef = useRef(null);
    const motionEyeInputRef = useRef(null);
    const [newCamera, setNewCamera] = useState({...DEFAULT_CAMERA_STATE});

    const [stats, setStats] = useState(null);
    const [storageProfiles, setStorageProfiles] = useState([]);
    const [activeTab, setActiveTab] = useState('general');
    const [editingId, setEditingId] = useState(null);
    const [view, setView] = useState('cameras');
    const [isGroupView, setIsGroupView] = useState(() => {
        return localStorage.getItem('camerasGroupBy') === 'true';
    });
    const [globalSettings, setGlobalSettings] = useState(null);

    const handleGroupViewToggle = (val) => {
        setIsGroupView(val);
        localStorage.setItem('camerasGroupBy', val);
    };
    const { showToast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingMessage, setProcessingMessage] = useState({ title: 'Processing', text: 'Please wait...' });
    const [selectedCameraIds, setSelectedCameraIds] = useState([]);
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false });
    const [importCandidates, setImportCandidates] = useState([]);
    const [showImportModal, setShowImportModal] = useState(false);

    const [searchParams, setSearchParams] = useSearchParams();

    // DND Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            setCameras((items) => {
                const oldIndex = items.findIndex(c => c.id === active.id);
                const newIndex = items.findIndex(c => c.id === over.id);
                const newOrder = arrayMove(items, oldIndex, newIndex);
                
                // Call API immediately to persist order
                fetch('/api/cameras/reorder', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ camera_ids: newOrder.map(c => c.id) })
                });
                
                return newOrder;
            });
        }
    };

    // Fetch Cameras & Periodic Polling
    useEffect(() => {
        if (!token) return;
        
        // Initial fetch
        fetchCameras();
        fetchStats();
        fetchStorageProfiles();
        fetchGlobalSettings();

        // Polling loop for live status (15s)
        const pollInterval = setInterval(() => {
            fetchCameras();
            fetchStats();
        }, 15000);

        return () => clearInterval(pollInterval);
    }, [token]);

    const fetchStorageProfiles = async () => {
        try {
            const res = await fetch('/api/storage/profiles', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setStorageProfiles(await res.json());
            }
        } catch (err) {
            console.error("Failed to fetch storage profiles", err);
        }
    };

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

    const fetchGlobalSettings = async () => {
        try {
            const res = await fetch('/api/settings', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setGlobalSettings({
                    max_global_storage_gb: data.max_global_storage_gb?.value !== undefined ? parseFloat(data.max_global_storage_gb.value) : 0,
                    cleanup_enabled: data.cleanup_enabled?.value === 'true',
                    ai_enabled: data.ai_enabled?.value === 'true' || data.ai_enabled?.value === true
                });
            }
        } catch (err) {
            console.error("Failed to fetch global settings", err);
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

    const handleConfirmImport = async (selectedCameras) => {
        setShowImportModal(false);
        setProcessingMessage({ title: 'Importing Cameras', text: 'Saving selected cameras...' });
        setIsProcessing(true);
        
        try {
            // Generate a JSON blob mimicking VibeNVR export format
            const jsonBlob = new Blob([JSON.stringify({ cameras: selectedCameras, version: "1.1" })], { type: 'application/json' });
            const formData = new FormData();
            formData.append('file', jsonBlob, 'import.json');

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
            setImportCandidates([]);
        }
    };

    const handleBulkExport = async () => {
        if (selectedCameraIds.length === 0) return;

        try {
            const res = await fetch('/api/cameras/export/bulk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(selectedCameraIds)
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
                showToast("Selected cameras exported successfully", "success");
            } else {
                showToast('Failed to export selected cameras', 'error');
            }
        } catch (err) {
            showToast('Export error: ' + err.message, 'error');
        }
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
                    setNewCamera({...DEFAULT_CAMERA_STATE, text_left: 'Camera Name', max_storage_gb: 0, notify_attach_image_email: true, notify_attach_image_telegram: true});

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

    const handleScannerAdd = (discoveryData) => {
        const hostPath = `${discoveryData.ip}${discoveryData.port && discoveryData.port !== 80 ? ':' + discoveryData.port : ''}${discoveryData.path || ''}`;

        setNewCamera(prev => ({
            ...prev,
            name: discoveryData.name,
            rtsp_url: discoveryData.rtsp_url,
            rtsp_username: discoveryData.rtsp_username,
            rtsp_password: discoveryData.rtsp_password,
            rtsp_host: hostPath,
            location: discoveryData.location || ''
        }));
        setShowAddModal(true);
        setShowScanner(false);
    };

    const handleCopySettings = async (selectedCategories) => {
        if (copyTargets.length === 0) return;

        setConfirmConfig({
            isOpen: true,
            title: 'Copy Settings',
            message: `Overwrite ${selectedCategories.length} categories of settings for ${copyTargets.length} cameras?`,
            onConfirm: async () => {
                // Determine which fields to copy based on selected categories
                const fieldsToCopy = [];
                selectedCategories.forEach(cat => {
                    if (CATEGORY_FIELD_MAP[cat]) {
                        fieldsToCopy.push(...CATEGORY_FIELD_MAP[cat]);
                    }
                });

                const settingsToCopy = Object.keys(newCamera).reduce((acc, key) => {
                    // Only copy if it's in the selected categories AND not explicitly excluded
                    if (fieldsToCopy.includes(key) && !EXCLUDED_FIELDS.includes(key)) {
                        acc[key] = newCamera[key];
                    }
                    return acc;
                }, {});

                if (Object.keys(settingsToCopy).length === 0) {
                    showToast('No settings selected to copy', 'warning');
                    setConfirmConfig({ isOpen: false });
                    return;
                }

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
                showToast("Settings copied successfully.", "success");
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
                    <h2 className="text-3xl font-bold tracking-tight">{t('cameras.title', 'Cameras')}</h2>
                    <p className="text-muted-foreground mt-2">{t('cameras.subtitle', 'Manage your video sources.')}</p>
                </div>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 w-full sm:w-auto">
                    {/* Group View Toggle - visible to all users */}
                    {view === 'cameras' && (
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 w-full sm:w-auto">
                            <div className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-2 shadow-sm min-h-[40px] w-full sm:w-auto">
                                <Toggle
                                    checked={isGroupView}
                                    onChange={handleGroupViewToggle}
                                    label={t('cameras.group_view', 'Group View')}
                                    help="Group cameras by assigned groups"
                                />
                            </div>
                            {user?.role === 'admin' && cameras.length > 0 && (
                                <button
                                    onClick={() => handleSelectAll(cameras.map(c => c.id))}
                                    className="flex items-center justify-center space-x-2 bg-card hover:bg-muted text-foreground px-4 py-2 rounded-lg transition-all whitespace-nowrap text-sm font-bold border border-border shadow-sm active:scale-95 min-h-[40px] w-full sm:w-auto"
                                >
                                    <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${cameras.every(c => selectedCameraIds.includes(c.id)) ? 'bg-primary border-primary' : 'bg-background border-border'}`}>
                                        {cameras.every(c => selectedCameraIds.includes(c.id)) && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>}
                                    </div>
                                    <span>{cameras.every(c => selectedCameraIds.includes(c.id)) ? t('cameras.deselect_all', 'Deselect All') : t('cameras.select_all', 'Select All')}</span>
                                </button>
                            )}
                        </div>
                    )}
                    {user?.role === 'admin' && view === 'cameras' && (
                        <>

                            <Button
                                onClick={() => {
                                    setEditingId(null);
                                    setNewCamera({...DEFAULT_CAMERA_STATE, rtsp_username: '', rtsp_password: '', rtsp_host: '', max_storage_gb: 0, notify_attach_image_email: true, notify_attach_image_telegram: true});
                                    setShowAddModal(true);
                                }}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                <span>{t('cameras.add_camera', 'Add Camera')}</span>
                            </Button>

                            <Button
                                variant={showScanner ? "secondary" : "outline"}
                                onClick={() => setShowScanner(!showScanner)}
                                className="transition-all"
                            >
                                <Search className="w-4 h-4 mr-2" />
                                <span>{showScanner ? t('cameras.hide_scanner', 'Hide Scanner') : t('cameras.scan_network', 'Scan Network')}</span>
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
                                <span>{t('cameras.export_all', 'Export All')}</span>
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
                                        setProcessingMessage({ title: 'Analyzing Import', text: 'Parsing VibeNVR configuration...' });
                                        setIsProcessing(true);
                                        const formData = new FormData();
                                        formData.append('file', file);
                                        try {
                                            const res = await fetch('/api/cameras/import?analyze_only=true', {
                                                method: 'POST',
                                                body: formData,
                                                headers: { Authorization: `Bearer ${token}` }
                                            });
                                            if (res.ok) {
                                                const data = await res.json();
                                                if (data.cameras && data.cameras.length > 0) {
                                                    setImportCandidates(data.cameras);
                                                    setShowImportModal(true);
                                                } else {
                                                    showToast('No cameras found in file', 'warning');
                                                }
                                            } else {
                                                const err = await res.json();
                                                showToast('Analysis failed: ' + (err.detail || 'Unknown error'), 'error');
                                            }
                                        } catch (err) {
                                            showToast('Analysis error: ' + err.message, 'error');
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
                                        setProcessingMessage({ title: 'MotionEye Import', text: 'Analyzing backup and parsing cameras...' });
                                        setIsProcessing(true);
                                        const formData = new FormData();
                                        formData.append('file', file);
                                        try {
                                            const res = await fetch('/api/cameras/import/motioneye?analyze_only=true', {
                                                method: 'POST',
                                                body: formData,
                                                headers: { Authorization: `Bearer ${token}` }
                                            });
                                            if (res.ok) {
                                                const data = await res.json();
                                                if (data.cameras && data.cameras.length > 0) {
                                                    setImportCandidates(data.cameras);
                                                    setShowImportModal(true);
                                                } else {
                                                    showToast('No cameras found in MotionEye backup', 'warning');
                                                }
                                            } else {
                                                const err = await res.json();
                                                showToast('MotionEye Analysis failed: ' + (err.detail || 'Unknown error'), 'error');
                                            }
                                        } catch (err) {
                                            showToast('Analysis error: ' + err.message, 'error');
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
                                    <span>{t('cameras.import', 'Import')}</span>
                                </Button>
                                <Button
                                    variant="outline"
                                    className="rounded-l-none"
                                    onClick={() => motionEyeInputRef.current.click()}
                                    title="Import from MotionEye backup (.tar.gz)"
                                >
                                    <div className="flex flex-col items-center leading-tight">
                                        <span className="text-[10px] opacity-70">{t('cameras.from', 'from')}</span>
                                        <span className="text-xs">{t('cameras.motioneye', 'MotionEye')}</span>
                                    </div>
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Quick Stats Summary Bar */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-card border border-border rounded-lg p-2.5 flex flex-row justify-between items-center shadow-sm">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t('cameras.configured', 'Configured')}</span>
                    <span className="text-xl font-bold">{cameras.length}</span>
                </div>
                <div className="bg-card border border-border rounded-lg p-2.5 flex flex-row justify-between items-center shadow-sm border-l-4 border-l-primary">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t('cameras.active', 'Active')}</span>
                    <span className="text-xl font-bold">{cameras.filter(c => c.is_active).length}</span>
                </div>
                <div className="bg-card border border-border rounded-lg p-2.5 flex flex-row justify-between items-center shadow-sm border-l-4 border-l-green-500">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t('cameras.online', 'Online')}</span>
                    <span className="text-xl font-bold text-green-600">
                        {cameras.filter(c => c.status === 'CONNECTED').length}
                    </span>
                </div>
                <div className="bg-card border border-border rounded-lg p-2.5 flex flex-row justify-between items-center shadow-sm border-l-4 border-l-red-500">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t('cameras.offline', 'Offline')}</span>
                    <span className="text-xl font-bold text-red-600">
                        {cameras.filter(c => c.status === 'UNREACHABLE' || c.status === 'OFFLINE' || !c.status).length}
                    </span>
                </div>
                <div className="bg-card border border-border rounded-lg p-2.5 flex flex-row justify-between items-center shadow-sm border-l-4 border-l-amber-500">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t('cameras.auth_errors', 'Auth Errors')}</span>
                    <span className="text-xl font-bold text-amber-600">
                        {cameras.filter(c => c.status === 'UNAUTHORIZED').length}
                    </span>
                </div>
            </div>


            <div className={`transition-all duration-500 ease-in-out overflow-hidden ${showScanner ? 'max-h-[1000px] mb-8 opacity-100' : 'max-h-0 mb-0 opacity-0 pointer-events-none'}`}>
                <CameraScanner
                    onAddCamera={handleScannerAdd}
                    existingCameras={cameras}
                />
            </div>

            {/* Tabs */}
            <div className="flex space-x-1 border-b border-border mb-6">
                <button
                    onClick={() => setView('cameras')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${view === 'cameras' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                    {t('cameras.cameras_tab', 'Cameras')}
                </button>
                <button
                    onClick={() => setView('groups')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${view === 'groups' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                    {t('cameras.groups_tab', 'Groups')}
                </button>
            </div>

            {
                view === 'groups' ? (
                    <GroupsManager cameras={cameras} onUpdate={fetchCameras} />
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
                                                                    {allInGroupSelected ? t('cameras.deselect_group', 'Deselect Group') : t('cameras.select_group', 'Select Group')}
                                                                </button>
                                                            )}
                                                        </h3>
                                                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                                            <SortableContext items={groupCamIds} strategy={rectSortingStrategy}>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                                    {grouped[groupName].map(cam => (
                                                                        <SortableCameraCard
                                                                            key={`${groupName}-${cam.id}`}
                                                                            camera={cam}
                                                                            onDelete={handleDelete}
                                                                            onEdit={handleEdit}
                                                                            onToggleActive={handleToggleActive}
                                                                            isSelected={selectedCameraIds.includes(cam.id)}
                                                                            onSelect={handleSelectCamera}
                                                                            handleCleanup={handleCleanup}
                                                                            setShowCopyModal={setShowCopyModal}
                                                                            globalSettings={globalSettings}
                                                                            isSortable={user?.role === 'admin'}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            </SortableContext>
                                                        </DndContext>
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
                                                                    {ungrouped.every(c => selectedCameraIds.includes(c.id)) ? t('cameras.deselect_ungrouped', 'Deselect Ungrouped') : t('cameras.select_ungrouped', 'Select Ungrouped')}
                                                                </button>
                                                            )}
                                                        </h3>
                                                    )}
                                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                                        <SortableContext items={ungrouped.map(c => c.id)} strategy={rectSortingStrategy}>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                                {ungrouped.map(cam => (
                                                                    <SortableCameraCard
                                                                        key={cam.id}
                                                                        camera={cam}
                                                                        onDelete={handleDelete}
                                                                        onEdit={handleEdit}
                                                                        onToggleActive={handleToggleActive}
                                                                        isSelected={selectedCameraIds.includes(cam.id)}
                                                                        onSelect={handleSelectCamera}
                                                                        handleCleanup={handleCleanup}
                                                                        setShowCopyModal={setShowCopyModal}
                                                                        globalSettings={globalSettings}
                                                                        isSortable={user?.role === 'admin'}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </SortableContext>
                                                    </DndContext>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        ) : (
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={cameras.map(c => c.id)} strategy={rectSortingStrategy}>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {cameras.map(cam => (
                                            <SortableCameraCard
                                                key={cam.id}
                                                camera={cam}
                                                onDelete={handleDelete}
                                                onEdit={handleEdit}
                                                onToggleActive={handleToggleActive}
                                                isSelected={selectedCameraIds.includes(cam.id)}
                                                onSelect={handleSelectCamera}
                                                handleCleanup={handleCleanup}
                                                setShowCopyModal={setShowCopyModal}
                                                globalSettings={globalSettings}
                                                isSortable={user?.role === 'admin'}
                                            />
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        )}

                        {cameras.length === 0 && (
                            <div className="text-center py-12 text-muted-foreground bg-card border border-dashed border-border rounded-xl">
                                <Camera className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                <p>{t('cameras.no_cameras_found_add_one', 'No cameras found. Add one to get started.')}</p>
                            </div>
                        )}
                    </>
                )
            }

            <CameraAddEditModal
                showAddModal={showAddModal}
                setShowAddModal={setShowAddModal}
                editingId={editingId}
                setEditingId={setEditingId}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                newCamera={newCamera}
                setNewCamera={setNewCamera}
                storageProfiles={storageProfiles}
                cameras={cameras}
                token={token}
                stats={stats}
                handleCreate={handleCreate}
                handleCleanup={handleCleanup}
                handleTestNotification={handleTestNotification}
                setShowCopyModal={setShowCopyModal}
                globalSettings={globalSettings}
            />

            <CopySettingsModal
                showCopyModal={showCopyModal}
                setShowCopyModal={setShowCopyModal}
                cameras={cameras}
                editingId={editingId}
                copyTargets={copyTargets}
                setCopyTargets={setCopyTargets}
                handleCopySettings={handleCopySettings}
            />
            {/* Bulk Actions Floating Bar */}
            {selectedCameraIds.length > 0 && !showAddModal && (
                <BulkActionsBar 
                    selectedCameraIds={selectedCameraIds} 
                    setSelectedCameraIds={setSelectedCameraIds} 
                    handleBulkDelete={handleBulkDelete}
                    handleBulkExport={handleBulkExport}
                />
            )}

            <ImportSelectionModal
                showModal={showImportModal}
                onClose={() => setShowImportModal(false)}
                onConfirm={handleConfirmImport}
                cameras={importCandidates}
            />

            {/* Global Processing Overlay */}
            {isProcessing && <ProcessingOverlay isProcessing={isProcessing} processingMessage={processingMessage} />}

            <ConfirmModal {...confirmConfig} />
        </div >
    );
};
