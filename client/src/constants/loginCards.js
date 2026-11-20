// PharmaTrace AI — Two-Step Login Role Card Definitions
// Strict specification order:
// 1. Log in as System Administrator
// 2. Log in as Investigation Officer
// 3. Log in as Manufacturer
// 4. Log in as Distributor
// 5. Log in as Wholesaler
// 6. Log in as Pharmacy

import {
  Building2,
  FolderSearch,
  Factory,
  Truck,
  Boxes,
  Store
} from 'lucide-react'

export const ROLE_CARDS = [
  {
    key: 'admin',
    title: 'Log in as System Administrator',
    label: 'System Administrator',
    tag: 'DGDA Oversight',
    icon: Building2,
    iconColor: 'text-sky-600',
    iconBg: 'bg-sky-50',
    tagColor: 'bg-sky-100 text-sky-800 border-sky-200',
    description: 'Regulatory oversight, registrations, organization governance, and user access management.',
    welcomeText: 'Sign in to access the DGDA administrative portal, registration queue, and enterprise access controls.',
    isLivePortal: true,
    portalStatusText: 'Live DGDA Administrative Portal'
  },
  {
    key: 'investigator',
    title: 'Log in as Investigation Officer',
    label: 'Investigation Officer',
    tag: 'Enforcement',
    icon: FolderSearch,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-50',
    tagColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    description: 'Traceability audits, anomaly investigation, recall tracking, and supply chain alert monitoring.',
    welcomeText: 'Sign in to access regulatory investigation tools, anomaly alerts, and end-to-end traceability search.',
    isLivePortal: false,
    portalStatusText: 'Regulatory Investigation Service'
  },
  {
    key: 'manufacturer',
    title: 'Log in as Manufacturer',
    label: 'Manufacturer',
    tag: 'Supply Origin',
    icon: Factory,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
    tagColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    description: 'Product master data, production batch registration, GS1 serialization, and regulatory clearance.',
    welcomeText: 'Sign in to manage product master catalog, register production batches, and monitor release status.',
    isLivePortal: true,
    portalStatusText: 'Live Pharmaceutical Manufacturer Portal'
  },
  {
    key: 'distributor',
    title: 'Log in as Distributor',
    label: 'Distributor',
    tag: 'Logistics',
    icon: Truck,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
    tagColor: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'Primary logistics, warehouse custody intake verification, and dispatch shipment management.',
    welcomeText: 'Sign in to manage warehouse custody, incoming shipments, and outbound distribution logistics.',
    isLivePortal: false,
    portalStatusText: 'Supply Chain Distribution Portal'
  },
  {
    key: 'wholesaler',
    title: 'Log in as Wholesaler',
    label: 'Wholesaler',
    tag: 'Wholesale',
    icon: Boxes,
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-50',
    tagColor: 'bg-teal-100 text-teal-800 border-teal-200',
    description: 'Bulk intake custody, distribution staging, inventory management, and secondary fulfillment.',
    welcomeText: 'Sign in to verify wholesale bulk receipts, manage inventory staging, and track dispatch fulfillment.',
    isLivePortal: false,
    portalStatusText: 'Wholesale Fulfillment Portal'
  },
  {
    key: 'pharmacy',
    title: 'Log in as Pharmacy',
    label: 'Pharmacy',
    tag: 'Dispensation',
    icon: Store,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-50',
    tagColor: 'bg-amber-100 text-amber-800 border-amber-200',
    description: 'Point-of-dispense authentication, stock intake verification, and patient medicine safety checks.',
    welcomeText: 'Sign in to authenticate medicine stock, process dispense checks, and ensure patient safety.',
    isLivePortal: false,
    portalStatusText: 'Point of Dispense Portal'
  }
]

export const ROLE_KEY_SET = new Set(ROLE_CARDS.map(r => r.key))
