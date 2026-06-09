from fastapi.testclient import TestClient
from app.main import app, set_brain
from app.brain import FakeBrain
from app.schemas import UiSpec, Widget

def test_converse_binds_real_data_to_widgets():
    set_brain(FakeBrain(canned=UiSpec(
        narration="Tenés 3 atrasadas.",
        widgets=[Widget(type="kpi_card", query="tasks_overdue", title="Atrasadas")],
    )))
    client = TestClient(app)
    resp = client.post("/converse", json={"text": "cuántas atrasadas"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["narration"] == "Tenés 3 atrasadas."
    # el dato lo pone la query, no el modelo:
    assert body["widgets"][0]["data"] == {"value": 3}
    assert body["widgets"][0]["type"] == "kpi_card"
    assert body["widgets"][0]["title"] == "Atrasadas"

def test_converse_unknown_query_renders_no_data():
    set_brain(FakeBrain(canned=UiSpec(
        narration="hmm",
        widgets=[Widget(type="kpi_card", query="no_existe", title="X")],
    )))
    client = TestClient(app)
    resp = client.post("/converse", json={"text": "algo"})
    assert resp.status_code == 200
    assert resp.json()["widgets"][0]["data"] is None
