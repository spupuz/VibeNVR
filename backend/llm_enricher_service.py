import os
import base64
import logging
import requests
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
import database
import models
import storage_service

logger = logging.getLogger(__name__)

DEFAULT_SYSTEM_PROMPT = (
    "You are a smart security camera analyst. "
    "In 1 or 2 concise sentences, describe what is happening in this security camera snapshot. "
    "Focus on relevant objects, people, animals, vehicles, clothing colors, and actions. "
    "Be direct and factual without preamble."
)

def is_enricher_enabled(db: Session) -> bool:
    """Check if the LLM enricher is globally enabled."""
    setting = db.query(models.SystemSettings).filter(models.SystemSettings.key == "llm_enricher_enabled").first()
    return bool(setting and setting.value and setting.value.lower() == "true")

def get_enricher_config(db: Session) -> Dict[str, Any]:
    """Retrieve all LLM enricher configuration keys."""
    keys = [
        "llm_enricher_enabled",
        "llm_enricher_base_url",
        "llm_enricher_api_key",
        "llm_enricher_model",
        "llm_enricher_prompt",
        "llm_enricher_filter_classes",  # Comma-separated classes to trigger on (empty = all)
    ]
    records = db.query(models.SystemSettings).filter(models.SystemSettings.key.in_(keys)).all()
    settings_map = {r.key: r.value for r in records}
    
    return {
        "enabled": settings_map.get("llm_enricher_enabled", "false").lower() == "true",
        "base_url": (settings_map.get("llm_enricher_base_url") or "http://localhost:11434/v1").rstrip("/"),
        "api_key": settings_map.get("llm_enricher_api_key") or "",
        "model": settings_map.get("llm_enricher_model") or "llama3.2-vision",
        "prompt": settings_map.get("llm_enricher_prompt") or DEFAULT_SYSTEM_PROMPT,
        "filter_classes": [
            c.strip().lower() for c in (settings_map.get("llm_enricher_filter_classes") or "").split(",") if c.strip()
        ],
    }

def should_enrich_event(config: Dict[str, Any], ai_metadata: Optional[str]) -> bool:
    """Determine if the event matches class filters configured for LLM enrichment."""
    if not config.get("enabled"):
        return False
        
    filter_classes = config.get("filter_classes")
    if not filter_classes:
        # If no filter classes configured, enrich all motion/detection events
        return True
        
    if not ai_metadata:
        return False
        
    # ai_metadata is comma-separated labels (e.g., "person, car")
    detected = [c.strip().lower() for c in ai_metadata.split(",") if c.strip()]
    for d in detected:
        if d in filter_classes:
            return True
    return False

def query_vision_llm(
    image_bytes: bytes,
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    timeout: int = 12
) -> Optional[str]:
    """Send image bytes to OpenAI-compatible Vision /chat/completions endpoint."""
    try:
        base64_img = base64.b64encode(image_bytes).decode("utf-8")
        url = f"{base_url}/chat/completions"
        
        headers = {
            "Content-Type": "application/json"
        }
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
            
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_img}"
                            }
                        }
                    ]
                }
            ],
            "max_tokens": 150,
            "temperature": 0.2
        }
        
        resp = requests.post(url, json=payload, headers=headers, timeout=timeout)
        if resp.status_code == 200:
            data = resp.json()
            choices = data.get("choices", [])
            if choices:
                message = choices[0].get("message", {})
                content = message.get("content", "")
                if isinstance(content, str):
                    return content.strip(), None
            return None, "Empty choices returned by model"
        else:
            err_msg = f"HTTP {resp.status_code}: {resp.text[:300]}"
            logger.warning(f"[LLM-ENRICHER] API request failed: {err_msg}")
            return None, err_msg
    except Exception as e:
        err_msg = str(e)
        logger.warning(f"[LLM-ENRICHER] Vision query failed: {err_msg}")
        return None, err_msg

def enrich_event_background(event_id: int, image_path: str):
    """Worker function to be executed asynchronously in background."""
    if not image_path:
        return
        
    db = database.SessionLocal()
    try:
        config = get_enricher_config(db)
        if not config["enabled"]:
            return
            
        event = db.query(models.Event).filter(models.Event.id == event_id).first()
        if not event:
            return
            
        if not should_enrich_event(config, event.ai_metadata):
            return
            
        local_path = storage_service.translate_path(image_path)
        if not local_path or not os.path.exists(local_path):
            return
            
        # Read image
        with open(local_path, "rb") as f:
            image_data = f.read()
            
        description, _ = query_vision_llm(
            image_bytes=image_data,
            base_url=config["base_url"],
            api_key=config["api_key"],
            model=config["model"],
            prompt=config["prompt"],
        )
        
        if description:
            event.ai_description = description
            db.commit()
            logger.info(f"[LLM-ENRICHER] Event #{event_id} successfully enriched: {description[:80]}...")
    except Exception as e:
        logger.error(f"[LLM-ENRICHER] Error enriching event #{event_id}: {e}")
    finally:
        db.close()

