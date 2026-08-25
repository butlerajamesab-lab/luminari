"""Control fidelity proof: every ctl_ function emitted into migration 03,
reverse-renamed back to public.*, must be byte-identical (md5) to the
captured live 2.5.11 body in evidence/live-functions/. Rewrites
evidence/CONTROL_FIDELITY.txt. Exits nonzero on any mismatch."""
import hashlib, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import generate as g

mig = open(os.path.join(ROOT, "migrations", "03_control_closure_2511.sql")).read()

# extract each generated ctl_ function DDL (body may span many lines; the
# delimiter $function$ appears exactly twice per function)
pat = re.compile(
    r"CREATE OR REPLACE FUNCTION rosetta_v2513\.ctl_([a-z0-9_]+)\((.*?)\$function\$;",  # name, through end
    re.S | re.I)
# safer: split on CREATE boundaries
chunks = re.split(r"(?=CREATE OR REPLACE FUNCTION rosetta_v2513\.ctl_)", mig, flags=re.I)
generated = {}
for ch in chunks:
    m = re.match(r"CREATE OR REPLACE FUNCTION rosetta_v2513\.ctl_([a-z0-9_]+)\(", ch, re.I)
    if not m:
        continue
    end = ch.find("$function$;")
    body = ch[:end + len("$function$;")]
    generated[m.group(1)] = body

lines = ["Control fidelity evidence: per-function md5 of live evidence body vs "
         "reverse-renamed generated control body.", ""]
results = []
live_dir = os.path.join(ROOT, "evidence", "live-functions")
for fn in sorted(os.listdir(live_dir)):
    if not fn.endswith(".sql"):
        continue
    live = open(os.path.join(live_dir, fn)).read()
    name = fn.split("__")[0]
    gen = generated.get(name)
    if gen is None:
        results.append(("MISSING", None, fn))
        continue
    rev = g.reverse_control(gen, g.CONTROL_PREFIX).strip()
    # the live capture stores the bare function body terminator ($function$);
    # the migration appends the statement semicolon. Normalize it away.
    if rev.endswith("$function$;"):
        rev = rev[:-1]
    lm = hashlib.md5(live.strip().encode()).hexdigest()
    rm = hashlib.md5(rev.encode()).hexdigest()
    results.append(("MATCH" if lm == rm else "MISMATCH", lm, fn))

for status, h, fn in results:
    lines.append(f"{status.ljust(8)} {h or '-'}  {fn}")
n_ok = sum(1 for r in results if r[0] == "MATCH")
lines.append("")
lines.append(f"total functions: {len(results)}; mismatches: {len(results) - n_ok}")
open(os.path.join(ROOT, "evidence", "CONTROL_FIDELITY.txt"), "w").write("\n".join(lines) + "\n")
print(lines[-1])
sys.exit(0 if n_ok == len(results) and results else 1)
