# PharmaTrace AI — Deterministic Anomaly Detection & Regulatory Screening

This document outlines the heuristic anomaly detection engine implemented in `server/src/services/investigator.service.js`, the five core rule definitions, the severity scoring matrix, real-time alert dispatching, and the transition boundary to the planned Graph Neural Network (GNN) AI module.

---

## 1. Surveillance Engine Architecture

In a pharmaceutical distribution network, illicit diversion, packaging counterfeiting, and gray-market smuggling manifest as distinct topological deviations from compliant supply-chain behavior. PharmaTrace AI implements a dual-tier surveillance strategy:

1. **Deterministic Heuristic Screener (Implemented M9 Baseline):** A high-speed, rule-based screening engine in `server/src/services/investigator.service.js` executing synchronous checks on scan frequency, shipment dispositions, government allocations, and custody histories.
2. **Graph-Based Machine Learning (Planned AI Scaffold):** A temporal Graph Neural Network (GNN) designed to detect complex fraud syndicates, cyclic laundering, and coordinated supply-chain anomalies beyond fixed heuristic rules.

```mermaid
flowchart TD
    ScanEvent([Incoming Scan or Custody Event]) --> Screener[Deterministic Heuristic Screener\n(investigator.service.js)]
    
    subgraph HeuristicRules["Five Deterministic Detection Rules"]
        R1[RULE 1: DUPLICATE_SCAN_ANOMALY\nVerify Count > 1]
        R2[RULE 2: SHIPMENT_QUANTITY_DISCREPANCY\nMissing / Damaged / Rejected Dispositions]
        R3[RULE 3: GOVERNMENT_DIVERSION_INDICATOR\nGov-Allocated Stock in Retail Channels]
        R4[RULE 4: BROKEN_CUSTODY_HISTORY\nDownstream Stock Without Dispatched Events]
        R5[RULE 5: UNAUTHORIZED_CUSTODY_ACTIVITY\nQuarantined / Rejected In Active Shipment]
    end

    Screener --> HeuristicRules
    HeuristicRules --> AnyViolated{Rule Triggered?}
    
    AnyViolated -->|No Violation| AllowEvent([Event Committed Cleanly])
    AnyViolated -->|Rule Violated| ScoreSeverity[Assign Anomaly Severity Score\nCRITICAL · HIGH · MEDIUM]
    
    ScoreSeverity --> InsertAnomaly[(MariaDB: investigation_alerts table)]
    InsertAnomaly --> BroadcastAlert[Broadcast to Investigator Dashboard Feed]
    BroadcastAlert --> ManualTriage[Investigator Inspects in Alert Details Drawer]

    %% Future AI Bridge
    AllowEvent -.->|Asynchronous Feature Graph Batch| FutureGNN[Future GNN Intelligence Tier\n(FastAPI ai-service/)]
    FutureGNN -.->|Proposed Subgraph Anomaly Score| InsertAnomaly
```

---

## 2. Five Core Deterministic Detection Rules

### RULE 1: DUPLICATE_SCAN_ANOMALY (Repeated Scans / Suspect Cloning)
- **Code Trigger:** `packages.verify_count > 1`.
- **Implementation:**
  ```javascript
  const anomalyScore = Math.min(1.0, 0.7 + (pkg.verify_count * 0.05));
  ```
- **Context & Safeguard:** Repeated scans are operational screening indicators that warrant verification; they are not absolute proof of counterfeiting. The rule explicitly logs that multiple verification events or distinct IP addresses do not establish separate physical locations unless corroborated by verified location evidence.
- **Severity:** **HIGH** (Score: 0.700 – 1.000).

---

### RULE 2: SHIPMENT_QUANTITY_DISCREPANCY / SHRINKAGE_SPIKE
- **Code Trigger:** Inbound intake where packages receive `missing`, `damaged`, or `rejected` disposition status in `shipment_packages`.
- **Implementation:** Distinguishes between numerical shortages (`missing` $\implies$ shortage category) and packaging integrity damage (`damaged` $\implies$ physical condition category).
- **Severity:** **HIGH** (Shortage / Missing, Score: 0.850); **MEDIUM** (Physical Damage, Score: 0.750).

---

### RULE 3: GOVERNMENT_DIVERSION_INDICATOR
- **Code Trigger:** Government-allocated medicine packages (bound to designated public hospitals or clinical programs) discovered in commercial retail pharmacies or reported in public consumer fraud submissions.
- **Severity:** **CRITICAL** (Commercial Pharmacy Intake, Score: 0.950); **HIGH** (Public Consumer Report, Score: 0.900).

---

### RULE 4: BROKEN_CUSTODY_HISTORY / SHADOW_DIVERSION_RISK
- **Code Trigger:** Packages held in active custody by a Wholesaler or Pharmacy with zero preceding `DISPATCHED` or `RECEIVED` traceability events in `traceability_events`.
- **Context:** Detects illegitimate insertion into the supply chain without manufacturer or central distributor dispatch manifests.
- **Severity:** **HIGH** (Score: 0.900).

---

### RULE 5: UNAUTHORIZED_CUSTODY_ACTIVITY
- **Code Trigger:** Packages holding status `quarantined` or `rejected` that are actively assigned to a shipping manifest (`current_shipment_ref IS NOT NULL`).
- **Context:** Quarantined and rejected medicines must remain physically and electronically locked in designated quarantine holding facilities.
- **Severity:** **HIGH** (Score: 0.880).

---

## 3. Severity Matrix & Incident Escalation

| Severity Tier | Default Score | System Action | Investigator Escalation |
| :--- | :---: | :--- | :--- |
| **`CRITICAL`** | $0.950$ | High-priority alert banner; suspect entity highlighted on surveillance dashboard. | Prompts immediate creation of regulatory case dossier (`INV-YYYY-XXXX`). |
| **`HIGH`** | $0.850 - 0.900$ | Intake pause recommendation; disposition discrepancy logged in `shipment_packages`. | Added to investigator triage queue for detailed drawer inspection. |
| **`MEDIUM`** | $0.750$ | Informational alert; flags batch variance index. | Reviewed during routine facility audit cycles. |

---

## 4. Transition Boundary to Planned AI/ML Module

While deterministic heuristic screening provides immediate, 100% explainable, and sub-millisecond screening for known violation patterns, it has inherent architectural limitations:
1. **Fixed Thresholds:** Cannot detect sophisticated counterfeiters who delay scans to mimic normal transit velocity.
2. **Subnetwork Laundering:** Multi-hop collusion rings passing stolen inventory through multiple intermediaries cannot be flagged by simple single-hop checks.
3. **Graph Topology Blindness:** Pairwise queries cannot effectively compute multi-hop graph centrality or structural role anomalies.

To solve these advanced fraud patterns, the separate `ai-service/` module is developing a **Heterogeneous Graph Neural Network (GNN)** that ingests the relational graph constructed from MariaDB tables and infers latent anomaly scores across multi-echelon subgraphs.

---

## 5. Related Documentation
- [Visual Application Gallery: Investigator Alert Drawer](../screenshots/README.md#16-live-anomaly-alert-details--triage-drawer)
- [Investigation & Regulatory Enforcement Workflow](investigation-and-enforcement.md): Case file lifecycle.
- [AI Model Architecture & GNN Roadmap](../ai/model-architecture.md): Theoretical foundation for the planned AI model.
- [Database Architecture Guide](../architecture/database-architecture.md): `investigation_alerts` table and indexing.
