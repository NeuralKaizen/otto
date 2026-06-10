"""Registro de queries. Hoy devuelve mock data de juguete EVIDENTE.
Mañana cada entrada corre SQL determinístico contra Postgres — la
interfaz run_query(name) -> data NO cambia. Esa es la costura."""

_MOCK = {
    "tasks_overdue": lambda: {"value": 3},
    "tasks_active": lambda: {"value": 12},
    "tasks_by_person": lambda: [
        {"person": "Persona A", "open": 5, "overdue": 1},
        {"person": "Persona B", "open": 4, "overdue": 2},
        {"person": "Persona C", "open": 3, "overdue": 0},
    ],
}

def query_exists(name: str) -> bool:
    return name in _MOCK

def run_query(name: str):
    if name not in _MOCK:
        raise KeyError(name)
    return _MOCK[name]()
