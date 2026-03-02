import asyncio
import socket
import logging
import ipaddress
from typing import List, Dict, Optional
from onvif import ONVIFCamera
import zeep

logger = logging.getLogger("VibeOnvif")
logger.setLevel(logging.INFO)

# Common ONVIF ports. Order by probability.
COMMON_ONVIF_PORTS = [80, 8080, 8000, 2020, 8899, 8888, 5000, 10000, 81, 8001, 8002, 8081, 888, 889]

# Extended list for 'Deep Scan' when standard ones fail
EXTENDED_ONVIF_PORTS = sorted(list(set(COMMON_ONVIF_PORTS + [
    2000, 3000, 3702, 7070, 7443, 8082, 8083, 8443, 9000, 9090, 8008, 8010, 8181,
    8282, 8383, 8484, 8585, 8686, 8787, 8881, 8882, 9091, 9999, 10001, 10002,
    11000, 12000, 13000, 14000, 15000, 16000, 17000, 18000, 19000, 20000,
    34567, 37777, 37778, 554, 80, 443, 8080, 8000, 8899, 8008, 8009, 8010
])))
RTSP_PORT = 554

async def check_port(ip: str, port: int, timeout: float = 1.2, retries: int = 0) -> bool:
    """Check if a port is open on a given IP with optional retries."""
    for attempt in range(max(1, retries + 1)):
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, port), 
                timeout=timeout
            )
            writer.close()
            await writer.wait_closed()
            return True
        except Exception:
            if attempt < retries:
                await asyncio.sleep(0.1 * (attempt + 1)) # Backoff
            pass
    return False

async def get_onvif_details(ip: str, port: int, user: str = "", password: str = "") -> Optional[Dict]:
    """Retrieve device details via ONVIF."""
    try:
        if not port or port <= 0:
            logger.error(f"Invalid port {port} for ONVIF probe at {ip}")
            return None
        logger.info(f"Probing ONVIF device at {ip}:{port} with user '{user}'")
        # ONVIFCamera constructor can be slow (WSDL parsing), wrap in to_thread
        # Some cameras require adjust_time=True to avoid timestamp errors
        device = await asyncio.to_thread(ONVIFCamera, ip, port, user, password, adjust_time=True)
        
        # Get device information
        dev_info = await asyncio.to_thread(device.devicemgmt.GetDeviceInformation)
        logger.info(f"Device information retrieved for {ip}: {dev_info}")
        
        # Get profiles to extract RTSP URLs
        media_service = await asyncio.to_thread(device.create_media_service)
        profiles = await asyncio.to_thread(media_service.GetProfiles)
        
        results = {
            "ip": ip,
            "port": port,
            "manufacturer": dev_info.Manufacturer,
            "model": dev_info.Model,
            "hw_id": dev_info.HardwareId,
            "profiles": []
        }
        
        for profile in profiles:
            try:
                stream_setup = {
                    'Stream': 'RTP-Unicast',
                    'Transport': {'Protocol': 'RTSP'}
                }
                url_obj = await asyncio.to_thread(media_service.GetStreamUri, {'StreamSetup': stream_setup, 'ProfileToken': profile.token})
                results["profiles"].append({
                    "name": profile.Name,
                    "token": profile.token,
                    "url": url_obj.Uri
                })
            except Exception as e:
                logger.warning(f"Could not get stream URI for profile {profile.Name} on {ip}: {e}")
                
        return results
    except (ConnectionRefusedError, zeep.exceptions.Error, socket.timeout) as e:
        err_msg = str(e)
        if "Connection refused" in err_msg or "Errno 111" in err_msg:
            logger.warning(f"ONVIF connection refused for {ip}:{port}. Check if ONVIF is enabled on this port.")
        else:
            logger.error(f"ONVIF probe failed for {ip}:{port}: {err_msg}")
        return None
    except Exception as e:
        logger.error(f"Unexpected ONVIF error for {ip}:{port}: {str(e)}", exc_info=True)
        return None

async def scan_host(ip: str, timeout: float = 2.0, retries: int = 2) -> Dict[str, List[int]]:
    """Scan common ONVIF ports and RTSP port on a specific host."""
    all_ports = COMMON_ONVIF_PORTS + [RTSP_PORT]
    # Use retries for RTSP/ONVIF check on potentially lossy WiFi
    tasks = [check_port(ip, port, timeout=timeout, retries=retries) for port in all_ports]
    results = await asyncio.gather(*tasks)
    
    found = {"onvif": [], "rtsp": False}
    for port, is_open in zip(all_ports, results):
        if is_open:
            if port == RTSP_PORT:
                found["rtsp"] = True
            else:
                found["onvif"].append(port)
    return found

