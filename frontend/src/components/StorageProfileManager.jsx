import React, { useState, useEffect } from 'react';
import { HardDrive, Activity, Plus, Trash2, Edit, Save, X, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Button } from './ui/Button';
import { InputField } from './ui/FormControls';
import { ConfirmModal } from './ui/ConfirmModal';
import { useTranslation } from 'react-i18next';

export const StorageProfileManager = () => {
  const { t } = useTranslation();
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
        max_size_gb: 0, storage_type: "local", sftp_host: "", sftp_port: 22, sftp_username: "", sftp_password: "", sftp_remote_path: ""
    });
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false });
    const [isTesting, setIsTesting] = useState(false);

    const testSftpConnection = async () => {
        setIsTesting(true);
        try {
            const res = await fetch('/api/storage/test-sftp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    sftp_host: newProfile.sftp_host || "",
                    sftp_port: newProfile.sftp_port || 22,
                    sftp_username: newProfile.sftp_username || "",
                    sftp_password: newProfile.sftp_password || "",
                    sftp_remote_path: newProfile.sftp_remote_path || "/",
                    profile_id: editingId
                })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(t("storage.connection_successful", "Connection Successful"), "success");
            } else {
                showToast(data.detail || t("storage.connection_failed", "Connection Failed"), "error");
            }
        } catch (err) {
            showToast(t("storage.connection_failed", "Connection Failed"), "error");
        } finally {
            setIsTesting(false);
        }
    };


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
            if (newProfile.storage_type === "sftp" && !newProfile.path) newProfile.path = "/sftp";
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
                setNewProfile({ name: '', path: '', description: '', max_size_gb: 0, storage_type: "local", sftp_host: "", sftp_port: 22, sftp_username: "", sftp_password: "", sftp_remote_path: "" });
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
            title: t('settings.delete_profile_title', 'Delete Storage Profile'),
            message: t('settings.delete_profile_msg', 'Are you sure you want to delete this profile? Cameras using this profile will revert to the default storage path. Existing recordings will NOT be deleted.'),
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
                        <h4 className="font-semibold text-sm">{t('timeline.custom_storage_profiles', 'Custom Storage Profiles')}</h4>
                        <p className="text-xs text-muted-foreground italic leading-tight break-words">{t('timeline.map_recordings_to_differe', 'Map recordings to different host volumes (e.g., SSD for motion, NAS for long-term storage).')}</p>
                    </div>
                </div>
                <Button 
                    variant={isCreating ? "ghost" : "default"} 
                    size="sm" 
                    onClick={() => {
                        setIsCreating(!isCreating);
                        if (!isCreating) {
                            setEditingId(null);
                            setNewProfile({ name: '', path: '', description: '', max_size_gb: 0, storage_type: "local", sftp_host: "", sftp_port: 22, sftp_username: "", sftp_password: "", sftp_remote_path: "" });
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
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-medium text-foreground">{t("storage.type", "Storage Type")}</label>
                                <select 
                                    className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    value={newProfile.storage_type || 'local'}
                                    onChange={(e) => setNewProfile({...newProfile, storage_type: e.target.value})}
                                >
                                    <option value="local">{t("storage.local", "Local Storage")}</option>
                                    <option value="sftp">{t("storage.sftp", "SFTP Remote Storage")}</option>
                                </select>
                            </div>

                            {newProfile.storage_type === 'sftp' ? (
                                <>
                                    <InputField 
                                        label={t("storage.sftp_host", "SFTP Host")}
                                        value={newProfile.sftp_host}
                                        onChange={(val) => setNewProfile({...newProfile, sftp_host: val})}
                                        placeholder="e.g. 192.168.1.100"
                                    />
                                    <InputField 
                                        label={t("storage.sftp_port", "SFTP Port")}
                                        type="number"
                                        value={newProfile.sftp_port}
                                        onChange={(val) => setNewProfile({...newProfile, sftp_port: parseInt(val) || 22})}
                                        placeholder="22"
                                    />
                                    <InputField 
                                        label={t("storage.sftp_username", "SFTP Username")}
                                        value={newProfile.sftp_username}
                                        onChange={(val) => setNewProfile({...newProfile, sftp_username: val})}
                                    />
                                    <InputField 
                                        label={t("storage.sftp_password", "SFTP Password")}
                                        type="password"
                                        value={newProfile.sftp_password}
                                        onChange={(val) => setNewProfile({...newProfile, sftp_password: val})}
                                        placeholder={t("storage.sftp_password_placeholder", "Leave blank to keep unchanged")}
                                    />
                                    <InputField 
                                        label={t("storage.sftp_remote_path", "Remote Path (Relative or Absolute)")}
                                        value={newProfile.sftp_remote_path}
                                        onChange={(val) => setNewProfile({...newProfile, sftp_remote_path: val})}
                                        placeholder="e.g. /recordings/"
                                    />
                                    {/* Hide absolute path if SFTP */}

                                </>
                            ) : (
                                <InputField 
                                    label="Absolute Path"
                                    value={newProfile.path}
                                    onChange={(val) => setNewProfile({...newProfile, path: val})}
                                    placeholder="e.g. /storage/ssd"
                                    help="Container path. This path must be mounted in docker-compose (e.g., VIBENVR_STORAGE_SSD: /storage/ssd)."
                                    required={newProfile.storage_type !== 'sftp'}
                                />
                            )}
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
                        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border/50">
                            {newProfile.storage_type === 'sftp' && (
                                <Button 
                                    type="button" 
                                    variant="secondary" 
                                    size="sm" 
                                    className="flex items-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20"
                                    onClick={testSftpConnection} 
                                    disabled={isTesting || !newProfile.sftp_host || !newProfile.sftp_username}
                                >
                                    <Activity className="w-4 h-4" />
                                    {isTesting ? t('storage.testing', 'Testing...') : t('storage.test_connection', 'Test Connection & Permissions')}
                                </Button>
                            )}
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
                                <span className="text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
                                    {p.max_size_gb > 0 ? `${p.max_size_gb} GB Max` : t('settings.unlimited', 'Unlimited')}
                                </span>
                            </h5>
                            {p.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.description}</p>}
                        </div>
                        <div className="flex items-center gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity self-end sm:self-auto">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(p)} className="h-10 w-10 text-muted-foreground hover:text-primary" title={t('actions.edit', 'Edit')} aria-label={t('actions.edit', 'Edit')}>
                                <Edit className="w-5 h-5" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} className="h-10 w-10 text-red-400 hover:text-red-500 hover:bg-red-50" title={t('actions.delete', 'Delete')} aria-label={t('actions.delete', 'Delete')}>
                                <Trash2 className="w-5 h-5" />
                            </Button>
                        </div>
                    </div>
                ))}
                
                {profiles.length === 0 && !loading && !isCreating && (
                    <div className="text-center py-8 bg-muted/5 border border-dashed border-border rounded-xl">
                        <Info className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                        <p className="text-sm text-muted-foreground">{t('timeline.no_custom_storage_profile', 'No custom storage profiles configured.')}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">{t('timeline.recordings_will_use_the_d', 'Recordings will use the default path defined in the engine.')}</p>
                    </div>
                )}
            </div>

            <ConfirmModal 
                {...confirmConfig}
            />
        </div>
    );
};
