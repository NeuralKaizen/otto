from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.schemas import ConverseRequest
from app.brain import Brain
from app.queries import run_query, query_exists

app = FastAPI(title="Otto Gateway")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_brain: Brain | None = None

def set_brain(brain: Brain) -> None:
    global _brain
    _brain = brain

def get_brain() -> Brain:
    global _brain
    if _brain is None:
        from app.brain import ClaudeBrain
        _brain = ClaudeBrain()
    return _brain

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/converse")
def converse(req: ConverseRequest):
    spec = get_brain().compose(req.text)
    rendered = []
    for w in spec.widgets:
        data = run_query(w.query) if query_exists(w.query) else None
        rendered.append({"type": w.type, "title": w.title, "data": data})
    return {"narration": spec.narration, "widgets": rendered}
