# Project Brief: Suzzy AI

## 1. Overview

**Suzzy** is a free, Python-based, multi-agent AI web application designed to replicate the core capabilities of ChatGPT. It provides a clean web interface where users can interact using text, voice, and file uploads, powered by a reliable multi-agent system with zero infrastructure or API costs.

---

## 2. Core Features

* **Dual Input & Output (Text & Voice):** Users can type messages or speak directly into their microphone. Suzzy understands spoken audio, responds in clear text, and speaks answers back aloud.
* **Live Internet Search:** Automatically searches the web for real-time information, news, and facts when needed.
* **Multimodal File Understanding:** Accepts and analyzes images, videos, PDFs, code files, and plain text documents.
* **Persistent Memory:** Remembers context within an active conversation and stores key facts locally so it recalls user preferences and past topics across future sessions.
* **Code Writing & Execution:** Writes, debugs, explains, and safely executes Python code.
* **Advanced Grammar & Language Intelligence:** Understands nuanced grammar, adapts tone, and delivers clear, structured responses.

---

## 3. Multi-Agent Architecture

Instead of relying on a single prompt, Suzzy uses a **Boss (Supervisor) + Specialist Workers** workflow:

1. **Supervisor Agent (The Boss):** Analyzes user requests, checks long-term memory, and delegates tasks to the right specialist.
2. **Web Search Agent:** Queries the internet for up-to-date answers.
3. **Multimodal & File Agent:** Reads and extracts insights from uploaded documents, images, and videos.
4. **Coder Agent:** Generates, interprets, and runs code in an isolated environment.

---

## 4. Zero-Cost Tech Stack & Fallbacks

To ensure 100% uptime without incurring costs, every component uses a free primary tool paired with a free fallback:

| Component | Primary Tool (Free) | Backup / Fallback (Free) |
| --- | --- | --- |
| **Web Interface** | Chainlit (Python Chat UI) | Streamlit |
| **AI Brain (Reasoning & Grammar)** | Google Gemini API (Free Tier) | Groq API (Llama 3.3 70B) / Local Ollama |
| **Multi-Agent Orchestration** | LangGraph | CrewAI |
| **Voice-to-Text (Listening)** | Groq Whisper API | Faster-Whisper (Local) / Web Speech API |
| **Text-to-Voice (Speaking)** | Edge-TTS (Microsoft Neural Voices) | Browser SpeechSynthesis |
| **Internet Search** | DuckDuckGo Search (`duckduckgo-search`) | Tavily API (Free Tier) |
| **Vision & Video Analysis** | Google Gemini API (Native Multimodal) | OpenCV + Local Vision Model |
| **Long-Term Memory** | ChromaDB (Local Vector Storage) + SQLite | FAISS |
| **Free Cloud Hosting** | Hugging Face Spaces (Free Tier) | Render / Koyeb (Free Tier) |

---

## 5. Development Roadmap

* **Phase 1 – Core Chat & Fallback Brain:** Set up the Chainlit web UI and connect Gemini with Groq as an automatic backup.
* **Phase 2 – Voice Integration:** Connect Groq Whisper for voice input and Edge-TTS for spoken responses.
* **Phase 3 – Multi-Agent Routing & Search:** Implement the Supervisor agent and connect live DuckDuckGo web search.
* **Phase 4 – Memory & File Handling:** Add ChromaDB for long-term memory and enable PDF, text, image, and video uploads.
* **Phase 5 – Code Sandbox & Deployment:** Add safe Python code execution and deploy the app for free on Hugging Face Spaces.