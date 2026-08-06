import pytest
from db import models

def test_get_maneuver_assets(client, db_session):
    response = client.get("/api/maneuver/assets")
    assert response.status_code == 200
    data = response.json()
    assert "transformers" in data
    assert "feeders" in data
    assert "reactors" in data
    assert "kuplajlar" in data

def test_get_maneuver_suggestions(client, db_session):
    response = client.get("/api/maneuver/suggest")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_maneuver_crud_and_endpoints(client, db_session):
    import uuid
    u_t1 = f"T-API-{uuid.uuid4().hex[:6]}"
    u_t2 = f"T-API-{uuid.uuid4().hex[:6]}"
    u_f1 = f"F-API-{uuid.uuid4().hex[:6]}"
    u_r1 = f"R-API-{uuid.uuid4().hex[:6]}"

    # 1. Create Transformer
    t_data = {
        "id": u_t1,
        "name": f"Test Trafo {u_t1}",
        "region": "Ümraniye",
        "power_mva": 50.0,
        "status": "active",
        "pos_x": 100.0,
        "pos_y": 200.0
    }
    t_res = client.post("/api/maneuver/transformer", json=t_data)
    assert t_res.status_code == 200
    assert t_res.json()["status"] == "success"

    # Duplicate Transformer -> 400
    t_dup = client.post("/api/maneuver/transformer", json=t_data)
    assert t_dup.status_code == 400

    # Create Alt Transformer
    t2_data = {
        "id": u_t2,
        "name": f"Test Trafo {u_t2}",
        "region": "Ümraniye",
        "power_mva": 50.0,
        "status": "active"
    }
    client.post("/api/maneuver/transformer", json=t2_data)

    # 2. Create Feeder
    f_data = {
        "id": u_f1,
        "name": f"Feeder {u_f1}",
        "current_transformer_id": u_t1,
        "alternative_transformer_id": u_t2,
        "simulated_load_kw": 300.0
    }
    f_res = client.post("/api/maneuver/feeder", json=f_data)
    assert f_res.status_code == 200

    # 3. Create Reactor
    r_data = {
        "id": u_r1,
        "name": f"Reactor {u_r1}",
        "current_transformer_id": u_t1,
        "alternative_transformer_id": u_t2,
        "capacity_kvar": 150.0,
        "status": "inactive"
    }
    r_res = client.post("/api/maneuver/reactor", json=r_data)
    assert r_res.status_code == 200

    # 4. Simulate maneuver
    sim_res = client.post("/api/maneuver/simulate", params={
        "asset_type": "feeder",
        "asset_id": u_f1,
        "target_trafo_id": u_t2
    })
    assert sim_res.status_code == 200

    # 5. Apply maneuver
    apply_res = client.post("/api/maneuver/apply", json={
        "asset_type": "feeder",
        "asset_id": u_f1,
        "target_trafo_id": u_t2,
        "reason": "API Test Transfer"
    })
    assert apply_res.status_code == 200
    log_id = apply_res.json()["log_id"]

    # 6. History
    hist_res = client.get("/api/maneuver/history")
    assert hist_res.status_code == 200

    # 7. Rollback
    rb_res = client.post(f"/api/maneuver/rollback/{log_id}")
    assert rb_res.status_code == 200

    # Rollback invalid log id -> 400
    rb_invalid = client.post("/api/maneuver/rollback/99999")
    assert rb_invalid.status_code == 400

    # 8. Delete Feeder and Reactor
    del_f = client.delete(f"/api/maneuver/feeder/{u_f1}")
    assert del_f.status_code == 200

    del_r = client.delete(f"/api/maneuver/reactor/{u_r1}")
    assert del_r.status_code == 200

    # Delete non-existent -> 404
    assert client.delete("/api/maneuver/feeder/NONEXISTENT").status_code == 404
    assert client.delete("/api/maneuver/reactor/NONEXISTENT").status_code == 404

