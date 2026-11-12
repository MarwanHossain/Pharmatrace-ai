# Pharmatrace-ai

PharmaTrace AI is an AI-assisted pharmaceutical supply-chain traceability platform for medicine verification, package tracking, and suspicious activity detection across the distribution network.

## Frontend (partial build)

Run: `cd client && npm install && npm run dev`

### Implemented
Design tokens (tailwind.config.js), UI kit (`components/ui`), role navigation + app shell (all 6 roles), demo role preview login, Manufacturer Dashboard, Package Serialization (generate/search/filter/drawer), Public Verify (invalid, expired, dispensed, incomplete, unusual, verified states), fixtures with shared IDs.

### Not yet implemented
Manufacturer Products & Batches and Shipments; all Distributor, Wholesaler, Pharmacy, Admin, Investigation screens (routes render an honest placeholder); registration, forgot/reset password; public Report a Problem and a separate Results page; QR scanning; notifications, profile menu, global search; modals/confirmations; responsive table alternatives.

### Notes
Login is a development role preview, not authentication. Fixtures in `src/data/fixtures` are illustrative. Serials are demo strings, not GS1. All state is in memory.
