import logging
import json
import re
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional
from app.core.search import execute_search

logger = logging.getLogger(__name__)

USER_AGENT = "SuzzyAI-Discovery/1.0 (contact@suzzy.ai)"


# ---------------------------------------------------------------------------
# 1. Maps & Local Places Discovery
# ---------------------------------------------------------------------------

def search_places_osm(query: str, limit: int = 3) -> List[Dict[str, Any]]:
    """
    Search places and landmarks using OpenStreetMap Nominatim API (100% Free & Open-Source).
    """
    clean_query = query.strip()
    if not clean_query:
        return []
    url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(clean_query)}&format=json&limit={limit}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return [
                {
                    "name": item.get("name") or item.get("display_name", "").split(",")[0],
                    "display_name": item.get("display_name", ""),
                    "lat": item.get("lat"),
                    "lon": item.get("lon"),
                    "boundingbox": item.get("boundingbox", []),
                }
                for item in data
            ]
    except Exception as e:
        logger.debug("OSM geocoding failed: %s", e)
        return []


def build_osm_embed_url(lat: Any, lon: Any, boundingbox: Optional[List[str]] = None) -> str:
    """
    Constructs an interactive OpenStreetMap embed URL that users can zoom and pan inside the card.
    100% free, no API key required, zero embedding restrictions.
    """
    try:
        f_lat = float(lat)
        f_lon = float(lon)
        if boundingbox and len(boundingbox) == 4:
            min_lat, max_lat, min_lon, max_lon = boundingbox[0], boundingbox[1], boundingbox[2], boundingbox[3]
            return f"https://www.openstreetmap.org/export/embed.html?bbox={min_lon}%2C{min_lat}%2C{max_lon}%2C{max_lat}&layer=mapnik&marker={f_lat}%2C{f_lon}"
        
        delta_lat = 0.008
        delta_lon = 0.012
        min_lat = f_lat - delta_lat
        max_lat = f_lat + delta_lat
        min_lon = f_lon - delta_lon
        max_lon = f_lon + delta_lon
        return f"https://www.openstreetmap.org/export/embed.html?bbox={min_lon}%2C{min_lat}%2C{max_lon}%2C{max_lat}&layer=mapnik&marker={f_lat}%2C{f_lon}"
    except Exception:
        return ""


