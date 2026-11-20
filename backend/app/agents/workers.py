import json
import logging
import re
import urllib.parse
from typing import Any, Dict, List, Optional
from app.agents.state import AgentState
from app.core.llm_router import invoke_with_fallback
from app.core.sandbox import execute_python_code
from app.core.search import execute_search, format_search_context

logger = logging.getLogger(__name__)


def extract_code_from_markdown(text: str) -> str:
    """
    Extracts executable Python code from triple backticks if present,
    otherwise returns the raw text.
    """
    matches = re.findall(r"```(?:python)?\s*([\s\S]*?)```", text)
    if matches:
        return matches[-1].strip()
    return text.strip()


def web_search_worker(state: AgentState) -> Dict[str, Any]:
    """
    Worker specialized in live internet research.
    Queries DuckDuckGo/Tavily, synthesizes results, and cites sources.
    """
    logger.info("Executing WebSearchWorker for query: '%s'", state["user_query"])
    query = state["user_query"]

    # Retrieve live search results
    search_results = execute_search(query, max_results=5)
    search_context = format_search_context(search_results)

    system_prompt = (
        "You are Okin's Web Search Specialist. "
        "Your task is to provide an accurate, up-to-date answer to the user's question "
        "using the live web search results provided below. Always cite relevant source URLs.\n\n"
        f"{search_context}\n\n"
        "Format your answer cleanly with Markdown headings, bullet points, and source links."
    )

    messages = list(state.get("history", [])) + [{"role": "user", "content": query}]
    response_text, model_used = invoke_with_fallback(
        messages=messages,
        system_prompt=system_prompt,
        temperature=0.5,
    )

    # Attach inline visual illustration if query benefits from a visual diagram or illustration
    if not bool(state.get("voice_mode")):
        lower_q = query.lower()
        visual_keywords = [
            "how does", "how do", "explain", "what is a", "what are",
            "diagram", "illustration", "illustrate", "anatomy", "structure of",
            "cycle", "process", "mechanism", "visualize", "show me", "picture of",
            "solar system", "photosynthesis", "cell", "heart", "engine", "water cycle",
            "black hole", "dna", "volcano", "telescope", "brain", "neuron", "atom"
        ]
        if any(kw in lower_q for kw in visual_keywords):
            try:
                from app.core.illustrations import get_illustration_for_query
                topic = re.sub(
                    r"^(?:how does|how do|explain|what is a|what is an|what is the|what is|what are|show me|tell me about|diagram of|illustration of|can you explain)\s*",
                    "",
                    query,
                    flags=re.IGNORECASE,
                ).strip(" ?.")
                if not topic:
                    topic = query.strip(" ?.")
                illustration = get_illustration_for_query(topic)
                if illustration and illustration.get("url"):
                    card_data = {
                        "kind": "illustration",
                        "title": illustration.get("title", topic.title()),
                        "image_url": illustration.get("url"),
                        "source": illustration.get("source", "Visual Illustration"),
                        "caption": illustration.get("caption", f"Visual reference and diagram of {topic.title()}."),
                    }
                    response_text += f"\n\n```illustration-card\n{json.dumps(card_data)}\n```"
            except Exception as e:
                logger.debug("Web search visual illustration skipped: %s", e)

    return {
        "final_response": response_text,
        "search_context": search_context,
        "agent_used": "WebSearchWorker",
        "model_used": model_used,
    }


def multimodal_worker(state: AgentState) -> Dict[str, Any]:
    """
    Worker specialized in analyzing attached documents, code, images, and videos.
    """
    logger.info("Executing MultimodalWorker...")
    file_info = state.get("file_info") or {}
    user_query = state.get("user_query", "").strip()
    file_type = file_info.get("type", "unknown")
    filename = file_info.get("filename", "file")
    media_payload = file_info.get("media_payload")
    text_content = file_info.get("text_content")

    system_prompt = (
        "You are Okin's Multimodal & Document Specialist. "
        "Your role is to deeply analyze uploaded files, documents, code, images, and videos. "
        "Inspect all content, details, text, structure, or data, and address the user's instructions with high accuracy, clarity, and helpfulness."
    )

    # Document text analysis (PDF, DOCX, TXT, CSV, Code, etc.)
    if text_content is not None:
        safe_content = text_content[:80000]
        instruction = user_query if user_query and not user_query.startswith("Analyze ") else "Please review, analyze, and explain this document, summarizing its key takeaways."
        prompt = (
            f"The user uploaded the document '{filename}'.\n\n"
            f"--- Document Content Start ---\n{safe_content}\n--- Document Content End ---\n\n"
            f"User Instruction / Question: {instruction}"
        )
        messages = list(state.get("history", [])) + [{"role": "user", "content": prompt}]
        response_text, model_used = invoke_with_fallback(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0.5,
        )
    # Media analysis (Image / Camera capture / Video)
    elif media_payload is not None:
        instruction = user_query if user_query and not user_query.startswith("Analyze ") else "Please inspect this media file in detail, describe what you see, and summarize all relevant information."
        messages = list(state.get("history", [])) + [{"role": "user", "content": instruction}]
        response_text, model_used = invoke_with_fallback(
            messages=messages,
            system_prompt=system_prompt,
            media_payload=media_payload,
            temperature=0.5,
        )
    else:
        response_text = f"The uploaded file '{filename}' could not be processed."
        model_used = "system"

    return {
        "final_response": response_text,
        "agent_used": "MultimodalWorker",
        "model_used": model_used,
    }


