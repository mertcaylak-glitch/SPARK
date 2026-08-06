import pytest
from unittest.mock import patch, MagicMock

# 1. Alerts Route
def test_alerts_routes(client, db_session):
    res_get = client.get("/api/alerts?limit=10&year=2026&month=8")
    assert res_get.status_code == 200

    res_check = client.post("/api/alerts/check?year=2026&month=8")
    assert res_check.status_code == 200

# 2. Analysis Route
def test_analysis_routes(client, db_session):
    res = client.get("/api/analysis/summary?year=2026&month=8&transformer_id=UMR-TRA")
    assert res.status_code == 200

# 3. Forecast Route
def test_forecast_routes(client, db_session):
    res = client.get("/api/forecast?transformer_id=UMR-TRA&year=2026&month=8&method=ensemble")
    assert res.status_code == 200

# 4. Models Eval Route
def test_models_eval_routes(client, db_session):
    with patch('services.model_eval_service.evaluate_all_models', return_value={"status": "ok"}):
        res = client.get("/api/models/evaluate?transformer_id=UMR-TRA&steps=24")
        assert res.status_code == 200

# 5. Powerflow Route
def test_powerflow_routes(client):
    # Success network
    with patch('services.grid_topology.topology_service.get_network_state', return_value={"buses": []}):
        res = client.get("/api/powerflow/network")
        assert res.status_code == 200

    # Error network -> 500
    with patch('services.grid_topology.topology_service.get_network_state', return_value={"error": "PandaPower error"}):
        res_err = client.get("/api/powerflow/network")
        assert res_err.status_code == 500

    # Simulate success
    payload = {"element_type": "line", "element_id": 0, "action": "open"}
    valid_res = {"status": "success", "message": "OK", "summary": {}}
    with patch('services.grid_topology.topology_service.simulate_action', return_value=valid_res):
        res_sim = client.post("/api/powerflow/simulate", json=payload)
        assert res_sim.status_code == 200

    # Simulate ValueError -> 400
    with patch('services.grid_topology.topology_service.simulate_action', side_effect=ValueError("Invalid element")):
        res_sim_err = client.post("/api/powerflow/simulate", json=payload)
        assert res_sim_err.status_code == 400

    # Simulate Exception -> 500
    with patch('services.grid_topology.topology_service.simulate_action', side_effect=RuntimeError("Internal fail")):
        res_sim_err2 = client.post("/api/powerflow/simulate", json=payload)
        assert res_sim_err2.status_code == 500

# 6. SCADA Route
def test_scada_routes(client, db_session):
    # State
    res_state = client.get("/api/scada/state")
    assert res_state.status_code == 200

    # Breaker toggle
    breaker_payload = {
        "breaker_id": "t101-q1",
        "target_state": True,
        "trafo_id": "UMR-TRA",
        "reason": "Test"
    }
    with patch('core.ws_handler.ws_manager.broadcast'):
        res_brk = client.post("/api/scada/breaker", json=breaker_payload)
        assert res_brk.status_code == 200

    # Alarm ack
    alarm_payload = {"alarm_id": "ALM-1"}
    with patch('core.ws_handler.ws_manager.broadcast'):
        res_alm = client.post("/api/scada/alarm/ack", json=alarm_payload)
        assert res_alm.status_code == 200

    # Pandapower trafos
    with patch('services.grid_topology.topology_service.get_trafos', return_value=[]):
        res_trf = client.get("/api/scada/pandapower/trafos")
        assert res_trf.status_code == 200

# 7. WebSockets Route
def test_websocket_route(client):
    with client.websocket_connect("/ws") as websocket:
        websocket.send_text("hello")
        # receive response broadcast ping
        data = websocket.receive_json()
        assert data["type"] == "ping"

# 8. Maneuver Route Edge Cases
def test_maneuver_route_edge_cases(client, db_session):
    # Simulate return None -> 404
    with patch('services.maneuver_service.simulate_maneuver', return_value=None):
        res = client.post("/api/maneuver/simulate?asset_type=feeder&asset_id=F1&target_trafo_id=T2")
        assert res.status_code == 404

    # Simulate raise ValueError -> 400
    with patch('services.maneuver_service.simulate_maneuver', side_effect=ValueError("Invalid trafo")):
        res_err = client.post("/api/maneuver/simulate?asset_type=feeder&asset_id=F1&target_trafo_id=T2")
        assert res_err.status_code == 400

    # Apply raise ValueError -> 400
    apply_payload = {
        "asset_type": "feeder",
        "asset_id": "F1",
        "target_trafo_id": "T2",
        "reason": "Test",
        "override_overload": False
    }
    with patch('services.maneuver_service.apply_maneuver', side_effect=ValueError("Overload")):
        res_app_err = client.post("/api/maneuver/apply", json=apply_payload)
        assert res_app_err.status_code == 400

    # Create Feeder return None -> 400
    feeder_payload = {
        "id": "F-EXISTING",
        "name": "Feeder Ex",
        "current_transformer_id": "UMR-TRA",
        "alternative_transformer_id": None,
        "simulated_load_kw": 100,
        "pos_x": 0,
        "pos_y": 0
    }
    with patch('services.maneuver_service.create_feeder', return_value=None):
        res_f = client.post("/api/maneuver/feeder", json=feeder_payload)
        assert res_f.status_code == 400

    # Create Reactor return None -> 400
    reactor_payload = {
        "id": "R-EXISTING",
        "name": "Reactor Ex",
        "current_transformer_id": "UMR-TRA",
        "alternative_transformer_id": None,
        "capacity_kvar": 100,
        "status": "active",
        "pos_x": 0,
        "pos_y": 0
    }
    with patch('services.maneuver_service.create_reactor', return_value=None):
        res_r = client.post("/api/maneuver/reactor", json=reactor_payload)
        assert res_r.status_code == 400

    # Bulk update endpoint
    bulk_payload = {
        "new_transformers": [],
        "new_feeders": [],
        "new_reactors": [],
        "new_kuplajlar": [],
        "updated_assets": []
    }
    res_bulk = client.post("/api/maneuver/topology/bulk-update", json=bulk_payload)
    assert res_bulk.status_code == 200

# 9. OSOS Route Edge Cases
def test_osos_route_edge_cases(client, db_session):
    # Measurements with date filter
    res_m = client.get("/api/osos/fetch?transformer_id=UMR-TRA&start_date=2026-01-01&end_date=2026-12-31")
    assert res_m.status_code == 200

    # Delete measurement single date (len=10)
    res_del_10 = client.delete("/api/osos/measurements?transformer_id=UMR-TRA&timestamp=2026-01-01")
    assert res_del_10.status_code in [200, 404]

    # Delete measurement space date
    res_del_space = client.delete("/api/osos/measurements?transformer_id=UMR-TRA&timestamp=2026-01-01%2010:00:00")
    assert res_del_space.status_code in [200, 404]

    # Post measurements single object
    single_payload = {
        "transformer_id": "UMR-TRA",
        "timestamp": "2026-08-01T12:00:00",
        "active_kwh": 500,
        "inductive_kvarh": 50,
        "capacitive_kvarh": 10
    }
    res_post_s = client.post("/api/osos/measurements", json=single_payload)
    assert res_post_s.status_code == 200
