import pytest
import os
import asyncio
from unittest.mock import patch, MagicMock
from main import app, lifespan, get_db, wait_for_simulator
from core.ws_handler import ws_manager

@pytest.mark.anyio
async def test_main_get_db():
    mock_db = MagicMock()
    with patch('main.SessionLocal', return_value=mock_db):
        gen = get_db()
        db = next(gen)
        assert db == mock_db
        try:
            next(gen)
        except StopIteration:
            pass
        assert mock_db.close.called

@pytest.mark.anyio
async def test_main_lifespan_and_internal_jobs():
    mock_db = MagicMock()
    mock_db.query.return_value.count.return_value = 0 # hits lines 68-69

    mock_ws = MagicMock()
    ws_manager.active_connections.append(mock_ws)

    with patch.dict(os.environ, {"TESTING": "False"}), \
         patch('main.SessionLocal', return_value=mock_db), \
         patch('db.init_db.seed_transformers'), \
         patch('core.simulator.generate_historical_data'), \
         patch('core.simulator.generate_hourly_data', side_effect=Exception("Startup Fail")), \
         patch('services.forecast.engine.seed_missing_forecasts'), \
         patch('apscheduler.schedulers.background.BackgroundScheduler.start'), \
         patch('apscheduler.schedulers.background.BackgroundScheduler.shutdown'), \
         patch('apscheduler.schedulers.background.BackgroundScheduler.add_job') as mock_add_job:

        async with lifespan(app):
            # Extract and call internal jobs
            for call in mock_add_job.call_args_list:
                job_func = call[0][0]
                if getattr(job_func, '__name__', '') == 'run_alert_check_job':
                    with patch('services.alert_service.check_and_generate_alerts', side_effect=Exception("Alert Job Fail")):
                        job_func() # hits lines 97-98
                        
            # Give telemetry loop a moment to run lines 114-122 with an exception to hit 119-120
            with patch('services.scada_service.generate_telemetry_snapshot', side_effect=Exception("SCADA Loop Fail")), \
                 patch('core.ws_handler.ws_manager.broadcast'):
                await asyncio.sleep(2.1)

    ws_manager.active_connections.clear()

@pytest.mark.anyio
async def test_main_lifespan_testing_true():
    with patch.dict(os.environ, {"TESTING": "True"}), \
         patch('db.init_db.seed_transformers'):
        async with lifespan(app):
            pass

@pytest.mark.anyio
async def test_main_wait_for_simulator_middleware():
    mock_request = MagicMock()
    mock_request.url.path = "/ws"
    
    async def mock_call_next(req):
        return "OK"

    # Test /ws bypass branch
    res = await wait_for_simulator(mock_request, mock_call_next)
    assert res == "OK"

    # Test timeout exception branch
    mock_request2 = MagicMock()
    mock_request2.url.path = "/api/test"
    with patch('asyncio.wait_for', side_effect=asyncio.TimeoutError):
        res2 = await wait_for_simulator(mock_request2, mock_call_next)
        assert res2 == "OK"