def coder_worker(state: AgentState) -> Dict[str, Any]:
    """
    Worker specialized in generating, verifying, and executing Python code.
    Features up to 2 self-correction retry loops when sandbox errors occur.
    """
    logger.info("Executing CoderWorker...")
    user_query = state.get("user_query", "")
    history = state.get("history", [])
    retries = state.get("coder_retries", 0)

    # Step 1: Prompt the model to write executable code
    coder_prompt = (
        "You are Okin's Coder Specialist. "
        "Write clean, self-contained, and working Python 3 code that solves the user's request. "
        "Include print() statements to display meaningful output. "
        "Enclose the primary Python code inside ```python ... ``` block."
    )

    messages = list(history) + [{"role": "user", "content": user_query}]
    generation_text, model_used = invoke_with_fallback(
        messages=messages,
        system_prompt=coder_prompt,
        temperature=0.2,
    )

    code_to_run = extract_code_from_markdown(generation_text)
    execution_result = execute_python_code(code_to_run, timeout_seconds=15)

    # Step 2: Self-correction loop if execution returned errors
    current_retry = retries
    while not execution_result["success"] and current_retry < 2:
        current_retry += 1
        logger.info("CoderWorker self-correcting (Attempt %d/2)...", current_retry)
        fix_prompt = (
            f"The Python script produced the following error during execution:\n"
            f"```\n{execution_result['stderr']}\n```\n\n"
            f"Original Code:\n```python\n{code_to_run}\n```\n\n"
            f"Please fix the bug and return the corrected Python script enclosed inside ```python ... ```."
        )
        fix_text, model_used = invoke_with_fallback(
            messages=[{"role": "user", "content": fix_prompt}],
            system_prompt="You are an expert Python debugger. Fix the bug cleanly.",
            temperature=0.2,
        )
        code_to_run = extract_code_from_markdown(fix_text)
        generation_text = fix_text
        execution_result = execute_python_code(code_to_run, timeout_seconds=15)

    # Step 3: Format final response combining code and execution output
    output_section = ""
    if execution_result["stdout"]:
        output_section += f"\n\n**Output:**\n```\n{execution_result['stdout']}\n```"
    if execution_result["stderr"]:
        output_section += f"\n\n**Standard Error / Traceback:**\n```\n{execution_result['stderr']}\n```"

    final_content = (
        f"{generation_text}\n\n"
        f"---\n"
        f"**Sandbox Execution Result** (Exit Code: `{execution_result['exit_code']}`):"
        f"{output_section if output_section else ' (Execution completed with no printed output)'}"
    )

    return {
        "final_response": final_content,
        "code_execution": execution_result,
        "coder_retries": current_retry,
        "agent_used": "CoderWorker",
        "model_used": model_used,
    }


