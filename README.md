# 🌟 Suzzy AI: The Free, Personal Multi-Agent AI Assistant

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

**Suzzy AI** is a free, full-stack, ChatGPT-caliber personal AI web application built with a decoupled architecture (**Next.js 15 Frontend + Python FastAPI Backend**). It is engineered for **100% zero ongoing software or API cost**, featuring automatic failover between top-tier free AI models so you never get stuck behind rate limits.

---

## ⚡ What Can Suzzy Do?

1. **🎙️ Voice-to-Voice Interaction:**
   - Speak naturally using your computer or phone microphone.
   - Fast speech-to-text transcription powered by **Groq Whisper** (`whisper-large-v3`).
   - Suzzy replies with text and speaks answers back aloud using **Microsoft Neural Voices** (`edge-tts`).
2. **🌐 Live Internet Research:**
   - Automatically searches the web via **DuckDuckGo** (with **Tavily** backup) for up-to-the-minute news, weather, stock prices, and headlines.
3. **📁 Multimodal File & Media Understanding:**
   - Upload documents (`.pdf`, `.txt`, `.md`, `.csv`, `.json`), code scripts (`.py`, `.js`, `.ts`), photos (`.png`, `.jpg`, `.webp`), and short videos (`.mp4`) up to 25MB for instant analysis.
4. **🐍 Safe Built-in Python Sandbox:**
   - Suzzy can write, run, and self-correct Python scripts inside an isolated 15-second sandbox to verify calculations, generate data, and display exact code outputs.
5. **🧠 Cross-Session Memory & `/forget`:**
   - Remembers your name, preferences, and key facts across conversations using local vector storage (**ChromaDB**).
   - Type `/forget` in chat or click **"Clear Memory"** at any time to wipe stored facts.
6. **📬 Gmail Assistant (Read, Summarize, Draft, & Send):**
   - Connect your Gmail account via Google OAuth 2.0.
   - Ask Suzzy to check your inbox, summarize recent emails and urgent tasks, or draft professional replies.
   - Generates an interactive preview card so you can review and click **"Send Email Now"** for complete confirmation before any email is dispatched.
7. **🛡️ Zero-Cost Resilience & Fallbacks:**
   - Primary Brain: **Google Gemini 2.5 Flash** (Free Tier).
   - Automatic Fallback: **Groq LLaMA 3.3 70B** (Free Tier).
   - If one service hits a rate limit or has an outage, Suzzy switches automatically without crashing.

---

## 🔑 Step 1: Get Your Free API Keys (Takes 2 Minutes)

You only need **two free API keys** to run Suzzy AI:

### 1. Google Gemini API Key (Primary AI Brain)
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Sign in with any free Google account.
3. Click **"Get API key"** in the top left, then click **"Create API key"**.
4. Copy your key (starts with `AIzaSy...`).

