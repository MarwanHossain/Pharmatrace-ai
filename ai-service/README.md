# PharmaTrace AI — AI/ML Anomaly Detection Microservice

## 1. Project Title & Overview
**Service Name:** PharmaTrace AI — AI/ML Microservice (`ai-service`)  
**Parent Platform:** PharmaTrace AI (Pharmaceutical Supply-Chain Traceability & Regulatory Enforcement Platform)

## 2. Purpose of the AI Microservice
The `ai-service` component is designed to host advanced machine learning (ML) and graph-enhanced artificial intelligence models for the PharmaTrace AI platform. Its primary objective is to detect complex supply-chain anomalies, probabilistic counterfeit injection patterns, and diversion activities that exceed the capabilities of deterministic, rule-based screening checks.

## 3. Role in the PharmaTrace AI Ecosystem
Within the overall multi-echelon architecture:
- The full-stack platform (Express backend + MariaDB) serves as the system of record for pharmaceutical products, batches, serialized packages, custody transfers, and audit logs.
- The `ai-service` acts as an autonomous analytical microservice that consumes supply-chain event graphs and transaction datasets to compute anomaly scores and model explanations.
- Anomaly inferences produced by this service can be submitted to the platform's regulatory alerts and case management subsystems for review by authorized Drug Inspection & Enforcement Officers.

## 4. Expected Architecture (FastAPI)
The microservice is designed to follow a modular FastAPI Python architecture:
- `app/api/v1/`: API route controllers and endpoint handlers.
- `app/core/`: Application configuration, environment settings, and security dependencies.
- `app/schemas/`: Pydantic data validation and serialization models.
- `app/graph/`: Graph construction, node/edge feature extraction, and graph data abstractions.
- `app/models/`: Machine learning model architectures, graph neural network (GNN) modules, and inference wrappers.
- `app/services/`: Core prediction pipelines, batch scoring, and anomaly evaluation services.
- `app/utils/`: Helper utilities, logging formatters, and mathematical transformations.
- `training/`: Dedicated offline training pipelines, dataset loaders, preprocessing steps, experiment tracking, and evaluation scripts.
- `data/`: Sample, generated, and processed datasets.
- `artifacts/`: Serialized model weights, embeddings, scalers, and metadata files.
- `tests/`: Automated unit, API, and integration test suites.

## 5. Implementation Status: Scaffolding Only
> **NOTICE:** This directory currently contains folder structure, repository configuration, and documentation scaffolding only. No application source code, API routes, or model training logic have been implemented yet.

## 6. Development Ownership
The design, implementation, dataset engineering, model training, evaluation, and API realization of this service belong exclusively to the **AI/ML Teammate** as part of their assigned capstone responsibilities.

## 7. Service Startup & Execution Instructions
*Status: PENDING IMPLEMENTATION BY AI/ML DEVELOPER.*

Once dependencies and application entry points are established by the AI/ML teammate, standard development execution instructions will be documented here (e.g., virtual environment activation, `requirements.txt` installation, and `uvicorn app.main:app --reload` invocation).
