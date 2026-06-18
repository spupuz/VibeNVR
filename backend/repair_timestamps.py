"""
Repair script to fix timezone offset on imported events.
Events imported with naive timestamps (interpreted as UTC) need to be adjusted.
"""

import os
import sys

sys.path.append("/app")

from database import SessionLocal
from models import Event
from datetime import timedelta
from zoneinfo import ZoneInfo

# Get timezone
TZ_NAME = os.environ.get("TZ", "Europe/Rome")
LOCAL_TZ = ZoneInfo(TZ_NAME)


def _fix_event_timestamp(event: Event) -> bool:
    """
    Checks and fixes the timezone offset for a single event based on its filename.
    Returns True if the event was modified, False otherwise.
    """
    # Check if timestamp is timezone-aware
    ts = event.timestamp_start
    if ts is None:
        return False

    # If the timestamp is naive or marked as UTC but should be local,
    # we need to interpret the filename to check the intended time.
    # The file_path contains the actual time in the filename.

    file_path = event.file_path
    if not file_path:
        return False

    # Extract time from filename (e.g., "17-45-03.mp4")
    filename = os.path.basename(file_path)
    name_part = filename.rsplit(".", 1)[0]  # Remove extension

    # Try to parse HH-MM-SS from filename
    parts = name_part.split("-")
    if len(parts) >= 3:
        try:
            file_hour = int(parts[0])
            # Other parts like minute and second exist but we only need the hour to fix the timezone offset

            # Get the hour from DB timestamp
            # PostgreSQL returns aware datetime in UTC if stored with timezone
            # When displayed, it gets converted to local time (+1 for Rome)

            # If file says 17:45 but display shows 18:45, the DB has 17:45 UTC
            # We want DB to have 16:45 UTC so display shows 17:45 Rome

            # Check if there's a mismatch
            db_hour = ts.hour

            # If ts is aware (has tzinfo), convert to UTC to get stored hour
            if ts.tzinfo:
                ts_utc = ts.astimezone(ZoneInfo("UTC"))
                db_hour_utc = ts_utc.hour
            else:
                db_hour_utc = db_hour

            # The file_hour is the intended LOCAL hour
            # If db_hour_utc == file_hour, it was stored as UTC but meant as local
            # We need to shift it back by the offset (1 hour for Rome in winter)

            if db_hour_utc == file_hour:
                # Stored as UTC but meant as local - fix by subtracting offset
                # For Rome (UTC+1), subtract 1 hour from the stored time
                corrected_ts = ts - timedelta(hours=1)

                event.timestamp_start = corrected_ts
                if event.timestamp_end:
                    event.timestamp_end = event.timestamp_end - timedelta(hours=1)

                print(f"Fixed: {filename} - {ts} → {corrected_ts}")
                return True

        except (ValueError, IndexError):
            return False

    return False


def repair_timestamps():
    print(f"Repairing event timestamps for timezone: {TZ_NAME}")
    db = SessionLocal()

    try:
        # Get all events
        events = db.query(Event).all()
        fixed_count = 0

        for event in events:
            if _fix_event_timestamp(event):
                fixed_count += 1

        db.commit()
        print(f"\nRepaired {fixed_count} events.")

    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    repair_timestamps()
