import os
import paramiko
import utils
import logging

import time
import socket
import logging

logging.getLogger("paramiko").setLevel(logging.CRITICAL)

logger = logging.getLogger(__name__)

OFFLINE_CACHE = {}  # { (host, port): timestamp_of_failure }
CIRCUIT_BREAKER_SECONDS = 30

def _check_circuit_breaker(host, port):
    if (host, port) in OFFLINE_CACHE:
        if time.time() - OFFLINE_CACHE[(host, port)] < CIRCUIT_BREAKER_SECONDS:
            return True
        else:
            del OFFLINE_CACHE[(host, port)]
    return False

def _trip_circuit_breaker(host, port):
    OFFLINE_CACHE[(host, port)] = time.time()

def upload_file(profile, src_path, dest_path_suffix):
    """Uploads a file to SFTP with retry logic."""
    if not utils.is_safe_host(profile.sftp_host):
        logger.error(f"SFTP Upload aborted: Unsafe host {profile.sftp_host}")
        return None

    if _check_circuit_breaker(profile.sftp_host, profile.sftp_port):
        logger.warning(f"SFTP Upload aborted: {profile.sftp_host} is offline (Circuit Breaker)")
        return None
        
    for attempt in range(3):
        try:
            sock = socket.create_connection((profile.sftp_host, profile.sftp_port), timeout=5)
            transport = paramiko.Transport(sock)
            transport.banner_timeout = 5
            password = utils.decrypt_password(profile.sftp_password)
            transport.connect(username=profile.sftp_username, password=password)
            sftp = paramiko.SFTPClient.from_transport(transport)
            
            base_remote = profile.sftp_remote_path or "/"
            if not base_remote.endswith("/"):
                base_remote += "/"
                
            full_dest = base_remote + dest_path_suffix
            
            # Ensure remote directories exist
            dirs = dest_path_suffix.split("/")
            current = base_remote
            for d in dirs[:-1]:
                current = current + d + "/"
                try:
                    sftp.stat(current)
                except IOError:
                    sftp.mkdir(current)
                    
            sftp.put(src_path, full_dest)
            sftp.close()
            transport.close()
            return full_dest
        except Exception as e:
            logger.warning(f"SFTP Upload attempt {attempt + 1}/3 failed: {e}")
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                _trip_circuit_breaker(profile.sftp_host, profile.sftp_port)
                logger.error(f"SFTP Upload completely failed after 3 attempts: {e}")
                return None

def download_file(profile, remote_path, local_path):
    """Downloads a file from SFTP to a local path with retry logic."""
    if not utils.is_safe_host(profile.sftp_host):
        logger.error(f"SFTP Download aborted: Unsafe host {profile.sftp_host}")
        return False

    if _check_circuit_breaker(profile.sftp_host, profile.sftp_port):
        logger.warning(f"SFTP Download aborted: {profile.sftp_host} is offline (Circuit Breaker)")
        return False
        
    for attempt in range(3):
        try:
            sock = socket.create_connection((profile.sftp_host, profile.sftp_port), timeout=5)
            transport = paramiko.Transport(sock)
            transport.banner_timeout = 5
            password = utils.decrypt_password(profile.sftp_password)
            transport.connect(username=profile.sftp_username, password=password)
            sftp = paramiko.SFTPClient.from_transport(transport)
            
            sftp.get(remote_path, local_path)
            sftp.close()
            transport.close()
            return True
        except Exception as e:
            logger.warning(f"SFTP Download attempt {attempt + 1}/3 failed: {e}")
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                _trip_circuit_breaker(profile.sftp_host, profile.sftp_port)
                logger.error(f"SFTP Download completely failed after 3 attempts: {e}")
                return False

import time

def test_connection(host, port, username, password, remote_path):
    """Test SFTP connection and write permissions."""
    if not utils.is_safe_host(host):
        return {"success": False, "message": f"Connection failed: Unsafe host {host}"}

    try:
        sock = socket.create_connection((host, port), timeout=5)
        transport = paramiko.Transport(sock)
        # Use a short timeout for tests
        transport.banner_timeout = 5
        transport.connect(username=username, password=password)
        sftp = paramiko.SFTPClient.from_transport(transport)
        
        # Ensure base path exists
        base_remote = remote_path or "/"
        if not base_remote.endswith("/"):
            base_remote += "/"
            
        try:
            sftp.stat(base_remote)
        except IOError:
            sftp.close()
            transport.close()
            return {"success": False, "message": f"Remote path '{base_remote}' does not exist"}
            
        # Test write permissions
        test_file = f"{base_remote}.vibe_test_{int(time.time())}"
        try:
            with sftp.file(test_file, 'w') as f:
                f.write('test')
            sftp.remove(test_file)
        except IOError as e:
            sftp.close()
            transport.close()
            return {"success": False, "message": f"Permission denied writing to '{base_remote}': {e}"}
            
        sftp.close()
        transport.close()
        return {"success": True, "message": "Connection successful and permissions verified."}
    except paramiko.AuthenticationException:
        return {"success": False, "message": "Authentication failed (Invalid username or password)."}
    except Exception as e:
        return {"success": False, "message": f"Connection failed: {e}"}

def delete_file(profile, remote_path):
    """Deletes a file from SFTP."""
    if not utils.is_safe_host(profile.sftp_host):
        logger.error(f"SFTP Delete aborted: Unsafe host {profile.sftp_host}")
        return 0

    if _check_circuit_breaker(profile.sftp_host, profile.sftp_port):
        logger.warning(f"SFTP Delete aborted: {profile.sftp_host} is offline (Circuit Breaker)")
        return 0
        
    try:
        sock = socket.create_connection((profile.sftp_host, profile.sftp_port), timeout=5)
        transport = paramiko.Transport(sock)
        transport.banner_timeout = 5
        password = utils.decrypt_password(profile.sftp_password)
        transport.connect(username=profile.sftp_username, password=password)
        sftp = paramiko.SFTPClient.from_transport(transport)
        
        try:
            # We fetch size just to return it for deleted_bytes tracking if needed
            size = sftp.stat(remote_path).st_size
            sftp.remove(remote_path)
            
            # Optionally attempt to delete parent dir if empty
            parent_dir = os.path.dirname(remote_path)
            try:
                if not sftp.listdir(parent_dir): # If empty
                    sftp.rmdir(parent_dir)
            except Exception:
                pass
                
        except IOError:
            size = 0
            
        sftp.close()
        transport.close()
        return size
    except Exception as e:
        _trip_circuit_breaker(profile.sftp_host, profile.sftp_port)
        logger.error(f"SFTP Delete failed: {e}")
        return 0
