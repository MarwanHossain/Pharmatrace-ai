import {LayoutDashboard,Package,Barcode,Truck,Inbox,Boxes,ScanLine,Building2,Users,Bell,Search,FolderSearch} from 'lucide-react'
const L=(label,slug,icon)=>({label,path:slug,icon})
export const ROLES={
manufacturer:{label:'Manufacturer',org:'Meridian Pharma Ltd (demo)',nav:[L('Dashboard','dashboard',LayoutDashboard),L('Products & Batches','products-batches',Package),L('Package Serialization','serialization',Barcode),L('Shipments','shipments',Truck)]},
distributor:{label:'Distributor',org:'Corridor Distribution (demo)',nav:[L('Dashboard','dashboard',LayoutDashboard),L('Incoming Shipments','incoming',Inbox),L('Inventory','inventory',Boxes),L('Outgoing Shipments','outgoing',Truck)]},
wholesaler:{label:'Wholesaler',org:'Riverside Wholesale (demo)',nav:[L('Dashboard','dashboard',LayoutDashboard),L('Incoming Shipments','incoming',Inbox),L('Inventory','inventory',Boxes),L('Outgoing Shipments','outgoing',Truck)]},
pharmacy:{label:'Pharmacy',org:'Greenleaf Pharmacy (demo)',nav:[L('Dashboard','dashboard',LayoutDashboard),L('Incoming Shipments','incoming',Inbox),L('Medicine Inventory','inventory',Boxes),L('Verify & Dispense','verify-dispense',ScanLine)]},
admin:{label:'System Administrator',org:'Platform administration',nav:[L('Dashboard','dashboard',LayoutDashboard),L('Organizations','organizations',Building2),L('User & Access Management','users',Users)]},
investigator:{label:'Investigation Officer',org:'Investigation unit',nav:[L('Dashboard','dashboard',LayoutDashboard),L('Alerts','alerts',Bell),L('Traceability Search','search',Search),L('Investigations','investigations',FolderSearch)]}}
