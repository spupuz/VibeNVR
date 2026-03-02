import asyncio
from sqlalchemy.orm import Session
from database import SessionLocal
import models
import auth_service
import requests

def run():
    db = SessionLocal()
    admin = db.query(models.User).filter(models.User.role == "admin").first()
    if not admin:
        print("No admin found")
        return
        
    access_token = auth_service.create_access_token(data={"sub": admin.username})
    
    url = "http://localhost:5000/onvif/scan/stream?ip_range=192.168.1.0/24"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "x-scanner-user": "admin",
        "x-scanner-password": "password"
    }

    try:
        print(f"Connecting to {url}...")
        with requests.get(url, headers=headers, stream=True) as r:
            print(f"Status Code: {r.status_code}")
            for line in r.iter_lines():
                if line:
                    print(line.decode('utf-8'))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    run()
