from fastapi import FastAPI

app = FastAPI(title="Otto Gateway")

@app.get("/health")
def health():
    return {"status": "ok"}
