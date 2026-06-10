from app.brain import FakeBrain
from app.schemas import UiSpec

def test_fake_brain_returns_uispec():
    brain = FakeBrain(canned=UiSpec(
        narration="ok",
        widgets=[],
    ))
    spec = brain.compose("hola")
    assert isinstance(spec, UiSpec)
    assert spec.narration == "ok"
