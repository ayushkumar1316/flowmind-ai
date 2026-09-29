"""
Insights endpoint — AI-powered weekly analysis.
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional
import os
import time

router = APIRouter()

class WeeklyInsightRequest(BaseModel):
    userId: str
    weekStartDate: str
    confidenceHistory: list = []
    completionStats: dict = {}
    productivityByDay: list = []

class WeeklyInsightResponse(BaseModel):
    summary: str
    riskLevel: str
    recommendation: str
    prediction: str
    motivation: str
    confidenceScore: int
    peakProductivityDay: str
    trend: str


def _heuristic_fallback(data: WeeklyInsightRequest) -> WeeklyInsightResponse:
    """Local heuristic — works without any LLM call."""
    completionStats = data.completionStats or {}
    total = completionStats.get("totalCompleted", 0)
    avg = completionStats.get("dailyAverage", 0)
    streak = completionStats.get("streakDays", 0)
    confHistory = data.confidenceHistory or []

    avgConf = (
        round(sum(e.get("score", 0) for e in confHistory) / len(confHistory))
        if confHistory else 0
    )
    prodDays = data.productivityByDay or []
    peakDay = (
        max(prodDays, key=lambda d: d.get("value", 0)).get("day", "Unknown")
        if prodDays else "Unknown"
    )
    weeklyChange = (
        prodDays[-1].get("value", 0) - prodDays[0].get("value", 0)
        if len(prodDays) > 1 else 0
    )

    if avgConf >= 75 and total >= 5:
        risk = "low"
        trend = "up" if weeklyChange >= 0 else "stable"
        summary = (
            f"Outstanding week — {total} tasks completed, {avg} daily average, "
            f"{streak}-day streak. Execution is strong and sustainable."
        )
        rec = "Protect your current pace and reduce context-switching."
        pred = "Next week looks strong if you maintain daily planning."
        mot = "Mastery is built one disciplined day at a time."
    elif avgConf >= 45:
        risk = "medium"
        trend = "up" if weeklyChange >= 0 else "down"
        summary = (
            f"Moderate progress — {total} tasks completed, {avg} daily average. "
            f"Execution pace is sustainable but room for improvement exists."
        )
        rec = "Focus on high-priority tasks first and batch similar activities."
        pred = "With 20% more focus, next week can be significantly better."
        mot = "Progress over perfection. Keep stacking wins."
    else:
        risk = "high"
        trend = "down"
        summary = (
            f"Execution risk detected — only {total} tasks completed with "
            f"{avg} daily average. Immediate course correction recommended."
        )
        rec = "Eliminate low-value tasks and focus exclusively on critical items."
        pred = "Recovery is possible this week with focused high-priority execution."
        mot = "Recovery is a skill. Every task you finish builds it."

    return WeeklyInsightResponse(
        summary=summary,
        riskLevel=risk,
        recommendation=rec,
        prediction=pred,
        motivation=mot,
        confidenceScore=avgConf,
        peakProductivityDay=peakDay,
        trend=trend,
    )


@router.post("/insights/weekly", response_model=WeeklyInsightResponse)
async def weekly_insight(data: WeeklyInsightRequest):
    """
    Generate a weekly AI execution insight.
    Tries LLM first (Gemini via local key), falls back to heuristic.
    """
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY")
    if not api_key:
        return _heuristic_fallback(data)

    # Try Gemini direct call
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.0-flash")

        confSnap = [
            {"date": e.get("date", ""), "score": e.get("score", 0)}
            for e in (data.confidenceHistory or [])[-14:]
        ]
        prompt = (
            f"You are FlowMind's AI Execution Coach. Analyze this weekly data:\n"
            f"- Tasks completed: {data.completionStats.get('totalCompleted', 0)}\n"
            f"- Daily average: {data.completionStats.get('dailyAverage', 0)}\n"
            f"- Streak: {data.completionStats.get('streakDays', 0)} days\n"
            f"- Confidence trend (recent scores): {confSnap}\n"
            f"- Productivity by day: {data.productivityByDay}\n\n"
            "Return ONLY valid JSON with exactly these keys:\n"
            '{"summary": "3-sentence execution analysis", '
            '"riskLevel": "low|medium|high", '
            '"recommendation": "one actionable item", '
            '"prediction": "next week forecast", '
            '"motivation": "short motivational phrase", '
            '"confidenceScore": number 0-100, '
            '"peakProductivityDay": "day name", '
            '"trend": "up|down|stable|volatile"}'
        )

        response = model.generate_content(prompt)
        text = response.text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        import json
        result = json.loads(text)
        return WeeklyInsightResponse(**result)
    except Exception:
        return _heuristic_fallback(data)