def search_places_rich(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Searches for local places, businesses, restaurants, and attractions.
    Constructs direct Google Maps view, directions, and reviews links.
    """
    clean_query = query.strip()
    if not clean_query:
        return []

    # 1. Search web for places and reviews
    raw_results = execute_search(f"{clean_query} address reviews ratings", max_results=limit)
    places: List[Dict[str, Any]] = []

    # Try OSM for exact coordinates if single spot
    osm_items = search_places_osm(clean_query, limit=3)
    osm_map = {item["name"].lower(): item for item in osm_items}

    for r in raw_results:
        title = r.get("title", "").split("|")[0].split("-")[0].strip()
        snippet = r.get("snippet", "")
        enc_query = urllib.parse.quote(f"{title} {clean_query}")
        
        # Check if we have lat/lon from OSM
        coords = None
        for k, v in osm_map.items():
            if k in title.lower() or title.lower() in k:
                coords = (v["lat"], v["lon"])
                break

        places.append({
            "name": title,
            "snippet": snippet[:180] + ("..." if len(snippet) > 180 else ""),
            "google_maps_url": f"https://www.google.com/maps/search/?api=1&query={enc_query}",
            "directions_url": f"https://www.google.com/maps/dir/?api=1&destination={enc_query}",
            "reviews_url": f"https://www.google.com/search?q={enc_query}+reviews",
            "lat": coords[0] if coords else None,
            "lon": coords[1] if coords else None,
            "source_link": r.get("link"),
        })

    return places[:limit]


def build_directions_links(origin: str, destination: str) -> Dict[str, str]:
    """
    Builds direct Google Maps turn-by-turn navigation link for any route.
    """
    enc_origin = urllib.parse.quote(origin.strip())
    enc_dest = urllib.parse.quote(destination.strip())
    return {
        "directions_url": f"https://www.google.com/maps/dir/?api=1&origin={enc_origin}&destination={enc_dest}",
        "origin": origin.strip(),
        "destination": destination.strip(),
    }


# ---------------------------------------------------------------------------
# 2. Travel Planning (Flights & Hotels)
# ---------------------------------------------------------------------------

def build_travel_links(
    travel_type: str,  # "flight" | "hotel"
    origin: Optional[str] = None,
    destination: Optional[str] = None,
    location: Optional[str] = None,
    date: Optional[str] = None,
) -> Dict[str, str]:
    """
    Generates verified deep booking & comparison URLs for Google Flights, Google Hotels,
    Skyscanner, and Booking.com.
    """
    if travel_type == "flight":
        orig = (origin or "").strip()
        dest = (destination or "").strip()
        q_flight = f"flights from {orig} to {dest}" + (f" on {date}" if date else "")
        enc_flight = urllib.parse.quote(q_flight)
        
        return {
            "type": "flight",
            "origin": orig,
            "destination": dest,
            "date": date or "Flexible",
            "google_flights_url": f"https://www.google.com/travel/flights?q={enc_flight}",
            "skyscanner_url": f"https://www.skyscanner.com/transport/flights/{urllib.parse.quote(orig)}/{urllib.parse.quote(dest)}",
            "kayak_url": f"https://www.kayak.com/flights/{urllib.parse.quote(orig)}-{urllib.parse.quote(dest)}",
        }
    else:
        loc = (location or destination or "").strip()
        enc_loc = urllib.parse.quote(loc)
        return {
            "type": "hotel",
            "location": loc,
            "google_hotels_url": f"https://www.google.com/travel/hotels/{enc_loc}",
            "booking_url": f"https://www.booking.com/searchresults.html?ss={enc_loc}",
            "tripadvisor_url": f"https://www.tripadvisor.com/Search?q={enc_loc}+hotels",
        }


# ---------------------------------------------------------------------------
# 3. Media & Entertainment (YouTube)
# ---------------------------------------------------------------------------

def search_youtube_videos(query: str, max_results: int = 4) -> List[Dict[str, Any]]:
    """
    Search YouTube videos and playlists.
    Extracts real video IDs, titles, channels, and builds embed players.
    """
    clean_query = query.strip()
    if not clean_query:
        return []

    videos: List[Dict[str, Any]] = []
    seen_ids = set()

    # 1. Primary: Direct YouTube Results Scraping with regex
    try:
        url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(clean_query)}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            html = resp.read().decode("utf-8", errors="ignore")

            # Extract video blocks: videoId, title, ownerText
            # Pattern matching YouTube's initialData JSON embedded in HTML
            matches = re.findall(
                r'\"videoRenderer\":\{\"videoId\":\"([a-zA-Z0-9_-]{11})\"[\s\S]*?\"title\":\{\"runs\":\[\{\"text\":\"([^\"]+)\"\}[\s\S]*?\"ownerText\":\{\"runs\":\[\{\"text\":\"([^\"]+)\"',
                html,
            )

            for vid_id, title, channel in matches:
                if vid_id in seen_ids:
                    continue
                seen_ids.add(vid_id)
                videos.append({
                    "id": vid_id,
                    "title": title,
                    "channel": channel,
                    "url": f"https://www.youtube.com/watch?v={vid_id}",
                    "embed_url": f"https://www.youtube-nocookie.com/embed/{vid_id}",
                    "thumbnail": f"https://img.youtube.com/vi/{vid_id}/hqdefault.jpg",
                })
                if len(videos) >= max_results:
                    break

            # Secondary regex fallback if ownerText wasn't cleanly captured
            if not videos:
                vid_ids = re.findall(r'\"videoId\":\"([a-zA-Z0-9_-]{11})\"', html)
                titles = re.findall(r'\"title\":\{\"runs\":\[\{\"text\":\"([^\"]+)\"\}', html)
                for idx, v_id in enumerate(vid_ids):
                    if v_id in seen_ids:
                        continue
                    seen_ids.add(v_id)
                    v_title = titles[idx] if idx < len(titles) else clean_query.title()
                    videos.append({
                        "id": v_id,
                        "title": v_title,
                        "channel": "YouTube",
                        "url": f"https://www.youtube.com/watch?v={v_id}",
                        "embed_url": f"https://www.youtube-nocookie.com/embed/{v_id}",
                        "thumbnail": f"https://img.youtube.com/vi/{v_id}/hqdefault.jpg",
                    })
                    if len(videos) >= max_results:
                        break
    except Exception as e:
        logger.warning("Direct YouTube search encountered error: %s", e)

    # 2. Fallback: Search via DuckDuckGo / Tavily with youtube.com filter
    if not videos:
        try:
            ddg_results = execute_search(f"site:youtube.com/watch {clean_query}", max_results=max_results)
            for r in ddg_results:
                link = r.get("link", "")
                m = re.search(r"(?:v=|\/embed\/|\/watch\?v=|\.be\/)([a-zA-Z0-9_-]{11})", link)
                if m:
                    vid_id = m.group(1)
                    if vid_id not in seen_ids:
                        seen_ids.add(vid_id)
                        videos.append({
                            "id": vid_id,
                            "title": r.get("title", "").replace(" - YouTube", ""),
                            "channel": "YouTube Creator",
                            "url": f"https://www.youtube.com/watch?v={vid_id}",
                            "embed_url": f"https://www.youtube-nocookie.com/embed/{vid_id}",
                            "thumbnail": f"https://img.youtube.com/vi/{vid_id}/hqdefault.jpg",
                        })
        except Exception as e:
            logger.warning("Web search fallback for YouTube failed: %s", e)

    return videos
