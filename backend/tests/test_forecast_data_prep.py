import pytest
import datetime
import numpy as np
from db import models
from services.forecast.data_prep import calculate_confidence, prepare_dataframe

def test_calculate_confidence():
    # Perfect match -> 100% confidence
    assert calculate_confidence([100, 200], [100, 200]) == 100.0
    
    # Empty/zero true values -> default 80% confidence
    assert calculate_confidence([0, 0], [10, 10]) == 80.0
    
    # 10% error -> 90% confidence
    assert calculate_confidence([100, 100], [90, 90]) == 90.0

def test_prepare_dataframe():
    now = datetime.datetime(2026, 8, 1, 12, 0)
    measurements = [
        models.Measurement(
            transformer_id="UMR-TRA",
            timestamp=now - datetime.timedelta(hours=i),
            active_kwh=1000 + i,
            inductive_kvarh=100,
            capacitive_kvarh=50
        )
        for i in range(24)
    ]

    df = prepare_dataframe(measurements)
    assert not df.empty
    assert df.index.name == "ds" or "ds" in df.columns
    assert "y_aktif" in df.columns
    assert "is_weekend" in df.columns
    assert len(df) == 24

def test_extract_series_features():
    from services.forecast.data_prep import _extract_series_features
    # < 168
    data = [{"test_col": i} for i in range(100)]
    feats = _extract_series_features(data, "test_col")
    assert len(feats) == 5

def test_load_measurements(db_session):
    from services.forecast.data_prep import _load_measurements
    t = models.Transformer(id="PREP-TRA", name="PREP Trafo", power_mva=100)
    db_session.add(t)
    db_session.commit()
    
    for i in range(5):
        m = models.Measurement(
            transformer_id="PREP-TRA",
            timestamp=datetime.datetime(2026, 8, 1, 12, 0) - datetime.timedelta(hours=i),
            active_kwh=1000 + i,
            inductive_kvarh=100,
            capacitive_kvarh=50
        )
        db_session.add(m)
    db_session.commit()
    
    measurements = _load_measurements(db_session, "PREP-TRA", limit=2)
    assert len(measurements) == 2

def test_prepare_training_data(db_session):
    from services.forecast.data_prep import _prepare_training_data
    
    # Not measurements
    a,b,c,d,e,f,g = _prepare_training_data(db_session, [], 24)
    assert a is None
    
    # df empty after dropna
    m = models.Measurement(
            transformer_id="PREP-TRA",
            timestamp=datetime.datetime(2026, 8, 1, 12, 0),
            active_kwh=1000,
            inductive_kvarh=100,
            capacitive_kvarh=50
    )
    a,b,c,d,e,f,g = _prepare_training_data(db_session, [m], 24)
    assert a is None

