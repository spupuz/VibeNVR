"""Isolated archival tests: SQLite, temporary files, and mocked external services."""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def archival():
    # Do not import the application's database/auth modules or read its .env.
    database = ModuleType("database")
    database.Base = declarative_base()
    routers = ModuleType("routers")
    routers.__path__ = []
    settings = ModuleType("routers.settings")
    settings.get_setting = Mock(return_value=None)
    sftp = ModuleType("sftp_client")
    sftp.upload_file = Mock(return_value=None)
    files = ModuleType("event_file_service")
    scratch = ROOT / "scripts" / "tests"
    scratch.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="archival-test-", dir=scratch) as directory:
        source = Path(directory) / "recordings"
        destination = Path(directory) / "nfs"
        source.mkdir()
        destination.mkdir()
        files.is_path_safe = Mock(side_effect=lambda path, db: any(
            os.path.commonpath([os.path.abspath(path), str(root)]) == str(root)
            for root in (source, destination)
        ))
        with patch.dict(sys.modules, {
            "database": database, "routers": routers, "routers.settings": settings,
            "sftp_client": sftp, "event_file_service": files,
        }):
            spec = importlib.util.spec_from_file_location("archival_test_models", ROOT / "backend" / "models.py")
            models = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(models)
            with patch.dict(sys.modules, {"models": models}):
                spec = importlib.util.spec_from_file_location("archival_test_service", ROOT / "backend" / "storage_service.py")
                service = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(service)
                engine = create_engine("sqlite:///:memory:")
                database.Base.metadata.create_all(engine)
                db = sessionmaker(bind=engine)()

                @contextmanager
                def get_db_ctx():
                    yield db

                database.get_db_ctx = get_db_ctx
                profile = models.StorageProfile(name="Fixture archive", path=str(destination), storage_type="local")
                camera = models.Camera(name="Fixture camera", rtsp_url="rtsp://example.invalid/live",
                                       archive_storage_profile=profile, archive_after_hours=24)
                db.add(camera)
                db.commit()
                try:
                    yield SimpleNamespace(service=service, db=db, models=models,
                                          camera=camera, profile=profile, source=source,
                                          destination=destination, sftp=sftp, files=files)
                finally:
                    db.close()
                    engine.dispose()


def add_event(fixture, name="video.mp4", age=48, thumbnail=False):
    directory = fixture.source / "fixture-date"
    directory.mkdir(exist_ok=True)
    source = directory / name
    source.write_bytes(b"fixture video")
    thumb = directory / (name + ".jpg")
    if thumbnail:
        thumb.write_bytes(b"fixture thumbnail")
    event = fixture.models.Event(
        camera_id=fixture.camera.id,
        timestamp_start=datetime.now(timezone.utc) - timedelta(hours=age),
        type="video", file_path=str(source),
        thumbnail_path=str(thumb) if thumbnail else None,
    )
    fixture.db.add(event)
    fixture.db.commit()
    return event, source, thumb


def test_local_archival_moves_media_and_updates_paths(archival):
    event, source, thumb = add_event(archival, thumbnail=True)
    assert archival.service.run_archival(archival.db) is True
    assert not source.exists()
    assert not thumb.exists()
    assert Path(event.file_path).read_bytes() == b"fixture video"
    assert Path(event.thumbnail_path).read_bytes() == b"fixture thumbnail"
    assert archival.service.run_archival(archival.db) is True


def test_recent_events_are_not_archived(archival):
    event, source, _ = add_event(archival, age=1)
    assert archival.service.run_archival(archival.db) is True
    assert event.file_path == str(source)
    assert source.exists()


def test_zero_archive_age_remains_disabled(archival):
    event, source, _ = add_event(archival)
    archival.camera.archive_after_hours = 0
    archival.db.commit()
    assert archival.service.run_archival(archival.db) is True
    assert event.file_path == str(source)
    assert source.exists()


def test_missing_archive_root_is_not_created(archival):
    event, source, _ = add_event(archival)
    archival.destination.rmdir()
    assert archival.service.run_archival(archival.db) is False
    assert not archival.destination.exists()
    assert event.file_path == str(source)
    assert source.exists()


def test_missing_source_reports_failure(archival):
    event, source, _ = add_event(archival)
    source.unlink()
    assert archival.service.run_archival(archival.db) is False
    assert event.file_path == str(source)


def test_already_archived_records_are_skipped_without_reading_media(archival):
    event, source, _ = add_event(archival)
    event.file_path = str(archival.destination / "previously-archived.mp4")
    archival.db.commit()
    assert archival.service.run_archival(archival.db) is True
    archival.files.is_path_safe.assert_not_called()
    assert source.exists()


def test_copy_failure_keeps_original_media(archival, monkeypatch):
    event, source, thumb = add_event(archival, thumbnail=True)
    monkeypatch.setattr(archival.service.shutil, "copy2", Mock(side_effect=OSError("fixture copy failure")))
    assert archival.service.run_archival(archival.db) is False
    assert event.file_path == str(source)
    assert source.exists() and thumb.exists()


def test_commit_failure_keeps_original_media_and_database_path(archival, monkeypatch):
    event, source, _ = add_event(archival)
    monkeypatch.setattr(archival.db, "commit", Mock(side_effect=RuntimeError("fixture commit failure")))
    assert archival.service.run_archival(archival.db) is False
    assert event.file_path == str(source)
    assert source.exists()


