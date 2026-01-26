import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Camera, Settings, Copy, Play, Pause, Layers, Check } from 'lucide-react';
import { Toggle } from './ui/FormControls';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ConfirmModal } from '../components/ui/ConfirmModal';

export const GroupsManager = ({ cameras }) => {
    const { token, user } = useAuth();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');

    // Manage Modal
    const [managingGroup, setManagingGroup] = useState(null);
    const [selectedCameraIds, setSelectedCameraIds] = useState([]);
    const { showToast } = useToast();
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false });

    // Copy Modal
    const [copyingGroup, setCopyingGroup] = useState(null);
    const [sourceCameraId, setSourceCameraId] = useState('');

    useEffect(() => {
        if (token) fetchGroups();
    }, [token]);

    const fetchGroups = async () => {
        try {
            const res = await fetch('/api/groups', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) setGroups(await res.json());
        } catch (err) {
            console.error("Failed to fetch groups", err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateGroup = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: newGroupName })
            });
            if (res.ok) {
                setNewGroupName('');
                setShowCreateModal(false);
                fetchGroups();
                showToast('Group created successfully', 'success');
            } else {
                showToast('Failed to create group', 'error');
            }
        } catch (err) {
            showToast('Error creating group', 'error');
        }
    };

    const handleDeleteGroup = async (id) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Delete Group',
            message: 'Are you sure you want to delete this group? The cameras will not be deleted, only the group association.',
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/groups/${id}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        fetchGroups();
                        showToast('Group deleted', 'success');
                    } else {
                        showToast('Failed to delete group', 'error');
                    }
                } catch (err) {
                    showToast('Error deleting group', 'error');
                }
                setConfirmConfig({ isOpen: false });
            },
            onCancel: () => setConfirmConfig({ isOpen: false })
        });
    };

    const openManageModal = (group) => {
        setManagingGroup(group);
        setSelectedCameraIds(group.cameras.map(c => c.id));
    };

    const saveGroupCameras = async () => {
        try {
            const res = await fetch(`/api/groups/${managingGroup.id}/cameras`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(selectedCameraIds)
            });
            if (res.ok) {
                setManagingGroup(null);
                fetchGroups();
                showToast('Group updated successfully', 'success');
            } else {
                showToast('Failed to update group cameras', 'error');
            }
        } catch (err) {
            showToast('Error updating group', 'error');
        }
    };

    const handleAction = async (groupId, action, sourceId = null) => {
        let message = 'Are you sure? This will update all cameras in the group.';
        let title = 'Group Action';

        if (action === 'enable_motion') {
            title = 'Enable Group Motion';
            message = 'This will enable motion detection and recording for all cameras in this group. Continue?';
        } else if (action === 'disable_motion') {
            title = 'Disable Group Motion';
            message = 'This will disable motion detection and recording for all cameras in this group. Continue?';
        } else if (action === 'copy_settings') {
            title = 'Copy Settings';
            message = 'This will overwrite settings for all cameras in this group with settings from the source camera. Continue?';
        }

        setConfirmConfig({
            isOpen: true,
            title,
            message,
            onConfirm: async () => {
                try {
                    const body = { action };
                    if (sourceId) body.source_camera_id = parseInt(sourceId);

                    const res = await fetch(`/api/groups/${groupId}/action`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify(body)
                    });

                    if (res.ok) {
                        const data = await res.json();
                        showToast(`Action completed. Modified ${data.modified_count} cameras.`, 'success');
                        setCopyingGroup(null);
                        fetchGroups(); // Refresh groups to update UI
                    } else {
                        const err = await res.json();
                        showToast('Action failed: ' + err.detail, 'error');
                    }
                } catch (err) {
                    showToast('Error performing action', 'error');
                }
                setConfirmConfig({ isOpen: false });
            },
            onCancel: () => setConfirmConfig({ isOpen: false })
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold flex items-center gap-2">
                    <Layers className="w-5 h-5" />
                    Camera Groups
                </h3>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center space-x-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    <span>New Group</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groups.map(group => (
                    <div key={group.id} className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-all duration-300 group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                    <Layers className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg">{group.name}</h3>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        {group.cameras.length} cameras
                                    </p>
                                </div>
                            </div>

                            {/* Motion Toggle in Top Right (Matches Camera 'Active' Toggle) */}
                            <div className="flex items-center bg-muted/30 rounded-lg p-1 border border-border" title="Toggle Motion Detection for Group">
                                <div className="mr-2 flex items-center">
                                    {group.cameras.length > 0 && group.cameras.every(c => c.detect_motion_mode === 'Always') ? (
                                        <Play className="w-3 h-3 text-green-500 mr-1" />
                                    ) : (
                                        <Pause className="w-3 h-3 text-muted-foreground mr-1" />
                                    )}
                                    <span className="text-[10px] font-medium text-muted-foreground uppercase">Motion</span>
                                </div>
                                <Toggle
                                    compact={true}
                                    checked={group.cameras.length > 0 && group.cameras.every(c => c.detect_motion_mode === 'Always')}
                                    onChange={(val) => handleAction(group.id, val ? 'enable_motion' : 'disable_motion')}
                                />
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 mb-6 min-h-[40px] content-start">
                            {group.cameras.length === 0 && <span className="text-xs text-muted-foreground italic">No cameras assigned</span>}
                            {group.cameras.slice(0, 5).map(cam => (
                                <span key={cam.id} className="text-xs bg-muted px-2 py-1 rounded-md border border-border flex items-center">
                                    <div className="relative mr-1.5 flex items-center">
                                        <Camera className="w-3 h-3 opacity-50" />
                                        {cam.recording_mode === 'Motion Triggered' && (
                                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-card animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.5)]"></span>
                                        )}
                                        {cam.recording_mode === 'Continuous' && (
                                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full border border-card shadow-[0_0_5px_rgba(34,197,94,0.5)]"></span>
                                        )}
                                    </div>
                                    {cam.name}
                                </span>
                            ))}
                            {group.cameras.length > 5 && <span className="text-xs text-muted-foreground py-1">+{group.cameras.length - 5} more</span>}
                        </div>

                        {/* Actions Footer */}
                        <div className="flex justify-between items-center pt-4 border-t border-border">
                            {/* Left Action: Copy Settings */}
                            <div>
                                {user?.role === 'admin' && (
                                    <button
                                        onClick={() => setCopyingGroup(group)}
                                        className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40"
                                        title="Copy Settings to all cameras in group"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                        <span>Copy Settings</span>
                                    </button>
                                )}
                            </div>

                            {/* Right Actions: Edit/Delete */}
                            <div className="flex space-x-2">
                                <button
                                    onClick={() => openManageModal(group)}
                                    className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                    title="Edit Group"
                                >
                                    <Edit className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => handleDeleteGroup(group.id)}
                                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    title="Delete Group"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))
                }
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <form onSubmit={handleCreateGroup} className="bg-card p-6 rounded-xl w-full max-w-sm border border-border">
                        <h3 className="text-lg font-bold mb-4">Create New Group</h3>
                        <input
                            autoFocus
                            className="w-full px-3 py-2 bg-background border border-input rounded-md mb-4"
                            placeholder="Group Name"
                            value={newGroupName}
                            onChange={e => setNewGroupName(e.target.value)}
                        />
                        <div className="flex justify-end space-x-2">
                            <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-md">Cancel</button>
                            <button type="submit" disabled={!newGroupName} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50">Create</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Manage Cameras Modal */}
            {managingGroup && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-card p-6 rounded-xl w-full max-w-lg border border-border max-h-[80vh] flex flex-col">
                        <h3 className="text-lg font-bold mb-4">Manage Group: {managingGroup.name}</h3>
                        <div className="flex-1 overflow-y-auto min-h-0 space-y-2 mb-4 pr-2">
                            {(() => {
                                const availableCameras = cameras.filter(cam => {
                                    const isInOtherGroup = groups.some(g =>
                                        g.id !== managingGroup.id &&
                                        g.cameras.some(gc => gc.id === cam.id)
                                    );
                                    return !isInOtherGroup;
                                });

                                if (availableCameras.length === 0) {
                                    return (
                                        <div className="flex flex-col items-center justify-center py-8 text-center bg-muted/20 rounded-lg border border-dashed border-border">
                                            <Camera className="w-8 h-8 text-muted-foreground mb-2 opacity-20" />
                                            <p className="text-sm text-muted-foreground">No free cameras available</p>
                                            <p className="text-xs text-muted-foreground/60 mt-1">All cameras are already assigned to other groups.</p>
                                        </div>
                                    );
                                }

                                return availableCameras.map(cam => (
                                    <label key={cam.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                                        <div className="flex items-center space-x-3">
                                            <Camera className="w-4 h-4 text-muted-foreground" />
                                            <span className="font-medium">{cam.name}</span>
                                        </div>
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${selectedCameraIds.includes(cam.id) ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}`}>
                                            {selectedCameraIds.includes(cam.id) && <Check className="w-3 h-3" />}
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={selectedCameraIds.includes(cam.id)}
                                            onChange={() => {
                                                if (selectedCameraIds.includes(cam.id)) {
                                                    setSelectedCameraIds(prev => prev.filter(id => id !== cam.id));
                                                } else {
                                                    setSelectedCameraIds(prev => [...prev, cam.id]);
                                                }
                                            }}
                                        />
                                    </label>
                                ));
                            })()}
                        </div>
                        <div className="flex justify-end space-x-2 pt-4 border-t border-border">
                            <button onClick={() => setManagingGroup(null)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-md">Cancel</button>
                            <button onClick={saveGroupCameras} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md">Save Changes</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Copy Settings Modal */}
            {copyingGroup && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-card p-6 rounded-xl w-full max-w-sm border border-border">
                        <h3 className="text-lg font-bold mb-2">Copy Settings</h3>
                        <p className="text-sm text-muted-foreground mb-4">Select a source camera to copy settings FROM. These settings will be applied to all cameras in <strong>{copyingGroup.name}</strong>.</p>

                        <select
                            className="w-full px-3 py-2 bg-background border border-input rounded-md mb-6"
                            value={sourceCameraId}
                            onChange={e => setSourceCameraId(e.target.value)}
                        >
                            <option value="">-- Select Source Camera --</option>
                            {cameras.filter(c => !copyingGroup.cameras.some(gc => gc.id === c.id)).map(c => (
                                <option key={c.id} value={c.id}>External: {c.name}</option>
                            ))}
                            {/* Also allow copying from within group? Yes */}
                            <option disabled>-- Inside Group --</option>
                            {copyingGroup.cameras.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>

                        <div className="flex justify-end space-x-2">
                            <button onClick={() => setCopyingGroup(null)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-md">Cancel</button>
                            <button
                                onClick={() => handleAction(copyingGroup.id, 'copy_settings', sourceCameraId)}
                                disabled={!sourceCameraId}
                                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50"
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <ConfirmModal {...confirmConfig} />
        </div>
    );
};
