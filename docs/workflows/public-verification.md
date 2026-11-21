# PharmaTrace AI — Public Consumer Verification & Provenance Journey

This document outlines the public verification interface, barcode scanning protocols, verification response states, provenance timeline rendering, consumer fraud reporting mechanisms, and regulatory disclaimers.

---

## 1. Consumer Transparency Overview

The ultimate goal of pharmaceutical serialization is empowering the final patient or healthcare provider at the dispensary counter to verify that the drug in their hands is authentic, unexpired, and sourced from a recorded, unbroken supply chain.

```mermaid
flowchart TD
    Consumer([Consumer / Healthcare Provider]) --> AccessPortal[Navigate to /verify or Scan 2D Barcode]
    AccessPortal --> InputMethod{Input Mechanism}
    
    InputMethod -->|Smartphone Camera| CameraScan[Live HTML5 Barcode Reader\nExtract AI(01) GTIN & AI(21) Serial]
    InputMethod -->|Manual Entry| ManualInput[Type Serial: SN-NX-B26-01-00001]
    
    CameraScan --> QueryAPI[GET /api/v1/verify?serial=...]
    ManualInput --> QueryAPI
    
    QueryAPI --> VerificationEngine[Public Verification Engine]
    VerificationEngine --> CheckDB[(MariaDB Query:\npackages, batches, products, traceability_events)]
    
    CheckDB --> StateEvaluation{Evaluate Package State}
    
    StateEvaluation -->|Unbroken Custody, In Date, Clean| StateVerified[Status: verified\nGreen Badge + Full Provenance]
    StateEvaluation -->|Quality / Damage Report Active| StateQuarantined[Status: quarantined\nWarning: Quarantined Package]
    StateEvaluation -->|Expired Shelf Life| StateExpired[Status: expired\nWarning: Expired Medication]
    StateEvaluation -->|Rejected by QA / Inspection| StateRejected[Status: rejected\nWarning: Rejected Package]
    StateEvaluation -->|Previously Recorded as Dispensed| StateDispensed[Status: dispensed\nWarning: Previously Dispensed]
    StateEvaluation -->|Not Dispatched by Factory| StateUnshipped[Status: unshipped\nWarning: Withheld at Manufacturer]
    StateEvaluation -->|Reported Missing in Transit| StateMissing[Status: missing\nWarning: Missing in Transit]
    StateEvaluation -->|Serial Does Not Exist| StateInvalid[Status: notFound\nUnregistered Identifier]
    
    StateVerified --> RenderTimeline[Render 7-Stage Chronological Custody Timeline]
    StateQuarantined --> ReportOption[Prompt Consumer Fraud Report: /report]
    StateRejected --> ReportOption
```

---

## 2. Access & Scanning Protocols

1. **Zero Authentication Required:**
   - To maximize public adoption and eliminate barriers during emergencies, the verification portal at `/verify` requires no user account, login, or password.
2. **Dual Verification Channels:**
   - **Camera Barcode Scanning:** Utilizes the HTML5 MediaDevices API (`html5-qrcode`) to access smartphone or webcam video streams. The client-side decoder automatically reads GS1 DataMatrix and QR symbols, parsing out the serial parameter and redirecting immediately to the verification result view.
   - **Manual Alphanumeric Search:** Allows users to manually type the serial number (e.g., `SN-NX-B26-01-00001`) printed beneath the matrix code on the unit carton.

---

## 3. Implemented Verification Response States (`verification.service.js`)

The public verification engine classifies queried packages into nine derived states based on central database records:

