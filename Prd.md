# Product Requirements Document (PRD): Suzzy AI

**Version:** 1.1 (Updated Architecture)  
**Status:** Locked & Approved  
**Deployment Architecture:** Decoupled Full-Stack — Vercel (Frontend) + Railway (Python FastAPI Backend)  

---

## 1. Project Overview & Executive Summary

### Problem Statement
Users seeking an all-in-one AI assistant capable of multimodal interaction (voice, text, images, video, documents), live web research, persistent cross-session memory, and safe code execution are typically forced into expensive paid subscriptions ($20+/month) or fragmented free tools that lack memory, fail under rate limits, and require manual tool switching.

### Value Proposition
**Suzzy AI** delivers a ChatGPT-caliber, feature-rich AI web platform at **zero ongoing software or API cost**. Built on a decoupled **Vercel + Railway** architecture, it pairs a fast, responsive web UI with a Python multi-agent backend ("Boss + Specialist Workers") featuring automatic primary-to-fallback model routing so the system never fails when free-tier APIs hit rate limits.

### Target Users & Personas
* **Everyday Productivity User / Student:** Wants a clean, fast chat interface (accessible on phone or laptop) that accepts typed and spoken questions, reads uploaded files/videos, searches live facts, and remembers past conversations.
* **Beginner & Intermediate Developer:** Needs an AI coding partner that writes clean code, explains logic clearly, and executes Python scripts via a built-in runner to verify outputs.

### Approved Tech Stack
| Layer | Primary Technology (Zero-Cost) | Fallback / Backup Technology (Zero-Cost) |
| :--- | :--- | :--- |
| **Frontend Web UI** | Next.js (React + Tailwind CSS) hosted on **Vercel (Free)** | Static HTML/CSS/Vanilla JS hosted on Vercel |
| **Backend API Server** | Python **FastAPI** hosted on **Railway** | Flask / Render Free Tier |
| **Multi-Agent Orchestration** | **LangGraph** (Supervisor + Specialist Workers) | Direct Async Python Router |
| **Primary LLM Brain** | Google Gemini API (`gemini-2.5-flash` Free Tier) | Groq API (`llama-3.3-70b-versatile` Free Tier) |
| **Voice Input (STT)** | Groq Whisper API (`whisper-large-v3` Free Tier) | Browser Web Speech API (`SpeechRecognition`) |
| **Voice Output (TTS)** | `edge-tts` (Microsoft Edge Neural Voices via FastAPI) | Browser `SpeechSynthesis` API |
| **Live Web Search** | DuckDuckGo Search (`duckduckgo-search`) | Tavily API (Free Tier: 1,000 req/mo) |
| **Multimodal Processing** | Google Gemini Native Vision/Video/Audio + `pypdf` | OpenCV Keyframe Extraction + Text Parser |
| **Code Execution** | **Built-in Python Subprocess Runner** (15s timeout, restricted scope) | `RestrictedPython` |
| **Memory & Persistence** | **ChromaDB** (Vector Memory) + **SQLite** (Chat Logs) on Railway Volume | In-Memory / Local JSON Fallback |

---

## 2. Core User Journeys & User Stories

### Journey 1: Multimodal Conversational Q&A (Text & Voice)
1. User opens the Suzzy web app on Vercel (`https://suzzy-ai.vercel.app`).
2. User either types a message or taps the microphone button to speak.
3. Frontend sends the text or audio blob to the Railway FastAPI backend (`/api/chat` or `/api/voice`).
4. Backend transcribes audio (if voice), routes through the Supervisor Agent, generates a smart response, and returns text (plus an audio stream if voice-initiated).
5. Frontend renders the formatted Markdown response and plays the spoken audio seamlessly.

### Journey 2: Live Internet Research
1. User asks a current question (e.g., *"What are today's top tech headlines?"*).
2. Supervisor Agent detects the need for real-time data and triggers the Web Search Agent.
3. Frontend displays a status indicator (*"Searching the web..."*).
4. Web Search Agent pulls live snippets via DuckDuckGo and synthesizes a clear, up-to-date answer.

