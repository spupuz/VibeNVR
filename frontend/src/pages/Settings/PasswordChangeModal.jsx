import React from 'react';
import { Key, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { InputField } from '../../components/ui/FormControls';

export const PasswordChangeModal = ({
    isOpen,
    onClose,
    pwdTargetUser,
    pwdForm,
    setPwdForm,
    handlePasswordUpdate
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-4 border-b border-border pb-4">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <Key className="w-5 h-5 text-primary" />
                        {pwdTargetUser ? `Change Password: ${pwdTargetUser.username}` : 'Change Password'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handlePasswordUpdate} className="space-y-4">
                    {/* Only show Old Password if changing own password */}
                    {!pwdTargetUser && (
                        <InputField
                            label="Current Password"
                            type="password"
                            value={pwdForm.old_password}
                            onChange={(val) => setPwdForm({ ...pwdForm, old_password: val })}
                            required
                        />
                    )}

                    <InputField
                        label="New Password"
                        type="password"
                        value={pwdForm.new_password}
                        onChange={(val) => setPwdForm({ ...pwdForm, new_password: val })}
                        required
                    />

                    <InputField
                        label="Confirm New Password"
                        type="password"
                        value={pwdForm.confirm_password}
                        onChange={(val) => setPwdForm({ ...pwdForm, confirm_password: val })}
                        required
                    />

                    <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                        >
                            Cancel
                        </Button>
                        <Button type="submit">
                            Update Password
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};
