from pydantic import BaseModel

class Widget(BaseModel):
    type: str          # "kpi_card", "table", ... (registro en el frontend)
    query: str         # nombre de query en el registro del backend
    title: str

class UiSpec(BaseModel):
    narration: str
    widgets: list[Widget]

class ConverseRequest(BaseModel):
    text: str          # transcript final del usuario

class RenderedWidget(BaseModel):
    type: str
    title: str
    data: dict | list  # datos reales bindeados desde el registro de queries

class ConverseResponse(BaseModel):
    narration: str
    widgets: list[Widget]
