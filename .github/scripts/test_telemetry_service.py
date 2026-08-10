import pytest
from unittest.mock import patch, MagicMock
import os
import sys

# Add backend directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend')))

import telemetry_service

@patch('telemetry_service.requests.get')
@patch('telemetry_service.get_system_info')
@patch('telemetry_service.get_app_version')
@patch('telemetry_service.gather_metrics')
@patch('telemetry_service.database.get_db_ctx')
def test_send_telemetry_ssrf_protection(mock_get_db_ctx, mock_gather, mock_version, mock_sysinfo, mock_get):
    # Setup mocks
    mock_db = MagicMock()
    mock_get_db_ctx.return_value.__enter__.return_value = mock_db

    # Mock settings to enable telemetry
    mock_enabled_setting = MagicMock()
    mock_enabled_setting.value = "true"

    mock_instance_id_setting = MagicMock()
    mock_instance_id_setting.value = "test-instance-id"

    # Configure mock query chain
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_filter = MagicMock()
    mock_query.filter_by.return_value = mock_filter
    mock_filter.first.side_effect = [mock_enabled_setting, mock_instance_id_setting]

    mock_gather.return_value = {
        "cameras": 0, "users": 0, "groups": 0, "events": 0, "notifications": False,
        "mqtt_active": False, "motion_opencv": 0, "motion_onvif": 0, "motion_ai_engine": 0, "motion_ai": 0,
        "onvif_count": 0, "substream_count": 0
    }
    mock_sysinfo.return_value = {
        "os": "test", "arch": "test", "cpu_count": 1, "processor": "test", "ram_gb": 1, "gpu_active": False
    }
    mock_version.return_value = "1.0.0"

    mock_response = MagicMock()
    mock_response.ok = True
    mock_response.status_code = 200
    mock_get.return_value = mock_response

    # Run the function
    telemetry_service.send_telemetry()

    # Verify allow_redirects=False is passed to requests.get
    mock_get.assert_called_once()
    kwargs = mock_get.call_args[1]
    assert kwargs.get('allow_redirects') is False, "allow_redirects=False must be explicitly set for SSRF protection"