def general_responder(state: AgentState) -> Dict[str, Any]:
    """
    Worker specialized in conversational Q&A, reasoning, grammar analysis,
    and synthesizing context with long-term user memory.
    """
    logger.info("Executing GeneralResponder...")
    user_query = state.get("user_query", "")
    history = state.get("history", [])
    memory_context = state.get("memory_context", "").strip()

    is_voice = bool(state.get("voice_mode"))
    if is_voice:
        system_prompt = (
            "You are Okin, having an interactive live voice conversation with the user. "
            "Reply naturally, warmly, and concisely in 1 to 3 spoken sentences maximum. "
            "Never use Markdown, asterisks, bullet points, numbered lists, code blocks, or URLs. "
            "Speak conversationally as if talking on a phone call."
        )
    else:
        system_prompt = (
            "You are Okin, an intelligent, versatile, and helpful personal assistant. "
            "Communicate directly, clearly, and concisely. "
            "Do not use decorative emoji headers, promotional fluff, or unnecessary boilerplate tables for simple questions."
        )

    if memory_context:
        system_prompt += f"\n\nRelevant user facts remembered from past sessions:\n{memory_context}"

    messages = list(history) + [{"role": "user", "content": user_query}]
    response_text, model_used = invoke_with_fallback(
        messages=messages,
        system_prompt=system_prompt,
        temperature=0.7,
    )

    # Attach inline visual illustration if query benefits from a visual explanation or diagram
    if not is_voice:
        lower_q = user_query.lower()
        visual_keywords = [
            "how does", "how do", "explain", "what is a", "what are",
            "diagram", "illustration", "illustrate", "anatomy", "structure of",
            "cycle", "process", "mechanism", "visualize", "show me", "picture of",
            "solar system", "photosynthesis", "cell", "heart", "engine", "water cycle",
            "black hole", "dna", "volcano", "telescope", "brain", "neuron", "atom"
        ]
        if any(kw in lower_q for kw in visual_keywords):
            try:
                from app.core.illustrations import get_illustration_for_query
                topic = re.sub(
                    r"^(?:how does|how do|explain|what is a|what is an|what is the|what is|what are|show me|tell me about|diagram of|illustration of|can you explain)\s*",
                    "",
                    user_query,
                    flags=re.IGNORECASE,
                ).strip(" ?.")
                if not topic:
                    topic = user_query.strip(" ?.")
                illustration = get_illustration_for_query(topic)
                if illustration and illustration.get("url"):
                    card_data = {
                        "kind": "illustration",
                        "title": illustration.get("title", topic.title()),
                        "image_url": illustration.get("url"),
                        "source": illustration.get("source", "Visual Illustration"),
                        "caption": illustration.get("caption", f"Visual illustration and diagram of {topic.title()}."),
                    }
                    response_text += f"\n\n```illustration-card\n{json.dumps(card_data)}\n```"
            except Exception as e:
                logger.debug("Visual illustration attachment skipped: %s", e)

    return {
        "final_response": response_text,
        "agent_used": "GeneralResponder",
        "model_used": model_used,
    }


