# PharmaTrace AI — RESTful API Reference & Endpoint Specifications

This document provides a comprehensive developer and auditor reference for the PharmaTrace AI HTTP REST API. It outlines URL conventions, authentication mechanisms, common request headers, standardized response envelopes, and complete endpoint schemas organized by domain.

---

## 1. Global API Standards & Conventions

- **Base URL:** `/api/v1` (with backward-compatible unversioned `/api` aliases)
- **Protocol:** HTTPS / TLS 1.3 in production; HTTP in local development.
- **Data Exchange Format:** `application/json` (UTF-8 encoded)
- **Authentication:** HttpOnly, Secure Session JWT Cookies (`pt_access_token`)
- **CSRF Protection:** State-changing methods (`POST`, `PUT`, `PATCH`, `DELETE`) require the `x-csrf-token` header.

### Common Request Headers
```http
Content-Type: application/json
Accept: application/json
x-csrf-token: e8a91b2c4d5e...
Cookie: pt_access_token=eyJhbGciOi...; pt_csrf_token=e8a91b2c4d5e...
```

### Standardized Response Envelopes
All API responses follow consistent structural contracts:

#### Success Response Envelope (HTTP 200 / 201)
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-11-21T17:00:00.000Z"
}
```

#### Error Response Envelope (HTTP 4xx / 5xx)
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "The email or password provided is incorrect.",
    "details": null
  },
  "timestamp": "2026-11-21T17:00:00.000Z"
}
```

---

## 2. Standard HTTP Status Codes

| Status Code | Meaning | Typical Scenario |
| :---: | :--- | :--- |
| **`200 OK`** | Request succeeded | Data retrieved or resource updated successfully. |
| **`201 Created`** | Resource created | Product, batch, shipment, or case successfully created. |
| **`400 Bad Request`** | Validation failure | Missing required fields, invalid date format, invalid GTIN-14. |
| **`401 Unauthorized`** | Authentication required | Missing JWT cookie, expired session, revoked `token_version`. |
| **`403 Forbidden`** | Role authorization failure | Valid user lacks required permission (e.g., pharmacy calling admin API). |
| **`404 Not Found`** | Resource missing | Package serial, batch ID, or shipment record does not exist. |
| **`409 Conflict`** | State conflict | Duplicate serial generation, broken custody transfer leap. |
| **`429 Too Many Requests`** | Rate limit exceeded | Public verification scan limit reached from client IP. |
| **`500 Server Error`** | Unhandled internal exception | Database connection failure or unhandled service error. |

---

## 3. Comprehensive Endpoint Catalog by Domain

### 3.1 System Health
```http
GET /api/v1/health
```
- **Access:** Public (Unauthenticated)
- **Description:** Verifies running server process, database connectivity, uptime, and database pool availability.
- **Response Sample:**
  ```json
  {
    "success": true,
    "data": {
      "status": "healthy",
      "uptimeSeconds": 84210,
      "database": {
        "status": "connected",
        "activeConnections": 2,
        "totalConnections": 20
      }
    }
  }
  ```

---

### 3.2 Authentication & Session Management (`/api/v1/auth`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/v1/auth/login` | Public | Authenticates user with email, password, and expected role. Sets HttpOnly JWT cookie. |
| `POST` | `/api/v1/auth/logout` | Authenticated | Clears session cookies and updates session audit log. |
| `GET` | `/api/v1/auth/me` | Authenticated | Returns current authenticated user profile, organization, and role permissions. |
| `POST` | `/api/v1/auth/change-password` | Authenticated | Updates user password, increments `token_version`, and revokes older sessions. |
| `POST` | `/api/v1/auth/forgot-password` | Public | Initiates password reset token generation. |

#### Login Request Payload
```json
{
  "role": "manufacturer",
  "email": "mfg_user_m6@pharmatrace.test",
  "password": "<user_password>"
}
```

---

### 3.3 Organization Registration Workflow (`/api/v1/registrations`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/v1/registrations` | Public | Submits new organization application and uploaded PDF licensing dossier. |
| `GET` | `/api/v1/registrations/track/:code` | Public | Retrieves approval status using unique tracking code. |
| `POST` | `/api/v1/registrations/resubmit` | Public | Resubmits updated licensing documents following regulatory clarification requests. |

---

### 3.4 DGDA Regulatory Administration (`/api/v1/admin`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/admin/dashboard` | Admin | Retrieves system-wide operational metrics, organization counts, and audit logs. |
| `GET` | `/api/v1/admin/registrations` | Admin | Lists pending, approved, and rejected organization applications. |
| `PUT` | `/api/v1/admin/registrations/:id/review` | Admin | Approves or rejects registration dossier, assigning capacity limits. |
| `GET` | `/api/v1/admin/organizations` | Admin | Lists all registered tenant organizations with status toggles. |
| `GET` | `/api/v1/admin/users` | Admin | Lists system user directory with Bcrypt audit info and lockout states. |
| `PUT` | `/api/v1/admin/users/:id/reset-lockout` | Admin | Clears account lockout and failed attempt counters. |

---

