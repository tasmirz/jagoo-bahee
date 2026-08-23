# NSysS 2026 submission

`main.tex` is the anonymous ACM `sigconf` source. The checked deliverable is
`output/pdf/nsyss2026-paper.pdf`: **6 pages**, with no unresolved references or citations.

## Build

```bash
latexmk -pdf main.tex
bash check-submission.sh output/pdf/nsyss2026-paper.pdf
```

A complete TeX Live or MiKTeX installation is recommended. The repository includes the conference's
`acmart.cls` and `ACM-Reference-Format.bst`.

## Submission checks

- Keep `anonymous` in `\documentclass` and do not add acknowledgements, author affiliations, the
  project name, or a repository URL to the review copy.
- NSysS requires **6--8 pages including references**. Do not rely on the older draft's nine-page
  interpretation; the publishability review is authoritative for this version.
- Keep the neutral title and the phrase **partition tolerant under surviving IP paths**. The evidence
  does not support a blanket censorship-resistance or total-blackout claim.
- Report signed receipts as evidence of acknowledged acceptance, not prevention of refusal or
  admission censorship.
- Treat growing transparency-log heads as pending until a consistency proof is implemented.
- Lead the ActivityPub comparison with the gzip-aware 4.4--6.9× range; the 19.5--25.9× raw range is
  secondary and caveated.

## Evidence used in the paper

| Claim | Repository evidence |
| --- | --- |
| TypeScript, Rust, and Python agree on 16 canonical vectors | `pnpm vectors` |
| 85 focused tests: 29 ingress, 3 outbox, 31 federation, 22 ISP | focused backend Vitest suites |
| 8-node chain, 200/200 at hop 7; p50 4.125 s, p99 6.115 s | scale harness and preserved measurements |
| route-cut gate 19/19; certificate/community/post in 0.5/1.2/2.1 s | `ops/isp-compose.yml` and gate output |
| old 407.6 s post path reduced to 2.1 s | serial versus per-peer concurrent drain records |
| malformed run 730 requests/s and zero invalid-object writes | 3,000-request ingress run |
| 90% rate-limited; about 9% reached signature verification | rejection-class counters from that run |
| ActivityPub comparison over 80 activities | measured ActivityPub baseline |

The first two gates were rerun for this revision. The Docker deployment numbers are preserved results;
the paper explicitly notes the lack of repeated-run distributions and confidence intervals.

## Scope boundaries

- The four-node deployment is a virtual topology on one physical host, not a field shutdown or WAN
  experiment.
- A bridge is a visible, explicitly trusted, validating server. It is neither a covert transport nor
  a defense against operator coercion, DPI whitelisting, traffic analysis, eclipse, or a total outage.
- Origin admission pricing protects the local origin. A malicious origin can omit its own price, so
  receivers rely on peer and traffic-class quotas.
- The invalid-envelope run demonstrates admission ordering and zero invalid-object write
  amplification; it does not demonstrate denial-of-service resistance.
- Quantitative results from encounter, voice-channel, trace-driven, and server-federated systems use
  different substrates and denominators. Table 2 is context, not a performance leaderboard.

## Primary working documents

- `../NSYSS-2026-PUBLISHABILITY-REVIEW.md`
- `../ieee paper/deep-research-report.md`
- `../related-papers/literature_review.md`
- `../related-papers/comparison.md`
