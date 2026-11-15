import React from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive, Calendar, Archive } from 'lucide-react';

export const StepStorage = ({ storage, setStorage }) => {
    const { t } = useTranslation();

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold mb-1">{t('wizard.storage.title', 'Storage & Retention')}</h3>
                <p className="text-sm text-muted-foreground">
                    {t('wizard.storage.subtitle', 'Configure how long recordings are kept and disk space limits.')}
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        {t('wizard.storage.retention_days', 'Retention (Days)')}
                    </label>
                    <input
                        type="number"
                        min="1"
                        max="3650"
                        value={storage.retention_days}
                        onChange={(e) => setStorage(prev => ({ ...prev, retention_days: Number(e.target.value) || 7 }))}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="text-xs text-muted-foreground">
                        {t('wizard.storage.retention_hint', 'Older recordings are automatically cleaned up.')}
                    </p>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-primary" />
                        {t('wizard.storage.max_percent', 'Max Disk Usage (%)')}
                    </label>
                    <input
                        type="number"
                        min="10"
                        max="99"
                        value={storage.max_storage_percent}
                        onChange={(e) => setStorage(prev => ({ ...prev, max_storage_percent: Number(e.target.value) || 85 }))}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="text-xs text-muted-foreground">
                        {t('wizard.storage.max_percent_hint', 'Emergency cleanup triggers above this threshold.')}
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20">
                <div className="flex items-start gap-3">
                    <Archive className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                        <p className="text-sm font-medium">{t('wizard.storage.archival', 'Enable Tiered Archival')}</p>
                        <p className="text-xs text-muted-foreground">
                            {t('wizard.storage.archival_hint', 'Move older recordings to secondary/NAS storage before deletion.')}
                        </p>
                    </div>
                </div>
                <input
                    type="checkbox"
                    checked={storage.archival_enabled}
                    onChange={(e) => setStorage(prev => ({ ...prev, archival_enabled: e.target.checked }))}
                    className="w-5 h-5 accent-primary cursor-pointer"
                />
            </div>

            <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{t('wizard.storage.auto_backup', 'Enable Automatic Config Backups')}</p>
                            {storage.backup_enabled && (
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 font-medium">
                                    {t('common.enabled', 'Enabled')}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t('wizard.storage.auto_backup_hint', 'Periodically back up cameras, settings, and users to /data/backups.')}
                        </p>
                    </div>
                    <input
                        type="checkbox"
                        checked={storage.backup_enabled}
                        onChange={(e) => setStorage(prev => ({ ...prev, backup_enabled: e.target.checked }))}
                        className="w-5 h-5 accent-primary cursor-pointer"
                    />
                </div>
                {storage.backup_enabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/50">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">{t('wizard.storage.backup_interval', 'Interval (Hours)')}</label>
                            <input
                                type="number"
                                min="1"
                                max="720"
                                value={storage.backup_interval_hours ?? 24}
                                onChange={(e) => setStorage(prev => ({ ...prev, backup_interval_hours: Number(e.target.value) || 24 }))}
                                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">{t('wizard.storage.backup_retention', 'Max Retained Backups')}</label>
                            <input
                                type="number"
                                min="1"
                                max="100"
                                value={storage.backup_retention_count ?? 10}
                                onChange={(e) => setStorage(prev => ({ ...prev, backup_retention_count: Number(e.target.value) || 10 }))}
                                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
