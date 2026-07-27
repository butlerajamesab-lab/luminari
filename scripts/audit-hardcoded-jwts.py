from __future__ import annotations

import base64
import json
import re
import subprocess
from pathlib import Path

JWT = re.compile(r"eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")


def decode_segment(segment: str) -> dict[str, object]:
    padding = "=" * (-len(segment) % 4)
    try:
        return json.loads(base64.urlsafe_b64decode(segment + padding))
    except Exception:
        return {}


tracked = subprocess.check_output(
    ["git", "ls-files", "-z"],
    text=False,
).split(b"\0")

findings: list[str] = []
for raw_path in tracked:
    if not raw_path:
        continue
    path = Path(raw_path.decode())
    if not path.is_file():
        continue
    try:
        text = path.read_text()
    except (UnicodeDecodeError, OSError):
        continue

    for line_number, line in enumerate(text.splitlines(), start=1):
        for match in JWT.finditer(line):
            token = match.group(0)
            payload = decode_segment(token.split(".")[1])
            role = payload.get("role", "unknown")
            ref = payload.get("ref", "unknown")
            redacted = JWT.sub("[REDACTED_JWT]", line).strip()
            findings.append(
                f"{path}:{line_number}: role={role} ref={ref} context={redacted[:300]}"
            )

if findings:
    print("Hard-coded JWT-shaped credentials found:")
    for finding in findings:
        print(finding)
    raise SystemExit(1)

print("No hard-coded JWT-shaped credentials found")
