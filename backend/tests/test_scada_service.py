import pytest
from db import models
from services import scada_service

def test_get_scada_state():
    state = scada_service.get_scada_state()
    assert "breakers" in state
    assert "alarms" in state
    assert "t101-q1" in state["breakers"]

def test_is_transformer_energized():
    # Explicit breaker key
    assert scada_service.is_transformer_energized("T101") is True
    
    # Fallback to T101 or T102
    assert scada_service.is_transformer_energized("CUSTOM-TRA") is True
    assert scada_service.is_transformer_energized("UNKNOWN-BUS") is True

def test_is_feeder_energized():
    assert scada_service.is_feeder_energized("f1") is True
    assert scada_service.is_feeder_energized("unknown_feeder") is True

def test_toggle_breaker_invalid(db_session):
    with pytest.raises(ValueError, match="Geçersiz kesici anahtarı"):
        scada_service.toggle_breaker(db_session, breaker_id="invalid-breaker-999", target_state=False)

def test_toggle_breaker_static(db_session):
    # Toggle f1 breaker from True to False
    res = scada_service.toggle_breaker(db_session, breaker_id="f1", target_state=False, trafo_id="UMR-TRA", reason="Test maneuver")
    assert res["success"] is True
    assert res["new_state"] is False
    assert scada_service.SCADA_BREAKER_STATES["f1"] is False
    
    # Revert back
    scada_service.toggle_breaker(db_session, breaker_id="f1", target_state=True)

def test_toggle_breaker_reactor(db_session):
    reactor = db_session.query(models.Reactor).filter_by(id="R101").first()
    if not reactor:
        reactor = models.Reactor(
            id="R101",
            name="Test Reactor",
            capacity_kvar=250.0,
            status="active"
        )
        db_session.add(reactor)
        db_session.commit()
    
    res = scada_service.toggle_breaker(db_session, breaker_id="r101-q1", target_state=False)
    assert res["success"] is True
    
    # Check DB update
    db_session.refresh(reactor)
    assert reactor.status == "inactive"

def test_ack_alarm():
    res_valid = scada_service.ack_alarm("vn1")
    assert res_valid["success"] is True
    
    res_invalid = scada_service.ack_alarm("non_existent_alarm")
    assert res_invalid["success"] is False
    assert res_invalid["message"] == "Alarm bulunamadı"

def test_generate_telemetry_snapshot(db_session):
    t1 = db_session.query(models.Transformer).filter_by(id="UMR-TRA").first()
    if not t1:
        t1 = models.Transformer(id="UMR-TRA", name="Ümraniye Trafo", power_mva=100)
        db_session.add(t1)
        db_session.commit()
    
    # Set UMR-TRA de-energized
    scada_service.SCADA_BREAKER_STATES["umr-tra-q1"] = False
    
    snapshot = scada_service.generate_telemetry_snapshot(db_session)
    assert "telemetry" in snapshot
    assert "UMR-TRA" in snapshot["telemetry"]
    assert snapshot["telemetry"]["UMR-TRA"]["kw"] == 0.0
    
    # Revert breaker state
    scada_service.SCADA_BREAKER_STATES["umr-tra-q1"] = True
