# Response to Reviewers

**ICCIT 2026, Paper 2056**  
**Islands of Reach: A Censorship-Resistant Federated Forum for National Internet Blackouts**

We thank the reviewers for their constructive feedback. We revised the manuscript to clarify the testbed scope, report repeated measurements and network impairment results, describe the system’s accountability limits, and improve the figures and prose. Responses below refer to the recommended revised manuscript.

## Reviewer 1

### 1. Multi-host validation

**Comment.** The experiments use Docker on one physical host. The architecture has not been tested across independent machines, routers, and network connections.

**Response.** All nodes in this evaluation shared one physical host. We have limited the claims and conclusions to that testbed and identified multi-host deployment as future work. An evaluation across independent machines and routers would also require measuring clock skew before comparing insertion timestamps (Sections IV and VI–VII).

### 2. Repeated measurements and statistical reporting

**Comment.** The reported route-cut latencies came from single runs. Report repeated trials, latency distributions, variability, confidence intervals, and delivery success rates.

**Response.** We published 20 fresh certificate–community–post chains with the exchange intact, then withdrew the direct path once and published 20 more on the same stack. All 40 chains reached their destination. Median post latency was 0.735 s with the exchange intact and 1.732 s via the bridge after the cut. The corresponding 95% bootstrap intervals were 0.507–0.913 s and 1.482–1.841 s. We also report IQRs and sample standard deviations. These measurements repeat publications within each route regime, rather than independent host deployments or repeated route withdrawals (Sections IV and V-A, Figure 5).

### 3. Network impairments

**Comment.** The evaluation should include controlled packet loss, delay, intermittent connectivity, bandwidth limits, and varying network paths.

**Response.** We report six bridge-path conditions: an unshaped control and five impairment conditions. All ten posts arrived in each. The tests include added egress delay with variation, packet loss, a 128 kbit/s bandwidth cap, and scheduled link outages. In the outage test, all ten posts were submitted during the initial period of full loss. The harness waited eight seconds after the batch finished before restoring the link, then ran two further loss-and-recovery cycles. Median latency for the initially queued posts was 18.595 s. These tests use a fixed bridge path and do not evaluate path diversity (Sections IV and V-A, Figure 5).

### 4. End-to-end comparison with ActivityPub

**Comment.** Compare delivery latency, reliability, and resource use against a federated or store-and-forward baseline under equivalent network conditions.

**Response.** On a link shaped to 128 kbit/s, 5% loss, and 75 ms added delay per direction, both systems delivered 20/20 posts. Jagoo Bahee’s 521 ms median runs from source database insertion to destination database insertion. The minimal inbox’s 155 ms median runs from the start of its sender delivery routine to verified, decoded receipt in the receiver’s in-memory store. Sender-interface traffic was 1,846.4 B/post for Jagoo Bahee and 1,278.3 B/post for the inbox. The measured application containers used 88–92 MiB and 9–14 MiB, respectively. With inbound connections blocked in a separate run, Jagoo Bahee’s periodic pull recovered 10/10 posts, while none of ten inbox pushes succeeded within the baseline’s retry budget. The inbox is a minimal implementation and omits Mastodon’s application and worker stack (Sections IV and V-C, Table III).

### 5. Adversarial and valid-traffic load

**Comment.** Test validly signed flooding, coordinated attacks from multiple peers, replays, malformed protobuf inputs, and resource exhaustion.

**Response.** We measured valid signed writes using 200 posts at each concurrency level, as well as duplicate delivery, nonce replay, malformed protobuf inputs, and federation traffic from five peers. All 200 valid posts per setting reached the local projection. The receiver rejected 500 invalid peer frames. In the over-quota test, two peers were blocked and no envelopes were admitted. Sustained resource-exhaustion thresholds remain unmeasured (Sections V-B and VI–VII, Table II).

### 6. Audit-log and consistency guarantees

**Comment.** Clarify which accountability guarantees are implemented and which remain future work.

**Response.** Independent audit-log services verify receipt signatures and inclusion proofs. Clients can retrieve locally generated RFC 6962 consistency proofs over HTTP. In peer exchange, the receiver checks that an observed head names the expected server key and is not older than the previously recorded observation, then compares tree size and root. This comparison does not independently verify the peer head’s signature. Automatic consistency verification when a peer log grows, cross-observer split-view detection, and proof of refusal before admission remain open. A submission refused before admission receives no receipt (Section III-D and Table I).

