import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Network, Plus, Loader2, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useFederation } from '../../contexts/FederationContext';

export const StepFederation = ({ onNodeAdded }) => {
    const { t } = useTranslation();
    const { token } = useAuth();
    const { showToast } = useToast();
    const { nodes, refreshNodes } = useFederation();

    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [added, setAdded] = useState(false);

    const handleAddNode = async () => {
        if (!name.trim() || !url.trim() || !apiKey.trim()) {
            showToast(t('wizard.federation.fill_required', 'Please fill in node name, URL, and API Key'), 'error');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/federation/nodes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                credentials: 'include',
                body: JSON.stringify({
                    name: name.trim(),
                    url: url.trim().replace(/\/+$/, ''),
                    api_key: apiKey.trim()
                })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to pair node');
            }
            setAdded(true);
            if (refreshNodes) refreshNodes();
            onNodeAdded();
            showToast(t('wizard.federation.added_success', 'Federation node paired!'), 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-lg font-semibold mb-1">{t('wizard.federation.title', 'Multi-Node Federation (Optional)')}</h3>
                <p className="text-sm text-muted-foreground">
                    {t('wizard.federation.subtitle', 'Connect a remote VibeNVR instance to manage it from this Master Node.')}
                </p>
            </div>

            {nodes && nodes.length > 0 && (
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                    {nodes.map(node => (
                        <div key={node.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20 text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                                <Network className="w-4 h-4 text-primary shrink-0" />
                                <div className="min-w-0">
                                    <p className="font-medium truncate">{node.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{node.url}</p>
                                </div>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${node.status === 'online' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}`}>
                                {node.status || 'paired'}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <div className="space-y-3">
                <div className="space-y-1">
                    <label className="text-sm font-medium">{t('wizard.federation.node_name', 'Node Name')}</label>
                    <input
                        type="text"
                        placeholder="e.g. Garage NVR"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-sm font-medium">{t('wizard.federation.node_url', 'Node URL')}</label>
                    <input
                        type="text"
                        placeholder="http://192.168.1.200:8080"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-sm font-medium">{t('wizard.federation.api_key', 'Remote X-API-Key')}</label>
                    <input
                        type="password"
                        placeholder="••••••••••••"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
            </div>

            <div className="flex justify-end pt-2">
                <button
                    type="button"
                    disabled={saving || added}
                    onClick={handleAddNode}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : added ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {added ? t('wizard.federation.paired', 'Paired') : t('wizard.federation.pair_btn', 'Pair Node')}
                </button>
            </div>
        </div>
    );
};
