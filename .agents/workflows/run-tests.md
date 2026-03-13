---
description: Run all automated test suites (Environment, Functional, Security, Streaming)
---

# Run Automated Tests Workflow

This workflow automates the execution of all available test suites in VibeNVR to ensure project stability, security, and functionality before any commit or release.

### Steps:

1. **Prerequisites**
   - Ensure the Docker stack is running: `docker compose up -d`
   - Ensure you have `requests` installed locally: `pip install requests`

2. **Test Focal Points (Mandatory)**
   - **New Features**: If new functions or features were introduced, **new automated test scripts MUST be created or integrated** into the existing suites to ensure coverage.
   - **Environment Integrity**: Verify `.env` configuration exists and is derived from `.env.example`. Check directory permissions.
   - **Functional Sanity**: Validate core NVR features (Live View, Camera Management, Recording).
   - **Security Sanity**: check for auth bypasses, rate-limiting, and token validation.
   - **Streaming Robustness**: Verify WebSocket stability and PyAV decoder performance.

3. **Execution Path**
   - **Master Suite**: Run `python3 scripts/security_tests/run_tests_auto.py` (handles credential backup/restore).
   - **Component Specific**:
     - Backend/WS: `python3 backend/scripts/test_ws.py`, `python3 backend/scripts/ws_stream_sanity.py`
     - Engine/PyAV: `python3 engine/scripts/test_env.py`, `python3 engine/scripts/test_pyav_auth.py`
   - **Protocol Verification**: `bash scripts/rtsp_check.sh`, `bash scripts/pyav_check.sh`

4. **Mandatory Documentation Review**
   - Cross-check test results against `SECURITY.md` and `README.md` requirements.

### Output Requirements:
The test execution report must be structured using the following headings:
- **Environment Status**: Results of environment and dependency checks.
- **Functional Verification**: Detailed pass/fail status for core features.
- **Security Verification**: Findings from automated security probes.
- **Streaming & Hardware**: Performance metrics and stability results for video streams.
- **Overall Verdict**: [PASS/FAIL] with a summary of critical issues if any.

### Prompt to Reuse:
> "Execute the full automated test suite for VibeNVR. Focus on environment integrity, functional sanity, security probes, and streaming robustness. Report the results using the mandatory structured output (Environment, Functional, Security, Streaming, Verdict). If failures occur, analyze the logs to provide a root cause before proceeding."
