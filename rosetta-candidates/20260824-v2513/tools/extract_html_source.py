#!/usr/bin/env python3
"""Deterministically extract legislative text from HTML before Rosetta parses it.

The extractor fails closed unless it finds exactly one semantic legal-text
container (or an explicit --container-token is supplied).  It never falls back
to whole-page text.

Usage:
  python tools/extract_html_source.py INPUT.html OUTPUT.txt RECEIPT.json \
    [--charset utf-8] [--container-token bill-text]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path


LEGAL_TOKENS = {
    "billtext", "bill-text", "bill_text", "legislation-text", "legislation_text",
    "document-text", "document_text", "statute-text", "amendment-text", "law-text",
}
DROP_TAGS = {"script", "style", "nav", "header", "footer", "form", "svg", "noscript", "aside"}
DROP_ROLES = {"navigation", "banner", "contentinfo", "search", "complementary"}
DROP_TOKENS = {
    "actions", "bill-actions", "action-history", "history", "calendar", "votes",
    "vote-history", "navigation", "nav", "breadcrumb", "share", "print", "footer",
    "header", "sidebar", "menu", "toolbar", "social",
}
BLOCK_TAGS = {"p", "div", "section", "article", "main", "li", "tr", "br", "h1", "h2", "h3", "h4"}
RESIDUE = re.compile(
    r"(?i)<\s*(?:html|body|nav|script|style|a)\b|"
    r"&(?:nbsp|amp|quot|apos|lt|gt|#x?[0-9a-f]+);|"
    r"\b(?:go to top|skip to main content|actions:\s*bill no|print this bill|share this page)\b"
)


@dataclass
class Node:
    tag: str
    attrs: dict[str, str]
    parent: "Node | None" = None
    children: list["Node | str"] = field(default_factory=list)

    @property
    def tokens(self) -> set[str]:
        values = f"{self.attrs.get('id','')} {self.attrs.get('class','')}".lower()
        return {token for token in re.split(r"[^a-z0-9_-]+", values) if token}


class TreeParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("document", {})
        self.stack = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(tag.lower(), {k.lower(): v or "" for k, v in attrs}, self.stack[-1])
        self.stack[-1].children.append(node)
        if tag.lower() not in {"br", "hr", "img", "meta", "link", "input"}:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if self.stack[-1].tag == tag.lower():
            self.stack.pop()

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data: str) -> None:
        if data:
            self.stack[-1].children.append(data)


def walk(node: Node):
    yield node
    for child in node.children:
        if isinstance(child, Node):
            yield from walk(child)


def has_ancestor(node: Node, candidates: set[int]) -> bool:
    parent = node.parent
    while parent is not None:
        if id(parent) in candidates:
            return True
        parent = parent.parent
    return False


def select_container(root: Node, token: str | None) -> Node:
    nodes = list(walk(root))
    if token:
        wanted = token.lower()
        candidates = [n for n in nodes if wanted in n.tokens or n.attrs.get("id", "").lower() == wanted]
    else:
        strong = [n for n in nodes if n.tokens & LEGAL_TOKENS]
        candidates = strong if strong else [n for n in nodes if n.tag in {"main", "article"}]
    ids = {id(n) for n in candidates}
    candidates = [n for n in candidates if not has_ancestor(n, ids)]
    if len(candidates) != 1:
        raise ValueError(
            f"legal-text-container-unresolved: expected exactly one, found {len(candidates)}; "
            "supply --container-token for a verified container"
        )
    return candidates[0]


def excluded(node: Node) -> str | None:
    if node.tag in DROP_TAGS:
        return f"tag:{node.tag}"
    if node.attrs.get("role", "").lower() in DROP_ROLES:
        return f"role:{node.attrs['role'].lower()}"
    hit = node.tokens & DROP_TOKENS
    return f"token:{sorted(hit)[0]}" if hit else None


def extract(node: Node, removed: dict[str, int], out: list[str]) -> None:
    reason = excluded(node)
    if reason:
        removed[reason] = removed.get(reason, 0) + 1
        return
    if node.tag in BLOCK_TAGS:
        out.append("\n")
    for child in node.children:
        if isinstance(child, str):
            out.append(child)
        else:
            extract(child, removed, out)
    if node.tag in BLOCK_TAGS:
        out.append("\n")


def normalize_layout(parts: list[str]) -> str:
    text = "".join(parts).replace("\u00a0", " ")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line).strip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("receipt", type=Path)
    parser.add_argument("--charset", default="utf-8")
    parser.add_argument("--container-token")
    args = parser.parse_args()

    raw = args.input.read_bytes()
    decoded = raw.decode(args.charset, errors="strict")
    tree = TreeParser()
    tree.feed(decoded)
    container = select_container(tree.root, args.container_token)
    removed: dict[str, int] = {}
    parts: list[str] = []
    extract(container, removed, parts)
    text = normalize_layout(parts)
    if len(text) < 200:
        raise ValueError("extracted legal text is shorter than 200 characters")
    if RESIDUE.search(text):
        raise ValueError("extracted legal text retains markup, entity, navigation, action, or vote residue")
    encoded = text.encode("utf-8")
    receipt = {
        "contract": "rosetta-html-content-extraction-v1",
        "extractor_version": "stdlib-semantic-container-1.0.0",
        "source_charset": args.charset.lower(),
        "decoding_method": "strict",
        "invalid_byte_handling": "reject",
        "raw_source_sha256": hashlib.sha256(raw).hexdigest(),
        "extracted_text_sha256": hashlib.sha256(encoded).hexdigest(),
        "navigation_removed": True,
        "action_tables_removed": True,
        "vote_chrome_removed": True,
        "legal_container": {"tag": container.tag, "id": container.attrs.get("id"),
                            "class": container.attrs.get("class")},
        "removed_node_counts": dict(sorted(removed.items())),
        "replacement_char_count": text.count("\ufffd"),
        "replacement_chars_block_span_certainty": "\ufffd" in text,
    }
    args.output.write_bytes(encoded)
    args.receipt.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
