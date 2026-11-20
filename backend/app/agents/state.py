from typing import Any, Dict, List, Optional, TypedDict


class AgentState(TypedDict):
    session_id: str
    thread_id: str
    user_query: str
    history: List[Dict[str, str]]
    file_info: Optional[Dict[str, Any]]
    user_location: Optional[Dict[str, Any]]
    memory_context: str
    search_context: Optional[str]
    code_execution: Optional[Dict[str, Any]]
    coder_retries: int
    worker_output: Optional[str]
    final_response: str
    agent_used: str
    model_used: str
    next_node: str
    voice_mode: Optional[bool]
