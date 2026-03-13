---
description: Perform a security, auth, RBAC, and style audit on uncommitted changes
---

This workflow automates the process of auditing uncommitted changes with a strict focus on security vulnerabilities, authentication/RBAC compliance, and style consistency, while also ensuring documentation (*.md files) is kept in sync.

### Steps:

1. **Identify Uncommitted Changes**
   - Run `git status` and `git diff` to identify modified files and their contents.

2. **Analysis Focal Points (Mandatory)**
   - **Security Vulnerabilities**: Deep scan for XSS, SQLi, CSRF, RCE, or insecure defaults.
   - **Sensitive Data & Secrets**: **CRITICAL**: Scan for hardcoded credentials, API keys, tokens, passwords, or any other sensitive information. Ensure that no private data is committed to the repository.
   - **Authentication & RBAC Compliance**: Verify that all new or modified endpoints strictly follow the `Depends(auth_service.get_current_active_admin)` or `get_current_user` patterns. Check for IDOR or missing authorization checks.
   - **Database & Migrations**: Any schema change **MUST** be an automated upgrade that is safe for the end-user. All changes must be implemented in `backend/migrate_db.py` to ensure seamless updates.
   - **Persistence (Import/Export / Copy)**: New camera or global setting parameters **MUST** be included in the import/export logic. Verify that they are handled in both single-camera and bulk export/import operations, as well as global settings backups. Additionally, ensure the **"Copy Camera"** functionality correctly clones all new parameters to maintain consistent configurations.
   - **Docker Infrastructure**: The `docker-compose.yml` file should ONLY be modified in extreme cases. Prefer application-level configuration or environment variables via the UI/API.
   - **Style Consistency**: Ensure adherence to `frontend/STYLE.md`, project naming conventions, and premium aesthetics.
   - **Input Sanitization**: Specifically verify RTSP URL handling and any user-controlled input.

3. **Mandatory Reading of Documentation**
   - **CRITICAL**: Before proceeding with any analysis or code generation, you MUST read **all `*.md` files** in the repository.
   - These files contain the authoritative standards for security, style, and nomenclature.

4. **Cross-Reference & Synchronization**
   - Review relevant `*.md` files (e.g., `SECURITY.md`, `README.md`, `frontend/README.md`) and the project Wiki.
   - **Mandatory**: Update documentation, Wiki files, and `.env.example` if the implementation has changed to ensure they stay synchronized with the codebase.

5. **Verify and Refine**
   - Create scratch scripts in `/tmp/` to test critical logic (e.g., URL parsing, regex masking).
   - Run existing relevant tests (e.g., `backend/test_auth.py`, `engine/scripts/test_pyav_auth.py`).

### Output Requirements:
The audit results must be presented in a clear, structured format using the following headings:
- **Security Audit**: Detailed findings on vulnerabilities and mitigations.
- **Sensitive Data Check**: Verification that no credentials or secrets are present in the changes.
- **Authentication & RBAC**: Verification of access control compliance.
- **Style & Consistency**: Review of UI/UX and naming standards.
- **Documentation Sync**: List of updated `.md` files or Wiki pages.

### Prompt to Reuse:
> "Perform a comprehensive security and style audit on all uncommitted changes. Focus strictly on security vulnerabilities, sensitive data leakage (credentials/secrets), authentication/RBAC compliance, and style consistency. Compare the modifications against `SECURITY.md`, `frontend/STYLE.md`, and all other project documentation. Refine any logic that introduces risks, and update the markdown files/Wiki as necessary. Provide a well-defined output structured by Security, Sensitive Data, Auth/RBAC, and Style."
