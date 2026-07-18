import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { InputField, Toggle } from '../../../components/ui/FormControls';

export const OAuthSettings = ({
    globalSettings,
    setGlobalSettings,
    isOpen,
    onToggle
}) => {
    const { t } = useTranslation();

    return (
        <CollapsibleSection
            id="oauth"
            title={t('settings_oauth.title', 'Single Sign-On (OAuth / OIDC)')}
            description={t('settings_oauth.subtitle', 'Configure external identity providers like Authentik, Keycloak, or Google')}
            icon={<ShieldAlert className="w-6 h-6" />}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <div className="space-y-6">
                <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground shrink-0">{t('settings_oauth.sso_configuration', 'SSO Configuration')}</h4>
                        <div className="flex items-center gap-2">
                             <div className={`w-2 h-2 rounded-full ${ (globalSettings.oauth_global_enabled === "true" || globalSettings.oauth_global_enabled === true) ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
                             <span className="text-[10px] uppercase font-bold tracking-tighter opacity-50">
                                { (globalSettings.oauth_global_enabled === "true" || globalSettings.oauth_global_enabled === true) ? t('settings_oauth.service_active', 'SSO Active') : t('settings_oauth.service_disabled', 'SSO Disabled')}
                             </span>
                        </div>
                    </div>
                    
                    <p className="text-xs text-muted-foreground mb-4 bg-muted/30 p-3 rounded-xl border border-border/50 leading-relaxed">
                        <span className="font-semibold text-primary">{t('settings_oauth.important_note', 'Note on Users:')}</span> {t('settings_oauth.user_provisioning_desc', 'VibeNVR does NOT automatically create users. You must create the user manually in VibeNVR and either provide the OAuth Subject ID or ask the user to link their account via their Profile.')}
                    </p>

                    <div className="mb-6">
                        <Toggle
                            label={t('settings_oauth.enable_sso', 'Enable Global SSO Login')}
                            checked={globalSettings.oauth_global_enabled === "true" || globalSettings.oauth_global_enabled === true}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, oauth_global_enabled: val ? "true" : "false" })}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputField
                            label={t('settings_oauth.provider_name', 'Provider Display Name')}
                            placeholder="Authentik"
                            value={globalSettings.oauth_provider_name}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, oauth_provider_name: val })}
                            help={t('settings_oauth.provider_name_help', 'Shown on the login button')}
                        />
                        <InputField
                            label={t('settings_oauth.metadata_url', 'OpenID Configuration URL')}
                            placeholder="https://auth.example.com/application/o/vibenvr/.well-known/openid-configuration"
                            value={globalSettings.oauth_metadata_url}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, oauth_metadata_url: val })}
                        />
                        <InputField
                            label={t('settings_oauth.client_id', 'Client ID')}
                            placeholder="xyz123"
                            value={globalSettings.oauth_client_id}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, oauth_client_id: val })}
                        />
                        <InputField
                            label={t('settings_oauth.client_secret', 'Client Secret')}
                            type="password"
                            placeholder="••••••••"
                            value={globalSettings.oauth_client_secret}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, oauth_client_secret: val })}
                        />
                    </div>
                </div>

                <div className="pt-4 border-t border-border/50">
                    <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">
                        {t('settings_oauth.callback_url', 'Callback URL')}
                    </h4>
                    <div className="bg-muted/20 p-3 rounded-lg border border-border/40 font-mono text-[11px] text-muted-foreground break-all">
                        {window.location.origin}/api/oauth/callback
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        {t('settings_oauth.callback_url_help', 'Register this exact URI in your Identity Provider settings.')}
                    </p>
                </div>
            </div>
        </CollapsibleSection>
    );
};