### Journey 3: File, Image, Video & Code Execution
1. User attaches a file (`.pdf`, `.txt`, `.py`, `.jpg`, `.png`, `.mp4`) in the Vercel UI and asks a question.
2. Railway backend parses the document or passes media to Gemini's multimodal engine.
3. If the user asks to test or run Python calculations/data scripts, the Coder Agent executes the code using the **Built-in Python Subprocess Runner** and returns both the code and verified output.

### User Stories & Acceptance Criteria

* **US-01 (Text & Grammar Intelligence):** *As a user, I want to type questions or paste text and receive grammatically accurate, smart responses so that I can learn, draft content, and solve problems.*
  * **Acceptance Criteria:**
    * Responses render clean Markdown (headings, lists, bold text, code blocks).
    * System accurately understands and corrects grammar nuances.
    * Primary LLM failures automatically trigger the Groq fallback within 3 seconds without crashing the frontend.

* **US-02 (Voice-to-Voice Interaction):** *As a user, I want to speak into my microphone and hear Suzzy talk back so that I can interact hands-free.*
  * **Acceptance Criteria:**
    * Browser microphone captures audio cleanly and sends it to `/api/voice`.
    * Transcribed speech appears as the user's chat bubble.
    * Suzzy returns both a written reply and an auto-playing audio response.

* **US-03 (Live Web Search):** *As a user, I want Suzzy to search the internet automatically when I ask about live events so that I get accurate, current answers.*
  * **Acceptance Criteria:**
    * Supervisor Agent automatically distinguishes real-time queries from general knowledge.
    * Search fallback triggers automatically if primary search fails.

* **US-04 (Multimodal File Upload):** *As a user, I want to upload PDFs, images, videos, and code files so that Suzzy can analyze and answer questions about them.*
  * **Acceptance Criteria:**
    * Accepts `.pdf`, `.txt`, `.md`, `.csv`, `.py`, `.js`, `.png`, `.jpg`, `.webp`, and `.mp4` up to 25MB.
    * Displays clear validation error for unsupported file formats.

* **US-05 (Persistent Cross-Session Memory):** *As a returning user, I want Suzzy to remember key facts from my past chats so that I don't have to repeat context.*
  * **Acceptance Criteria:**
    * Short-term history persists per thread in SQLite.
    * Long-term facts persist in ChromaDB and are retrieved automatically in future sessions.

* **US-06 (Code Writing & Built-in Execution):** *As a developer, I want Suzzy to write, explain, and run Python code safely so that I can verify calculations and scripts.*
  * **Acceptance Criteria:**
    * Code blocks include syntax highlighting and a one-click Copy button.
    * Built-in Python runner executes scripts in an isolated temporary directory with a strict 15-second timeout.

---

## 3. Features & Functional Requirements

### Module A: Decoupled Frontend-Backend API & Resilience
* **FR-A1 (`P0`):** Configure FastAPI on Railway with strict CORS rules allowing requests from the Vercel frontend domain.
* **FR-A2 (`P0`):** Implement a **Supervisor Agent** in LangGraph that routes incoming requests to `WebSearchAgent`, `MultimodalFileAgent`, `CoderAgent`, or `GeneralResponder`.
* **FR-A3 (`P0`):** Implement an automatic **LLM Fallback Chain** (`Gemini 2.5 Flash` $\rightarrow$ `Groq Llama 3.3 70B`) on HTTP 429, 5xx errors, or timeouts (>15s).
* **FR-A4 (`P1`):** Return agent execution metadata (e.g., `agent_used: "WebSearchAgent"`) in the JSON response so the frontend can display a subtle badge showing which worker handled the task.

### Module B: Dual Input & Output (Text & Voice)
* **FR-B1 (`P0`):** Build a responsive ChatGPT-style web UI on Vercel with a collapsible sidebar, message feed, and bottom prompt dock.
* **FR-B2 (`P0`):** Support browser audio recording (`MediaRecorder` API) posted to `/api/voice`, transcribed via Groq Whisper (`whisper-large-v3`), with automatic fallback to browser `SpeechRecognition`.
* **FR-B3 (`P0`):** Generate `.mp3` voice responses via `edge-tts` on `/api/voice` requests, returned as base64 or a temporary audio URL for instant playback.
* **FR-B4 (`P1`):** Add a "Speaker / Read Aloud" icon on every text message bubble so users can listen to typed replies on demand.

