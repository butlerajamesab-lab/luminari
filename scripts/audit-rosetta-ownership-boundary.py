"""Keep Rosetta implementation out of Lighthouse, including candidate packages."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OWNER_DIRECTORIES = {"rosetta-candidates", "rosetta-owner"}
OWNER_MODULE = re.compile(r"semantic-clause-.*\.(?:js|cjs|mjs|ts)$", re.IGNORECASE)
IDENTIFIER = r'"?[a-z_][a-z_0-9]*"?'
QUALIFIER = rf"(?:{IDENTIFIER}\s*\.\s*)?"
DECLARATION = (
    r"\bcreate\s+(?:or\s+replace\s+)?"
    r"(?:(?:(?:global|local)\s+)?(?:temp|temporary)\s+|unlogged\s+)?"
    r"(?:function|procedure|table|(?:materialized\s+)?view)\s+"
    r"(?:if\s+not\s+exists\s+)?"
)
OWNER_OBJECT = (
    r'"?(?:run_rosetta_[a-z_0-9]*|rosetta_[a-z_0-9]*|v_rosetta_[a-z_0-9]*'
    r'|hr1_raw_blocks|help_entity|workflow_pipeline|workflow_step'
    r'|accountability_route|escalation_node|entity_override|term_definition)\b"?'
)
OWNER_DDL = re.compile(DECLARATION + QUALIFIER + OWNER_OBJECT, re.IGNORECASE)
OWNER_SCHEMA = re.compile(
    r'\bcreate\s+schema\s+(?:if\s+not\s+exists\s+)?"?rosetta(?:_[a-z_0-9]+)?\b"?',
    re.IGNORECASE,
)


def ownership_violations(path: Path, content: str = "") -> list[str]:
    """Inspect one repository-relative path without requiring a git checkout."""
    violations = []
    if OWNER_DIRECTORIES.intersection(part.lower() for part in path.parts):
        violations.append("rosetta_owner_package")
    if OWNER_MODULE.fullmatch(path.name):
        violations.append("rosetta_semantic_implementation")
    if path.suffix.lower() == ".sql":
        # Retirement markers document historical ownership without defining it.
        executable = re.sub(r"/\*.*?\*/|--[^\n]*", "", content, flags=re.DOTALL)
        if OWNER_DDL.search(executable):
            violations.append("rosetta_owner_ddl")
        if OWNER_SCHEMA.search(executable):
            violations.append("rosetta_owner_schema")
    return violations


def audit_repository(root: Path) -> list[str]:
    # A candidate or generator package is ownership, even outside migrations.
    result = subprocess.run(
        ["git", "ls-files", "-z"], cwd=root, check=True, capture_output=True,
    )
    paths = [Path(name) for name in result.stdout.decode().split("\0") if name]
    violations = []
    for path in sorted(paths):
        content = (root / path).read_text(encoding="utf-8") if path.suffix.lower() == ".sql" else ""
        violations.extend(f"{path.as_posix()}:{label}" for label in ownership_violations(path, content))
    return violations


def main() -> None:
    violations = audit_repository(ROOT)
    print(f"ROSETTA_OWNERSHIP_VIOLATION_COUNT={len(violations)}")
    for violation in violations:
        print(f"ROSETTA_OWNERSHIP_VIOLATION={violation}")
    if violations:
        raise SystemExit(1)
    print("ROSETTA_OWNERSHIP_BOUNDARY=PASS")


if __name__ == "__main__":
    main()
