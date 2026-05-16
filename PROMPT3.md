# DevGlean — PROMPT3.md
# Phase 9: Architecture Hardening, Retrieval Quality & Platform Completeness

> **FOUNDING ENGINEER STATUS:** This is no longer a side project. DevGlean is a product-grade, investor-ready, production-hardened SaaS platform. 
> Every implementation must reflect the engineering standards of a staff engineer at Stripe, Linear, or Vercel. 
> Zero tolerance for "ghost" values, "placeholders", or "temporary" hacks.

---

## Context & Motivation

Phase 8 (PROMPT2) delivered DevGlean's OSS Intelligence Surface. Phase 9 addresses critical gaps to move from a high-fidelity prototype to a robust platform.

## Gap Index

| # | Severity | Title | ADR | Status |
|---|----------|-------|-----|--------|
| G1 | 🔴 Critical | URL routing — search results are not shareable | ADR-021 | ✅ Done |
| G2 | 🔴 Critical | Wrong embedding model for a developer tool | ADR-022 | ⏳ Pending |
| G3 | 🔴 Critical | `/search/suggestions` is architecturally hollow | ADR-023 | ⏳ Pending |
| G4 | 🟠 High | `CONFLUENCE` and `GITLAB` are ghost enum values | ADR-024 | ✅ Done |
| G5 | 🟠 High | Notion connector uses polling; official webhooks now exist | ADR-025 | ⏳ Pending |
| G6 | 🟠 High | `IssueRanker` is missing the resolution-quality signal | ADR-0 la6 | ⏳ Pending |
| G7 | 🟡 Medium | Stack Exchange surface covers only Stack Overflow | ADR-027 | ⏳ Pending |
| G8 | 🟡 Medium | No degraded-mode fallback when the embedding API is down | ADR-028 | ⏳ Pending |

---

## Implementation Roadmap

### Session A: The Critical Path (Completed/In-Progress)
- [x] G1: URL Routing Migration (TanStack Router)
- [x] G4: GitLab & Confluence Implementation
- [ ] G3: Redis Autocomplete Pipeline

### Session B: Infrastructure & Reliability
- [ ] G2: `voyage-code-3` Migration & Re-indexing
- [ ] G8: Embedding Circuit Breaker & Degraded UI

### Session C: Connector Evolution
- [ ] G5: Notion Real-time Webhooks

### Session D: Signal Intelligence
- [ ] G6: IssueRanker Resolution Signal
- [ ] G7: SE Multi-site Expansion

---

## Definition of Done (Founding Engineer Standards)

1. **Type Safety:** No `any` in the critical path. End-to-end type safety from API response to UI.
2. **Observability:** Every failure point has a structured log with a trace ID.
3. **Performance:** Autocomplete < 10ms. Search latency within 10% of baseline.
4. **Resilience:** System remains functional (BM25 mode) even if Voyage AI is offline.
5. **Documentation:** CLAUDE.md reflects the exact state of the production system.
