from pathlib import Path

path = Path("server/routers/governance-router.ts")
text = path.read_text()
old = '''    return {
      ...verification,
      total_entries: countResult.count,
      last_entry_at: latestEntry?.createdAt ?? null,
      last_seq_no: latestEntry?.seqNo ?? 0,
    };'''
new = '''    const lastSeqNo = latestEntry?.seqNo ?? verification.lastValidSeqNo ?? 0;
    const lastEntryAt = latestEntry?.createdAt ?? null;

    return {
      ...verification,
      lastSeqNo,
      lastEntryAt,
      total_entries: countResult.count,
      last_entry_at: lastEntryAt,
      last_seq_no: lastSeqNo,
    };'''
if text.count(old) != 1:
    raise RuntimeError(f"Expected one dashboard chain status block, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))
print("Governance chain status response aligned")
