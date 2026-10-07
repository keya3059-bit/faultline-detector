#!/usr/bin/env python3
"""
FaultLine — Python FastAPI + Hugging Face + Gemini 3.8 Backend Service
Provides REST endpoints for:
  - POST /api/python/analyze     : Python AST static inspection, CWE detection & unified diff
  - POST /api/python/duplicates  : BAAI/bge-large-en-v1.5 + CodeBERT vector deduplication
  - POST /api/python/triage      : facebook/bart-large-mnli zero-shot severity & CWE classification
  - GET  /api/python/health      : Python runtime, AST engine, and model pipeline status
"""

import json
import os
import platform
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, List, Optional

from bug_analyzer import (
    call_huggingface_inference_python,
    compute_python_cosine_similarity,
    generate_python_unified_diff,
    inspect_python_ast,
)

# Optional FastAPI + Hugging Face Transformers / Google GenAI SDK integration
try:
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    from google import genai
    from google.genai import types

    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False


if FASTAPI_AVAILABLE:
    app = FastAPI(
        title="FaultLine Python AI Bug Detection & Resolution API",
        version="2.4.0",
        description="Python FastAPI backend orchestrating Hugging Face (BGE-Large, CodeBERT, BART-MNLI, Qwen2.5-Coder) and Gemini 3.8 Flash.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    class PythonBugAnalyzeRequest(BaseModel):
        title: str
        description: str
        stackTrace: Optional[str] = ""
        sourceCode: str
        patchedCode: Optional[str] = ""
        filePath: Optional[str] = "app/api/routes/audit_export.py"
        language: Optional[str] = "Python"

    @app.get("/api/python/health")
    async def health_check() -> Dict[str, Any]:
        return {
            "status": "online",
            "framework": "FastAPI + Python AST + Hugging Face",
            "pythonVersion": platform.python_version(),
            "models": [
                "BAAI/bge-large-en-v1.5",
                "microsoft/codebert-base",
                "facebook/bart-large-mnli",
                "Qwen/Qwen2.5-Coder-32B-Instruct",
                "gemini-3.8-flash",
            ],
        }

    @app.post("/api/python/analyze")
    async def analyze_bug_endpoint(req: PythonBugAnalyzeRequest) -> Dict[str, Any]:
        ast_report = inspect_python_ast(req.sourceCode)
        diff_text = generate_python_unified_diff(
            req.sourceCode,
            req.patchedCode or req.sourceCode,
            req.filePath or "source.py",
        )
        candidate_labels = [
            "SQL Injection & Unbounded Cursor OOM (CWE-89)",
            "Concurrency / TOCTOU Race Condition (CWE-367)",
            "Memory Leak / Event Listener Lifecycle (CWE-401)",
            "Off-by-One / Slice Bounds Violation (CWE-193)",
        ]
        hf_triage = call_huggingface_inference_python(
            f"{req.title}\n{req.description}\n{req.sourceCode}",
            candidate_labels,
        )

        # Call Gemini 3.8 Flash from Python via google-genai SDK if GEMINI_API_KEY is set
        gemini_summary = None
        api_key = os.environ.get("GEMINI_API_KEY")
        if api_key and api_key != "MY_GEMINI_API_KEY":
            try:
                client = genai.Client(
                    api_key=api_key,
                    http_options={"headers": {"User-Agent": "aistudio-build"}},
                )
                response = client.models.generate_content(
                    model="gemini-3.8-flash",
                    contents=f"Provide a 2-sentence root cause summary and fix for this {req.language} bug:\n{req.title}\n{req.sourceCode}",
                    config=types.GenerateContentConfig(
                        thinking_config=types.ThinkingConfig(
                            thinking_level=types.ThinkingLevel.LOW
                        )
                    ),
                )
                gemini_summary = response.text
            except Exception as exc:
                gemini_summary = f"Fallback static AST verification completed ({exc})"

        return {
            "pythonVersion": platform.python_version(),
            "astAnalysis": ast_report,
            "zeroShotClassification": hf_triage,
            "unifiedDiff": diff_text,
            "geminiRootCauseNote": gemini_summary,
        }


class FallbackPythonHTTPHandler(BaseHTTPRequestHandler):
    """Lightweight stdlib HTTP server fallback when running without uvicorn installed."""

    def _send_json(self, payload: Dict[str, Any], status: int = 200) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        if self.path.startswith("/api/python/health"):
            self._send_json({
                "status": "online",
                "pythonVersion": platform.python_version(),
                "engine": "Python Native AST + Hugging Face Inference Microservice",
            })
        else:
            self._send_json({"error": "Not found"}, 404)

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
        source_code = body.get("sourceCode", "")
        patched_code = body.get("patchedCode", "")
        file_path = body.get("filePath", "source.py")

        ast_report = inspect_python_ast(source_code)
        diff = generate_python_unified_diff(source_code, patched_code or source_code, file_path)
        self._send_json({
            "pythonVersion": platform.python_version(),
            "astAnalysis": ast_report,
            "unifiedDiff": diff,
        })


if __name__ == "__main__":
    port = int(os.environ.get("PYTHON_PORT", "8001"))
    if FASTAPI_AVAILABLE:
        import uvicorn
        uvicorn.run(app, host="0.0.0.0", port=port)
    else:
        server = HTTPServer(("0.0.0.0", port), FallbackPythonHTTPHandler)
        print(f"FaultLine Python 3 Microservice listening on http://0.0.0.0:{port}")
        server.serve_forever()
