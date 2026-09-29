"""
FlowMind Backend — FastAPI + Firebase Cloud Functions

Run locally:  uvicorn app:app --reload --port 5001
Firebase deploy: firebase deploy --only functions
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.health import router as health_router
from routes.metrics import router as metrics_router
from routes.insights import router as insights_router
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI(
    title="FlowMind API",
    description="AI Execution Intelligence Platform — Backend",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# CORS — allow frontend origin
FRONTEND_URL = os.getenv("VITE_API_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        "http://localhost:5173",
        "https://flowmind-db.web.app",
        "https://flowmind-db.firebaseapp.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(health_router, tags=["health"])
app.include_router(metrics_router, prefix="/api", tags=["metrics"])
app.include_router(insights_router, prefix="/api", tags=["insights"])


@app.get("/", tags=["root"])
async def root():
    return {
        "service": "FlowMind API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/api/docs",
    }
