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
