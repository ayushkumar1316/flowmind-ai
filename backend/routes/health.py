from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    """
    Health check endpoint for uptime monitoring and CI/CD.
    Returns service status and basic info.
    """
    return {
        "status": "healthy",
        "service": "flowmind-api",
        "version": "1.0.0",
    }
