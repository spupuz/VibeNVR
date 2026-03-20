import React from 'react';
import { HardDrive, Download, Upload } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { InputField, Toggle } from '../../../components/ui/FormControls';
import { BackupManager } from '../BackupManager';

export const BackupSettings = ({
    globalSettings,
    setGlobalSettings,
    handleExport,
    handleImport,
    isOpen,
    onToggle
}) => {
    return (
        <CollapsibleSection
            id="backup"
            title="Backup & Restore"
            description="Export or Import system configuration (Settings, Cameras, Groups)"
            icon={<HardDrive className="w-6 h-6" />}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <div className="space-y-6 pt-2">
                {/* Automatic Backup Configuration */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-muted/20 p-4 rounded-xl border border-border/50 space-y-4">
                        <Toggle
                            label="Enable Automatic Backup"
                            checked={globalSettings.backup_auto_enabled}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, backup_auto_enabled: val })}
                        />
                        <div className="space-y-2">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Automatically save a full system configuration backup to <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px]">/data/backups/</code>.
                            </p>
                            <p className="text-xs text-muted-foreground leading-relaxed opacity-70">
                                Includes: Cameras, Groups, Users, 2FA secrets, and System Settings.
                            </p>
                        </div>
                    </div>

                    <div className={`space-y-4 transition-all duration-300 ${!globalSettings.backup_auto_enabled ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <InputField
                                label="Interval (Hours)"
                                type="number"
                                help="How often to run the backup."
                                unit="Hrs"
                                value={globalSettings.backup_auto_frequency_hours}
                                onChange={(val) => setGlobalSettings({ ...globalSettings, backup_auto_frequency_hours: val })}
                            />
                            <InputField
                                label="Backups to Keep"
                                type="number"
                                help="Number of automatic backup files to retain. Manual backups are never deleted automatically."
                                unit="Files"
                                value={globalSettings.backup_auto_retention}
                                onChange={(val) => setGlobalSettings({ ...globalSettings, backup_auto_retention: val })}
                            />
                        </div>
                    </div>
                </div>

                {/* Export/Import Buttons (Legacy/Local) */}
                <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-2 border-t border-border/50 mt-4">
                    <Button
                        onClick={handleExport}
                        variant="outline"
                        className="w-full sm:w-auto px-6 py-3 font-bold shadow-sm active:scale-95 text-xs"
                    >
                        <Download className="w-4 h-4 shrink-0 mr-2" />
                        <span>Export (Local Save)</span>
                    </Button>

                    <div className="relative w-full sm:w-auto">
                        <input
                            type="file"
                            accept=".json"
                            onChange={handleImport}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <Button
                            className="w-full sm:w-auto px-6 py-3 font-bold shadow-sm text-xs"
                            variant="outline"
                        >
                            <Upload className="w-4 h-4 shrink-0 mr-2" />
                            <span>Import (Local File)</span>
                        </Button>
                    </div>
                </div>

                {/* Server-side Backup Manager */}
                <div className="pt-6 border-t border-border mt-6">
                    <BackupManager />
                </div>
            </div>
        </CollapsibleSection>
    );
};