| State Code | UI Visual Indicator | System Assessment & Message |
| :--- | :--- | :--- |
| **`verified`** | **Green Verified Badge** | *"This package matches a recorded, unbroken supply-chain journey."* Authentic medicine with valid expiry and unbroken custody. |
| **`expired`** | **Amber Warning Badge** | *"This package is past its expiry date. Do not use it."* Evaluated when package expiration date is prior to current UTC date. |
| **`quarantined`** | **Red Alert Banner** | *"This package has been quarantined due to a quality or damage report. Do not use it; ask your pharmacist."* |
| **`rejected`** | **Red Alert Banner** | *"This package was rejected during regulatory review or receiving inspection. Do not use it."* |
| **`dispensed`** | **Blue Informational Badge**| *"This package has already been recorded as dispensed."* Warns against potential repackaging or duplicate dispensing. |
| **`unshipped`** | **Amber Notice Badge** | *"This serial is registered to the manufacturer, but the package has not been dispatched into the supply chain yet. It should not appear for retail sale."* |
| **`missing`** | **Red Alert Banner** | *"This package was recorded as missing during transit receiving reconciliation. Do not accept this pack."* |
| **`in_transit`** | **Blue Status Badge** | *"This package is currently in transit within the authorized supply chain."* |
| **`notFound`** | **Gray Neutral Shield** | *"This identifier could not be found in the registry. Check for typing errors or ask your pharmacist to inspect the pack."* |

---

## 4. 7-Stage Chronological Custody Timeline

When a package is verified, the UI presents an interactive provenance timeline (see screenshot `14-public-verification-timeline.png`) detailing the recorded lifecycle of that physical unit:

```
[1. Product Registration] ─────── DGDA Drug Authorization (GTIN-14 Assigned)
          │
[2. Factory Production]   ─────── Batch Compounding & Packaging (Apex Pharma Ltd)
          │
[3. Analytical QA Sign-Off] ───── Laboratory Assay Certified Compliant (QA Release)
          │
[4. GS1 Serialization]    ─────── 2D DataMatrix Generated & Applied to Unit Carton
          │
[5. Central Logistics]    ─────── Dispatched to & Accepted by Central Logistics Ltd
          │
[6. Regional Depot]       ─────── Inbound Intake & Verification at Wholesale Depot Ltd
          │
[7. Model Pharmacy]       ─────── Received, Verified & Dispensed at Retail Counter
```

Each stage displays:
- Exact date and UTC timestamp of the custody transfer from `traceability_events`.
- Certified legal name of the handling organization.
- Event type (`REGISTERED`, `RELEASED`, `SERIALIZED`, `DISPATCHED`, `RECEIVED`, `DISPENSED`).

---

## 5. Consumer Fraud & Adverse Event Reporting

If a consumer encounters a `quarantined`, `rejected`, or physically tampered medicine pack:
1. The portal displays a prominent **"Report Suspicious Medicine"** button navigating to `/report?serial=...`.
2. The consumer can submit:
   - Physical purchase location (Store Name, Location/City).
   - Suspected defect (Packaging Discrepancy, Broken Seal, Adverse Reaction).
   - Upload photographic evidence of the carton or blister pack.
   - Contact details for investigator follow-up.
3. Submitting the form creates an incident record in `public_reports`, which immediately surfaces on the DGDA Investigator Surveillance Dashboard.

---

## 6. Academic Prototype & Regulatory Disclaimer

> [!IMPORTANT]
> **ACADEMIC & REGULATORY DISCLAIMER:**
> 
> PharmaTrace AI is an academic software prototype developed for university capstone evaluation. It has **no formal endorsement, accreditation, or legal authorization** from the Directorate General of Drug Administration (DGDA), Bangladesh, or any other government health authority.
> 
> **Digital vs. Chemical Verification:**
> Scanning a GS1 DataMatrix code on this platform verifies only that the digital serialization number exists within the central database and follows a compliant recorded custody progression. **Digital verification does not independently prove or guarantee the chemical purity, active pharmaceutical ingredient (API) concentration, sterility, or physical composition of the drug contents.** Physical testing requires accredited analytical laboratory chromatography (HPLC/GC-MS) under statutory regulatory protocols.

---

## 7. Related Documentation
- [Visual Application Gallery: Public Verification Result](../screenshots/README.md#13-public-consumer-verification-portal--verified-product)
- [Visual Application Gallery: Public Timeline](../screenshots/README.md#14-public-verification--chronological-custody-chain)
- [Regulatory Investigation Workflow](investigation-and-enforcement.md): Handling consumer fraud reports.
- [Anomaly Detection Workflow](anomaly-detection.md): Rules detecting counterfeit duplicate scans.
