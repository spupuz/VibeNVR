import asyncio
import socket
import logging
import ipaddress
from typing import List, Dict, Optional
from onvif import ONVIFCamera
import zeep
from zeep.transports import Transport
from requests import Session

logger = logging.getLogger("VibeOnvif")
logger.setLevel(logging.DEBUG)

# Common ONVIF ports. Order by probability.
COMMON_ONVIF_PORTS = [80, 8080, 8000, 2020, 8899, 8888, 5000, 10000, 81, 8001, 8002, 8081, 888, 889]

# Extended list for 'Deep Scan' when standard ones fail
EXTENDED_ONVIF_PORTS = sorted(list(set(COMMON_ONVIF_PORTS + [
    2000, 3000, 3702, 7070, 7443, 8082, 8083, 8443, 9000, 9090, 8008, 8010, 8181,
    8282, 8383, 8484, 8585, 8686, 8787, 8881, 8882, 9091, 9999, 10001, 10002,
    11000, 12000, 13000, 14000, 15000, 16000, 17000, 18000, 19000, 20000,
    34567, 37777, 37778, 554, 80, 443, 8080, 8000, 8899, 8008, 8009, 8010
])))
# Common RTSP ports. 554 is standard, 7447 is UniFi standard, 7441 is UniFi secure.
COMMON_RTSP_PORTS = [554, 7447, 7441]

