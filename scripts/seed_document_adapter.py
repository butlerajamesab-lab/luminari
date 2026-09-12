"""Use the same DOCX parser as the running ingestion worker; no parallel Python XML dialect."""
import json
from pathlib import Path
import subprocess


def parse_document_source(name, raw):
    bridge = Path(__file__).with_name('parse-corpus-source.mjs')
    completed = subprocess.run(['node', str(bridge), name], input=raw, capture_output=True, timeout=180, check=False)
    if completed.returncode:
        raise ValueError('shared source parser failed: ' + completed.stderr.decode('utf-8', errors='replace')[-2000:])
    return json.loads(completed.stdout)
