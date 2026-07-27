from __future__ import annotations

import re
from pathlib import Path

JWT = re.compile(r"eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")


def replace_exactly(path: Path, pattern: re.Pattern[str], replacement: str, expected: int) -> None:
    source = path.read_text()
    updated, count = pattern.subn(replacement, source)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} replacements, observed {count}")
    path.write_text(updated)


# Remove the embedded Lighthouse anon fallback from source and the checked-in
# server bundle. Runtime must receive the public anon key through environment.
for path in (Path("server/routers.ts"), Path("dist/index.js")):
    replace_exactly(
        path,
        re.compile(
            r"process\.env\.SUPABASE_ANON_KEY\s*\|\|\s*"
            r"process\.env\.VITE_SUPABASE_ANON_KEY\s*\|\|\s*"
            r"[\"']eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+[\"']"
        ),
        "process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY",
        1,
    )

# Preserve the antique standalone bundle without preserving an Atlas credential.
# The existing password field becomes user-supplied rather than repository-owned.
bundle_path = Path("bundle-src/luminari-intake-v2.html")
bundle = bundle_path.read_text()
bundle, token_count = JWT.subn("", bundle)
if token_count != 1:
    raise SystemExit(
        f"{bundle_path}: expected one embedded JWT replacement, observed {token_count}"
    )
bundle, field_count = re.subn(
    r'<input type="password" id="sync-supabase-key" value="" readonly>',
    '<input type="password" id="sync-supabase-key" value="" autocomplete="off" placeholder="Paste Atlas Supabase anon key">',
    bundle,
)
if field_count != 1:
    raise SystemExit(
        f"{bundle_path}: expected one sync key field update, observed {field_count}"
    )
bundle_path.write_text(bundle)

# Detect compact JWTs by syntax, not arbitrary long-segment assumptions.
audit_path = Path("scripts/audit-hardcoded-jwts.py")
audit = audit_path.read_text()
audit, regex_count = re.subn(
    r'JWT = re\.compile\(r"eyJ\[A-Za-z0-9_-\]\{20,\}\\\.\[A-Za-z0-9_-\]\{20,\}\\\.\[A-Za-z0-9_-\]\{20,\}"\)',
    'JWT = re.compile(r"eyJ[A-Za-z0-9_-]*\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+")',
    audit,
)
if regex_count != 1:
    raise SystemExit(f"{audit_path}: JWT regex marker did not match")
audit_path.write_text(audit)

# Strengthen the Render contract so every declaration is checked when multiple
# services reuse the same secret key.
workflow_path = Path(".github/workflows/pr-test.yml")
workflow = workflow_path.read_text()
old_render_block = '''          blocks = {}
          current_key = None
          for line in lines:
              match = re.match(r"\\s*- key: ([A-Z0-9_]+)\\s*$", line)
              if match:
                  current_key = match.group(1)
                  blocks[current_key] = []
              elif current_key is not None:
                  blocks[current_key].append(line.strip())

          failures = []
          for key in sorted(secret_keys):
              block = blocks.get(key)
              if block is None:
                  failures.append(f"missing deployment secret declaration: {key}")
                  continue
              if any(item.startswith("value:") for item in block):
                  failures.append(f"hard-coded deployment secret value: {key}")
              if "sync: false" not in block:
                  failures.append(f"deployment secret is not externally managed: {key}")
'''
new_render_block = '''          blocks = {}
          current_block = None
          for line in lines:
              match = re.match(r"\\s*- key: ([A-Z0-9_]+)\\s*$", line)
              if match:
                  key = match.group(1)
                  current_block = []
                  blocks.setdefault(key, []).append(current_block)
              elif current_block is not None:
                  current_block.append(line.strip())

          failures = []
          for key in sorted(secret_keys):
              key_blocks = blocks.get(key, [])
              if not key_blocks:
                  failures.append(f"missing deployment secret declaration: {key}")
                  continue
              for index, block in enumerate(key_blocks, start=1):
                  if any(item.startswith("value:") for item in block):
                      failures.append(
                          f"hard-coded deployment secret value: {key} occurrence {index}"
                      )
                  if "sync: false" not in block:
                      failures.append(
                          f"deployment secret is not externally managed: {key} occurrence {index}"
                      )
'''
if old_render_block not in workflow:
    raise SystemExit(f"{workflow_path}: Render audit block did not match")
workflow = workflow.replace(old_render_block, new_render_block, 1)
workflow = workflow.replace(
    '''      - name: Report hard-coded JWT credentials
        continue-on-error: true
        run: python3 scripts/audit-hardcoded-jwts.py
''',
    '''      - name: Reject hard-coded JWT credentials
        run: python3 scripts/audit-hardcoded-jwts.py
''',
    1,
)
if "continue-on-error: true\n        run: python3 scripts/audit-hardcoded-jwts.py" in workflow:
    raise SystemExit(f"{workflow_path}: JWT audit remains nonblocking")
workflow_path.write_text(workflow)

# Final repository-wide proof before the cleanup commit.
remaining: list[str] = []
for path in sorted(Path(".").rglob("*")):
    if not path.is_file() or ".git" in path.parts:
        continue
    try:
        text = path.read_text()
    except (UnicodeDecodeError, OSError):
        continue
    if JWT.search(text):
        remaining.append(str(path))

if remaining:
    raise SystemExit("JWT-shaped credentials remain: " + ", ".join(remaining))

print("Removed three hard-coded JWT credentials")
print("Strengthened Render secret audit for repeated declarations")
print("Made repository JWT audit blocking")
