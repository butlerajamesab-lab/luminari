#!/usr/bin/env bash
# run_all.sh — build the disposable validation environment from scratch and run
# every migration and test in order. Requires: pgserver (embedded PostgreSQL),
# python3. Never connects to any external database.
set -euo pipefail
cd "$(dirname "$0")"
python3 run_all.py