def email_worker(state: AgentState) -> Dict[str, Any]:
    """
    Worker specialized in reading, summarizing, drafting, and managing Gmail emails.
    """
    logger.info("Executing EmailWorker for query: '%s'", state.get("user_query"))
    user_query = state.get("user_query", "").strip()
    history = state.get("history", [])

    from app.core.gmail_service import (
        is_gmail_configured,
        is_gmail_authenticated,
        get_user_email,
        list_inbox_messages,
        create_email_draft,
        send_email_message,
    )

    # Step 1: Check authentication
    if not is_gmail_authenticated():
        configured = is_gmail_configured()
        if not configured:
            msg = (
                "### 📬 Gmail Integration Setup\n\n"
                "I can read your inbox, summarize recent emails, draft replies, and send messages for you! "
                "To get started, you'll need to link your Gmail account via Google OAuth.\n\n"
                "**How to connect:**\n"
                "1. Open **Settings & Guide** (click the gear icon in the top right header).\n"
                "2. Under **Gmail Integration**, upload your `credentials.json` file (obtained from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)).\n"
                "3. Click **Connect Gmail Account** to grant permission.\n\n"
                "Once connected, simply ask me to:\n"
                "- *\"Check my recent emails and summarize them\"*\n"
                "- *\"Draft an email to client@example.com about our project update\"*\n"
                "- *\"Summarize unread emails and reply to the latest one\"*"
            )
        else:
            msg = (
                "### 📬 Connect Your Gmail Account\n\n"
                "Your Google OAuth client configuration is ready, but your Gmail account is not yet authorized.\n\n"
                "Please click **Settings & Guide** (gear icon) and click **Connect Gmail Account** to sign in and grant access. "
                "Once completed, I'll be able to read, summarize, draft, and send emails for you!"
            )
        return {
            "final_response": msg,
            "agent_used": "EmailWorker",
            "model_used": "system",
        }

    user_email = get_user_email() or "your connected Gmail"
    lower_query = user_query.lower()

    # Step 2: Determine sub-intent (Drafting vs Reading/Summarizing vs Sending)
    is_draft_request = any(w in lower_query for w in ["draft", "write an email", "compose", "write email", "reply to", "send an email", "send email", "create email"])
    is_read_or_summary = any(w in lower_query for w in ["check", "read", "summarize", "recent", "inbox", "unread", "activity", "activities", "messages", "search"])

    # Intent A: Drafting / Replying to an email
    if is_draft_request and not ("check" in lower_query and "summarize" in lower_query):
        # We prompt LLM to extract recipient, subject, and professional message body
        system_prompt = (
            "You are Okin's Email Specialist. The user wants to draft or reply to an email.\n"
            f"The user's connected Gmail address is: {user_email}.\n"
            "Analyze the conversation and user request, then output a JSON object with the exact fields:\n"
            "- 'to': recipient email address (if specified, else placeholder or best guess from context)\n"
            "- 'subject': concise, professional email subject line\n"
            "- 'body': polite, well-written email body text (do not include markdown headers inside the body)\n\n"
            "Output ONLY a valid JSON object in a ```json code block, like:\n"
            "```json\n"
            "{\n"
            '  "to": "colleague@example.com",\n'
            '  "subject": "Meeting Follow-up",\n'
            '  "body": "Hi there,\\n\\nI wanted to follow up..."\n'
            "}\n"
            "```"
        )
        messages = list(history) + [{"role": "user", "content": user_query}]
        draft_json_str, model_used = invoke_with_fallback(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0.3,
        )

        import json
        extracted = {}
        try:
            raw_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", draft_json_str)
            if raw_match:
                extracted = json.loads(raw_match.group(1))
            else:
                extracted = json.loads(draft_json_str)
        except Exception:
            pass

        to_addr = extracted.get("to") or "recipient@example.com"
        subject_line = extracted.get("subject") or "Message from Okin"
        body_text = extracted.get("body") or user_query

        # Create draft in Gmail
        draft_info = {}
        try:
            draft_info = create_email_draft(to=to_addr, subject=subject_line, body=body_text)
            logger.info("Created Gmail draft ID: %s", draft_info.get("draft_id"))
        except Exception as e:
            logger.error("Failed to create Gmail draft: %s", e)

        draft_id = draft_info.get("draft_id", "draft-local")

        # Format interactive draft preview card for user confirmation
        draft_payload = json.dumps({
            "draft_id": draft_id,
            "to": to_addr,
            "subject": subject_line,
            "body": body_text,
            "connected_account": user_email,
        })

        final_response = (
            f"I have prepared an email draft and saved it to your Gmail account (`{user_email}`).\n\n"
            f"```email-draft\n{draft_payload}\n```\n\n"
            "Please review the preview card above. You can click **Send Email** when you're ready to send it, or let me know if you would like to edit any part of the text."
        )

        return {
            "final_response": final_response,
            "agent_used": "EmailWorker",
            "model_used": model_used,
        }

    # Intent B: Reading, Searching, or Summarizing Inbox
    query_filter = "label:INBOX"
    if "unread" in lower_query:
        query_filter = "is:unread"

    # Fetch recent messages
    emails = []
    try:
        emails = list_inbox_messages(query=query_filter, max_results=6)
    except Exception as e:
        logger.error("Error reading Gmail inbox: %s", e)
        return {
            "final_response": f"⚠️ Could not access your Gmail inbox: {e}. Please check your connection in Settings.",
            "agent_used": "EmailWorker",
            "model_used": "system",
        }

    if not emails:
        return {
            "final_response": f"📭 Your inbox (`{user_email}`) has no recent emails matching `{query_filter}`. Everything is caught up!",
            "agent_used": "EmailWorker",
            "model_used": "system",
        }

    # Format email bundle for LLM summarization
    email_briefs = []
    for idx, em in enumerate(emails, 1):
        email_briefs.append(
            f"Email #{idx} (ID: {em['id']}):\n"
            f"- From: {em['from']}\n"
            f"- Subject: {em['subject']}\n"
            f"- Date: {em['date']}\n"
            f"- Snippet/Body: {em['body'][:600]}\n"
        )
    formatted_inbox = "\n---\n".join(email_briefs)

    system_prompt = (
        "You are Okin's Email Specialist. "
        f"You have fetched the user's recent Gmail inbox activity for account '{user_email}'.\n\n"
        "Here are the recent incoming emails:\n"
        f"{formatted_inbox}\n\n"
        "Your task:\n"
        "1. Provide a clean, structured, and pleasant executive summary of their recent inbox activity.\n"
        "2. For each notable email, highlight who it is from, what it is about, urgency, and any action items.\n"
        "3. Ask the user if they would like you to draft a reply or follow-up for any of these messages."
    )

    messages = list(history) + [{"role": "user", "content": user_query}]
    response_text, model_used = invoke_with_fallback(
        messages=messages,
        system_prompt=system_prompt,
        temperature=0.5,
    )

    return {
        "final_response": response_text,
        "agent_used": "EmailWorker",
        "model_used": model_used,
    }


