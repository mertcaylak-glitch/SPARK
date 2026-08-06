import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta
from db import models
from services.model_eval_service import evaluate_all_models
from services.analysis_service import process_measurements
from services.weather_service import get_weather_data

# 1. Model Eval Service Coverage (brings from 23% to 100%)
def test_evaluate_all_models_coverage(db_session):
    t = models.Transformer(id="EVAL-T1", name="Eval Trafo", power_mva=10)
    db_session.add(t)
    db_session.commit()

    with patch('services.model_eval_service.forecast_xgboost', return_value=([], 90.0)), \
         patch('services.model_eval_service.forecast_random_forest', side_effect=Exception("Model fail")), \
         patch('services.model_eval_service.forecast_regression', return_value=([], 80.0)), \
         patch('services.model_eval_service.forecast_holt_winters', return_value=([], 70.0)), \
         patch('services.model_eval_service.forecast_ortalama', return_value=([], 60.0)), \
         patch('services.model_eval_service.forecast_persistence', return_value=([], 50.0)), \
         patch('services.model_eval_service.forecast_gecen_ay', return_value=([], 40.0)):
        
        results = evaluate_all_models(db_session, "EVAL-T1", steps=12)
        assert len(results) == 7
        assert any(r["status"] == "success" for r in results)
        assert any("error" in r["status"] for r in results)

# 2. Analysis Service Coverage (process_measurements lines 80-127)
def test_process_measurements_coverage(db_session):
    now = datetime.now()
    m1 = models.Measurement(id=9991, transformer_id="PROC-T1", timestamp=now, active_kwh=1000, inductive_kvarh=250, capacitive_kvarh=180)
    m2 = models.Measurement(id=9992, transformer_id="PROC-T1", timestamp=now + timedelta(hours=1), active_kwh=0, inductive_kvarh=100, capacitive_kvarh=50) # active == 0 branch
    
    res = process_measurements([m1, m2])
    assert len(res) == 2
    assert res[0]["kumulatifKapasitifOran"] > 0
    assert res[1]["enduktifOran"] == 999.0

# 3. Weather Service Coverage
def test_weather_service_coverage(db_session):
    with patch('requests.get') as mock_get:
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {
            "hourly": {
                "time": ["2026-08-01T12:00"],
                "temperature_2m": [25.0],
                "relative_humidity_2m": [50],
                "cloud_cover": [10],
                "wind_speed_10m": [5.0],
                "wind_direction_10m": [180],
                "precipitation": [0.0]
            }
        }
        w_data = get_weather_data("2026-08-01", "2026-08-02", db_session)
        assert len(w_data) > 0

        # Test error branch
        mock_get.return_value.status_code = 500
        w_fallback = get_weather_data("2026-08-01", "2026-08-02", db_session)
        assert len(w_fallback) > 0