def test_unsafe_source_is_not_copied_or_deleted(archival):
    event, source, _ = add_event(archival)
    archival.files.is_path_safe.side_effect = None
    archival.files.is_path_safe.return_value = False
    assert archival.service.run_archival(archival.db) is False
    assert event.file_path == str(source)
    assert source.exists()
    assert not list(archival.destination.iterdir())


def test_unsafe_destination_is_not_written(archival):
    event, source, _ = add_event(archival)
    archival.files.is_path_safe.side_effect = lambda path, db: path == str(source)
    assert archival.service.run_archival(archival.db) is False
    assert event.file_path == str(source)
    assert source.exists()
    assert not list(archival.destination.iterdir())


def test_similar_path_prefix_is_not_treated_as_archived(archival):
    event, source, _ = add_event(archival)
    sibling = Path(str(archival.destination) + "-source")
    sibling.mkdir()
    new_source = sibling / source.name
    source.rename(new_source)
    event.file_path = str(new_source)
    archival.db.commit()
    archival.files.is_path_safe.side_effect = None
    archival.files.is_path_safe.return_value = True
    assert archival.service.run_archival(archival.db) is True
    assert not new_source.exists()
    assert Path(event.file_path).is_file()


def test_backend_path_translation_preserves_profile_namespace(archival, monkeypatch):
    event, source, _ = add_event(archival)
    namespace = "/var/lib/vibe/recordings/archive-fixture"
    archival.profile.path = namespace
    archival.db.commit()
    original_translate = archival.service.translate_path
    monkeypatch.setattr(archival.service, "translate_path", lambda path: (
        path.replace(namespace, str(archival.destination), 1)
        if path and (path == namespace or path.startswith(namespace + "/"))
        else original_translate(path)
    ))
    assert archival.service.run_archival(archival.db) is True
    assert event.file_path.startswith(namespace + "/")
    assert not source.exists()
    assert archival.service.run_archival(archival.db) is True


def test_failed_sftp_upload_keeps_original(archival):
    event, source, _ = add_event(archival)
    archival.profile.storage_type = "sftp"
    archival.db.commit()
    assert archival.service.run_archival(archival.db) is False
    assert event.file_path == str(source)
    assert source.exists()


def test_sftp_archival_updates_paths_only_after_uploads_succeed(archival):
    event, source, thumb = add_event(archival, thumbnail=True)
    archival.profile.storage_type = "sftp"
    archival.db.commit()
    archival.sftp.upload_file.return_value = "fixture remote path"
    assert archival.service.run_archival(archival.db) is True
    assert event.file_path.startswith(f"sftp://{archival.profile.id}/")
    assert event.thumbnail_path.startswith(f"sftp://{archival.profile.id}/")
    assert archival.sftp.upload_file.call_count == 2
    assert not source.exists() and not thumb.exists()


def test_failed_sftp_thumbnail_upload_keeps_both_original_files(archival):
    event, source, thumb = add_event(archival, thumbnail=True)
    archival.profile.storage_type = "sftp"
    archival.db.commit()
    archival.sftp.upload_file.side_effect = ["fixture remote video", None]
    assert archival.service.run_archival(archival.db) is False
    assert event.file_path == str(source)
    assert event.thumbnail_path == str(thumb)
    assert source.exists() and thumb.exists()


def test_eligible_event_pagination_survives_per_event_commits(archival):
    timestamp = datetime.now(timezone.utc) - timedelta(hours=48)
    archival.db.add_all([
        archival.models.Event(camera_id=archival.camera.id, timestamp_start=timestamp, type="video")
        for _ in range(105)
    ])
    archival.db.commit()
    ids = []
    for event in archival.service._iter_archival_events(archival.db, archival.camera.id, datetime.now(timezone.utc)):
        ids.append(event.id)
        archival.db.commit()
    assert len(ids) == len(set(ids)) == 105
    assert ids == sorted(ids)


@pytest.mark.parametrize("enabled, expected_runs", [("true", 2), ("True", 2), (None, 2), ("false", 0), ("False", 0), ("", 0)])
def test_archival_monitor_retries_failures_and_respects_enabled_flag(archival, monkeypatch, enabled, expected_runs):
    class StopLoop(BaseException):
        pass

    sleeps = []

    def sleep(seconds):
        sleeps.append(seconds)
        if len(sleeps) == 3:
            raise StopLoop()

    monkeypatch.setattr(archival.service, "time", SimpleNamespace(
        time=Mock(side_effect=[1_000_000, 1_000_600, 1_001_200]), sleep=sleep,
    ))
    values = {"archival_enabled": enabled, "archival_interval_hours": "24", "cleanup_enabled": "false"}
    monkeypatch.setattr(archival.service, "get_setting", lambda db, key: values.get(key))
    job = Mock(side_effect=[False, True])
    monkeypatch.setattr(archival.service, "run_archival", job)
    monkeypatch.setattr(archival.service, "cleanup_sftp_cache", Mock())
    with pytest.raises(StopLoop):
        archival.service.storage_monitor_loop()
    assert job.call_count == expected_runs
    assert sleeps == [600, 600, 600]
