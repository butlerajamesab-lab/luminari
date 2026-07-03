# Luminari Pass 3 Registry Source Documents — Upload Instructions

Target repo: `butlerajamesab-lab/luminari`

Canonical source-doc folder:

```text
data/luminari/pass3_registries/source_docs/
```

## What belongs here

Upload the 20 canonical Pass 3 registry `.docx` files into:

```text
data/luminari/pass3_registries/source_docs/
```

Do not upload screenshots as registry sources. Screenshots are only evidence/correction aids.

## If using the ZIP from ChatGPT

The ZIP is named:

```text
luminari_pass3_registries_source_docs.zip
```

Best path:

1. Download the ZIP.
2. Unzip it.
3. Upload the extracted DOCX files into:

```text
data/luminari/pass3_registries/source_docs/
```

Fallback path:

Upload the ZIP itself here:

```text
data/luminari/pass3_registries/luminari_pass3_registries_source_docs.zip
```

If only the ZIP is committed, Codex must unzip it before extraction.

## Canonical rule

The repo files are the source corpus. Do not rely on ChatGPT attachments.

For duplicate states, newest uploaded registry wins for the same `registry_id`.

Do not merge duplicate documents. Do not summarize. Preserve all source text as recoverable `raw_text`.

## Codex instruction

Use this exact source path:

```text
data/luminari/pass3_registries/source_docs/
```

Build deterministic extraction and Lighthouse Supabase loading from the DOCX files in that folder.