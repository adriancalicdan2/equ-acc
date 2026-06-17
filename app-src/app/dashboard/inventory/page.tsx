'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext';
import { firestore } from '@/lib/firebase/client';
import { collection, onSnapshot, query, orderBy, doc, setDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { 
  Briefcase, Search, Plus, Loader2, X, AlertCircle, Trash2, ArrowLeft,
  Calendar, Info, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DeploymentRecord {
  vesselName: string;
  date: string;
  engineer: string;
  qty: number;
  reportId: string;
}

export default function InventoryControlPage() {
  const router = useRouter();
  const { user, isAdmin, allowedViews, loading } = useAuth();

  // Inventory list and detail overlays states
  const [inventory, setInventory] = useState<any[]>([]);
  const [vesselReports, setVesselReports] = useState<any[]>([]);
  const [inventorySearch, setInventorySearch] = useState('');
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<any | null>(null);
  
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [showDefectiveModal, setShowDefectiveModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAddCustomItemModal, setShowAddCustomItemModal] = useState(false);
  const [isSubmittingInventory, setIsSubmittingInventory] = useState(false);

  // Form states for Logging Stock Arrival
  const [arrivalQty, setArrivalQty] = useState('1');
  const [arrivalType, setArrivalType] = useState<'New Arrival' | 'Found Item'>('New Arrival');
  const [arrivalSource, setArrivalSource] = useState('');
  const [arrivalDate, setArrivalDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Form states for Marking Defective
  const [defectiveQty, setDefectiveQty] = useState('1');
  const [defectiveRemarks, setDefectiveRemarks] = useState('');
  const [defectiveDate, setDefectiveDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Form states for Custom Item
  const [customItemName, setCustomItemName] = useState('');
  const [customItemCode, setCustomItemCode] = useState('');
  const [customItemCategory, setCustomItemCategory] = useState<'device' | 'bracket'>('device');
  const [customItemInitialStock, setCustomItemInitialStock] = useState('0');
  const [customItemInitialSource, setCustomItemInitialSource] = useState('Initial Setup');

  // Inventory logs detail modal tabs & pages
  const [detailActiveTab, setDetailActiveTab] = useState<'deployments' | 'arrivals' | 'defective'>('deployments');
  const [detailPage, setDetailPage] = useState(1);
  const rowsPerPage = 10;

  // Access check
  useEffect(() => {
    if (!loading && user && !isAdmin && allowedViews && !allowedViews.includes('inventory')) {
      toast.error('Access denied: Inventory Control is not in your allowed views.');
      router.replace('/dashboard/equipment-accountability');
    }
  }, [user, isAdmin, allowedViews, loading, router]);

  // Subscribe to Equipment Accountability reports
  useEffect(() => {
    if (!user) return;
    const q = query(collection(firestore, 'reports'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setVesselReports(snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })));
    });
    return () => unsubscribe();
  }, [user]);

  // Subscribe to inventory collection and initialize defaults if empty
  useEffect(() => {
    if (!user) return;
    const q = query(collection(firestore, 'inventory'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Delete old fls-floater if it exists and migrate to fls-floater-m and fls-floater-std
      const hasOldFloater = docs.some(d => d.id === 'fls-floater');
      if (hasOldFloater) {
        try {
          const { deleteDoc, doc, setDoc } = await import('firebase/firestore');
          await deleteDoc(doc(firestore, 'inventory', 'fls-floater'));
          await setDoc(doc(firestore, 'inventory', 'fls-floater-m'), {
            name: 'FLS Floater SP2.0AR(M)',
            deviceCode: 'SP2.0AR(M)',
            category: 'device',
            arrivalsLog: [],
            defectiveLog: [],
            createdAt: new Date()
          });
          await setDoc(doc(firestore, 'inventory', 'fls-floater-std'), {
            name: 'FLS Floater SP2.0AR',
            deviceCode: 'SP2.0AR',
            category: 'device',
            arrivalsLog: [],
            defectiveLog: [],
            createdAt: new Date()
          });
          console.log('Migrated FLS Floater items successfully');
        } catch (err) {
          console.error('Failed to migrate FLS Floater items:', err);
        }
        return;
      }

      // Seed missing floaters if not present
      const hasFloaterM = docs.some(d => d.id === 'fls-floater-m');
      const hasFloaterStd = docs.some(d => d.id === 'fls-floater-std');
      if (!hasFloaterM && !hasFloaterStd && docs.length > 0) {
        try {
          const { doc, setDoc } = await import('firebase/firestore');
          await setDoc(doc(firestore, 'inventory', 'fls-floater-m'), {
            name: 'FLS Floater SP2.0AR(M)',
            deviceCode: 'SP2.0AR(M)',
            category: 'device',
            arrivalsLog: [],
            defectiveLog: [],
            createdAt: new Date()
          });
          await setDoc(doc(firestore, 'inventory', 'fls-floater-std'), {
            name: 'FLS Floater SP2.0AR',
            deviceCode: 'SP2.0AR',
            category: 'device',
            arrivalsLog: [],
            defectiveLog: [],
            createdAt: new Date()
          });
        } catch (err) {
          console.error('Failed to seed missing floater items:', err);
        }
        return;
      }

      if (docs.length === 0) {
        const defaultItems = [
          { id: 'terminal', name: 'Solar Terminal', deviceCode: 'Solar Panel Terminal', category: 'device', arrivalsLog: [], defectiveLog: [] },
          { id: 'nr', name: 'NR (Network Transmitter)', deviceCode: 'Wireless Network Transmitter', category: 'device', arrivalsLog: [], defectiveLog: [] },
          { id: 'sd', name: 'SD (Engine Hours Monitor)', deviceCode: 'Working Hours Engine Monitor', category: 'device', arrivalsLog: [], defectiveLog: [] },
          { id: 'fls-floater-m', name: 'FLS Floater SP2.0AR(M)', deviceCode: 'SP2.0AR(M)', category: 'device', arrivalsLog: [], defectiveLog: [] },
          { id: 'fls-floater-std', name: 'FLS Floater SP2.0AR', deviceCode: 'SP2.0AR', category: 'device', arrivalsLog: [], defectiveLog: [] },
          { id: 'fls-capacitance', name: 'FLS Capacitance', deviceCode: 'VPS1.2', category: 'device', arrivalsLog: [], defectiveLog: [] },
          { id: 'bracket-terminal', name: 'Terminal bracket', deviceCode: 'Solar Terminal Bracket', category: 'bracket', arrivalsLog: [], defectiveLog: [] },
          { id: 'bracket-sd', name: 'SD bracket', deviceCode: 'Engine Hours Monitor Bracket', category: 'bracket', arrivalsLog: [], defectiveLog: [] },
          { id: 'bracket-nr', name: 'NR bracket', deviceCode: 'Network Transmitter Bracket', category: 'bracket', arrivalsLog: [], defectiveLog: [] },
          { id: 'bracket-sp2', name: 'SP2.0 Bracket', deviceCode: 'FLS Floater Bracket', category: 'bracket', arrivalsLog: [], defectiveLog: [] }
        ];
        
        for (const item of defaultItems) {
          try {
            await setDoc(doc(firestore, 'inventory', item.id), {
              name: item.name,
              deviceCode: item.deviceCode,
              category: item.category,
              arrivalsLog: item.arrivalsLog,
              defectiveLog: item.defectiveLog,
              createdAt: new Date()
            });
          } catch (err) {
            console.error('Failed to initialize default item:', item.id, err);
          }
        }
      } else {
        setInventory(docs);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Deployed hardware counts calculated dynamically from vessel reports
  const getDeployedCount = (itemId: string): number => {
    let count = 0;
    vesselReports.forEach(report => {
      if (itemId === 'terminal' || itemId === 'bracket-terminal') {
        count += parseInt(report.solar?.qty || '0', 10) || 0;
      } else if (itemId === 'nr' || itemId === 'bracket-nr') {
        count += parseInt(report.network?.qty || '0', 10) || 0;
      } else if (itemId === 'sd' || itemId === 'bracket-sd') {
        count += parseInt(report.engine?.qty || '0', 10) || 0;
      } else if (itemId === 'fls-floater-m') {
        const sns = (report.flsFloater?.serialNumber || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        count += sns.filter((sn: string) => {
          const digits = sn.replace(/\D/g, '');
          return digits ? parseInt(digits, 10) % 2 !== 0 : false;
        }).length;
      } else if (itemId === 'fls-floater-std') {
        const sns = (report.flsFloater?.serialNumber || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        count += sns.filter((sn: string) => {
          const digits = sn.replace(/\D/g, '');
          return digits ? parseInt(digits, 10) % 2 === 0 : false;
        }).length;
      } else if (itemId === 'fls-capacitance') {
        count += parseInt(report.flsCapacitance?.qty || '0', 10) || 0;
      } else if (itemId === 'bracket-sp2') {
        const sns = (report.flsFloater?.serialNumber || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        count += sns.length;
      }
    });
    return count;
  };

  const getDeploymentHistory = (itemId: string): DeploymentRecord[] => {
    const history: DeploymentRecord[] = [];
    vesselReports.forEach(report => {
      let qty = 0;
      if (itemId === 'terminal' || itemId === 'bracket-terminal') {
        qty = parseInt(report.solar?.qty || '0', 10) || 0;
      } else if (itemId === 'nr' || itemId === 'bracket-nr') {
        qty = parseInt(report.network?.qty || '0', 10) || 0;
      } else if (itemId === 'sd' || itemId === 'bracket-sd') {
        qty = parseInt(report.engine?.qty || '0', 10) || 0;
      } else if (itemId === 'fls-floater-m') {
        const sns = (report.flsFloater?.serialNumber || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        qty = sns.filter((sn: string) => {
          const digits = sn.replace(/\D/g, '');
          return digits ? parseInt(digits, 10) % 2 !== 0 : false;
        }).length;
      } else if (itemId === 'fls-floater-std') {
        const sns = (report.flsFloater?.serialNumber || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        qty = sns.filter((sn: string) => {
          const digits = sn.replace(/\D/g, '');
          return digits ? parseInt(digits, 10) % 2 === 0 : false;
        }).length;
      } else if (itemId === 'fls-capacitance') {
        qty = parseInt(report.flsCapacitance?.qty || '0', 10) || 0;
      } else if (itemId === 'bracket-sp2') {
        const sns = (report.flsFloater?.serialNumber || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        qty = sns.length;
      }
      
      if (qty > 0) {
        history.push({
          vesselName: report.vesselInfo?.vesselName || 'Unnamed Vessel',
          date: report.vesselInfo?.installationDate || '',
          engineer: report.vesselInfo?.leadEngineer || '',
          qty,
          reportId: report.id
        });
      }
    });
    return history;
  };

  // Log Arrival Submit Handler
  const handleAddArrival = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInventoryItem) return;
    const qty = parseInt(arrivalQty, 10);
    if (isNaN(qty) || qty <= 0) { toast.error('Quantity must be a positive number'); return; }
    
    setIsSubmittingInventory(true);
    try {
      const newArrival = {
        qty,
        type: arrivalType,
        source: arrivalSource.trim() || 'Not specified',
        date: arrivalDate
      };
      const currentArrivals = selectedInventoryItem.arrivalsLog || [];
      const updatedArrivals = [...currentArrivals, newArrival];
      
      await setDoc(doc(firestore, 'inventory', selectedInventoryItem.id), {
        arrivalsLog: updatedArrivals
      }, { merge: true });
      
      toast.success(`Logged arrival of ${qty} units successfully!`);
      
      setSelectedInventoryItem((prev: any) => ({
        ...prev,
        arrivalsLog: updatedArrivals
      }));
      
      setShowArrivalModal(false);
      setArrivalQty('1');
      setArrivalSource('');
    } catch (err: any) {
      toast.error('Failed to log arrival: ' + err.message);
    } finally {
      setIsSubmittingInventory(false);
    }
  };

  // Report Defective Submit Handler
  const handleAddDefective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInventoryItem) return;
    const qty = parseInt(defectiveQty, 10);
    if (isNaN(qty) || qty <= 0) { toast.error('Quantity must be a positive number'); return; }
    
    setIsSubmittingInventory(true);
    try {
      const newDefective = {
        qty,
        remarks: defectiveRemarks.trim() || 'No remarks',
        date: defectiveDate
      };
      const currentDefective = selectedInventoryItem.defectiveLog || [];
      const updatedDefective = [...currentDefective, newDefective];
      
      await setDoc(doc(firestore, 'inventory', selectedInventoryItem.id), {
        defectiveLog: updatedDefective
      }, { merge: true });
      
      toast.success(`Logged ${qty} defective units successfully!`);
      
      setSelectedInventoryItem((prev: any) => ({
        ...prev,
        defectiveLog: updatedDefective
      }));
      
      setShowDefectiveModal(false);
      setDefectiveQty('1');
      setDefectiveRemarks('');
    } catch (err: any) {
      toast.error('Failed to log defective item: ' + err.message);
    } finally {
      setIsSubmittingInventory(false);
    }
  };

  // Create Custom Item Handler
  const handleAddCustomItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customItemName.trim()) { toast.error('Item Name is required'); return; }
    const name = customItemName.trim();
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const initialQty = parseInt(customItemInitialStock, 10) || 0;
    
    setIsSubmittingInventory(true);
    try {
      const arrivalsLog = initialQty > 0 ? [{
        qty: initialQty,
        type: 'New Arrival' as const,
        source: customItemInitialSource.trim() || 'Initial Setup',
        date: format(new Date(), 'yyyy-MM-dd')
      }] : [];
      
      await setDoc(doc(firestore, 'inventory', id), {
        name,
        deviceCode: customItemCode.trim() || name,
        category: customItemCategory,
        arrivalsLog,
        defectiveLog: [],
        createdAt: new Date()
      });
      
      toast.success(`Custom item "${name}" created successfully!`);
      setShowAddCustomItemModal(false);
      setCustomItemName('');
      setCustomItemCode('');
      setCustomItemInitialStock('0');
    } catch (err: any) {
      toast.error('Failed to create custom item: ' + err.message);
    } finally {
      setIsSubmittingInventory(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const hasAccess = isAdmin || (allowedViews && allowedViews.includes('inventory'));
  if (!user || !hasAccess) return null;

  const inputCls = 'bg-muted/40 border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all text-xs h-9 px-3 w-64 outline-none text-white rounded-lg border';

  return (
    <div className="min-h-screen pb-16">
      {/* Hero */}
      <div className="max-w-7xl mx-auto px-4 pt-10 pb-6 animate-fadeIn">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-3">
          <Briefcase className="w-3.5 h-3.5" />
          Hardware & Parts Ledger
        </div>
        <h1 className="text-3xl font-extrabold text-foreground">Inventory Control</h1>
        <p className="text-muted-foreground text-sm mt-1">Review deployment reports, view history, and trace hardware stock levels.</p>
      </div>

      <div className="max-w-7xl mx-auto px-4 space-y-6">
        {/* Controls Bar */}
        <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 className="font-semibold text-base text-foreground flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-primary" /> Inventory Stock Ledger
            </h2>
            <p className="text-muted-foreground text-xs mt-0.5">Auto-deducted deployed units from vessel deployment reports, manual defective logs, and arrival tracking.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
              <input
                type="text"
                placeholder="Search inventory..."
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                className={cn(inputCls, 'pl-9')}
              />
            </div>
            <Button 
              onClick={() => setShowAddCustomItemModal(true)}
              className="h-9 px-4 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/95 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add Custom Item
            </Button>
          </div>
        </div>

        {/* Inventory Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {inventory.filter(item => 
            (item.name || '').toLowerCase().includes(inventorySearch.toLowerCase()) ||
            (item.deviceCode || '').toLowerCase().includes(inventorySearch.toLowerCase())
          ).map((item) => {
            const totalStockIn = (item.arrivalsLog || []).reduce((acc: number, log: any) => acc + log.qty, 0);
            const totalDeployed = getDeployedCount(item.id);
            const totalDefective = (item.defectiveLog || []).reduce((acc: number, log: any) => acc + log.qty, 0);
            const availableStock = totalStockIn - totalDeployed - totalDefective;
            const isLowStock = availableStock <= 5;

            return (
              <div key={item.id} className="bg-card border border-border/60 rounded-2xl p-5 shadow-md flex flex-col justify-between hover:border-primary/40 transition-all duration-300 relative overflow-hidden group">
                <div className="space-y-4">
                  {/* Top Header */}
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-foreground truncate">{item.name}</h3>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">{item.deviceCode}</p>
                    </div>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        'text-[9px] uppercase tracking-wider px-2 shrink-0 border-border/50 text-muted-foreground'
                      )}
                    >
                      {item.category}
                    </Badge>
                  </div>

                  {/* Large Available stock count */}
                  <div className="flex items-baseline gap-2 pt-2">
                    <span className={cn('text-3xl font-extrabold tracking-tight', isLowStock ? 'text-destructive' : 'text-primary')}>
                      {availableStock}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">available units</span>
                    {isLowStock ? (
                      <Badge className="ml-auto bg-destructive/10 text-destructive border-destructive/20 text-[9px] hover:bg-destructive/15">Low Stock</Badge>
                    ) : (
                      <Badge className="ml-auto bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] hover:bg-emerald-500/15">In Stock</Badge>
                    )}
                  </div>

                  {/* Stat summary grid */}
                  <div className="grid grid-cols-3 gap-2 py-3 px-3.5 bg-muted/20 border border-border/40 rounded-xl text-center text-[11px]">
                    <div>
                      <p className="text-muted-foreground text-[10px] uppercase font-semibold">Total In</p>
                      <p className="font-bold text-foreground mt-0.5">{totalStockIn}</p>
                    </div>
                    <div className="border-x border-border/40">
                      <p className="text-muted-foreground text-[10px] uppercase font-semibold">Deployed</p>
                      <p className="font-bold text-foreground mt-0.5">{totalDeployed}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[10px] uppercase font-semibold">Defective</p>
                      <p className="font-bold text-foreground mt-0.5">{totalDefective}</p>
                    </div>
                  </div>
                </div>

                {/* Actions Grid */}
                <div className="grid grid-cols-3 gap-2 mt-5 pt-3 border-t border-border/40">
                  <button
                    onClick={() => {
                      setSelectedInventoryItem(item);
                      setArrivalDate(format(new Date(), 'yyyy-MM-dd'));
                      setShowArrivalModal(true);
                    }}
                    className="py-2 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all rounded-lg cursor-pointer"
                  >
                    Log Arrival
                  </button>
                  <button
                    onClick={() => {
                      setSelectedInventoryItem(item);
                      setDefectiveRemarks('');
                      setDefectiveDate(format(new Date(), 'yyyy-MM-dd'));
                      setShowDefectiveModal(true);
                    }}
                    className="py-2 text-[10px] font-semibold text-destructive bg-destructive/10 border border-destructive/20 hover:bg-destructive/20 transition-all rounded-lg cursor-pointer"
                  >
                    Defective
                  </button>
                  <button
                    onClick={() => {
                      setSelectedInventoryItem(item);
                      setDetailActiveTab('deployments');
                      setDetailPage(1);
                      setShowDetailModal(true);
                    }}
                    className="py-2 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all rounded-lg cursor-pointer animate-pulse"
                  >
                    Ledger Log
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* LOG ARRIVAL MODAL */}
      {showArrivalModal && selectedInventoryItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-md p-4 animate-fadeIn">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl relative animate-fadeInUp">
            <button onClick={() => setShowArrivalModal(false)} className="absolute top-4 right-4 p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"><X className="w-4 h-4" /></button>
            <h3 className="font-bold text-lg text-foreground mb-1">Log Stock Arrival</h3>
            <p className="text-xs text-muted-foreground mb-4">Item: <span className="text-primary font-medium">{selectedInventoryItem.name}</span></p>
            <form onSubmit={handleAddArrival} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Arrival Quantity</label>
                <input type="number" min="1" value={arrivalQty} onChange={e => setArrivalQty(e.target.value)} className="bg-muted/50 border-border text-foreground focus:border-primary/50 text-sm h-10 px-3 w-full rounded-lg border outline-none" required />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Arrival Reason / Type</label>
                <select value={arrivalType} onChange={e => setArrivalType(e.target.value as any)} className="bg-muted/50 border-border text-foreground focus:border-primary/50 text-sm h-10 px-3 w-full rounded-lg border outline-none">
                  <option value="New Arrival" className="bg-neutral-900 text-white">New Stock Arrival</option>
                  <option value="Found Item" className="bg-neutral-900 text-white">Found / Recovered Item</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supplier / Source</label>
                <input type="text" placeholder="e.g. AIMF Supplier / Manila Office" value={arrivalSource} onChange={e => setArrivalSource(e.target.value)} className="bg-muted/50 border-border text-foreground focus:border-primary/50 text-sm h-10 px-3 w-full rounded-lg border outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Arrival Date</label>
                <input type="date" value={arrivalDate} onChange={e => setArrivalDate(e.target.value)} className="bg-muted/50 border-border text-foreground focus:border-primary/50 text-sm h-10 px-3 w-full rounded-lg border outline-none" required />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowArrivalModal(false)} className="h-9 text-xs border-border bg-transparent text-foreground hover:bg-muted">Cancel</Button>
                <Button type="submit" disabled={isSubmittingInventory} className="h-9 text-xs bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-700">
                  {isSubmittingInventory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Log Stock In'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MARK DEFECTIVE MODAL */}
      {showDefectiveModal && selectedInventoryItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-md p-4 animate-fadeIn">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl relative animate-fadeInUp">
            <button onClick={() => setShowDefectiveModal(false)} className="absolute top-4 right-4 p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"><X className="w-4 h-4" /></button>
            <h3 className="font-bold text-lg text-destructive mb-1">Log Defective Units</h3>
            <p className="text-xs text-muted-foreground mb-4">Item: <span className="text-primary font-medium">{selectedInventoryItem.name}</span></p>
            <form onSubmit={handleAddDefective} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Defective Quantity</label>
                <input type="number" min="1" value={defectiveQty} onChange={e => setDefectiveQty(e.target.value)} className="bg-muted/50 border-border text-foreground focus:border-primary/50 text-sm h-10 px-3 w-full rounded-lg border outline-none" required />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Issue Remarks / Details</label>
                <textarea rows={3} placeholder="e.g. Damaged screen, sensor calibration error..." value={defectiveRemarks} onChange={e => setDefectiveRemarks(e.target.value)} className="bg-muted/50 border-border text-foreground focus:border-primary/50 text-sm p-3 w-full rounded-lg border outline-none resize-none" required />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Discovery Date</label>
                <input type="date" value={defectiveDate} onChange={e => setDefectiveDate(e.target.value)} className="bg-muted/50 border-border text-foreground focus:border-primary/50 text-sm h-10 px-3 w-full rounded-lg border outline-none" required />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowDefectiveModal(false)} className="h-9 text-xs border-border bg-transparent text-foreground hover:bg-muted">Cancel</Button>
                <Button type="submit" disabled={isSubmittingInventory} className="h-9 text-xs bg-red-600 hover:bg-red-500 text-white border-red-700">
                  {isSubmittingInventory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Log Defective'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD CUSTOM ITEM MODAL */}
      {showAddCustomItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-md p-4 animate-fadeIn">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl relative animate-fadeInUp">
            <button onClick={() => setShowAddCustomItemModal(false)} className="absolute top-4 right-4 p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"><X className="w-4 h-4" /></button>
            <h3 className="font-bold text-lg text-foreground mb-4">Add Custom Ledger Item</h3>
            <form onSubmit={handleAddCustomItem} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Item Name</label>
                <input type="text" placeholder="e.g. VPS1.2 Capacitance Probe" value={customItemName} onChange={e => setCustomItemName(e.target.value)} className="bg-muted/50 border-border text-foreground focus:border-primary/50 text-sm h-10 px-3 w-full rounded-lg border outline-none" required />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Device Model / Code</label>
                <input type="text" placeholder="e.g. VPS1.2" value={customItemCode} onChange={e => setCustomItemCode(e.target.value)} className="bg-muted/50 border-border text-foreground focus:border-primary/50 text-sm h-10 px-3 w-full rounded-lg border outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</label>
                <select value={customItemCategory} onChange={e => setCustomItemCategory(e.target.value as any)} className="bg-muted/50 border-border text-foreground focus:border-primary/50 text-sm h-10 px-3 w-full rounded-lg border outline-none">
                  <option value="device" className="bg-neutral-900 text-white">Device / Core Unit</option>
                  <option value="bracket" className="bg-neutral-900 text-white">Bracket / Installation Accessory</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Initial Stock</label>
                  <input type="number" min="0" value={customItemInitialStock} onChange={e => setCustomItemInitialStock(e.target.value)} className="bg-muted/50 border-border text-foreground focus:border-primary/50 text-sm h-10 px-3 w-full rounded-lg border outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Initial Source</label>
                  <input type="text" placeholder="e.g. Setup" value={customItemInitialSource} onChange={e => setCustomItemInitialSource(e.target.value)} className="bg-muted/50 border-border text-foreground focus:border-primary/50 text-sm h-10 px-3 w-full rounded-lg border outline-none" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowAddCustomItemModal(false)} className="h-9 text-xs border-border bg-transparent text-foreground hover:bg-muted">Cancel</Button>
                <Button type="submit" disabled={isSubmittingInventory} className="h-9 text-xs bg-primary text-primary-foreground">
                  {isSubmittingInventory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create Ledger Item'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LEDGER LOG / HISTORY MODAL */}
      {showDetailModal && selectedInventoryItem && (() => {
        const deployments = getDeploymentHistory(selectedInventoryItem.id);
        const arrivals = selectedInventoryItem.arrivalsLog || [];
        const defective = selectedInventoryItem.defectiveLog || [];

        let activeList: any[] = [];
        if (detailActiveTab === 'deployments') activeList = deployments;
        else if (detailActiveTab === 'arrivals') activeList = arrivals;
        else if (detailActiveTab === 'defective') activeList = defective;

        const totalPages = Math.ceil(activeList.length / rowsPerPage) || 1;
        const paginatedList = activeList.slice((detailPage - 1) * rowsPerPage, detailPage * rowsPerPage);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-md p-4 animate-fadeIn">
            <div className="bg-card border border-border rounded-2xl w-full max-w-2xl p-6 shadow-2xl relative animate-fadeInUp max-h-[85vh] flex flex-col justify-between">
              <button onClick={() => setShowDetailModal(false)} className="absolute top-4 right-4 p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"><X className="w-4 h-4" /></button>
              <div>
                <h3 className="font-bold text-lg text-foreground mb-1">Inventory Ledger History</h3>
                <p className="text-xs text-muted-foreground mb-4">Item: <span className="text-primary font-medium">{selectedInventoryItem.name}</span> ({selectedInventoryItem.deviceCode})</p>

                {/* Sub tabs */}
                <div className="flex border-b border-border/40 gap-3 mb-4 text-xs font-semibold">
                  {[
                    { id: 'deployments', label: `Deployments (${deployments.length})` },
                    { id: 'arrivals', label: `Arrivals (${arrivals.length})` },
                    { id: 'defective', label: `Defective (${defective.length})` }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => { setDetailActiveTab(tab.id as any); setDetailPage(1); }}
                      className={cn(
                        'pb-2 border-b-2 transition-all -mb-px',
                        detailActiveTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Log list */}
                <div className="overflow-x-auto rounded-xl border border-border/40 min-h-[200px]">
                  <table className="w-full text-left text-[11px] font-medium">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border/40 text-muted-foreground font-semibold">
                        {detailActiveTab === 'deployments' && (
                          <>
                            <th className="px-4 py-2.5">Date</th>
                            <th className="px-4 py-2.5">Vessel Name</th>
                            <th className="px-4 py-2.5">Lead Engineer</th>
                            <th className="px-4 py-2.5 text-center">Qty Deployed</th>
                          </>
                        )}
                        {detailActiveTab === 'arrivals' && (
                          <>
                            <th className="px-4 py-2.5">Date</th>
                            <th className="px-4 py-2.5">Supplier / Source</th>
                            <th className="px-4 py-2.5">Type</th>
                            <th className="px-4 py-2.5 text-center">Qty Logged</th>
                          </>
                        )}
                        {detailActiveTab === 'defective' && (
                          <>
                            <th className="px-4 py-2.5">Date</th>
                            <th className="px-4 py-2.5">Discovery Remarks</th>
                            <th className="px-4 py-2.5 text-center">Qty Defective</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedList.length > 0 ? (
                        paginatedList.map((log, idx) => (
                          <tr key={idx} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                            {detailActiveTab === 'deployments' && (
                              <>
                                <td className="px-4 py-2.5 text-muted-foreground">{log.date}</td>
                                <td className="px-4 py-2.5 font-semibold text-foreground">{log.vesselName}</td>
                                <td className="px-4 py-2.5 text-muted-foreground">{log.engineer}</td>
                                <td className="px-4 py-2.5 text-center"><Badge variant="outline" className="border-primary/20 text-primary bg-primary/5">{log.qty} units</Badge></td>
                              </>
                            )}
                            {detailActiveTab === 'arrivals' && (
                              <>
                                <td className="px-4 py-2.5 text-muted-foreground">{log.date}</td>
                                <td className="px-4 py-2.5 font-semibold text-foreground">{log.source}</td>
                                <td className="px-4 py-2.5 text-muted-foreground">{log.type}</td>
                                <td className="px-4 py-2.5 text-center"><Badge variant="outline" className="border-emerald-500/20 text-emerald-400 bg-emerald-500/5">{log.qty} units</Badge></td>
                              </>
                            )}
                            {detailActiveTab === 'defective' && (
                              <>
                                <td className="px-4 py-2.5 text-muted-foreground">{log.date}</td>
                                <td className="px-4 py-2.5 text-foreground max-w-[240px] truncate" title={log.remarks}>{log.remarks}</td>
                                <td className="px-4 py-2.5 text-center"><Badge variant="outline" className="border-red-500/20 text-red-400 bg-red-500/5">{log.qty} units</Badge></td>
                              </>
                            )}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="text-center py-10 text-muted-foreground">No ledger logs recorded for this tab</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 mt-2 border-t border-border/40">
                  <p className="text-[10px] text-muted-foreground">Page {detailPage} of {totalPages}</p>
                  <div className="flex gap-2">
                    <Button onClick={() => setDetailPage(p => Math.max(1, p - 1))} disabled={detailPage === 1} variant="outline" size="sm" className="h-7 text-[10px] border-border bg-transparent text-foreground">Prev</Button>
                    <Button onClick={() => setDetailPage(p => Math.min(totalPages, p + 1))} disabled={detailPage === totalPages} variant="outline" size="sm" className="h-7 text-[10px] border-border bg-transparent text-foreground">Next</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
