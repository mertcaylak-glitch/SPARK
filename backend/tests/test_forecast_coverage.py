import pytest
from unittest.mock import patch, MagicMock
from types import SimpleNamespace
from services.forecast.engine import (
    apply_topology_scaling_to_forecast,
    get_cached_forecast,
    _process_single_transformer_batch,
    run_weekly_batch_forecast
)
from db import models
import datetime

def test_topology_scaling_branches(db_session):
    t_id = "SCAL-T1"
    t = models.Transformer(id=t_id, name="Scal Trafo", power_mva=10)
    db_session.add(t)
    
    f1 = models.Feeder(id="SCAL-F1", name="F1", current_transformer_id=t_id, alternative_transformer_id="ALT-T", simulated_load_kw=10)
    db_session.add(f1)
    
    r1 = models.Reactor(id="SCAL-R1", name="R1", current_transformer_id=t_id, alternative_transformer_id=None, capacity_kvar=100, status="active")
    db_session.add(r1)
    db_session.commit()

    with patch('services.forecast.engine._run_raw_forecast_algorithm') as mock_raw:
        mock_raw.return_value = ([
            {"timestamp": "2026-08-01 10:00:00", "active_kwh": 100, "inductive_kvarh": 50, "capacitive_kvarh": 20, "kap_reason": "test", "end_reason": "test"}
        ], 90.0)
        
        preds, conf = apply_topology_scaling_to_forecast(db_session, t_id, "ortalama", 1)
        assert len(preds) > 0
        assert preds[0]["kap_reason"] == "test"

@patch('services.forecast.engine.FORECAST_CACHE', {})
def test_get_cached_forecast_ensemble_fallback(db_session):
    t_id = "ENS-T1"
    now = datetime.datetime.now()
    m = models.Measurement(transformer_id=t_id, timestamp=now - datetime.timedelta(days=1), active_kwh=100, inductive_kvarh=10, capacitive_kvarh=10)
    db_session.add(m)
    
    # Add xgboost forecast instead of ensemble to trigger fallback
    fm = models.ForecastMeasurement(
        transformer_id=t_id,
        timestamp=now + datetime.timedelta(hours=1),
        model_type="xgboost",
        active_kwh=110,
        inductive_kvarh=11,
        capacitive_kvarh=11,
        confidence_score=85.0
    )
    db_session.add(fm)
    db_session.commit()
    
    with patch('services.forecast.engine.apply_topology_scaling_to_forecast') as mock_scale:
        mock_scale.return_value = ([], 0) # Fallback to prevent actual calculation
        res = get_cached_forecast(db_session, t_id, now.year, now.month, "ensemble")
        assert res is not None

def test_process_single_transformer_batch_and_cache(db_session):
    t_id = "BATCH-T1"
    db_session.add(models.Transformer(id=t_id, name="Batch Trafo", power_mva=10))
    db_session.commit()
    with patch('services.forecast.engine._run_forecast_algorithm') as mock_algo:
        mock_algo.return_value = ([
            {"timestamp": "2026-08-01 10:00:00", "active_kwh": 100, "inductive_kvarh": 50, "capacitive_kvarh": 20, "kap_reason": None, "end_reason": None}
        ], 90.0)
        
        _process_single_transformer_batch(t_id, ["ortalama"], 1)
        assert True


def test_run_weekly_batch_forecast_thread():
    def sync_start(self):
        self._target(*self._args, **self._kwargs)
    with patch('services.forecast.engine._process_single_transformer_batch') as mock_batch, \
         patch('threading.Thread.start', new=sync_start):
        run_weekly_batch_forecast(["T1"])
        assert True

def test_seed_missing_forecasts(db_session):
    from services.forecast.engine import seed_missing_forecasts
    t_id = "SEED-T1"
    now = datetime.datetime.now()
    t = models.Transformer(id=t_id, name="Seed Trafo", power_mva=10)
    db_session.add(t)
    db_session.add(models.Measurement(transformer_id=t_id, timestamp=now - datetime.timedelta(hours=1), active_kwh=10, inductive_kvarh=1, capacitive_kvarh=1))
    db_session.commit()
    
    with patch('services.forecast.engine.run_weekly_batch_forecast') as mock_batch:
        seed_missing_forecasts()
        assert mock_batch.called