def get_ips_from_range(ip_range: str) -> List[str]:
    """Calculate list of IPs from CIDR or Range string."""
    ips = []
    try:
        if "/" in ip_range:
            network = ipaddress.ip_network(ip_range, strict=False)
            ips = [str(ip) for ip in network.hosts()]
        elif "-" in ip_range:
            parts = ip_range.split("-")
            start_ip = parts[0].strip()
            end_ip = parts[1].strip()
            
            # Handle short format like 192.168.1.1-100
            if "." not in end_ip:
                prefix = ".".join(start_ip.split(".")[:-1])
                end_ip = f"{prefix}.{end_ip}"
                
            start = ipaddress.ip_address(start_ip)
            end = ipaddress.ip_address(end_ip)
            curr = start
            while curr <= end:
                ips.append(str(curr))
                curr += 1
        else:
            # Single IP
            ips = [str(ipaddress.ip_address(ip_range.strip()))]
    except Exception as e:
        logger.error(f"Invalid IP range: {ip_range} - {e}")
        return []
    return ips

async def scan_range(ip_range: str, max_concurrency: int = 10) -> List[Dict]:
    """
    Scan a range of IP addresses for ONVIF devices.
    """
    ips = get_ips_from_range(ip_range)
    found_devices = []
    semaphore = asyncio.Semaphore(max_concurrency)

    async def worker(ip):
        async with semaphore:
            scan_res = await scan_host(ip)
            if scan_res["onvif"]:
                for port in scan_res["onvif"]:
                    found_devices.append({
                        "ip": ip,
                        "port": port,
                        "status": "potential_onvif",
                        "rtsp_open": scan_res["rtsp"]
                    })
            elif scan_res["rtsp"]:
                found_devices.append({
                    "ip": ip,
                    "port": 0,
                    "status": "potential_camera",
                    "rtsp_open": True
                })

    tasks = [worker(ip) for ip in ips]
    await asyncio.gather(*tasks)
    return found_devices

# Utility to test if it's really an ONVIF device without full auth
async def quick_probe(ip: str, port: int, user: str = "", password: str = "") -> Optional[Dict]:
    """Try to get basic info without full auth if possible, or just confirm ONVIF."""
    try:
        # Aggressive timeout for quick probe to avoid hanging the scanner
        # 3 seconds is enough for a local network device to respond if it's capable
        async with asyncio.timeout(3.0):
            # initialize device (WSDL parsing)
            device = await asyncio.to_thread(ONVIFCamera, ip, port, user, password, adjust_time=True)
            # Try to get info
            dev_info = await asyncio.to_thread(device.devicemgmt.GetDeviceInformation)
            return {
                "ip": ip,
                "port": port,
                "manufacturer": str(dev_info.Manufacturer).strip(),
                "model": str(dev_info.Model).strip(),
                "status": "onvif_confirmed",
                "auth_required": False
            }
    except asyncio.TimeoutError:
        logger.debug(f"Quick probe timeout for {ip}:{port}")
        return None
    except Exception as e:
        err_str = str(e).lower()
        if "401" in err_str or "unauthorized" in err_str:
            return {
                "ip": ip,
                "port": port,
                "status": "onvif_confirmed",
                "auth_required": True
            }
        # Connection refused or other SOAP errors mean it's likely not a functional ONVIF device
        logger.debug(f"Quick probe failed for {ip}:{port}: {e}")
        return None

async def deep_scan_host(ip: str, concurrency: int = 50) -> List[int]:
    """Scan an extended list of common camera ports on a single host."""
    logger.info(f"Starting extended port scan for {ip}...")
    open_ports = []
    semaphore = asyncio.Semaphore(concurrency)
    
    async def worker(port):
        async with semaphore:
            # Slightly longer timeout for deep scan to be sure
            if await check_port(ip, port, timeout=0.5):
                open_ports.append(port)
                
    tasks = [worker(p) for p in EXTENDED_ONVIF_PORTS]
    await asyncio.gather(*tasks)
    
    logger.info(f"Extended scan finished for {ip}, found {len(open_ports)} open ports.")
    return open_ports