def calendar_worker(state: AgentState) -> Dict[str, Any]:
    """
    Worker specialized in scheduling calendar events, checking schedules,
    setting time-based reminders, and managing to-do lists.
    """
    logger.info("Executing CalendarWorker for query: '%s'", state.get("user_query"))
    session_id = state.get("session_id", "default")
    user_query = state.get("user_query", "").strip()
    history = state.get("history", [])

    from datetime import datetime
    import json
    from app.db.sqlite_client import (
        create_calendar_event,
        get_calendar_events,
        delete_calendar_event,
        create_task_or_reminder,
        get_tasks_and_reminders,
        toggle_task_completion,
        delete_task,
    )

    now_local = datetime.now()
    current_time_str = now_local.strftime("%Y-%m-%d %H:%M (%A)")

    existing_events = get_calendar_events(session_id)
    existing_tasks = get_tasks_and_reminders(session_id, include_completed=True)

    events_context = "\n".join(
        f"- [Event ID: {e['id']}] {e['title']} at {e['start_time']}"
        + (f" (Location: {e['location']})" if e.get("location") else "")
        for e in existing_events
    ) or "None"

    tasks_context = "\n".join(
        f"- [Task ID: {t['id']}] {'[DONE] ' if t['completed'] else ''}{t['title']} "
        f"(Priority: {t['priority']}"
        + (f", Reminder at: {t['due_time']}" if t.get("due_time") else "")
        + ")"
        for t in existing_tasks
    ) or "None"

    system_prompt = (
        "You are Okin's Calendar, Reminders & Task Organization Specialist.\n"
        f"Current Local Date & Time: {current_time_str}\n\n"
        f"User's Current Scheduled Events:\n{events_context}\n\n"
        f"User's Current Reminders & To-Do List:\n{tasks_context}\n\n"
        "Analyze the user's request and decide what action(s) to take. Output ONLY a valid JSON object inside a ```json block:\n"
        "{\n"
        '  "action": "schedule_event" | "set_reminder" | "add_todo" | "complete_task" | "delete_task" | "delete_event" | "view_all",\n'
        '  "title": "short clear title if creating/updating",\n'
        '  "start_time": "ISO 8601 datetime YYYY-MM-DDTHH:MM:SS if scheduling event",\n'
        '  "end_time": "optional ISO 8601 datetime",\n'
        '  "location": "optional location",\n'
        '  "due_time": "ISO 8601 datetime YYYY-MM-DDTHH:MM:SS if setting a timed reminder",\n'
        '  "priority": "low" | "medium" | "high",\n'
        '  "target_id": "exact ID from the list above if completing or deleting",\n'
        '  "reply": "a friendly, helpful natural language response confirming what was done or summarizing their schedule & to-do list"\n'
        "}"
    )

    messages = list(history) + [{"role": "user", "content": user_query}]
    raw_resp, model_used = invoke_with_fallback(
        messages=messages,
        system_prompt=system_prompt,
        temperature=0.2,
    )

    parsed: Dict[str, Any] = {}
    try:
        m = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", raw_resp)
        json_str = m.group(1) if m else raw_resp
        parsed = json.loads(json_str)
    except Exception:
        parsed = {"action": "view_all", "reply": raw_resp}

    action = parsed.get("action", "view_all")
    reply_text = parsed.get("reply", "")
    created_card: Dict[str, Any] | None = None

    if action == "schedule_event" and parsed.get("title"):
        ev = create_calendar_event(
            session_id=session_id,
            title=parsed["title"],
            start_time=parsed.get("start_time") or now_local.isoformat(timespec="minutes"),
            end_time=parsed.get("end_time"),
            location=parsed.get("location") or "",
        )
        created_card = {"kind": "event", "item": ev}

        # Attempt Google Calendar sync if user has connected Google
        gcal_synced = False
        try:
            from app.core.gmail_service import create_google_calendar_event, is_gmail_authenticated
            if is_gmail_authenticated():
                g_ev = create_google_calendar_event(
                    title=ev["title"],
                    start_time_iso=ev["start_time"],
                    end_time_iso=ev.get("end_time"),
                    location=ev.get("location") or "",
                )
                if g_ev:
                    gcal_synced = True
        except Exception as g_err:
            logger.warning("Google calendar sync error: %s", g_err)

        if not reply_text:
            if gcal_synced:
                reply_text = f"Scheduled **{ev['title']}** for `{ev['start_time']}` and synced to your Google Calendar with active phone & popup alarms!"
            else:
                reply_text = f"Scheduled **{ev['title']}** for `{ev['start_time']}`. Okin will sound an audible alarm chime and desktop alert when it's time!"
        elif gcal_synced:
            reply_text += " (Synced to your Google Calendar with phone alarm notifications)."
        else:
            reply_text += " (Okin will sound an alarm chime and desktop alert when it is time)."

    elif action in ("set_reminder", "add_todo") and parsed.get("title"):
        is_rem = action == "set_reminder" or bool(parsed.get("due_time"))
        task = create_task_or_reminder(
            session_id=session_id,
            title=parsed["title"],
            due_time=parsed.get("due_time"),
            priority=parsed.get("priority") or "medium",
            is_reminder=is_rem,
        )
        created_card = {"kind": "task", "item": task}

        # If it has a specific due time, also sync to Google Calendar as a reminder event
        gcal_synced = False
        if is_rem and task.get("due_time"):
            try:
                from app.core.gmail_service import create_google_calendar_event, is_gmail_authenticated
                if is_gmail_authenticated():
                    g_ev = create_google_calendar_event(
                        title=f"Reminder: {task['title']}",
                        start_time_iso=task["due_time"],
                        description=f"Priority: {task['priority']}. Created by Okin AI.",
                    )
                    if g_ev:
                        gcal_synced = True
            except Exception:
                pass

        if not reply_text:
            if gcal_synced:
                reply_text = f"Set reminder for **{task['title']}** at `{task.get('due_time')}` (synced to Google Calendar with alarms)."
            else:
                reply_text = f"Added **{task['title']}** to your {'reminders' if is_rem else 'to-do list'}. Okin will trigger an audible chime & alert when it is due!"

    elif action == "complete_task" and parsed.get("target_id"):
        toggle_task_completion(session_id, parsed["target_id"], True)

    elif action == "delete_task" and parsed.get("target_id"):
        delete_task(session_id, parsed["target_id"])

    elif action == "delete_event" and parsed.get("target_id"):
        delete_calendar_event(session_id, parsed["target_id"])

    else:
        # Refresh lists for view_all
        existing_events = get_calendar_events(session_id)
        existing_tasks = get_tasks_and_reminders(session_id, include_completed=False)
        created_card = {
            "kind": "summary",
            "events": existing_events[:6],
            "tasks": existing_tasks[:8],
        }

    final_content = reply_text
    if created_card:
        final_content += f"\n\n```calendar-card\n{json.dumps(created_card)}\n```"

    return {
        "final_response": final_content,
        "agent_used": "CalendarWorker",
        "model_used": model_used,
    }