### 3.5 Pharmaceutical Manufacturer Operations (`/api/v1/manufacturer`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/manufacturer/products` | Manufacturer | Retrieves medicine products registered by the authenticated manufacturer. |
| `POST` | `/api/v1/manufacturer/products` | Manufacturer | Registers a new medicine product with GTIN-14 and dosage specifications. |
| `GET` | `/api/v1/manufacturer/batches` | Manufacturer | Lists production batches with QA release and packaging statuses. |
| `POST` | `/api/v1/manufacturer/batches` | Manufacturer | Registers a new manufacturing batch under a product. |
| `POST` | `/api/v1/manufacturer/batches/:id/qa-release`| Manufacturer | Certifies analytical laboratory QA compliance, releasing batch for serialization.|
| `POST` | `/api/v1/manufacturer/packages/generate` | Manufacturer | Allocates GS1 DataMatrix serialized packages for a QA-released batch. |

#### Serialization Generation Request Payload
```json
{
  "batchId": 12,
  "unitQuantity": 20,
  "packagingLevel": "UNIT_CARTON"
}
```

---

### 3.6 Multi-Echelon Logistics & Shipments (`/api/v1/shipments`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/shipments` | Supply Chain Roles | Lists inbound and outbound shipments for authenticated organization. |
| `POST` | `/api/v1/shipments` | Mfg / Dist / Whol | Creates outbound shipment manifest binding serialized packages to recipient. |
| `GET` | `/api/v1/shipments/:id` | Supply Chain Roles | Retrieves shipment manifest details and itemized packages. |
| `POST` | `/api/v1/shipments/:id/receive` | Dist / Whol / Pharm | Inbound intake scan verifying physical packages and recording item dispositions. |

#### Inbound Receiving Request Payload
```json
{
  "receivedItems": [
    { "serialNumber": "SN-NX-B26-01-00001", "disposition": "ACCEPT" },
    { "serialNumber": "SN-NX-B26-01-00002", "disposition": "DAMAGED_DISPOSITION", "reason": "Torn seal" }
  ]
}
```

---

### 3.7 Public Consumer Verification (`/api/v1/verify`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/verify` | Public | Queries package verification status and 7-stage custody timeline via `?serial=...`. |
| `POST` | `/api/v1/verify/report` | Public | Submits consumer fraud, counterfeit packaging, or adverse event report. |

#### Public Verification Response Sample
```json
{
  "success": true,
  "data": {
    "serialNumber": "SN-NX-B26-01-00001",
    "status": "verified",
    "message": "This package matches a recorded, unbroken supply-chain journey.",
    "product": {
      "brandName": "Napa Extra",
      "genericName": "Paracetamol 500mg + Caffeine 65mg",
      "dosage": "500mg/65mg Tablet",
      "gtin": "10890123456789",
      "manufacturer": "Apex Pharma Ltd"
    },
    "batch": {
      "batchNumber": "B26-01",
      "manufacturingDate": "2026-01-15",
      "expirationDate": "2028-11-30"
    },
    "timeline": [
      {
        "stage": "FACTORY_QA_RELEASE",
        "organization": "Apex Pharma Ltd",
        "timestamp": "2026-01-20T10:00:00Z"
      },
      {
        "stage": "DISTRIBUTOR_INTAKE",
        "organization": "Central Logistics Ltd",
        "timestamp": "2026-01-22T14:30:00Z"
      },
      {
        "stage": "WHOLESALER_INTAKE",
        "organization": "Wholesale Depot Ltd",
        "timestamp": "2026-01-24T09:15:00Z"
      },
      {
        "stage": "PHARMACY_SHELF",
        "organization": "PharmaTrace Model Pharmacy",
        "timestamp": "2026-01-25T11:00:00Z"
      }
    ]
  }
}
```

---

### 3.8 Regulatory Investigation & Surveillance (`/api/v1/investigator`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/investigator/dashboard` | Investigator | Summary KPIs (open alerts, active cases, discrepant packages). |
| `GET` | `/api/v1/investigator/activity` | Investigator | Live audit and activity stream across the supply chain. |
| `GET` | `/api/v1/investigator/alerts` | Investigator | Retrieves real-time anomaly alerts flagged by heuristic screening. |
| `GET` | `/api/v1/investigator/alerts/:id` | Investigator | Detailed context on a single alert record. |
| `PATCH`| `/api/v1/investigator/alerts/:id/status`| Investigator | Updates alert status (`TRIAGED`, `INVESTIGATING`, `RESOLVED`, `DISMISSED`). |
| `POST` | `/api/v1/investigator/alerts/scan` | Investigator | Triggers manual execution of the 5 deterministic detection rules. |
| `GET` | `/api/v1/investigator/search` | Investigator | Multi-criteria search across packages, batches, and custody events. |
| `GET` | `/api/v1/investigator/packages/:serial`| Investigator | Full provenance lifecycle trace for a specific serial. |
| `GET` | `/api/v1/investigator/cases` | Investigator | Lists formal regulatory investigation dossiers (`INV-YYYY-XXXX`). |
| `POST` | `/api/v1/investigator/cases` | Investigator | Launches new regulatory investigation dossier. |
| `GET` | `/api/v1/investigator/cases/:id` | Investigator | Full case details, findings, suspects, and audit trail. |
| `PATCH`| `/api/v1/investigator/cases/:id` | Investigator | Updates case status, priority, findings, or resolution. |
| `POST` | `/api/v1/investigator/cases/:id/evidence`| Investigator | Attaches evidence exhibits to an open case file. |
| `GET` | `/api/v1/investigator/officers` | Investigator | Directory of active regulatory officers for case assignment. |

---

## 4. Related Documentation
- [System Architecture Guide](../architecture/system-architecture.md): Multi-tier system topology.
- [Security Architecture Guide](../security/security-architecture.md): CSRF and authentication protocols.
- [Database Architecture Guide](../architecture/database-architecture.md): Relational tables backing these endpoints.
