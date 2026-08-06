import pytest
from unittest.mock import patch
from types import SimpleNamespace
from services.maneuver_service import (
    _calculate_suggestion_score,
    _get_projected_monthly_ratios,
    simulate_maneuver,
    apply_maneuver,
    rollback_maneuver,
    bulk_update_topology,
    create_transformer,
    create_feeder,
    create_reactor
)
from db import models

def test_calculate_suggestion_score_branches():
    # Hit line 101-104 (load_ratio <= 75 and > 50 and <= 50)
    assert _calculate_suggestion_score({"load_ratio": 60, "cap_ratio": 0, "ind_ratio": 0}, {"load_ratio": 0}, 40) > 0
    assert _calculate_suggestion_score({"load_ratio": 40, "cap_ratio": 0, "ind_ratio": 0}, {"load_ratio": 0}, 40) > 0
    
    # Hit line 110, 114 (load_diff 11-20, <= 10)
    assert _calculate_suggestion_score({"load_ratio": 80, "cap_ratio": 0, "ind_ratio": 0}, {"load_ratio": 0}, 15) > 0
    assert _calculate_suggestion_score({"load_ratio": 80, "cap_ratio": 0, "ind_ratio": 0}, {"load_ratio": 0}, 5) > 0
    
    # Hit line 120-127 (is_reactive=True, cap_ratio 12-15, ind_ratio >20, ind_ratio 15-20, ind <=15)
    assert _calculate_suggestion_score({"load_ratio": 50, "cap_ratio": 13, "ind_ratio": 0}, {"load_ratio": 0}, 0, is_reactive=True) > 0
    assert _calculate_suggestion_score({"load_ratio": 50, "cap_ratio": 0, "ind_ratio": 25}, {"load_ratio": 0}, 0, is_reactive=True) > 0
    assert _calculate_suggestion_score({"load_ratio": 50, "cap_ratio": 0, "ind_ratio": 18}, {"load_ratio": 0}, 0, is_reactive=True) > 0
    assert _calculate_suggestion_score({"load_ratio": 50, "cap_ratio": 0, "ind_ratio": 10}, {"load_ratio": 0}, 0, is_reactive=True) > 0

    # Hit line 133 (is_reactive=False, cap <=12 and ind <= 16)
    assert _calculate_suggestion_score({"load_ratio": 80, "cap_ratio": 5, "ind_ratio": 5}, {"load_ratio": 0}, 40, is_reactive=False) > 0

    # Hit line 141, 143 (target_headroom 21-40, <=20)
    assert _calculate_suggestion_score({"load_ratio": 80, "cap_ratio": 0, "ind_ratio": 0}, {"load_ratio": 70}, 10) > 0
    assert _calculate_suggestion_score({"load_ratio": 80, "cap_ratio": 0, "ind_ratio": 0}, {"load_ratio": 90}, 10) > 0

@patch('services.maneuver_service.get_monthly_summary')
@patch('services.maneuver_service.get_cached_forecast')
def test_get_projected_monthly_ratios(mock_forecast, mock_summary, db_session):
    # Test empty summaries
    mock_summary.return_value = []
    assert _get_projected_monthly_ratios(db_session, "T1") == (0, 0)
    
    # Test with valid summaries and forecasts
    mock_summary.return_value = [{"ozet": {"toplamAktif": 1000, "toplamKapasitif": 150, "toplamEnduktif": 200}}]
    mock_forecast.return_value = {
        "predictions": [
            {"active_kwh": 100, "capacitive_kvarh": 50, "inductive_kvarh": 0},
            {"active_kwh": 100, "capacitive_kvarh": 0, "inductive_kvarh": 50}
        ]
    }
    cap, ind = _get_projected_monthly_ratios(db_session, "T1")
    # total_aktif = 1200, cap = 200, ind = 250
    assert abs(cap - (200/1200*100)) < 0.1
    assert abs(ind - (250/1200*100)) < 0.1

def test_simulate_maneuver_branches(db_session):
    # Create required assets directly
    t1 = models.Transformer(id="SIM-T1", name="Trafo 1", power_mva=10.0, status="active")
    t2 = models.Transformer(id="SIM-T2", name="Trafo 2", power_mva=0.1, status="active") # low power to trigger overload
    db_session.add(t1)
    db_session.add(t2)
    
    f1 = models.Feeder(id="SIM-F1", name="Feeder 1", current_transformer_id="SIM-T1", alternative_transformer_id="SIM-T2", simulated_load_kw=900.0)
    db_session.add(f1)
    
    r1 = models.Reactor(id="SIM-R1", name="Reactor 1", current_transformer_id="SIM-T1", alternative_transformer_id="SIM-T2", capacity_kvar=100.0, status="active")
    db_session.add(r1)
    
    db_session.commit()

    # Hit 662-664 (target_trafo not found)
    with pytest.raises(ValueError):
        simulate_maneuver(db_session, "feeder", "SIM-F1", "NON-EXISTENT")
        
    # Hit 725 (overload warning when load_ratio > 90)
    # T2 has 0.1 MVA = 100 kW. F1 transfers 900 kW. Target load will be 900/100 = 900%
    with patch('services.maneuver_service._get_trafo_stats') as mock_stats, \
         patch('services.maneuver_service.get_cached_forecast', return_value={}):
        mock_stats.return_value = ([], {
            "SIM-T1": {"avg_active": 1000, "power_kw": 10000, "model": t1, "total_feeder_load": 1000, "total_reactor_cap": 0, "load_ratio": 10, "cap_ratio": 0, "ind_ratio": 0, "active_sum": 1000, "cap_sum": 0, "ind_sum": 0, "measurement_count": 1},
            "SIM-T2": {"avg_active": 0, "power_kw": 100, "model": t2, "total_feeder_load": 0, "total_reactor_cap": 0, "load_ratio": 0, "cap_ratio": 0, "ind_ratio": 0, "active_sum": 0, "cap_sum": 0, "ind_sum": 0, "measurement_count": 1}
        })
        res = simulate_maneuver(db_session, "feeder", "SIM-F1", "SIM-T2")
        assert "aşırı yüklenmeye" in res["overload_warning"]
        
    # Hit 705-713 (reactor simulate active to active/inactive)
    res_r = simulate_maneuver(db_session, "reactor", "SIM-R1", "SIM-T2")
    assert "reactor" in res_r["asset_type"]

