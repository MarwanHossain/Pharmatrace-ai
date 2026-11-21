# PharmaTrace AI — FastAPI Microservice Architecture, Inter-Service Contract & Fallback Protocol

> [!NOTE]
> **DEVELOPMENT SCOPE & ATTRIBUTION NOTICE:**
> The microservice architecture and API contracts specified below define the integration interface connecting the Express backend with the Python `ai-service/` module currently being built by the AI/ML engineer. The Express backend is architected to communicate with this service via non-blocking HTTP calls with an automatic Circuit Breaker fallback.

---

## 1. Microservice Topology & Boundaries

The AI/ML intelligence engine is decoupled from the core full-stack application as an autonomous Python microservice. This prevents heavy PyTorch tensor computations, matrix multiplications, and CUDA operations from competing with Express event loops or MariaDB connection pools for CPU cycles.

```mermaid
flowchart LR
    subgraph ExpressBackend["Node.js Application Tier (Port 5000)"]
        CustodySvc[Custody & Scan Service]
        CircuitBreaker{Circuit Breaker\nThreshold: 3 Failures\nTimeout: 500ms}
        HeuristicFallback[Deterministic Screener\n(investigator.service.js)]
    end

    subgraph FastAPIService["Python AI Microservice (Port 8000)"]
        FastAPIGateway[FastAPI Router\n(ai-service/app/main.py)]
        PyTorchRunner[PyTorch Geometric Runner\nIn-Memory Model Weights]
        Explainer[GNNExplainer Subgraph Engine]
    end

    CustodySvc -->|Scan Event Received| CircuitBreaker
    
    CircuitBreaker -->|State: CLOSED\nService Healthy| FastAPIGateway
    FastAPIGateway --> PyTorchRunner
    PyTorchRunner --> Explainer
    Explainer -->|Inference Score + Salient Subgraph| CircuitBreaker
    CircuitBreaker -->|Enriched Alert| CustodySvc

    CircuitBreaker -->|State: OPEN / Timeout > 500ms\nFallback Triggered| HeuristicFallback
    HeuristicFallback -->|Deterministic Heuristic Score| CustodySvc
```

---

## 2. Inter-Service REST API Specifications

The FastAPI microservice runs by default on `http://127.0.0.1:8000/v1` and exposes the following endpoints:

### 2.1 Anomaly Prediction Endpoint
```http
POST /v1/predict/anomaly
Content-Type: application/json
X-Internal-Service-Key: <HMAC_OR_PRESHARED_INTERNAL_SECRET>
```

#### Request Payload Schema (Pydantic)
```json
{
  "packageSerial": "SN-NX-B26-01-00001",
  "gtin": "10890123456789",
  "batchNumber": "B26-01",
  "currentEvent": {
    "eventType": "CUSTODY_TRANSFER_ACCEPT",
    "fromOrgId": 14,
    "toOrgId": 28,
    "timestamp": "2026-11-21T17:00:00Z",
    "disposition": "ACCEPT",
    "location": {
      "latitude": 23.8103,
      "longitude": 90.4125
    }
  },
  "subgraphContext": {
    "recentTransfersCount": 3,
    "elapsedHoursSinceLastScan": 14.5,
    "inTransitKm": 240.0
  }
}
```

#### Response Payload Schema
```json
{
  "success": true,
  "inference": {
    "anomalyScore": 0.042,
    "isAnomaly": false,
    "classification": "BENIGN_TRANSFER",
    "confidence": 0.958,
    "latencyMs": 48
  },
  "timestamp": "2026-11-21T17:00:00.048Z"
}
```

---

### 2.2 Subgraph Explanation Endpoint (For Investigator Case Files)
```http
POST /v1/explain/subgraph
```
- **Description:** Invokes `GNNExplainer` to extract the top-5 influential edges and feature deviations explaining why a high anomaly score was predicted.
- **Response Sample:**
  ```json
  {
    "success": true,
    "explanation": {
      "targetPackage": "SN-NX-B26-01-00001",
      "salientNodes": [14, 28, 99],
      "salientEdges": [
        { "from": 14, "to": 99, "relation": "UNMANIFESTED_DISPATCH", "weight": 0.89 },
        { "from": 99, "to": 28, "relation": "SUSPICIOUS_CUSTODY_LEAP", "weight": 0.94 }
      ],
      "primaryDeviation": "Simultaneous scan in two locations separated by 240 km within 12 minutes."
    }
  }
  ```

---

## 3. Circuit Breaker & Fallback Resilience Protocol

A core architectural invariant of PharmaTrace AI is that **core supply-chain operations must never be paralyzed by machine learning service unavailability**.

The Node.js backend wraps calls to the AI microservice in a **Circuit Breaker** pattern:
1. **Normal State (`CLOSED`):** HTTP requests are dispatched to FastAPI. If responses return within $500\text{ ms}$, predictions enrich the event record.
2. **Failure Threshold:** If 3 consecutive requests fail (e.g., service offline, network error, or timeout $> 500\text{ ms}$), the breaker trips to `OPEN`.
3. **Fallback Mode:** While `OPEN`, the application bypasses the AI microservice entirely and routes the transaction directly through the deterministic heuristic screener (`server/src/services/investigator.service.js`).
4. **Half-Open Recovery:** After a 30-second cooldown, the breaker permits a single trial request (`HALF-OPEN`). If successful, normal operation resumes; if it fails, the breaker resets the cooldown.

---

## 4. How to Run the AI Microservice (Development Setup)

When ready to test or run the AI microservice locally:

1. **Navigate to AI Directory:**
   ```bash
   cd D:\pharmatrace-ai\ai-service
   ```
2. **Create Python Virtual Environment:**
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On Linux / macOS:
   source venv/bin/activate
   ```
3. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
4. **Launch FastAPI Development Server:**
   ```bash
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
5. **Verify AI Service Health:**
   Open `http://127.0.0.1:8000/v1/health` in your browser.

---

## 5. Related Documentation
- [AI Research Methodology](research-methodology.md): Theoretical framework.
- [AI Dataset Strategy](dataset-strategy.md): Graph ETL pipeline.
- [AI Model Architecture](model-architecture.md): GNN and explainability specifications.
- [Deterministic Anomaly Screener](../workflows/anomaly-detection.md): Implemented baseline fallback.
