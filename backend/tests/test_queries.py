import pytest
from app.queries import run_query, query_exists

def test_known_query_returns_mock_data():
    assert run_query("tasks_overdue") == {"value": 3}

def test_table_query_returns_rows():
    result = run_query("tasks_by_person")
    assert isinstance(result, list)
    assert result[0]["person"] == "Persona A"

def test_unknown_query_raises():
    assert query_exists("no_existe") is False
    with pytest.raises(KeyError):
        run_query("no_existe")
