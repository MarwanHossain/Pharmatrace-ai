# PharmaTrace AI — Proposed Graph Neural Network (GNN) Model Architecture & Evaluation Plan

> [!NOTE]
> **DEVELOPMENT SCOPE & ATTRIBUTION NOTICE:**
> The deep learning architectures, mathematical message-passing formulations, and evaluation protocols described herein represent the proposed design authored by the project's AI/ML engineer. The models are actively being developed within `ai-service/`. The metrics presented in Section 4 define the target experimental evaluation benchmark; no fabricated empirical results are asserted.

---

## 1. Deep Graph Neural Network Architecture

To detect complex topological pharmaceutical fraud, the AI engineer is implementing a **Heterogeneous Graph Attention Network (HAN / HGT)** architecture using PyTorch Geometric (PyG).

```mermaid
flowchart TD
    subgraph InputGraph["1. Heterogeneous Dynamic Graph"]
        HG[HeteroData Object:\nOrg Nodes · Batch Nodes · Package Nodes\nTemporal Edge Attributes]
    end

    subgraph EmbeddingLayers["2. Relational Message Passing Layers"]
        L1[Layer 1: HeteroConv / GATv2Conv\nNode-Level Attention Across Relations]
        L1 --> Norm1[LayerNorm + LeakyReLU Activation]
        Norm1 --> L2[Layer 2: Semantic Attention Aggregator\nCross-Metapath Feature Fusion]
        L2 --> Norm2[LayerNorm + Dropout 0.3]
    end

    subgraph TemporalModule["3. Temporal Edge Memory"]
        TimeEncoder[Bochner Time Kernel Encoder\nphi(delta_t)]
        Norm2 --> Fusion[Concat Node Embeddings + Edge Time Embedding]
        TimeEncoder --> Fusion
    end

    subgraph Heads["4. Output Inference Heads"]
        Fusion --> AnomalyHead[MLP Anomaly Classifier\nSigmoid -> Fraud Probability]
        Fusion --> ExplainerHead[GNNExplainer Module\nExtract Salient Subgraph Motif]
    end

    InputGraph --> L1
    AnomalyHead --> OutputProb([Anomaly Score: 0.00 to 1.00])
    ExplainerHead --> OutputMotif([Evidentiary Subgraph for DGDA Dossier])
```

---

## 2. Mathematical Message-Passing Formulation

### 2.1 Node-Level Attention (Relation-Specific Message Passing)
For a specific relation $r \in \mathcal{R}$ connecting source node $j$ to target node $i$, the attention weight $\alpha_{ij}^r$ is computed via parameterized attention vectors:

$$\alpha_{ij}^r = \frac{\exp \left( \text{LeakyReLU} \left( \mathbf{a}_r^T [\mathbf{W}_r \mathbf{h}_i \,\|\, \mathbf{W}_r \mathbf{h}_j \,\|\, \mathbf{e}_{ij}^r] \right) \right)}{\sum_{k \in \mathcal{N}_i^r} \exp \left( \text{LeakyReLU} \left( \mathbf{a}_r^T [\mathbf{W}_r \mathbf{h}_i \,\|\, \mathbf{W}_r \mathbf{h}_k \,\|\, \mathbf{e}_{ik}^r] \right) \right)}$$

where:
- $\mathbf{W}_r \in \mathbb{R}^{d' \times d}$ is the relation-specific linear transformation matrix.
- $\mathbf{a}_r$ is the trainable attention vector for relation $r$.
- $\mathbf{e}_{ij}^r$ denotes edge features (e.g., velocity, transit hours, disposition).
- $\|$ denotes vector concatenation.

### 2.2 Semantic-Level Attention Aggregation
The node representation $\mathbf{z}_i$ combines representations learned across all connected relation types $\mathcal{R}_i$:

$$\mathbf{z}_i = \sum_{r \in \mathcal{R}_i} \beta_r \cdot \mathbf{h}_i^r, \quad \beta_r = \frac{\exp(\mathbf{q}^T \tanh(\mathbf{W}_{\text{sem}} \mathbf{h}^r))}{\sum_{r'} \exp(\mathbf{q}^T \tanh(\mathbf{W}_{\text{sem}} \mathbf{h}^{r'}))}$$

