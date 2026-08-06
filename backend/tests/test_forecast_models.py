import pytest
import datetime
from unittest.mock import MagicMock, patch
from db import models
from services.forecast.models.simple_models import (
    forecast_ortalama,
    forecast_persistence,
    forecast_gecen_ay
)
from services.forecast.models.holt_winters_model import forecast_holt_winters
from services.forecast.models.regression_model import forecast_regression
from services.forecast.models.random_forest_model import forecast_random_forest
from services.forecast.models.xgboost_model import forecast_xgboost
from services.forecast.models.lightgbm_model import forecast_lightgbm

def test_simple_models_with_insufficient_data(db_session):
    # Less than 168 measurements -> returns fallback
    now = datetime.datetime.now()
    preds, conf = forecast_ortalama(db_session, "UMR-TRA", steps=24)
    assert preds == []
    assert conf == 0

    preds_p, conf_p = forecast_persistence(db_session, "UMR-TRA", steps=24)
    assert preds_p == []
    assert conf_p == 0

    preds_g, conf_g = forecast_gecen_ay(db_session, "UMR-TRA", steps=24)
    assert preds_g == []
    assert conf_g == 0

def test_simple_models_with_mock_measurements(db_session):
    now = datetime.datetime.now()
    measurements = [
        models.Measurement(
            transformer_id="UMR-TRA",
            timestamp=now - datetime.timedelta(hours=i),
            active_kwh=1000,
            inductive_kvarh=100,
            capacitive_kvarh=50
        )
        for i in range(350)
    ]
    db_session.add_all(measurements)
    db_session.commit()

    # test forecast_ortalama
    preds, conf = forecast_ortalama(db_session, "UMR-TRA", steps=24)
    assert len(preds) == 24
    assert conf > 0

    # test forecast_persistence
    preds_p, conf_p = forecast_persistence(db_session, "UMR-TRA", steps=24)
    assert len(preds_p) == 24
    assert conf_p > 0

    # test forecast_gecen_ay (fallback to persistence if < 672)
    preds_g, conf_g = forecast_gecen_ay(db_session, "UMR-TRA", steps=24)
    assert len(preds_g) == 24

def test_complex_models_fallback_or_mock(db_session):
    # When measurements are insufficient, complex models should gracefully fallback
    preds_hw, conf_hw = forecast_holt_winters(db_session, "UMR-TRA", steps=24)
    assert isinstance(preds_hw, list)

    preds_reg, conf_reg = forecast_regression(db_session, "UMR-TRA", steps=24)
    assert isinstance(preds_reg, list)

    preds_rf, conf_rf = forecast_random_forest(db_session, "UMR-TRA", steps=24)
    assert isinstance(preds_rf, list)

    preds_xgb, conf_xgb = forecast_xgboost(db_session, "UMR-TRA", steps=24)
    assert isinstance(preds_xgb, list)

    preds_lgb, conf_lgb = forecast_lightgbm(db_session, "UMR-TRA", steps=24)
    assert isinstance(preds_lgb, list)
