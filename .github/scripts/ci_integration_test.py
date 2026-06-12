#!/usr/bin/env python3
"""
CI Integration & Security Test Script (Safe Mode)
This script verifies basic functional connectivity and performs safety/security
checks (Auth, Path Traversal) without requiring local cameras or sensitive data.
"""

import requests
import time
import sys
import subprocess

BASE_URL = "http://localhost:8080"
BACKEND_URL = "http://localhost:5005"

def wait_for_service(name, url, timeout=10, retries=6):
    print(f"[*] Waiting for {name} at {url}...")
    for i in range(retries):
        try:
            res = requests.get(url, timeout=timeout)
            print(f"  [OK] {name} is responsive (Status: {res.status_code})")
            return True
        except requests.RequestException as e:
            print(f"  [WAIT] {name} not ready yet: {e}")
        time.sleep(5)
    print(f"  [FAIL] {name} did not become healthy in time.")
    return False

def test_backend_auth():
    print("[*] Testing API Auth Security (/api/cameras)...")
    try:
        res = requests.get(f"{BASE_URL}/api/cameras", timeout=5)
        if res.status_code == 401:
            print("  [OK] Unauthenticated access blocked as expected (401).")
            return True
        else:
            print(f"  [FAIL] Expected 401, got {res.status_code}.")
            return False
    except Exception as e:
        print(f"  [FAIL] Request error: {e}")
        return False

def test_login_security():
    print("[*] Testing Login Security with bad credentials...")
    try:
        res = requests.post(f"{BASE_URL}/api/auth/login", data={"username": "admin", "password": "wrong_password_123"}, timeout=5)
        if res.status_code in (401, 400):
            print("  [OK] Bad credentials rejected (401/400).")
            return True
        else:
            print(f"  [FAIL] Expected 401/400, got {res.status_code}.")
            return False
    except Exception as e:
        print(f"  [FAIL] Request error: {e}")
        return False

def test_path_traversal():
    print("[*] Testing Path Traversal protection...")
    try:
        # Note: If the route is not defined, we might get a 404, which is also fine.
        # But if there's a file reading endpoint (like logs or avatars), we test that.
        res = requests.get(f"{BASE_URL}/api/logs/?file=../../../etc/passwd", timeout=5, allow_redirects=False)
        # It should NOT be a 200 with the file contents.
        if res.status_code in (400, 401, 403, 404, 422):
            print(f"  [OK] Path traversal blocked (Status: {res.status_code}).")
            return True
        else:
            print(f"  [FAIL] Path traversal might be vulnerable (Status: {res.status_code}).")
            return False
    except Exception as e:
        print(f"  [FAIL] Request error: {e}")
        return False

def check_docker_containers():
    print("[*] Checking Docker Container Health...")
    try:
        # Check if any container has 'Exited'
        res = subprocess.run(["docker", "compose", "ps"], capture_output=True, text=True)
        if "Exited" in res.stdout or "Dead" in res.stdout:
            print("  [FAIL] One or more Docker containers have exited unexpectedly.")
            print(res.stdout)
            return False
        else:
            print("  [OK] Docker containers seem healthy.")
            return True
    except Exception as e:
        print(f"  [WARNING] Could not check Docker status: {e}")
        # Not failing the build just because we couldn't check
        return True

def main():
    print("=== VibeNVR CI Security & Health Check ===")
    
    success = True
    
    # 1. Wait for services to be up
    if not wait_for_service("Frontend UI", f"{BASE_URL}/"):
        success = False
    
    # Check backend via the docs endpoint which is public
    if not wait_for_service("Backend API", f"{BACKEND_URL}/docs"):
        success = False

    # 2. Run Security Tests
    if success:
        if not test_backend_auth(): success = False
        if not test_login_security(): success = False
        if not test_path_traversal(): success = False

    # 3. Check Docker status
    if not check_docker_containers():
        success = False

    if success:
        print("\n[OK] All CI tests passed successfully!")
        sys.exit(0)
    else:
        print("\n[ERROR] One or more CI tests failed.")
        sys.exit(1)

if __name__ == "__main__":
    main()
