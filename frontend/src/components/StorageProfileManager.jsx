import React, { useState, useEffect } from 'react';
import { HardDrive, Plus, Trash2, Edit, Save, X, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Button } from './ui/Button';
import { InputField } from './ui/FormControls';
import { ConfirmModal } from './ui/ConfirmModal';

export const StorageProfileManager = () => {
    const { token } = useAuth();
    const { showToast } = useToast();
    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [newProfile, setNewProfile] = useState({
        name: '',
        path: '',
        description: '',
        max_size_gb: 0
    });
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false });

    useEffect(() => {
        fetchProfiles();
    }, [token]);

    const fetchProfiles = async () => {
        try {
            const res = await fetch('/api/storage/profiles', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setProfiles(await res.json());
            }
        } catch (err) {
            console.error('Failed to fetch profiles', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            const url = editingId 
                ? `/api/storage/profiles/${editingId}`
                : '/api/storage/profiles';
            const method = editingId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(newProfile)
            });

            if (res.ok) {
                showToast(`Profile ${editingId ? 'updated' : 'created'} successfully`, 'success');
                setIsCreating(false);
                setEditingId(null);
                setNewProfile({ name: '', path: '', description: '', max_size_gb: 0 });
                fetchProfiles();
            } else {
                const data = await res.json();
                showToast('Error: ' + (data.detail?.[0]?.msg || data.detail || 'Unknown error'), 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    };

    const handleDelete = (id) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Delete Storage Profile',
            message: 'Are you sure you want to delete this profile? Cameras using this profile will revert to the default storage path.',
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/storage/profiles/${id}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        showToast('Profile deleted', 'success');
                        fetchProfiles();
                    }
                } catch (err) {
                    showToast('Delete failed', 'error');
                }
                setConfirmConfig({ isOpen: false });
            },
            onCancel: () => setConfirmConfig({ isOpen: false })
        });
    };

    const handleEdit = (profile) => {
        setNewProfile(profile);
        setEditingId(profile.id);
        setIsCreating(true);
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-primary/5 p-4 rounded-xl border border-primary/10 gap-4">
                <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0 mt-0.5">
                        <HardDrive className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-sm">Custom Storage Profiles</h4>
                        <p className="text-xs text-muted-foreground italic leading-tight break-words">Map recordings to different host volumes (e.g., SSD for motion, NAS for long-term storage).</p>
                    </div>
                </div>
                <Button 
                    variant={isCreating ? "ghost" : "default"} 
                    size="sm" 
                    onClick={() => {
                        setIsCreating(!isCreating);
                        if (!isCreating) {
                            setEditingId(null);
                            setNewProfile({ name: '', path: '', description: '', max_size_gb: 0 });
                        }
                    }}
                    className="flex items-center gap-1.5 w-full md:w-auto justify-center md:justify-start shrink-0"
                >
                    {isCreating ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {isCreating ? 'Cancel' : 'Add Profile'}
                </Button>
            </div>

            {isCreating && (
                <div className="p-4 bg-muted/20 border border-border/50 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <InputField 
                                label="Profile Name"
                                value={newProfile.name}
                                onChange={(val) => setNewProfile({...newProfile, name: val})}
                                placeholder="e.g. SSD Recordings"
                                required
                            />
                            <InputField 
                                label="Absolute Path"
                                value={newProfile.path}
                                onChange={(val) => setNewProfile({...newProfile, path: val})}
                                placeholder="e.g. /storage/ssd"
                                help="Container path. This path must be mounted in docker-compose (e.g., VIBENVR_STORAGE_SSD: /storage/ssd)."
                                required
                            />
                            <InputField 
                                label="Description"
                                value={newProfile.description}
                                onChange={(val) => setNewProfile({...newProfile, description: val})}
                                placeholder="Optional description"
                            />
                            <InputField 
                                label="Max Size (GB)"
                                type="number"
                                value={newProfile.max_size_gb}
                                onChange={(val) => setNewProfile({...newProfile, max_size_gb: parseFloat(val) || 0})}
                                help="Reserved for future use (quota per profile). Set to 0 for unlimited."
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="submit" size="sm" className="flex items-center gap-1.5">
                                <Save className="w-4 h-4" />
                                {editingId ? 'Update Profile' : 'Create Profile'}
                            </Button>
                        </div>
                    </form>
                </div>
            )}

            <div className="space-y-2">
                {profiles.map(p => (
                    <div key={p.id} className="p-4 bg-background border border-border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between group transition-all hover:border-primary/30 hover:shadow-sm gap-3">
                        <div className="min-w-0">
                            <h5 className="font-semibold text-sm flex flex-wrap items-center gap-2">
                                {p.name}
                                <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground border border-border truncate max-w-full">
                                    {p.path}
                                </span>
                            </h5>
                            {p.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.description}</p>}
                        </div>
                        <div className="flex items-center gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity self-end sm:self-auto">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(p)} className="h-8 w-8 p-0 text-muted-foreground hover:text-primary">
                                <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)} className="h-8 w-8 p-0 text-red-400 hover:text-red-500 hover:bg-red-50">
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                ))}
                
                {profiles.length === 0 && !loading && !isCreating && (
                    <div className="text-center py-8 bg-muted/5 border border-dashed border-border rounded-xl">
                        <Info className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                        <p className="text-sm text-muted-foreground">No custom storage profiles configured.</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">Recordings will use the default path defined in the engine.</p>
                    </div>
                )}
            </div>

            <ConfirmModal 
                {...confirmConfig}
            />
        </div>
    );
};
