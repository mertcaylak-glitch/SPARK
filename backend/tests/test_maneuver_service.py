import pytest
from types import SimpleNamespace
from services.maneuver_service import (
    _calculate_risk_level,
    _calculate_suggestion_score,
    simulate_maneuver,
    apply_maneuver,
    rollback_maneuver,
    get_maneuver_history,
    analyze_and_suggest_maneuvers,
    create_feeder,
    delete_feeder,
    create_reactor,
    delete_reactor,
    create_transformer,
    bulk_update_topology
)
from db import models

def test_calculate_risk_level():
    assert _calculate_risk_level(90) == "tehlikeli"
    assert _calculate_risk_level(75) == "riskli"
    assert _calculate_risk_level(60) == "dikkat"
    assert _calculate_risk_level(40) == "normal"
    assert _calculate_risk_level(20) == "guvenli"

def test_calculate_suggestion_score():
    stats = {"load_ratio": 90, "cap_ratio": 16, "ind_ratio": 5}
    alt_stats = {"load_ratio": 30}
    score = _calculate_suggestion_score(stats, alt_stats, load_diff=60, is_reactive=False)
    assert 0 <= score <= 100
    assert score > 50

def test_maneuver_flow(db_session):
    t1 = db_session.query(models.Transformer).filter_by(id="TRAFO-1").first()
    if not t1:
        t1 = models.Transformer(id="TRAFO-1", name="Trafo 1", power_mva=10, status="active")
        db_session.add(t1)
    
    t2 = db_session.query(models.Transformer).filter_by(id="TRAFO-2").first()
    if not t2:
        t2 = models.Transformer(id="TRAFO-2", name="Trafo 2", power_mva=10, status="active")
        db_session.add(t2)

    f1 = db_session.query(models.Feeder).filter_by(id="F-1").first()
    if not f1:
        f1 = models.Feeder(
            id="F-1", name="Feeder 1",
            current_transformer_id="TRAFO-1",
            alternative_transformer_id="TRAFO-2",
            simulated_load_kw=500.0
        )
        db_session.add(f1)

    r1 = db_session.query(models.Reactor).filter_by(id="R-1").first()
    if not r1:
        r1 = models.Reactor(
            id="R-1", name="Reactor 1",
            current_transformer_id="TRAFO-1",
            alternative_transformer_id="TRAFO-2",
            capacity_kvar=250.0, status="inactive"
        )
        db_session.add(r1)
    
    db_session.commit()

    # 1. Simulate feeder maneuver
    sim_res = simulate_maneuver(db_session, "feeder", "F-1", "TRAFO-2")
    assert sim_res is not None
    assert sim_res["asset_id"] == "F-1"
    assert sim_res["target_trafo_id"] == "TRAFO-2"

    # 2. Test Invalid Topology
    t3 = db_session.query(models.Transformer).filter_by(id="TRAFO-3").first()
    if not t3:
        t3 = models.Transformer(id="TRAFO-3", name="Trafo 3", power_mva=10)
        db_session.add(t3)
        db_session.commit()
    
    with pytest.raises(ValueError, match="fiziksel hat topolojisi"):
        simulate_maneuver(db_session, "feeder", "F-1", "TRAFO-3")

    # 3. Apply feeder maneuver
    log = apply_maneuver(db_session, "feeder", "F-1", "TRAFO-2", reason="Test transfer")
    assert log is not None
    assert log.status == "applied"

    # 4. Get Maneuver History
    history = get_maneuver_history(db_session)
    assert history["total"] >= 1

    # 5. Rollback maneuver
    rolled_back = rollback_maneuver(db_session, log.id)
    assert rolled_back is not None
    assert rolled_back.status == "rolled_back"

def test_reactor_maneuver_simulation(db_session):
    t1 = db_session.query(models.Transformer).filter_by(id="TRAFO-1").first()
    t2 = db_session.query(models.Transformer).filter_by(id="TRAFO-2").first()
    
    r2 = models.Reactor(
        id="R-2", name="Reactor 2",
        current_transformer_id="TRAFO-1",
        alternative_transformer_id="TRAFO-2",
        capacity_kvar=300.0, status="inactive"
    )
    db_session.add(r2)
    db_session.commit()

    sim_res = simulate_maneuver(db_session, "reactor", "R-2", "TRAFO-2")
    assert sim_res["asset_id"] == "R-2"

from unittest.mock import patch

