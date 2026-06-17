'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as secondarySignOut } from 'firebase/auth';
import { firestore, firebaseConfig } from '@/lib/firebase/client';
import { useAuth } from '@/lib/firebase/AuthContext';
import { collection, onSnapshot, query, orderBy, doc, deleteDoc, setDoc } from 'firebase/firestore';
import { 
  ShieldCheck, FileText, Wallet, Search, Trash2, ExternalLink, Download, 
  Loader2, BadgeAlert, Database, Calendar, User, Briefcase, Plus, Users, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

type Tab = 'vessels' | 'petty-cash' | 'serials' | 'employees' | 'inventory';


export default function AdminPage() {
  const router = useRouter();
  const { user, isAdmin, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('vessels');
  const [vesselReports, setVesselReports] = useState<any[]>([]);
  const [pettyCashReports, setPettyCashReports] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  
  const [vesselSearch, setVesselSearch] = useState('');
  const [pettySearch, setPettySearch] = useState('');
  const [serialSearch, setSerialSearch] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');

  const [loadingPC, setLoadingPC] = useState<string | null>(null);

  // Add Employee Form States
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpPassword, setNewEmpPassword] = useState('');
  const [newEmpRole, setNewEmpRole] = useState<'admin' | 'user'>('user');
  const [newEmpAllowedViews, setNewEmpAllowedViews] = useState<string[]>(['equipment-accountability', 'petty-cash']);
  const [newEmpShiftHours, setNewEmpShiftHours] = useState<number>(10);
  const [newEmpRestDays, setNewEmpRestDays] = useState<number[]>([0, 6]); // 0=Sun,6=Sat
  const [isSubmittingEmp, setIsSubmittingEmp] = useState(false);

  // Edit Employee Settings Modal
  const [showEditSettingsModal, setShowEditSettingsModal] = useState(false);
  const [editEmp, setEditEmp] = useState<any | null>(null);
  const [editShiftHours, setEditShiftHours] = useState<number>(10);
  const [editRestDays, setEditRestDays] = useState<number[]>([0, 6]);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Inventory list and detail overlays states
  const [inventory, setInventory] = useState<any[]>([]);
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

  // Device filter for serials tab
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'terminal' | 'nr' | 'sd' | 'fls'>('all');

  // Pagination states
  const [vesselPage, setVesselPage] = useState(1);
  const [pettyPage, setPettyPage] = useState(1);
  const [serialPage, setSerialPage] = useState(1);
  const [employeePage, setEmployeePage] = useState(1);
  const rowsPerPage = 10;

  useEffect(() => { setVesselPage(1); }, [vesselSearch]);
  useEffect(() => { setPettyPage(1); }, [pettySearch]);
  useEffect(() => { setSerialPage(1); }, [serialSearch, deviceFilter]);
  useEffect(() => { setEmployeePage(1); }, [employeeSearch]);



  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      toast.error('Access Denied: Administrators only.');
      router.replace('/dashboard/equipment-accountability');
    }
  }, [user, isAdmin, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }


  // Subscribe to Equipment Accountability reports
  useEffect(() => {
    const q = query(collection(firestore, 'reports'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setVesselReports(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })));
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to Petty Cash reports
  useEffect(() => {
    const q = query(collection(firestore, 'petty-cash-reports'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPettyCashReports(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })));
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to all users
  useEffect(() => {
    const q = query(collection(firestore, 'users'), orderBy('email', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEmployees(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })));
    }, (error) => console.error('Error listening to users:', error));
    return () => unsubscribe();
  }, []);

  // Subscribe to inventory collection and initialize defaults if empty
  useEffect(() => {
    const q = query(collection(firestore, 'inventory'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      if (docs.length === 0) {
        const defaultItems = [
          { id: 'terminal', name: 'Solar Terminal', deviceCode: 'Solar Panel Terminal', category: 'device', arrivalsLog: [], defectiveLog: [] },
          { id: 'nr', name: 'NR (Network Transmitter)', deviceCode: 'Wireless Network Transmitter', category: 'device', arrivalsLog: [], defectiveLog: [] },
          { id: 'sd', name: 'SD (Engine Hours Monitor)', deviceCode: 'Working Hours Engine Monitor', category: 'device', arrivalsLog: [], defectiveLog: [] },
          { id: 'fls-floater', name: 'FLS Floater', deviceCode: 'SP2.0AR / SP2.0AR(M)', category: 'device', arrivalsLog: [], defectiveLog: [] },
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
    }, (error) => console.error('Error listening to inventory:', error));
    return () => unsubscribe();
  }, []);

  // Automatically sync baseline arrivals for pre-existing deployed items to make available stock = 0
  useEffect(() => {
    if (vesselReports.length === 0 || inventory.length === 0) return;
    
    const syncBaselines = async () => {
      for (const item of inventory) {
        const totalArrivals = (item.arrivalsLog || []).reduce((sum: number, entry: any) => sum + (entry.qty || 0), 0);
        if (totalArrivals === 0) {
          const deployedCount = getDeployedCount(item.id);
          if (deployedCount > 0) {
            try {
              const baselineArrival = {
                qty: deployedCount,
                type: 'New Arrival' as const,
                source: 'Baseline Deployed Stock',
                date: format(new Date(), 'yyyy-MM-dd')
              };
              await setDoc(doc(firestore, 'inventory', item.id), {
                arrivalsLog: [baselineArrival]
              }, { merge: true });
              console.log(`Auto-seeded baseline stock of ${deployedCount} for ${item.name}`);
            } catch (err) {
              console.error(`Failed to auto-seed baseline stock for ${item.id}:`, err);
            }
          }
        }
      }
    };
    
    syncBaselines();
  }, [vesselReports, inventory]);


  // Filter vessel reports

  const filteredVesselReports = vesselReports.filter(r => 
    (r.vesselInfo?.vesselName || '').toLowerCase().includes(vesselSearch.toLowerCase()) ||
    (r.vesselInfo?.leadEngineer || '').toLowerCase().includes(vesselSearch.toLowerCase())
  );

  // Filter petty cash reports
  const filteredPettyReports = pettyCashReports.filter(r => 
    (r.companyName || '').toLowerCase().includes(pettySearch.toLowerCase()) ||
    (r.preparedBy || '').toLowerCase().includes(pettySearch.toLowerCase())
  );

  // Parse all serial numbers for inventory registry
  const allSerialNumbers: any[] = [];
  vesselReports.forEach(report => {
    const vesselName = report.vesselInfo?.vesselName || 'Unnamed Vessel';
    const date = report.vesselInfo?.installationDate || '';
    const engineer = report.vesselInfo?.leadEngineer || '';
    
    const addSns = (raw: string | undefined, type: string) => {
      if (!raw) return;
      raw.split(',').map(s => s.trim()).forEach(sn => {
        if (sn) {
          allSerialNumbers.push({
            sn,
            type,
            vesselName,
            date,
            engineer,
            reportId: report.id
          });
        }
      });
    };

    addSns(report.flsCapacitance?.serialNumber, 'Fuel Level Sensor (Capacitance)');
    addSns(report.flsFloater?.serialNumber, 'Fuel Level Sensor (Floater)');
    addSns(report.network?.serialNumber, 'Network Transmitter (NR)');
    addSns(report.engine?.serialNumber, 'Engine Hours Monitor (SD)');
    addSns(report.solar?.serialNumber, 'Solar Terminal (Terminal)');
  });

  const filteredSerials = allSerialNumbers.filter(s => {
    const matchesSearch = s.sn.toLowerCase().includes(serialSearch.toLowerCase()) ||
                          s.vesselName.toLowerCase().includes(serialSearch.toLowerCase()) ||
                          s.type.toLowerCase().includes(serialSearch.toLowerCase());
    if (!matchesSearch) return false;
    
    if (deviceFilter === 'all') return true;
    if (deviceFilter === 'terminal') return s.type.toLowerCase().includes('(terminal)');
    if (deviceFilter === 'nr') return s.type.toLowerCase().includes('(nr)');
    if (deviceFilter === 'sd') return s.type.toLowerCase().includes('(sd)');
    if (deviceFilter === 'fls') return s.type.toLowerCase().includes('fuel level sensor');
    return true;
  });

  // Delete vessel accountability report
  const handleDeleteVessel = async (id: string) => {
    if (!window.confirm(`Delete accountability record for ${id}?`)) return;
    try {
      await deleteDoc(doc(firestore, 'reports', id));
      toast.success('Vessel record deleted successfully');
    } catch (e: any) {
      toast.error('Failed to delete vessel record: ' + e.message);
    }
  };

  // Delete petty cash report
  const handleDeletePettyCash = async (id: string) => {
    if (!window.confirm('Delete this Petty Cash record from database?')) return;
    try {
      await deleteDoc(doc(firestore, 'petty-cash-reports', id));
      toast.success('Petty Cash record deleted successfully');
    } catch (e: any) {
      toast.error('Failed to delete Petty Cash record: ' + e.message);
    }
  };

  // Load report data and trigger Excel download
  const handleDownloadPettyCash = async (report: any) => {
    setLoadingPC(report.id);
    try {
      const res = await fetch('/api/generate-petty-cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Generation failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Petty-Cash-Report-${report.periodFrom.replace(/\//g, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Downloaded report successfully!');
    } catch (e: any) {
      toast.error(e.message || 'Failed to download report');
    } finally {
      setLoadingPC(null);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpEmail) { toast.error('Email is required'); return; }
    if (!newEmpPassword || newEmpPassword.length < 6) {
      toast.error('Password is required and must be at least 6 characters long');
      return;
    }
    setIsSubmittingEmp(true);
    let secondaryApp;
    try {
      const cleanEmail = newEmpEmail.trim().toLowerCase();
      const appName = `SecondaryApp-${Date.now()}`;
      
      // Initialize secondary app instance to register the user without signing out the admin
      secondaryApp = initializeApp(firebaseConfig, appName);
      const secondaryAuth = getAuth(secondaryApp);
      
      // Create user credential in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, newEmpPassword);
      const uid = userCredential.user.uid;
      
      // Create the user profile document in Firestore keyed by UID
      await setDoc(doc(firestore, 'users', uid), {
        email: cleanEmail,
        displayName: newEmpName.trim(),
        role: newEmpRole,
        shiftHours: newEmpShiftHours,
        restDays: newEmpRestDays,
        allowedViews: newEmpRole === 'admin' ? ['equipment-accountability', 'petty-cash', 'time-card'] : newEmpAllowedViews,
        createdAt: new Date(),
      }, { merge: true });
      
      // Sign out from the secondary session
      await secondarySignOut(secondaryAuth);
      
      toast.success(`Account for ${cleanEmail} created successfully!`);
      setNewEmpEmail('');
      setNewEmpName('');
      setNewEmpPassword('');
      setNewEmpRole('user');
      setNewEmpShiftHours(10);
      setNewEmpRestDays([0, 6]);
      setNewEmpAllowedViews(['equipment-accountability', 'petty-cash']);
      setShowAddModal(false);
    } catch (err: any) {
      toast.error('Failed to create employee account: ' + err.message);
    } finally {
      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp);
        } catch (e) {
          console.error('Error cleaning up secondary Firebase app:', e);
        }
      }
      setIsSubmittingEmp(false);
    }
  };

  const handleUpdateRole = async (id: string, newRole: string) => {
    try {
      await setDoc(doc(firestore, 'users', id), { role: newRole }, { merge: true });
      toast.success('Employee role updated successfully');
    } catch (err: any) {
      toast.error('Failed to update employee role: ' + err.message);
    }
  };

  const handleToggleViewPermission = async (id: string, viewId: string, currentViews: string[]) => {
    try {
      const nextViews = currentViews.includes(viewId)
        ? currentViews.filter(v => v !== viewId)
        : [...currentViews, viewId];
      await setDoc(doc(firestore, 'users', id), { allowedViews: nextViews }, { merge: true });
      toast.success('View permissions updated successfully');
    } catch (err: any) {
      toast.error('Failed to update view permissions: ' + err.message);
    }
  };

  const handleDeleteEmployee = async (id: string, email: string) => {
    if (!window.confirm(`Are you sure you want to remove ${email || id} from the system?`)) return;
    try {
      await deleteDoc(doc(firestore, 'users', id));
      toast.success('Employee deleted successfully');
    } catch (err: any) {
      toast.error('Failed to delete employee: ' + err.message);
    }
  };

  const handleSaveEmpSettings = async () => {
    if (!editEmp) return;
    setIsSavingSettings(true);
    try {
      await setDoc(doc(firestore, 'users', editEmp.id), {
        shiftHours: editShiftHours,
        restDays: editRestDays,
      }, { merge: true });
      toast.success(`Settings updated for ${editEmp.displayName || editEmp.email}`);
      setShowEditSettingsModal(false);
    } catch (err: any) {
      toast.error('Failed to save settings: ' + err.message);
    } finally {
      setIsSavingSettings(false);
    }
  };

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
      } else if (itemId === 'fls-floater' || itemId === 'bracket-sp2') {
        count += parseInt(report.flsFloater?.qty || '0', 10) || 0;
      } else if (itemId === 'fls-capacitance') {
        count += parseInt(report.flsCapacitance?.qty || '0', 10) || 0;
      }
    });
    return count;
  };

  interface DeploymentRecord {
    vesselName: string;
    date: string;
    engineer: string;
    qty: number;
    reportId: string;
  }

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
      } else if (itemId === 'fls-floater' || itemId === 'bracket-sp2') {
        qty = parseInt(report.flsFloater?.qty || '0', 10) || 0;
      } else if (itemId === 'fls-capacitance') {
        qty = parseInt(report.flsCapacitance?.qty || '0', 10) || 0;
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
      
      // Update local state copy to prevent rendering delays in modals
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
      
      // Update local state copy to prevent rendering delays in modals
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


  const filteredEmployees = employees.filter(emp => 
    (emp.email || '').toLowerCase().includes(employeeSearch.toLowerCase()) ||
    (emp.displayName || '').toLowerCase().includes(employeeSearch.toLowerCase())
  );

  // Paginated slices for all lists
  const totalVesselPages = Math.ceil(filteredVesselReports.length / rowsPerPage) || 1;
  const paginatedVessels = filteredVesselReports.slice((vesselPage - 1) * rowsPerPage, vesselPage * rowsPerPage);

  const totalPettyPages = Math.ceil(filteredPettyReports.length / rowsPerPage) || 1;
  const paginatedPetty = filteredPettyReports.slice((pettyPage - 1) * rowsPerPage, pettyPage * rowsPerPage);

  const totalSerialPages = Math.ceil(filteredSerials.length / rowsPerPage) || 1;
  const paginatedSerials = filteredSerials.slice((serialPage - 1) * rowsPerPage, serialPage * rowsPerPage);

  const totalEmployeePages = Math.ceil(filteredEmployees.length / rowsPerPage) || 1;
  const paginatedEmployees = filteredEmployees.slice((employeePage - 1) * rowsPerPage, employeePage * rowsPerPage);

  const inputCls = 'bg-muted/40 border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all text-xs h-9 px-3 w-64 outline-none text-white rounded-lg border';


  return (
    <div className="min-h-screen pb-16">
      {/* Hero */}
      <div className="max-w-7xl mx-auto px-4 pt-10 pb-6 animate-fadeIn">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-3">
          <ShieldCheck className="w-3.5 h-3.5" />
          System Administrator Portal
        </div>
        <h1 className="text-3xl font-extrabold text-foreground">Admin Console</h1>
        <p className="text-muted-foreground text-sm mt-1">Review deployment reports, view history, and trace hardware serial numbers.</p>
      </div>

      {/* Tabs list */}
      <div className="max-w-7xl mx-auto px-4 mb-6">
        <div className="flex border-b border-border/60 gap-4">
          {[
            { id: 'vessels', label: 'Accountability Reports', icon: FileText },
            { id: 'petty-cash', label: 'Petty Cash Reports', icon: Wallet },
            { id: 'serials', label: 'Serial Registry', icon: Database },
            { id: 'inventory', label: 'Inventory Control', icon: Briefcase },
            { id: 'employees', label: 'Employee Directory', icon: Users },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all -mb-px',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4">
        {/* TAB 1: VESSEL REPORTS */}
        {activeTab === 'vessels' && (
          <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg space-y-4 animate-fadeIn">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <h2 className="font-semibold text-base text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> Saved Vessel Records ({filteredVesselReports.length})
              </h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                <input
                  type="text"
                  placeholder="Search vessel or engineer..."
                  value={vesselSearch}
                  onChange={(e) => setVesselSearch(e.target.value)}
                  className={cn(inputCls, 'pl-9')}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full text-xs min-w-[800px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60 text-muted-foreground font-semibold">
                    <th className="px-4 py-3 text-left">Vessel Name / IMO No.</th>
                    <th className="px-4 py-3 text-left">Installation Date</th>
                    <th className="px-4 py-3 text-left">Lead Engineer</th>
                    <th className="px-4 py-3 text-center">Hardware Qty</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedVessels.length > 0 ? (
                    paginatedVessels.map((report) => {
                      const totalHardware = 
                        parseInt(report.flsCapacitance?.qty || '0') +
                        parseInt(report.flsFloater?.qty || '0') +
                        parseInt(report.network?.qty || '0') +
                        parseInt(report.engine?.qty || '0') +
                        parseInt(report.solar?.qty || '0');
                      return (
                        <tr key={report.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-semibold text-foreground">{report.vesselInfo?.vesselName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{report.vesselInfo?.installationDate}</td>
                          <td className="px-4 py-3 text-muted-foreground">{report.vesselInfo?.leadEngineer}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5">{totalHardware} units</Badge>
                          </td>
                          <td className="px-4 py-3 text-right flex justify-end gap-2">
                            <Button 
                              onClick={() => router.push(`/dashboard/equipment-accountability?reportId=${report.id}`)}
                              variant="outline" size="sm" className="h-8 px-2.5 text-xs flex items-center gap-1 bg-blue-600/10 border-blue-600/20 text-blue-400 hover:bg-blue-600/20"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> Load Form
                            </Button>
                            <button 
                              onClick={() => handleDeleteVessel(report.id)}
                              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-muted-foreground">No reports found matching criteria</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredVesselReports.length > rowsPerPage && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-[11px] text-muted-foreground">
                  Showing <span className="font-medium text-foreground">{((vesselPage - 1) * rowsPerPage) + 1}</span> to{' '}
                  <span className="font-medium text-foreground">{Math.min(vesselPage * rowsPerPage, filteredVesselReports.length)}</span> of{' '}
                  <span className="font-medium text-foreground">{filteredVesselReports.length}</span> records
                </p>
                <div className="flex gap-2 items-center">
                  <Button
                    onClick={() => setVesselPage(p => Math.max(1, p - 1))}
                    disabled={vesselPage === 1}
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] border-border hover:bg-muted text-foreground bg-transparent"
                  >
                    Previous
                  </Button>
                  <span className="text-[11px] font-semibold text-foreground px-1">
                    Page {vesselPage} of {totalVesselPages}
                  </span>
                  <Button
                    onClick={() => setVesselPage(p => Math.min(totalVesselPages, p + 1))}
                    disabled={vesselPage === totalVesselPages}
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] border-border hover:bg-muted text-foreground bg-transparent"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PETTY CASH REPORTS */}
        {activeTab === 'petty-cash' && (
          <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg space-y-4 animate-fadeIn">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <h2 className="font-semibold text-base text-foreground flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" /> Saved Petty Cash Reports ({filteredPettyReports.length})
              </h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                <input
                  type="text"
                  placeholder="Search company or preparer..."
                  value={pettySearch}
                  onChange={(e) => setPettySearch(e.target.value)}
                  className={cn(inputCls, 'pl-9')}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full text-xs min-w-[800px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60 text-muted-foreground font-semibold">
                    <th className="px-4 py-3 text-left">Company Name</th>
                    <th className="px-4 py-3 text-left">Period Range</th>
                    <th className="px-4 py-3 text-left">Prepared By</th>
                    <th className="px-4 py-3 text-right">Beg. Balance</th>
                    <th className="px-4 py-3 text-right">Ending Balance (Avail.)</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPetty.length > 0 ? (
                    paginatedPetty.map((report) => {
                      const beg = parseFloat(report.beginningBalance || '0') || 0;
                      const totalExpenses = (report.items || []).reduce((s: number, i: any) => s + (parseFloat(i.gross) || 0), 0);
                      const avail = beg - totalExpenses;
                      return (
                        <tr key={report.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-semibold text-foreground">{report.companyName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{report.periodFrom} - {report.periodTo}</td>
                          <td className="px-4 py-3 text-muted-foreground">{report.preparedBy}</td>
                          <td className="px-4 py-3 text-right font-medium">₱{beg.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-right font-semibold text-primary">₱{avail.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-right flex justify-end gap-2 items-center">
                            <Button 
                              onClick={() => handleDownloadPettyCash(report)}
                              disabled={loadingPC === report.id}
                              variant="outline" size="sm" className="h-8 px-2.5 text-xs flex items-center gap-1 bg-emerald-600/10 border-emerald-600/20 text-emerald-400 hover:bg-emerald-600/20"
                            >
                              {loadingPC === report.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                              Download
                            </Button>
                            <Button 
                              onClick={() => router.push(`/dashboard/petty-cash?reportId=${report.id}`)}
                              variant="outline" size="sm" className="h-8 px-2.5 text-xs flex items-center gap-1 bg-blue-600/10 border-blue-600/20 text-blue-400 hover:bg-blue-600/20"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> Load Form
                            </Button>
                            <button 
                              onClick={() => handleDeletePettyCash(report.id)}
                              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">No petty cash records found matching criteria</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredPettyReports.length > rowsPerPage && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-[11px] text-muted-foreground">
                  Showing <span className="font-medium text-foreground">{((pettyPage - 1) * rowsPerPage) + 1}</span> to{' '}
                  <span className="font-medium text-foreground">{Math.min(pettyPage * rowsPerPage, filteredPettyReports.length)}</span> of{' '}
                  <span className="font-medium text-foreground">{filteredPettyReports.length}</span> records
                </p>
                <div className="flex gap-2 items-center">
                  <Button
                    onClick={() => setPettyPage(p => Math.max(1, p - 1))}
                    disabled={pettyPage === 1}
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] border-border hover:bg-muted text-foreground bg-transparent"
                  >
                    Previous
                  </Button>
                  <span className="text-[11px] font-semibold text-foreground px-1">
                    Page {pettyPage} of {totalPettyPages}
                  </span>
                  <Button
                    onClick={() => setPettyPage(p => Math.min(totalPettyPages, p + 1))}
                    disabled={pettyPage === totalPettyPages}
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] border-border hover:bg-muted text-foreground bg-transparent"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SERIAL NUMBER DATABASE */}
        {activeTab === 'serials' && (
          <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg space-y-4 animate-fadeIn">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <h2 className="font-semibold text-base text-foreground flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" /> Serial Number Registry ({filteredSerials.length} active tags)
              </h2>
              <div className="flex gap-2 items-center flex-wrap">
                {/* Device Type Filter Dropdown */}
                <select
                  value={deviceFilter}
                  onChange={(e) => setDeviceFilter(e.target.value as any)}
                  className="h-9 rounded-lg border bg-muted/40 border-border px-3 py-1 text-xs text-white focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all cursor-pointer"
                >
                  <option value="all" className="bg-neutral-950">All Devices</option>
                  <option value="terminal" className="bg-neutral-950">Terminal (Solar)</option>
                  <option value="nr" className="bg-neutral-950">NR (Network)</option>
                  <option value="sd" className="bg-neutral-950">SD (Engine)</option>
                  <option value="fls" className="bg-neutral-950">FLS (Fuel Sensors)</option>
                </select>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                  <input
                    type="text"
                    placeholder="Search Serial Number or Vessel..."
                    value={serialSearch}
                    onChange={(e) => setSerialSearch(e.target.value)}
                    className={cn(inputCls, 'pl-9')}
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full text-xs min-w-[800px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60 text-muted-foreground font-semibold">
                    <th className="px-4 py-3 text-left">Serial Number (S/N)</th>
                    <th className="px-4 py-3 text-left">Hardware Type</th>
                    <th className="px-4 py-3 text-left">Assigned Vessel</th>
                    <th className="px-4 py-3 text-left">Installation Date</th>
                    <th className="px-4 py-3 text-left">Lead Engineer</th>
                    <th className="px-4 py-3 text-right">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSerials.length > 0 ? (
                    paginatedSerials.map((serial, idx) => (
                      <tr key={idx} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-primary text-sm">{serial.sn}</td>
                        <td className="px-4 py-3 text-foreground">{serial.type}</td>
                        <td className="px-4 py-3 text-foreground font-medium">{serial.vesselName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{serial.date}</td>
                        <td className="px-4 py-3 text-muted-foreground">{serial.engineer}</td>
                        <td className="px-4 py-3 text-right">
                          <Button 
                            onClick={() => router.push(`/dashboard/equipment-accountability?reportId=${serial.reportId}`)}
                            variant="outline" size="sm" className="h-7 px-2 text-[10px] flex items-center gap-1 bg-blue-600/10 border-blue-600/20 text-blue-400 hover:bg-blue-600/20"
                          >
                            View Vessel Info
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">No serial numbers found in system registry</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredSerials.length > rowsPerPage && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-[11px] text-muted-foreground">
                  Showing <span className="font-medium text-foreground">{((serialPage - 1) * rowsPerPage) + 1}</span> to{' '}
                  <span className="font-medium text-foreground">{Math.min(serialPage * rowsPerPage, filteredSerials.length)}</span> of{' '}
                  <span className="font-medium text-foreground">{filteredSerials.length}</span> active tags
                </p>
                <div className="flex gap-2 items-center">
                  <Button
                    onClick={() => setSerialPage(p => Math.max(1, p - 1))}
                    disabled={serialPage === 1}
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] border-border hover:bg-muted text-foreground bg-transparent"
                  >
                    Previous
                  </Button>
                  <span className="text-[11px] font-semibold text-foreground px-1">
                    Page {serialPage} of {totalSerialPages}
                  </span>
                  <Button
                    onClick={() => setSerialPage(p => Math.min(totalSerialPages, p + 1))}
                    disabled={serialPage === totalSerialPages}
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] border-border hover:bg-muted text-foreground bg-transparent"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: EMPLOYEE DIRECTORY */}
        {activeTab === 'employees' && (
          <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg space-y-4 animate-fadeIn">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <h2 className="font-semibold text-base text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> Employee Directory ({filteredEmployees.length})
              </h2>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                  <input
                    type="text"
                    placeholder="Search employees..."
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                    className={cn(inputCls, 'pl-9')}
                  />
                </div>
                <Button 
                  onClick={() => setShowAddModal(true)}
                  className="h-9 px-4 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/95 flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Employee
                </Button>
              </div>
            </div>

            {/* Modal Dialog for Adding Employee */}
            {showAddModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-md p-4 animate-fadeIn">
                <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-fadeInUp">
                  <button 
                    onClick={() => setShowAddModal(false)}
                    className="absolute top-4 right-4 p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <h3 className="font-bold text-lg text-foreground mb-4">Add Pre-Authorized Employee</h3>
                  <form onSubmit={handleAddEmployee} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Address</label>
                      <input 
                        type="email" 
                        required 
                        placeholder="employee@aimf.com" 
                        value={newEmpEmail}
                        onChange={e => setNewEmpEmail(e.target.value)}
                        className="bg-muted/50 border-border text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm h-10 px-3 w-full rounded-lg border transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Name (Optional)</label>
                      <input 
                        type="text"
                        placeholder="e.g. John Doe" 
                        value={newEmpName}
                        onChange={e => setNewEmpName(e.target.value)}
                        className="bg-muted/50 border-border text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm h-10 px-3 w-full rounded-lg border transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Password</label>
                      <input 
                        type="password"
                        required
                        placeholder="••••••••" 
                        value={newEmpPassword}
                        onChange={e => setNewEmpPassword(e.target.value)}
                        className="bg-muted/50 border-border text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm h-10 px-3 w-full rounded-lg border transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Access Role</label>
                      <select 
                        value={newEmpRole}
                        onChange={e => setNewEmpRole(e.target.value as any)}
                        className="w-full rounded-lg border bg-muted/50 border-border px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none"
                      >
                        <option value="user" className="bg-card">Standard User (Technician)</option>
                        <option value="admin" className="bg-card">System Administrator</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Allowed Views</label>
                      <div className="space-y-2 bg-muted/30 border border-border rounded-lg p-3">
                        <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer select-none">
                          <input 
                            type="checkbox"
                            checked={newEmpAllowedViews.includes('equipment-accountability')}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewEmpAllowedViews([...newEmpAllowedViews, 'equipment-accountability']);
                              } else {
                                setNewEmpAllowedViews(newEmpAllowedViews.filter(v => v !== 'equipment-accountability'));
                              }
                            }}
                            className="w-4 h-4 rounded border-border bg-muted/50 text-primary accent-primary"
                          />
                          Equipment Accountability
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer select-none">
                          <input 
                            type="checkbox"
                            checked={newEmpAllowedViews.includes('petty-cash')}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewEmpAllowedViews([...newEmpAllowedViews, 'petty-cash']);
                              } else {
                                setNewEmpAllowedViews(newEmpAllowedViews.filter(v => v !== 'petty-cash'));
                              }
                            }}
                            className="w-4 h-4 rounded border-border bg-muted/50 text-primary accent-primary"
                          />
                          Petty Cash Report
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer select-none">
                          <input 
                            type="checkbox"
                            checked={newEmpAllowedViews.includes('time-card')}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewEmpAllowedViews([...newEmpAllowedViews, 'time-card']);
                              } else {
                                setNewEmpAllowedViews(newEmpAllowedViews.filter(v => v !== 'time-card'));
                              }
                            }}
                            className="w-4 h-4 rounded border-border bg-muted/50 text-primary accent-primary"
                          />
                          Time Card
                        </label>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Default Shift Hours</label>
                      <input
                        type="number"
                        min="1"
                        max="24"
                        value={newEmpShiftHours}
                        onChange={e => setNewEmpShiftHours(Number(e.target.value))}
                        className="bg-muted/40 border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all text-xs h-9 px-3 w-full outline-none text-white rounded-lg border"
                      />
                      <p className="text-[10px] text-muted-foreground">Hours worked per day before OT is counted (e.g. 10)</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rest Days</label>
                      <div className="flex flex-wrap gap-2">
                        {[{label:'Sun',val:0},{label:'Mon',val:1},{label:'Tue',val:2},{label:'Wed',val:3},{label:'Thu',val:4},{label:'Fri',val:5},{label:'Sat',val:6}].map(d => (
                          <label key={d.val} className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer select-none bg-muted/40 border border-border/60 rounded-lg px-3 py-1.5 hover:bg-muted/70 transition-all">
                            <input
                              type="checkbox"
                              checked={newEmpRestDays.includes(d.val)}
                              onChange={e => {
                                if (e.target.checked) setNewEmpRestDays(prev => [...prev, d.val]);
                                else setNewEmpRestDays(prev => prev.filter(x => x !== d.val));
                              }}
                              className="w-3.5 h-3.5 accent-primary"
                            />
                            {d.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button type="button" variant="outline" onClick={() => setShowAddModal(false)} className="h-10 text-xs border-border hover:bg-muted text-foreground bg-transparent">Cancel</Button>
                      <Button type="submit" disabled={isSubmittingEmp} className="h-10 text-xs bg-primary text-primary-foreground">
                        {isSubmittingEmp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create Invitation'}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full text-xs min-w-[800px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60 text-muted-foreground font-semibold">
                    <th className="px-4 py-3 text-left">Email Address</th>
                    <th className="px-4 py-3 text-left">Full Name</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Access Role</th>
                    <th className="px-4 py-3 text-left">Allowed Views</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEmployees.length > 0 ? (
                    paginatedEmployees.map((emp) => (
                      <tr key={emp.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-semibold text-foreground">{emp.email}</td>
                        <td className="px-4 py-3 text-muted-foreground">{emp.displayName || '—'}</td>
                        <td className="px-4 py-3">
                          {emp.isPending ? (
                            <Badge variant="outline" className="border-yellow-600/30 text-yellow-500 bg-yellow-500/5 animate-pulse">Pending First Login</Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-600/30 text-emerald-500 bg-emerald-500/5">Active Account</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select 
                            value={emp.role || 'user'}
                            onChange={(e) => handleUpdateRole(emp.id, e.target.value)}
                            className="bg-transparent border border-border/60 rounded px-2 py-1 text-xs text-white focus:border-primary outline-none"
                          >
                            <option value="user" className="bg-neutral-900">Standard User</option>
                            <option value="admin" className="bg-neutral-900">Administrator</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {emp.role === 'admin' ? (
                            <span className="text-muted-foreground italic text-[11px]">All views allowed (Admin)</span>
                          ) : (
                            <div className="flex gap-4">
                              <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                                <input 
                                  type="checkbox"
                                  checked={(emp.allowedViews || []).includes('equipment-accountability')}
                                  onChange={() => handleToggleViewPermission(emp.id, 'equipment-accountability', emp.allowedViews || [])}
                                  className="w-3.5 h-3.5 rounded border-neutral-700 accent-primary"
                                />
                                Vessel
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                                <input 
                                  type="checkbox"
                                  checked={(emp.allowedViews || []).includes('petty-cash')}
                                  onChange={() => handleToggleViewPermission(emp.id, 'petty-cash', emp.allowedViews || [])}
                                  className="w-3.5 h-3.5 rounded border-neutral-700 accent-primary"
                                />
                                Petty Cash
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                                <input 
                                  type="checkbox"
                                  checked={(emp.allowedViews || []).includes('time-card')}
                                  onChange={() => handleToggleViewPermission(emp.id, 'time-card', emp.allowedViews || [])}
                                  className="w-3.5 h-3.5 rounded border-neutral-700 accent-primary"
                                />
                                Time Card
                              </label>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setEditEmp(emp);
                                setEditShiftHours(typeof emp.shiftHours === 'number' ? emp.shiftHours : 10);
                                setEditRestDays(Array.isArray(emp.restDays) ? emp.restDays : [0, 6]);
                                setShowEditSettingsModal(true);
                              }}
                              className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                              title="Edit Shift & Rest Day Settings"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                            </button>
                            <button 
                              onClick={() => handleDeleteEmployee(emp.id, emp.email)}
                              disabled={emp.id === user?.uid}
                              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-35"
                              title={emp.id === user?.uid ? "You cannot delete your own account" : "Remove Employee"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">No employees found in directory</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredEmployees.length > rowsPerPage && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-[11px] text-muted-foreground">
                  Showing <span className="font-medium text-foreground">{((employeePage - 1) * rowsPerPage) + 1}</span> to{' '}
                  <span className="font-medium text-foreground">{Math.min(employeePage * rowsPerPage, filteredEmployees.length)}</span> of{' '}
                  <span className="font-medium text-foreground">{filteredEmployees.length}</span> employees
                </p>
                <div className="flex gap-2 items-center">
                  <Button
                    onClick={() => setEmployeePage(p => Math.max(1, p - 1))}
                    disabled={employeePage === 1}
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] border-border hover:bg-muted text-foreground bg-transparent"
                  >
                    Previous
                  </Button>
                  <span className="text-[11px] font-semibold text-foreground px-1">
                    Page {employeePage} of {totalEmployeePages}
                  </span>
                  <Button
                    onClick={() => setEmployeePage(p => Math.min(totalEmployeePages, p + 1))}
                    disabled={employeePage === totalEmployeePages}
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] border-border hover:bg-muted text-foreground bg-transparent"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* EDIT EMPLOYEE SETTINGS MODAL */}
        {showEditSettingsModal && editEmp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-md p-4 animate-fadeIn">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-fadeInUp">
              <button
                onClick={() => setShowEditSettingsModal(false)}
                className="absolute top-4 right-4 p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="font-bold text-lg text-foreground mb-1">Edit Time Card Settings</h3>
              <p className="text-xs text-muted-foreground mb-5">
                Employee: <span className="text-primary font-medium">{editEmp.displayName || editEmp.email}</span>
              </p>

              <div className="space-y-5">
                {/* Shift Hours */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shift Hours (OT Threshold)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={editShiftHours}
                      onChange={e => setEditShiftHours(Number(e.target.value))}
                      className="bg-muted/50 border-border text-foreground focus:border-primary/50 outline-none text-sm h-10 px-3 w-24 rounded-lg border transition-all text-center"
                    />
                    <span className="text-xs text-muted-foreground">hours/day before OT is counted</span>
                  </div>
                </div>

                {/* Rest Days */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rest Days</label>
                  <div className="grid grid-cols-7 gap-2">
                    {[
                      { label: 'Sun', val: 0 },
                      { label: 'Mon', val: 1 },
                      { label: 'Tue', val: 2 },
                      { label: 'Wed', val: 3 },
                      { label: 'Thu', val: 4 },
                      { label: 'Fri', val: 5 },
                      { label: 'Sat', val: 6 },
                    ].map(d => {
                      const checked = editRestDays.includes(d.val);
                      return (
                        <button
                          key={d.val}
                          type="button"
                          onClick={() => {
                            if (checked) setEditRestDays(prev => prev.filter(x => x !== d.val));
                            else setEditRestDays(prev => [...prev, d.val]);
                          }}
                          className={cn(
                            'py-2 rounded-lg text-xs font-semibold border transition-all',
                            checked
                              ? 'bg-primary/15 border-primary/40 text-primary'
                              : 'bg-muted/40 border-border/60 text-muted-foreground hover:bg-muted/70'
                          )}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Selected days will be auto-marked as Rest Day on the time card.</p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-5 border-t border-border/40 mt-5">
                <Button type="button" variant="outline" onClick={() => setShowEditSettingsModal(false)} className="h-10 text-xs border-border hover:bg-muted text-foreground bg-transparent">Cancel</Button>
                <Button onClick={handleSaveEmpSettings} disabled={isSavingSettings} className="h-10 text-xs bg-primary text-primary-foreground">
                  {isSavingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Settings'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: INVENTORY CONTROL */}
        {activeTab === 'inventory' && (
          <div className="space-y-6 animate-fadeIn">
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
                        className="py-2 text-[10px] font-semibold text-blue-400 bg-blue-600/10 border border-blue-600/20 hover:bg-blue-600/20 transition-all rounded-lg cursor-pointer"
                      >
                        Details Log
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* MODAL 1: LOG STOCK ARRIVAL */}
        {showArrivalModal && selectedInventoryItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-md p-4 animate-fadeIn">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-fadeInUp">
              <button 
                onClick={() => setShowArrivalModal(false)}
                className="absolute top-4 right-4 p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="font-bold text-lg text-foreground mb-1">Log Stock Arrival</h3>
              <p className="text-xs text-muted-foreground mb-4">Item: <span className="text-primary font-medium">{selectedInventoryItem.name}</span></p>
              
              <form onSubmit={handleAddArrival} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Arrival Quantity</label>
                  <input 
                    type="number" 
                    required 
                    min="1"
                    value={arrivalQty}
                    onChange={e => setArrivalQty(e.target.value)}
                    className="bg-muted/50 border-border text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm h-10 px-3 w-full rounded-lg border transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Arrival Type</label>
                  <select 
                    value={arrivalType}
                    onChange={e => setArrivalType(e.target.value as any)}
                    className="w-full rounded-lg border bg-muted/50 border-border px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none"
                  >
                    <option value="New Arrival" className="bg-card">New Arrival (Acquisitions/Supplier)</option>
                    <option value="Found Item" className="bg-card">Found Item (Warehouse discovery/etc.)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source / Origin Remarks</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. Manila Supplier Shipment, Found in cabinet 2" 
                    value={arrivalSource}
                    onChange={e => setArrivalSource(e.target.value)}
                    className="bg-muted/50 border-border text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm h-10 px-3 w-full rounded-lg border transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Arrival Date</label>
                  <input 
                    type="date"
                    required 
                    value={arrivalDate}
                    onChange={e => setArrivalDate(e.target.value)}
                    className="bg-muted/50 border-border text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm h-10 px-3 w-full rounded-lg border transition-all"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowArrivalModal(false)} className="h-10 text-xs border-border hover:bg-muted text-foreground bg-transparent">Cancel</Button>
                  <Button type="submit" disabled={isSubmittingInventory} className="h-10 text-xs bg-primary text-primary-foreground">
                    {isSubmittingInventory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Log Stock Entry'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: REPORT DEFECTIVE STOCK */}
        {showDefectiveModal && selectedInventoryItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-md p-4 animate-fadeIn">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-fadeInUp">
              <button 
                onClick={() => setShowDefectiveModal(false)}
                className="absolute top-4 right-4 p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="font-bold text-lg text-foreground mb-1">Report Defective Stock</h3>
              <p className="text-xs text-muted-foreground mb-4">Item: <span className="text-primary font-medium">{selectedInventoryItem.name}</span></p>
              
              <form onSubmit={handleAddDefective} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Defective Quantity</label>
                  <input 
                    type="number" 
                    required 
                    min="1"
                    value={defectiveQty}
                    onChange={e => setDefectiveQty(e.target.value)}
                    className="bg-muted/50 border-border text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm h-10 px-3 w-full rounded-lg border transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Defect Remarks / Reason (Optional)</label>
                  <textarea 
                    placeholder="e.g. Broken connector, Failed visual check, Battery leakage" 
                    value={defectiveRemarks}
                    onChange={e => setDefectiveRemarks(e.target.value)}
                    className="bg-muted/50 border-border text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-xs p-3 w-full h-20 rounded-lg border transition-all resize-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date Logged</label>
                  <input 
                    type="date"
                    required 
                    value={defectiveDate}
                    onChange={e => setDefectiveDate(e.target.value)}
                    className="bg-muted/50 border-border text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm h-10 px-3 w-full rounded-lg border transition-all"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowDefectiveModal(false)} className="h-10 text-xs border-border hover:bg-muted text-foreground bg-transparent">Cancel</Button>
                  <Button type="submit" disabled={isSubmittingInventory} className="h-10 text-xs bg-primary text-primary-foreground">
                    {isSubmittingInventory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Log Defect'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 3: ADD CUSTOM INVENTORY ITEM */}
        {showAddCustomItemModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-md p-4 animate-fadeIn">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-fadeInUp">
              <button 
                onClick={() => setShowAddCustomItemModal(false)}
                className="absolute top-4 right-4 p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="font-bold text-lg text-foreground mb-4">Add Custom Hardware Item</h3>
              
              <form onSubmit={handleAddCustomItem} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Item Name</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. Bracket SP2.0 High Grade"
                    value={customItemName}
                    onChange={e => setCustomItemName(e.target.value)}
                    className="bg-muted/50 border-border text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm h-10 px-3 w-full rounded-lg border transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hardware Code / Spec</label>
                  <input 
                    type="text" 
                    placeholder="e.g. SP2.0-HG"
                    value={customItemCode}
                    onChange={e => setCustomItemCode(e.target.value)}
                    className="bg-muted/50 border-border text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm h-10 px-3 w-full rounded-lg border transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Item Category</label>
                  <select 
                    value={customItemCategory}
                    onChange={e => setCustomItemCategory(e.target.value as any)}
                    className="w-full rounded-lg border bg-muted/50 border-border px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none"
                  >
                    <option value="device" className="bg-card">Hardware Device (Device)</option>
                    <option value="bracket" className="bg-card">Mount / bracket (Bracket)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Initial Stock Qty</label>
                    <input 
                      type="number" 
                      min="0"
                      value={customItemInitialStock}
                      onChange={e => setCustomItemInitialStock(e.target.value)}
                      className="bg-muted/50 border-border text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm h-10 px-3 w-full rounded-lg border transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Initial Stock Source</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Initial Setup"
                      value={customItemInitialSource}
                      onChange={e => setCustomItemInitialSource(e.target.value)}
                      className="bg-muted/50 border-border text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm h-10 px-3 w-full rounded-lg border transition-all"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowAddCustomItemModal(false)} className="h-10 text-xs border-border hover:bg-muted text-foreground bg-transparent">Cancel</Button>
                  <Button type="submit" disabled={isSubmittingInventory} className="h-10 text-xs bg-primary text-primary-foreground">
                    {isSubmittingInventory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Register Item'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 4: INVENTORY HISTORY & DETAILED LEDGER SHEET */}
        {showDetailModal && selectedInventoryItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-md p-4 animate-fadeIn">
            <div className="bg-card border border-border rounded-2xl w-full max-w-2xl p-6 shadow-2xl relative animate-fadeInUp flex flex-col max-h-[85vh]">
              <button 
                onClick={() => setShowDetailModal(false)}
                className="absolute top-4 right-4 p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              
              <h3 className="font-bold text-lg text-foreground mb-1">Item Detailed Ledger</h3>
              <p className="text-xs text-muted-foreground mb-4">Item: <span className="text-primary font-medium">{selectedInventoryItem.name} ({selectedInventoryItem.deviceCode})</span></p>

              {/* Subtabs selection */}
              <div className="flex border-b border-border/40 gap-2 mb-4">
                {[
                  { id: 'deployments', label: 'Deployments (Vessels)' },
                  { id: 'arrivals', label: 'Arrivals Registry' },
                  { id: 'defective', label: 'Defect Logs' }
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setDetailActiveTab(t.id as any); setDetailPage(1); }}
                    className={cn(
                      'px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-all cursor-pointer',
                      detailActiveTab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Ledger Lists Content */}
              <div className="flex-1 overflow-y-auto pr-1 min-h-[300px]">
                {detailActiveTab === 'deployments' && (() => {
                  const data = getDeploymentHistory(selectedInventoryItem.id);
                  const totalPages = Math.ceil(data.length / 10) || 1;
                  const slice = data.slice((detailPage - 1) * 10, detailPage * 10);
                  return (
                    <div className="space-y-4">
                      <div className="overflow-x-auto border border-border/60 rounded-xl">
                        <table className="w-full text-left text-xs min-w-[500px]">
                          <thead>
                            <tr className="bg-muted/40 border-b border-border/60 font-semibold text-muted-foreground">
                              <th className="px-4 py-2.5">Vessel Name</th>
                              <th className="px-4 py-2.5">Date Deployed</th>
                              <th className="px-4 py-2.5">Lead Engineer</th>
                              <th className="px-4 py-2.5 text-center">Qty</th>
                              <th className="px-4 py-2.5 text-right">Reference</th>
                            </tr>
                          </thead>
                          <tbody>
                            {slice.length > 0 ? slice.map((item, idx) => (
                              <tr key={idx} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-2.5 font-medium text-foreground">{item.vesselName}</td>
                                <td className="px-4 py-2.5 text-muted-foreground">{item.date}</td>
                                <td className="px-4 py-2.5 text-muted-foreground">{item.engineer}</td>
                                <td className="px-4 py-2.5 text-center font-bold text-foreground">{item.qty}</td>
                                <td className="px-4 py-2.5 text-right">
                                  <Button
                                    onClick={() => {
                                      setShowDetailModal(false);
                                      router.push(`/dashboard/equipment-accountability?reportId=${item.reportId}`);
                                    }}
                                    variant="outline" size="sm" className="h-6 text-[10px] bg-blue-600/10 border-blue-600/20 text-blue-400"
                                  >
                                    View Vessel
                                  </Button>
                                </td>
                              </tr>
                            )) : (
                              <tr>
                                <td colSpan={5} className="text-center py-8 text-muted-foreground">No deployment records found for this hardware item.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {data.length > 10 && (
                        <div className="flex justify-between items-center text-[11px] pt-1">
                          <span className="text-muted-foreground">Page {detailPage} of {totalPages} ({data.length} records)</span>
                          <div className="flex gap-2">
                            <Button disabled={detailPage === 1} onClick={() => setDetailPage(p => p - 1)} variant="outline" size="sm" className="h-7 text-[10px] bg-transparent border-border">Prev</Button>
                            <Button disabled={detailPage === totalPages} onClick={() => setDetailPage(p => p + 1)} variant="outline" size="sm" className="h-7 text-[10px] bg-transparent border-border">Next</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {detailActiveTab === 'arrivals' && (() => {
                  const data = selectedInventoryItem.arrivalsLog || [];
                  const totalPages = Math.ceil(data.length / 10) || 1;
                  const slice = data.slice((detailPage - 1) * 10, detailPage * 10);
                  return (
                    <div className="space-y-4">
                      <div className="overflow-x-auto border border-border/60 rounded-xl">
                        <table className="w-full text-left text-xs min-w-[500px]">
                          <thead>
                            <tr className="bg-muted/40 border-b border-border/60 font-semibold text-muted-foreground">
                              <th className="px-4 py-2.5">Date Added</th>
                              <th className="px-4 py-2.5">Qty</th>
                              <th className="px-4 py-2.5">Acquisition Type</th>
                              <th className="px-4 py-2.5">Source Remarks / Origin</th>
                            </tr>
                          </thead>
                          <tbody>
                            {slice.length > 0 ? slice.map((item: any, idx: number) => (
                              <tr key={idx} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-2.5 text-muted-foreground">{item.date}</td>
                                <td className="px-4 py-2.5 font-bold text-emerald-400">+{item.qty} units</td>
                                <td className="px-4 py-2.5">
                                  <Badge className={cn('text-[9px] px-1.5', item.type === 'Found Item' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500 hover:bg-yellow-500/15' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15')}>
                                    {item.type}
                                  </Badge>
                                </td>
                                <td className="px-4 py-2.5 text-foreground font-medium">{item.source}</td>
                              </tr>
                            )) : (
                              <tr>
                                <td colSpan={4} className="text-center py-8 text-muted-foreground">No stock arrivals have been logged yet.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {data.length > 10 && (
                        <div className="flex justify-between items-center text-[11px] pt-1">
                          <span className="text-muted-foreground">Page {detailPage} of {totalPages} ({data.length} entries)</span>
                          <div className="flex gap-2">
                            <Button disabled={detailPage === 1} onClick={() => setDetailPage(p => p - 1)} variant="outline" size="sm" className="h-7 text-[10px] bg-transparent border-border">Prev</Button>
                            <Button disabled={detailPage === totalPages} onClick={() => setDetailPage(p => p + 1)} variant="outline" size="sm" className="h-7 text-[10px] bg-transparent border-border">Next</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {detailActiveTab === 'defective' && (() => {
                  const data = selectedInventoryItem.defectiveLog || [];
                  const totalPages = Math.ceil(data.length / 10) || 1;
                  const slice = data.slice((detailPage - 1) * 10, detailPage * 10);
                  return (
                    <div className="space-y-4">
                      <div className="overflow-x-auto border border-border/60 rounded-xl">
                        <table className="w-full text-left text-xs min-w-[500px]">
                          <thead>
                            <tr className="bg-muted/40 border-b border-border/60 font-semibold text-muted-foreground">
                              <th className="px-4 py-2.5">Date Logged</th>
                              <th className="px-4 py-2.5">Qty Deducted</th>
                              <th className="px-4 py-2.5">Defect Remarks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {slice.length > 0 ? slice.map((item: any, idx: number) => (
                              <tr key={idx} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-2.5 text-muted-foreground">{item.date}</td>
                                <td className="px-4 py-2.5 font-bold text-destructive">-{item.qty} units</td>
                                <td className="px-4 py-2.5 text-foreground font-medium">{item.remarks}</td>
                              </tr>
                            )) : (
                              <tr>
                                <td colSpan={3} className="text-center py-8 text-muted-foreground">No defective logs have been recorded.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {data.length > 10 && (
                        <div className="flex justify-between items-center text-[11px] pt-1">
                          <span className="text-muted-foreground">Page {detailPage} of {totalPages} ({data.length} entries)</span>
                          <div className="flex gap-2">
                            <Button disabled={detailPage === 1} onClick={() => setDetailPage(p => p - 1)} variant="outline" size="sm" className="h-7 text-[10px] bg-transparent border-border">Prev</Button>
                            <Button disabled={detailPage === totalPages} onClick={() => setDetailPage(p => p + 1)} variant="outline" size="sm" className="h-7 text-[10px] bg-transparent border-border">Next</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="flex justify-end pt-4 border-t border-border/40">
                <Button type="button" onClick={() => setShowDetailModal(false)} className="h-9 text-xs bg-primary text-primary-foreground px-4">Close Ledger</Button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: EMPLOYEE DIRECTORY */}
      </div>
    </div>

  );
}
