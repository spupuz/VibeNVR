import pytest
from sqlalchemy import create_engine
import sys
import os

# Ensure backend modules can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from migrate_db import is_valid_identifier, add_column_if_not_exists, drop_column_if_exists

def test_is_valid_identifier():
    # Valid identifiers
    assert is_valid_identifier("users") is True
    assert is_valid_identifier("avatar_path") is True
    assert is_valid_identifier("schedule_monday_start") is True
    assert is_valid_identifier("123_table") is True

    # Invalid identifiers
    assert is_valid_identifier("users; DROP TABLE users;") is False
    assert is_valid_identifier("DROP TABLE") is False
    assert is_valid_identifier("table'name") is False
    assert is_valid_identifier("col-name") is False
    assert is_valid_identifier("select * from users") is False

def test_add_column_if_not_exists_invalid_identifier():
    engine = create_engine('sqlite:///:memory:')

    with pytest.raises(ValueError, match="Invalid table or column name provided: users; DROP TABLE users;, avatar_path"):
        add_column_if_not_exists(engine, "users; DROP TABLE users;", "avatar_path", "VARCHAR")

    with pytest.raises(ValueError, match="Invalid table or column name provided: users, avatar path"):
        add_column_if_not_exists(engine, "users", "avatar path", "VARCHAR")

def test_drop_column_if_exists_invalid_identifier():
    engine = create_engine('sqlite:///:memory:')

    with pytest.raises(ValueError, match="Invalid table or column name provided: users; DROP TABLE users;, avatar_path"):
        drop_column_if_exists(engine, "users; DROP TABLE users;", "avatar_path")

    with pytest.raises(ValueError, match="Invalid table or column name provided: users, avatar path"):
        drop_column_if_exists(engine, "users", "avatar path")
