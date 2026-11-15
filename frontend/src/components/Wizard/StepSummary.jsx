import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { CheckCircle2, Film, LayoutDashboard, Camera } from 'lucide-react';

export const StepSummary = ({ summary }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <div className="space-y-6 text-center py-4">
            <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
                    <CheckCircle2 className="w-10 h-10" />
                </div>
            </div>

            <div>
                <h3 className="text-xl font-bold mb-1">
                    {t('wizard.summary.title', 'Configuration Ready!')}
                </h3>
                <p className="text-sm text-muted-foreground">
                    {t('wizard.summary.subtitle', 'Your VibeNVR system has been configured. You can re-run this wizard anytime from the sidebar.')}
                </p>
            </div>

            <div className="bg-muted/30 border border-border rounded-xl p-4 text-left space-y-2 text-sm max-w-md mx-auto">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('wizard.summary.landing', 'Landing Page')}:</span>
                    <span className="font-medium capitalize">{summary.default_landing_page}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('wizard.summary.retention', 'Retention')}:</span>
                    <span className="font-medium">{summary.retention_days} {t('wizard.summary.days', 'days')}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('wizard.summary.cameras_added', 'Cameras Added')}:</span>
                    <span className="font-medium">{summary.camerasAdded}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('wizard.summary.notifications', 'Notifications')}:</span>
                    <span className="font-medium">{summary.notificationsConfigured ? t('common.configured', 'Configured') : t('common.skipped', 'Skipped')}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('wizard.summary.federation', 'Federation Node')}:</span>
                    <span className="font-medium">{summary.federationAdded ? t('common.configured', 'Configured') : t('common.skipped', 'Skipped')}</span>
                </div>
            </div>

            <div className="flex flex-wrap justify-center gap-3 pt-2">
                <button
                    type="button"
                    onClick={() => navigate('/live')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
                >
                    <Film className="w-4 h-4" />
                    {t('nav.live', 'Live View')}
                </button>
                <button
                    type="button"
                    onClick={() => navigate('/cameras')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-accent font-medium text-sm transition-colors"
                >
                    <Camera className="w-4 h-4" />
                    {t('nav.cameras', 'Cameras')}
                </button>
                <button
                    type="button"
                    onClick={() => navigate('/dashboard')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-accent font-medium text-sm transition-colors"
                >
                    <LayoutDashboard className="w-4 h-4" />
                    {t('nav.dashboard', 'Dashboard')}
                </button>
            </div>
        </div>
    );
};
