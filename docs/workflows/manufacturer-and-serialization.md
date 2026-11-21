# PharmaTrace AI — Manufacturer Production, QA Release & GS1 Serialization

This document details the operational workflow followed by licensed pharmaceutical manufacturers to register medicine products, execute production batches, certify quality assurance (QA) analytical releases, generate cryptographically verifiable GS1 DataMatrix serialized barcodes, and assemble outbound logistics shipments.

---

## 1. Manufacturing Lifecycle Architecture

The manufacturing lifecycle guarantees that only authorized medicines produced under strict Good Manufacturing Practice (GMP) standards can receive serialized identity labels. Serialization is impossible without formal QA release sign-off.

```mermaid
flowchart TD
    subgraph ProductCatalog["1. Product Master Catalog"]
        RegMedicine[Register Medicine Product] --> AssignGTIN[Assign & Validate GTIN-14]
        AssignGTIN --> SetDosage[Specify Dosage, Storage & Shelf Life]
    end

    subgraph BatchProduction["2. Batch Production & QA Sign-Off"]
        CreateBatch[Create Production Batch\nBatch #, Mfg Date, Exp Date] --> InProduction[Batch Status: IN_PRODUCTION]
        InProduction --> LabAnalysis[Perform Laboratory QA Assay]
        LabAnalysis --> QASignOff{QA Officer Analytical Release}
        QASignOff -->|Failed Specs| BatchQuarantine[Status: QUARANTINED / REJECTED\nZero Serial Allocation Allowed]
        QASignOff -->|Certified Compliant| BatchRelease[Status: RELEASED\nCryptographic QA Hash Applied]
    end

    subgraph SerializationEngine["3. GS1 Serialization Engine"]
        BatchRelease --> RequestSerials[Request Serial Generation\nSpecify Unit Quantity]
        RequestSerials --> GS1Builder[Generate GS1 Application Identifiers\nAI(01), AI(21), AI(17), AI(10)]
        GS1Builder --> InsertPackages[(MariaDB: serialized_packages)]
        InsertPackages --> RenderMatrix[Render 2D Barcode via bwip-js\nVector SVG / High-Res PNG]
    end

    subgraph OutboundDispatch["4. Logistics Dispatch"]
        RenderMatrix --> CreateManifest[Build Outbound Shipment Manifest]
        CreateManifest --> SelectDistributor[Bind to Licensed Central Distributor]
        SelectDistributor --> DispatchShipment[Status: IN_TRANSIT\nInitial Custody Handoff Recorded]
    end
```

---

## 2. Phase 1: Medicine Product Master Registration

1. **Accessing the Catalog:** The manufacturer navigates to `/manufacturer/products-batches`.
2. **Product Attributes:**
   - **Trade Brand Name:** e.g., *Napa Extra*
   - **Generic Formulation:** *Paracetamol 500 mg + Caffeine 65 mg*
   - **Dosage Form:** Tablet, Capsule, Oral Liquid, Injectable, Ointment.
   - **Global Trade Item Number (GTIN-14):** A globally unique 14-digit numeric code conforming to GS1 General Specifications (e.g., `10890123456789`).
   - **Storage Requirements:** Temperature range (e.g., *Store below 25°C in a dry place, protected from direct sunlight*), humidity constraints.
   - **DGDA Registration Certificate:** Official regulatory drug marketing authorization number.

---

## 3. Phase 2: Production Batch & Quality Assurance Sign-Off

1. **Batch Initiation:**
   - The production manager creates a batch under the registered product.
   - Sets Batch Number (e.g., `B26-01`), Total Unit Target (e.g., `10,000` cartons), Manufacturing Date, and Expiration Date.
   - Initial batch state is set to `IN_PRODUCTION`.
2. **Quality Control & Laboratory Release:**
   - Once manufacturing finishes, analytical laboratory chemists perform dissolution, assay, and purity testing.
   - The designated Quality Assurance Officer logs in to certify compliance.
   - Clicking **"Certify QA Release"** prompts the officer for their digital credentials and release notes.
   - An atomic MariaDB transaction updates the batch state to `RELEASED`, records `qa_released_by`, `qa_released_at`, and generates a tamper-evident audit log entry.
   - **Security Invariant:** If a batch is in `IN_PRODUCTION`, `QUARANTINED`, or `EXPIRED` status, the serialization engine strictly blocks serial number generation requests.

---

## 4. Phase 3: GS1 DataMatrix Serialization Engine

Upon QA release, unit carton serialization is executed via `server/src/services/serialization.service.js` and rendered in the browser via `bwip-js`:

### GS1 Application Identifiers (AI) Encoding
Each serialized pharmaceutical unit is assigned a composite GS1 2D DataMatrix barcode encoding four standardized Application Identifiers:

$$\text{DataMatrix Payload} = \text{(01)}\text{GTIN} + \text{(21)}\text{Serial} + \text{(17)}\text{YYMMDD} + \text{(10)}\text{Batch}$$

| Identifier | GS1 Semantics | Format | Example Value |
| :--- | :--- | :--- | :--- |
| **AI (01)** | Global Trade Item Number | Fixed 14 numeric digits | `10890123456789` |
| **AI (21)** | Item-Level Serial Number | Variable alphanumeric (up to 20 chars) | `SN-NX-B26-01-00001` |
| **AI (17)** | Expiration Date | Fixed 6 digits (`YYMMDD`) | `281130` (November 30, 2028) |
| **AI (10)** | Production Batch Number | Variable alphanumeric (up to 20 chars) | `B26-01` |

### Client-Side Vector Label Generation via `bwip-js`
To avoid server bottlenecking during high-volume label printing, PharmaTrace AI offloads barcode rendering to the client browser using `bwip-js`:
- Renders crisp vector SVG or high-resolution PNG labels suitable for industrial thermal transfer printers (Zebra, Honeywell, Sato).
- Incorporates human-readable interpretation (HRI) lines beneath the 2D matrix code for manual visual inspection by pharmacists and consumers.

---

## 5. Phase 4: Logistics Packaging & Outbound Shipment Creation

1. **Manifest Assembly:**
   - The manufacturer selects a target licensed Central Distributor (e.g., *PharmaTrace Dev Central Logistics Ltd*).
   - Specifies transport mode, temperature monitoring vehicle requirements, and bill of lading number.
2. **Serial Binding:**
   - The manufacturer binds the generated serial numbers to the shipment manifest (`shipment_items`).
   - The shipment transitions to `IN_TRANSIT`.
   - Initial custody event is appended to `custody_events` with `from_org = manufacturer_id`, `to_org = distributor_id`, `event_type = 'DISPATCH'`.
   - Packages are now locked against further local modification until intake is acknowledged by the recipient.

---

## 6. Related Documentation
- [Visual Application Gallery: Manufacturer Portal](../screenshots/README.md#5-pharmaceutical-manufacturer-portal--batch-lifecycle)
- [Visual Application Gallery: Serialization Registry](../screenshots/README.md#6-gs1-datamatrix-serialization-registry--batch-allocation)
- [Custody Transfer & Shipment Workflow](shipment-and-custody.md): Intermediate logistics and receiving.
- [Public Verification Workflow](public-verification.md): Consumer verification journey.
