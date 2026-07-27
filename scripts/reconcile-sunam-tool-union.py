from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1))


executor = Path("server/engines/sunam-executor.ts")
replace_once(
    executor,
    'import { dispatchServiceTool } from "./sunam-service-dispatcher";\nimport { assert_safe_public_table_name, resolve_direct_sunam_instruction } from "./sunam-runtime-contract";',
    'import { dispatchServiceTool } from "./sunam-service-dispatcher";\nimport { SUNAM_SERVICE_ONLY_TOOLS } from "./sunam-service-only-tools";\nimport { assert_safe_public_table_name, resolve_direct_sunam_instruction } from "./sunam-runtime-contract";',
)
replace_once(
    executor,
    'export const SUNAM_TOOLS = [',
    'export const SUNAM_OPERATOR_TOOLS = [',
)
replace_once(
    executor,
    '''];\n\nconst SUNAM_TOOL_NAMES = new Set(\n  SUNAM_TOOLS.map((tool) => tool.function.name),\n);''',
    '''];\n\nconst SUNAM_OPERATOR_TOOL_NAMES = new Set(\n  SUNAM_OPERATOR_TOOLS.map((tool) => tool.function.name),\n);\n\n/**\n * One canonical, additive tool registry. Operational control tools remain\n * available alongside Lighthouse's case-service tools. Duplicate names (the\n * shared system-state surface) resolve to the operational contract.\n */\nexport const SUNAM_TOOLS = [\n  ...SUNAM_OPERATOR_TOOLS,\n  ...SUNAM_SERVICE_ONLY_TOOLS.filter(\n    (tool) => !SUNAM_OPERATOR_TOOL_NAMES.has(tool.function.name),\n  ),\n];\n\nconst SUNAM_TOOL_NAMES = new Set(\n  SUNAM_TOOLS.map((tool) => tool.function.name),\n);''',
)

source_test = Path("server/engines/sunam-operator-source-contract.test.ts")
replace_once(
    source_test,
    '''    expect(executor).toContain("tools: SUNAM_TOOLS");\n    expect(executor).toContain("SUNAM_TOOLS.map");\n    expect(executor).toContain("SUNAM_TOOL_NAMES.has(toolName)");\n    expect(executor).not.toContain("SUNAM_SERVICE_ONLY_TOOLS");\n    expect(executor).not.toContain("sunam-service-only-tools");''',
    '''    expect(executor).toContain("tools: SUNAM_TOOLS");\n    expect(executor).toContain("SUNAM_TOOLS.map");\n    expect(executor).toContain("SUNAM_TOOL_NAMES.has(toolName)");\n    expect(executor).toContain("SUNAM_OPERATOR_TOOLS");\n    expect(executor).toContain("SUNAM_SERVICE_ONLY_TOOLS.filter");\n    expect(executor).toContain("!SUNAM_OPERATOR_TOOL_NAMES.has(tool.function.name)");''',
)

# Add a source-level invariant that the canonical union is additive and deduped.
replace_once(
    source_test,
    '''  it("routes standard operator actions deterministically", () => {''',
    '''  it("preserves operational and case-service capabilities in one deduplicated registry", () => {\n    expect(executor).toContain("...SUNAM_OPERATOR_TOOLS");\n    expect(executor).toContain("...SUNAM_SERVICE_ONLY_TOOLS.filter");\n    expect(executor).toContain("Duplicate names (the");\n  });\n\n  it("routes standard operator actions deterministically", () => {''',
)

print("Sunam additive tool-union reconciliation applied")
