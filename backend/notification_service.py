import os
import datetime
import time
import html
import smtplib
import threading
import requests
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from typing import Optional

import models
import database
import utils
import crud

logger = logging.getLogger(__name__)

def _send_telegram_notification(
    camera,
    event_type: str,
    details: dict,
    image_path: Optional[str],
    tg_token: str,
    tg_chat: str,
    global_tg_proxy_enabled: bool,
    global_tg_proxy_url: str,
    global_tg_proxy_retries: int,
    global_tg_proxy_retry_delay: int,
    global_attach_telegram: bool,
):
    import datetime
    import html
    import time

    # Format Timestamp
    ts_raw = details.get("timestamp")
    ts_formatted = ts_raw
    try:
        if ts_raw:
            dt = datetime.datetime.fromisoformat(str(ts_raw))
            ts_formatted = dt.strftime("%Y-%m-%d %H:%M:%S")
    except:
        pass

    should_notify_tg = False
    if event_type == "event_start":
        should_notify_tg = camera.notify_start_telegram
    elif event_type == "camera_health":
        should_notify_tg = camera.notify_health_telegram

    if not (should_notify_tg and tg_token and tg_chat):
        return

    try:
        # Use HTML parse mode as it's more robust than Markdown for automated content
        safe_name = html.escape(camera.name)
        safe_ts = html.escape(ts_formatted or "")

        if event_type == "event_start":
            source = details.get("source", "Standard")
            prefix = (
                "🤖 <b>AI</b> "
                if "AI Engine" in source
                else ("📷 <b>Edge</b> " if source == "ONVIF Edge" else "🚨 ")
            )
            caption = f"{prefix}<b>Motion Detected!</b>\n📷 Camera: {safe_name}\n⏰ Time: {safe_ts}"

            # Add AI metadata if available
            ai_meta = details.get("ai_metadata")
            if ai_meta and isinstance(ai_meta, list):
                labels = sorted(
                    list(
                        set(
                            [
                                str(r.get("label")).capitalize()
                                for r in ai_meta
                                if r.get("label")
                            ]
                        )
                    )
                )
                if labels:
                    safe_labels = html.escape(", ".join(labels))
                    caption += f"\n🔍 Objects: {safe_labels}"
        elif event_type == "camera_health":
            safe_title = html.escape(details.get("title", "Camera Alert"))
            safe_msg = html.escape(details.get("message", ""))
            caption = f"<b>{safe_title}</b>\n{safe_msg}"
        else:
            caption = html.escape(caption)

        # Setup Proxy if enabled globally
        proxies = None
        if global_tg_proxy_enabled and global_tg_proxy_url:
            proxies = {"http": global_tg_proxy_url, "https": global_tg_proxy_url}

        # Check both Camera setting AND Global setting (Master switch logic)
        last_err = None
        for attempt in range(max(1, global_tg_proxy_retries)):
            try:
                if (
                    image_path
                    and camera.notify_attach_image_telegram
                    and global_attach_telegram
                ):
                    # Send Photo
                    url = f"https://api.telegram.org/bot{tg_token}/sendPhoto"
                    with open(image_path, "rb") as f:
                        files = {"photo": f}
                        data = {
                            "chat_id": tg_chat,
                            "caption": caption,
                            "parse_mode": "HTML",
                        }
                        resp = requests.post(
                            url, data=data, files=files, proxies=proxies, timeout=10, allow_redirects=False
                        )
                        resp.raise_for_status()
                else:
                    # Send Text
                    url = f"https://api.telegram.org/bot{tg_token}/sendMessage"
                    resp = requests.post(
                        url,
                        json={
                            "chat_id": tg_chat,
                            "text": caption,
                            "parse_mode": "HTML",
                        },
                        proxies=proxies,
                        timeout=5,
                        allow_redirects=False
                    )
                    resp.raise_for_status()

                # If we succeed, break the retry loop
                break
            except Exception as e:
                last_err = e
                if attempt < max(1, global_tg_proxy_retries) - 1:
                    logger.warning(
                        f"[NOTIFY] Telegram attempt {attempt + 1} failed ({e}), retrying in {global_tg_proxy_retry_delay}s..."
                    )
                    time.sleep(global_tg_proxy_retry_delay)
                else:
                    logger.error(
                        f"[NOTIFY] Telegram failed after {global_tg_proxy_retries} attempts: {e}"
                    )
    except Exception as e:
        logger.error(f"[NOTIFY] Telegram unexpected error: {e}")