def get_onvif_transport(timeout: float = 10.0) -> Transport:
    """Create a Zeep Transport with a configured timeout to prevent hanging."""
    session = Session()
    # connect timeout (e.g. 3.1) and read timeout (e.g. timeout)
    # Using a tuple (connect, read) is more robust in requests
    return Transport(session=session, timeout=(3.1, timeout))

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
        transport = get_onvif_transport(timeout=10.0)
        # Add a secondary fail-safe timeout for the constructor itself
        async with asyncio.timeout(15.0):
            device = await asyncio.to_thread(ONVIFCamera, ip, port, user, password, adjust_time=True, transport=transport)
        
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
        
        # Detect features for the first profile found
        if profiles:
            results["features"] = await _detect_onvif_capabilities(device, profiles[0].token)
        else:
            results["features"] = {
                "ptz_can_pan_tilt": False,
                "ptz_can_zoom": False,
                "ptz_can_home": False,
                "onvif_can_events": False,
                "audio_enabled": False
            }
                
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
    """Scan common ONVIF ports and RTSP ports on a specific host."""
    all_ports = COMMON_ONVIF_PORTS + COMMON_RTSP_PORTS
    # Use retries for RTSP/ONVIF check on potentially lossy WiFi
    tasks = [check_port(ip, port, timeout=timeout, retries=retries) for port in all_ports]
    results = await asyncio.gather(*tasks)
    
    found = {"onvif": [], "rtsp": []}
    for port, is_open in zip(all_ports, results):
        if is_open:
            if port in COMMON_RTSP_PORTS:
                found["rtsp"].append(port)
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
                        "rtsp_open": len(scan_res["rtsp"]) > 0
                    })
            elif scan_res["rtsp"]:
                for port in scan_res["rtsp"]:
                    found_devices.append({
                        "ip": ip,
                        "port": port,
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
            transport = get_onvif_transport(timeout=3.0)
            device = await asyncio.to_thread(ONVIFCamera, ip, port, user, password, adjust_time=True, transport=transport)
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

async def get_ptz_service(camera: "models.Camera"):
    """Initialize and return the PTZ service for a camera."""
    host = camera.onvif_host
    port = camera.onvif_port or 80
    user = camera.onvif_username
    password = camera.onvif_password
    
    # Fallback to RTSP URL parsing if ONVIF details are missing
    if not host or not user or not password:
        try:
            from urllib.parse import urlparse
            parsed = urlparse(camera.rtsp_url)
            if not host:
                host = parsed.hostname
            if not user and parsed.username:
                user = parsed.username
            if not password and parsed.password:
                password = parsed.password
        except Exception as e:
            logger.debug(f"Could not parse RTSP URL for ONVIF fallback: {e}")

    if not host:
        raise ValueError("ONVIF host not configured and could not be parsed from RTSP URL")
        
    transport = get_onvif_transport(timeout=10.0)
    # Add a secondary fail-safe timeout for the constructor itself
    async with asyncio.timeout(15.0):
        device = await asyncio.to_thread(ONVIFCamera, host, port, user or "", password or "", adjust_time=True, transport=transport)
    ptz_service = await asyncio.to_thread(device.create_ptz_service)
    media_service = await asyncio.to_thread(device.create_media_service)
    
    # Use cached profile token if available, otherwise fetch first profile
    token = camera.onvif_profile_token
    if not token:
        profiles = await asyncio.to_thread(media_service.GetProfiles)
        if not profiles:
            raise ValueError("No ONVIF profiles found for camera")
        token = profiles[0].token
        
    return ptz_service, token

async def ptz_continuous_move(camera: "models.Camera", pan: float, tilt: float, zoom: float):
    """Trigger continuous movement via ONVIF."""
    try:
        ptz, token = await get_ptz_service(camera)
        
        # Build velocity dynamically to avoid sending 0-commands to axes that should stay still.
        # Some cameras are sensitive to receiving PanTilt {0,0} when only Zoom is intended.
        velocity = {}
        if pan != 0 or tilt != 0:
            velocity['PanTilt'] = {'x': pan, 'y': tilt}
        if zoom != 0:
            velocity['Zoom'] = {'x': zoom}
            
        if not velocity:
            logger.debug(f"PTZ Move for {camera.name} ignored: all axes are 0")
            return True

        request = {
            'ProfileToken': token,
            'Velocity': velocity
        }
        
        logger.info(f"Sending PTZ ContinuousMove to {camera.name}: {request}")
        await asyncio.to_thread(ptz.ContinuousMove, request)
        return True
    except Exception as e:
        logger.error(f"PTZ Move failed for {camera.name}: {e}", exc_info=True)
        return False

async def ptz_stop(camera: "models.Camera"):
    """Stop all PTZ movement."""
    try:
        ptz, token = await get_ptz_service(camera)
        await asyncio.to_thread(ptz.Stop, {'ProfileToken': token, 'PanTilt': True, 'Zoom': True})
        return True
    except Exception as e:
        logger.error(f"PTZ Stop failed for {camera.name}: {e}")
        return False

async def ptz_set_home(camera: "models.Camera"):
    """Set the current position as the PTZ home position with fallback to Preset 1."""
    try:
        ptz, token = await get_ptz_service(camera)
        try:
            # 1. Attempt standard ONVIF SetHomePosition
            await asyncio.to_thread(ptz.SetHomePosition, {'ProfileToken': token})
            logger.info(f"Set PTZ Home Position for {camera.name}")
            return True
        except Exception as e:
            logger.warning(f"Standard PTZ SetHomePosition failed for {camera.name}, attempting fallback: {e}")
            
            # 2. Fallback: Attempt to update a preset named "Home" or "1"
            presets = await get_ptz_presets(camera)
            target_preset = None
            
            for p in presets:
                if p['name'].lower() == 'home':
                    target_preset = p['token']
                    break
            
            if not target_preset:
                for p in presets:
                    if p['name'] == '1' or p['token'] == '1':
                        target_preset = p['token']
                        break
            
            if target_preset:
                logger.info(f"Attempting PTZ SetHome fallback to existing Preset '{target_preset}' for {camera.name}")
                await asyncio.to_thread(ptz.SetPreset, {
                    'ProfileToken': token,
                    'PresetToken': target_preset
                })
                return True
            else:
                # 3. Last Resort: Attempt to CREATE a new preset named "Home"
                logger.info(f"Attempting to CREATE a new 'Home' preset for PTZ fallback on {camera.name}")
                try:
                    await asyncio.to_thread(ptz.SetPreset, {
                        'ProfileToken': token,
                        'PresetName': 'Home'
                    })
                    return True
                except Exception as create_err:
                    logger.error(f"Failed to create new Home preset for {camera.name}: {create_err}")
            
            logger.error(f"No suitable Home preset found and creation failed for {camera.name}")
            return False
    except Exception as e:
        logger.error(f"PTZ SetHome failed for {camera.name}: {e}")
        return False

async def ptz_goto_home(camera: "models.Camera"):
    """Move the PTZ to the configured home position with fallback to Preset 1."""
    try:
        ptz, token = await get_ptz_service(camera)
        try:
            # 1. Attempt standard ONVIF GotoHomePosition
            await asyncio.to_thread(ptz.GotoHomePosition, {'ProfileToken': token})
            logger.info(f"Triggered standard PTZ GotoHomePosition for {camera.name}")
            return True
        except Exception as e:
            logger.warning(f"Standard PTZ GotoHomePosition failed for {camera.name}, attempting fallback: {e}")
            
            # 2. Fallback: Attempt to move to a preset named "Home" or "1"
            presets = await get_ptz_presets(camera)
            target_preset = None
            
            # Try to find "Home" (case insensitive)
            for p in presets:
                if p['name'].lower() == 'home':
                    target_preset = p['token']
                    break
            
            # If not found, try to find preset "1"
            if not target_preset:
                for p in presets:
                    if p['name'] == '1' or p['token'] == '1':
                        target_preset = p['token']
                        break
            
            if target_preset:
                logger.info(f"Attempting PTZ Home fallback to Preset '{target_preset}' for {camera.name}")
                await asyncio.to_thread(ptz.GotoPreset, {
                    'ProfileToken': token,
                    'PresetToken': target_preset
                })
                return True
            
            logger.error(f"PTZ Home fallback failed for {camera.name}: No 'Home' or '1' preset found.")
            return False
    except Exception as e:
        logger.error(f"PTZ GotoHomePosition failed for {camera.name}: {e}")
        return False

async def ptz_goto_preset(camera: "models.Camera", preset_token: str):
    """Move the PTZ to a specific preset token."""
    try:
        ptz, token = await get_ptz_service(camera)
        await asyncio.to_thread(ptz.GotoPreset, {
            'ProfileToken': token,
            'PresetToken': preset_token
        })
        logger.info(f"Triggered PTZ GotoPreset (Token: {preset_token}) for {camera.name}")
        return True
    except Exception as e:
        logger.error(f"PTZ GotoPreset failed for {camera.name}: {e}")
        return False

async def get_ptz_presets(camera: "models.Camera"):
    """Retrieve list of defined PTZ presets."""
    try:
        ptz, token = await get_ptz_service(camera)
        presets = await asyncio.to_thread(ptz.GetPresets, {'ProfileToken': token})
        return [{"token": p.token, "name": p.Name} for p in presets]
    except Exception as e:
        logger.error(f"Failed to get PTZ presets for {camera.name}: {e}")
        return []

async def _detect_onvif_capabilities(device: ONVIFCamera, profile_token: Optional[str] = None):
    """Helper to detect capabilities for a given ONVIF device object."""
    features = {
        "ptz_can_pan_tilt": False, 
        "ptz_can_zoom": False,
        "ptz_can_home": False,
        "onvif_can_events": False,
        "audio_enabled": False
    }
    
    # 1. Detect Events Capability
    try:
        capabilities = await asyncio.to_thread(device.devicemgmt.GetCapabilities)
        if hasattr(capabilities, 'Events') and capabilities.Events:
            # To be absolutely sure, try to create the events service
            await asyncio.to_thread(device.create_events_service)
            features["onvif_can_events"] = True
    except Exception as e:
        logger.debug(f"Event capability detection failed: {e}")

    # 2. Detect PTZ Capabilities
    try:
        ptz_service = await asyncio.to_thread(device.create_ptz_service)
        media_service = await asyncio.to_thread(device.create_media_service)
        
        token = profile_token
        if not token:
            profiles = await asyncio.to_thread(media_service.GetProfiles)
            if profiles: token = profiles[0].token
        
        if token:
            configurations = await asyncio.to_thread(ptz_service.GetConfigurations)
            if configurations:
                config = configurations[0]
                for c in configurations:
                    if hasattr(c, 'token') and c.token == token:
                        config = c
                        break
                
                configs = await asyncio.to_thread(ptz_service.GetConfigurationOptions, {'ConfigurationToken': config.token})
                if configs and hasattr(configs, 'Spaces'):
                    spaces = configs.Spaces
                    if hasattr(spaces, 'ContinuousPanTiltVelocitySpace') and spaces.ContinuousPanTiltVelocitySpace:
                        features["ptz_can_pan_tilt"] = True
                    if hasattr(spaces, 'ContinuousZoomVelocitySpace') and spaces.ContinuousZoomVelocitySpace:
                        features["ptz_can_zoom"] = True
                        # Optional checks for relative/absolute zoom if needed
                
                # 3. Detect Home Support (Native or Fallback)
                try:
                    if hasattr(ptz_service, 'GotoHomePosition'):
                        features["ptz_can_home"] = True
                except:
                    pass
                
                if not features["ptz_can_home"]:
                    try:
                        presets = await asyncio.to_thread(ptz_service.GetPresets, {'ProfileToken': token})
                        for p in presets:
                            p_name = str(p.Name).lower()
                            if p_name == "home" or p_name == "1" or str(p.token) == "1":
                                features["ptz_can_home"] = True
                                break
                    except:
                        pass
    except Exception as e:
        logger.debug(f"PTZ capability detection failed: {e}")

    # 4. Detect Audio Capability
    try:
        # Check if the profile has an audio source configuration
        # This is the most reliable way to know if audio is available for the current profile
        media_service = await asyncio.to_thread(device.create_media_service)
        profiles = await asyncio.to_thread(media_service.GetProfiles)
        
        target_profile = None
        if profile_token:
            for p in profiles:
                if p.token == profile_token:
                    target_profile = p
                    break
        
        if not target_profile and profiles:
            target_profile = profiles[0]
            
        if target_profile and hasattr(target_profile, 'AudioSourceConfiguration') and target_profile.AudioSourceConfiguration:
            features["audio_enabled"] = True
            logger.info(f"Audio detected for ONVIF device (Profile: {target_profile.token})")
        else:
            # Secondary check: Are there any audio sources at all?
            try:
                sources = await asyncio.to_thread(media_service.GetAudioSources)
                if sources:
                    features["audio_enabled"] = True
            except: pass
    except Exception as e:
        logger.debug(f"Audio capability detection failed: {e}")
        
    return features

async def get_onvif_features(camera: "models.Camera"):
    """Detect supported ONVIF features (Pan/Tilt, Zoom, Events) for a camera."""
    try:
        host = camera.onvif_host
        port = camera.onvif_port or 80
        user = camera.onvif_username
        password = camera.onvif_password
        
        # Fallback to RTSP URL parsing if ONVIF details are missing
        if not host:
            from urllib.parse import urlparse
            parsed = urlparse(camera.rtsp_url)
            host = parsed.hostname
            if not user and parsed.username: user = parsed.username
            if not password and parsed.password: password = parsed.password

        if not host:
            return {
                "ptz_can_pan_tilt": False, "ptz_can_zoom": False,
                "ptz_can_home": False, "onvif_can_events": False,
                "audio_enabled": False
            }

        transport = get_onvif_transport(timeout=5.0)
        async with asyncio.timeout(10.0):
            device = await asyncio.to_thread(ONVIFCamera, host, port, user or "", password or "", adjust_time=True, transport=transport)
        
        return await _detect_onvif_capabilities(device, camera.onvif_profile_token)
    except Exception as e:
        logger.error(f"Failed to detect ONVIF features for {camera.name}: {e}")
        return {
            "ptz_can_pan_tilt": False, "ptz_can_zoom": False,
            "ptz_can_home": False, "onvif_can_events": False,
            "audio_enabled": False
        }

async def probe_and_update_onvif_features(camera_id: int, db_session_factory=None):
    """Probe ONVIF and update the database. Designed for BackgroundTasks."""
    from database import get_db_ctx
    import crud
    
    with get_db_ctx() as db:
        camera = crud.get_camera(db, camera_id)
        if not camera:
            return
            
        features = await get_onvif_features(camera)
        
        camera.ptz_can_pan_tilt = features["ptz_can_pan_tilt"]
        camera.ptz_can_zoom = features["ptz_can_zoom"]
        camera.ptz_can_home = features["ptz_can_home"]
        camera.onvif_can_events = features["onvif_can_events"]
        camera.audio_enabled = features["audio_enabled"]
        db.commit()
        logger.info(f"Updated ONVIF features for camera {camera_id}: {features}")
