# PharmaTrace AI — AI/ML Research & Integration Documentation

This directory provides the research methodology, dataset engineering specifications, proposed Graph Neural Network (GNN) model architectures, and FastAPI microservice integration interfaces authored for the `ai-service/` module.

---

## Documentation Index & Status

| Document | Description & Scope | Status |
| :--- | :--- | :---: |
| [**1. AI Research Methodology**](research-methodology.md) | Problem formulation, graph representation learning theory, literature review, and GNN architectural design decisions. | **Completed** |
| [**2. AI Dataset Strategy**](dataset-strategy.md) | Relational-to-graph ETL pipeline from MariaDB, graph feature engineering, and synthetic topological fraud generators. | **Completed** |
| [**3. Proposed GNN Model Architecture**](model-architecture.md) | Heterogeneous GNN message-passing formulation, focal loss, target benchmark matrix, and GNNExplainer interpretability. | **Completed** |
| [**4. FastAPI Integration & Contract**](fastapi-integration.md) | Microservice topology, REST API payloads, internal authentication, latency budgets, and Circuit Breaker fallback protocols. | **Completed** |

---

## Development Scope & Attribution Notice
The advanced AI/ML research and model implementation described in these documents is being conducted separately by the dedicated AI/ML engineer on the team within the `ai-service/` directory. The core full-stack platform (Milestones M1–M9) is 100% operational and independently verified using the deterministic heuristic screening engine in `server/src/services/investigator.service.js`.
