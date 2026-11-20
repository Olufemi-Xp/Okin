# System Architecture Document: Suzzy AI

**Version:** 1.0  
**Status:** Locked & Ready for Implementation  
**Architecture Style:** Decoupled Client-Server with Multi-Agent Orchestration  

---

## 1. Architecture Overview & Core Philosophy

### Architectural Pattern
Suzzy AI uses a **Decoupled Full-Stack Client-Server Architecture** separated into two independent deployable units:
1. **Presentation Layer (Frontend on Vercel):** A lightweight, static-first Next.js (App Router) Single-Page Application (SPA) responsible purely for UI rendering, browser audio capture (`MediaRecorder`), local session identification, and Markdown/code presentation.
2. **Orchestration & Intelligence Layer (Backend on Railway):** A stateless-first Python **FastAPI** REST service powered by a **LangGraph Supervisor-Worker Multi-Agent Graph**, backed by a persistent Railway Volume for local SQLite and ChromaDB storage.

### Core Engineering Principles
* **Zero-Cost Resilience (Failover by Default):** Every external dependency (LLM, STT, TTS, Search) is wrapped in a deterministic `try -> except -> fallback` adapter. Free-tier rate limits (`HTTP 429`) or transient network failures trigger automatic failover without surfacing errors to the user.
* **Strict Separation of Concerns:** Frontend contains zero API keys, zero AI SDKs, and zero business logic. All orchestration, prompt construction, file parsing, and sandboxing happen exclusively on the Python backend.
* **Pragmatic Simplicity (No Over-Engineering):** Avoids heavy distributed message brokers (Redis/Celery) or external paid vector databases in favor of async FastAPI background tasks, SQLite (WAL mode), and embedded ChromaDB.
* **Defense-in-Depth Sandboxing:** User-triggered Python execution runs in an ephemeral temporary directory with stripped environment variables and a strict 15-second OS-level timeout.

---

## 2. Approved Tech Stack & Dependency Manifest

### Infrastructure & Hosting
* **Frontend Hosting & CI/CD:** Vercel (Auto-deploy from GitHub `/frontend` directory, Edge CDN).
* **Backend Hosting & CI/CD:** Railway (Auto-deploy from GitHub `/backend` directory via `Dockerfile` or `nixpacks.toml`, mounted persistent volume at `/data`).

### Frontend Stack (`/frontend`)
* **Framework:** Next.js 15 (App Router, TypeScript)
* **Styling:** Tailwind CSS + `lucide-react` (Icons)
* **Markdown & Code Rendering:** `react-markdown`, `remark-gfm`, `rehype-highlight`
* **HTTP Client:** Native `fetch` API (wrapped in a typed `src/lib/api.ts` service)

### Backend Stack (`/backend`)
* **Runtime:** Python 3.11+
* **Web Framework:** `fastapi`, `uvicorn[standard]`, `python-multipart`
* **Multi-Agent & AI Orchestration:** `langgraph`, `langchain-core`, `langchain-google-genai`, `langchain-groq`
* **Voice & Media:** `groq` (Whisper STT), `edge-tts` (Neural TTS), `pypdf` (PDF parsing)
* **Web Search:** `duckduckgo-search` (Primary), `tavily-python` (Optional Fallback)
* **Persistence:** `sqlite3` (Built-in Python stdlib), `chromadb` (Embedded Vector Store)

### Banned Dependencies (Strict Guardrails)
* **DO NOT USE** `chainlit` or `streamlit` (violates decoupled Vercel + Railway architecture).
* **DO NOT USE** heavy ORMs like `SQLAlchemy` or `Prisma` (unnecessary overhead for 2 SQLite tables).
* **DO NOT USE** `docker-in-docker` or `subprocess` with `shell=True` (security and Railway compatibility hazard).
* **DO NOT USE** paid cloud services (`Pinecone`, `AWS S3`, `OpenAI API`, `Auth0`).

---

## 3. Frontend & Backend System Architecture

### Frontend Architecture (`/frontend`)
* **Rendering Strategy:** Client-Side Rendering (`'use client'`) for interactive chat feeds, microphone controls, and thread switching, wrapped in a statically exported Next.js shell for instant global load times on Vercel.
* **Routing:** Single route (`/`) using URL search parameters (`/?thread=<uuid>`) for deep-linking and browser history navigation without full page reloads.
* **State Management:** React Context / Local Component State (`useState`, `useReducer`) synchronized with backend SQLite endpoints:
  * `sessionId`: Persisted in `localStorage` (`suzzy_session_id`).
  * `threads`: Fetched on mount via `GET /api/threads`.
  * `activeMessages`: Fetched when switching threads via `GET /api/threads/{thread_id}`.
* **Service Layer (`src/lib/api.ts`):** Centralized API client handling `FormData` serialization (for files/audio), `X-Session-ID` and optional `X-Access-PIN` headers, and Railway cold-start retry logic.

### Backend Architecture (`/backend`)
* **API Layer (`app/main.py` & `app/api/routes.py`):** Exposes clean REST endpoints (`/api/health`, `/api/chat`, `/api/voice`, `/api/tts`, `/api/threads`, `/api/memory`). Enforces CORS restricted to `FRONTEND_URL`.
* **Multi-Agent Service Layer (`app/agents/`):**
  * `supervisor.py`: LangGraph state machine inspecting prompt intent, querying long-term memory, and routing to specialist nodes.
  * `workers.py`:
    * `WebSearchWorker`: Executes DuckDuckGo search (with Tavily fallback).
    * `MultimodalWorker`: Extracts text from documents or attaches image/video payloads for Gemini native vision.
    * `CoderWorker`: Generates Python code and invokes `sandbox.py` (with up to 2 self-correction loops on `stderr`).
    * `GeneralResponder`: Handles conversational Q&A, grammar analysis, and final synthesis.
* **Resilience Wrapper (`app/core/llm_router.py`):** Single gateway function `invoke_with_fallback(messages, media=None)` attempting `gemini-2.5-flash` first, catching exceptions, and failing over to `llama-3.3-70b-versatile` on Groq.

---

## 4. End-to-End Data Flow & State Lifecycle

### Read Flow (Loading History & Recalling Memory)