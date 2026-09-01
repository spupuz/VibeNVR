import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useFederation } from '../../contexts/FederationContext';
import { Globe, ShieldAlert, Activity, Camera, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const FederationSummaryWidget = () => {
    const { token } = useAuth();
    const { nodes, setActiveNode, activeNode } = useFederation();
    const { t } = useTranslation();
    const [nodeStats, setNodeStats] = useState({});

    // We only fetch stats for remote nodes to avoid double querying the local node
    useEffect(() => {
        if (!nodes || nodes.length === 0) return;

        const fetchAllNodes = async () => {
            const statsObj = { ...nodeStats };
            for (const node of nodes) {
                try {
                    const res = await fetch(`/api/federation/proxy/${node.id}/stats`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        statsObj[node.id] = data;
                    } else {
                        statsObj[node.id] = { error: true };
                    }
                } catch (e) {
                    statsObj[node.id] = { error: true };
                }
            }
            setNodeStats(statsObj);
        };

        fetchAllNodes();
        const interval = setInterval(fetchAllNodes, 60000); // refresh every minute
        return () => clearInterval(interval);
    }, [nodes, token]);

    // Don't render the widget at all if there are no federated nodes
    if (!nodes || nodes.length === 0) {
        return null; 
    }

    // Hide if we're currently viewing a remote node, since this widget's purpose is a global overview
    if (activeNode !== null) {
        return null;
    }

    return (
        <div className="bg-card border border-border rounded-xl p-4 md:p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                    <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                        <Globe className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold text-lg">{t('federation.aggregated_dashboard', 'Multi-Site Overview')}</h3>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 flex-1">
                {nodes.map(node => {
                    const stats = nodeStats[node.id];
                    const isError = !stats || stats.error;
                    const hasIssues = stats && stats.system_status && stats.system_status !== 'Healthy';
                    
                    return (
                        <div key={node.id} className="p-4 rounded-lg bg-accent/50 hover:bg-accent transition-colors border border-border flex flex-col justify-between">
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-medium text-sm truncate pr-2">{node.name}</span>
                                {isError ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 font-bold uppercase">{t('common.offline', 'Offline')}</span>
                                ) : hasIssues ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold uppercase">{t('dashboard.status_issues', 'Issues')}</span>
                                ) : (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 font-bold uppercase">{t('common.online', 'Online')}</span>
                                )}
                            </div>
                            
                            {!isError && stats ? (
                                <div className="space-y-2 mt-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground flex items-center gap-1"><Camera className="w-3 h-3"/> {t('dashboard.active_cameras', 'Active Cameras')}</span>
                                        <span className="font-semibold">{stats.active_cameras || 0}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground flex items-center gap-1"><Activity className="w-3 h-3"/> {t('dashboard.last_24h', 'Events (24h)')}</span>
                                        <span className="font-semibold">{stats.events_24h || 0}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-xs text-muted-foreground mt-2 italic">
                                    {t('federation.waiting_stats', 'Awaiting telemetry...')}
                                </div>
                            )}

                            <button 
                                onClick={() => setActiveNode(node.id)}
                                disabled={node.status !== 'online'}
                                className="mt-4 w-full flex items-center justify-center gap-1 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {t('federation.switch_to_site', 'Switch to Site')} <ArrowRight className="w-3 h-3" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

