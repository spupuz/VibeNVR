import os
import database
import models

def test_path_validation():
    # Initialize schema for in-memory db
    models.Base.metadata.create_all(bind=database.engine)

    from event_file_service import is_path_safe
    from sync_recordings import is_safe_path

    assert not is_safe_path('/data_backup/secret.txt')
    assert is_safe_path('/data/event1.mp4')
    assert not is_path_safe('/data_backup/secret.txt')
    assert is_path_safe('/data/event1.mp4')
    print("Path validation tests passed")
