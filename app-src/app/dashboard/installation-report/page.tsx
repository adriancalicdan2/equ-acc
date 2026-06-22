'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ClipboardList, Download, Loader2, Search, CheckCircle2,
  AlertCircle, FileSpreadsheet, Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { firestore, auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/firebase/AuthContext';
import {
  collection, onSnapshot, query, orderBy, doc,
  setDoc, deleteDoc, where,
} from 'firebase/firestore';

// Fixed items that match the xlsx template rows 13–21
const INSTALL_ITEMS = [
  'Work our monitoring points',
  'Oil Level Monitoring',
  'Whole-Ship Intelligent Networking',
  'Data Storage & Transmission',
  'Data Storage & Transmission (Oil Level)',
  'Intelligent Analysis Subs (Working Hour)',
  'Intelligent Analysis Subs (Fuel)',
  'System Delivery Service Fee',
  'System Operation Service Fee',
];

interface ItemRow {
  qty: string;
  remarks: string;
}

interface InstallReportForm {
  vessel: string;
  representative: string;
  date: string;
  refCO: string;
  items: ItemRow[];
  reportSummary: string;
  aimfRep: string;
  zeahoRep: string;
  technicalSup: string;
}

const emptyForm = (): InstallReportForm => ({
  vessel: '',
  representative: '',
  date: format(new Date(), 'MM/dd/yyyy'),
  refCO: '',
  items: INSTALL_ITEMS.map(() => ({ qty: '', remarks: '' })),
  reportSummary: '',
  aimfRep: '',
  zeahoRep: '',
  technicalSup: '',
});

const inputCls =
  'bg-muted/50 border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all text-xs h-8 px-2 outline-none text-white rounded-md border w-full';

function InstallationReportContent() {
  const router = useRouter();
  const { user, isAdmin, allowedViews } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedReports, setSavedReports] = useState<any[]>([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<InstallReportForm>(emptyForm());

  const handleDownloadPDF = async () => {
    const element = previewRef.current;
    if (!element) return;

    try {
      toast.loading('Generating PDF...', { id: 'pdf-generation' });
      // @ts-ignore
      const html2canvas = (await import('html2canvas-pro')).default;
      // @ts-ignore
      const jsPDF = (await import('jspdf')).default;

      const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false });
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF({ unit: 'in' as const, format: 'letter' as const, orientation: 'portrait' as const });
      const imgWidth = 8.5 - 2 * 0.2; // Letter size width 8.5", margins 0.2"
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0.2, 0.2, imgWidth, imgHeight);
      pdf.save(`Installation-Report-${(form.vessel || 'report').replace(/\s+/g, '_')}.pdf`);

      toast.success('PDF downloaded successfully!', { id: 'pdf-generation' });
    } catch (err: any) {
      toast.error('PDF generation failed: ' + err.message, { id: 'pdf-generation' });
    }
  };

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
          <title>Installation-Report-${(form.vessel || 'report').replace(/\s+/g, '_')}</title>
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

  const hasAccess =
    isAdmin || (allowedViews && allowedViews.includes('installation-report'));

  const searchParams = useSearchParams();
  const reportIdParam = searchParams.get('reportId');

  // Redirect if no access
  useEffect(() => {
    if (user && !isAdmin && allowedViews && !allowedViews.includes('installation-report')) {
      toast.error('Access Denied: You do not have permission to view Installation Reports.');
      router.push('/dashboard/equipment-accountability');
    }
  }, [user, isAdmin, allowedViews, router]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        const current = savedReports.find((r) => r.id === selectedReportId);
        setSearchQuery(current ? `${current.vessel} — ${current.date}` : '');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectedReportId, savedReports]);

  // Sync search label with selection
  useEffect(() => {
    const current = savedReports.find((r) => r.id === selectedReportId);
    setSearchQuery(current ? `${current.vessel} — ${current.date}` : '');
  }, [selectedReportId, savedReports]);

  // Read saved reports from Firestore
  useEffect(() => {
    if (!user) return;
    const q = isAdmin
      ? query(collection(firestore, 'installation-reports'), orderBy('createdAt', 'desc'))
      : query(
          collection(firestore, 'installation-reports'),
          where('uid', '==', user.uid),
          orderBy('createdAt', 'desc')
        );

    const unsub = onSnapshot(q, (snap) => {
      setSavedReports(
        snap.docs.map((d) => ({
          id: d.id,
          vessel: d.data().vessel || 'Unnamed Vessel',
          date: d.data().date || '',
          data: d.data(),
        }))
      );
    });
    return () => unsub();
  }, [user, isAdmin]);

  // Auto-load if reportId in URL
  useEffect(() => {
    if (reportIdParam && savedReports.length > 0) {
      handleSelectReport(reportIdParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportIdParam, savedReports]);

  // ── Form helpers ────────────────────────────────────────────────────────────

  const setField = (key: keyof InstallReportForm, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setItemField = (idx: number, key: keyof ItemRow, value: string) =>
    setForm((prev) => {
      const items = prev.items.map((it, i) => (i === idx ? { ...it, [key]: value } : it));
      return { ...prev, items };
    });

  const handleClear = () => {
    setSelectedReportId('');
    setForm(emptyForm());
    toast.success('Form cleared!');
  };

  const handleSelectReport = (reportId: string | null) => {
    if (!reportId) return;
    const report = savedReports.find((r) => r.id === reportId);
    if (!report) return;
    setSelectedReportId(reportId);
    setForm(report.data);
    toast.success('Form filled with saved report info!');
  };

  // ── Firestore CRUD ──────────────────────────────────────────────────────────

  const makeDocId = (f: InstallReportForm) =>
    `${f.vessel}_${f.date}`.trim().replace(/[\/\\?%*:|"<>]/g, '-');

  const handleSaveNew = async () => {
    if (!form.vessel) { toast.error('Vessel name is required to save'); return; }
    if (!window.confirm('Save this report?')) return;
    setSaving(true);
    try {
      const payload = { ...form, createdAt: new Date(), uid: auth?.currentUser?.uid ?? null };
      const docId = makeDocId(form);
      await setDoc(doc(firestore, 'installation-reports', docId), payload, { merge: true });
      setSelectedReportId(docId);
      toast.success('Installation Report saved!');
    } catch (e: any) {
      toast.error('Failed to save report: ' + e.message);
    } finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    if (!selectedReportId) { toast.error('No report selected'); return; }
    if (!form.vessel) { toast.error('Vessel name is required'); return; }
    if (!window.confirm('Update this report?')) return;
    setSaving(true);
    try {
      const payload = { ...form, createdAt: new Date(), uid: auth?.currentUser?.uid ?? null };
      const docId = makeDocId(form);
      if (selectedReportId !== docId) {
        try { await deleteDoc(doc(firestore, 'installation-reports', selectedReportId)); } catch {}
      }
      await setDoc(doc(firestore, 'installation-reports', docId), payload, { merge: true });
      setSelectedReportId(docId);
      toast.success('Installation Report updated!');
    } catch (e: any) {
      toast.error('Failed to update report: ' + e.message);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!selectedReportId) return;
    if (!window.confirm('Delete this report?')) return;
    setSaving(true);
    try {
      await deleteDoc(doc(firestore, 'installation-reports', selectedReportId));
      toast.success('Report deleted!');
      handleClear();
    } catch (e: any) {
      toast.error('Failed to delete: ' + e.message);
    } finally { setSaving(false); }
  };

  // ── Excel download ──────────────────────────────────────────────────────────

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/generate-installation-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Generation failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Installation-Report-${form.vessel || 'report'}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Installation Report downloaded!');
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate report');
    } finally { setGenerating(false); }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!hasAccess) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 mb-2 animate-pulse">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Access Denied</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          You do not have permission to access the Installation Report module. Please contact your
          system administrator.
        </p>
      </div>
    );
  }

  const filteredReports = savedReports.filter((r) =>
    `${r.vessel} ${r.date}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="max-w-7xl mx-auto px-4 pt-10 pb-6 animate-fadeIn">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-3">
          <ClipboardList className="w-3.5 h-3.5" />
          AIMF Technologies Corporation
        </div>
        <h1 className="text-3xl font-extrabold text-foreground">Installation Service Report</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Fill out the form and download the XLSX report.
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 pb-24 space-y-6">

        {/* ── Controls card ── */}
        <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg space-y-5">
          {/* Report Selector */}
          <div className="space-y-1.5 w-full relative" ref={dropdownRef}>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Select Saved Report
            </Label>
            <div className="flex flex-col md:flex-row gap-3 w-full items-start md:items-center">
              <div className="relative flex-1 min-w-[260px] max-w-md w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white" />
                <input
                  type="text"
                  placeholder={savedReports.length > 0 ? 'Search/select a report...' : 'No saved reports yet'}
                  value={searchQuery}
                  onFocus={() => setDropdownOpen(true)}
                  onChange={(e) => { setSearchQuery(e.target.value); setDropdownOpen(true); }}
                  className="h-10 w-full rounded-lg border pl-9 pr-10 py-2 text-sm bg-[hsl(var(--muted))] border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all outline-none text-white"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  {searchQuery && (
                    <button type="button"
                      onClick={() => { setSearchQuery(''); setSelectedReportId(''); setDropdownOpen(true); }}
                      className="p-0.5 hover:bg-muted rounded text-white hover:text-white/80 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  <button type="button" onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="p-0.5 hover:bg-muted rounded text-white hover:text-white/80 transition-colors">
                    <svg className={cn('w-4 h-4 transition-transform duration-200', dropdownOpen && 'rotate-180')}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                {dropdownOpen && (
                  <div className="absolute z-50 w-full mt-1.5 bg-[hsl(var(--muted))] border border-border/80 rounded-xl shadow-xl max-h-60 overflow-y-auto backdrop-blur-xl animate-fadeInUp">
                    {filteredReports.length > 0 ? filteredReports.map((r) => (
                      <button key={r.id} type="button"
                        onClick={() => {
                          handleSelectReport(r.id);
                          setSearchQuery(`${r.vessel} — ${r.date}`);
                          setDropdownOpen(false);
                        }}
                        className={cn(
                          'w-full text-left px-4 py-2 text-sm transition-all flex flex-col gap-0.5 text-white hover:bg-secondary border-l-2 border-transparent hover:border-primary',
                          selectedReportId === r.id && 'bg-primary/20 border-l-2 border-primary text-primary'
                        )}>
                        <span className="font-medium">{r.vessel}</span>
                        <span className="text-xs text-muted-foreground">{r.date}</span>
                      </button>
                    )) : (
                      <div className="px-4 py-3 text-sm text-muted-foreground text-center">No reports found</div>
                    )}
                  </div>
                )}
              </div>

              {selectedReportId && (
                <div className="flex gap-2 animate-fadeInUp w-full md:w-auto">
                  <Button type="button" onClick={handleUpdate} disabled={saving || generating}
                    className="h-10 px-4 text-xs font-semibold rounded-lg bg-blue-600 border-blue-700 text-white hover:bg-blue-500 flex-1 md:flex-none">
                    Update Selected
                  </Button>
                  <Button type="button" onClick={handleDelete} disabled={saving || generating}
                    className="h-10 px-4 text-xs font-semibold rounded-lg bg-red-700 border-red-800 text-white hover:bg-red-600 flex-1 md:flex-none">
                    Delete Report
                  </Button>
                </div>
              )}
            </div>
          </div>

          <hr className="border-border/40" />

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 w-full">
            <Button type="button" onClick={handleClear} disabled={generating || saving}
              className="h-10 px-4 text-xs font-semibold rounded-lg bg-slate-600 border-slate-700 text-white hover:bg-slate-500 w-full sm:w-auto">
              Clear Form
            </Button>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {!selectedReportId && (
                <Button type="button" onClick={handleSaveNew} disabled={generating || saving}
                  className="h-10 px-4 text-xs font-semibold rounded-lg bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-500 w-full sm:w-auto flex items-center justify-center gap-1.5">
                  {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving...</> : <><CheckCircle2 className="w-3.5 h-3.5" />Save as New</>}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ── Header Info ── */}
        <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg space-y-4">
          <h2 className="font-semibold text-sm text-primary flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Report Header
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Vessel Name</Label>
              <input
                className={inputCls}
                value={form.vessel}
                onChange={(e) => setField('vessel', e.target.value)}
                placeholder="e.g. MV EXAMPLE"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">AIMF I.T. Representative</Label>
              <input
                className={inputCls}
                value={form.representative}
                onChange={(e) => setField('representative', e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Date</Label>
              <input
                className={inputCls}
                value={form.date}
                onChange={(e) => setField('date', e.target.value)}
                placeholder="MM/DD/YYYY"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Ref. C/O</Label>
              <input
                className={inputCls}
                value={form.refCO}
                onChange={(e) => setField('refCO', e.target.value)}
                placeholder="Reference C/O"
              />
            </div>
          </div>
        </div>

        {/* ── Install Items Table ── */}
        <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg space-y-4">
          <h2 className="font-semibold text-sm text-primary flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Installation Items
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-muted-foreground font-semibold">
                  <th className="px-4 py-3 text-left w-8">No.</th>
                  <th className="px-4 py-3 text-left">Install Description</th>
                  <th className="px-4 py-3 text-center w-32">Quantity</th>
                  <th className="px-4 py-3 text-left w-56">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {INSTALL_ITEMS.map((desc, idx) => (
                  <tr key={idx} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2 text-muted-foreground font-mono">{idx + 1}</td>
                    <td className="px-4 py-2 text-foreground">{desc}</td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        className={cn(inputCls, 'text-center w-full')}
                        value={form.items[idx]?.qty ?? ''}
                        onChange={(e) => setItemField(idx, 'qty', e.target.value)}
                        placeholder="—"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        className={cn(inputCls, 'w-full')}
                        value={form.items[idx]?.remarks ?? ''}
                        onChange={(e) => setItemField(idx, 'remarks', e.target.value)}
                        placeholder="Optional remarks"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Report Summary + Signatories ── */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg space-y-3">
            <h2 className="font-semibold text-sm text-primary">Report Summary / Remarks</h2>
            <textarea
              rows={6}
              className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-white focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all resize-none"
              value={form.reportSummary}
              onChange={(e) => setField('reportSummary', e.target.value)}
              placeholder="Enter summary or remarks..."
            />
          </div>

          <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg space-y-4">
            <h2 className="font-semibold text-sm text-primary">Signatories</h2>
            {/* 'Acknowledged by:' is a fixed label in the xlsx (B30) */}
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              Acknowledged by:
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">AIMF Tech Corp. Representative</Label>
                <input
                  className={inputCls}
                  value={form.aimfRep}
                  onChange={(e) => setField('aimfRep', e.target.value)}
                  placeholder="Name / signature"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">ZEAHO (NANJING) Representative</Label>
                <input
                  className={inputCls}
                  value={form.zeahoRep}
                  onChange={(e) => setField('zeahoRep', e.target.value)}
                  placeholder="Name / signature"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Technical Superintendent</Label>
                <input
                  className={inputCls}
                  value={form.technicalSup}
                  onChange={(e) => setField('technicalSup', e.target.value)}
                  placeholder="Name / signature"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Actions Row ── */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            onClick={handleDownloadPDF}
            className="h-11 px-6 text-sm font-semibold rounded-xl bg-blue-600 border border-blue-700 text-white hover:bg-blue-500 transition-all duration-200 flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Download PDF
          </Button>
          <Button
            type="button"
            onClick={handlePrintPreview}
            className="h-11 px-6 text-sm font-semibold rounded-xl border border-border bg-transparent text-foreground hover:bg-muted transition-all duration-200 flex items-center gap-2"
          >
            <Printer className="w-4 h-4" /> Print Preview
          </Button>
          <Button
            type="button"
            onClick={handleDownload}
            disabled={generating}
            className="h-11 px-8 text-sm font-semibold rounded-xl bg-blue-600 border-blue-700 text-white hover:bg-blue-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] active:scale-[0.98] transition-all duration-200 flex items-center gap-2"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
              : <><Download className="w-4 h-4" />Download XLSX Report</>}
          </Button>
        </div>

        {/* ── Bottom Live Preview ── */}
        <div className="space-y-4 pt-8 border-t border-border/40">
          <div className="text-xs font-semibold text-muted-foreground tracking-wider uppercase text-center">
            Installation Report Live Preview
          </div>

          <div
            ref={previewRef}
            className="printable-report bg-white text-neutral-900 border border-neutral-200 rounded-xl p-8 shadow-2xl flex flex-col font-sans max-w-4xl mx-auto w-full text-xs"
          >
            {/* Header */}
            <div className="flex justify-between items-start border-b-2 border-neutral-200 pb-4 mb-6">
              <div>
                <h2 className="text-lg font-black uppercase text-neutral-800 tracking-tight">AIMF Technologies Corporation</h2>
                <p className="text-[10px] text-neutral-500 font-medium">Installation Service Report</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">Status</span>
                <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">Draft</span>
              </div>
            </div>

            {/* Metadata Section */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-neutral-50 p-4 rounded-lg border border-neutral-100 mb-6 text-neutral-700">
              <div>
                <span className="text-[9px] uppercase font-bold text-neutral-400 block">Vessel Name</span>
                <span className="font-bold text-neutral-800">{form.vessel || '—'}</span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-neutral-400 block">Representative</span>
                <span className="font-semibold text-neutral-800">{form.representative || '—'}</span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-neutral-400 block">Date</span>
                <span className="font-semibold text-neutral-800">{form.date || '—'}</span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-neutral-400 block">Ref C/O</span>
                <span className="font-semibold text-neutral-800">{form.refCO || '—'}</span>
              </div>
            </div>

            {/* Items Table */}
            <div className="border border-neutral-200 rounded-lg overflow-hidden mb-6">
              <table className="w-full text-left border-collapse text-neutral-700">
                <thead>
                  <tr className="bg-neutral-100 border-b border-neutral-200 text-neutral-600 font-bold uppercase tracking-wider text-[9px]">
                    <th className="px-4 py-2 w-12 text-center">No.</th>
                    <th className="px-4 py-2">Install Description</th>
                    <th className="px-4 py-2 w-32 text-center">Quantity</th>
                    <th className="px-4 py-2 w-64">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-xs">
                  {INSTALL_ITEMS.map((desc, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-2 text-center font-mono text-neutral-400">{idx + 1}</td>
                      <td className="px-4 py-2 font-medium text-neutral-800">{desc}</td>
                      <td className="px-4 py-2 text-center font-bold">{form.items[idx]?.qty || '—'}</td>
                      <td className="px-4 py-2 text-neutral-600 truncate">{form.items[idx]?.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary / Remarks */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 mb-6">
              <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Report Summary / Remarks</h4>
              <p className="whitespace-pre-wrap text-xs text-neutral-800 leading-relaxed min-h-[4rem]">
                {form.reportSummary || 'No summary or remarks provided yet.'}
              </p>
            </div>

            {/* Signatories */}
            <div className="border-t border-neutral-100 pt-6">
              <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-6 text-center">Acknowledged by</h4>
              <div className="grid grid-cols-3 gap-8 text-center">
                <div className="space-y-2">
                  <div className="border-b border-neutral-300 mx-auto w-40 h-8 font-serif text-sm italic flex items-end justify-center pb-1 text-neutral-800">{form.aimfRep}</div>
                  <div className="text-[9px] uppercase font-bold text-neutral-500">AIMF Tech Representative</div>
                </div>
                <div className="space-y-2">
                  <div className="border-b border-neutral-300 mx-auto w-40 h-8 font-serif text-sm italic flex items-end justify-center pb-1 text-neutral-800">{form.zeahoRep}</div>
                  <div className="text-[9px] uppercase font-bold text-neutral-500">ZEAHO Representative</div>
                </div>
                <div className="space-y-2">
                  <div className="border-b border-neutral-300 mx-auto w-40 h-8 font-serif text-sm italic flex items-end justify-center pb-1 text-neutral-800">{form.technicalSup}</div>
                  <div className="text-[9px] uppercase font-bold text-neutral-500">Technical Superintendent</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground/50">
        Installation Service Report · AIMF Technologies Corp. ©{new Date().getFullYear()}
      </footer>
    </div>
  );
}

export default function InstallationReportPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    }>
      <InstallationReportContent />
    </Suspense>
  );
}