### Module C: Live Internet Search
* **FR-C1 (`P0`):** Integrate `duckduckgo-search` inside `WebSearchAgent` to retrieve top 3–5 live web snippets.
* **FR-C2 (`P1`):** Add Tavily API free tier as an automatic fallback if DuckDuckGo rate-limits on Railway's shared IP.

### Module D: Multimodal File & Media Handling
* **FR-D1 (`P0`):** Accept `multipart/form-data` uploads on `/api/chat` for documents (`.pdf`, `.txt`, `.md`, `.csv`, `.py`, `.js`) and extract clean text via `pypdf` / UTF-8 readers.
* **FR-D2 (`P0`):** Pass uploaded images (`.png`, `.jpg`, `.webp`) and short videos (`.mp4`) directly to Google Gemini's multimodal API.

### Module E: Memory & Conversation Tracking
* **FR-E1 (`P0`):** Persist conversation threads and messages in SQLite (`suzzy_chats.db`).
* **FR-E2 (`P0`):** Store and retrieve distilled user facts in ChromaDB (`./ai_memory`).
* **FR-E3 (`P1`):** Support a `/forget` command (or "Clear Memory" button in the sidebar) to wipe stored long-term memories.

### Module F: Built-in Python Code Runner
* **FR-F1 (`P0`):** Execute AI-generated Python scripts using Python's `subprocess.run()` inside a temporary working directory (`tempfile.TemporaryDirectory()`).
* **FR-F2 (`P0`):** Enforce a hard `timeout=15` seconds, capture `stdout` and `stderr`, and feed any traceback back to the `CoderAgent` (max 2 auto-fix retries) before returning the final answer.

---

## 4. Pages, Screens & Navigation Flow

| Screen / View | Route | Core Components | Navigation Flow |
| :--- | :--- | :--- | :--- |
| **Main Chat Interface** | `/` | • Left Sidebar: Thread history list, "+ New Chat" button, "Clear Memory" button<br>• Top Bar: Suzzy logo, active model status badge<br>• Center Feed: Scrollable message bubbles (Markdown, syntax-highlighted code, inline audio player, agent badge)<br>• Bottom Dock: Auto-expanding text box, File attach (`+`), Mic record button, Send button | Default entry point; loads empty welcome state or selected thread. |
| **Saved Thread View** | `/?thread=:id` | • Loaded message history fetched from Railway `/api/threads/:id`<br>• Active bottom input dock to continue chatting | Clicking a thread in the sidebar updates the URL query param and loads past messages. |
| **Quick Help Modal** | UI Modal (`?` icon) | • Supported file formats, voice usage tips, `/forget` command info | Opens over `/` and closes without disrupting active chat state. |

---

## 5. Roles, Authentication & Permissions

**Access Mode:** Single-User / Open Personal Web App (MVP v1.0) with optional simple access PIN (`APP_ACCESS_PIN` env var) if you want to prevent strangers from using your Railway quota.

| Role | View Threads | Send Text & Voice | Upload Media/Docs | Run Built-in Python | Clear Memory |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **User (Browser Session)** | Threads matching browser `session_id` | Yes | Yes (Max 25MB) | Yes (15s sandbox) | Yes (`/forget`) |
| **Owner (Vercel + Railway Admin)** | Full DB & Env control | Yes | Yes | Yes | Full control |

---

## 6. Data Requirements & Core Entities

1. **Thread (SQLite)**
   * `id` (UUID, Primary Key)
   * `session_id` (String — links threads to browser user)
   * `title` (String — auto-generated from first message)
   * `created_at` (ISO Timestamp)
2. **Message (SQLite)**
   * `id` (UUID, Primary Key)
   * `thread_id` (Foreign Key $\rightarrow$ `Thread.id`)
   * `role` (Enum: `user`, `assistant`)
   * `modality` (Enum: `text`, `voice`, `file`)
   * `content` (Text)
   * `agent_used` (String — e.g., `GeneralResponder`, `WebSearchAgent`, `CoderAgent`)
   * `audio_url` (Nullable String)
   * `created_at` (ISO Timestamp)
