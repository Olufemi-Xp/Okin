import logging
import os
import subprocess
import sys
import tempfile
from typing import Any, Dict

logger = logging.getLogger(__name__)


def execute_python_code(code: str, timeout_seconds: int = 15) -> Dict[str, Any]:
    """
    Executes Python code in an isolated temporary directory with:
    - Stripped environment variables (env={}) to prevent secret leakage
    - Strict 15-second timeout to prevent infinite loops
    - Non-shell subprocess execution (no shell=True)
    """
    with tempfile.TemporaryDirectory(prefix="suzzy_exec_") as tmpdir:
        script_path = os.path.join(tmpdir, "script.py")
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(code)

        # Minimal sanitized environment:
        # On Windows, SystemRoot/PATH can be needed to even launch python.exe,
        # but no user secrets or API keys are passed.
        sanitized_env = {
            "PYTHONUNBUFFERED": "1",
        }
        # Retain minimal system variables required to execute a binary
        for var in ("SYSTEMROOT", "SystemRoot", "WINDIR", "windir", "PATH", "Path"):
            if var in os.environ:
                sanitized_env[var] = os.environ[var]

        try:
            logger.info("Executing user Python code in sandbox with %ds timeout...", timeout_seconds)
            result = subprocess.run(
                [sys.executable, script_path],
                cwd=tmpdir,
                env=sanitized_env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=timeout_seconds,
                shell=False,
            )
            stdout = result.stdout.strip()
            stderr = result.stderr.strip()
            success = (result.returncode == 0)

            return {
                "success": success,
                "stdout": stdout,
                "stderr": stderr,
                "exit_code": result.returncode,
                "timed_out": False,
            }
        except subprocess.TimeoutExpired as te:
            logger.warning("Code execution timed out after %d seconds.", timeout_seconds)
            stdout = te.stdout.decode("utf-8", errors="ignore").strip() if te.stdout else ""
            stderr = te.stderr.decode("utf-8", errors="ignore").strip() if te.stderr else ""
            return {
                "success": False,
                "stdout": stdout,
                "stderr": f"Execution timed out after {timeout_seconds} seconds.\n{stderr}".strip(),
                "exit_code": -1,
                "timed_out": True,
            }
        except Exception as e:
            logger.error("Failed to run code in sandbox: %s", e)
            return {
                "success": False,
                "stdout": "",
                "stderr": str(e),
                "exit_code": -1,
                "timed_out": False,
            }
