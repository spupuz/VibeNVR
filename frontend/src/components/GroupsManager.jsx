import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Camera, Settings, Copy, Play, Pause, Layers, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const GroupsManager = ({ cameras }) => {
    const { token } = useAuth();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');

    // Manage Modal
    const [managingGroup, setManagingGroup] = useState(null);
    const [selectedCameraIds, setSelectedCameraIds] = useState([]);

    // Copy Modal
    const [copyingGroup, setCopyingGroup] = useState(null);
    const [sourceCameraId, setSourceCameraId] = useState('');

    useEffect(() => {
        if (token) fetchGroups();
    }, [token]);

    const fetchGroups = async () => {
        try {
            const res = await fetch('http://localhost:5000/groups/', {
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
            const res = await fetch('http://localhost:5000/groups/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: newGroupName })
            });
            if (res.ok) {
                setNewGroupName('');
                setShowCreateModal(false);
                fetchGroups();
            } else {
                alert('Failed to create group');
            }
        } catch (err) {
            alert('Error creating group');
        }
    };

    const handleDeleteGroup = async (id) => {
        if (!window.confirm("Delete this group?")) return;
        try {
            await fetch(`http://localhost:5000/groups/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchGroups();
        } catch (err) {
            alert('Error deleting group');
        }
    };

    const openManageModal = (group) => {
        setManagingGroup(group);
        setSelectedCameraIds(group.cameras.map(c => c.id));
    };

    const saveGroupCameras = async () => {
        try {
            const res = await fetch(`http://localhost:5000/groups/${managingGroup.id}/cameras`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(selectedCameraIds)
            });
            if (res.ok) {
                setManagingGroup(null);
                fetchGroups();
            } else {
                alert('Failed to update group cameras');
            }
        } catch (err) {
            alert('Error updating group');
        }
    };

    const handleAction = async (groupId, action, sourceId = null) => {
        if (!window.confirm("Are you sure? This will update all cameras in the group.")) return;
        try {
            const body = { action };
            if (sourceId) body.source_camera_id = parseInt(sourceId);

            const res = await fetch(`http://localhost:5000/groups/${groupId}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                const data = await res.json();
                alert(`Action completed. Modified ${data.modified_count} cameras.`);
                setCopyingGroup(null);
            } else {
                const err = await res.json();
                alert('Action failed: ' + err.detail);
            }
        } catch (err) {
            alert('Error performing action');
        }
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
                    <div key={group.id} className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-all">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h4 className="font-bold text-lg">{group.name}</h4>
                                <p className="text-sm text-muted-foreground">{group.cameras.length} cameras</p>
                            </div>
                            <div className="flex space-x-1">
                                <button onClick={() => openManageModal(group)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg">
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeleteGroup(group.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 mb-4">
                            {group.cameras.slice(0, 5).map(cam => (
                                <span key={cam.id} className="text-xs bg-muted px-2 py-1 rounded-md border border-border">
                                    {cam.name}
                                </span>
                            ))}
                            {group.cameras.length > 5 && <span className="text-xs text-muted-foreground">+{group.cameras.length - 5} more</span>}
                        </div>

                        {/* Actions */}
                        <div className="pt-4 border-t border-border grid grid-cols-3 gap-2">
                            <button
                                onClick={() => handleAction(group.id, 'enable_motion')}
                                className="flex flex-col items-center justify-center p-2 text-xs bg-green-500/10 text-green-600 hover:bg-green-500/20 rounded-lg transition-colors border border-green-500/20"
                                title="Enable Motion Detection"
                            >
                                <Play className="w-4 h-4 mb-1" />
                                Enable Motion
                            </button>
                            <button
                                onClick={() => handleAction(group.id, 'disable_motion')}
                                className="flex flex-col items-center justify-center p-2 text-xs bg-red-500/10 text-red-600 hover:bg-red-500/20 rounded-lg transition-colors border border-red-500/20"
                                title="Disable Motion Detection"
                            >
                                <Pause className="w-4 h-4 mb-1" />
                                Disable Motion
                            </button>
                            <button
                                onClick={() => setCopyingGroup(group)}
                                className="flex flex-col items-center justify-center p-2 text-xs bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 rounded-lg transition-colors border border-blue-500/20"
                                title="Copy Settings"
                            >
                                <Copy className="w-4 h-4 mb-1" />
                                Copy Settings
                            </button>
                        </div>
                    </div>
                ))}
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
                            {cameras.map(cam => (
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
                            ))}
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
        </div>
    );
};
