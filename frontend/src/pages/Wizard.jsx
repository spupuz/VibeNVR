import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Wand2, ChevronLeft, ChevronRight, Save, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { StepPreferences } from '../components/Wizard/StepPreferences';
import { StepStorage } from '../components/Wizard/StepStorage';
import { StepCamera } from '../components/Wizard/StepCamera';
import { StepNotifications } from '../components/Wizard/StepNotifications';
import { StepFederation } from '../components/Wizard/StepFederation';
import { StepSummary } from '../components/Wizard/StepSummary';

export const Wizard = () => {
    const { t } = useTranslation();
    const { token } = useAuth();
    const { showToast } = useToast();

    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);

    const [prefs, setPrefs] = useState({
        default_landing_page: 'live',
        language: 'en',
        liveViewColumns: localStorage.getItem('liveViewColumns') || 'auto'
    });
    const [storage, setStorage] = useState({
        retention_days: 7,
        max_storage_percent: 85,
        archival_enabled: false,
        backup_enabled: false,
        backup_interval_hours: 24,
        backup_retention_count: 10
    });
    const [notifications, setNotifications] = useState({ apprise_urls: '', mqtt_enabled: false, mqtt_host: '', mqtt_port: '1883', ai_enabled: false });
    const [cameras, setCameras] = useState([]);
    const [camerasAdded, setCamerasAdded] = useState(0);
    const [federationAdded, setFederationAdded] = useState(false);

    const steps = [
        { id: 'prefs', label: t('wizard.steps.prefs', 'Preferences') },
        { id: 'storage', label: t('wizard.steps.storage', 'Storage') },
        { id: 'cameras', label: t('wizard.steps.cameras', 'Cameras') },
        { id: 'notify', label: t('wizard.steps.notify', 'Notifications') },
        { id: 'federation', label: t('wizard.steps.federation', 'Federation') },
        { id: 'summary', label: t('wizard.steps.summary', 'Summary') },
    ];

    useEffect(() => {
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };
        fetch('/api/settings', { headers, credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                const map = Array.isArray(data)
                    ? Object.fromEntries(data.map(s => [s.key, s.value]))
                    : Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v && typeof v === 'object' && 'value' in v ? v.value : v]));
                const isTrue = (v) => v === true || String(v).toLowerCase() === 'true';
                setPrefs(p => ({ ...p, default_landing_page: String(map.default_landing_page || 'live') }));
                setStorage({
                    retention_days: Number(map.retention_days) || 7,
                    max_storage_percent: Number(map.max_storage_percent) || 85,
                    archival_enabled: isTrue(map.archival_enabled),
                    backup_enabled: isTrue(map.backup_auto_enabled ?? map.backup_enabled),
                    backup_interval_hours: Number(map.backup_auto_frequency_hours ?? map.backup_interval_hours) || 24,
                    backup_retention_count: Number(map.backup_auto_retention ?? map.backup_retention_count) || 10
                });
                setNotifications({
                    apprise_urls: map.notify_apprise_urls || map.apprise_urls || '',
                    mqtt_enabled: isTrue(map.mqtt_enabled),
                    mqtt_host: map.mqtt_host || '',
                    mqtt_port: map.mqtt_port || '1883',
                    ai_enabled: isTrue(map.ai_enabled)
                });
            })
            .catch(() => {});

        fetch('/api/cameras', { headers, credentials: 'include' })
            .then(r => r.ok ? r.json() : [])
            .then(cams => { if (Array.isArray(cams)) setCameras(cams); })
            .catch(() => {});
    }, [token]);

    const saveSettingsBatch = async (entries) => {
        setSaving(true);
        try {
            const headers = {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            };
            await Promise.all(entries.map(([key, value]) =>
                fetch(`/api/settings/${key}`, {
                    method: 'PUT',
                    headers,
                    credentials: 'include',
                    body: JSON.stringify({ value: String(value) })
                })
            ));
            showToast(t('wizard.saved', 'Settings saved'), 'success');
        } catch {
            showToast(t('wizard.save_error', 'Failed to save some settings'), 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleNext = async () => {
        if (step === 0) {
            await saveSettingsBatch([['default_landing_page', prefs.default_landing_page]]);
        } else if (step === 1) {
            await saveSettingsBatch([
                ['retention_days', storage.retention_days],
                ['max_storage_percent', storage.max_storage_percent],
                ['archival_enabled', storage.archival_enabled],
                ['backup_auto_enabled', storage.backup_enabled],
                ['backup_auto_frequency_hours', storage.backup_interval_hours],
                ['backup_auto_retention', storage.backup_retention_count]
            ]);
        } else if (step === 3) {
            await saveSettingsBatch([
                ['notify_apprise_urls', notifications.apprise_urls],
                ['mqtt_enabled', notifications.mqtt_enabled],
                ['mqtt_host', notifications.mqtt_host],
                ['mqtt_port', notifications.mqtt_port],
                ['ai_enabled', notifications.ai_enabled]
            ]);
        }
        if (step < steps.length - 1) setStep(s => s + 1);
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                    <Wand2 className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold">{t('wizard.title', 'Setup & Configuration Wizard')}</h1>
                    <p className="text-sm text-muted-foreground">
                        {t('wizard.subtitle', 'Configure your NVR step by step. You can jump to any section or skip steps.')}
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {steps.map((s, idx) => (
                    <button
                        key={s.id}
                        type="button"
                        onClick={() => setStep(idx)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            step === idx
                                ? 'bg-primary text-primary-foreground'
                                : idx < step
                                    ? 'bg-primary/15 text-primary'
                                    : 'bg-muted/40 text-muted-foreground hover:bg-accent'
                        }`}
                    >
                        {idx + 1}. {s.label}
                    </button>
                ))}
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                {step === 0 && <StepPreferences prefs={prefs} setPrefs={setPrefs} />}
                {step === 1 && <StepStorage storage={storage} setStorage={setStorage} />}
                {step === 2 && (
                    <StepCamera
                        cameras={cameras}
                        onCameraSaved={(savedCam, isEdit) => {
                            setCameras(prev => isEdit ? prev.map(c => c.id === savedCam.id ? savedCam : c) : [...prev, savedCam]);
                            if (!isEdit) setCamerasAdded(c => c + 1);
                        }}
                    />
                )}
                {step === 3 && <StepNotifications notifications={notifications} setNotifications={setNotifications} />}
                {step === 4 && <StepFederation onNodeAdded={() => setFederationAdded(true)} />}
                {step === 5 && (
                    <StepSummary
                        summary={{
                            default_landing_page: prefs.default_landing_page,
                            retention_days: storage.retention_days,
                            camerasAdded,
                            notificationsConfigured: Boolean(notifications.apprise_urls || notifications.mqtt_enabled),
                            federationAdded
                        }}
                    />
                )}
            </div>

            {step < steps.length - 1 && (
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        disabled={step === 0}
                        onClick={() => setStep(s => Math.max(0, s - 1))}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent disabled:opacity-40"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        {t('common.back', 'Back')}
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setStep(s => s + 1)}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent"
                        >
                            {t('common.skip', 'Skip')}
                        </button>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={handleNext}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {t('wizard.save_next', 'Save & Next')}
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
