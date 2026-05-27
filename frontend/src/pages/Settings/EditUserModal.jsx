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
        <div className="fixed inset-0 bg-black/50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-4 border-b border-border pb-4">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <User className="w-5 h-5 text-primary" />
                        {t('settings.edit_user', 'Edit User')}: {editingUser.username}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleUpdateUser} className="space-y-4">
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
                                        onClick={() => setEditingUser({ ...editingUser, restrict_camera_access: !editingUser.restrict_camera_access })}
                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${editingUser.restrict_camera_access ? 'bg-primary' : 'bg-muted'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editingUser.restrict_camera_access ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                    <span className="text-xs text-muted-foreground">{t('timeline.if_enabled_the_viewer_can', 'If enabled, the viewer can only access selected cameras/groups.')}</span>
                                </div>
                            </div>
                            
                            {editingUser.restrict_camera_access && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold mb-2">{t('timeline.allowed_cameras', 'Allowed Cameras')}</label>
                                        <div className="bg-background rounded-lg border border-border p-2 max-h-40 overflow-y-auto space-y-1">
                                            {cameras.map(cam => (
                                                <label key={cam.id} className="flex items-center gap-2 p-1 hover:bg-muted rounded cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={editingUser.allowed_camera_ids?.includes(cam.id)}
                                                        onChange={(e) => {
                                                            const ids = editingUser.allowed_camera_ids || [];
                                                            if (e.target.checked) setEditingUser({ ...editingUser, allowed_camera_ids: [...ids, cam.id] });
                                                            else setEditingUser({ ...editingUser, allowed_camera_ids: ids.filter(id => id !== cam.id) });
                                                        }}
                                                        className="rounded text-primary focus:ring-primary bg-muted border-border"
                                                    />
                                                    <span className="text-sm">{cam.name}</span>
                                                </label>
                                            ))}
                                            {cameras.length === 0 && <p className="text-xs text-muted-foreground p-1">{t('timeline.no_cameras_available', 'No cameras available')}</p>}
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-bold mb-2">{t('timeline.allowed_groups', 'Allowed Groups')}</label>
                                        <div className="bg-background rounded-lg border border-border p-2 max-h-40 overflow-y-auto space-y-1">
                                            {groups.map(group => (
                                                <label key={group.id} className="flex items-center gap-2 p-1 hover:bg-muted rounded cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={editingUser.allowed_group_ids?.includes(group.id)}
                                                        onChange={(e) => {
                                                            const ids = editingUser.allowed_group_ids || [];
                                                            if (e.target.checked) setEditingUser({ ...editingUser, allowed_group_ids: [...ids, group.id] });
                                                            else setEditingUser({ ...editingUser, allowed_group_ids: ids.filter(id => id !== group.id) });
                                                        }}
                                                        className="rounded text-primary focus:ring-primary bg-muted border-border"
                                                    />
                                                    <span className="text-sm">{group.name}</span>
                                                </label>
                                            ))}
                                            {groups.length === 0 && <p className="text-xs text-muted-foreground p-1">{t('timeline.no_groups_available', 'No groups available')}</p>}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
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
