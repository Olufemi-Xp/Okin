import logging
import re
from typing import Any, Dict, List, Optional
from langgraph.graph import END, START, StateGraph
from app.agents.state import AgentState
from app.agents.workers import (
    calendar_worker,
    coder_worker,
    discovery_worker,
    email_worker,
    general_responder,
    image_generator_worker,
    multimodal_worker,
    web_search_worker,
)
from app.core.llm_router import invoke_with_fallback
from app.db.chroma_client import get_memory_manager

logger = logging.getLogger(__name__)


def classify_intent(query: str, has_file: bool) -> str:
    """
    Fast rule-assisted intent classifier with LLM fallback.
    Returns: 'multimodal' | 'coder' | 'web_search' | 'general'
    """
    if has_file:
        return "multimodal"

    lower_query = query.lower()

    # Image generation intent (Slash commands or explicit image generation keywords)
    if any(lower_query.startswith(cmd) for cmd in ["/imagine", "/draw", "/image", "/generate"]):
        return "image_generation"

    image_triggers = [
        "generate an image", "generate the image", "generate image",
        "create an image", "create the image", "create image",
        "draw me a", "draw me an", "draw an image", "draw the ", "draw a picture",
        "generate a picture", "make an image of", "image of a ", "image of an ",
        "picture of a ", "picture of an ", "make an illustration of", "paint a picture",
        "render a 3d", "generate visual", "visualize this image", "generate artwork",
        "draw a ", "draw an ", "create a visual of", "create a visual", "make a visual",
        "illustrate a", "illustrate an", "create an illustration", "generate an illustration",
        "design a ", "design an ", "show a visual reference", "visual reference of",
        "visual reference for", "show me a visual", "show me an image",
        "show me a picture", "concept art of", "create a photo of", "generate a photo of",
    ]
    if any(trigger in lower_query for trigger in image_triggers):
        return "image_generation"

    # Code / execution intent
    code_triggers = [
        "run code", "execute code", "run python", "write python", "calculate",
        "write a script", "code script", "debug this code", "run this",
        "python code", "solve with python", "generate code and run",
    ]
    if any(trigger in lower_query for trigger in code_triggers):
        return "coder"

    # Email / Gmail intent (Check before general web search)
    email_triggers = [
        "email", "emails", "inbox", "gmail", "mail", "draft an email",
        "draft email", "send an email", "send email", "check my mail",
        "check my emails", "check inbox", "summarize my inbox", "recent emails",
        "reply to email", "unread emails", "unread messages", "inbox summary",
    ]
    if any(trigger in lower_query for trigger in email_triggers):
        return "email"

    # Calendar / Reminders / To-Do intent (Check before general web search)
    calendar_triggers = [
        "calendar", "schedule", "event", "meeting", "appointment",
        "reminder", "remind me", "to-do", "todo", "to do",
        "task list", "my tasks", "agenda", "plan my day", "mark task",
    ]
    if any(trigger in lower_query for trigger in calendar_triggers):
        return "calendar"

    # Navigation & Discovery intent: Maps, Places, Landmarks, Locations, Travel, YouTube
    discovery_triggers = [
        # Maps, Locations & Landmarks
        "map", "maps", "location", "locations", "locate", "where is", "where are",
        "where can i find", "address", "addresses", "directions to", "direction to",
        "route to", "navigate to", "how do i get to", "how to get to", "distance to",
        "places in", "places to visit", "landmarks in", "attractions in", "things to do in",
        "spots in", "spots near", "places near", "nearby", "near me", "closest",
        "show on map", "show map", "map of", "google maps", "open maps",
        "eiffel tower", "times square", "central park", "statue of liberty",
        "colosseum", "big ben", "taj mahal", "pyramid", "mount fuji",
        "grand canyon", "golden gate", "tokyo tower", "louvre", "sagrada familia",
        "restaurant", "restaurants", "cafe", "cafes", "coffee shop", "places to eat", "food near",
        "spots near", "places near", "spots nearby", "places nearby",
        # Travel Planning (Flights & Hotels)
        "flight", "flights", "airline", "fare", "fares", "book flight", "flight to",
        "hotel", "hotels", "book hotel", "hotels in", "places to stay", "vacation to",
        "travel planning", "trip to", "itinerary", "skyscanner", "google flights",
        # Media & Entertainment (YouTube)
        "youtube", "watch video", "play video", "search youtube", "music video",
        "youtube channel", "youtube playlist", "play song", "listen to",
    ]
    if any(trigger in lower_query for trigger in discovery_triggers):
        return "discovery"

    # Real-time search intent
    search_triggers = [
        "latest", "news", "today", "yesterday", "current", "weather",
        "who won", "score", "stock price", "price of", "release date",
        "recent", "what happened", "now", "2024", "2025", "2026", "search for",
    ]
    if any(trigger in lower_query for trigger in search_triggers):
        return "web_search"

    return "general"


