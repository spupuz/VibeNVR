import React, { useState, useEffect } from 'react';
import { Network, Plus, Trash2, Edit, Save, X, Server, Key, Link as LinkIcon, RefreshCw, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../contexts/AuthContext';
import { useFederation } from '../../../contexts/FederationContext';
import { useToast } from '../../../contexts/ToastContext';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';

export const FederationSettings = ({ isOpen, onToggle }) => {
    const { t } = useTranslation();
    const { token } = useAuth();
    const { activeNode } = useFederation();
    const getApiBase = () => activeNode ? `/api/federation/proxy/${activeNode}/api` : `/api`;
    const { showToast } = useToast();
    const [nodes, setNodes] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [testingId, setTestingId] = useState(null);
    
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ name: '', url: '', api_token: '' });

    const fetchNodes = async () => {
        setIsLoading(true);
        try {
            // We hit the backend directly, ignoring the proxy, so we fetch the physical local DB
            const res = await fetch(`${getApiBase()}/federation/nodes`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setNodes(data);
            }
        } catch (err) {
            console.error(err);
            showToast(t('common.error_occurred', 'An error occurred'), 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchNodes();
        }
    }, [token, isOpen]);

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            const url = editingId ? `${getApiBase()}/federation/nodes/${editingId}` : `${getApiBase()}/federation/nodes`;
            const method = editingId ? 'PUT' : 'POST';
            
            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });
            
            if (res.ok) {
                showToast(t('common.saved_successfully', 'Saved successfully'), 'success');
                setIsEditing(false);
                setEditingId(null);
                setFormData({ name: '', url: '', api_token: '' });
                fetchNodes();
            } else {
                const err = await res.json();
                showToast(err.detail || t('common.error_occurred', 'An error occurred'), 'error');
            }
        } catch (err) {
            showToast(t('common.error_occurred', 'An error occurred'), 'error');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm(t('common.confirm_delete', 'Are you sure you want to delete this item?'))) return;
        
        try {
            const res = await fetch(`${getApiBase()}/federation/nodes/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                showToast(t('common.deleted_successfully', 'Deleted successfully'), 'success');
                fetchNodes();
            }
        } catch (err) {
            showToast(t('common.error_occurred', 'An error occurred'), 'error');
        }
    };

    const startEdit = (node = null) => {
        if (node) {
            setFormData({ name: node.name, url: node.url, api_token: node.api_token });
            setEditingId(node.id);
        } else {
            setFormData({ name: '', url: '', api_token: '' });
            setEditingId(null);
        }
        setIsEditing(true);
    };

    const handleTestConnection = async (node) => {
        setTestingId(node.id);
        try {
            const res = await fetch(`${getApiBase()}/federation/proxy/${node.id}/api/stats`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                showToast(t('federation.test_success', 'Connection successful!'), 'success');
            } else {
                showToast(t('federation.test_failed', 'Connection failed or unauthorized.'), 'error');
            }
        } catch (err) {
            showToast(t('federation.test_error', 'Network error trying to reach node.'), 'error');
        } finally {
            setTestingId(null);
        }
    };

    return (
        <CollapsibleSection
            title={t('settings.federation', 'Multi-Site Federation')}
            icon={<Network className="w-6 h-6" />}
            isOpen={isOpen}
            onToggle={() => onToggle('federation')}
            description={t('settings.federation_desc', 'Connect and manage remote VibeNVR instances from this Master node.')}
        >
            <div className="space-y-6">
                {!isEditing ? (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-medium text-foreground">{t('federation.remote_nodes', 'Remote Nodes')}</h3>
                            <button
                                onClick={() => startEdit()}
                                className="flex items-center space-x-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                <span>{t('common.add_new', 'Add New')}</span>
                            </button>
                        </div>
                        
                        {isLoading ? (
                            <div className="flex justify-center p-8"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                        ) : nodes.length === 0 ? (
                            <div className="text-center p-8 bg-muted/20 rounded-lg border border-dashed border-border">
                                <Network className="w-8 h-8 mx-auto text-muted-foreground mb-3 opacity-50" />
                                <p className="text-sm text-muted-foreground">{t('federation.no_nodes', 'No federated nodes configured.')}</p>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {nodes.map(node => (
                                    <div key={node.id} className="flex items-center justify-between p-4 rounded-lg bg-card border border-border">
                                        <div className="flex items-center space-x-4">
                                            <div className={`p-2 rounded-lg ${node.status === 'online' ? 'bg-primary/10 text-primary' : 'bg-red-500/10 text-red-500'}`}>
                                                <Server className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="flex items-center space-x-2">
                                                    <h4 className="font-medium text-sm">{node.name}</h4>
                                                    <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded-full font-bold ${node.status === 'online' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                                                        {node.status || 'offline'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-muted-foreground flex items-center mt-1">
                                                    <LinkIcon className="w-3 h-3 mr-1" /> {node.url}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex space-x-2">
                                            <button 
                                                onClick={() => handleTestConnection(node)} 
                                                disabled={testingId === node.id}
                                                title={t('federation.test_connection', 'Test Connection')}
                                                className="p-2 text-muted-foreground hover:text-green-500 transition-colors disabled:opacity-50"
                                            >
                                                {testingId === node.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                                            </button>
                                            <button onClick={() => startEdit(node)} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(node.id)} className="p-2 text-muted-foreground hover:text-red-500 transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <form onSubmit={handleSave} className="bg-card p-4 rounded-lg border border-border space-y-4">
                        <h3 className="text-sm font-medium flex items-center mb-4">
                            {editingId ? t('federation.edit_node', 'Edit Node') : t('federation.add_node', 'Add Node')}
                        </h3>
                        
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('common.name', 'Name')}</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full p-2 rounded-md bg-background border border-border focus:ring-2 focus:ring-primary/50 text-sm"
                                    placeholder={t('federation.name_placeholder', 'e.g., Warehouse Server')}
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                />
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('federation.url', 'Node URL')}</label>
                                <input
                                    type="url"
                                    required
                                    className="w-full p-2 rounded-md bg-background border border-border focus:ring-2 focus:ring-primary/50 text-sm"
                                    placeholder="http://192.168.1.50:5005"
                                    value={formData.url}
                                    onChange={e => setFormData({...formData, url: e.target.value})}
                                />
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <Key className="w-4 h-4" /> {t('federation.api_token', 'API Token')}
                            </label>
                            <input
                                type="password"
                                required
                                className="w-full p-2 rounded-md bg-background border border-border focus:ring-2 focus:ring-primary/50 text-sm"
                                placeholder={t('federation.api_token_placeholder', 'Enter the remote Admin API token')}
                                value={formData.api_token}
                                onChange={e => setFormData({...formData, api_token: e.target.value})}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                {t('federation.api_token_hint', 'You can generate an API Token in the Security settings of the remote node.')}
                            </p>
                        </div>
                        
                        <div className="flex justify-end space-x-3 pt-4">
                            <button
                                type="button"
                                onClick={() => setIsEditing(false)}
                                className="px-4 py-2 text-sm font-medium rounded-md hover:bg-muted transition-colors flex items-center"
                            >
                                <X className="w-4 h-4 mr-2" />
                                {t('common.cancel', 'Cancel')}
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                {t('common.save', 'Save')}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </CollapsibleSection>
    );
};

