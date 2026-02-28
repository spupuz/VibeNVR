# Access Recovery Guide (Local Host Access)

This guide explains how to recover access to the `admin` account (or any other user) in case you lose your password or access to the 2FA device and recovery codes.

### 🛡️ Security Context & Threat Model

**These recovery commands are entirely secure and cannot be exploited remotely.**

VibeNVR is designed so that the backend API does not accept or execute arbitrary code. The commands listed in this guide bypass the network and API layers entirely. They rely on Docker's internal socket architecture (`docker exec`) to inject scripts directly into the running container environment.

Therefore, an attacker cannot perform these actions through your Reverse Proxy or Web UI. Executing these commands strictly requires:
1. SSH or physical access to the host machine.
2. Root privileges or membership in the `docker` user group to interact with the Docker daemon.

If a malicious actor has already achieved this level of access to your host system, the NVR application is already fundamentally compromised. These commands are safe to keep as a reference for legitimate system administrators.

**Prerequisites:** You must have access to the terminal of the host machine (server) where the VibeNVR system is running via Docker and have privileges to execute `docker` commands. 

> **Note on Database Credentials:** You do *not* need to manualy enter PostgreSQL passwords to run these commands. Because we are using `docker compose exec backend`, the commands are executed directly inside the already-running backend container. That container already contains the correct environment variables and database connections needed to securely configure the database.

All the following commands must be executed from the root folder of the project where the `docker-compose.yml` file is located.

---

## 🛑 Disable Two-Factor Authentication (2FA)

If you have lost both your authenticator app and recovery codes, the fastest way to get in is to completely disable the 2FA requirement for your account at the database level.

Once you are in, you can reconfigure it.

Run this command from the host terminal. Replace `admin` if your username is different:

```bash
docker compose exec backend python3 -c "from database import SessionLocal; from models import User; db = SessionLocal(); user = db.query(User).filter_by(username='admin').first(); user.is_2fa_enabled = False; db.commit(); print('✅ 2FA successfully disabled for the admin user.')"
```

*Effect*: You will be able to log in by entering only your username and password, bypassing the 2FA code prompt.

---

## 🔑 Reset User Password

If you do not remember your account password, you cannot simply write it to the database because it is securely encrypted using Argon2.

You can generate and set a new password ("NewPassword123") by running the hashing tool and updating the database in a single command:

```bash
docker compose exec backend python3 -c "from database import SessionLocal; from models import User; import auth_service; db = SessionLocal(); user = db.query(User).filter_by(username='admin').first(); user.hashed_password = auth_service.get_password_hash('NewPassword123'); db.commit(); print('✅ Password successfully reset for the admin user.')"
```

*Replace `NewPassword123` and `admin` with your preferred password and username.*

---

## 📝 Generate New Recovery Codes (Advanced)

If the account still has 2FA enabled and you do not want to disable it, but you want to obtain new valid recovery codes directly from the backend:

```bash
docker compose exec backend python3 -c "from database import SessionLocal; from models import User; import auth_service, crud, secrets; db = SessionLocal(); user = db.query(User).filter_by(username='admin').first(); recovery_codes = [secrets.token_hex(16) for _ in range(10)]; hashed_codes = [auth_service.get_password_hash(c) for c in recovery_codes]; crud.delete_all_recovery_codes(db, user.id); crud.create_recovery_codes(db, user.id, hashed_codes); db.commit(); print('\n🔑 Recovery codes generated. USE THEM NOW:\n' + '\n'.join(recovery_codes))"
```

This command will invalidate the old codes for the user, generate 10 new temporary plaintext codes, encrypt them in the database, and print them on the screen on the server so that you can enter them during login.
