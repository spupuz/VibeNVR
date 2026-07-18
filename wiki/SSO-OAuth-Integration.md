# SSO (OAuth / OIDC) Integration

VibeNVR supports Single Sign-On (SSO) using the OAuth 2.0 / OpenID Connect (OIDC) protocols. This allows you to integrate VibeNVR with external Identity Providers (IdP) such as **Authentik**, **Keycloak**, **Authelia**, or **Google Workspace**.

> **Note**: Even with SSO enabled, local accounts and Multi-Factor Authentication (OTP/2FA) continue to work. SSO acts as an alternative login bridge to a local VibeNVR session.

---

## 1. Global Architecture

When an SSO login occurs, VibeNVR receives the user's identity (the `sub` claim or subject ID, along with email and username) from the IdP.

VibeNVR **does not** automatically provision new accounts (Just-In-Time provisioning is disabled for security). The user must already exist in the VibeNVR local database. VibeNVR links the IdP account to the local user based on the matching `OAuth Subject ID`, or by falling back to matching the `email` or `username`.

Once linked, the user receives a standard VibeNVR JWT token, and the session continues just like a local login.

---

## 2. Setting Up the Identity Provider (IdP)

You can use any OIDC-compliant identity provider. Below are configuration examples for the most popular platforms.

### A. Authentik

1. Log into your Authentik Admin interface.
2. Go to **Applications** > **Providers**.
3. Click **Create** and select **OAuth2/OpenID Provider**.
4. Configure the following:
   - **Name**: `VibeNVR Provider`
   - **Authorization flow**: Select your explicit consent flow (or implicit if preferred).
   - **Client Type**: `Confidential`
   - **Client ID**: (Leave auto-generated or specify one, e.g., `vibenvr_client`)
   - **Client Secret**: (Copy this, you'll need it later)
   - **Redirect URIs/Origins (Regex)**: `https://<YOUR_VIBENVR_DOMAIN>/api/oauth/callback`
     *(If accessing locally, use `http://<VIBENVR_IP>:<PORT>/api/oauth/callback`)*
5. Go to **Applications** > **Applications**.
6. Click **Create** and set the Name to `VibeNVR`, Slug to `vibenvr`, and select the Provider you just created.
7. To find your **OpenID Configuration URL**: Click on the Provider you just created in the list. In the provider details page, copy the link labeled **OpenID Configuration URL**. It will look similar to: `https://<YOUR_AUTHENTIK_DOMAIN>/application/o/vibenvr/.well-known/openid-configuration`

### B. Keycloak

1. Log into your Keycloak Admin Console.
2. Ensure you are in the correct **Realm** (or create a new one, e.g., `vibe-realm`).
3. Go to **Clients** and click **Create client**.
4. Configure the following:
   - **Client type**: `OpenID Connect`
   - **Client ID**: `vibenvr_client`
   - **Client Authentication**: `On` (This generates a Client Secret).
   - **Valid redirect URIs**: `https://<YOUR_VIBENVR_DOMAIN>/api/oauth/callback`
5. After creating the client, go to the **Credentials** tab to copy the **Client Secret**.
6. The OpenID Configuration URL will typically be: `https://<YOUR_KEYCLOAK_DOMAIN>/realms/<YOUR_REALM>/.well-known/openid-configuration`

### C. Authelia

1. Open your `configuration.yml` for Authelia.
2. Under the `identity_providers` > `oidc` > `clients` section, add VibeNVR:
   ```yaml
   - id: vibenvr_client
     description: VibeNVR
     secret: '$pbkdf2-sha512$...' # Generate a secret using Authelia's crypto tool
     public: false
     authorization_policy: two_factor
     redirect_uris:
       - https://<YOUR_VIBENVR_DOMAIN>/api/oauth/callback
     scopes:
       - openid
       - profile
       - email
     userinfo_signing_algorithm: none
   ```
3. The OpenID Configuration URL will typically be: `https://<YOUR_AUTHELIA_DOMAIN>/.well-known/openid-configuration`

### D. Google Workspace (Google Cloud Console)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new Project or select an existing one.
3. Go to **APIs & Services** > **Credentials**.
4. Click **Create Credentials** > **OAuth client ID**.
5. Set the **Application type** to `Web application`.
6. Name the application (e.g., `VibeNVR`).
7. Add your callback URL to the **Authorized redirect URIs**: `https://<YOUR_VIBENVR_DOMAIN>/api/oauth/callback`
8. Click **Create** and save the **Client ID** and **Client Secret**.
9. The OpenID Configuration URL for Google is: `https://accounts.google.com/.well-known/openid-configuration`

### E. Microsoft Entra ID (formerly Azure AD)

1. Go to the [Microsoft Entra admin center](https://entra.microsoft.com/).
2. Navigate to **Applications** > **App registrations** and click **New registration**.
3. Set a Name (e.g., `VibeNVR`).
4. Set **Supported account types** based on your needs.
5. In **Redirect URI**, select `Web` and enter: `https://<YOUR_VIBENVR_DOMAIN>/api/oauth/callback`
6. Click **Register**. Copy the **Application (client) ID**.
7. Go to **Certificates & secrets** > **New client secret**, create one, and copy the **Value** (this is your Client Secret).
8. The OpenID Configuration URL can be found on the **Endpoints** tab of your app registration (look for the "OpenID Connect metadata document" URL), usually: `https://login.microsoftonline.com/<TENANT_ID>/v2.0/.well-known/openid-configuration`

---

## 3. Configuring VibeNVR

With the IdP configured, you now need to instruct VibeNVR to use it.

1. Log into VibeNVR as an **Admin**.
2. Go to **Settings** > **Single Sign-On (OAuth / OIDC)**.
3. Enable the **Enable Global SSO Login** toggle.
4. Fill out the configuration fields:
   - **Provider Display Name**: e.g., `Authentik` or `Keycloak` (This is shown on the login button)
   - **OpenID Configuration URL**: The `.well-known/openid-configuration` URL provided by your IdP.
   - **Client ID**: The ID generated in your IdP.
   - **Client Secret**: The secret generated in your IdP.
5. Click **Save Settings**.

At this point, a **"Sign in with [Provider Name]"** button will appear on the VibeNVR login page.

---

## 4. User Provisioning and Linking

Because auto-provisioning is disabled, users must be explicitly allowed to use SSO.

### Option A: Admin Links the Account
1. The Admin creates a new user (or edits an existing one) in **Settings** > **User Management**.
2. Under the SSO / OAuth section, verify that **Enable SSO Login for this user** is checked.
3. If known, the Admin can manually paste the user's `OAuth Subject ID` (from the IdP) into the field.

### Option B: User Links the Account (Self-Service)
1. The user logs into VibeNVR using their local `username` and `password`.
2. The user goes to **My Profile** (top right corner).
3. Under the **Security** section, they click **Link Account** next to Single Sign-On.
4. They are redirected to the IdP to log in and grant consent.
5. Upon returning to VibeNVR, their account is permanently linked. 

> **Important:** To unlink an account, the user can click **Unlink Account** in their Profile, or the Admin can clear the `OAuth Subject ID` field in User Management.

---

## Security Considerations

- **Secure Context**: It is highly recommended to expose VibeNVR over HTTPS when using OAuth, as standard redirect URIs require secure contexts.
- **Two-Factor Authentication (2FA)**: If a user logs in via SSO, VibeNVR relies on the IdP to handle 2FA. If you want strict 2FA, enforce it within Authentik. VibeNVR's internal 2FA currently applies primarily to local password logins.