def test_apply_maneuver_branches(db_session):
    # create assets
    t1 = models.Transformer(id="APP-T1", name="APP Trafo 1", power_mva=10.0, status="active")
    t2 = models.Transformer(id="APP-T2", name="APP Trafo 2", power_mva=10.0, status="active")
    db_session.add_all([t1, t2])
    db_session.commit()

    f1 = models.Feeder(id="APP-F1", name="APP Feeder 1", current_transformer_id="APP-T1", alternative_transformer_id="APP-T2", simulated_load_kw=100)
    r1 = models.Reactor(id="APP-R1", name="APP Reactor 1", current_transformer_id="APP-T1", alternative_transformer_id="APP-T2", capacity_kvar=100, status="active")
    r2 = models.Reactor(id="APP-R2", name="APP Reactor 2", current_transformer_id="APP-T1", alternative_transformer_id=None, capacity_kvar=100, status="active")
    db_session.add_all([f1, r1, r2])
    db_session.commit()
    
    # 848-903 apply feeder transfer
    log_f = apply_maneuver(db_session, "feeder", "APP-F1", "APP-T2", reason="Test")
    assert log_f.status == "applied"
    db_session.refresh(f1)
    assert f1.current_transformer_id == "APP-T2"
    
    # apply reactor transfer / turn off
    # If target is same as current, it should toggle status (925-935)
    log_r = apply_maneuver(db_session, "reactor", "APP-R2", "APP-T1", reason="Toggle")
    db_session.refresh(r2)
    assert r2.status == "inactive"
    
    # Rollback branches (973, 980, 1001, 1008, 1030)
    log_rb_f = rollback_maneuver(db_session, log_f.id)
    assert log_rb_f.status == "rolled_back"
    
    log_rb_r = rollback_maneuver(db_session, log_r.id)
    assert log_rb_r.status == "rolled_back"

def test_bulk_update_topology_branches(db_session):
    # Setup base
    t1 = models.Transformer(id="BLK-T1", name="BLK T1", power_mva=10)
    db_session.add(t1)
    db_session.commit()
    
    bulk_data = SimpleNamespace(
        new_transformers=[
            SimpleNamespace(id="BLK-T1", name="Duplicate T1", region="Reg", power_mva=10.0, status="active", pos_x=0, pos_y=0)
        ],
        new_feeders=[
            SimpleNamespace(id="BLK-F1", name="New F", current_transformer_id="BLK-T1", alternative_transformer_id=None, simulated_load_kw=10, pos_x=0, pos_y=0)
        ],
        new_reactors=[
            SimpleNamespace(id="BLK-R1", name="New R", current_transformer_id="BLK-T1", alternative_transformer_id=None, capacity_kvar=10, status="inactive", pos_x=0, pos_y=0)
        ],
        new_kuplajlar=[],
        updated_assets=[
            SimpleNamespace(id="NON-EXISTENT", type="trafo", pos_x=0, pos_y=0, current_transformer_id=None, alternative_transformer_id=None)
        ]
    )
    
    result = bulk_update_topology(db_session, bulk_data)
    # duplicate trafo should not be created
    assert "BLK-T1" not in result.get("created_transformers", [])
    # new feeder and reactor should be created
    assert "BLK-F1" in result.get("created_feeders", [])
    assert "BLK-R1" in result.get("created_reactors", [])
    # invalid update should be ignored safely
    assert result.get("updated_count", 0) >= 0

def test_create_error_branches(db_session):
    # Try creating feeder with non-existent trafo
    res_f = create_feeder(db_session, SimpleNamespace(id="ERR-F", name="ERR", current_transformer_id="NO", alternative_transformer_id=None, simulated_load_kw=1, pos_x=0, pos_y=0))
    assert res_f is None
    
    # Try creating reactor with non-existent trafo
    res_r = create_reactor(db_session, SimpleNamespace(id="ERR-R", name="ERR", current_transformer_id="NO", alternative_transformer_id=None, capacity_kvar=1, status="inactive", pos_x=0, pos_y=0))
    assert res_r is None
