import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
import database
import models
import os
import requests
import threading
import datetime
import logging
import html
import time

logger = logging.getLogger(__name__)

def map_path(p: str) -> str | None:
    if not p:
        return None
    if p.startswith("/var/lib/motion"):
        return p.replace("/var/lib/motion", "/data", 1)
    elif p.startswith("/var/lib/vibe/recordings"):
        return p.replace("/var/lib/vibe/recordings", "/data", 1)
    return p

def _get_image_path(file_path: str | None) -> str | None:
    image_path = None
    if file_path:
        if file_path.endswith(".mp4") or file_path.endswith(".mkv"):
            image_path = file_path.rsplit('.', 1)[0] + ".jpg"
        elif file_path.endswith(".jpg"):
            image_path = file_path

    if image_path:
        image_path = map_path(image_path)
        if not os.path.exists(image_path):
            if file_path.endswith(".jpg"):
                orig_mapped = map_path(file_path)
                if orig_mapped and os.path.exists(orig_mapped):
                    image_path = orig_mapped
                else:
                    image_path = None
            else:
                image_path = None
    return image_path

def _send_telegram(camera, event_type, details, image_path, tg_token, tg_chat, global_tg_proxy_enabled, global_tg_proxy_url, global_tg_proxy_retries, global_tg_proxy_retry_delay, global_attach_telegram):
    ts_raw = details.get('timestamp')
    ts_formatted = ts_raw
    try:
        if ts_raw:
            dt = datetime.datetime.fromisoformat(str(ts_raw))
            ts_formatted = dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        pass

    should_notify_tg = False
    if event_type == "event_start":
        should_notify_tg = camera.notify_start_telegram
    elif event_type == "camera_health":
        should_notify_tg = camera.notify_health_telegram

    if should_notify_tg and tg_token and tg_chat:
        try:
            safe_name = html.escape(camera.name)
            safe_ts = html.escape(ts_formatted or "")

            if event_type == "event_start":
                source = details.get("source", "Standard")
                prefix = "🤖 <b>AI</b> " if "AI Engine" in source else ("📷 <b>Edge</b> " if source == "ONVIF Edge" else "🚨 ")
                caption = f"{prefix}<b>Motion Detected!</b>\n📷 Camera: {safe_name}\n⏰ Time: {safe_ts}"

                ai_meta = details.get("ai_metadata")
                if ai_meta and isinstance(ai_meta, list):
                    labels = sorted(list(set([str(r.get("label")).capitalize() for r in ai_meta if r.get("label")])))
                    if labels:
                        safe_labels = html.escape(', '.join(labels))
                        caption += f"\n🔍 Objects: {safe_labels}"
            elif event_type == "camera_health":
                safe_title = html.escape(details.get('title', 'Camera Alert'))
                safe_msg = html.escape(details.get('message', ''))
                caption = f"<b>{safe_title}</b>\n{safe_msg}"
            else:
                caption = html.escape("Notification event")

            proxies = None
            if global_tg_proxy_enabled and global_tg_proxy_url:
                proxies = {"http": global_tg_proxy_url, "https": global_tg_proxy_url}

            for attempt in range(max(1, global_tg_proxy_retries)):
                try:
                    if image_path and camera.notify_attach_image_telegram and global_attach_telegram:
                        url = f"https://api.telegram.org/bot{tg_token}/sendPhoto"
                        with open(image_path, 'rb') as f:
                            files = {'photo': f}
                            data = {'chat_id': tg_chat, 'caption': caption, 'parse_mode': 'HTML'}
                            resp = requests.post(url, data=data, files=files, proxies=proxies, timeout=10)
                            resp.raise_for_status()
                    else:
                        url = f"https://api.telegram.org/bot{tg_token}/sendMessage"
                        resp = requests.post(url, json={
                            "chat_id": tg_chat,
                            "text": caption,
                            "parse_mode": "HTML"
                        }, proxies=proxies, timeout=5)
                        resp.raise_for_status()

                    break
                except Exception as e:
                    if attempt < max(1, global_tg_proxy_retries) - 1:
                        logger.warning(f"[NOTIFY] Telegram attempt {attempt+1} failed ({e}), retrying in {global_tg_proxy_retry_delay}s...")
                        time.sleep(global_tg_proxy_retry_delay)
                    else:
                        logger.error(f"[NOTIFY] Telegram failed after {global_tg_proxy_retries} attempts: {e}")
        except Exception as e:
            logger.error(f"[NOTIFY] Telegram unexpected error: {e}")

