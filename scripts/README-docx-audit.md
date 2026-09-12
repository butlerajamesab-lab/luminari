# DOCX corpus audit and sourced repairs

Some corpus documents contain plain `Website` labels with no hyperlink, copied
jurisdiction tables that disagree with their headings, and conflicting legal
deadline guidance. Filename suffixes also mix duplicate copies with distinct
generations. These tools retain source bytes and provenance while preparing
narrow, reviewable repairs.

They do not delete remote files, update ingestion records, certify legal content,
or publish corrected documents. The existing application and deployment remain
unchanged. Keep corpus files, private audit manifests and source evidence outside
the repository.

## Requirements

Python 3 with `lxml`; regression fixtures additionally require `python-docx`.
Use a managed runtime with those dependencies or an isolated environment.

## Audit downloaded files

Each receipt is a JSON object with `status: "downloaded"`, `local_path`, and the
full-file `sha256`. Other fields identify the source object, bucket, revision or
Drive file. A receipt file contains an array of these objects.

```sh
python scripts/audit_docx_corpus.py --receipts receipts.json --out audit
python scripts/plan_docx_link_repairs.py --audit audit --out link-plan.json
python scripts/restore_docx_source_links.py --plan link-plan.json --out candidates
```

The audit recursively inspects ZIP/tar archives and Office embedded files. It
retains every occurrence and package hash. Complete byte equality confirms an
exact duplicate; text and package-part similarities do not authorize deletion.
Unreadable files and depth/size inspection limits appear as explicit errors.

The scanner distinguishes a visible `Website` hyperlink label from a missing
link. It also records placeholder candidates, unresolved contact instructions,
selected jurisdiction-heading mismatches, jurisdiction coverage, resource-ID
duplicates and resource/metadata count inconsistencies. Token matches in examples
and instructions need manual disposition. Passing the scanner is not proof that
an agency, phone number, statute or deadline is correct or current.

## Repair contracts

Hyperlink restoration requires an unambiguous donor with identical table headers,
column position and complete row values. Application rechecks both file hashes,
the complete row and the donor URL. It preserves visible text, resource identities
and unrelated package parts. Restoring a historical URL does not verify the URL's
current destination or the row's substantive accuracy.

`repair_docx_jurisdiction_table.py` consumes an explicit plan containing the source
hash, table XPath and XML hash, exact old headers/row count, replacement rows with
source URLs, optional hyperlinks and exact paragraph changes. It preserves
resource cards, metadata and unrelated package parts. Optional column widths must
match the existing 9360-twip table width. This helper is intended for the audited
dossier format, not arbitrary document layouts.

`repair_docx_text.py` consumes a plan with the source hash and exact paragraph
XPath, before/after text and source URL for each correction. Optional hyperlinks
must use HTTPS. It checks that unrelated XML, resource IDs, table row counts and
other package parts remain unchanged. Changed paragraphs preserve paragraph
properties and the first run's styling; review mixed-format paragraphs before use.

```sh
python scripts/repair_docx_jurisdiction_table.py --plan table-plan.json --out candidate.docx
python scripts/repair_docx_text.py --plan text-plan.json --out candidate.docx
python -m unittest discover -s scripts -p 'test_*docx*.py' -v
```

The nine regression tests exercise wrong-generation rejection, stale or mismatched
targets, missing evidence, duplicate edit locations, wrong-agency donors,
unproven URLs and preservation of unrelated content.

## Publication and deletion gates

Render each final candidate and inspect every page before publication. Review
remaining factual and routing findings; do not promote verification flags because
a package or hash check passed. Retain the original version and map its full hash
to the repaired version and evidence plan.

Before remote deduplication, recheck source versions, retain a recoverable keeper,
and resolve references to the removed object. Identical bytes can still have
different case associations or required historical URLs. Do not delete a whole
archive merely because some members are duplicates. Respect provider access
restrictions and any action-specific confirmation required by approval review.
