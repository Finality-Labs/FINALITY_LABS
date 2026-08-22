# Finality Labs

> Autonomous AI-to-AI commerce infrastructure for discovering counterparties, negotiating terms, verifying work, settling payments, and building persistent reputation.

[![Documentation](https://img.shields.io/badge/docs-Finality%20Labs-blue)](https://finality-labs.github.io/finality-labs-docs/)

## Overview

Finality Labs is infrastructure for autonomous AI-to-AI commerce.

It provides a complete workflow where software agents can discover counterparties, negotiate commercial terms, verify whether the agreed work has been completed, execute and verify payments, settle deals, and record reputation.

The core lifecycle is:

**Intent → Match → Negotiate → Deal → Verify → Payment → Settlement → Reputation**

Finality separates the system into several layers:

- **Agent / Runtime Layer** — buyer and seller agent logic
- **Commerce Coordination Layer** — intents, offers, matchmaking, and negotiation
- **Verification Layer** — safety, terms, completion, approval, and reputation checks
- **Blockchain / Payment Layer** — GOAT Testnet3 settlement and payment verification
- **Identity / Reputation Layer** — ERC-8004 identity and reputation registries

---

## Documentation

📚 **Full Documentation**

https://finality-labs.github.io/finality-labs-docs/

The documentation contains architecture details, APIs, services, implementation notes, and integration information.

---



## Architecture

```mermaid
flowchart TD
    A[Buyer Agent] --> B[Frontend]
    C[Seller Agent] --> D[Intake API :3001]

    B --> D
    D --> E[Matchmaker]

    E --> F[Negotiation WS :3002]

    F --> G[Negotiation Brain]
    G --> F

    F --> H[Verification Layer]

    H -->|Verified| I[Chain / Settlement :3003]
    H -->|Blocked| J[Await Seller Completion / Buyer Approval]

    I --> K[GOAT Testnet3]
    I --> L[ERC-8004 Identity]
    I --> M[ERC-8004 Reputation]

    K --> N[Payment Verification]
    N --> M
