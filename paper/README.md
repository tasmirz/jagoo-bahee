# NSysS 2026 submission

`main.tex` — full paper, ACM `sigconf`, **double-blind**.

## Build

```bash
latexmk -pdf main.tex      # produces main.pdf
latexmk -C                 # clean
```

Requires `acmart` (TeX Live / MiKTeX ship it). Current output: **9 pages**, 0 unresolved
references, 0 unresolved citations.

## Before submitting — check these, they are desk-reject risks

- [ ] **`anonymous` stays in `\documentclass`.** It is what suppresses author identity. Do not
      remove it to "see how it looks" and forget to put it back.
- [ ] **No system name, no repository URL, no acknowledgements anywhere.** The paper never names the
      artefact; keep it that way. There is deliberately no `\acks` block.
- [ ] **Cite venue-adjacent work in the third person.** Two of the most closely related papers are
      co-authored by the NSysS 2026 general contact — cite them, and cite them as strangers.
- [ ] **Page limit is 9.** The CFP page says 6–8; the Author Instructions say 9, and 14 of 35
      accepted papers in the last two editions exceed 8. Nine is operative, and the draft is at it.
- [ ] **Rewrite the prose in your own voice before submitting.** The Author Instructions state
      submissions are screened with a plagiarism checker *and* an AI detector. Treat this draft as a
      complete, factually-checked skeleton — every number in it is measured and every citation is
      verified — but not as final copy.

## Where the numbers come from

Every quantitative claim traces to something reproducible in the repository. Nothing here is
estimated or carried over from an earlier draft.

| Claim in the paper | Source |
| --- | --- |
| 3 implementations agree on 16 canonical vectors | `pnpm vectors` |
| 8-node chain, 200 samples, 7 hops p50 4125 ms | `pnpm scale:gen 8 && scale:up && scale:measure` |
| per-hop residual 71–89 ms across a 4× drain change | same, two drain settings |
| burst regime: hop-1 p50 10 s, p95 173 s | same, unpaced — **never average with the paced run** |
| bridged crossing 0.5 / 1.2 / 2.1 s after the cut | `ops/isp-compose.yml` + `crossing` measurement |
| partition gate 19/19 | `pnpm ops:isp && pnpm gate:isp` |
| invalid flood 730 req/s with zero writes | adversarial envelope flood at concurrency 16 |
| read path 228 / 750 / 688 req/s | keep-alive client, single process |
| RSS 62 MiB idle, 233 MiB under bulk crossing | `docker stats` during TG-05 |
| wire sizes 155 / 220 / 243 B | `tools/vectors/expected.json` + 64 B Ed25519 |
| ActivityPub n=80, overhead p50 4015 B, context 927 B | `pnpm ap:baseline` |
| capability matrix cells | `Code Implementation/NSYSS-2026-CAPABILITY-MATRIX-SOURCES.md` |

## Two things the paper deliberately does not claim

- **No mesh, radio or off-grid claim.** Reticulum and phone-to-phone mesh are outside the project and
  paper. The reachability ladder ends at L3: ISP islands joined by a multi-homed IP bridge.
- **No novelty for the mechanisms.** Signed content at rest, tree-head gossip, issuance/verification
  separation and narrowest-path preference are all prior art and are cited as such in the sentence
  that introduces each. The claim is the composition and its measured cost.

## Related working documents

- `Code Implementation/NSYSS-2026-PAPER-PLAN.md` — outline, budget, claim-to-evidence table
- `Code Implementation/NSYSS-2026-PAPER-S5-ADVERSARY-AND-SCOPE.md` — §5 content spec
- `Code Implementation/NSYSS-2026-PAPER-S7-CAPABILITY-MATRIX.md` — §7 cells and footnotes
- `Code Implementation/NSYSS-2026-CAPABILITY-MATRIX-SOURCES.md` — verbatim primary sources
- `Code Implementation/NSYSS-2026-CENSORSHIP-RESISTANCE-SOURCES.md` — literature and claim audit
- `Code Implementation/NSYSS-2026-THREAT-MODEL-AUDIT.md` — technical and sociological threat audit

## Figures and presentation

- `figures-draft.tex` / `figures-draft.pdf` — twelve large-format figure drafts, including the ALS
  workflow as Figure L
- `Islands-of-Reach-Presentation.pptx` — editable 15-slide presentation
- `Islands-of-Reach-Presentation.pdf` — rendered presentation handout
- `build_presentation.py` — reproducible presentation source
