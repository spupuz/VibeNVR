import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../../contexts/AuthContext';
import { InputField, SectionHeader, SelectField } from '../../../ui/FormControls';

export const EventSourcesTab = ({ newCamera, setNewCamera, globalSettings, setActiveTab }) => {
    const { t } = useTranslation();
    const { token } = useAuth();
    const [status, setStatus] = useState(null);
    const isAiEnabled = globalSettings?.ai_enabled?.value === 'true' || globalSettings?.ai_enabled === true || globalSettings?.ai_enabled === 'true';
    const hasPrivacyMasks = (() => {
        try {
            const masks = typeof newCamera.privacy_masks === 'string' ? JSON.parse(newCamera.privacy_masks) : newCamera.privacy_masks;
            return Array.isArray(masks) && masks.length > 0;
        } catch (_error) {
            return false;
        }
    })();
    const passthrough = !hasPrivacyMasks && (newCamera.movie_passthrough === true || newCamera.movie_passthrough === 'true' || newCamera.movie_passthrough === 1);
    const selected = newCamera.event_provider === 'hikvision_isapi' ? 'hikvision_isapi' : newCamera.detect_engine || 'OpenCV';
    const separateCredentials = newCamera._isapi_use_separate ?? Boolean(newCamera.isapi_username || newCamera.isapi_password);

    useEffect(() => {
        if (newCamera.event_provider !== 'hikvision_isapi' || !newCamera.id || !token) return;
        let cancelled = false;
        const load = async () => {
            try {
                const res = await fetch(`/api/cameras/${newCamera.id}/event-provider/status`, {
                    headers: { Authorization: `Bearer ${token}` }, credentials: 'include'
                });
                if (res.ok && !cancelled) setStatus(await res.json());
            } catch (_error) { /* Diagnostics must not interrupt editing. */ }
        };
        load();
        const timer = setInterval(load, 10000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [newCamera.event_provider, newCamera.id, token]);

    return (
        <div className="space-y-6">
            <SectionHeader title={t('cameras.event_source', 'Event Source')} description={t('cameras.event_source_description', 'Choose how this camera detects events. Recording settings remain independent.')} />
            <SelectField
                label={t('cameras.detection_engine', 'Detection Engine')}
                value={selected}
                onChange={(value) => setNewCamera(prev => ({
                    ...prev,
                    detect_engine: value === 'hikvision_isapi' ? 'ONVIF Edge' : value,
                    event_provider: value === 'hikvision_isapi' ? 'hikvision_isapi' : value === 'ONVIF Edge' ? 'onvif' : 'server'
                }))}
                options={[
                    { value: 'OpenCV', label: t('cameras.opencv_server_image_ana', 'OpenCV (Server Image Analysis)') },
                    {
                        value: 'AI', label: t('cameras.ai_object_detection_tpu_cpu', 'AI (Object Detection - TPU/CPU)') +
                            (!isAiEnabled ? ` ${t('cameras.disabled_globally_label', '(DISABLED GLOBALLY)')}` :
                                !passthrough ? ` ${t('cameras.requires_passthrough', '(REQUIRES PASSTHROUGH)')}` : ''),
                        disabled: !isAiEnabled || !passthrough
                    },
                    ...(newCamera.onvif_host && newCamera.onvif_can_events ? [{ value: 'ONVIF Edge', label: t('cameras.onvif_edge_camera_side', 'ONVIF Edge (Camera-side Hardware)') }] : []),
                    ...(newCamera.onvif_host ? [{ value: 'hikvision_isapi', label: t('cameras.hikvision_isapi_provider', 'Hikvision ISAPI (Camera-side Classification)') }] : [])
                ]}
            />
            {!newCamera.onvif_host && (
                <button type="button" className="text-xs text-primary underline" onClick={() => setActiveTab('onvif')}>
                    {t('cameras.configure_camera_host', 'Configure the camera host in ONVIF settings to use camera-native event sources.')}
                </button>
            )}
            {newCamera.detect_engine === 'AI' && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-600 dark:text-blue-400">
                    {t('cameras.system_only_trigger_recordings', 'The system will only trigger recordings when specific objects are identified.')}{' '}
                    <button type="button" className="font-semibold underline" onClick={() => setActiveTab('ai')}>{t('cameras.ai_tracking', 'AI & Tracking')}</button>
                </div>
            )}
            {newCamera.detect_engine === 'ONVIF Edge' && (
                <p className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-600 dark:text-amber-400">
                    {t('cameras.sensitivity_threshold_a', 'Sensitivity, threshold, and motion zones are handled by the camera hardware.')}
                </p>
            )}
            {selected === 'hikvision_isapi' && (
                <div className="p-4 rounded-lg border border-border space-y-3">
                    <SectionHeader title={t('cameras.isapi_event_settings', 'Hikvision ISAPI Events')} description={t('cameras.isapi_connection_description', 'Connect to the camera HTTP API for classified events.')} />
                    <p className="text-xs text-muted-foreground">
                        {t('cameras.isapi_camera_host', 'Camera host')}: {newCamera.onvif_host || t('cameras.not_configured', 'Not configured')}{' · '}
                        <button type="button" className="text-primary underline" onClick={() => setActiveTab('onvif')}>{t('cameras.edit_camera_host', 'Edit host')}</button>
                    </p>
                    <InputField label={t('cameras.isapi_http_port', 'ISAPI HTTP port')} type="number" value={newCamera.isapi_port || 80} onChange={(value) => setNewCamera(prev => ({ ...prev, isapi_port: value || null }))} />
                    <SelectField
                        label={t('cameras.isapi_credentials', 'ISAPI credentials')}
                        value={separateCredentials ? 'separate' : 'onvif'}
                        onChange={(value) => setNewCamera(prev => ({
                            ...prev,
                            _isapi_use_separate: value === 'separate',
                            isapi_username: value === 'separate' ? (prev.isapi_username || prev.onvif_username || null) : null,
                            isapi_password: value === 'separate' ? (prev.isapi_password || prev.onvif_password || null) : null
                        }))}
                        options={[
                            { value: 'onvif', label: t('cameras.isapi_use_onvif_credentials', 'Use ONVIF credentials') },
                            { value: 'separate', label: t('cameras.isapi_use_separate_credentials', 'Use separate ISAPI credentials') }
                        ]}
                    />
                    {separateCredentials ? (
                        <>
                            <InputField label={t('cameras.isapi_username_required', 'ISAPI username')} value={newCamera.isapi_username || ''} onChange={(value) => setNewCamera(prev => ({ ...prev, isapi_username: value || null }))} />
                            <InputField label={t('cameras.isapi_password_required', 'ISAPI password')} type="password" value={newCamera.isapi_password || ''} onChange={(value) => setNewCamera(prev => ({ ...prev, isapi_password: value || null }))} />
                            {(!newCamera.isapi_username || !newCamera.isapi_password) && <p className="text-xs text-amber-600">{t('cameras.isapi_credentials_required', 'Enter both an ISAPI username and password to use separate credentials.')}</p>}
                        </>
                    ) : (
                        <p className="text-xs text-muted-foreground">{t('cameras.isapi_onvif_credentials_info', 'Using the saved ONVIF username and password for this camera.')}</p>
                    )}
                    {status && (
                        <p className="text-xs text-muted-foreground">
                            {t('cameras.event_provider_status', 'Event provider status')}: {status.state === 'connected' ? t('common.connected', 'Connected') : status.state === 'unauthorized' ? t('cameras.isapi_error_unauthorized', 'Authentication rejected') : t('common.disconnected', 'Disconnected')}
                            {status.observed_labels?.length > 0 && ` · ${t('cameras.observed_labels', 'Observed labels')}: ${status.observed_labels.join(', ')}`}
                            {status.last_event && ` · ${t('cameras.last_event', 'Last event')}: ${status.last_event}`}
                            {status.last_error && ` · ${t('cameras.connection_issue', 'Connection issue')}: ${t(`cameras.isapi_error_${status.last_error}`, status.last_error.replaceAll('_', ' '))}`}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