def discovery_worker(state: AgentState) -> Dict[str, Any]:
    """
    Worker specialized in Navigation & Discovery:
    1. Maps & Local Places (Google Maps, directions, reviews, local spots)
    2. Travel Planning (Flights, fares, hotels, booking deep links)
    3. Media & Entertainment (YouTube video search, channel queries, in-chat playback)
    """
    import urllib.parse
    logger.info("Executing DiscoveryWorker...")
    query = state["user_query"]
    lower = query.lower()

    from app.core.discovery import (
        search_places_rich,
        search_places_osm,
        build_osm_embed_url,
        build_directions_links,
        build_travel_links,
        search_youtube_videos,
    )

    card_data: Optional[Dict[str, Any]] = None
    card_type: str = "maps-card"
    reply_text: str = ""
    model_used: str = "openai/gpt-oss-120b"

    # Category A: Media & Entertainment (YouTube)
    is_youtube = any(kw in lower for kw in ["youtube", "video", "videos", "play", "watch", "music video", "listen to", "channel", "playlist"])
    # Category B: Travel Planning (Flights & Hotels)
    is_travel = any(kw in lower for kw in ["flight", "flights", "hotel", "hotels", "airline", "fare", "fares", "book a flight", "book hotel", "vacation to", "trip to"])
    # Category C: Maps, Local Places & Directions
    is_maps = any(kw in lower for kw in ["map", "maps", "restaurant", "restaurants", "cafe", "food", "direction", "directions", "route", "navigate", "spots", "places", "near me", "nearby", "where is"])

    if is_youtube and not is_maps and not is_travel:
        card_type = "youtube-card"
        videos = search_youtube_videos(query, max_results=3)
        card_data = {
            "kind": "youtube",
            "query": query,
            "videos": videos,
        }
        videos_summary = "\n".join(
            f"- {v.get('title', 'Video')} ({v.get('channel', 'YouTube')}) — {v.get('url', '')}"
            for v in videos
        ) or "No direct video matches found."
        system_prompt = (
            "You are Okin's Media & Entertainment Guide. "
            "Help the user discover, enjoy, and answer questions about YouTube videos, music, and creators. "
            f"Found YouTube results:\n{videos_summary}\n\n"
            "Reference the found video titles and channels naturally. "
            "Inform the user they can play the video directly inside the chat or open it on YouTube."
        )
        messages = list(state.get("history", [])) + [{"role": "user", "content": query}]
        reply_text, model_used = invoke_with_fallback(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0.5,
        )

    elif is_travel:
        card_type = "travel-card"
        is_flight = "flight" in lower or "airline" in lower or "fare" in lower
        links = build_travel_links(
            travel_type="flight" if is_flight else "hotel",
            destination=query,
            location=query,
        )
        search_results = execute_search(f"{query} travel guides fares prices", max_results=4)
        context = format_search_context(search_results)

        card_data = {
            "kind": "travel",
            "travel_type": "flight" if is_flight else "hotel",
            "query": query,
            "links": links,
        }
        system_prompt = (
            "You are Okin's Travel & Flight Specialist. "
            "Help the user plan their trip, compare flights, find hotels, and budget their travel. "
            f"Use the live travel research below:\n\n{context}\n\n"
            "Provide helpful tips, estimated fare ranges, best areas to stay, and note that direct booking links with live prices are provided in their travel card."
        )
        messages = list(state.get("history", [])) + [{"role": "user", "content": query}]
        reply_text, model_used = invoke_with_fallback(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0.5,
        )

    else:
        # Maps & Local Places
        card_type = "maps-card"
        user_loc = state.get("user_location") or {}
        user_lat = user_loc.get("latitude")
        user_lon = user_loc.get("longitude")
        user_loc_str = f"Lat: {user_lat}, Lon: {user_lon}" if user_lat and user_lon else ""

        # Augment search if "near me" or "nearby"
        search_query = query
        if ("near me" in lower or "around me" in lower or "nearby" in lower or "closest" in lower) and user_lat and user_lon:
            search_query = f"{query} near coordinates {user_lat},{user_lon}"

        search_results = execute_search(f"{search_query} reviews address", max_results=5)
        context = format_search_context(search_results)

        loc_context = f"\nUser's Current Geolocation: {user_loc_str} (Use this for nearest recommendations and turn-by-turn directions)\n" if user_loc_str else ""

        system_prompt = (
            "You are Okin's Local Guide & Navigation Specialist. "
            "Help the user discover top-rated spots, restaurants, cafes, local businesses, and directions based on their query. "
            f"{loc_context}"
            f"Use the local place research below:\n\n{context}\n\n"
            "Format your response as a valid JSON object inside a ```json block:\n"
            "{\n"
            '  "reply": "A friendly, descriptive natural language overview recommending top spots with highlights...",\n'
            '  "places": [\n'
            '    {\n'
            '      "name": "Exact Name of Place",\n'
            '      "category": "Restaurant | Cafe | Pharmacy | Park | Hotel | Attraction",\n'
            '      "address": "Street address or neighborhood area",\n'
            '      "snippet": "Short 1-2 sentence description of why it is recommended and what makes it special"\n'
            '    }\n'
            '  ]\n'
            "}"
        )

        messages = list(state.get("history", [])) + [{"role": "user", "content": query}]
        raw_resp, model_used = invoke_with_fallback(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0.4,
        )

        parsed_places: List[Dict[str, Any]] = []
        reply_text = raw_resp
        try:
            m = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", raw_resp)
            json_str = m.group(1) if m else raw_resp
            parsed_json = json.loads(json_str)
            reply_text = parsed_json.get("reply", raw_resp)
            parsed_places = parsed_json.get("places", [])
        except Exception:
            pass

        # Build verified Google Maps and Directions URLs for every place
        formatted_places = []
        if parsed_places:
            for p in parsed_places:
                p_name = p.get("name", "").strip()
                if not p_name:
                    continue
                p_addr = p.get("address", "").strip()
                search_term = f"{p_name} {p_addr}".strip()
                enc_dest = urllib.parse.quote(search_term)

                if user_lat and user_lon:
                    dir_url = f"https://www.google.com/maps/dir/?api=1&origin={user_lat},{user_lon}&destination={enc_dest}"
                else:
                    dir_url = f"https://www.google.com/maps/dir/?api=1&destination={enc_dest}"

                formatted_places.append({
                    "name": p_name,
                    "category": p.get("category", "Local Spot"),
                    "address": p_addr,
                    "snippet": p.get("snippet", ""),
                    "google_maps_url": f"https://www.google.com/maps/search/?api=1&query={enc_dest}",
                    "directions_url": dir_url,
                })
        else:
            # Fallback to rich search
            formatted_places = search_places_rich(search_query, limit=4)

        # Geocode top spot or location query with OpenStreetMap (Free, Interactive Zoom/Pan)
        top_lat = None
        top_lon = None
        top_bbox = None
        osm_embed_url = ""
        active_target = query

        osm_candidates = search_places_osm(query, limit=1)
        if osm_candidates:
            top_spot = osm_candidates[0]
            top_lat = top_spot.get("lat")
            top_lon = top_spot.get("lon")
            top_bbox = top_spot.get("boundingbox")
            active_target = top_spot.get("display_name") or top_spot.get("name") or query
            if top_lat and top_lon:
                osm_embed_url = build_osm_embed_url(top_lat, top_lon, top_bbox)

        # Fallback target from formatted places if available and not yet geocoded
        if not osm_embed_url and formatted_places:
            fp0 = formatted_places[0]
            target_name = f"{fp0['name']} {fp0.get('address', '')}".strip()
            fp_osm = search_places_osm(target_name, limit=1)
            if fp_osm:
                top_lat = fp_osm[0].get("lat")
                top_lon = fp_osm[0].get("lon")
                top_bbox = fp_osm[0].get("boundingbox")
                active_target = target_name
                osm_embed_url = build_osm_embed_url(top_lat, top_lon, top_bbox)
            else:
                active_target = target_name

        enc_target = urllib.parse.quote(active_target)
        gmaps_search_url = f"https://www.google.com/maps/search/?api=1&query={enc_target}"
        if top_lat and top_lon:
            gmaps_search_url = f"https://www.google.com/maps/search/?api=1&query={top_lat},{top_lon}"

        if user_lat and user_lon:
            gmaps_dir_url = f"https://www.google.com/maps/dir/?api=1&origin={user_lat},{user_lon}&destination={enc_target}"
        else:
            gmaps_dir_url = f"https://www.google.com/maps/dir/?api=1&destination={enc_target}"

        active_map_embed_url = osm_embed_url or f"https://maps.google.com/maps?q={enc_target}&t=&z=14&ie=UTF8&iwloc=&output=embed"

        card_data = {
            "kind": "places",
            "query": query,
            "location_name": active_target,
            "lat": top_lat,
            "lon": top_lon,
            "user_has_location": bool(user_lat and user_lon),
            "places": formatted_places,
            "osm_embed_url": osm_embed_url,
            "active_map_embed_url": active_map_embed_url,
            "gmaps_search_url": gmaps_search_url,
            "directions_url": gmaps_dir_url,
        }

    final_content = reply_text
    if card_data:
        final_content += f"\n\n```{card_type}\n{json.dumps(card_data)}\n```"

    return {
        "final_response": final_content,
        "agent_used": "DiscoveryWorker",
        "model_used": model_used,
    }


