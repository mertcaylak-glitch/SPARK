import pytest
import datetime
from db import models

def test_fetch_osos_measurements_invalid_date(client):
    res = client.get("/api/osos/fetch?start_date=invalid&end_date=2026-08-01")
    assert res.status_code == 400
    assert "Invalid date format" in res.json()["detail"]

def test_fetch_osos_measurements_success(client, db_session):
    t = db_session.query(models.Transformer).filter_by(id="UMR-TRA").first()
    if not t:
        t = models.Transformer(id="UMR-TRA", name="Ümraniye Trafo", power_mva=100)
        db_session.add(t)
        db_session.commit()

    m = models.Measurement(
        transformer_id="UMR-TRA",
        timestamp=datetime.datetime(2026, 8, 1, 10, 0),
        active_kwh=1000,
        inductive_kvarh=100,
        capacitive_kvarh=50
    )
    db_session.add(m)
    db_session.commit()

    res = client.get("/api/osos/fetch?start_date=2026-08-01&end_date=2026-08-01&transformer_id=UMR-TRA")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)

def test_add_osos_measurement(client, db_session):
    t = db_session.query(models.Transformer).filter_by(id="UMR-TRA").first()
    if not t:
        t = models.Transformer(id="UMR-TRA", name="Ümraniye Trafo", power_mva=100)
        db_session.add(t)
        db_session.commit()

    payload = {
        "transformer_id": "UMR-TRA",
        "timestamp": "2026-08-01T12:00:00",
        "active_kwh": 500,
        "inductive_kvarh": 50,
        "capacitive_kvarh": 20
    }

    res = client.post("/api/osos/measurements", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["transformer_id"] == "UMR-TRA"
    assert data["active_kwh"] == 500

    # Upsert test
    payload["active_kwh"] = 600
    res2 = client.post("/api/osos/measurements", json=payload)
    assert res2.status_code == 200
    assert res2.json()["active_kwh"] == 600

def test_add_osos_measurements_bulk(client, db_session):
    t = db_session.query(models.Transformer).filter_by(id="UMR-TRA").first()
    if not t:
        t = models.Transformer(id="UMR-TRA", name="Ümraniye Trafo", power_mva=100)
        db_session.add(t)
        db_session.commit()

    bulk_payload = [
        {
            "transformer_id": "UMR-TRA",
            "timestamp": "2026-08-02T10:00:00",
            "active_kwh": 700,
            "inductive_kvarh": 70,
            "capacitive_kvarh": 30
        },
        {
            "transformer_id": "UMR-TRA",
            "timestamp": "2026-08-02T11:00:00",
            "active_kwh": 800,
            "inductive_kvarh": 80,
            "capacitive_kvarh": 40
        }
    ]

    res = client.post("/api/osos/measurements/bulk", json=bulk_payload)
    assert res.status_code == 200
    assert res.json()["status"] == "success"

def test_delete_osos_measurement(client, db_session):
    t = db_session.query(models.Transformer).filter_by(id="UMR-TRA").first()
    if not t:
        t = models.Transformer(id="UMR-TRA", name="Ümraniye Trafo", power_mva=100)
        db_session.add(t)
        db_session.commit()

    m = models.Measurement(
        transformer_id="UMR-TRA",
        timestamp=datetime.datetime(2026, 8, 3, 10, 0),
        active_kwh=1000,
        inductive_kvarh=100,
        capacitive_kvarh=50
    )
    db_session.add(m)
    db_session.commit()

    # Invalid date format -> 400
    res_inv = client.delete("/api/osos/measurements?transformer_id=UMR-TRA&timestamp=invalid")
    assert res_inv.status_code == 400

    # Nonexistent -> 404
    res_404 = client.delete("/api/osos/measurements?transformer_id=NONEXISTENT_TRAFO&timestamp=2026-08-03T11:00:00")
    assert res_404.status_code == 404

    # Valid delete -> 200
    client.post("/api/osos/measurements", json={
        "transformer_id": "UMR-TRA",
        "timestamp": "2026-08-03T10:00:00",
        "active_kwh": 1000,
        "inductive_kvarh": 100,
        "capacitive_kvarh": 50
    })
    res_del = client.delete("/api/osos/measurements?transformer_id=UMR-TRA&timestamp=2026-08-03T10:00:00")
    assert res_del.status_code == 200

def test_upload_excel_invalid(client):
    # Invalid extension -> 400
    files = {"file": ("test.txt", b"hello world", "text/plain")}
    res = client.post("/api/osos/upload-excel", files=files)
    assert res.status_code == 400

def test_upload_excel_valid_and_branches(client, db_session):
    import pandas as pd
    import io
    
    # Branch: Empty dataframe -> 400
    df_empty = pd.DataFrame()
    b_empty = io.BytesIO()
    df_empty.to_excel(b_empty, index=False)
    files = {"file": ("test.xlsx", b_empty.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    res_empty = client.post("/api/osos/upload-excel", files=files)
    assert res_empty.status_code == 400

    # Branch: XSS Trafo Name -> 400
    df_xss = pd.DataFrame({
        "Tarih": ["2026-01-01 10:00:00"],
        "<script> UMR Aktif": [100],
        "<script> UMR Reaktif": [50]
    })
    b_xss = io.BytesIO()
    df_xss.to_excel(b_xss, index=False)
    res_xss = client.post("/api/osos/upload-excel", files={"file": ("test.xlsx", b_xss.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert res_xss.status_code == 400
    
    # Branch: Invalid Trafo ID regex -> 400
    df_inv_id = pd.DataFrame({
        "Tarih": ["2026-01-01 10:00:00"],
        "UMR!@# Aktif": [100],
        "UMR!@# Reaktif": [50]
    })
    b_inv_id = io.BytesIO()
    df_inv_id.to_excel(b_inv_id, index=False)
    res_inv_id = client.post("/api/osos/upload-excel", files={"file": ("test.xlsx", b_inv_id.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert res_inv_id.status_code == 400
    
    # Branch: Valid Data (Insert & Update)
    # We provide capacitive (negative reaktif) and inductive (positive reaktif)
    df_valid = pd.DataFrame({
        "Tarih": ["2026-01-01 10:00:00", "2026-01-01 11:00:00", "2026-01-01 12:00:00", pd.NaT],
        "UMR-EXCEL Aktif": [100, 200, 0, 0],
        "UMR-EXCEL Reaktif": [50, -50, 0, 0] # 50 ind, 50 cap
    })
    b_valid = io.BytesIO()
    df_valid.to_excel(b_valid, index=False)
    res_valid = client.post("/api/osos/upload-excel", files={"file": ("test.xlsx", b_valid.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert res_valid.status_code == 200
    data = res_valid.json()
    assert data["status"] == "success"
    
    # Test update existing (run same data again)
    res_update = client.post("/api/osos/upload-excel", files={"file": ("test.xlsx", b_valid.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert res_update.status_code == 200
    assert "güncellendi" in res_update.json()["message"]
    
    # Branch: Invalid numeric value -> 400
    df_err = pd.DataFrame({
        "Tarih": ["2026-01-01 12:00:00"],
        "UMR-EXCEL Aktif": ["not-a-number"],
        "UMR-EXCEL Reaktif": [0]
    })
    b_err = io.BytesIO()
    df_err.to_excel(b_err, index=False)
    res_err = client.post("/api/osos/upload-excel", files={"file": ("test.xlsx", b_err.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert res_err.status_code == 400

def test_fetch_osos_measurements_with_T_format(client, db_session):
    res = client.get("/api/osos/fetch?start_date=2026-08-01T10:00&end_date=2026-08-01T23:00")
    assert res.status_code == 200
    
def test_upload_batch_new_insert(client, db_session):
    t = models.Transformer(id="TRA-NEW-BATCH", name="New Trafo B", power_mva=10)
    db_session.add(t)
    db_session.commit()
    
    payload = [
        {
            "transformer_id": "TRA-NEW-BATCH",
            "timestamp": "2026-08-02T10:00:00",
            "active_kwh": 100,
            "inductive_kvarh": 50,
            "capacitive_kvarh": 20
        }
    ]
    res = client.post("/api/osos/measurements/bulk", json=payload)
    assert res.status_code == 200
    assert "inserted" in res.json()["message"]

def test_upload_batch_exception(client):
    payload = [{"timestamp": "2026-08-02T10:00:00"}]
    res = client.post("/api/osos/measurements/bulk", json=payload)
    assert res.status_code == 422 

def test_upload_csv_new_transformer(client, db_session):
    import pandas as pd
    import io
    
    import uuid
    unique_name = f"YENI TRAFO {uuid.uuid4().hex[:6].upper()}"
    df = pd.DataFrame({
        "Tarih": ["2026-08-03 10:00:00", "2026-08-04 10:00:00"],
        f"{unique_name} Aktif": [100, 300],
        f"{unique_name} Reaktif": [50, 10]
    })
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        df.to_excel(writer, sheet_name=unique_name, index=False)
    
    output.seek(0)
    
    files = {'file': ('test.xlsx', output, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
    res = client.post("/api/osos/upload-excel", files=files)
    
    assert res.status_code == 200
    assert unique_name in res.json()["new_transformers"]

def test_upload_csv_exception_400(client):
    files = {'file': ('test.txt', b'not an excel', 'text/plain')}
    res = client.post("/api/osos/upload-excel", files=files)
    assert res.status_code == 400

def test_upload_csv_exception_500(client):
    # Valid filename but invalid excel content -> throws Exception -> 500
    files = {'file': ('test.xlsx', b'not an excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
    res = client.post("/api/osos/upload-excel", files=files)
    assert res.status_code == 500