def test_analyze_and_suggest_maneuvers(db_session):
    # Mocking internal dependencies of analyze_and_suggest_maneuvers
    with patch('services.maneuver_service._get_trafo_stats') as mock_stats, \
         patch('services.maneuver_service._get_projected_monthly_ratios') as mock_proj:
        
        # Setup mock models
        t1_model = SimpleNamespace(id="T1", name="Trafo 1", power_mva=100.0, status="active", 
                                  feeders=[SimpleNamespace(id="F1", name="Fider 1", simulated_load_kw=20.0, alternative_transformer_id="T2")],
                                  reactors=[SimpleNamespace(id="R1", name="Reaktor 1", capacity_kvar=100.0, status="inactive", alternative_transformer_id="T2"),
                                            SimpleNamespace(id="R1_active", name="Reaktor 1A", capacity_kvar=100.0, status="active", alternative_transformer_id="T2")])
        t2_model = SimpleNamespace(id="T2", name="Trafo 2", power_mva=100.0, status="active",
                                  feeders=[],
                                  reactors=[SimpleNamespace(id="R2", name="Reaktor 2", capacity_kvar=100.0, status="inactive", alternative_transformer_id="T1")])

        # Mock the stats returned by get_transformer_stats_and_status
        mock_stats.return_value = ([t1_model, t2_model], {
            "T1": {
                "model": t1_model,
                "power_kw": 100000.0,
                "avg_active": 80000.0,
                "load_ratio": 80.0, # >50 -> triggers feeder transfer if diff > 15
                "cap_ratio": 20.0,  # >15 -> triggers reactor turn on
                "ind_ratio": 20.0,  # >15 -> triggers reactor turn off
                "offpeak_cap_ratio": 15.0, # >12 -> triggers night time warning
                "reactors": t1_model.reactors
            },
            "T2": {
                "model": t2_model,
                "power_kw": 100000.0,
                "avg_active": 30000.0,
                "load_ratio": 30.0, # Load diff is 50 > 15 -> T1 to T2 feeder transfer
                "cap_ratio": 5.0,
                "ind_ratio": 5.0,
                "offpeak_cap_ratio": 5.0,
                "reactors": t2_model.reactors
            }
        })

        # Mock the projected ratios (predictive)
        def proj_side_effect(db, t_id):
            if t_id == "T1":
                return (16.0, 21.0) # >14.5 and >19.5 -> triggers predictive cap and ind
            return (5.0, 5.0)
        mock_proj.side_effect = proj_side_effect

        # Mock is_feeder_energized and is_transformer_energized
        with patch('services.maneuver_service.is_feeder_energized', return_value=True), \
             patch('services.maneuver_service.is_transformer_energized', return_value=True):
            
            suggestions = analyze_and_suggest_maneuvers(db_session)
            assert isinstance(suggestions, list)
            assert len(suggestions) > 0
            
            # Verify that different types of suggestions were generated
            action_types = [s["action_type"] for s in suggestions]
            
            assert "feeder_transfer" in action_types
            assert "reactor_transfer" in action_types
            assert "predictive_reactor_transfer" in action_types

def test_feeder_reactor_crud(db_session):
    # Feeder CRUD
    f_data = SimpleNamespace(
        id="F-NEW",
        name="New Feeder",
        current_transformer_id="TRAFO-1",
        alternative_transformer_id="TRAFO-2",
        simulated_load_kw=400.0,
        pos_x=0.0,
        pos_y=0.0
    )
    new_f = create_feeder(db_session, f_data)
    assert new_f.id == "F-NEW"

    del_f_res = delete_feeder(db_session, "F-NEW")
    assert del_f_res is True or del_f_res.get("success") is True

    # Reactor CRUD
    r_data = SimpleNamespace(
        id="R-NEW",
        name="New Reactor",
        current_transformer_id="TRAFO-1",
        alternative_transformer_id="TRAFO-2",
        capacity_kvar=150.0,
        status="inactive",
        pos_x=0.0,
        pos_y=0.0
    )
    new_r = create_reactor(db_session, r_data)
    assert new_r.id == "R-NEW"

    del_r_res = delete_reactor(db_session, "R-NEW")
    assert del_r_res is True or del_r_res.get("success") is True

def test_bulk_update_topology(db_session):
    bulk_data = SimpleNamespace(
        new_transformers=[
            SimpleNamespace(id="T-BULK-1", name="Bulk Trafo 1", region="Kadıköy", power_mva=40.0, status="active", pos_x=10.0, pos_y=10.0)
        ],
        new_feeders=[
            SimpleNamespace(id="F-BULK-1", name="Bulk Feeder 1", current_transformer_id="T-BULK-1", alternative_transformer_id="TRAFO-1", simulated_load_kw=100.0, pos_x=20.0, pos_y=20.0)
        ],
        new_reactors=[],
        new_kuplajlar=[],
        updated_assets=[
            SimpleNamespace(id="T-BULK-1", type="trafo", pos_x=50.0, pos_y=50.0, current_transformer_id=None, alternative_transformer_id=None)
        ]
    )

    result = bulk_update_topology(db_session, bulk_data)
    assert "created_transformers" in result
    assert "T-BULK-1" in result["created_transformers"]
