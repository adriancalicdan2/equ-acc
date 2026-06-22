'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useFieldArray, useForm } from 'react-hook-form';
import { format } from 'date-fns';
import { Plus, Trash2, Download, Loader2, Wallet, Calculator, Search, CheckCircle2, AlertCircle, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { firestore, auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/firebase/AuthContext';
import { collection, onSnapshot, query, orderBy, doc, setDoc, deleteDoc, where } from 'firebase/firestore';

// Categories matching the xlsx template
const CATEGORIES = [
  { key: 'vat',           label: 'VAT' },
  { key: 'transpo',       label: 'Transpo' },
  { key: 'meals',         label: 'Meals' },
  { key: 'freight',       label: 'Freight & Handling' },
  { key: 'communication', label: 'Communication' },
  { key: 'officeSupplies',label: 'Office Supplies' },
  { key: 'miscellaneous', label: 'Miscellaneous' },
  { key: 'other',         label: 'Other' },
];

interface LineItem {
  date: string;
  referenceNo: string;
  payeeName: string;
  tin: string;
  particular: string;
  gross: string;
  remarks: string;
  vat: string;
  transpo: string;
  meals: string;
  freight: string;
  communication: string;
  officeSupplies: string;
  miscellaneous: string;
  other: string;
}

interface PettyCashForm {
  companyName: string;
  periodFrom: string;
  periodTo: string;
  beginningBalance: string;
  beginningDate: string;
  cashOnHand: string;
  cashOnHandDate: string;
  amountReplenished: string;
  replenishmentDate: string;
  balanceEndingDate: string;
  preparedBy: string;
  preparedDate: string;
  approvedBy: string;
  approvedDate: string;
  items: LineItem[];
}

const emptyItem = (): LineItem => ({
  date: format(new Date(), 'MM/dd/yyyy'),
  referenceNo: '', payeeName: '', tin: '', particular: '', gross: '', remarks: '',
  vat: '', transpo: '', meals: '', freight: '', communication: '', officeSupplies: '', miscellaneous: '', other: '',
});

const num = (v: string) => parseFloat(v || '0') || 0;

function PettyCashContent() {
  const router = useRouter();
  const { user, isAdmin, allowedViews } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedReports, setSavedReports] = useState<any[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const hasAccess = isAdmin || (allowedViews && allowedViews.includes('petty-cash'));

  useEffect(() => {
    if (user && !isAdmin && allowedViews && !allowedViews.includes('petty-cash')) {
      if (allowedViews.includes('equipment-accountability')) {
        toast.error('Access Denied: Redirecting to Equipment Accountability.');
        router.push('/dashboard/equipment-accountability');
      }
    }
  }, [user, isAdmin, allowedViews, router]);
  
  const searchParams = useSearchParams();
  const reportIdParam = searchParams.get('reportId');

  const filteredReports = savedReports.filter((report) =>
    `${report.companyName} (${report.periodFrom} - ${report.periodTo})`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
        const current = savedReports.find((r) => r.id === selectedReportId);
        setSearchQuery(current ? `${current.companyName} (${current.periodFrom} - ${current.periodTo})` : '');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedReportId, savedReports]);

  useEffect(() => {
    const current = savedReports.find((r) => r.id === selectedReportId);
    setSearchQuery(current ? `${current.companyName} (${current.periodFrom} - ${current.periodTo})` : '');
  }, [selectedReportId, savedReports]);

  // Read saved reports from Firestore
  useEffect(() => {
    if (!user) return;
    const q = isAdmin
      ? query(collection(firestore, 'petty-cash-reports'), orderBy('createdAt', 'desc'))
      : query(collection(firestore, 'petty-cash-reports'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSavedReports(snapshot.docs.map(doc => ({
        id: doc.id,
        companyName: doc.data().companyName || 'Unnamed Company',
        periodFrom: doc.data().periodFrom || '',
        periodTo: doc.data().periodTo || '',
        data: doc.data(),
      })));
    }, (error) => console.error('Error listening to petty cash reports:', error));
    return () => unsubscribe();
  }, [user, isAdmin]);

  useEffect(() => {
    if (reportIdParam && savedReports.length > 0) {
      handleSelectReport(reportIdParam);
    }
  }, [reportIdParam, savedReports]);


  const { register, control, watch, handleSubmit, reset, setValue, formState: { errors } } = useForm<PettyCashForm>({
    defaultValues: {
      companyName: 'AIMF Technologies Corporation',
      periodFrom: format(new Date(), 'MM/dd/yyyy'),
      periodTo: format(new Date(), 'MM/dd/yyyy'),
      beginningBalance: '',
      beginningDate: format(new Date(), 'MM/dd/yyyy'),
      cashOnHand: '',
      cashOnHandDate: format(new Date(), 'MM/dd/yyyy'),
      amountReplenished: '',
      replenishmentDate: format(new Date(), 'MM/dd/yyyy'),
      balanceEndingDate: format(new Date(), 'MM/dd/yyyy'),
      preparedBy: '',
      preparedDate: format(new Date(), 'MM/dd/yyyy'),
      approvedBy: '',
      approvedDate: format(new Date(), 'MM/dd/yyyy'),
      items: [emptyItem()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const previewRef = useRef<HTMLDivElement>(null);
  const watchedItems = watch('items');
  const beginningBalance = num(watch('beginningBalance'));
  const companyName = watch('companyName');
  const periodFrom = watch('periodFrom');
  const periodTo = watch('periodTo');
  const beginningDate = watch('beginningDate');
  const cashOnHand = watch('cashOnHand');
  const cashOnHandDate = watch('cashOnHandDate');
  const amountReplenished = watch('amountReplenished');
  const replenishmentDate = watch('replenishmentDate');
  const balanceEndingDate = watch('balanceEndingDate');
  const preparedBy = watch('preparedBy');
  const preparedDate = watch('preparedDate');
  const approvedBy = watch('approvedBy');
  const approvedDate = watch('approvedDate');

  const handlePrintPreview = () => {
    const element = previewRef.current;
    if (!element) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print/download PDF');
      return;
    }
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(el => el.outerHTML)
      .join('\n');
    const content = element.innerHTML;
    printWindow.document.write(`
      <html>
        <head>
          <title>Petty-Cash-Report-${(companyName || 'report').replace(/\s+/g, '_')}</title>
          ${styles}
          <style>
            @page { margin: 0; }
            body { background: white !important; color: black !important; padding: 2cm !important; margin: 0 !important; }
            .printable-report { width: 100% !important; max-width: 100% !important; border: none !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; }
          </style>
        </head>
        <body>
          <div class="printable-report">${content}</div>
          <script>
            Promise.all(Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(link => {
              return new Promise(resolve => {
                link.onload = resolve;
                link.onerror = resolve;
                setTimeout(resolve, 1000);
              });
            })).then(() => {
              setTimeout(() => {
                window.focus();
                window.print();
                setTimeout(() => window.close(), 500);
              }, 500);
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const totalGross = watchedItems.reduce((s, i) => s + num(i.gross), 0);
  const availableBalance = beginningBalance - totalGross;

  const inputCls = 'bg-muted/50 border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all text-xs h-8 px-2';

  const handleClear = () => {
    setSelectedReportId('');
    reset({
      companyName: 'AIMF Technologies Corporation',
      periodFrom: format(new Date(), 'MM/dd/yyyy'),
      periodTo: format(new Date(), 'MM/dd/yyyy'),
      beginningBalance: '',
      beginningDate: format(new Date(), 'MM/dd/yyyy'),
      cashOnHand: '',
      cashOnHandDate: format(new Date(), 'MM/dd/yyyy'),
      amountReplenished: '',
      replenishmentDate: format(new Date(), 'MM/dd/yyyy'),
      balanceEndingDate: format(new Date(), 'MM/dd/yyyy'),
      preparedBy: '',
      preparedDate: format(new Date(), 'MM/dd/yyyy'),
      approvedBy: '',
      approvedDate: format(new Date(), 'MM/dd/yyyy'),
      items: [emptyItem()],
    });
    toast.success('Form cleared!');
  };

  const handleSaveNewReport = async () => {
    const values = watch();
    if (!window.confirm('Are you sure you want to save these details?')) return;
    setSaving(true);
    try {
      const payload = { 
        ...values, 
        createdAt: new Date(), 
        uid: auth?.currentUser?.uid ?? null 
      };
      const companyPrefix = values.companyName.includes('LEAD') ? 'LEAD-TREND' : 'AIMF';
      const docId = `${companyPrefix}_${values.periodFrom}_${values.periodTo}`.trim().replace(/[\/\\?%*:|"<>]/g, '-');
      await setDoc(doc(firestore, 'petty-cash-reports', docId), payload, { merge: true });
      setSelectedReportId(docId);
      toast.success('Petty Cash report saved successfully!');
    } catch (e: unknown) {
      toast.error('Failed to save report', { description: e instanceof Error ? e.message : 'Unknown error' });
    } finally { setSaving(false); }
  };

  const handleUpdateReport = async () => {
    if (!selectedReportId) { toast.error('No report selected to update'); return; }
    const values = watch();
    if (!window.confirm('Are you sure you want to update these details?')) return;
    setSaving(true);
    try {
      const payload = { 
        ...values, 
        createdAt: new Date(), 
        uid: auth?.currentUser?.uid ?? null 
      };
      const companyPrefix = values.companyName.includes('LEAD') ? 'LEAD-TREND' : 'AIMF';
      const docId = `${companyPrefix}_${values.periodFrom}_${values.periodTo}`.trim().replace(/[\/\\?%*:|"<>]/g, '-');
      if (selectedReportId !== docId) {
        try { await deleteDoc(doc(firestore, 'petty-cash-reports', selectedReportId)); } catch {}
      }
      await setDoc(doc(firestore, 'petty-cash-reports', docId), payload, { merge: true });
      setSelectedReportId(docId);
      toast.success('Petty Cash report updated successfully!');
    } catch (e: unknown) {
      toast.error('Failed to update report', { description: e instanceof Error ? e.message : 'Unknown error' });
    } finally { setSaving(false); }
  };

  const handleDeleteReport = async () => {
    if (!selectedReportId) return;
    if (!window.confirm(`Are you sure you want to delete this report?`)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(firestore, 'petty-cash-reports', selectedReportId));
      toast.success('Report deleted successfully!');
      handleClear();
    } catch (e: unknown) {
      toast.error('Failed to delete report', { description: e instanceof Error ? e.message : 'Unknown error' });
    } finally { setSaving(false); }
  };

  const handleSelectReport = (reportId: string | null) => {
    if (!reportId) return;
    const report = savedReports.find(r => r.id === reportId);
    if (!report) return;
    setSelectedReportId(reportId);
    reset({
      ...report.data
    });
    toast.success('Form filled with saved report info!');
  };

  const onSubmit = async (data: PettyCashForm) => {
    setGenerating(true);
    try {
      const res = await fetch('/api/generate-petty-cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Generation failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Petty-Cash-Report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Petty Cash Report downloaded!');
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  if (!hasAccess) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 mb-2 animate-pulse">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Access Denied</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          You do not have permission to access the Petty Cash module. Please contact your system administrator to request access.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="max-w-7xl mx-auto px-4 pt-10 pb-6 animate-fadeIn">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-3">
              <Wallet className="w-3.5 h-3.5" />
              Petty Cash Fund Replenishment Report
            </div>
            <h1 className="text-3xl font-extrabold text-foreground">Petty Cash Report</h1>
            <p className="text-muted-foreground text-sm mt-1">Fill out the form and download the XLSX report.</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-7xl mx-auto px-4 pb-24 space-y-6">

        {/* Controls */}
        <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg space-y-5">
          <div className="space-y-1.5 w-full relative" ref={dropdownRef}>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Saved Petty Cash Report</Label>
            <div className="flex flex-col md:flex-row gap-3 w-full items-start md:items-center">
              <div className="relative flex-1 min-w-[260px] max-w-md w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white" />
                <input
                  type="text"
                  placeholder={savedReports.length > 0 ? 'Search/select a report...' : 'No saved reports found'}
                  value={searchQuery}
                  onFocus={() => setDropdownOpen(true)}
                  onChange={(e) => { setSearchQuery(e.target.value); setDropdownOpen(true); }}
                  className="h-10 w-full rounded-lg border pl-9 pr-10 py-2 text-sm bg-[hsl(var(--muted))] border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all outline-none text-white"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  {searchQuery && (
                    <button type="button" onClick={() => { setSearchQuery(''); setSelectedReportId(''); setDropdownOpen(true); }} className="p-0.5 hover:bg-muted rounded text-white hover:text-white/80 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                  <button type="button" onClick={() => setDropdownOpen(!dropdownOpen)} className="p-0.5 hover:bg-muted rounded text-white hover:text-white/80 transition-colors">
                    <svg className={cn('w-4 h-4 transition-transform duration-200', dropdownOpen && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                </div>
                {dropdownOpen && (
                  <div className="absolute z-50 w-full mt-1.5 bg-[hsl(var(--muted))] border border-border/80 rounded-xl shadow-xl max-h-60 overflow-y-auto backdrop-blur-xl animate-fadeInUp">
                    {filteredReports.length > 0 ? filteredReports.map(report => (
                      <button key={report.id} type="button"
                        onClick={() => { handleSelectReport(report.id); setSearchQuery(`${report.companyName} (${report.periodFrom} - ${report.periodTo})`); setDropdownOpen(false); }}
                        className={cn('w-full text-left px-4 py-2 text-sm transition-all flex flex-col gap-0.5 text-white hover:bg-secondary border-l-2 border-transparent hover:border-primary', selectedReportId === report.id ? 'bg-primary/20 border-l-2 border-primary text-primary' : '')}>
                        <span className="font-medium">{report.companyName}</span>
                        <span className="text-xs text-muted-foreground">{report.periodFrom} - {report.periodTo}</span>
                      </button>
                    )) : <div className="px-4 py-3 text-sm text-muted-foreground text-center">No reports found</div>}
                  </div>
                )}
              </div>
              {selectedReportId && (
                <div className="flex gap-2 animate-fadeInUp w-full md:w-auto">
                  <Button type="button" variant="outline" onClick={handleUpdateReport} disabled={saving || generating} className="h-10 px-4 text-xs font-semibold rounded-lg bg-blue-600 border-blue-700 text-white hover:bg-blue-500 flex-1 md:flex-none animate-fadeIn">Update Selected</Button>
                  <Button type="button" variant="outline" onClick={handleDeleteReport} disabled={saving || generating} className="h-10 px-4 text-xs font-semibold rounded-lg bg-red-700 border-red-800 text-white hover:bg-red-600 flex-1 md:flex-none animate-fadeIn">Delete Report</Button>
                </div>
              )}
            </div>
          </div>

          <hr className="border-border/40" />

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 w-full">
            <Button type="button" variant="outline" onClick={handleClear} disabled={generating || saving} className="h-10 px-4 text-xs font-semibold rounded-lg bg-slate-600 border-slate-700 text-white hover:bg-slate-500 w-full sm:w-auto">Clear Form</Button>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {!selectedReportId && (
                <Button type="button" variant="outline" onClick={handleSaveNewReport} disabled={generating || saving} className="h-10 px-4 text-xs font-semibold rounded-lg bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-500 w-full sm:w-auto flex items-center justify-center animate-fadeIn">
                  {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Saving...</> : <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Save as New</>}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Header Info */}
        <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg">
          <h2 className="font-semibold text-sm mb-4 text-primary flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Report Header
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-5 space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Company Name</Label>
              <select
                {...register('companyName')}
                className="bg-muted/50 border border-border rounded-lg px-3 h-10 text-sm text-foreground focus:border-primary/50 outline-none transition-all w-full appearance-none"
              >
                <option value="AIMF Technologies Corporation">AIMF Technologies Corporation</option>
                <option value="LEAD TREND MARINE SERVICES CO. LTD.">LEAD TREND MARINE SERVICES CO. LTD.</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Period From</Label>
              <Input {...register('periodFrom')} placeholder="MM/DD/YYYY" className={cn(inputCls, 'h-10')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Period To</Label>
              <Input {...register('periodTo')} placeholder="MM/DD/YYYY" className={cn(inputCls, 'h-10')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Beginning Balance (₱)</Label>
              <Input {...register('beginningBalance')} type="number" step="0.01" placeholder="0.00" className={cn(inputCls, 'h-10')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Beginning Date</Label>
              <Input {...register('beginningDate')} placeholder="MM/DD/YYYY" className={cn(inputCls, 'h-10')} />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm text-primary flex items-center gap-2">
              <Calculator className="w-4 h-4" /> Expense Items
            </h2>
            <Button type="button" onClick={() => append(emptyItem())}
              className="h-8 px-3 text-xs bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-lg flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Row
            </Button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60">
                  <th className="px-2 py-2.5 text-left font-semibold text-muted-foreground w-24">Date</th>
                  <th className="px-2 py-2.5 text-left font-semibold text-muted-foreground w-24">Ref #</th>
                  <th className="px-2 py-2.5 text-left font-semibold text-muted-foreground w-36">Payee Name</th>
                  <th className="px-2 py-2.5 text-left font-semibold text-muted-foreground w-32">Particular</th>
                  <th className="px-2 py-2.5 text-right font-semibold text-muted-foreground w-24">Amount (₱)</th>
                  <th className="px-2 py-2.5 text-left font-semibold text-muted-foreground w-36">Remarks</th>
                  <th className="px-2 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, idx) => (
                  <tr key={field.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-1 py-1"><Input {...register(`items.${idx}.date`)} className={inputCls} /></td>
                    <td className="px-1 py-1"><Input {...register(`items.${idx}.referenceNo`)} className={inputCls} /></td>
                    <td className="px-1 py-1"><Input {...register(`items.${idx}.payeeName`)} className={inputCls} /></td>
                    <td className="px-1 py-1"><Input {...register(`items.${idx}.particular`)} className={inputCls} /></td>
                    <td className="px-1 py-1"><Input {...register(`items.${idx}.gross`)} type="number" step="0.01" className={cn(inputCls, 'text-right')} /></td>
                    <td className="px-1 py-1"><Input {...register(`items.${idx}.remarks`)} className={inputCls} /></td>
                    <td className="px-1 py-1">
                      <button type="button" onClick={() => remove(idx)} disabled={fields.length === 1}
                        className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="bg-muted/30 font-semibold border-t border-border">
                  <td colSpan={4} className="px-3 py-2 text-right text-xs text-muted-foreground">TOTAL</td>
                  <td className="px-2 py-2 text-right text-xs text-primary">
                    ₱{totalGross.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Balance Summary */}
          <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg space-y-3">
            <h2 className="font-semibold text-sm text-primary">Balance Summary</h2>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Beginning Balance', field: 'beginningBalance', date: 'beginningDate', value: beginningBalance },
                { label: 'Less: Expenses', value: totalGross, isExpense: true },
                { label: 'Available Balance', value: availableBalance, highlight: true },
              ].map((row, i) => (
                <div key={i} className={cn('flex items-center justify-between py-2 border-b border-border/40', row.highlight && 'font-bold text-primary')}>
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className={row.isExpense ? 'text-destructive' : ''}>
                    {row.isExpense ? '-' : ''}₱{row.value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between py-2 border-b border-border/40 gap-4">
                <span className="text-muted-foreground">Cash on Hand (₱ / Date)</span>
                <div className="flex gap-2">
                  <Input {...register('cashOnHand')} type="number" step="0.01" placeholder="0.00" className={cn(inputCls, 'w-24 h-8')} />
                  <Input {...register('cashOnHandDate')} placeholder="MM/DD/YYYY" className={cn(inputCls, 'w-28 h-8')} />
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/40 gap-4">
                <span className="text-muted-foreground">Amt Replenished (₱ / Date)</span>
                <div className="flex gap-2">
                  <Input {...register('amountReplenished')} type="number" step="0.01" placeholder="0.00" className={cn(inputCls, 'w-24 h-8')} />
                  <Input {...register('replenishmentDate')} placeholder="MM/DD/YYYY" className={cn(inputCls, 'w-28 h-8')} />
                </div>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">Balance Ending Date</span>
                <Input {...register('balanceEndingDate')} placeholder="MM/DD/YYYY" className={cn(inputCls, 'w-28 h-8')} />
              </div>
            </div>
          </div>

          {/* Signatories */}
          <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg space-y-4">
            <h2 className="font-semibold text-sm text-primary">Signatories</h2>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Prepared By</Label>
                <Input {...register('preparedBy')} placeholder="Full name" className={cn(inputCls, 'h-10 text-sm')} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Prepared Date</Label>
                <Input {...register('preparedDate')} placeholder="MM/DD/YYYY" className={cn(inputCls, 'h-10 text-sm')} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Approved By</Label>
                <Input {...register('approvedBy')} placeholder="Full name" className={cn(inputCls, 'h-10 text-sm')} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Approved Date</Label>
                <Input {...register('approvedDate')} placeholder="MM/DD/YYYY" className={cn(inputCls, 'h-10 text-sm')} />
              </div>
            </div>
          </div>
        </div>

        {/* Actions Row */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            onClick={handlePrintPreview}
            className="h-11 px-6 text-sm font-semibold rounded-xl border border-border bg-transparent text-foreground hover:bg-muted transition-all duration-200 flex items-center gap-2"
          >
            <Printer className="w-4 h-4" /> Print Preview
          </Button>
        </div>

        {/* Bottom Live Preview */}
        <div className="space-y-4 pt-8 border-t border-border/40">
          <div className="text-xs font-semibold text-muted-foreground tracking-wider uppercase text-center">
            Petty Cash Report Live Preview
          </div>

          <div
            ref={previewRef}
            className="printable-report bg-white text-neutral-900 border border-neutral-200 rounded-xl p-8 shadow-2xl flex flex-col font-sans max-w-6xl mx-auto w-full text-xs"
          >
            {/* Header */}
            <div className="text-center space-y-1 border-b-2 border-neutral-200 pb-4 mb-6">
              <h2 className="text-lg font-black uppercase text-neutral-800 tracking-tight">Petty Cash replenishment & expense ledger</h2>
              <div className="text-sm font-bold text-neutral-700">{companyName || 'LEAD TREND MARINE SERVICES CO. LTD.'}</div>
              <div className="text-[10px] text-neutral-500">Period: {periodFrom || '—'} to {periodTo || '—'}</div>
            </div>

            {/* Balances Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-neutral-700">
              <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                <span className="text-[9px] uppercase font-bold text-neutral-400 block">Beginning Balance</span>
                <span className="font-bold text-neutral-800">₱{beginningBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                <span className="text-[9px] text-neutral-400 block mt-1">{beginningDate || '—'}</span>
              </div>
              <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                <span className="text-[9px] uppercase font-bold text-neutral-400 block">Total Expenses</span>
                <span className="font-bold text-red-600">₱{totalGross.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                <span className="text-[9px] uppercase font-bold text-neutral-400 block">Available Balance</span>
                <span className="font-bold text-emerald-600">₱{availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                <span className="text-[9px] uppercase font-bold text-neutral-400 block">Replenished Amount</span>
                <span className="font-bold text-neutral-800">₱{(parseFloat(amountReplenished) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                <span className="text-[9px] text-neutral-400 block mt-1">{replenishmentDate || '—'}</span>
              </div>
            </div>

            {/* Ledger Table */}
            <div className="border border-neutral-200 rounded-lg overflow-hidden mb-6">
              <table className="w-full text-left border-collapse text-neutral-700 text-[10px]">
                <thead>
                  <tr className="bg-neutral-100 border-b border-neutral-200 text-neutral-600 font-bold uppercase tracking-wider text-[9px]">
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Ref #</th>
                    <th className="px-2 py-2">Payee Name</th>
                    <th className="px-2 py-2">Particular</th>
                    <th className="px-2 py-2 text-right">Amount (₱)</th>
                    <th className="px-2 py-2">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {watchedItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50/50">
                      <td className="px-2 py-1.5 text-neutral-500">{item.date || '—'}</td>
                      <td className="px-2 py-1.5 font-mono">{item.referenceNo || '—'}</td>
                      <td className="px-2 py-1.5 font-medium text-neutral-800 max-w-[120px] truncate">{item.payeeName || '—'}</td>
                      <td className="px-2 py-1.5 text-neutral-600 max-w-[200px] truncate">{item.particular || '—'}</td>
                      <td className="px-2 py-1.5 text-right font-bold">₱{(parseFloat(item.gross) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1.5 text-neutral-600 max-w-[150px] truncate">{item.remarks || '—'}</td>
                    </tr>
                  ))}
                  <tr className="bg-neutral-50 font-bold border-t border-neutral-200 text-neutral-800">
                    <td colSpan={4} className="px-2 py-2 text-right">TOTAL EXPENSES:</td>
                    <td className="px-2 py-2 text-right text-red-600">₱{totalGross.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td colSpan={1} />
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer / Signatories */}
            <div className="border-t border-neutral-100 pt-6">
              <div className="grid grid-cols-2 gap-12 text-center">
                <div className="space-y-2">
                  <div className="border-b border-neutral-300 mx-auto w-48 h-8 font-serif text-sm italic flex items-end justify-center pb-1 text-neutral-800">{preparedBy}</div>
                  <div className="text-[9px] uppercase font-bold text-neutral-500">Prepared By</div>
                  <div className="text-[8px] text-neutral-400">{preparedDate || '—'}</div>
                </div>
                <div className="space-y-2">
                  <div className="border-b border-neutral-300 mx-auto w-48 h-8 font-serif text-sm italic flex items-end justify-center pb-1 text-neutral-800">{approvedBy}</div>
                  <div className="text-[9px] uppercase font-bold text-neutral-500">Approved By</div>
                  <div className="text-[8px] text-neutral-400">{approvedDate || '—'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground/50">
        Petty Cash Report · LEAD TREND MARINE SERVICES CO. LTD. ©{new Date().getFullYear()}
      </footer>
    </div>
  );
}


export default function PettyCashPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    }>
      <PettyCashContent />
    </Suspense>
  );
}
