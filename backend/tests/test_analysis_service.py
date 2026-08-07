from services.analysis_service import hesapla_risk_durumu, get_monthly_summary
from datetime import datetime
from db.models import Measurement, Transformer

def test_hesapla_risk_durumu_guvenli():
    # Aktif = 1000, Kapasitif = 50 (%5), Endüktif = 100 (%10) → Güvenli
    genel, kap_o, end_o, kap_s, end_s = hesapla_risk_durumu(1000, 50, 100)
    assert genel == "guvenli"
    assert kap_o == 5.0
    assert end_o == 10.0

def test_hesapla_risk_durumu_kapasitif_tehlikeli():
    # Aktif = 1000, Kapasitif = 160 (%16), Endüktif = 100 (%10) → Tehlikeli
    genel, kap_o, end_o, kap_s, end_s = hesapla_risk_durumu(1000, 160, 100)
    assert genel == "tehlikeli"
    assert kap_s == "tehlikeli"

def test_hesapla_risk_durumu_enduktif_tehlikeli():
    # Aktif = 1000, Kapasitif = 50 (%5), Endüktif = 220 (%22) → Tehlikeli (endüktif aşım)
    genel, kap_o, end_o, kap_s, end_s = hesapla_risk_durumu(1000, 50, 220)
    assert genel == "tehlikeli"
    assert end_s == "tehlikeli"

def test_hesapla_risk_durumu_kapasitif_riskli_ve_dikkat():
    genel, kap_o, end_o, kap_s, end_s = hesapla_risk_durumu(1000, 130, 0)
    assert kap_s == "riskli"

    genel, kap_o, end_o, kap_s, end_s = hesapla_risk_durumu(1000, 110, 0)
    assert kap_s == "dikkat"

def test_hesapla_risk_durumu_enduktif_riskli_ve_dikkat():
    genel, kap_o, end_o, kap_s, end_s = hesapla_risk_durumu(1000, 0, 180)
    assert end_s == "riskli"

    genel, kap_o, end_o, kap_s, end_s = hesapla_risk_durumu(1000, 0, 140)
    assert end_s == "dikkat"

def test_get_monthly_summary_no_trafo(db_session):
    # If a measurement exists for a transformer that is not in the transformers table
    m = Measurement(transformer_id=9999, timestamp=datetime(2023, 1, 1), active_kwh=100, inductive_kvarh=10, capacitive_kvarh=5)
    db_session.add(m)
    db_session.commit()
    
    # Run the monthly summary
    results = get_monthly_summary(db_session, 2023, 1)
    
    # The transformer won't be found so the result will just continue, and results list will be empty
    assert len(results) == 0

def test_process_measurements():
    from services.analysis_service import process_measurements
    
    m1 = Measurement(
        id=1, transformer_id="T1", timestamp=datetime(2023, 1, 1, 10),
        active_kwh=100, inductive_kvarh=10, capacitive_kvarh=5
    )
    m2 = Measurement(
        id=2, transformer_id="T1", timestamp=datetime(2023, 1, 1, 11),
        active_kwh=0, inductive_kvarh=5, capacitive_kvarh=0
    )
    m3 = Measurement(
        id=3, transformer_id="T1", timestamp=datetime(2023, 1, 1, 12),
        active_kwh=0, inductive_kvarh=0, capacitive_kvarh=5
    )
    m4 = Measurement(
        id=4, transformer_id="T2", timestamp=datetime(2023, 1, 1, 10),
        active_kwh=0, inductive_kvarh=0, capacitive_kvarh=0
    )
    
    res = process_measurements([m1, m2, m3, m4])
    assert len(res) == 4
    
    # m2 has active_kwh=0 but inductive>0 -> oran_enduktif=999.0, oran_kapasitif=0.0
    assert res[1]["enduktifOran"] == 999.0
    assert res[1]["kapasitifOran"] == 0.0
    
    # m3 has active_kwh=0 but capacitive>0 -> oran_enduktif=0.0, oran_kapasitif=999.0
    assert res[2]["kapasitifOran"] == 999.0
    assert res[2]["enduktifOran"] == 0.0
    
    # m4 has active=0, ind=0, cap=0 -> 0.0, 0.0
    assert res[3]["enduktifOran"] == 0.0
    assert res[3]["kapasitifOran"] == 0.0
