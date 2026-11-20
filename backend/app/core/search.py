import logging
from typing import Any, Dict, List
from app.config import get_settings

logger = logging.getLogger(__name__)


def search_duckduckgo(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    """
    Search DuckDuckGo using duckduckgo_search library.
    """
    from duckduckgo_search import DDGS

    results: List[Dict[str, str]] = []
    with DDGS() as ddgs:
        raw_results = ddgs.text(query, max_results=max_results)
        for r in raw_results:
            results.append(
                {
                    "title": r.get("title", ""),
                    "snippet": r.get("body", ""),
                    "link": r.get("href", ""),
                }
            )
    return results


def search_tavily(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    """
    Fallback search using Tavily API if configured.
    """
    settings = get_settings()
    if not settings.TAVILY_API_KEY:
        raise ValueError("TAVILY_API_KEY is not configured.")

    from tavily import TavilyClient

    client = TavilyClient(api_key=settings.TAVILY_API_KEY)
    response = client.search(query=query, max_results=max_results)
    results: List[Dict[str, str]] = []
    for item in response.get("results", []):
        results.append(
            {
                "title": item.get("title", ""),
                "snippet": item.get("content", ""),
                "link": item.get("url", ""),
            }
        )
    return results


def execute_search(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    """
    Executes search with primary DuckDuckGo and fallback to Tavily.
    """
    clean_query = query.strip()
    if not clean_query:
        return []

    # 1. Primary: DuckDuckGo
    try:
        logger.info("Executing web search via DuckDuckGo for: '%s'", clean_query)
        results = search_duckduckgo(clean_query, max_results=max_results)
        if results:
            return results
    except Exception as ddg_err:
        logger.warning("DuckDuckGo search encountered error: %s. Trying Tavily fallback...", ddg_err)

    # 2. Fallback: Tavily
    try:
        settings = get_settings()
        if settings.TAVILY_API_KEY:
            logger.info("Executing fallback search via Tavily for: '%s'", clean_query)
            return search_tavily(clean_query, max_results=max_results)
    except Exception as tavily_err:
        logger.error("Tavily search fallback failed: %s", tavily_err)

    return []


def format_search_context(results: List[Dict[str, str]]) -> str:
    """
    Formats search results into context string for LLM prompting.
    """
    if not results:
        return "No relevant real-time search results were found."

    formatted = ["### Live Web Search Results:"]
    for i, r in enumerate(results, 1):
        formatted.append(f"{i}. **{r.get('title')}**\n   {r.get('snippet')}\n   Source: {r.get('link')}")
    return "\n\n".join(formatted)