### 7. Property-based testing and malformed serialization

**Comment.** The 16 positive vectors are not sufficient. Add property-based testing, fuzzing, malformed serialization tests, and boundary-value tests.

**Response.** TypeScript, Rust, and Python agreed on 20,000 seeded differential cases. The valid corpus included 10,000 generated cases covering numeric boundaries and Unicode. Across 16 mutation classes, all three decoders rejected the same 9,455 inputs and decoded the same 545 cases. An earlier run exposed a TypeScript 32-bit bounds error, which we corrected and covered with a regression test (Section V-A).

### 8. Figure readability and language

**Comment.** Improve the readability of Figures 2–4 and correct grammatical and formatting issues throughout the paper.

**Response.** We redrew the architecture, admission pipeline, and route topology, and clarified the labels and variability shown in the scaling and impairment figures. We also edited the manuscript for clarity (Figures 1–5).

## Reviewer 2

### 1. Testbed scope

**Comment.** The evaluation uses virtual networks on one physical host. Keep conclusions within the evidence.

**Response.** The abstract and conclusion now limit the findings to the single-host Docker experiments. Section VI identifies independent routing, host failures, and wide-area timing as open evaluation questions (Sections I, VI–VII).

### 2. Latency variability

**Comment.** Repeat the route-cut trials and report distributions and variability.

**Response.** Section V-A reports post IQRs and sample standard deviations, and Figure 5 shows 95% bootstrap intervals for the route-regime medians. Each scaling configuration used 50 posts, observed at successive hops. Figure 4 reports the hop-scaling results and drain-interval sweep (Sections IV and V-A–V-B).

### 3. Resource consumption

**Comment.** Clarify CPU, memory, and the plausibility of deployment on small single-board computers.

**Response.** The eight-node run used 77–111 MiB per application container, with a sampled CPU maximum of 21.18%. The shared MongoDB and Redis containers used 184 MiB and 9 MiB. Peak resident memory, disk use, and single-board-computer performance remain unmeasured (Sections V-B and VI).

### 4. Transport timeouts and retry behavior

**Comment.** Explain transport timeouts and backoff behavior.

**Response.** Default deadlines are 5 s for control calls, 15 s for delivery, and 30 s for backfill. Delivery cancels its gRPC call on timeout. Retry delays double from 1 s to a 15 min cap, and an entry is dead-lettered on the 13th failed attempt. The ISP gate and inbox comparison used the rebuilt transport. The route, impairment, stress, and scaling runs preceded that rebuild (Sections III-C and IV).

### 5. Concurrent valid traffic

**Comment.** Clarify scalability under concurrent valid traffic.

**Response.** All 200 posts per setting reached the local projection. At concurrency levels of 1, 4, 16, and 32 requests, throughput was 29, 27, 9, and 6 requests/s. The 95th-percentile latency rose from 49 ms to 12.587 s (Section V-B, Table II).

### 6. ActivityPub size comparison

**Comment.** Interpret the ActivityPub size comparison cautiously because the protocols differ in functionality and interoperability.

**Response.** We distinguish the original 80-activity sample from two deployments and the later 40-activity sample from one deployment. The latter had median raw and gzipped full representations of 3,931 B and 1,063 B. In the separate shaped-link delivery test, sender-interface traffic averaged 1,846.4 B/post for Jagoo Bahee and 1,278.3 B/post for the minimal inbox. ActivityPub supports interoperability across existing Fediverse deployments, while our fixed schema requires coordinated decoder support for version changes. The controlled comparison does not measure those compatibility costs (Section V-C, Table III).

### 7. Audit and fork-detection guarantees

**Comment.** Explain the security guarantees and limits of the audit-log and consistency mechanisms, especially because full fork detection is not implemented.

**Response.** A peer can flag a different root at the same tree size or a smaller tree in a non-stale observation that names the expected server key. A larger tree is stored without automatic append-only consistency verification. Observers separated by a partition may receive conflicting views. The revised paper distinguishes these peer comparisons from the receipt signature and inclusion-proof checks performed by the audit-log service (Section III-D, Table I, and Section VI).

### 8. Language and conference fit

**Comment.** Correct minor grammatical issues and explain the paper’s fit with the conference themes.

**Response.** Section I explains how outbound recovery over surviving routes addresses resilient networking, and how admission receipts support accountability in distributed systems. We edited the manuscript for clarity (Section I).