def _send_email_notification(
    camera,
    event_type: str,
    details: dict,
    image_path: Optional[str],
    smtp_server: str,
    smtp_port: int,
    smtp_user: str,
    smtp_pass: str,
    smtp_from: str,
    smtp_verify_cert: bool,
    email_recipient: str,
    global_attach_email: bool,
):
    import os
    import smtplib
    import datetime
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    from email.mime.image import MIMEImage

    should_notify_email = False
    if event_type == "event_start":
        should_notify_email = camera.notify_start_email
        subject = f"Motion Detected: {camera.name}"
        body_title = "Motion Detected"
    elif event_type == "camera_health":
        should_notify_email = camera.notify_health_email
        subject = details.get("title", f"Camera Alert: {camera.name}")
        body_title = "Camera Health Alert"

    if not (should_notify_email and smtp_server and email_recipient):
        return

    try:
        msg = MIMEMultipart()
        msg["Subject"] = subject
        msg["From"] = smtp_from or "vibenvr@localhost"
        msg["To"] = email_recipient

        color_theme = "#ef4444" if event_type == "event_start" else "#f59e0b"
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                    background-color: #f4f4f5;
                    margin: 0;
                    padding: 0;
                    color: #18181b;
                }}
                .container {{
                    max-width: 600px;
                    margin: 40px auto;
                    background-color: #ffffff;
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }}
                .header {{
                    background-color: #000000;
                    padding: 24px;
                    text-align: center;
                }}
                .header h1 {{
                    color: #ffffff;
                    margin: 0;
                    font-size: 24px;
                    font-weight: 600;
                    letter-spacing: -0.025em;
                }}
                .content {{
                    padding: 32px 24px;
                }}
                .title {{
                    font-size: 20px;
                    font-weight: 600;
                    margin-bottom: 24px;
                    color: {color_theme};
                }}
                .details-table {{
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 24px;
                }}
                .details-table td {{
                    padding: 12px 0;
                    border-bottom: 1px solid #e4e4e7;
                }}
                .details-table td:first-child {{
                    font-weight: 600;
                    color: #71717a;
                    width: 120px;
                }}
                .footer {{
                    background-color: #fafafa;
                    padding: 24px;
                    text-align: center;
                    border-top: 1px solid #e4e4e7;
                    color: #a1a1aa;
                    font-size: 14px;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>VibeNVR</h1>
                </div>
                <div class="content">
                    <div class="title">{body_title}</div>
                    <table class="details-table">
                        <tr>
                            <td>Camera</td>
                            <td><strong>{camera.name}</strong></td>
                        </tr>
                        <tr>
                            <td>Source</td>
                            <td>{details.get('source', 'Standard')}</td>
                        </tr>
                        <tr>
                            <td>Event</td>
                            <td>{details.get('message', f'Type: {event_type}')}</td>
                        </tr>
                        <tr>
                            <td>Time</td>
                            <td>{details.get('timestamp', datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'))}</td>
                        </tr>
                    </table>
                </div>
                <div class="footer">
                    This is an automated alert generated by your VibeNVR system.
                </div>
            </div>
        </body>
        </html>
        """
        msg.attach(MIMEText(html_body, "html"))

        if image_path and camera.notify_attach_image_email and global_attach_email:
            try:
                with open(image_path, "rb") as f:
                    img = MIMEImage(f.read())
                    img.add_header(
                        "Content-Disposition",
                        "attachment",
                        filename=os.path.basename(image_path),
                    )
                    msg.attach(img)
            except Exception as e:
                logger.warning(f"[NOTIFY] Could not attach image {image_path} to email: {e}")


        # Connect and send
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.set_debuglevel(0)
        server.ehlo()
        if server.has_extn("starttls"):
            import ssl

            context = ssl.create_default_context()
            if not smtp_verify_cert:
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE
            server.starttls(context=context)
            server.ehlo()

        if smtp_user and smtp_pass:
            server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        logger.info(f"[NOTIFY] Email sent to {email_recipient}")
    except Exception as e:
        logger.error(f"[NOTIFY] Email failed: {e}")


def _send_webhook_notification(
    camera, event_type: str, details: dict, webhook_url: str
):

    should_notify_webhook = False
    if event_type == "event_start":
        should_notify_webhook = camera.notify_start_webhook
    elif event_type == "movie_end":
        should_notify_webhook = camera.notify_end_webhook
    elif event_type == "camera_health":
        should_notify_webhook = camera.notify_health_webhook

    if not (should_notify_webhook and webhook_url):
        return

    if not utils.is_safe_webhook_url(webhook_url):
        logger.error(f"[NOTIFY] Webhook failed: Unsafe webhook URL blocked")
        return

    try:
        requests.post(
            webhook_url,
            json={
                "camera_name": camera.name,
                "event": event_type,
                "title": details.get("title"),
                "message": details.get("message"),
                "timestamp": details.get("timestamp"),
                "file_path": details.get("file_path"),
                "source": details.get("source", "Standard"),
            },
            timeout=5,
            allow_redirects=False,
        )
    except Exception as e:
        logger.error(f"[NOTIFY] Webhook failed: {e}")


def send_notifications(camera_id: int, event_type: str, details: dict):
    """Async wrapper for sending notifications using Global + Camera settings"""

    def _send():
        # Open a new DB session for this thread
        db_notify = database.SessionLocal()
        try:
            # Re-fetch camera to avoid DetachedInstanceError
            camera = (
                db_notify.query(models.Camera)
                .filter(models.Camera.id == camera_id)
                .first()
            )
            if not camera:
                logger.warning(
                    f"[NOTIFY] Camera {camera_id} not found, aborting notification."
                )
                return

            # Helper to get setting
            def get_conf(key):
                s = (
                    db_notify.query(models.SystemSettings)
                    .filter(models.SystemSettings.key == key)
                    .first()
                )
                return s.value if s else ""

            # Fetch Global Settings
            smtp_server = get_conf("smtp_server")
            smtp_port = int(get_conf("smtp_port") or "587")
            smtp_user = get_conf("smtp_username")
            smtp_pass = get_conf("smtp_password")
            smtp_from = get_conf("smtp_from_email")
            smtp_verify_cert = (
                get_conf("smtp_verify_cert") != "false"
            )  # Default to True unless explicitly "false"

            global_tg_token = get_conf("telegram_bot_token")
            global_tg_chat = get_conf("telegram_chat_id")
            global_tg_proxy_enabled = (
                str(get_conf("telegram_proxy_enabled")).lower() == "true"
            )
            global_tg_proxy_url = get_conf("telegram_proxy_url")
            global_tg_proxy_retries = int(get_conf("telegram_proxy_retries") or "3")
            global_tg_proxy_retry_delay = int(
                get_conf("telegram_proxy_retry_delay") or "2"
            )
            global_email_recipient = get_conf("notify_email_recipient")
            global_webhook_url = get_conf("notify_webhook_url")

            # Global Attach Settings (Default to True if not set)
            global_attach_email = get_conf("global_attach_image_email") != "false"
            global_attach_telegram = get_conf("global_attach_image_telegram") != "false"

            # Resolve effective config based on Event Type
            is_health_event = event_type == "camera_health"

            if is_health_event:
                # Health Specific -> Global Fallback
                tg_token = camera.notify_health_telegram_token or global_tg_token
                tg_chat = camera.notify_health_telegram_chat_id or global_tg_chat
                email_recipient = (
                    camera.notify_health_email_recipient or global_email_recipient
                )
                webhook_url = camera.notify_health_webhook_url or global_webhook_url
            else:
                # Standard (Motion/Event) -> Global Fallback
                tg_token = camera.notify_telegram_token or global_tg_token
                tg_chat = camera.notify_telegram_chat_id or global_tg_chat
                email_recipient = camera.notify_email_address or global_email_recipient
                webhook_url = camera.notify_webhook_url or global_webhook_url

            # Prepare Attachment (Snapshot)
            file_path = details.get("file_path")
            image_path = None

            # If path provided
            if file_path:
                # If it's a video, try to find the timestamp-based thumb or .jpg replacement
                if file_path.endswith(".mp4") or file_path.endswith(".mkv"):
                    possible_jpg = file_path.rsplit(".", 1)[0] + ".jpg"
                    # Check if exists (need to map path first)
                    # We defer check until path mapping is done
                    image_path = possible_jpg
                elif file_path.endswith(".jpg"):
                    image_path = file_path

            # Fix path mapping (Internal Container -> Backend /data volume)
            def map_path(p):
                if not p:
                    return None
                if p.startswith("/var/lib/motion"):
                    return p.replace("/var/lib/motion", "/data", 1)
                elif p.startswith("/var/lib/vibe/recordings"):
                    return p.replace("/var/lib/vibe/recordings", "/data", 1)
                return p

            if image_path:
                image_path = map_path(image_path)
                import time
                
                # Wait for file to be created by motion (up to 3 seconds)
                for _ in range(15):
                    if os.path.exists(image_path) and os.path.getsize(image_path) > 0:
                        break
                    time.sleep(0.2)
                    
                if not os.path.exists(image_path) or os.path.getsize(image_path) == 0:
                    # If derived jpg doesn't exist, try original file if it was a jpg
                    if file_path.endswith(".jpg"):
                        orig_mapped = map_path(file_path)
                        for _ in range(15):
                            if os.path.exists(orig_mapped) and os.path.getsize(orig_mapped) > 0:
                                break
                            time.sleep(0.2)
                            
                        if os.path.exists(orig_mapped) and os.path.getsize(orig_mapped) > 0:
                            image_path = orig_mapped
                        else:
                            image_path = None
                    else:
                        image_path = None

            if image_path:
                logger.info(f"[NOTIFY] Attaching image: {image_path}")

            _send_telegram_notification(
                camera=camera,
                event_type=event_type,
                details=details,
                image_path=image_path,
                tg_token=tg_token,
                tg_chat=tg_chat,
                global_tg_proxy_enabled=global_tg_proxy_enabled,
                global_tg_proxy_url=global_tg_proxy_url,
                global_tg_proxy_retries=global_tg_proxy_retries,
                global_tg_proxy_retry_delay=global_tg_proxy_retry_delay,
                global_attach_telegram=global_attach_telegram,
            )

            _send_email_notification(
                camera=camera,
                event_type=event_type,
                details=details,
                image_path=image_path,
                smtp_server=smtp_server,
                smtp_port=smtp_port,
                smtp_user=smtp_user,
                smtp_pass=smtp_pass,
                smtp_from=smtp_from,
                smtp_verify_cert=smtp_verify_cert,
                email_recipient=email_recipient,
                global_attach_email=global_attach_email,
            )

            _send_webhook_notification(
                camera=camera,
                event_type=event_type,
                details=details,
                webhook_url=webhook_url,
            )

        except Exception as e:
            logger.error(f"[NOTIFY] General error: {e}")
        finally:
            db_notify.close()

    threading.Thread(target=_send, daemon=True).start()

