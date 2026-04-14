# Contributing to VibeNVR

First off, thank you for considering contributing to VibeNVR! It's people like you who make VibeNVR such a great tool.

VibeNVR is a **Vibe Coding Project**. We value stability, modern aesthetics, and security.

---

## 🌍 Language Policy

**English is the official and only supported language** for this project. 
All code, user interface elements, commit messages, issues, and documentation must be written strictly in English to maintain consistency and accessibility for the global community.

---

## 🚀 How Can I Contribute?

### Reporting Bugs
If you find a bug, please [open an issue](https://github.com/spupuz/VibeNVR/issues) with:
- A clear and descriptive title.
- Steps to reproduce the bug.
- Actual vs. Expected behavior.
- Relevant logs (sanitized!) and version information.

### Suggesting Enhancements
We love new ideas! Please open an issue to discuss your proposal before starting implementation.

### Pull Requests
1. Fork the repo and create your branch from `main`.
2. Ensure your code follows the coding standards.
3. Update documentation if your change adds or modifies features.
4. Provide a clear summary of your changes in the PR description.

---

## 🤖 AI Usage Policy

VibeNVR welcomes AI assistance but requires strict adherence to our [AI Usage Policy](AI_POLICY.md):
- **Disclosure**: You must disclose the use of AI tools in your PR.
- **Human Verification**: Every line of AI-generated code must be reviewed and tested by you.
- **No AI Media**: AI-generated images or videos are not allowed.

---

## 🛠 Development Environment

To start developing locally:

```bash
docker compose up -d --build
```

To see the logs:
```bash
docker compose logs --tail 100
```

- **Frontend**: `http://localhost:8080`
- **Backend API**: `http://localhost:5005/docs`

---

## 📐 Coding Standards

### Backend (Python/FastAPI)
- Follow **PEP8**.
- Use Pydantic schemas for data validation.
- Implement RBAC checks: `Depends(auth_service.get_current_active_admin)`.
- Use `def` for blocking I/O (SQLAlchemy) and `async def` only for truly asynchronous operations.

### Frontend (React/Vite)
- Use functional components and hooks.
- **Styling**: Use strictly **TailwindCSS** utility classes. Refer to [STYLE.md](frontend/STYLE.md).
- **Icons**: Use `lucide-react`.

---

## 🔐 Security First

Before submitting, ensure your changes:
- Adhere to [SECURITY.md](SECURITY.md).
- Do not expose sensitive data in logs or telemetry.
- Use `HttpOnly` cookies for authentication.
- Sanitize all user inputs.

---

## ✅ Testing Requirements

Before PR submission, you **MUST**:
- Run the full Docker stack.
- Verify no backend stack traces or frontend console errors.
- Test your specific changes manually in the browser.

---

## 🤝 Code of Conduct

Be respectful, professional, and collaborative. We are a community of humans building something cool together.

---

*Thank you for being part of the Vibe!*
