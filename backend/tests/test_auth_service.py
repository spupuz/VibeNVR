import os
import sys
import pyotp
import pytest

# Add backend directory to Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from auth_service import verify_totp

def test_verify_totp_valid_code():
    """Test that verify_totp returns True for a valid TOTP code."""
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    valid_code = totp.now()

    assert verify_totp(secret, valid_code) is True

def test_verify_totp_invalid_code():
    """Test that verify_totp returns False for an invalid TOTP code."""
    secret = pyotp.random_base32()

    # "000000" is highly unlikely to be the correct code,
    # but to be absolutely sure we can generate the code and mutate it.
    totp = pyotp.TOTP(secret)
    valid_code = totp.now()
    # Create an invalid code by flipping the first digit
    invalid_code = str((int(valid_code[0]) + 1) % 10) + valid_code[1:]

    assert verify_totp(secret, invalid_code) is False

def test_verify_totp_empty_secret():
    """Test that verify_totp returns False when the secret is empty or None."""
    assert verify_totp("", "123456") is False
    assert verify_totp(None, "123456") is False