def _send_email(camera, event_type, details, image_path, smtp_server, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_verify_cert, email_recipient, global_attach_email):
    should_notify_email = False
    subject = ""
    body_title = ""
    if event_type == "event_start":
        should_notify_email = camera.notify_start_email
        subject = f"Motion Detected: {camera.name}"
        body_title = "Motion Detected"
    elif event_type == "camera_health":
        should_notify_email = camera.notify_health_email
        subject = details.get('title', f"Camera Alert: {camera.name}")
        body_title = "Camera Health Alert"

    if should_notify_email and smtp_server and email_recipient:
        try:
            msg = MIMEMultipart()
            msg['Subject'] = subject
            msg['From'] = smtp_from or "vibenvr@localhost"
            msg['To'] = email_recipient

            ts_str = details.get('timestamp', datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            html_body = f"""
            <h2>{body_title}</h2>
            <p><b>Camera:</b> {camera.name}</p>
            <p><b>Source:</b> {details.get('source', 'Standard')}</p>
            <p>{details.get('message', f"Event: {event_type}")}</p>
            <p><b>Time:</b> {ts_str}</p>
            <p><i>VibeNVR Alert System</i></p>
            """
            msg.attach(MIMEText(html_body, 'html'))

            if image_path and camera.notify_attach_image_email and global_attach_email:
                with open(image_path, 'rb') as f:
                    img = MIMEImage(f.read())
                    img.add_header('Content-Disposition', 'attachment', filename=os.path.basename(image_path))
                    msg.attach(img)

            server = smtplib.SMTP(smtp_server, smtp_port)
            server.set_debuglevel(0)
            server.ehlo()
            if server.has_extn('starttls'):
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

def _send_webhook(camera, event_type, details, webhook_url):
    should_notify_webhook = False
    if event_type == "event_start":
        should_notify_webhook = camera.notify_start_webhook
    elif event_type == "movie_end":
        should_notify_webhook = camera.notify_end_webhook
    elif event_type == "camera_health":
        should_notify_webhook = camera.notify_health_webhook

    if should_notify_webhook and webhook_url:
        try:
            requests.post(webhook_url, json={
                "camera_name": camera.name,
                "event": event_type,
                "title": details.get("title"),
                "message": details.get("message"),
                "timestamp": details.get("timestamp"),
                "file_path": details.get("file_path"),
                "source": details.get("source", "Standard")
            }, timeout=5)
        except Exception as e:
            logger.error(f"[NOTIFY] Webhook failed: {e}")

def send_notifications(camera_id: int, event_type: str, details: dict):
    """Async wrapper for sending notifications using Global + Camera settings"""
    def _send():
        db_notify = database.SessionLocal()
        try:
            camera = db_notify.query(models.Camera).filter(models.Camera.id == camera_id).first()
            if not camera:
                logger.warning(f"[NOTIFY] Camera {camera_id} not found, aborting notification.")
                return

            def get_conf(key):
                s = db_notify.query(models.SystemSettings).filter(models.SystemSettings.key == key).first()
                return s.value if s else ""

            smtp_server = get_conf("smtp_server")
            smtp_port = int(get_conf("smtp_port") or "587")
            smtp_user = get_conf("smtp_username")
            smtp_pass = get_conf("smtp_password")
            smtp_from = get_conf("smtp_from_email")
            smtp_verify_cert = get_conf("smtp_verify_cert") != "false"

            global_tg_token = get_conf("telegram_bot_token")
            global_tg_chat = get_conf("telegram_chat_id")
            global_tg_proxy_enabled = str(get_conf("telegram_proxy_enabled")).lower() == "true"
            global_tg_proxy_url = get_conf("telegram_proxy_url")
            global_tg_proxy_retries = int(get_conf("telegram_proxy_retries") or "3")
            global_tg_proxy_retry_delay = int(get_conf("telegram_proxy_retry_delay") or "2")
            global_email_recipient = get_conf("notify_email_recipient")
            global_webhook_url = get_conf("notify_webhook_url")

            global_attach_email = get_conf("global_attach_image_email") != "false"
            global_attach_telegram = get_conf("global_attach_image_telegram") != "false"

            is_health_event = (event_type == "camera_health")

            if is_health_event:
                tg_token = camera.notify_health_telegram_token or global_tg_token
                tg_chat = camera.notify_health_telegram_chat_id or global_tg_chat
                email_recipient = camera.notify_health_email_recipient or global_email_recipient
                webhook_url = camera.notify_health_webhook_url or global_webhook_url
            else:
                tg_token = camera.notify_telegram_token or global_tg_token
                tg_chat = camera.notify_telegram_chat_id or global_tg_chat
                email_recipient = camera.notify_email_address or global_email_recipient
                webhook_url = camera.notify_webhook_url or global_webhook_url

            file_path = details.get("file_path")
            image_path = _get_image_path(file_path)

            if image_path:
                 logger.info(f"[NOTIFY] Attaching image: {image_path}")

            _send_telegram(
                camera, event_type, details, image_path,
                tg_token, tg_chat, global_tg_proxy_enabled, global_tg_proxy_url,
                global_tg_proxy_retries, global_tg_proxy_retry_delay, global_attach_telegram
            )

            _send_email(
                camera, event_type, details, image_path,
                smtp_server, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_verify_cert,
                email_recipient, global_attach_email
            )

            _send_webhook(camera, event_type, details, webhook_url)

        except Exception as e:
            logger.error(f"[NOTIFY] General error: {e}")
        finally:
            db_notify.close()

    threading.Thread(target=_send, daemon=True).start()
