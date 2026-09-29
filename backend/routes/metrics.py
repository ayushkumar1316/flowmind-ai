"""
Metrics endpoint — receives eval/usage metrics from frontend.
Future: store in Firestore, expose dashboards.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
import time

router = APIRouter()


class MetricEvent(BaseModel):
    method: str
    provider: str
    latency_ms: int = Field(ge=0)
    used_fallback: bool
    outcome: str  # "success" | "fallback" | "error"
    timestamp: Optional[str] = None
    attempts: Optional[int] = None


class MetricsIngestResponse(BaseModel):
    received: int
    stored_at: str


# In-memory buffer for now (replace with Firestore later)
_metrics_buffer: list[Dict[str, Any]] = []
_MAX_BUFFER = 1000


@router.post("/metrics", response_model=MetricsIngestResponse)
async def ingest_metrics(event: MetricEvent):
    """
    Receive a single metric event from the frontend.
    """
    entry = event.model_dump()
    entry["received_at"] = time.time()
    _metrics_buffer.append(entry)
    if len(_metrics_buffer) > _MAX_BUFFER:
        _metrics_buffer.pop(0)
    return MetricsIngestResponse(received=1, stored_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))


@router.get("/metrics/summary")
async def metrics_summary():
    """
    Quick aggregated summary of buffered metrics.
    """
    if not _metrics_buffer:
        return {
            "total": 0,
            "by_provider": {},
            "fallback_rate": 0,
            "avg_latency_ms": 0,
            "p50_latency_ms": 0,
            "p95_latency_ms": 0,
        }

    from collections import Counter

    total = len(_metrics_buffer)
    by_provider = Counter(m.get("provider", "unknown") for m in _metrics_buffer)
    fallbacks = sum(1 for m in _metrics_buffer if m.get("used_fallback"))
    latencies = sorted(m.get("latency_ms", 0) for m in _metrics_buffer if m.get("latency_ms") is not None)

    p50 = latencies[len(latencies) // 2] if latencies else 0
    p95 = latencies[int(len(latencies) * 0.95)] if latencies else 0
    avg = sum(latencies) // len(latencies) if latencies else 0

    return {
        "total": total,
        "by_provider": dict(by_provider),
        "fallback_rate": round(fallbacks / total * 100, 1) if total else 0,
        "avg_latency_ms": avg,
        "p50_latency_ms": p50,
        "p95_latency_ms": p95,
    }