3. **MemoryFact (ChromaDB Collection)**
   * `id` (String Hash)
   * `session_id` (Metadata String)
   * `fact_text` (String — distilled summary of user preferences/facts)
   * `embedding` (Float Vector)

---

## 7. External Integrations & APIs

| Service | Host Side | Purpose | Fallback Strategy |
| :--- | :--- | :--- | :--- |
| **Google Gemini API** | Railway Backend | Primary brain + native image/video analysis | Automatic switch to Groq Llama 3.3 70B |
| **Groq API** | Railway Backend | Fast LLM backup + Whisper voice transcription | Automatic switch to Browser Web Speech API (STT) |
| **Edge-TTS** | Railway Backend | Free neural text-to-speech `.mp3` generation | Browser `window.speechSynthesis` |
| **DuckDuckGo Search** | Railway Backend | Free live web search | Tavily API Free Tier |

---

## 8. UI/UX States (Loading, Empty & Error States)

* **Empty State (`/`):** Centered Suzzy greeting + 4 clickable starter cards (*"Search live tech news"*, *"Write & run a Python script"*, *"Summarize an uploaded PDF"*, *"Check my grammar"*).
* **Loading States:**
  * Thinking/Streaming: Animated three-dot pulse + active worker label (*"Suzzy is thinking..."*, *"Searching the web..."*, *"Running Python code..."*).
  * Voice Recording: Red pulsing waveform/timer while recording; *"Transcribing..."* badge on release.
* **Error & Fallback States:**
  * Backend Cold Start (Railway wake-up): Friendly banner *"Waking up Suzzy's brain (takes ~3 seconds)..."* with automatic retry.
  * API Fallback: Seamless silent failover between Gemini and Groq; user never sees raw stack traces.
  * File Validation Error: Clean toast notification if file exceeds 25MB or uses an unsupported extension.

---

## 9. Non-Functional Requirements

* **Performance:** Text response first-token latency under **2.5s**; voice round-trip under **4.5s**.
* **Responsiveness:** Mobile-first Tailwind CSS layout supporting `375px` mobile screens up to `1440px+` desktop monitors.
* **Security:**
  * All API keys stored strictly in Railway Environment Variables (`GOOGLE_API_KEY`, `GROQ_API_KEY`).
  * Built-in Python runner executes inside `tempfile.TemporaryDirectory()`, strips sensitive env vars from the child process (`env={}`), and kills execution after 15 seconds.
  * Temporary uploaded files and generated `.mp3` files are deleted immediately after response delivery.

---

## 10. MVP Scope, Out-of-Scope & Success Criteria

### Strictly In-Scope (MVP v1.0)
* Next.js + Tailwind web interface deployed on **Vercel**.
* Python FastAPI + LangGraph multi-agent backend deployed on **Railway**.
* Text chat, microphone voice input/output, file/image/video uploads, live web search, persistent memory (SQLite + ChromaDB), and Built-in Python Subprocess Runner.
* Automatic zero-cost fallbacks across LLM, Voice, and Search layers.

### Strictly Out-of-Scope (Non-Goals)
* Paid Stripe subscriptions or credit billing systems.
* Heavy third-party OAuth logins (Google/GitHub).
* AI image/video *generation* (v1.0 focuses on *analyzing* uploaded media).

### Definition of Done
1. Vercel frontend communicates cleanly with Railway FastAPI backend over HTTPS with zero CORS errors.
2. Text, voice, file upload, web search, memory recall, and Python code execution all function end-to-end.
3. Disabling Gemini API key seamlessly triggers Groq fallback without breaking the user experience.

---

## 11. Locked-In Decisions
1. **Deployment Architecture:** Vercel (Next.js Frontend) + Railway (Python FastAPI Backend) — **Confirmed**.
2. **Code Execution Engine:** Built-in Python Subprocess Runner (15s timeout, stripped child env, isolated temp directory) — **Confirmed**.