def supervisor_node(state: AgentState) -> Dict[str, Any]:
    """
    Supervisor Node:
    1. Retrieves cross-session user memories from ChromaDB.
    2. Determines which specialist worker will handle the task.
    """
    session_id = state.get("session_id", "")
    query = state.get("user_query", "")
    has_file = state.get("file_info") is not None

    # Step 1: Memory retrieval (kept fast during voice mode)
    memory_context = ""
    is_voice = bool(state.get("voice_mode"))
    try:
        memory_limit = 2 if is_voice else 4
        recalled_facts = get_memory_manager().get_relevant_facts(session_id, query, limit=memory_limit)
        if recalled_facts:
            memory_context = "\n".join(f"- {fact}" for fact in recalled_facts)
    except Exception as mem_err:
        logger.debug("Memory retrieval skipped: %s", mem_err)

    # Step 2: Route determination
    route = classify_intent(query, has_file)
    logger.info("Supervisor routed request to '%s' (has_file=%s)", route, has_file)

    return {
        "memory_context": memory_context,
        "next_node": route,
    }


def route_decision(state: AgentState) -> str:
    """
    LangGraph conditional edge router.
    """
    next_node = state.get("next_node", "general")
    if next_node in ("multimodal", "coder", "web_search", "email", "calendar", "discovery", "image_generation", "general"):
        return next_node
    return "general"


def extract_and_store_facts(session_id: str, user_query: str, assistant_reply: str) -> None:
    """
    Background distillation of user preferences/facts to ChromaDB.
    """
    # Simple heuristic to identify statements of fact about the user
    lower = user_query.lower()
    self_markers = ["my name is", "i am", "i live in", "i work as", "i prefer", "i like", "my favorite", "i have"]
    if any(marker in lower for marker in self_markers) and len(user_query) < 300:
        try:
            get_memory_manager().add_fact(session_id, user_query.strip())
            logger.info("Persisted user fact to ChromaDB for session: %s", session_id)
        except Exception as e:
            logger.error("Failed to store fact to ChromaDB: %s", e)


def build_agent_graph():
    """
    Constructs and compiles the multi-agent LangGraph workflow.
    """
    workflow = StateGraph(AgentState)

    # Register Nodes
    workflow.add_node("supervisor", supervisor_node)
    workflow.add_node("web_search", web_search_worker)
    workflow.add_node("multimodal", multimodal_worker)
    workflow.add_node("coder", coder_worker)
    workflow.add_node("email", email_worker)
    workflow.add_node("calendar", calendar_worker)
    workflow.add_node("discovery", discovery_worker)
    workflow.add_node("image_generation", image_generator_worker)
    workflow.add_node("general", general_responder)

    # Set Entry Point
    workflow.add_edge(START, "supervisor")

    # Conditional Branching from Supervisor
    workflow.add_conditional_edges(
        "supervisor",
        route_decision,
        {
            "web_search": "web_search",
            "multimodal": "multimodal",
            "coder": "coder",
            "email": "email",
            "calendar": "calendar",
            "discovery": "discovery",
            "image_generation": "image_generation",
            "general": "general",
        },
    )

    # Exit from all worker nodes
    workflow.add_edge("web_search", END)
    workflow.add_edge("multimodal", END)
    workflow.add_edge("coder", END)
    workflow.add_edge("email", END)
    workflow.add_edge("calendar", END)
    workflow.add_edge("discovery", END)
    workflow.add_edge("image_generation", END)
    workflow.add_edge("general", END)

    return workflow.compile()


# Compile global graph instance
agent_graph = build_agent_graph()


async def run_agent_pipeline(
    session_id: str,
    thread_id: str,
    user_query: str,
    history: List[Dict[str, str]],
    file_info: Optional[Dict[str, Any]] = None,
    user_location: Optional[Dict[str, Any]] = None,
    voice_mode: bool = False,
    background_tasks: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Executes the multi-agent graph with the supplied inputs.
    In voice_mode, skips slow reflection loops and delegates memory
    persistence to background execution.
    """
    initial_state: AgentState = {
        "session_id": session_id,
        "thread_id": thread_id,
        "user_query": user_query,
        "history": history,
        "file_info": file_info,
        "user_location": user_location,
        "memory_context": "",
        "search_context": None,
        "code_execution": None,
        "coder_retries": 0,
        "worker_output": None,
        "final_response": "",
        "agent_used": "GeneralResponder",
        "model_used": "openai/gpt-oss-120b",
        "next_node": "general",
        "voice_mode": voice_mode,
    }

    result = agent_graph.invoke(initial_state)
    assistant_reply = result.get("final_response", "")

    # Move ChromaDB memory distillation and writes to background tasks
    # so the synchronous voice response is never blocked by disk/embedding writes
    if background_tasks is not None:
        background_tasks.add_task(
            extract_and_store_facts,
            session_id=session_id,
            user_query=user_query,
            assistant_reply=assistant_reply,
        )
    else:
        import asyncio
        try:
            asyncio.create_task(asyncio.to_thread(
                extract_and_store_facts,
                session_id=session_id,
                user_query=user_query,
                assistant_reply=assistant_reply,
            ))
        except Exception:
            pass

    return {
        "final_response": assistant_reply,
        "agent_used": result.get("agent_used", "GeneralResponder"),
        "model_used": result.get("model_used", "openai/gpt-oss-120b"),
        "search_context": result.get("search_context"),
        "code_execution": result.get("code_execution"),
    }
