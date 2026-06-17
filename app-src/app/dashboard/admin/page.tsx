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
  Loader2, BadgeAlert, Database, Calendar, User, Plus, Users, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

type Tab = 'vessels' | 'petty-cash' | 'serials' | 'employees';


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

  // Edit Employee Modal States
  const [showEditSettingsModal, setShowEditSettingsModal] = useState(false);
  const [editEmp, setEditEmp] = useState<any | null>(null);
  const [editEmpEmail, setEditEmpEmail] = useState('');
  const [editEmpName, setEditEmpName] = useState('');
  const [editEmpPassword, setEditEmpPassword] = useState('');
  const [editEmpRole, setEditEmpRole] = useState<'admin' | 'user'>('user');
  const [editEmpAllowedViews, setEditEmpAllowedViews] = useState<string[]>(['equipment-accountability', 'petty-cash']);
  const [editShiftHours, setEditShiftHours] = useState<number>(10);
  const [editRestDays, setEditRestDays] = useState<number[]>([0, 6]);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

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
    if (!editEmpEmail) { toast.error('Email is required'); return; }
    if (editEmpPassword && editEmpPassword.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }
    setIsSavingSettings(true);
    try {
      const res = await fetch('/api/admin-update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: editEmp.id,
          email: editEmpEmail,
          displayName: editEmpName,
          role: editEmpRole,
          allowedViews: editEmpRole === 'admin' ? ['equipment-accountability', 'petty-cash', 'time-card'] : editEmpAllowedViews,
          shiftHours: editShiftHours,
          restDays: editRestDays,
          password: editEmpPassword || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to update employee details');
      }

      toast.success(`Employee details updated for ${editEmpName || editEmpEmail}`);
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
                            checked={newEmpAllowedViews.includes('inventory')}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewEmpAllowedViews([...newEmpAllowedViews, 'inventory']);
                              } else {
                                setNewEmpAllowedViews(newEmpAllowedViews.filter(v => v !== 'inventory'));
                              }
                            }}
                            className="w-4 h-4 rounded border-border bg-muted/50 text-primary accent-primary"
                          />
                          Inventory Control
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
                                  checked={(emp.allowedViews || []).includes('inventory')}
                                  onChange={() => handleToggleViewPermission(emp.id, 'inventory', emp.allowedViews || [])}
                                  className="w-3.5 h-3.5 rounded border-neutral-700 accent-primary"
                                />
                                Inventory
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
                                setEditEmpEmail(emp.email || '');
                                setEditEmpName(emp.displayName || '');
                                setEditEmpPassword('');
                                setEditEmpRole(emp.role || 'user');
                                setEditEmpAllowedViews(emp.allowedViews || ['equipment-accountability', 'petty-cash']);
                                setEditShiftHours(typeof emp.shiftHours === 'number' ? emp.shiftHours : 10);
                                setEditRestDays(Array.isArray(emp.restDays) ? emp.restDays : [0, 6]);
                                setShowEditSettingsModal(true);
                              }}
                              className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                              title="Edit Employee Details & Settings"
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
            <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto animate-fadeInUp">
              <button
                onClick={() => setShowEditSettingsModal(false)}
                className="absolute top-4 right-4 p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="font-bold text-lg text-foreground mb-1">Edit Employee Details</h3>
              <p className="text-xs text-muted-foreground mb-5">
                Update account details, change passwords, and configure permissions.
              </p>

              <div className="space-y-4">
                {/* Email Address */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Address</label>
                  <input
                    type="email"
                    value={editEmpEmail}
                    onChange={e => setEditEmpEmail(e.target.value)}
                    className="bg-muted/50 border-border text-white focus:border-primary/50 outline-none text-sm h-10 px-3 w-full rounded-lg border transition-all"
                    placeholder="email@example.com"
                  />
                </div>

                {/* Display Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Name</label>
                  <input
                    type="text"
                    value={editEmpName}
                    onChange={e => setEditEmpName(e.target.value)}
                    className="bg-muted/50 border-border text-white focus:border-primary/50 outline-none text-sm h-10 px-3 w-full rounded-lg border transition-all"
                    placeholder="e.g. John Doe"
                  />
                </div>

                {/* Password reset */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Password</label>
                  <input
                    type="password"
                    value={editEmpPassword}
                    onChange={e => setEditEmpPassword(e.target.value)}
                    className="bg-muted/50 border-border text-white focus:border-primary/50 outline-none text-sm h-10 px-3 w-full rounded-lg border transition-all"
                    placeholder="Leave blank to keep current password"
                  />
                  <p className="text-[10px] text-muted-foreground">Min 6 characters. Overwrites user password instantly.</p>
                </div>

                {/* Access Role */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Access Role</label>
                  <select
                    value={editEmpRole}
                    onChange={e => setEditEmpRole(e.target.value as 'admin' | 'user')}
                    className="bg-muted/50 border-border text-white focus:border-primary/50 outline-none text-sm h-10 px-3 w-full rounded-lg border transition-all appearance-none"
                  >
                    <option value="user" className="bg-neutral-900">Standard User</option>
                    <option value="admin" className="bg-neutral-900">Administrator</option>
                  </select>
                </div>

                {/* View Permissions (only for standard users) */}
                {editEmpRole === 'user' && (
                  <div className="space-y-1.5 border-t border-border/40 pt-3">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Allowed Views</label>
                    <div className="flex flex-wrap gap-4 pt-1">
                      {[
                        { id: 'equipment-accountability', label: 'Vessel Form' },
                        { id: 'inventory', label: 'Inventory Control' },
                        { id: 'petty-cash', label: 'Petty Cash' },
                        { id: 'time-card', label: 'Time Card' },
                      ].map(v => {
                        const checked = editEmpAllowedViews.includes(v.id);
                        return (
                          <label key={v.id} className="flex items-center gap-1.5 cursor-pointer text-xs text-foreground">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                if (checked) setEditEmpAllowedViews(prev => prev.filter(x => x !== v.id));
                                else setEditEmpAllowedViews(prev => [...prev, v.id]);
                              }}
                              className="w-4 h-4 rounded border-neutral-700 accent-primary"
                            />
                            {v.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Shift Hours */}
                <div className="space-y-1.5 border-t border-border/40 pt-3">
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
                <div className="space-y-2 border-t border-border/40 pt-3">
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
                            'py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer',
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
                  {isSavingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Employee'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: EMPLOYEE DIRECTORY */}
      </div>
    </div>

  );
}
