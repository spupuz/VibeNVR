import React, { useState, useEffect } from 'react';
import { Key, Plus, Trash2, Copy, AlertTriangle, Check } from 'lucide-react';
import { Button } from './ui/Button';
import { CollapsibleSection } from './ui/CollapsibleSection';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ConfirmModal } from './ui/ConfirmModal';
import { useTranslation } from 'react-i18next';

export const ApiTokenManager = ({ isOpen, onToggle }) => {
  const { t } = useTranslation();
    const { token } = useAuth();
    const { showToast } = useToast();
    const [tokens, setTokens] = useState([]);
    const [newTokenName, setNewTokenName] = useState('');
    const [newTokenExpiresIn, setNewTokenExpiresIn] = useState('');
    const [createdToken, setCreatedToken] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, tokenId: null });

    const fetchTokens = async () => {
        try {
            const res = await fetch('/api/v1/api-tokens', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setTokens(await res.json());
            }
        } catch (err) {
            console.error('Failed to fetch tokens', err);
        }
    };

    useEffect(() => {
        if (isOpen) fetchTokens();
    }, [isOpen, token]);

    const handleCreateToken = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/v1/api-tokens', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: newTokenName,
                    expires_in_days: newTokenExpiresIn ? parseInt(newTokenExpiresIn) : null
                })
            });

            if (res.ok) {
                const data = await res.json();
                setCreatedToken(data);
                setNewTokenName('');
                setNewTokenExpiresIn('');
                setIsCreating(false);
                fetchTokens();
                showToast('API Token created successfully', 'success');
            } else {
                showToast('Failed to create token', 'error');
            }
        } catch (err) {
            showToast('Error creating token', 'error');
        }
    };

    const handleDeleteToken = async () => {
        try {
            const res = await fetch(`/api/v1/api-tokens/${confirmDelete.tokenId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                setTokens(tokens.filter(t => t.id !== confirmDelete.tokenId));
                showToast('Token deleted', 'success');
            } else {
                showToast('Failed to delete token', 'error');
            }
        } catch (err) {
            showToast('Error deleting token', 'error');
        } finally {
            setConfirmDelete({ isOpen: false, tokenId: null });
        }
    };

    const copyToClipboard = (text) => {
        // Fallback for non-secure contexts (HTTP)
        const fallbackCopy = (textToCopy) => {
            const textArea = document.createElement("textarea");
            textArea.value = textToCopy;
            textArea.style.position = "fixed";
            textArea.style.left = "-999999px";
            textArea.style.top = "-999999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                showToast('Token copied to clipboard', 'success');
            } catch (err) {
                console.error('Fallback copy failed', err);
                showToast('Failed to copy token', 'error');
            }
            document.body.removeChild(textArea);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => showToast('Token copied to clipboard', 'success'))
                .catch(err => {
                    console.error('Clipboard API failed', err);
                    fallbackCopy(text);
                });
        } else {
            fallbackCopy(text);
        }
    };

    return (
        <CollapsibleSection
            id="api-tokens"
            title={t('settings_apitokensettings.title', 'API Tokens')}
            description={t('settings_apitokensettings.subtitle', 'Manage access tokens for 3rd party integrations (Homepage, etc.)')}
            icon={<Key className="w-6 h-6" />}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 pb-4 border-b border-border">
                <div>
                    <h3 className="font-semibold text-lg">{t('timeline.api_access_tokens', 'API Access Tokens')}</h3>
                    <p className="text-sm text-muted-foreground">{t('timeline.manage_tokens_for_externa', 'Manage tokens for external tools like Homepage')}</p>
                </div>
                {!createdToken && (
                    <Button
                        onClick={() => setIsCreating(!isCreating)}
                        variant={isCreating ? "ghost" : "default"}
                        className="w-full sm:w-auto h-11 sm:h-9 font-bold px-6"
                    >
                        {isCreating ? t('common.cancel', 'Cancel') : t('settings_apitokensettings.generate_new_token', 'Generate New Token')}
                    </Button>
                )}
            </div>

            {createdToken && (
                <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-lg my-4">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-green-500 mt-0.5" />
                        <div className="flex-1">
                            <h4 className="font-medium text-green-700 dark:text-green-400">{t('timeline.token_generated_successfu', 'Token Generated Successfully')}</h4>
                            <p className="text-sm text-green-600 dark:text-green-300 mt-1">
                                {t('settings_apitokensettings.token_generated_warning', 'Please copy this token now. You won\'t be able to see it again!')}
                            </p>
                            <div className="flex items-center gap-2 mt-3 bg-background p-2 rounded border border-border">
                                <code className="flex-1 font-mono text-sm break-all">{createdToken.token}</code>
                                <Button size="sm" variant="ghost" onClick={() => copyToClipboard(createdToken.token)}>
                                    <Copy className="w-4 h-4" />
                                </Button>
                            </div>
                            <Button
                                className="mt-4"
                                size="sm"
                                variant="outline"
                                onClick={() => setCreatedToken(null)}
                            >
                                <Check className="w-4 h-4 mr-2" />
                                {t('settings_apitokensettings.saved_token', 'I have saved the token')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {isCreating && !createdToken && (
                <form onSubmit={handleCreateToken} className="bg-muted/30 p-4 rounded-lg border border-border my-4">
                    <div className="flex flex-col sm:flex-row gap-4 items-end">
                        <div className="w-full sm:flex-1">
                            <label className="text-xs font-medium mb-1 block">{t('timeline.token_name_description', 'Token Name / Description')}</label>
                            <input
                                type="text"
                                className="w-full bg-background border border-input rounded px-3 py-2 text-sm"
                                placeholder="e.g. Homepage Dashboard"
                                value={newTokenName}
                                onChange={e => setNewTokenName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="w-full sm:w-32">
                            <label className="text-xs font-medium mb-1 block">{t('timeline.expires_in_days', 'Expires in (days)')}</label>
                            <input
                                type="number"
                                min="1"
                                className="w-full bg-background border border-input rounded px-3 py-2 text-sm"
                                placeholder="Never"
                                value={newTokenExpiresIn}
                                onChange={e => setNewTokenExpiresIn(e.target.value)}
                            />
                        </div>
                        <Button type="submit" className="w-full sm:w-auto h-11 font-bold px-8">{t('timeline.generate', 'Generate')}</Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3 font-medium opacity-70">{t('timeline.leave_blank_for_a_permane', 'Leave blank for a permanent token. Recommended for automated services.')}</p>
                </form>
            )}

            {/* Desktop Table View (Hidden on Mobile) */}
            <div className="mt-4 border border-border rounded-lg overflow-hidden hidden sm:block">
                <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                        <tr>
                            <th className="p-3 font-medium text-muted-foreground">{t('timeline.name', 'Name')}</th>
                            <th className="p-3 font-medium text-muted-foreground">{t('timeline.created', 'Created')}</th>
                            <th className="p-3 font-medium text-muted-foreground">{t('timeline.expires', 'Expires')}</th>
                            <th className="p-3 font-medium text-muted-foreground">{t('timeline.last_used', 'Last Used')}</th>
                            <th className="p-3 font-medium text-muted-foreground text-right">{t('timeline.actions', 'Actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tokens.map(apiToken => {
                            const isExpired = apiToken.expires_at && new Date(apiToken.expires_at) < new Date();
                            return (
                                <tr key={apiToken.id} className="border-t border-border hover:bg-muted/10">
                                    <td className="p-3 font-medium">
                                        <div className="flex items-center gap-2">
                                            <Key className="w-3 h-3 text-muted-foreground shrink-0" />
                                            <span className="truncate max-w-[200px]" title={apiToken.name}>{apiToken.name}</span>
                                            {isExpired && (
                                                <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-primary/10 text-primary border border-primary/20 rounded-lg shrink-0">
                                                    {t('settings_apitokensettings.expired', 'Expired')}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-3 text-muted-foreground">{new Date(apiToken.created_at).toLocaleDateString()}</td>
                                    <td className={`p-3 ${isExpired ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                                        {apiToken.expires_at ? new Date(apiToken.expires_at).toLocaleDateString() : t('settings_apitokensettings.never', 'Never')}
                                    </td>
                                    <td className="p-3 text-muted-foreground">
                                        <span className="whitespace-nowrap">
                                            {apiToken.last_used_at ? new Date(apiToken.last_used_at).toLocaleDateString() : t('settings_apitokensettings.never', 'Never')}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right">
                                        <button
                                            onClick={() => setConfirmDelete({ isOpen: true, tokenId: apiToken.id })}
                                            className="p-2 hover:bg-red-100 text-red-500 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ml-auto"
                                            title="Revoke Token"
                                            aria-label="Revoke Token"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {tokens.length === 0 && (
                            <tr><td colSpan="5" className="p-4 text-center text-muted-foreground">{t('timeline.no_active_tokens_found', 'No active tokens found')}</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View (Visible on Mobile Only) */}
            <div className="mt-4 space-y-4 sm:hidden">
                {tokens.map(apiToken => {
                    const isExpired = apiToken.expires_at && new Date(apiToken.expires_at) < new Date();
                    return (
                        <div key={apiToken.id} className="bg-card border border-border/70 rounded-xl p-4 shadow-sm">
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <Key className="w-4 h-4 text-primary shrink-0" />
                                        <span className="font-bold text-base break-all">{apiToken.name}</span>
                                    </div>
                                     {isExpired && (
                                        <span className="w-fit px-2 py-0.5 text-xs font-bold uppercase bg-primary/10 text-primary border border-primary/20 rounded-lg">
                                            {t('settings_apitokensettings.expired', 'Expired')}
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => setConfirmDelete({ isOpen: true, tokenId: apiToken.id })}
                                    className="p-3 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors min-w-[44px] min-h-[44px]"
                                    title="Revoke Token"
                                    aria-label="Revoke Token"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>

                             <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/40 mt-1">
                                <div>
                                    <span className="block text-xs uppercase font-bold text-muted-foreground mb-1.5 opacity-70">{t('timeline.created', 'Created')}</span>
                                    <span className="text-sm font-semibold">{new Date(apiToken.created_at).toLocaleDateString()}</span>
                                </div>
                                <div>
                                    <span className="block text-xs uppercase font-bold text-muted-foreground mb-1.5 opacity-70">{t('timeline.expires', 'Expires')}</span>
                                    <span className={`text-sm font-bold ${isExpired ? 'text-primary' : 'text-foreground'}`}>
                                        {apiToken.expires_at ? new Date(apiToken.expires_at).toLocaleDateString() : t('settings_apitokensettings.never', 'Never')}
                                    </span>
                                </div>
                                <div className="col-span-2">
                                    <span className="block text-xs uppercase font-bold text-muted-foreground mb-1.5 opacity-70">{t('timeline.last_used', 'Last Used')}</span>
                                    <span className="text-sm font-semibold">
                                        {apiToken.last_used_at ? new Date(apiToken.last_used_at).toLocaleDateString() : t('settings_apitokensettings.never', 'Never')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {tokens.length === 0 && (
                    <div className="p-8 text-center bg-muted/20 border border-dashed border-border rounded-xl text-muted-foreground">
                        {t('timeline.no_active_tokens_found', 'No active tokens found')}
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={confirmDelete.isOpen}
                title={t('settings_apitokensettings.revoke_title', 'Revoke API Token')}
                message={t('settings_apitokensettings.revoke_message', 'Are you sure you want to delete this token? Any application using it will lose access immediately.')}
                onConfirm={handleDeleteToken}
                onCancel={() => setConfirmDelete({ isOpen: false, tokenId: null })}
                confirmText={t('settings_apitokensettings.revoke', 'Revoke')}
                variant="destructive"
            />
        </CollapsibleSection>
    );
};
