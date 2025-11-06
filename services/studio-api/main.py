from fastapi import FastAPI
from pydantic import BaseModel
from datetime import datetime
import uuid
from typing import List

app = FastAPI(title="Omnisonic Studio API")

class Session(BaseModel):
    id: str
    name: str
    participants: int
    created_at: datetime

class SessionCreate(BaseModel):
    name: str

_sessions: List[Session] = []

@app.get("/healthz")
def healthz():
    return {"ok": True}

@app.get("/v1/sessions")
def list_sessions():
    return {"sessions": _sessions}

@app.post("/v1/sessions")
def create_session(payload: SessionCreate):
    new_sess = Session(
        id=str(uuid.uuid4()),
        name=payload.name or "Untitled",
        participants=0,
        created_at=datetime.utcnow()
    )
    _sessions.append(new_sess)
    return {"session": new_sess}
