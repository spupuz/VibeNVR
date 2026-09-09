import pytest

def test_fix_thumbnails_yield_per():
    """Verify that fix_thumbnails.py uses yield_per on the events query to prevent memory bloat"""
    with open('backend/fix_thumbnails.py', 'r') as f:
        content = f.read()
        assert 'yield_per(1000)' in content
        assert '.all()' not in content.split('events_query = db.query(Event)')[1].split('fixed = 0')[0]
        assert 'events_query.count()' in content

def test_repair_timestamps_yield_per():
    """Verify that repair_timestamps.py uses yield_per on the events query to prevent memory bloat"""
    with open('backend/repair_timestamps.py', 'r') as f:
        content = f.read()
        assert 'yield_per(1000)' in content
        assert '.all()' not in content.split('events = db.query(Event)')[1].split('fixed_count = 0')[0]
        assert 'events.count()' in content

def test_cleanup_orphans_yield_per():
    """Verify that cleanup_orphans.py uses yield_per and with_entities on the events query to prevent memory bloat"""
    with open('backend/cleanup_orphans.py', 'r') as f:
        content = f.read()
        assert 'yield_per(1000)' in content
        assert '.all()' not in content.split('events = db.query(Event)')[1].split('valid_paths = set()')[0]
        assert 'with_entities' in content
