import pytest
import datetime
from unittest.mock import patch, MagicMock
from db import models
from services.forecast.engine import _run_raw_forecast_algorithm, apply_topology_scaling_to_forecast

def test_run_raw_forecast_algorithm_unknown_method(db_session):
    preds, conf = _run_raw_forecast_algorithm(db_session, "UMR-TRA", "non_existent_method", 24)
    assert preds == []
    assert conf == 0

def test_run_raw_forecast_algorithm_simple_methods(db_session):
    t = db_session.query(models.Transformer).filter_by(id="UMR-TRA").first()
    if not t:
        t = models.Transformer(id="UMR-TRA", name="Ümraniye Trafo", power_mva=100)
        db_session.add(t)
        db_session.commit()

    now = datetime.datetime.now()
    
    # Add dummy measurement data if not already existing
    existing_count = db_session.query(models.Measurement).filter_by(transformer_id="UMR-TRA").count()
    if existing_count < 10:
        for i in range(48):
            m = models.Measurement(
                transformer_id="UMR-TRA",
                timestamp=now - datetime.timedelta(hours=i),
                active_kwh=1000 + i * 5,
                inductive_kvarh=100,
                capacitive_kvarh=50
            )
            db_session.add(m)
        db_session.commit()

    # Test persistence method
    preds, conf = _run_raw_forecast_algorithm(db_session, "UMR-TRA", "persistence", 12)
    assert isinstance(preds, list)

    # Test ortalama method
    preds_ort, conf_ort = _run_raw_forecast_algorithm(db_session, "UMR-TRA", "ortalama", 12)
    assert isinstance(preds_ort, list)

def test_apply_topology_scaling_to_forecast(db_session):
    t = db_session.query(models.Transformer).filter_by(id="UMR-TRA").first()
    if not t:
        t = models.Transformer(id="UMR-TRA", name="Ümraniye Trafo", power_mva=100)
        db_session.add(t)
        db_session.commit()

    preds, conf = apply_topology_scaling_to_forecast(db_session, "UMR-TRA", "ortalama", 12)
    assert isinstance(preds, list)
    assert isinstance(conf, (int, float))
