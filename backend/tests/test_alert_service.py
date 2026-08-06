import pytest
import datetime
from unittest.mock import patch
from db import models
from services import alert_service

def test_check_and_generate_alerts(db_session):
    # Mock get_monthly_summary to return custom test ratios
    mock_summary = [
        {
            "trafo": {"id": "UMR-TRA", "adi": "Ümraniye Trafo"},
            "ozet": {
                "kapasitifOran": 18.0,  # > 15% EPDK penalty
                "enduktifOran": 22.0    # > 20% EPDK penalty
            }
        },
        {
            "trafo": {"id": "KAD-TRA", "adi": "Kadıköy Trafo"},
            "ozet": {
                "kapasitifOran": 12.0,  # Warning threshold (>= 10%)
                "enduktifOran": 16.0    # Warning threshold (>= 15%)
            }
        }
    ]

    with patch("services.alert_service.get_monthly_summary", return_value=mock_summary):
        now = datetime.datetime.now()
        alerts = alert_service.check_and_generate_alerts(db_session, year=now.year, month=now.month)
        
        # Check generated alerts in DB
        db_alerts = db_session.query(models.SystemAlert).all()
        assert len(db_alerts) >= 4  # 2 for UMR-TRA, 2 for KAD-TRA
        
        types = [a.alert_type for a in db_alerts]
        assert "capacitive_penalty" in types
        assert "inductive_penalty" in types
        assert "capacitive_warning" in types
        assert "inductive_warning" in types

def test_get_active_alerts(db_session):
    now = datetime.datetime.now()
    alert = models.SystemAlert(
        transformer_id="UMR-TRA",
        alert_type="warning",
        severity="info",
        message="Test alert message",
        timestamp=now
    )
    db_session.add(alert)
    db_session.commit()

    active_alerts = alert_service.get_active_alerts(db_session, year=now.year, month=now.month)
    assert len(active_alerts) >= 1
    assert active_alerts[0]["transformer_id"] == "UMR-TRA"
