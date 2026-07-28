// The only place in frontend/ allowed to hold raw key material (SG-01, lint-enforced).
// PlaneSigner<Forum> and PlaneSigner<Signal> wrap @jagoo/sdk/signer with expo-secure-store-backed
// key storage (ADR-003 §2). Populated in P1.
export {};
