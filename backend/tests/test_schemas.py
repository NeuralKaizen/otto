from app.schemas import Widget, UiSpec, RenderedWidget, ConverseRequest, ConverseResponse

def test_widget_roundtrip():
    w = Widget(type="kpi_card", query="tasks_overdue", title="Atrasadas")
    assert w.type == "kpi_card"
    assert w.query == "tasks_overdue"

def test_uispec_holds_widget_specs():
    spec = UiSpec(
        narration="Tenés 3 atrasadas.",
        widgets=[Widget(type="kpi_card", query="tasks_overdue", title="Atrasadas")],
    )
    assert spec.widgets[0].query == "tasks_overdue"

def test_rendered_widget_accepts_dict_and_list():
    kpi = RenderedWidget(type="kpi_card", title="Atrasadas", data={"value": 3})
    table = RenderedWidget(type="table", title="Por persona", data=[{"person": "A"}])
    assert kpi.data == {"value": 3}
    assert table.data == [{"person": "A"}]

def test_converse_response_carries_bound_data():
    resp = ConverseResponse(
        narration="Tenés 3 atrasadas.",
        widgets=[RenderedWidget(type="kpi_card", title="Atrasadas", data={"value": 3})],
    )
    dumped = resp.model_dump()
    assert dumped["narration"] == "Tenés 3 atrasadas."
    assert dumped["widgets"][0]["data"] == {"value": 3}
    assert dumped["widgets"][0]["type"] == "kpi_card"

def test_converse_request_shape():
    req = ConverseRequest(text="cuántas tareas atrasadas hay")
    assert req.text == "cuántas tareas atrasadas hay"
