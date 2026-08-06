import pytest
from unittest.mock import patch, MagicMock
from db.init_db import seed_transformers

def test_seed_transformers_coverage():
    # 1. Empty DB branch
    mock_empty_db = MagicMock()
    mock_empty_db.query.return_value.first.return_value = None
    
    with patch('db.init_db.SessionLocal', return_value=mock_empty_db):
        seed_transformers()
        assert mock_empty_db.add_all.call_count >= 3
        assert mock_empty_db.commit.called

    # 2. Already seeded DB branch (hits line 24)
    mock_seeded_db = MagicMock()
    mock_seeded_db.query.return_value.first.return_value = MagicMock()
    with patch('db.init_db.SessionLocal', return_value=mock_seeded_db):
        seed_transformers()
        assert mock_seeded_db.add_all.call_count == 0
