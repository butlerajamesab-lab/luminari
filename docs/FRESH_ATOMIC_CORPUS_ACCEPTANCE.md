# Fresh Atomic Corpus Acceptance Gate

The pass is accepted only when:

- all non-duplicate authoritative Storage artifacts are either completed or have an explicit failed receipt;
- the two large SQL handoff files produce source-bound row records if they contain row-bearing `COPY`/`INSERT VALUES` material;
- the registry ZIP is inspected member-by-member rather than counted as one file;
- large DOCX/XLSX sources expose table/row/paragraph records instead of a handful of semantic blocks;
- every row is backed by a current Storage-byte SHA-256 and parser version;
- atomic record count and origin count are reported separately;
- no SQL artifact is executed;
- no atomic row is silently promoted to a resource, statute, signal, finding, or other canonical object;
- historical 53k/56k resource-stage populations are used only as a coverage oracle until current Storage bytes reproduce/explain the gap.
