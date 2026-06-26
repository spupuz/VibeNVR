import React from 'react';
import { User, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { InputField, SelectField } from '../../components/ui/FormControls';
import { useTranslation } from 'react-i18next';

export const EditUserModal = ({
    isOpen,
    onClose,
    editingUser,
    setEditingUser,
    handleUpdateUser,
    cameras = [],
    groups = []
}) => {
    const { t } = useTranslation();
    if (!isOpen || !editingUser) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 pt-20 sm:pt-4 backdrop-blur-sm">
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full flex flex-col max-h-full overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Sticky Header */}
                <div className="flex justify-between items-center p-4 sm:p-6 border-b border-border shrink-0 bg-card z-10">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <User className="w-5 h-5 text-primary" />
                        {t('settings.edit_user', 'Edit User')}: {editingUser.username}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={t('common.close', 'Close')}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleUpdateUser} className="flex flex-col flex-1 overflow-hidden">
                    {/* Scrollable Form Body */}
                    <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <InputField
                                label={t('settings.username', 'Username')}
                                value={editingUser.username || ''}
                                onChange={(val) => setEditingUser({ ...editingUser, username: val })}
                                required
                            />
                            <InputField
                                label={t('settings.email', 'Email')}
                                type="email"
                                value={editingUser.email || ''}
                                onChange={(val) => setEditingUser({ ...editingUser, email: val })}
                            />
                            <SelectField
                                label={t('settings.role', 'Role')}
                                value={editingUser.role || 'viewer'}
                                onChange={(val) => setEditingUser({ ...editingUser, role: val })}
                                options={[
                                    { value: 'viewer', label: t('settings.viewer_read_only', 'Viewer (Read Only)') },
                                    { value: 'admin', label: t('settings.admin_full_access', 'Admin (Full Access)') }
                                ]}
                            />
                        </div>
                        
                        {editingUser.role === 'viewer' && (
                            <div className="space-y-4 pt-4 border-t border-border/50">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                    <label className="text-sm font-bold sm:w-48">{t('timeline.restrict_camera_access', 'Restrict Camera Access')}</label>
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={editingUser.restrict_camera_access || false}
                                            aria-label={t('timeline.restrict_camera_access', 'Restrict Camera Access')}
                                            onClick={() => setEditingUser({ ...editingUser, restrict_camera_access: !editingUser.restrict_camera_access })}
                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${editingUser.restrict_camera_access ? 'bg-primary' : 'bg-muted'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editingUser.restrict_camera_access ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                        <span className="text-xs text-muted-foreground">{t('timeline.if_enabled_the_viewer_can', 'If enabled, the viewer can only access selected cameras/groups.')}</span>
                                    </div>
                                </div>
                                
                                {editingUser.restrict_camera_access && (
                                    <div className="grid grid-cols-1 gap-6">
                                        <div>
                                            <label className="block text-sm font-bold mb-2">{t('timeline.camera_permissions', 'Camera Permissions')}</label>
                                            <div className="bg-background rounded-lg border border-border p-2 max-h-60 overflow-y-auto space-y-2">
                                                {cameras.length === 0 && <p className="text-xs text-muted-foreground p-1">{t('timeline.no_cameras_available', 'No cameras available')}</p>}
                                                {cameras.map(cam => {
                                                    const accesses = editingUser.camera_accesses || [];
                                                    const access = accesses.find(a => a.id === cam.id) || { id: cam.id, can_view: false, can_replay: false, can_control: false };
                                                    const hasAny = access.can_view || access.can_replay || access.can_control;
                                                    
                                                    const togglePermission = (perm) => {
                                                        const newAccesses = [...accesses];
                                                        const idx = newAccesses.findIndex(a => a.id === cam.id);
                                                        if (idx >= 0) {
                                                            newAccesses[idx] = { ...newAccesses[idx], [perm]: !newAccesses[idx][perm] };
                                                        } else {
                                                            newAccesses.push({ id: cam.id, can_view: false, can_replay: false, can_control: false, [perm]: true });
                                                        }
                                                        setEditingUser({ ...editingUser, camera_accesses: newAccesses });
                                                    };

                                                    return (
                                                        <div key={cam.id} className={`flex flex-col gap-2 p-2 hover:bg-muted/50 rounded border transition-colors ${hasAny ? 'border-primary/50 bg-primary/5' : 'border-border/50'}`}>
                                                            <div className="font-medium text-sm">{cam.name}</div>
                                                            <div className="flex flex-wrap gap-4 ml-2">
                                                                <label className="flex items-center gap-1.5 cursor-pointer">
                                                                    <input type="checkbox" checked={access.can_view} onChange={() => togglePermission('can_view')} className="rounded text-primary focus:ring-primary bg-muted border-border" />
                                                                    <span className="text-xs font-semibold tracking-wider">VIEW</span>
                                                                </label>
                                                                <label className="flex items-center gap-1.5 cursor-pointer">
                                                                    <input type="checkbox" checked={access.can_replay} onChange={() => togglePermission('can_replay')} className="rounded text-blue-500 focus:ring-blue-500 bg-muted border-border" />
                                                                    <span className="text-xs font-semibold tracking-wider">REPLAY</span>
                                                                </label>
                                                                <label className="flex items-center gap-1.5 cursor-pointer">
                                                                    <input type="checkbox" checked={access.can_control} onChange={() => togglePermission('can_control')} className="rounded text-green-500 focus:ring-green-500 bg-muted border-border" />
                                                                    <span className="text-xs font-semibold tracking-wider">CONTROL (PTZ)</span>
                                                                </label>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-bold mb-2">{t('timeline.group_permissions', 'Group Permissions')}</label>
                                            <div className="bg-background rounded-lg border border-border p-2 max-h-60 overflow-y-auto space-y-2">
                                                {groups.length === 0 && <p className="text-xs text-muted-foreground p-1">{t('timeline.no_groups_available', 'No groups available')}</p>}
                                                {groups.map(group => {
                                                    const accesses = editingUser.group_accesses || [];
                                                    const access = accesses.find(a => a.id === group.id) || { id: group.id, can_view: false, can_replay: false, can_control: false };
                                                    const hasAny = access.can_view || access.can_replay || access.can_control;
                                                    
                                                    const togglePermission = (perm) => {
                                                        const newAccesses = [...accesses];
                                                        const idx = newAccesses.findIndex(a => a.id === group.id);
                                                        if (idx >= 0) {
                                                            newAccesses[idx] = { ...newAccesses[idx], [perm]: !newAccesses[idx][perm] };
                                                        } else {
                                                            newAccesses.push({ id: group.id, can_view: false, can_replay: false, can_control: false, [perm]: true });
                                                        }
                                                        setEditingUser({ ...editingUser, group_accesses: newAccesses });
                                                    };

                                                    return (
                                                        <div key={group.id} className={`flex flex-col gap-2 p-2 hover:bg-muted/50 rounded border transition-colors ${hasAny ? 'border-primary/50 bg-primary/5' : 'border-border/50'}`}>
                                                            <div className="font-medium text-sm">{group.name}</div>
                                                            <div className="flex flex-wrap gap-4 ml-2">
                                                                <label className="flex items-center gap-1.5 cursor-pointer">
                                                                    <input type="checkbox" checked={access.can_view} onChange={() => togglePermission('can_view')} className="rounded text-primary focus:ring-primary bg-muted border-border" />
                                                                    <span className="text-xs font-semibold tracking-wider">VIEW</span>
                                                                </label>
                                                                <label className="flex items-center gap-1.5 cursor-pointer">
                                                                    <input type="checkbox" checked={access.can_replay} onChange={() => togglePermission('can_replay')} className="rounded text-blue-500 focus:ring-blue-500 bg-muted border-border" />
                                                                    <span className="text-xs font-semibold tracking-wider">REPLAY</span>
                                                                </label>
                                                                <label className="flex items-center gap-1.5 cursor-pointer">
                                                                    <input type="checkbox" checked={access.can_control} onChange={() => togglePermission('can_control')} className="rounded text-green-500 focus:ring-green-500 bg-muted border-border" />
                                                                    <span className="text-xs font-semibold tracking-wider">CONTROL (PTZ)</span>
                                                                </label>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Sticky Footer */}
                    <div className="p-4 sm:p-6 border-t border-border shrink-0 flex justify-end gap-3 bg-card z-10">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                        >
                            {t('actions.cancel', 'Cancel')}
                        </Button>
                        <Button type="submit">
                            {t('actions.save_changes', 'Save Changes')}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};