---

## 3. Loss Functions for Extreme Imbalance

Because fraudulent transactions represent a minute fraction of the dataset ($< 0.1\%$), standard binary cross-entropy produces high false-negative rates. The model is trained using **Focal Loss** combined with an auxiliary self-supervised edge reconstruction objective:

$$\mathcal{L}_{\text{total}} = \mathcal{L}_{\text{focal}} + \lambda \mathcal{L}_{\text{contrastive}}$$

### Focal Loss Formulation
$$\mathcal{L}_{\text{focal}}(p_t) = -\alpha_t (1 - p_t)^\gamma \log(p_t)$$

- Focusing parameter: $\gamma = 2.0$ (downweights well-classified benign transactions).
- Balancing weight: $\alpha = 0.25$ (prioritizes positive fraud examples).

---

## 4. Proposed Evaluation Benchmark Protocol

To evaluate detection efficacy, the AI developer will benchmark the proposed Heterogeneous GNN against baseline classifiers across four standard metrics:
- **ROC-AUC:** Overall discriminative ability across decision thresholds.
- **PR-AUC (Average Precision):** Performance under severe class imbalance.
- **Recall @ 1% FPR:** Percentage of true fraud detected while constraining false alarms to at most 1 in 100 legitimate shipments.
- **Inference Latency:** Wall-clock duration per transaction graph query.

### Benchmark Comparison Matrix (Target Research Design)

| Model Category | Architecture / Model | Target ROC-AUC | Target PR-AUC | Target Recall @ 1% FPR | Interpretability |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Current Baseline** | Deterministic Heuristic Screener (`investigator.service.js`) | Fixed Threshold | Baseline | Baseline | 100% (Rule Trace) |
| **Tabular ML** | Random Forest / XGBoost | Target $\ge 0.82$ | Target $\ge 0.55$ | Target $\ge 0.60$ | Moderate (SHAP) |
| **Homogeneous GNN** | GraphSAGE / GCN | Target $\ge 0.88$ | Target $\ge 0.68$ | Target $\ge 0.72$ | Low (Node Gradients) |
| **Proposed Model** | **Heterogeneous Graph Attention Network (HAN + Time)** | **Target $\ge 0.94$**| **Target $\ge 0.82$**| **Target $\ge 0.88$**| **High (GNNExplainer Subgraphs)** |

---

## 5. Regulatory Explainability via GNNExplainer

For an AI-generated alert to be legally admissible in a DGDA regulatory enforcement proceeding, the investigator cannot accept a "black box" probability score. 

The AI service incorporates `torch_geometric.explain.GNNExplainer` to identify the minimal subgraph $\mathcal{G}^*$ and feature subset $\mathbf{X}^*$ that maximizes the mutual information with the predicted fraud label:

$$\max_{\mathcal{G}^*, \mathbf{X}^*} \text{MI}(Y, (\mathcal{G}^*, \mathbf{X}^*)) = H(Y) - H(Y \mid \mathcal{G} = \mathcal{G}^*, \mathbf{X} = \mathbf{X}^*)$$

The resulting explanatory subgraph (e.g., highlighting 3 colluding wholesalers and anomalous 2-hour delivery intervals across 500 km) is rendered visually within the Investigator Case Dossier (`docs/screenshots/17-investigator-case-audit-trail.png`).

---

## 6. Related Documentation
- [AI Research Methodology](research-methodology.md): Theoretical framework.
- [Dataset Strategy & Features](dataset-strategy.md): Graph inputs and synthetic generation.
- [FastAPI Microservice Integration](fastapi-integration.md): Inter-service serving pipeline.
