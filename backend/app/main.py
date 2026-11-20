import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api.routes import router as api_router
from app.config import get_settings
from app.db.chroma_client import get_memory_manager
from app.db.sqlite_client import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("suzzy-ai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure SQLite DB and ChromaDB are initialized
    settings = get_settings()
    logger.info("Initializing Suzzy AI Backend (Data Directory: %s)...", settings.DATA_DIR)
    init_db(settings.DATA_DIR)
    get_memory_manager()
    logger.info("Database and Memory managers initialized successfully.")
    yield
    logger.info("Shutting down Suzzy AI Backend.")


app = FastAPI(
    title="Okin AI Backend",
    description="Multi-agent conversational AI service with zero-cost resilience and multimodal capabilities.",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS to permit localhost, Vercel deployments, and production origins
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=r"^https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount generated images static directory
generated_dir = os.path.join(settings.DATA_DIR, "generated_images")
os.makedirs(generated_dir, exist_ok=True)
app.mount("/static/generated", StaticFiles(directory=generated_dir), name="generated_images")

# Include API Router
app.include_router(api_router)


@app.get("/")
def root():
    return {
        "message": "Welcome to Okin AI Backend API",
        "docs": "/docs",
        "health": "/api/health",
    }
