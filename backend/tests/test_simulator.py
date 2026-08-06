from datetime import datetime, timedelta
from core.simulator import (
    generate_measurement_values,
    get_historical_baseline,
    generate_hourly_data,
    generate_historical_data
)
from db import models

def test_generate_measurement_values(db_session):
    trafo = db_session.query(models.Transformer).filter_by(id="TEST-TRAFO").first()
    if not trafo:
        trafo = models.Transformer(id="TEST-TRAFO", name="Test Trafo", power_mva=10, status="active")
        db_session.add(trafo)
        db_session.commit()

    now = datetime.now()
    active, inductive, capacitive = generate_measurement_values(db_session, trafo, now)

    assert isinstance(active, int)
    assert isinstance(inductive, int)
    assert isinstance(capacitive, int)
    assert active >= 0
    assert inductive >= 0
    assert capacitive >= 0

def test_get_historical_baseline(db_session):
    now = datetime.now()
    ref_time = now - timedelta(days=364)
    m = models.Measurement(
        transformer_id="UMR-TRA",
        timestamp=ref_time,
        active_kwh=2000,
        inductive_kvarh=200,
        capacitive_kvarh=100
    )
    db_session.add(m)
    db_session.commit()

    baseline = get_historical_baseline(db_session, "UMR-TRA", now)
    assert baseline is not None
    assert baseline[0] == 2000

    res = get_historical_baseline(db_session, "NONEXISTENT", now)
    assert res is None

def test_generate_hourly_data(db_session):
    t = db_session.query(models.Transformer).filter_by(id="UMR-TRA").first()
    if not t:
        t = models.Transformer(id="UMR-TRA", name="Ümraniye Trafo", power_mva=100)
        db_session.add(t)
        db_session.commit()

    generate_hourly_data()

def test_generate_historical_data(db_session):
    t = db_session.query(models.Transformer).filter_by(id="UMR-TRA").first()
    if not t:
        t = models.Transformer(id="UMR-TRA", name="Ümraniye Trafo", power_mva=100)
        db_session.add(t)
        db_session.commit()

    generate_historical_data(days=1)
