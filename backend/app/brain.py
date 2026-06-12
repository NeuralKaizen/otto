"""Adaptador de modelo (model gateway de OTTO_CONTEXT §7). Swappable.
La interfaz Brain.compose(text) -> UiSpec aísla al resto del cerebro concreto."""
import json
import os
from typing import Protocol
from app.schemas import UiSpec, Widget

SYSTEM_PROMPT = (
    "Sos Otto, un agente de consulta y display. Dada la pregunta del usuario, "
    "respondé SOLO con un JSON con esta forma: "
    '{"narration": "<frase corta a decir en voz>", '
    '"widgets": [{"type": "kpi_card|table", "query": "<nombre>", "title": "<titulo>"}]}. '
    "Querys disponibles: tasks_overdue, tasks_active, tasks_by_person. "
    "NUNCA inventes números en los widgets: solo elegís qué query y qué widget. "
    "No agregues texto fuera del JSON."
)

class Brain(Protocol):
    def compose(self, text: str) -> UiSpec: ...

class FakeBrain:
    """Cerebro determinístico para tests. Devuelve siempre el spec inyectado."""
    def __init__(self, canned: UiSpec):
        self._canned = canned

    def compose(self, text: str) -> UiSpec:
        return self._canned

class ClaudeBrain:
    """Cerebro real. Lee ANTHROPIC_API_KEY del entorno."""
    def __init__(self, model: str = "claude-opus-4-8"):
        from anthropic import Anthropic
        self._client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        self._model = model

    def compose(self, text: str) -> UiSpec:
        msg = self._client.messages.create(
            model=self._model,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": text}],
        )
        raw = msg.content[0].text
        return UiSpec.model_validate(json.loads(raw))

class DemoBrain:
    """Fallback sin ANTHROPIC_API_KEY (p. ej. el deploy demo): compone un
    spec razonable por keywords. Mismo contrato; cero números inventados —
    los datos siguen saliendo del registro de queries."""

    def compose(self, text: str) -> UiSpec:
        t = text.lower()
        widgets = [Widget(type="kpi_card", query="tasks_active", title="Activas")]
        if "atrasad" in t or "tarde" in t or "overdue" in t:
            widgets = [
                Widget(type="kpi_card", query="tasks_overdue", title="Atrasadas"),
                Widget(type="table", query="tasks_by_person", title="Por persona"),
            ]
        elif "person" in t or "equipo" in t or "quien" in t or "quién" in t:
            widgets = [Widget(type="table", query="tasks_by_person", title="Por persona")]
        elif "tarea" in t or "activa" in t or "hoy" in t or "viene" in t:
            widgets = [
                Widget(type="kpi_card", query="tasks_active", title="Activas"),
                Widget(type="kpi_card", query="tasks_overdue", title="Atrasadas"),
            ]
        return UiSpec(
            narration="Modo demo sin cerebro conectado. Esto es lo que tengo a mano.",
            widgets=widgets,
        )
