#!/usr/bin/env bash
# Pre-submission gate for a double-blind NSysS submission.
#
# This exists because the `anonymous` option was silently dropped from \documentclass once
# during drafting, and the very next build put three author names and an institution on
# page 1. Nothing failed, nothing warned, and the PDF looked finished. Anonymity is a
# desk-reject criterion, so it gets a check that fails loudly rather than a habit of
# remembering.
#
#   ./check-submission.sh            # checks paper/main.pdf
#
# Exit non-zero on any violation. Run it immediately before uploading.

set -uo pipefail
cd "$(dirname "$0")"

PDF=${1:-main.pdf}
TEX=main.tex
FAIL=0

say()  { printf '  %-46s %s\n' "$1" "$2"; }
bad()  { say "$1" "FAIL — $2"; FAIL=1; }
good() { say "$1" "ok"; }

# Anything that identifies the authors. Extend this list, do not shorten it.
IDENTITY='zihad|siddiqui|rezuan|tasmir|sarwad|mustafa|khulna|kuet|jagoo|bahee'

echo "Pre-submission checks — $PDF"

# 1. The class option that does the anonymising.
if grep -q 'documentclass\[[^]]*anonymous' "$TEX"; then
  good "\\documentclass carries 'anonymous'"
else
  bad "\\documentclass carries 'anonymous'" "add it, or the byline renders"
fi

if [ ! -f "$PDF" ]; then
  bad "$PDF exists" "build it first: latexmk -pdf main.tex"
  echo; echo "RESULT: FAIL"; exit 1
fi

# 2. Rendered text must not name anyone. This is the check that actually matters —
#    the class option is only the mechanism.
HITS=$(pdftotext "$PDF" - 2>/dev/null | grep -icE "$IDENTITY" || true)
if [ "$HITS" = "0" ]; then
  good "no identity strings in rendered text"
else
  bad "no identity strings in rendered text" "$HITS match(es) — run: pdftotext $PDF - | grep -inE '$IDENTITY'"
fi

# 3. PDF metadata carries author names even when the page does not.
META=$(pdfinfo "$PDF" 2>/dev/null | grep -icE "^Author: *[^ ]|$IDENTITY" || true)
if [ "$META" = "0" ]; then
  good "no identifying PDF metadata"
else
  bad "no identifying PDF metadata" "check: pdfinfo $PDF"
fi

# 4. Page limit: the CFP says 6 to 8 inclusive of everything.
PAGES=$(pdfinfo "$PDF" 2>/dev/null | awk '/^Pages/{print $2}')
if [ -n "$PAGES" ] && [ "$PAGES" -ge 6 ] && [ "$PAGES" -le 8 ]; then
  good "page count within 6-8 (is $PAGES)"
else
  bad "page count within 6-8" "is ${PAGES:-unknown}"
fi

# 5. A build that still has unresolved references ships '?' marks into the PDF.
if [ -f main.log ]; then
  UNDEF=$(grep -cE 'LaTeX Warning.*(undefined|Citation)' main.log || true)
  [ "$UNDEF" = "0" ] && good "no undefined refs or citations" \
                     || bad "no undefined refs or citations" "$UNDEF warning(s) in main.log"
  ERRS=$(grep -cE '^! ' main.log || true)
  [ "$ERRS" = "0" ] && good "no LaTeX errors" || bad "no LaTeX errors" "$ERRS in main.log"
fi

# 6. Self-citation is the other way identity leaks in a double-blind submission.
SELF=$(grep -icE "$IDENTITY" references.bib || true)
if [ "$SELF" = "0" ]; then
  good "no identifying entries in references.bib"
else
  bad "no identifying entries in references.bib" "$SELF match(es)"
fi

echo
if [ "$FAIL" = "0" ]; then
  echo "RESULT: PASS — safe to upload"
else
  echo "RESULT: FAIL — do not upload"
fi
exit $FAIL