### 2. Groq API Key (Fast LLaMA 3.3 Backup + Whisper Voice STT)
1. Go to [Groq Console](https://console.groq.com/).
2. Sign up or log in with your email or GitHub.
3. In the left navigation, click **"API Keys"** -> **"Create API Key"**.
4. Give it a name (e.g. `SuzzyAI`) and copy the key (starts with `gsk_...`).

*(Optional)* **Tavily API Key (Backup Search):** If you want an extra backup for DuckDuckGo web search, grab a free 1,000 queries/month key from [Tavily](https://tavily.com/).

---

## 💻 Step 2: Step-by-Step Local Setup Guide

Run Suzzy AI on your computer in two terminal windows.

### Terminal 1: Backend (Python FastAPI)

#### On Windows (PowerShell):
```powershell
# 1. Navigate to the backend directory
cd backend

# 2. Create a virtual environment
python -m venv venv

# 3. Activate the virtual environment
.\venv\Scripts\Activate.ps1

# 4. Install the backend dependencies
pip install -r requirements.txt

# 5. Create your .env file
Copy-Item .env.example .env
```

#### On Mac / Linux:
```bash
# 1. Navigate to the backend directory
cd backend

# 2. Create a virtual environment
python3 -m venv venv

# 3. Activate the virtual environment
source venv/bin/activate

# 4. Install the backend dependencies
pip install -r requirements.txt

# 5. Create your .env file
cp .env.example .env
```

#### Configure your Backend `.env` file:
Open `backend/.env` in any text editor and fill in your keys:
```env
GOOGLE_API_KEY=AIzaSyYourGoogleGeminiKeyHere
GROQ_API_KEY=gsk_YourGroqKeyHere

# Optional:
TAVILY_API_KEY=
APP_ACCESS_PIN=

FRONTEND_URL=http://localhost:3000
DATA_DIR=./data
```

#### Start the Backend Server:
```bash
uvicorn app.main:app --reload --port 8000
```
*Your backend is now running at `http://localhost:8000` (API documentation available at `http://localhost:8000/docs`).*

---

### Terminal 2: Frontend (Next.js 15)

Open a **new terminal window** in the project root:

```bash
# 1. Navigate to the frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Create your local environment file
cp .env.example .env.local
```
*(On Windows PowerShell, use: `Copy-Item .env.example .env.local`)*

#### Start the Frontend Development Server:
```bash
npm run dev
```

#### Open the App:
Open your web browser and visit: **[http://localhost:3000](http://localhost:3000)**

---

## ☁️ Step 3: Free Cloud Deployment Guide

Deploy your personal Suzzy AI to the cloud so you can use it on your phone and laptop from anywhere in the world!

### Part A: Deploy the Backend to Railway (Free)

1. Fork or push this repository to your personal **GitHub** account.
2. Sign in to [Railway](https://railway.com/) using your GitHub account.
3. Click **"New Project"** -> **"Deploy from GitHub repo"** and select your `SuzzyAI` repository.
4. In the Railway Service settings:
   - **Root Directory:** Change to `/backend`
   - **Watch Paths:** `backend/**`
5. **Add Persistent Storage (Volume):**
   - In Railway, click your service -> **Volumes** tab.
   - Click **"Add Volume"**.
   - Set the mount path to: `/data`
   *(This ensures your SQLite chat history and ChromaDB memories persist across restarts!)*
6. **Add Environment Variables:**
   Click the **Variables** tab and add:
   - `GOOGLE_API_KEY`: *(Your Google Gemini key)*
   - `GROQ_API_KEY`: *(Your Groq key)*
   - `DATA_DIR`: `/data`
   - `FRONTEND_URL`: `*` *(or your Vercel URL once deployed)*
   - `APP_ACCESS_PIN`: *(Optional: set a 4-digit PIN like `1234` if you want to protect your app from unauthorized users)*
7. **Generate Public Domain:**
   - Go to **Settings** -> **Networking** -> Click **"Generate Domain"**.
   - Copy your public Railway URL (e.g. `https://suzzy-ai-production.up.railway.app`).

---

### Part B: Deploy the Frontend to Vercel (Free)

1. Sign in to [Vercel](https://vercel.com/) with your GitHub account.
2. Click **"Add New..."** -> **"Project"** and import your `SuzzyAI` repository.
3. In the configuration screen:
   - **Framework Preset:** Next.js
   - **Root Directory:** Click "Edit" and select `frontend`.
4. **Add Environment Variable:**
   - Name: `NEXT_PUBLIC_API_URL`
   - Value: *(Your Railway public URL from Part A, e.g. `https://suzzy-ai-production.up.railway.app` without a trailing slash)*
5. Click **"Deploy"**!
6. In ~60 seconds, your site is live at `https://your-app.vercel.app`! 🎉

*(Tip: In your Railway dashboard, update `FRONTEND_URL` to match your Vercel URL for strict CORS security).*

---

## 🗂️ Project Architecture & Structure

```
SuzzyAI/
├── backend/                  # Python FastAPI Service
│   ├── app/
│   │   ├── config.py         # Pydantic environment configuration
│   │   ├── main.py           # FastAPI app & CORS setup
│   │   ├── api/
│   │   │   └── routes.py     # Endpoints (/chat, /voice, /tts, /threads, /memory)
│   │   ├── agents/
│   │   │   ├── state.py      # LangGraph state schema
│   │   │   ├── supervisor.py # Multi-agent router & graph workflow
│   │   │   └── workers.py    # Search, Multimodal, Coder, & General specialists
│   │   ├── core/
│   │   │   ├── llm_router.py # Gemini 2.5 Flash -> Groq LLaMA 3.3 fallback
│   │   │   ├── voice.py      # Whisper STT & Edge-TTS synthesis
│   │   │   ├── search.py     # DuckDuckGo + Tavily search client
│   │   │   ├── media_parser.py # PDF, text, image, and video parsers
│   │   │   └── sandbox.py    # Isolated 15s Python execution environment
│   │   └── db/
│   │       ├── sqlite_client.py # SQLite (WAL mode) chat threads & logs
│   │       └── chroma_client.py # Embedded ChromaDB cross-session memory
│   ├── requirements.txt      # Python dependencies
│   ├── Dockerfile            # Production Railway container definition
│   └── .env.example          # Sample environment variables
│
├── frontend/                 # Next.js 15 App Router SPA
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx    # Responsive viewport & metadata
│   │   │   ├── page.tsx      # Main ChatGPT-style responsive layout
│   │   │   └── globals.css   # Tailwind styles & syntax highlighting
│   │   ├── components/
│   │   │   ├── Sidebar.tsx   # Mobile drawer, thread history, & memory clear
│   │   │   ├── ChatFeed.tsx  # Messages, starter cards, & thinking status
│   │   │   ├── MessageBubble.tsx # Markdown, code copy, & audio playback
│   │   │   ├── InputDock.tsx # Auto-growing dock, file attach, & voice mic
│   │   │   └── HelpModal.tsx # Beginner guide & access PIN modal
│   │   └── lib/
│   │       ├── api.ts        # Typed API service with Railway retry logic
│   │       └── session.ts    # Browser UUID session manager
│   ├── tailwind.config.ts    # Custom emerald & slate design tokens
│   ├── tsconfig.json         # Strict TypeScript configuration
│   └── package.json          # Frontend dependencies
│
├── PRD.md                    # Product Requirements Document
├── ARCHITECTURE.md           # System Architecture Document
└── README.md                 # Beginner setup & deployment guide
```

---

## ❓ Frequently Asked Questions (FAQ)

### What does "Waking up Suzzy's brain..." mean?
Free cloud platforms like Railway put idle backend services to sleep to save energy. When you send your first message after a few hours of inactivity, it takes ~3 seconds for the server to wake up. Suzzy automatically detects this and retries seamlessly!

### How do I reset Suzzy's memory?
Simply send `/forget` in the chat, or click the **"Clear Memory"** button in the sidebar. This wipes all cross-session facts stored in ChromaDB.

### Can I run this completely privately?
Yes! You can set an `APP_ACCESS_PIN` in your backend environment variables (e.g. `APP_ACCESS_PIN=1234`). When prompted in the web UI, enter your PIN in the **Help & PIN** modal to authorize requests.

---

## 📄 License
This project is open-source under the MIT License. Feel free to use, modify, and build upon it!
