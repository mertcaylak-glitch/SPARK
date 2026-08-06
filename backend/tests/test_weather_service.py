import pytest
import datetime
from unittest.mock import patch, MagicMock
from db import models
from services import weather_service

def test_clamp_to_archive_safe_date():
    future_date = (datetime.datetime.now() + datetime.timedelta(days=10)).strftime("%Y-%m-%d")
    clamped = weather_service._clamp_to_archive_safe_date(future_date)
    assert clamped < future_date
    
    invalid_date = "invalid-date-string"
    assert weather_service._clamp_to_archive_safe_date(invalid_date) == invalid_date

def test_get_weather_data_invalid_dates():
    res = weather_service.get_weather_data("invalid", "dates")
    assert res == {}

@patch("requests.get")
def test_get_weather_data_api_success(mock_get, db_session):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "hourly": {
            "time": ["2024-05-01T00:00", "2024-05-01T01:00"],
            "temperature_2m": [22.5, 21.0],
            "relative_humidity_2m": [55.0, 60.0],
            "wind_speed_10m": [12.0, 10.0],
            "wind_direction_10m": [180.0, 190.0],
            "precipitation": [0.0, 0.0],
            "cloud_cover": [10.0, 20.0]
        }
    }
    mock_get.return_value = mock_response

    start_date = "2024-05-01"
    end_date = "2024-05-01"

    weather_map = weather_service.get_weather_data(start_date, end_date, db=db_session)
    assert "2024-05-01 00:00" in weather_map
    assert weather_map["2024-05-01 00:00"]["temp"] == 22.5

@patch("requests.get")
def test_get_weather_data_api_failure(mock_get, db_session):
    mock_get.side_effect = Exception("API Timeout")

    start_date = "1995-01-01"
    end_date = "1995-01-01"

    weather_map = weather_service.get_weather_data(start_date, end_date, db=db_session)
    assert weather_map == {}

def test_get_weather_features_helpers():
    weather_map = {
        "2026-08-01 12:00": {
            "temp": 25.0, "humidity": 40.0, "wind_speed": 15.0,
            "wind_direction": 90.0, "precipitation": 0.0, "cloud_cover": 0.0
        }
    }

    dt_match = datetime.datetime(2026, 8, 1, 12, 0)
    dt_miss = datetime.datetime(2026, 8, 1, 13, 0)

    features = weather_service.get_weather_features_for_timestamp(weather_map, dt_match)
    assert features["temp"] == 25.0

    features_default = weather_service.get_weather_features_for_timestamp(weather_map, dt_miss)
    assert features_default["temp"] == 20.0

    temp = weather_service.get_temperature_for_timestamp(weather_map, dt_match)
    assert temp == 25.0