def image_generator_worker(state: AgentState) -> Dict[str, Any]:
    """
    Worker specialized in generating high-resolution AI visuals, artwork,
    and illustrations based on user prompt, style, and aspect ratio.
    """
    logger.info("Executing ImageGeneratorWorker for query: '%s'", state.get("user_query"))
    query = state.get("user_query", "").strip()

    # Clean slash commands like /imagine, /draw, /image, /generate
    clean_prompt = re.sub(r"^/(?:imagine|draw|image|generate)\s*", "", query, flags=re.IGNORECASE).strip()
    if not clean_prompt:
        clean_prompt = query

    # Extract requested style if mentioned
    lower = clean_prompt.lower()
    selected_style = "photorealistic"
    if "3d" in lower or "render" in lower:
        selected_style = "3d_render"
    elif "concept art" in lower or "visual reference" in lower or "reference" in lower:
        selected_style = "concept_art"
    elif "vector" in lower or "flat graphic" in lower or "minimalist" in lower:
        selected_style = "minimalist_vector"
    elif "sketch" in lower or "line art" in lower or "pencil" in lower:
        selected_style = "sketch_line_art"
    elif "illustration" in lower or "illustrate" in lower or "anime" in lower or "digital art" in lower:
        selected_style = "digital_illustration"

    # Extract requested aspect ratio if mentioned
    selected_ar = "1:1"
    if "16:9" in lower or "landscape" in lower or "wide" in lower or "wallpaper" in lower:
        selected_ar = "16:9"
    elif "9:16" in lower or "portrait" in lower or "vertical" in lower or "story" in lower:
        selected_ar = "9:16"
    elif "4:3" in lower or "standard" in lower:
        selected_ar = "4:3"

    from app.core.image_generator import (
        VisualRateLimitError,
        VisualSafetyError,
        VisualTimeoutError,
        generate_image_asset,
    )
    import asyncio
    import concurrent.futures

    # Execute async generator safely in thread
    try:
        with concurrent.futures.ThreadPoolExecutor() as pool:
            image_asset = pool.submit(
                lambda: asyncio.run(generate_image_asset(clean_prompt, style=selected_style, aspect_ratio=selected_ar, enhance=True))
            ).result()
    except (VisualSafetyError, VisualRateLimitError, VisualTimeoutError, ValueError) as friendly_err:
        return {
            "final_response": f"I couldn't generate that visual: {friendly_err}",
            "agent_used": "ImageGeneratorWorker",
            "model_used": "flux-image-generator",
        }
    except Exception as err:
        logger.error("ImageGeneratorWorker failed: %s", err)
        return {
            "final_response": f"Sorry, visual generation ran into a temporary issue ({err}). Please try again or toggle Visual Mode below to adjust your prompt.",
            "agent_used": "ImageGeneratorWorker",
            "model_used": "flux-image-generator",
        }

    card_data = {
        "kind": "image-generation",
        "image_id": image_asset["image_id"],
        "url": image_asset["url"],
        "prompt": image_asset["prompt"],
        "enhanced_prompt": image_asset["enhanced_prompt"],
        "style": image_asset["style"],
        "aspect_ratio": image_asset["aspect_ratio"],
        "width": image_asset["width"],
        "height": image_asset["height"],
        "provider": image_asset.get("provider", "flux"),
        "created_at": image_asset["created_at"],
    }

    style_display = selected_style.replace("_", " ").title()
    reply = f"Here is your **{style_display}** visual asset for *\"{clean_prompt}\"* ({selected_ar}):\n\n```image-generation-card\n{json.dumps(card_data)}\n```"

    return {
        "final_response": reply,
        "agent_used": "ImageGeneratorWorker",
        "model_used": "flux-image-generator",
    }


