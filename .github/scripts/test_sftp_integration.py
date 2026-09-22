import sys
import os

# Add backend to path so we can import modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend')))

import models
import schemas
from utils import encrypt_password, decrypt_password

def test_encryption():
    pwd = "my_secure_password"
    enc = encrypt_password(pwd)
    assert enc != pwd
    dec = decrypt_password(enc)
    assert dec == pwd
    print("Encryption test passed.")

def test_sftp_profile_schema():
    profile = schemas.StorageProfileCreate(
        name="SFTP Test",
        path="/sftp",
        storage_type="sftp",
        sftp_host="192.168.1.100",
        sftp_port=2222,
        sftp_username="testuser",
        sftp_password="testpassword",
        sftp_remote_path="/mnt/recordings"
    )
    assert profile.storage_type == "sftp"
    assert profile.sftp_port == 2222
    assert profile.sftp_password == "testpassword"
    print("Schema test passed.")

if __name__ == "__main__":
    test_encryption()
    test_sftp_profile_schema()
    print("All tests passed.")
