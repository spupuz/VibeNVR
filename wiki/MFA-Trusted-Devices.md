# 🔐 Multi-Factor Authentication (2FA) & Trusted Devices

VibeNVR prioritizes account security by offering native **Time-based One-Time Password (TOTP)** authentication and a cryptographic **Trusted Device** system.

---

## 🔒 Two-Factor Authentication (2FA)

System administrators can enable 2FA to require a secondary code from an authenticator app (like Google Authenticator, Authy, or Bitwarden) during login.

### How to Enable
1.  Navigate to **Settings** -> **My Profile**.
2.  In the **Security** section, click **Set up 2FA**.
3.  **Scan the QR Code** with your authenticator app.
4.  **Save Recovery Codes**: 10 one-time use recovery codes are generated. Copy them to a secure location immediately.
5.  **Verify**: Enter the current code from your app and click **Enable**.

### Recovery Codes
If you lose access to your TOTP device, you can enter any of the 10 recovery codes into the 2FA prompt to bypass the authenticator app. 
- Each code can only be used **once**.
- Use the **Access Recovery Guide** in the Wiki if you lose both the device and the codes.

---

## 🛡️ Trusted Devices

The Trusted Device system allows you to skip 2FA on recognized personal devices (laptop, mobile phone) without compromising the security of your account on public or untrusted machines.

### How it works
- **Cryptographic Token**: When you log in with 2FA, you can toggle **"Trust this device"**. VibeNVR generates a unique, 32-byte URL-safe token.
- **SHA-256 Hashing**: The token is stored as a SHA-256 hash in the database, ensuring that even a database leak does not reveal usable tokens.
- **Skipping 2FA**: On subsequent logins from the same browser, the token is automatically presented to the server. If it matches, the 2FA step is bypassed.
- **Security**: Trusted tokens are strictly tied to a user account and are independent of the main JWT session.

### Managing Devices
- You can view and revoke your active trusted devices in the **My Profile** -> **Active Devices** section.
- Revoking a device immediately invalidates the token, requiring 2FA again on that device.

---

## 🛠️ Technical Security Details

- **No localStorage**: JWT tokens and Trusted Device tokens are stored in-memory or via **Secure HttpOnly** cookies designated for specific paths. This eliminates the risk of token theft via Cross-Site Scripting (XSS).
- **Argon2 / Bcrypt**: Password and recovery code verification uses industry-standard hashing with salted complexity.
- **Rate Limiting**: Login attempts (especially 2FA checks) are strictly rate-limited to 5/minute to prevent brute-force attacks.

---

> [!IMPORTANT]
> Always use a Reverse Proxy with **HTTPS (SSL)** when accessing your NVR over a network. Without SSL, your 2FA codes and tokens could be intercepted via a Man-in-the-Middle (MitM) attack.
