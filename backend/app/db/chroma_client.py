import hashlib
import logging
import os
from typing import List, Optional
import chromadb
from chromadb.config import Settings as ChromaSettings
from app.config import get_settings

logger = logging.getLogger(__name__)


class ChromaMemoryManager:
    _instance: Optional["ChromaMemoryManager"] = None

    def __init__(self, persist_dir: Optional[str] = None):
        base_dir = persist_dir or get_settings().DATA_DIR
        self.persist_path = os.path.join(base_dir, "ai_memory")
        os.makedirs(self.persist_path, exist_ok=True)
        try:
            self.client = chromadb.PersistentClient(
                path=self.persist_path,
                settings=ChromaSettings(anonymized_telemetry=False, is_persistent=True),
            )
            self.collection = self.client.get_or_create_collection(
                name="suzzy_user_memory",
                metadata={"description": "Cross-session user facts and preferences"},
            )
            logger.info("ChromaDB initialized successfully at %s", self.persist_path)
        except Exception as e:
            logger.warning("Failed to initialize persistent ChromaDB: %s. Using ephemeral in-memory client.", e)
            self.client = chromadb.EphemeralClient(
                settings=ChromaSettings(anonymized_telemetry=False)
            )
            self.collection = self.client.get_or_create_collection(name="suzzy_user_memory")

    @classmethod
    def get_instance(cls) -> "ChromaMemoryManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def add_fact(self, session_id: str, fact_text: str) -> bool:
        clean_text = fact_text.strip()
        if not clean_text or not session_id:
            return False

        doc_id = hashlib.sha256(f"{session_id}:{clean_text}".encode("utf-8")).hexdigest()
        try:
            self.collection.upsert(
                ids=[doc_id],
                documents=[clean_text],
                metadatas=[{"session_id": session_id}],
            )
            return True
        except Exception as e:
            logger.error("Error storing fact in ChromaDB: %s", e)
            return False

    def get_relevant_facts(self, session_id: str, query: str, limit: int = 5) -> List[str]:
        if not session_id or not query.strip():
            return []
        try:
            results = self.collection.query(
                query_texts=[query],
                n_results=limit,
                where={"session_id": session_id},
            )
            documents = results.get("documents", [])
            if documents and len(documents) > 0:
                return [doc for doc in documents[0] if doc]
            return []
        except Exception as e:
            logger.error("Error querying ChromaDB: %s", e)
            return []

    def delete_memory(self, session_id: str) -> bool:
        if not session_id:
            return False
        try:
            self.collection.delete(where={"session_id": session_id})
            return True
        except Exception as e:
            logger.error("Error deleting user facts from ChromaDB: %s", e)
            return False


def get_memory_manager() -> ChromaMemoryManager:
    return ChromaMemoryManager.get_instance()
