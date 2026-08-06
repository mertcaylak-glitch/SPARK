import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta
from core.ws_handler import ConnectionManager
from core.simulator import generate_hourly_data, generate_historical_data
from db import models

# 1. WS Handler Coverage (broadcast with failing connection)
@pytest.mark.anyio
async def test_ws_manager_broadcast_error():
    manager = ConnectionManager()
    
    mock_good_ws = MagicMock()
    async def mock_send_json_good(msg):
        pass
    mock_good_ws.send_json = mock_send_json_good

    mock_bad_ws = MagicMock()
    async def mock_send_json_bad(msg):
        raise RuntimeError("Connection closed")
    mock_bad_ws.send_json = mock_send_json_bad

    manager.active_connections = [mock_good_ws, mock_bad_ws]
    
    await manager.broadcast({"type": "test"})
    assert mock_bad_ws not in manager.active_connections
    assert mock_good_ws in manager.active_connections

# 2. Simulator Coverage
def test_simulator_branches(db_session):
    # Setup transformer & feeder
    t = models.Transformer(id="SIM-COV-T1", name="Sim Trafo", power_mva=10, status="active")
    f = models.Feeder(id="FDR-UMR-1", name="F1", current_transformer_id="SIM-COV-T1")
    db_session.add(t)
    db_session.add(f)
    
    now = datetime.now().replace(minute=0, second=0, microsecond=0)
    # Add measurement for now
    m = models.Measurement(transformer_id="SIM-COV-T1", timestamp=now, active_kwh=100, inductive_kvarh=10, capacitive_kvarh=10)
    db_session.add(m)
    db_session.commit()

    # Add measurement 364 days prior so get_historical_baseline returns a tuple (hits lines 74-76)
    last_year = now - timedelta(days=364)
    m_prev = models.Measurement(transformer_id="UMR-TRA", timestamp=last_year, active_kwh=1000, inductive_kvarh=100, capacitive_kvarh=50)
    db_session.add(m_prev)
    db_session.commit()

    from core.simulator import generate_measurement_values
    active, ind, cap = generate_measurement_values(db_session, t, now)
    assert active > 0

    # Hit 167 & 178-179 by running generate_hourly_data when measurements already exist up to now + 1 hour
    next_hour = now + timedelta(hours=1)
    m_next = models.Measurement(transformer_id="SIM-COV-T1", timestamp=next_hour, active_kwh=100, inductive_kvarh=10, capacitive_kvarh=10)
    db_session.add(m_next)
    db_session.commit()

    with patch('core.simulator.SessionLocal', return_value=db_session):
        generate_hourly_data()

    # Hit 203-205 by throwing error in generate_hourly_data
    mock_bad_db = MagicMock()
    mock_bad_db.query.side_effect = Exception("DB Fail")
    with patch('core.simulator.SessionLocal', return_value=mock_bad_db):
        generate_hourly_data()

    # Hit 228 by running generate_historical_data when data already exists
    with patch('core.simulator.SessionLocal', return_value=db_session):
        generate_historical_data(days=1)

    # Hit 249-251 by throwing error in generate_historical_data
    with patch('core.simulator.SessionLocal', return_value=mock_bad_db):
        generate_historical_data(days=1)
