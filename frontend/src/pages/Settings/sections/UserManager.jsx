import React from 'react';
import { Users, Plus, X, Key, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { Avatar } from '../../../components/ui/Avatar';
import { InputField, SelectField } from '../../../components/ui/FormControls';

export const UserManager = ({
    users,
    newUser,
    setNewUser,
    isCreatingUser,
    setIsCreatingUser,
    handleCreateUser,
    openPasswordModal,
    setConfirmConfig,
    showToast,
    fetchUsers,
    currentUser,
    token,
    isOpen,
    onToggle
}) => {
    return (
        <CollapsibleSection
            id="users"
            title="User Management"
            description="Manage system access and roles"
            icon={<Users className="w-6 h-6" />}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <div className="flex justify-end mb-4 h-11">
                <Button
                    variant={isCreatingUser ? "ghost" : "default"}
                    onClick={() => setIsCreatingUser(!isCreatingUser)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 h-full px-6 font-bold"
                >
                    {isCreatingUser ? <X className="w-5 h-5 shrink-0" /> : <Plus className="w-5 h-5 shrink-0" />}
                    {isCreatingUser ? 'Cancel' : 'Add User'}
                </Button>
            </div>

            {isCreatingUser && (
                <form onSubmit={handleCreateUser} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <InputField
                            label="Username"
                            value={newUser.username}
                            onChange={(val) => setNewUser({ ...newUser, username: val })}
                            placeholder="johndoe"
                            required
                        />
                        <InputField
                            label="Email"
                            type="email"
                            value={newUser.email}
                            onChange={(val) => setNewUser({ ...newUser, email: val })}
                            placeholder="john@example.com"
                        />
                        <InputField
                            label="Password"
                            type="password"
                            value={newUser.password}
                            onChange={(val) => setNewUser({ ...newUser, password: val })}
                            placeholder="••••••••"
                            required
                        />
                        <SelectField
                            label="Role"
                            value={newUser.role}
                            onChange={(val) => setNewUser({ ...newUser, role: val })}
                            options={[
                                { value: 'viewer', label: 'Viewer (Read Only)' },
                                { value: 'admin', label: 'Admin (Full Access)' }
                            ]}
                        />
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit" className="w-full sm:w-auto h-11 px-8 font-bold">Create User</Button>
                    </div>
                </form>
            )}

            {/* Mobile: User Cards (Zero Horizontal Scroll) */}
            <div className="grid grid-cols-1 gap-3 sm:hidden mt-4">
                {users.map(u => (
                    <div key={u.id} className="p-4 bg-muted/10 border border-border/50 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Avatar user={u} size="xs" />
                                <div className="min-w-0">
                                    <p className="font-bold text-sm truncate">{u.username}</p>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wider ${u.role === 'admin' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-muted text-muted-foreground border border-border/50'}`}>
                                        {u.role}
                                    </span>
                                </div>
                            </div>
                            {u.id === currentUser.id && (
                                <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-lg font-bold uppercase tracking-tight">You</span>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 pt-3 border-t border-border/30">
                            <button
                                onClick={() => openPasswordModal(u)}
                                className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors flex items-center justify-center min-h-[44px] min-w-[44px]"
                                title="Change Password"
                            >
                                <Key className="w-5 h-5" />
                            </button>
                            {u.id !== currentUser.id && (
                                <button
                                    onClick={() => {
                                        setConfirmConfig({
                                            isOpen: true,
                                            title: 'Delete User',
                                            message: `Are you sure you want to delete user "${u.username}"? This action cannot be undone.`,
                                            onConfirm: async () => {
                                                try {
                                                    const res = await fetch(`/api/users/${u.id}`, {
                                                        method: 'DELETE',
                                                        headers: { Authorization: `Bearer ${token}` }
                                                    });
                                                    if (res.ok) {
                                                        showToast('User deleted successfully', 'success');
                                                        fetchUsers();
                                                    } else {
                                                        const data = await res.json();
                                                        showToast('Failed: ' + data.detail, 'error');
                                                    }
                                                } catch (err) {
                                                    showToast('Error: ' + err.message, 'error');
                                                }
                                                setConfirmConfig({ isOpen: false });
                                            },
                                            onCancel: () => setConfirmConfig({ isOpen: false })
                                        });
                                    }}
                                    className="p-2 hover:bg-red-100 text-red-500 rounded-lg transition-colors flex items-center justify-center min-h-[44px] min-w-[44px]"
                                    title="Delete User"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="hidden sm:block w-full overflow-x-auto mt-4 rounded-lg border border-border">
                <div className="min-w-[600px]">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-left">
                            <tr>
                                <th className="p-3 font-medium text-muted-foreground">Username</th>
                                <th className="p-3 font-medium text-muted-foreground">Role</th>
                                <th className="p-3 font-medium text-muted-foreground hidden sm:table-cell">Created</th>
                                <th className="p-3 font-medium text-muted-foreground text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id} className="border-t border-border hover:bg-muted/10">
                                    <td className="p-3 font-medium flex items-center gap-3 overflow-hidden">
                                        <Avatar user={u} size="xs" />
                                        <span className="truncate">{u.username}</span>
                                        {u.id === currentUser.id && <span className="text-[10px] bg-primary/20 text-primary px-1.5 shrink-0 rounded">You</span>}
                                    </td>
                                    <td className="p-3">
                                        <span className={'inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ' +
                                            (u.role === 'admin' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-muted text-muted-foreground border border-border/50')
                                        }>
                                            {u.role}
                                        </span>
                                    </td>
                                    <td className="p-3 text-muted-foreground hidden sm:table-cell">
                                        {new Date(u.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex justify-end gap-2 pr-1">
                                            <button
                                                onClick={() => openPasswordModal(u)}
                                                className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                                                title="Change Password"
                                            >
                                                <Key className="w-5 h-5" />
                                            </button>
                                            {u.id !== currentUser.id && (
                                                <button
                                                    onClick={() => {
                                                        setConfirmConfig({
                                                            isOpen: true,
                                                            title: 'Delete User',
                                                            message: `Are you sure you want to delete user "${u.username}"? This action cannot be undone.`,
                                                            onConfirm: async () => {
                                                                try {
                                                                    const res = await fetch(`/api/users/${u.id}`, {
                                                                        method: 'DELETE',
                                                                        headers: { Authorization: `Bearer ${token}` }
                                                                    });
                                                                    if (res.ok) {
                                                                        showToast('User deleted successfully', 'success');
                                                                        fetchUsers();
                                                                    } else {
                                                                        const data = await res.json();
                                                                        showToast('Failed: ' + data.detail, 'error');
                                                                    }
                                                                } catch (err) {
                                                                    showToast('Error: ' + err.message, 'error');
                                                                }
                                                                setConfirmConfig({ isOpen: false });
                                                            },
                                                            onCancel: () => setConfirmConfig({ isOpen: false })
                                                        });
                                                    }}
                                                    className="p-2 hover:bg-red-100 text-red-500 rounded-lg transition-colors"
                                                    title="Delete User"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr><td colSpan="4" className="p-4 text-center text-muted-foreground">No users found</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </CollapsibleSection>
    );
};
