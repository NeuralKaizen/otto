from app.schemas import Widget, UiSpec, ConverseRequest, ConverseResponse

def test_widget_roundtrip():
    w = Widget(type="kpi_card", query="tasks_overdue", title="Atrasadas")
    assert w.type == "kpi_card"
    assert w.query == "tasks_overdue"

def test_converse_response_shape():
    resp = ConverseResponse(
        narration="Tenés 3 atrasadas.",
        widgets=[Widget(type="kpi_card", query="tasks_overdue", title="Atrasadas")],
    )
    dumped = resp.model_dump()
    assert dumped["narration"] == "Tenés 3 atrasadas."
    assert dumped["widgets"][0]["query"] == "tasks_overdue"

def test_converse_request_shape():
    req = ConverseRequest(text="cuántas tareas atrasadas hay")
    assert req.text == "cuántas tareas atrasadas hay"
