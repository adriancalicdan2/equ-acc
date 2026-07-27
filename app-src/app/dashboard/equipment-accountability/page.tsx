'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  FileText, Ship, Wifi, Zap, Sun, StickyNote,
  Download, Loader2, CheckCircle2, ChevronRight, AlertCircle, Search, Printer,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

import { accountabilityFormSchema, AccountabilityFormValues } from '@/lib/validations/formSchema';
import { CopyType } from '@/types/form';
import { cn } from '@/lib/utils';
import { firestore } from '@/lib/firebase/client';
import { useAuth } from '@/lib/firebase/AuthContext';
import { authenticatedFetch } from '@/lib/firebase/authenticatedFetch';
import { diffEquipmentReports } from '@/lib/equipment/changeTracking';
import {
  EQUIPMENT_LANGUAGE_STORAGE_KEY,
  equipmentAccountabilityCopy,
  equipmentChangeSummaryForLanguage,
  equipmentStatusLabel,
  equipmentValidationMessage,
  isEquipmentLanguage,
  type EquipmentLanguage,
} from '@/lib/equipment/accountabilityI18n';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { EquipmentCodeScanner } from '@/components/form/EquipmentCodeScanner';
import { classifyEquipmentSerial, FloaterType, nextEmptyIndex, nextFloaterIndex } from '@/lib/equipmentScanner';


const FieldError = ({ name, errors, language }: { name: string; errors: any; language: EquipmentLanguage }) => {
  const parts = name.split('.');
  let err: any = errors;
  for (const p of parts) err = err?.[p];
  if (!err?.message) return null;
  return (
    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
      <AlertCircle className="w-3 h-3" /> {equipmentValidationMessage(language, err.message)}
    </p>
  );
};

const SectionCard = ({
  id, icon: Icon, title, badge, children,
}: {
  id: string; icon: React.ElementType; title: string; badge?: string; children: React.ReactNode;
}) => (
  <section
    id={id}
    className="section-card bg-card border border-border rounded-2xl overflow-hidden"
  >
    <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-muted/30">
      <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/15 text-primary">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <h2 className="font-semibold text-foreground">{title}</h2>
      </div>
      {badge && (
        <Badge variant="outline" className="text-xs border-primary/30 text-primary">
          {badge}
        </Badge>
      )}
    </div>
    <div className="p-6 space-y-5">{children}</div>
  </section>
);

const Field = ({ label, error, children }: { label: string; error?: boolean; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className={cn('text-sm font-medium', error && 'text-destructive')}>{label}</Label>
    {children}
  </div>
);

const QuantitySelector = ({
  value, onChange, min = 1, max = 100,
}: {
  value: string; onChange: (val: string) => void; min?: number; max?: number;
}) => {
  const num = parseInt(value || '1', 10) || 1;
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <Button type="button" variant="outline" size="icon"
        onClick={() => num > min && onChange(String(num - 1))} disabled={num <= min}
        className="w-9 h-9 rounded-xl border-border bg-muted/40 hover:bg-muted transition-all active:scale-95">-</Button>
      <div className="w-12 h-9 flex items-center justify-center font-bold text-sm bg-muted/20 border border-border rounded-xl">{num}</div>
      <Button type="button" variant="outline" size="icon"
        onClick={() => num < max && onChange(String(num + 1))} disabled={num >= max}
        className="w-9 h-9 rounded-xl border-border bg-muted/40 hover:bg-muted transition-all active:scale-95">+</Button>
    </div>
  );
};

function getAllSerialNumbers(values: any): { sn: string; source: string }[] {
  const sns: { sn: string; source: string }[] = [];
  const addSns = (raw: string | undefined, category: string) => {
    if (!raw) return;
    raw.split(',').map((s: string) => s.trim()).forEach((s: string) => { if (s) sns.push({ sn: s, source: category }); });
  };
  addSns(values.flsCapacitance?.serialNumber, 'Fuel Level Sensor (Capacitance)');
  addSns(values.flsFloater?.serialNumber, 'Fuel Level Sensor (Floater)');
  addSns(values.network?.serialNumber, 'Network & Telemetry');
  addSns(values.engine?.serialNumber, 'Engine Monitoring');
  addSns(values.solar?.serialNumber, 'Solar Power');
  return sns;
}

function EquipmentAccountabilityContent() {
  const router = useRouter();
  const { user, isAdmin, allowedViews } = useAuth();
  const searchParams = useSearchParams();
  const reportIdParam = searchParams.get('reportId');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedReports, setSavedReports] = useState<any[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>('');
  const [vesselSearchQuery, setVesselSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [language, setLanguage] = useState<EquipmentLanguage>('en');
  const copy = equipmentAccountabilityCopy[language];
  const ui = (english: string, chinese: string) => language === 'zh' ? chinese : english;
  const copyOptions = (['aimf', 'vessel', 'vessel_owner', 'likas'] as const).map((value) => ({
    value,
    ...copy.copyOptions[value],
  }));

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem(EQUIPMENT_LANGUAGE_STORAGE_KEY);
    if (isEquipmentLanguage(savedLanguage)) setLanguage(savedLanguage);
  }, []);

  const handleLanguageChange = (nextLanguage: EquipmentLanguage) => {
    setLanguage(nextLanguage);
    window.localStorage.setItem(EQUIPMENT_LANGUAGE_STORAGE_KEY, nextLanguage);
  };

  const handleDownloadPDF = async () => {
    const element = previewRef.current;
    if (!element) return;

    try {
       toast.loading(ui('Generating PDF...', '正在生成 PDF…'), { id: 'pdf-generation' });
       // @ts-ignore
       const html2canvas = (await import('html2canvas-pro')).default;
       // @ts-ignore
       const jsPDF = (await import('jspdf')).default;

       const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false });
       const imgData = canvas.toDataURL('image/jpeg', 0.98);
       
       const pdf = new jsPDF({ unit: 'in' as const, format: 'letter' as const, orientation: 'portrait' as const });
       const pageWidth = 8.5;
       const pageHeight = 11;
       const margin = 0.2;
       const maxImgWidth = pageWidth - 2 * margin;
       const maxImgHeight = pageHeight - 2 * margin;

       const imgWidth = maxImgWidth;
       const imgHeight = (canvas.height * imgWidth) / canvas.width;

       let heightLeft = imgHeight;
       let position = margin;

       pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
       heightLeft -= maxImgHeight;

       while (heightLeft > 0) {
         position = position - maxImgHeight;
         pdf.addPage();
         pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
         heightLeft -= maxImgHeight;
       }

       const vName = watch('vesselInfo.vesselName') || 'Equipment-Accountability-Report';
       pdf.save(`${vName.trim().replace(/[\/\\?%*:|"<>\u200b]/g, '-')}.pdf`);

       toast.success(ui('PDF downloaded successfully!', 'PDF 下载成功！'), { id: 'pdf-generation' });
    } catch (err: any) {
      toast.error(ui('PDF generation failed: ', 'PDF 生成失败：') + err.message, { id: 'pdf-generation' });
    }
  };

  const handlePrintPreview = () => {
    const element = previewRef.current;
    if (!element) return;

    const selectedCopies = watchedCopyTypes ?? [];
    if (selectedCopies.length === 0) {
      toast.error(ui('Please select at least one copy type to print.', '请至少选择一种要打印的副本。'));
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error(ui('Please allow popups to print/download PDF', '请允许弹出窗口，以便打印或下载 PDF。'));
      return;
    }

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(el => el.outerHTML)
      .join('\n');

    // Build one page per selected copy type
    const pages = selectedCopies.map((ct, idx) => {
      // Clone the preview content and replace the badge area with just this copy's label
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = element.innerHTML;

      // Find the badge container and replace its content with the single copy label
      const badgeContainer = tempDiv.querySelector('[data-copy-badges]');
      if (badgeContainer) {
        badgeContainer.innerHTML = `<span style="background:#dbeafe;color:#1e40af;font-weight:700;padding:2px 6px;border-radius:4px;font-size:9px;text-transform:uppercase;">${copy.copyOptions[ct].label}</span>`;
      }

      const isLast = idx === selectedCopies.length - 1;
      return `
        <div style="page-break-after: ${isLast ? 'avoid' : 'always'}; box-sizing: border-box; padding: 2cm; width: 100%;">
          <div class="printable-report">${tempDiv.innerHTML}</div>
        </div>
      `;
    }).join('\n');

    printWindow.document.write(`
      <html>
        <head>
          <title>Equipment-Accountability-${(watch('vesselInfo.vesselName') || 'report').replace(/\s+/g, '_')}</title>
          ${styles}
          <style>
            @page { margin: 0; }
            body { background: white !important; color: black !important; padding: 0 !important; margin: 0 !important; }
            .printable-report { width: 100% !important; max-width: 100% !important; border: none !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; }
          </style>
        </head>
        <body>
          ${pages}
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
          <\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const hasAccess = isAdmin || (allowedViews && allowedViews.includes('equipment-accountability'));

  useEffect(() => {
    if (user && !isAdmin && allowedViews && !allowedViews.includes('equipment-accountability')) {
      if (allowedViews.includes('petty-cash')) {
        toast.error(language === 'zh' ? '访问被拒绝：正在转到备用金页面。' : 'Access Denied: Redirecting to Petty Cash.');
        router.push('/dashboard/petty-cash');
      }
    }
  }, [user, isAdmin, allowedViews, router, language]);

  const filteredReports = savedReports.filter((report) =>
    (report.vesselName || '').toLowerCase().includes(vesselSearchQuery.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        const current = savedReports.find((r) => r.id === selectedReportId);
        setVesselSearchQuery(current ? current.vesselName : '');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedReportId, savedReports]);

  useEffect(() => {
    const current = savedReports.find((r) => r.id === selectedReportId);
    setVesselSearchQuery(current ? current.vesselName : '');
  }, [selectedReportId, savedReports]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(firestore, 'reports'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSavedReports(snapshot.docs
        .filter((snapshotDoc) => snapshotDoc.data().archived !== true)
        .map((snapshotDoc) => ({
          id: snapshotDoc.id,
          vesselName: snapshotDoc.data().vesselInfo?.vesselName || (language === 'zh' ? '未命名船舶' : 'Unnamed Vessel'),
          installationDate: snapshotDoc.data().vesselInfo?.installationDate || '',
          data: snapshotDoc.data(),
        })));
    }, (error) => console.error('Error listening to reports:', error));
    return () => unsubscribe();
  }, [user, language]);


  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<AccountabilityFormValues>({
    resolver: zodResolver(accountabilityFormSchema),
    defaultValues: {
      copyTypes: ['aimf', 'vessel', 'vessel_owner', 'likas'],
      vesselInfo: { vesselName: '', installationDate: '', leadEngineer: '' },
      flsCapacitance: { qty: '1', tankAssigned: '', serialNumber: '', calibrationStatus: 'good' },
      flsFloater: { qty: '1', tankAssigned: '', serialNumber: '', calibrationStatus: 'good' },
      network: { qty: '1', serialNumber: '', signalStatus: 'excellent' },
      engine: { qty: '1', connectedEngines: '', serialNumber: '' },
      solar: { qty: '1', installationLocation: '', serialNumber: '', powerStatus: 'fully_charged' },
      remarks: '',
      signoff: { technicianName: '', technicianDesignation: '', signoffDate: '', receiverName: '', receiverDesignation: '' },
    },
  });

  useEffect(() => {
    setValue('vesselInfo.installationDate', format(new Date(), 'MMMM d, yyyy'));
    setValue('signoff.signoffDate', format(new Date(), 'MMMM d, yyyy'));
  }, [setValue]);

  const watchedCopyTypes = watch('copyTypes');
  const capQtyWatch = watch('flsCapacitance.qty');
  const floaterQtyWatch = watch('flsFloater.qty');
  const networkQtyWatch = watch('network.qty');
  const engineQtyWatch = watch('engine.qty');
  const solarQtyWatch = watch('solar.qty');

  const capQty = Math.min(100, Math.max(1, parseInt(capQtyWatch || '0', 10) || 1));
  const floaterQty = Math.min(100, Math.max(1, parseInt(floaterQtyWatch || '0', 10) || 1));
  const networkQty = Math.min(100, Math.max(1, parseInt(networkQtyWatch || '0', 10) || 1));
  const engineQty = Math.min(100, Math.max(1, parseInt(engineQtyWatch || '0', 10) || 1));
  const solarQty = Math.min(100, Math.max(1, parseInt(solarQtyWatch || '0', 10) || 1));

  const [capSns, setCapSns] = useState<string[]>(['']);
  const [floaterSns, setFloaterSns] = useState<string[]>(['']);
  const [networkSns, setNetworkSns] = useState<string[]>(['']);
  const [engineSns, setEngineSns] = useState<string[]>(['']);
  const [solarSns, setSolarSns] = useState<string[]>(['']);
  const [capTanks, setCapTanks] = useState<string[]>(['']);
  const [floaterTanks, setFloaterTanks] = useState<string[]>(['']);
  const [engineAssets, setEngineAssets] = useState<string[]>(['']);
  const [solarLocations, setSolarLocations] = useState<string[]>(['']);

  useEffect(() => { setCapSns(p => { const n = [...p]; while (n.length < capQty) n.push(''); setValue('flsCapacitance.serialNumber', n.slice(0, capQty).join(', ')); return n; }); }, [capQty, setValue]);
  useEffect(() => { setCapTanks(p => { const n = [...p]; while (n.length < capQty) n.push(''); setValue('flsCapacitance.tankAssigned', n.slice(0, capQty).join(', ')); return n; }); }, [capQty, setValue]);
  useEffect(() => { const t = floaterQty * 2; setFloaterSns(p => { const n = [...p]; while (n.length < t) n.push(''); setValue('flsFloater.serialNumber', n.slice(0, t).join(', ')); return n; }); }, [floaterQty, setValue]);
  useEffect(() => { setFloaterTanks(p => { const n = [...p]; while (n.length < floaterQty) n.push(''); setValue('flsFloater.tankAssigned', n.slice(0, floaterQty).join(', ')); return n; }); }, [floaterQty, setValue]);
  useEffect(() => { setNetworkSns(p => { const n = [...p]; while (n.length < networkQty) n.push(''); setValue('network.serialNumber', n.slice(0, networkQty).join(', ')); return n; }); }, [networkQty, setValue]);
  useEffect(() => { setEngineSns(p => { const n = [...p]; while (n.length < engineQty) n.push(''); setValue('engine.serialNumber', n.slice(0, engineQty).join(', ')); return n; }); }, [engineQty, setValue]);
  useEffect(() => { setEngineAssets(p => { const n = [...p]; while (n.length < engineQty) n.push(''); setValue('engine.connectedEngines', n.slice(0, engineQty).join(', ')); return n; }); }, [engineQty, setValue]);
  useEffect(() => { setSolarSns(p => { const n = [...p]; while (n.length < solarQty) n.push(''); setValue('solar.serialNumber', n.slice(0, solarQty).join(', ')); return n; }); }, [solarQty, setValue]);
  useEffect(() => { setSolarLocations(p => { const n = [...p]; while (n.length < solarQty) n.push(''); setValue('solar.installationLocation', n.slice(0, solarQty).join(', ')); return n; }); }, [solarQty, setValue]);

  const handleSnsChange = (index: number, val: string, sns: string[], setSns: React.Dispatch<React.SetStateAction<string[]>>, formKey: any) => {
    const next = [...sns]; next[index] = val; setSns(next);
    setValue(formKey, next.filter(Boolean).join(', '), { shouldValidate: true });
  };

  const handleArrayChange = (index: number, val: string, arr: string[], setArr: React.Dispatch<React.SetStateAction<string[]>>, formKey: any) => {
    const next = [...arr]; next[index] = val; setArr(next);
    setValue(formKey, next.filter(Boolean).join(', '), { shouldValidate: true });
  };

  const handleEquipmentScan = (serial: string, floaterType?: FloaterType): boolean => {
    const classified = classifyEquipmentSerial(serial);
    if (!classified) {
      toast.error(ui('Unknown device code. Expected SP1, S2, NR, SD, or Z.', '未知设备代码。应为 SP1、S2、NR、SD 或 Z。'));
      return false;
    }

    const normalized = classified.serial.toLowerCase();
    const currentSerials = [...capSns, ...floaterSns, ...networkSns, ...engineSns, ...solarSns];
    if (currentSerials.some(value => value.trim().toLowerCase() === normalized)) {
      toast.error(ui(`Serial number "${classified.serial}" is already in this form.`, `序列号“${classified.serial}”已存在于此表格中。`));
      return false;
    }

    for (const report of savedReports) {
      if (report.id === selectedReportId) continue;
      const existing = getAllSerialNumbers(report.data).find(item => item.sn.trim().toLowerCase() === normalized);
      if (existing) {
        toast.error(ui(`Serial number "${classified.serial}" is already assigned to vessel "${report.vesselName}".`, `序列号“${classified.serial}”已分配给船舶“${report.vesselName}”。`));
        return false;
      }
    }

    const addStandardSerial = (
      values: string[],
      setValues: React.Dispatch<React.SetStateAction<string[]>>,
      visibleCount: number,
      formKey: 'flsCapacitance.serialNumber' | 'network.serialNumber' | 'engine.serialNumber' | 'solar.serialNumber',
      quantityKey: 'flsCapacitance.qty' | 'network.qty' | 'engine.qty' | 'solar.qty',
    ) => {
      const destination = nextEmptyIndex(values, visibleCount);
      const next = [...values];
      while (next.length <= destination.index) next.push('');
      next[destination.index] = classified.serial;
      setValues(next);
      if (destination.expand) setValue(quantityKey, String(visibleCount + 1), { shouldValidate: true });
      setValue(formKey, next.filter(Boolean).join(', '), { shouldValidate: true });
    };

    if (classified.category === 'capacitance') {
      addStandardSerial(capSns, setCapSns, capQty, 'flsCapacitance.serialNumber', 'flsCapacitance.qty');
    } else if (classified.category === 'floater') {
      if (!floaterType) {
        toast.error(ui('Choose AM or AR for this floater.', '请为此浮子选择 AM 或 AR。'));
        return false;
      }
      const destination = nextFloaterIndex(floaterSns, floaterQty, floaterType);
      const next = [...floaterSns];
      while (next.length <= destination.index) next.push('');
      next[destination.index] = classified.serial;
      setFloaterSns(next);
      if (destination.expand) setValue('flsFloater.qty', String(floaterQty + 1), { shouldValidate: true });
      setValue('flsFloater.serialNumber', next.filter(Boolean).join(', '), { shouldValidate: true });
    } else if (classified.category === 'network') {
      addStandardSerial(networkSns, setNetworkSns, networkQty, 'network.serialNumber', 'network.qty');
    } else if (classified.category === 'engine') {
      addStandardSerial(engineSns, setEngineSns, engineQty, 'engine.serialNumber', 'engine.qty');
    } else {
      addStandardSerial(solarSns, setSolarSns, solarQty, 'solar.serialNumber', 'solar.qty');
    }

    toast.success(ui(`${classified.serial} added`, `${classified.serial} 已添加`), {
      description: classified.category === 'floater' ? `${classified.label} (${floaterType})` : classified.label,
    });
    const sectionId = classified.category === 'capacitance' || classified.category === 'floater' ? 'fls' : classified.category;
    window.setTimeout(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    return true;
  };

  const validateOddEvenSns = (values: any): boolean => {
    return true;
  };

  const checkDuplicateSns = (values: any, excludeDocId?: string): boolean => {
    if (!validateOddEvenSns(values)) return false;
    const sns = getAllSerialNumbers(values);
    const snValues = sns.map(i => i.sn.toLowerCase());
    const formDuplicates = snValues.filter((item, idx) => snValues.indexOf(item) !== idx);
    if (formDuplicates.length > 0) {
      toast.error(ui(`Duplicate Serial Numbers detected in form: ${[...new Set(formDuplicates)].join(', ')}`, `表格中检测到重复序列号：${[...new Set(formDuplicates)].join(', ')}`));
      return false;
    }
    for (const report of savedReports) {
      if (excludeDocId && report.id === excludeDocId) continue;
      const otherSns = getAllSerialNumbers(report.data);
      for (const item of sns) {
        const matching = otherSns.find(o => o.sn.toLowerCase() === item.sn.toLowerCase());
        if (matching) { toast.error(ui(`Serial Number "${item.sn}" (${item.source}) is already registered to vessel "${report.vesselName}"`, `序列号“${item.sn}”（${item.source}）已登记到船舶“${report.vesselName}”`)); return false; }
      }
    }
    return true;
  };

  const handleClear = () => {
    setSelectedReportId('');
    reset({
      copyTypes: ['aimf', 'vessel', 'vessel_owner', 'likas'],
      vesselInfo: { vesselName: '', installationDate: '', leadEngineer: '' },
      flsCapacitance: { qty: '1', tankAssigned: '', serialNumber: '', calibrationStatus: 'good' },
      flsFloater: { qty: '1', tankAssigned: '', serialNumber: '', calibrationStatus: 'good' },
      network: { qty: '1', serialNumber: '', signalStatus: 'excellent' },
      engine: { qty: '1', connectedEngines: '', serialNumber: '' },
      solar: { qty: '1', installationLocation: '', serialNumber: '', powerStatus: 'fully_charged' },
      remarks: '',
      signoff: { technicianName: '', technicianDesignation: '', signoffDate: '', receiverName: '', receiverDesignation: '' },
    });
    setCapSns(['']); setFloaterSns(['']); setNetworkSns(['']); setEngineSns(['']); setSolarSns(['']);
    setCapTanks(['']); setFloaterTanks(['']); setEngineAssets(['']); setSolarLocations(['']);
    setValue('vesselInfo.installationDate', format(new Date(), 'MMMM d, yyyy'));
    setValue('signoff.signoffDate', format(new Date(), 'MMMM d, yyyy'));
    toast.success(ui('Form cleared!', '表格已清空！'));
  };

  const toggleCopyType = (ct: CopyType) => {
    const current = watchedCopyTypes ?? [];
    setValue('copyTypes', current.includes(ct) ? current.filter(c => c !== ct) : [...current, ct], { shouldValidate: true });
  };

  const confirmEquipmentChange = (
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    actionLabel: string,
  ) => {
    const changes = diffEquipmentReports(before, after);
    const summary = equipmentChangeSummaryForLanguage(language, changes);
    if (!window.confirm(`${actionLabel}

${ui('Detected equipment / Inventory impact:', '检测到的设备 / 库存影响：')}
${summary}

${ui('Continue and provide a reason?', '是否继续并填写变更原因？')}`)) return null;
    const reason = window.prompt(ui('Reason for this change (required for the audit trail):', '本次变更原因（审计记录必填）：'), actionLabel);
    if (!reason?.trim() || reason.trim().length < 3) {
      toast.error(ui('A reason of at least 3 characters is required.', '变更原因至少需要 3 个字符。'));
      return null;
    }
    const hasRemovedEquipment = changes.some((change) => change.removed.length > 0);
    let disposition = 'returned-working';
    if (hasRemovedEquipment) {
      const answer = window.prompt(
        ui(
          'Disposition for removed equipment: returned-working, returned-defective, lost, replacement, or correction',
          '已移除设备的处置方式（请输入以下英文选项之一）：returned-working、returned-defective、lost、replacement 或 correction',
        ),
        'returned-working',
      );
      const allowed = ['returned-working', 'returned-defective', 'lost', 'replacement', 'correction'];
      if (!answer || !allowed.includes(answer.trim().toLowerCase())) {
        toast.error(ui('Choose a valid disposition for the removed equipment.', '请为已移除的设备输入有效的处置方式。'));
        return null;
      }
      disposition = answer.trim().toLowerCase();
    }
    return { reason: reason.trim(), disposition, changes };
  };

  const submitEquipmentChange = async (payload: Record<string, unknown>) => {
    const response = await authenticatedFetch('/api/equipment-report-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let result: { error?: string; reportId?: string } = {};
    if (text) {
      try { result = JSON.parse(text) as typeof result; }
      catch { throw new Error(response.ok ? ui('The server returned an invalid response.', '服务器返回了无效响应。') : text); }
    }
    if (!response.ok) throw new Error(result.error ?? ui('Unable to save the equipment change.', '无法保存设备变更。'));
    return result;
  };

  const handleSaveNewReport = async () => {
    const values = watch();
    if (!values.vesselInfo?.vesselName) { toast.error(ui('Vessel Name / IMO No. is required to save a report', '保存报告前必须填写船名 / IMO 编号')); return; }
    if (!checkDuplicateSns(values)) return;
    const confirmation = confirmEquipmentChange(null, values as unknown as Record<string, unknown>, ui('Initial equipment deployment', '首次设备部署'));
    if (!confirmation) return;
    setSaving(true);
    try {
      const docId = values.vesselInfo.vesselName.trim().replace(/[\/\\?%*:|"<>]/g, '-');
      await submitEquipmentChange({ action: 'create', reportId: docId, report: values, ...confirmation });
      setSelectedReportId(docId);
      toast.success(ui('Report saved and Inventory deployment ledger updated.', '报告已保存，库存部署台账已更新。'));
    } catch (e: unknown) {
      toast.error(ui('Failed to save report', '报告保存失败'), { description: e instanceof Error ? e.message : ui('Unknown error', '未知错误') });
    } finally { setSaving(false); }
  };

  const handleUpdateReport = async () => {
    if (!selectedReportId) { toast.error(ui('No vessel selected to update', '未选择要更新的船舶')); return; }
    const selected = savedReports.find((report) => report.id === selectedReportId);
    if (!selected) { toast.error(ui('The selected vessel report is no longer available.', '所选船舶报告已不可用。')); return; }
    const values = watch();
    if (!values.vesselInfo?.vesselName) { toast.error(ui('Vessel Name / IMO No. is required', '船名 / IMO 编号为必填项')); return; }
    if (!checkDuplicateSns(values, selectedReportId)) return;
    const confirmation = confirmEquipmentChange(selected.data, values as unknown as Record<string, unknown>, ui('Update vessel equipment', '更新船舶设备'));
    if (!confirmation) return;
    setSaving(true);
    try {
      await submitEquipmentChange({ action: 'update', reportId: selectedReportId, report: values, ...confirmation });
      toast.success(ui('Equipment changes confirmed, audited, and synchronized to Inventory.', '设备变更已确认、审计并同步到库存。'));
    } catch (e: unknown) {
      toast.error(ui('Failed to update report', '报告更新失败'), { description: e instanceof Error ? e.message : ui('Unknown error', '未知错误') });
    } finally { setSaving(false); }
  };

  const handleDeleteReport = async () => {
    if (!selectedReportId) return;
    const selected = savedReports.find((report) => report.id === selectedReportId);
    if (!selected) return;
    const confirmation = confirmEquipmentChange(selected.data, null, ui(`Archive ${selected.vesselName}`, `归档 ${selected.vesselName}`));
    if (!confirmation) return;
    setSaving(true);
    try {
      await submitEquipmentChange({ action: 'archive', reportId: selectedReportId, ...confirmation });
      toast.success(ui('Vessel archived. Its equipment was removed from active deployment and logged.', '船舶已归档；其设备已从当前部署中移除并记录。'));
      handleClear();
    } catch (e: unknown) {
      toast.error(ui('Failed to archive vessel', '船舶归档失败'), { description: e instanceof Error ? e.message : ui('Unknown error', '未知错误') });
    } finally { setSaving(false); }
  };

  const handleSelectReport = (reportId: string | null) => {
    if (!reportId) return;
    const report = savedReports.find(r => r.id === reportId);
    if (!report) return;
    setSelectedReportId(reportId);
    reset({
      ...report.data,
      copyTypes: ['aimf', 'vessel', 'vessel_owner', 'likas']
    });
    setCapSns(report.data.flsCapacitance?.serialNumber?.split(', ') || ['']);
    setCapTanks(report.data.flsCapacitance?.tankAssigned?.split(', ') || ['']);
    setFloaterSns(report.data.flsFloater?.serialNumber?.split(', ') || ['']);
    setFloaterTanks(report.data.flsFloater?.tankAssigned?.split(', ') || ['']);
    setNetworkSns(report.data.network?.serialNumber?.split(', ') || ['']);
    setEngineSns(report.data.engine?.serialNumber?.split(', ') || ['']);
    setEngineAssets(report.data.engine?.connectedEngines?.split(', ') || ['']);
    setSolarSns(report.data.solar?.serialNumber?.split(', ') || ['']);
    setSolarLocations(report.data.solar?.installationLocation?.split(', ') || ['']);
    toast.success(ui('Form filled with saved vessel info!', '已载入保存的船舶资料！'));
  };

  useEffect(() => {
    if (reportIdParam && savedReports.length > 0) {
      handleSelectReport(reportIdParam);
    }
  }, [reportIdParam, savedReports]);


  const onSubmit = async (rawValues: AccountabilityFormValues) => {
    const values = rawValues as any;
    if (!checkDuplicateSns(values, selectedReportId)) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('vesselName', values.vesselInfo.vesselName);
      fd.append('installationDate', values.vesselInfo.installationDate);
      fd.append('leadEngineer', values.vesselInfo.leadEngineer);
      fd.append('flsCapacitanceQty', capSns.some(s => s.trim() !== '') ? values.flsCapacitance.qty : '0');
      fd.append('flsCapacitanceTank', values.flsCapacitance.tankAssigned);
      fd.append('flsCapacitanceSN', values.flsCapacitance.serialNumber);
      fd.append('flsCapacitanceStatus', values.flsCapacitance.calibrationStatus);
      fd.append('flsFloaterQty', floaterSns.some(s => s.trim() !== '') ? String(floaterQty * 2) : '0');
      fd.append('flsFloaterTank', values.flsFloater.tankAssigned);
      fd.append('flsFloaterSN', values.flsFloater.serialNumber);
      fd.append('flsFloaterStatus', values.flsFloater.calibrationStatus);
      fd.append('networkQty', networkSns.some(s => s.trim() !== '') ? values.network.qty : '0');
      fd.append('networkSN', values.network.serialNumber);
      fd.append('networkSignalStatus', values.network.signalStatus);
      fd.append('engineQty', engineSns.some(s => s.trim() !== '') ? values.engine.qty : '0');
      fd.append('engineConnected', values.engine.connectedEngines);
      fd.append('engineSN', values.engine.serialNumber);
      fd.append('solarQty', solarSns.some(s => s.trim() !== '') ? values.solar.qty : '0');
      fd.append('solarLocation', values.solar.installationLocation);
      fd.append('solarSN', values.solar.serialNumber);
      fd.append('solarPowerStatus', values.solar.powerStatus);
      fd.append('remarks', values.remarks?.trim() || 'Installation done properly');
      fd.append('copyTypes', JSON.stringify(values.copyTypes));
      const res = await authenticatedFetch('/api/generate-docx', { method: 'POST', body: fd });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? ui('Generation failed', '生成失败')); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(values.vesselInfo?.vesselName || 'Equipment-Accountability-Report').trim().replace(/[\/\\?%*:|"<>]/g, '-')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(ui('Report Generated!', '报告已生成！'), { description: language === 'zh' ? `已将 ${values.copyTypes.length} 个 DOCX 副本打包为 ZIP 文件下载。` : `${values.copyTypes.length} DOCX ${values.copyTypes.length === 1 ? 'copy' : 'copies'} downloaded as a ZIP file.` });
    } catch (e: unknown) {
      toast.error(ui('Generation Failed', '生成失败'), { description: e instanceof Error ? e.message : ui('Unknown error', '未知错误') });
    } finally { setLoading(false); }
  };

  const inputCls = 'bg-muted/50 border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all';

  if (!hasAccess) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 mb-2 animate-pulse">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-foreground">{copy.accessDenied}</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          {copy.accessDeniedDescription}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" lang={language === 'zh' ? 'zh-CN' : 'en'}>
      {/* Hero */}
      <div className="max-w-5xl mx-auto px-4 pt-6 pb-6 text-center space-y-4 animate-fadeIn">
        <div className="flex justify-end">
          <label htmlFor="equipment-language" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span>{copy.language}</span>
            <select
              id="equipment-language"
              aria-label={copy.languageSelectorLabel}
              value={language}
              onChange={(event) => handleLanguageChange(event.target.value as EquipmentLanguage)}
              className="h-10 min-w-32 rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="en">{copy.english}</option>
              <option value="zh">{copy.chinese}</option>
            </select>
          </label>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {copy.heroKicker}
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-foreground">
          {copy.heroTitle}
        </h1>
        <p className="text-muted-foreground text-base max-w-2xl mx-auto">
          {copy.heroDescription}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="max-w-5xl mx-auto px-4 pb-24 space-y-6">

        <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-sm">{copy.scanHeading}</p>
            <p className="text-xs text-muted-foreground mt-1">{copy.scanDescription}</p>
          </div>
          <EquipmentCodeScanner disabled={loading || saving} onScan={handleEquipmentScan} language={language} />
        </div>

        {/* Controls */}
        <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg space-y-5">
          {/* Vessel Selector */}
          <div className="space-y-1.5 w-full relative" ref={dropdownRef}>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{copy.selectSavedVessel}</Label>
            <div className="flex flex-col md:flex-row gap-3 w-full items-start md:items-center">
              <div className="relative flex-1 min-w-[260px] max-w-md w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white" />
                <input
                  type="text"
                  placeholder={savedReports.length > 0 ? copy.searchVessel : copy.noSavedVessels}
                  value={vesselSearchQuery}
                  onFocus={() => setIsOpen(true)}
                  onChange={(e) => { setVesselSearchQuery(e.target.value); setIsOpen(true); }}
                  className={cn('h-10 w-full rounded-lg border pl-9 pr-10 py-2 text-sm bg-[hsl(var(--muted))] border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all outline-none text-white')}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  {vesselSearchQuery && (
                    <button type="button" onClick={() => { setVesselSearchQuery(''); setSelectedReportId(''); setIsOpen(true); }} className="p-0.5 hover:bg-muted rounded text-white hover:text-white/80 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                  <button type="button" onClick={() => setIsOpen(!isOpen)} className="p-0.5 hover:bg-muted rounded text-white hover:text-white/80 transition-colors">
                    <svg className={cn('w-4 h-4 transition-transform duration-200', isOpen && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                </div>
                {isOpen && (
                  <div className="absolute z-50 w-full mt-1.5 bg-[hsl(var(--muted))] border border-border/80 rounded-xl shadow-xl max-h-60 overflow-y-auto backdrop-blur-xl animate-fadeInUp">
                    {filteredReports.length > 0 ? filteredReports.map(report => (
                      <button key={report.id} type="button"
                        onClick={() => { handleSelectReport(report.id); setVesselSearchQuery(report.vesselName); setIsOpen(false); }}
                        className={cn('w-full text-left px-4 py-2 text-sm transition-all flex flex-col gap-0.5 text-white hover:bg-secondary border-l-2 border-transparent hover:border-primary', selectedReportId === report.id ? 'bg-primary/20 border-l-2 border-primary text-primary' : '')}>
                        <span className="font-medium">{report.vesselName}</span>
                        {report.installationDate && <span className="text-xs text-muted-foreground">{report.installationDate}</span>}
                      </button>
                    )) : <div className="px-4 py-3 text-sm text-muted-foreground text-center">{copy.noVesselsFound}</div>}
                  </div>
                )}
              </div>
              {selectedReportId && (
                <div className="flex gap-2 animate-fadeInUp w-full md:w-auto">
                  <Button type="button" variant="outline" onClick={handleUpdateReport} disabled={saving || loading} className="h-10 px-4 text-xs font-semibold rounded-lg bg-blue-600 border-blue-700 text-white hover:bg-blue-500 flex-1 md:flex-none">{copy.updateSelected}</Button>
                  <Button type="button" variant="outline" onClick={handleDeleteReport} disabled={saving || loading} className="h-10 px-4 text-xs font-semibold rounded-lg bg-red-700 border-red-800 text-white hover:bg-red-600 flex-1 md:flex-none">{copy.archiveVessel}</Button>
                </div>
              )}
            </div>
          </div>
          <hr className="border-border/40" />
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 w-full">
            <Button type="button" variant="outline" onClick={handleClear} disabled={loading || saving} className="h-10 px-4 text-xs font-semibold rounded-lg bg-slate-600 border-slate-700 text-white hover:bg-slate-500 w-full sm:w-auto">{copy.clearForm}</Button>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {!selectedReportId && (
                <Button type="button" variant="outline" onClick={handleSaveNewReport} disabled={loading || saving} className="h-10 px-4 text-xs font-semibold rounded-lg bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-500 w-full sm:w-auto flex items-center justify-center">
                  {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />{copy.saving}</> : <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />{copy.saveAsNew}</>}
                </Button>
              )}
              <Button type="button" onClick={handleDownloadPDF} className="h-10 px-4 text-xs font-semibold rounded-lg flex items-center justify-center bg-blue-600 border border-blue-700 text-white hover:bg-blue-500 w-full sm:w-auto">
                <Download className="w-3.5 h-3.5 mr-1.5" /> {copy.downloadPdf}
              </Button>
              <Button type="button" onClick={handlePrintPreview} className="h-10 px-4 text-xs font-semibold rounded-lg flex items-center justify-center border border-border bg-transparent text-foreground hover:bg-muted w-full sm:w-auto">
                <Printer className="w-3.5 h-3.5 mr-1.5" /> {copy.printPreview}
              </Button>
              <Button type="submit" disabled={loading || saving} className="h-10 px-5 text-xs font-semibold rounded-lg flex items-center justify-center bg-blue-600 border-blue-700 text-white hover:bg-blue-500 w-full sm:w-auto">
                {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />{copy.generating}</> : <><Download className="w-3.5 h-3.5 mr-1.5" />{copy.generateDownload}</>}
              </Button>
            </div>
          </div>
          
          {/* Copy Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{copy.selectCopies}</Label>
              {errors.copyTypes && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {equipmentValidationMessage(language, errors.copyTypes.message)}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {copyOptions.map(opt => {
                const selected = (watchedCopyTypes ?? []).includes(opt.value);
                return (
                  <button key={opt.value} type="button" onClick={() => toggleCopyType(opt.value)}
                    className={cn('flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-all text-xs font-medium', selected ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-muted/20 text-muted-foreground hover:border-primary/40 hover:bg-muted/40')}>
                    <span className="flex items-center gap-2">
                      <span className={cn('w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors', selected ? 'border-primary bg-primary' : 'border-muted-foreground')}>
                        {selected && <CheckCircle2 className="w-2.5 h-2.5 text-primary-foreground" />}
                      </span>
                      {opt.label}
                    </span>
                    <span className="text-[10px] opacity-65 truncate max-w-[120px]">{opt.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Vessel Info */}
        <SectionCard id="vessel" icon={Ship} title={copy.vesselInformation}>
          <div className="grid md:grid-cols-2 gap-5">
            <Field label={copy.vesselName} error={!!errors.vesselInfo?.vesselName}>
              <Input {...register('vesselInfo.vesselName')} placeholder={copy.vesselNamePlaceholder} className={inputCls} />
              <FieldError language={language} name="vesselInfo.vesselName" errors={errors} />
            </Field>
            <Field label={copy.installationDate} error={!!errors.vesselInfo?.installationDate}>
              <Input {...register('vesselInfo.installationDate')} placeholder={copy.installationDatePlaceholder} className={inputCls} />
              <FieldError language={language} name="vesselInfo.installationDate" errors={errors} />
            </Field>
            <div className="md:col-span-2">
              <Field label={copy.leadEngineer} error={!!errors.vesselInfo?.leadEngineer}>
                <Input {...register('vesselInfo.leadEngineer')} placeholder={copy.leadEngineerPlaceholder} className={inputCls} />
                <FieldError language={language} name="vesselInfo.leadEngineer" errors={errors} />
              </Field>
            </div>
          </div>
        </SectionCard>

        {/* FLS */}
        <SectionCard id="fls" icon={Zap} title={copy.fuelLevelSensors} badge={ui('Section 1', '第 1 节')}>
          <div>
            <p className="text-sm font-semibold text-primary mb-3 flex items-center gap-2"><ChevronRight className="w-4 h-4" />{copy.capacitanceSensor}</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label={copy.quantity} error={!!errors.flsCapacitance?.qty}>
                <QuantitySelector value={watch('flsCapacitance.qty') || '1'} onChange={val => setValue('flsCapacitance.qty', val, { shouldValidate: true })} />
                <FieldError language={language} name="flsCapacitance.qty" errors={errors} />
              </Field>
              <div className="space-y-1.5 md:col-span-1">
                <Label className={cn('text-sm font-medium', errors.flsCapacitance?.tankAssigned && 'text-destructive')}>{copy.tanksAssigned} ({capQty})</Label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {capTanks.slice(0, capQty).map((tank, idx) => (
                    <Input key={idx} value={tank} onChange={e => handleArrayChange(idx, e.target.value, capTanks, setCapTanks, 'flsCapacitance.tankAssigned')} placeholder={`${copy.tankAssigned} #${idx + 1}`} className={inputCls} />
                  ))}
                </div>
                <FieldError language={language} name="flsCapacitance.tankAssigned" errors={errors} />
              </div>
              <div className="space-y-1.5 md:col-span-1">
                <Label className={cn('text-sm font-medium', errors.flsCapacitance?.serialNumber && 'text-destructive')}>{copy.serialNumbers} ({capQty})</Label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {capSns.slice(0, capQty).map((sn, idx) => (
                    <Input key={idx} value={sn} onChange={e => handleSnsChange(idx, e.target.value, capSns, setCapSns, 'flsCapacitance.serialNumber')} placeholder={`S/N #${idx + 1}`} className={inputCls} />
                  ))}
                </div>
                <FieldError language={language} name="flsCapacitance.serialNumber" errors={errors} />
              </div>
              <Field label={copy.calibrationStatus}>
                <select {...register('flsCapacitance.calibrationStatus')} className={cn('w-full rounded-lg border px-3 py-2 text-sm', inputCls)}>
                  <option value="good">{copy.goodWorkingCondition}</option>
                  <option value="defective">{copy.defective}</option>
                </select>
              </Field>
            </div>
          </div>
          <div className="border-t border-border pt-5">
            <p className="text-sm font-semibold text-primary mb-3 flex items-center gap-2"><ChevronRight className="w-4 h-4" />{copy.floaterSensor}</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label={copy.quantity} error={!!errors.flsFloater?.qty}>
                <QuantitySelector value={watch('flsFloater.qty') || '1'} onChange={val => setValue('flsFloater.qty', val, { shouldValidate: true })} />
                <FieldError language={language} name="flsFloater.qty" errors={errors} />
              </Field>
              <Field label={copy.calibrationStatus}>
                <select {...register('flsFloater.calibrationStatus')} className={cn('w-full rounded-lg border px-3 py-2 text-sm', inputCls)}>
                  <option value="good">{copy.goodWorkingCondition}</option>
                  <option value="defective">{copy.defective}</option>
                </select>
              </Field>
              <div className="md:col-span-2 lg:col-span-4 space-y-4">
                <Label className="text-sm font-semibold text-muted-foreground">{copy.tanksDevices}</Label>
                <div className="grid md:grid-cols-2 gap-4">
                  {Array.from({ length: floaterQty }).map((_, tankIdx) => (
                    <div key={tankIdx} className="grid grid-cols-2 gap-4 p-4 border border-border/60 bg-muted/10 rounded-xl">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">{copy.tankAssigned} #{tankIdx + 1}</Label>
                        <Input value={floaterTanks[tankIdx] || ''} onChange={e => handleArrayChange(tankIdx, e.target.value, floaterTanks, setFloaterTanks, 'flsFloater.tankAssigned')} placeholder={copy.tankAssignedPlaceholder} className={inputCls} />
                        <FieldError language={language} name="flsFloater.tankAssigned" errors={errors} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold block text-muted-foreground mb-1">{copy.floaterSerialNumbers}</Label>
                        <div className="space-y-2">
                          <div className="space-y-0.5">
                            <span className="text-[10px] text-primary font-medium block">SP2.0AR(M) S/N</span>
                            <Input value={floaterSns[tankIdx * 2] || ''} onChange={e => handleSnsChange(tankIdx * 2, e.target.value, floaterSns, setFloaterSns, 'flsFloater.serialNumber')} placeholder="e.g. SN1001" className={inputCls} />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[10px] text-primary font-medium block">SP2.0AR S/N</span>
                            <Input value={floaterSns[tankIdx * 2 + 1] || ''} onChange={e => handleSnsChange(tankIdx * 2 + 1, e.target.value, floaterSns, setFloaterSns, 'flsFloater.serialNumber')} placeholder="e.g. SN1002" className={inputCls} />
                          </div>
                        </div>
                        <FieldError language={language} name="flsFloater.serialNumber" errors={errors} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Network */}
        <SectionCard id="network" icon={Wifi} title={copy.networkTitle} badge={ui('Section 2', '第 2 节')}>
          <p className="text-sm text-muted-foreground -mt-1">{copy.device}: <span className="text-foreground font-medium">{copy.wirelessNetwork}</span></p>
          <div className="grid md:grid-cols-3 gap-4">
            <Field label={copy.quantity} error={!!errors.network?.qty}>
              <QuantitySelector value={watch('network.qty') || '1'} onChange={val => setValue('network.qty', val, { shouldValidate: true })} />
              <FieldError language={language} name="network.qty" errors={errors} />
            </Field>
            <div className="space-y-1.5 md:col-span-1">
              <Label className={cn('text-sm font-medium', errors.network?.serialNumber && 'text-destructive')}>{copy.serialNumbers} ({networkQty})</Label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {networkSns.slice(0, networkQty).map((sn, idx) => (
                  <Input key={idx} value={sn} onChange={e => handleSnsChange(idx, e.target.value, networkSns, setNetworkSns, 'network.serialNumber')} placeholder={`S/N #${idx + 1}`} className={inputCls} />
                ))}
              </div>
              <FieldError language={language} name="network.serialNumber" errors={errors} />
            </div>
            <Field label={copy.signalStrength}>
              <select {...register('network.signalStatus')} className={cn('w-full rounded-lg border px-3 py-2 text-sm', inputCls)}>
                <option value="excellent">{copy.excellent}</option>
                <option value="good">{copy.good}</option>
                <option value="poor">{copy.poor}</option>
              </select>
            </Field>
          </div>
        </SectionCard>

        {/* Engine */}
        <SectionCard id="engine" icon={FileText} title={copy.engineTitle} badge={ui('Section 3', '第 3 节')}>
          <p className="text-sm text-muted-foreground -mt-1">{copy.device}: <span className="text-foreground font-medium">{copy.workingHoursDevice}</span></p>
          <div className="grid md:grid-cols-3 gap-4">
            <Field label={copy.quantity} error={!!errors.engine?.qty}>
              <QuantitySelector value={watch('engine.qty') || '1'} onChange={val => setValue('engine.qty', val, { shouldValidate: true })} />
              <FieldError language={language} name="engine.qty" errors={errors} />
            </Field>
            <div className="space-y-1.5 md:col-span-1">
              <Label className={cn('text-sm font-medium', errors.engine?.serialNumber && 'text-destructive')}>{copy.serialNumbers} ({engineQty})</Label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {engineSns.slice(0, engineQty).map((sn, idx) => (
                  <Input key={idx} value={sn} onChange={e => handleSnsChange(idx, e.target.value, engineSns, setEngineSns, 'engine.serialNumber')} placeholder={`S/N #${idx + 1}`} className={inputCls} />
                ))}
              </div>
              <FieldError language={language} name="engine.serialNumber" errors={errors} />
            </div>
            <div className="space-y-1.5 md:col-span-1">
              <Label className={cn('text-sm font-medium', errors.engine?.connectedEngines && 'text-destructive')}>{copy.connectedEngines} ({engineQty})</Label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {engineAssets.slice(0, engineQty).map((asset, idx) => (
                  <Input key={idx} value={asset} onChange={e => handleArrayChange(idx, e.target.value, engineAssets, setEngineAssets, 'engine.connectedEngines')} placeholder={`${copy.connectedEngine} #${idx + 1}`} className={inputCls} />
                ))}
              </div>
              <FieldError language={language} name="engine.connectedEngines" errors={errors} />
            </div>
          </div>
        </SectionCard>

        {/* Solar */}
        <SectionCard id="solar" icon={Sun} title={copy.solarTitle} badge={ui('Section 4', '第 4 节')}>
          <p className="text-sm text-muted-foreground -mt-1">{copy.device}: <span className="text-foreground font-medium">{copy.solarDevice}</span></p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label={copy.quantity} error={!!errors.solar?.qty}>
              <QuantitySelector value={watch('solar.qty') || '1'} onChange={val => setValue('solar.qty', val, { shouldValidate: true })} />
              <FieldError language={language} name="solar.qty" errors={errors} />
            </Field>
            <div className="space-y-1.5 md:col-span-1">
              <Label className={cn('text-sm font-medium', errors.solar?.installationLocation && 'text-destructive')}>{copy.installationLocations} ({solarQty})</Label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {solarLocations.slice(0, solarQty).map((loc, idx) => (
                  <Input key={idx} value={loc} onChange={e => handleArrayChange(idx, e.target.value, solarLocations, setSolarLocations, 'solar.installationLocation')} placeholder={`${copy.location} #${idx + 1}`} className={inputCls} />
                ))}
              </div>
              <FieldError language={language} name="solar.installationLocation" errors={errors} />
            </div>
            <div className="space-y-1.5 md:col-span-1">
              <Label className={cn('text-sm font-medium', errors.solar?.serialNumber && 'text-destructive')}>{copy.serialNumbers} ({solarQty})</Label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {solarSns.slice(0, solarQty).map((sn, idx) => (
                  <Input key={idx} value={sn} onChange={e => handleSnsChange(idx, e.target.value, solarSns, setSolarSns, 'solar.serialNumber')} placeholder={`S/N #${idx + 1}`} className={inputCls} />
                ))}
              </div>
              <FieldError language={language} name="solar.serialNumber" errors={errors} />
            </div>
            <Field label={copy.powerStatus}>
              <select {...register('solar.powerStatus')} className={cn('w-full rounded-lg border px-3 py-2 text-sm', inputCls)}>
                <option value="fully_charged">{copy.fullyCharged}</option>
                <option value="charging">{copy.charging}</option>
                <option value="operational">{copy.operationalOption}</option>
              </select>
            </Field>
          </div>
        </SectionCard>

        {/* Remarks */}
        <SectionCard id="remarks" icon={StickyNote} title={copy.remarksTitle}>
          <p className="text-sm text-muted-foreground -mt-1">{copy.remarksDescription}</p>
          <Textarea {...register('remarks')} placeholder={copy.remarksPlaceholder} rows={4} className={cn(inputCls, 'resize-none')} />
        </SectionCard>

        {/* Bottom Live Preview */}
        <div className="space-y-4 pt-8 border-t border-border/40">
          <div className="text-xs font-semibold text-muted-foreground tracking-wider uppercase text-center">
            {copy.previewLabel}
          </div>

          <div
            ref={previewRef}
            className="printable-report bg-white text-neutral-900 border border-neutral-200 rounded-xl p-8 shadow-2xl flex flex-col font-sans max-w-4xl mx-auto w-full text-xs"
          >
            {/* Header */}
            <div className="flex justify-between items-start border-b-2 border-neutral-200 pb-4 mb-6">
              <div>
                <h2 className="text-lg font-black uppercase text-neutral-800 tracking-tight">{copy.previewTitle}</h2>
                <p className="text-[10px] text-neutral-500 font-medium">{copy.previewSubtitle}</p>
              </div>
              <div className="text-right">
                <span className="text-[9px] uppercase font-bold text-neutral-400 block">{copy.activeCopies}</span>
                <div data-copy-badges className="flex gap-1 mt-1 justify-end">
                  {(watchedCopyTypes || []).map(ct => (
                    <span key={ct} className="bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded text-[8px] uppercase">{copy.copyOptions[ct].label}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Metadata Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-neutral-50 p-4 rounded-lg border border-neutral-100 mb-6 text-neutral-700">
              <div>
                <span className="text-[9px] uppercase font-bold text-neutral-400 block">{copy.vesselName}</span>
                <span className="font-bold text-neutral-800 text-sm">{watch('vesselInfo.vesselName') || '—'}</span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-neutral-400 block">{copy.installationDate}</span>
                <span className="font-semibold text-neutral-800">{watch('vesselInfo.installationDate') || '—'}</span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-neutral-400 block">{copy.leadEngineer}</span>
                <span className="font-semibold text-neutral-800">{watch('vesselInfo.leadEngineer') || '—'}</span>
              </div>
            </div>

            {/* Deployed Hardware List */}
            <div className="border border-neutral-200 rounded-lg overflow-hidden mb-6">
              <table className="w-full text-left border-collapse text-neutral-700">
                <thead>
                  <tr className="bg-neutral-100 border-b border-neutral-200 text-neutral-600 font-bold uppercase tracking-wider text-[9px]">
                    <th className="px-4 py-2">{copy.hardwareCategory}</th>
                    <th className="px-4 py-2 text-center w-20">{copy.quantity}</th>
                    <th className="px-4 py-2">{copy.tanksLocations}</th>
                    <th className="px-4 py-2">{copy.serialNumbers}</th>
                    <th className="px-4 py-2 w-32">{copy.statusCalibration}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-[11px]">
                  {/* Capacitance */}
                  <tr>
                    <td className="px-4 py-2 font-medium text-neutral-800">{ui('FLS Capacitance Fuel Sensor (VPS1.2)', 'FLS 电容式燃油传感器 (VPS1.2)')}</td>
                    <td className="px-4 py-2 text-center font-bold">{capSns.some(s => s.trim() !== '') ? capQty : 0}</td>
                    <td className="px-4 py-2 text-neutral-600">{watch('flsCapacitance.tankAssigned') || '—'}</td>
                    <td className="px-4 py-2 font-mono text-neutral-600">{watch('flsCapacitance.serialNumber') || '—'}</td>
                    <td className="px-4 py-2 text-neutral-600 uppercase font-semibold text-[10px]">{equipmentStatusLabel(language, watch('flsCapacitance.calibrationStatus'))}</td>
                  </tr>
                  {/* Floater */}
                  <tr>
                    <td className="px-4 py-2 font-medium text-neutral-800">{ui('FLS Floater Fuel Sensor (SP2.0AR)', 'FLS 浮子式燃油传感器 (SP2.0AR)')}</td>
                    <td className="px-4 py-2 text-center font-bold">{floaterSns.some(s => s.trim() !== '') ? floaterQty * 2 : 0}</td>
                    <td className="px-4 py-2 text-neutral-600">{watch('flsFloater.tankAssigned') || '—'}</td>
                    <td className="px-4 py-2 font-mono text-neutral-600">{watch('flsFloater.serialNumber') || '—'}</td>
                    <td className="px-4 py-2 text-neutral-600 uppercase font-semibold text-[10px]">{equipmentStatusLabel(language, watch('flsFloater.calibrationStatus'))}</td>
                  </tr>
                  {/* Network NR */}
                  <tr>
                    <td className="px-4 py-2 font-medium text-neutral-800">{copy.wirelessNetwork}</td>
                    <td className="px-4 py-2 text-center font-bold">{networkSns.some(s => s.trim() !== '') ? networkQty : 0}</td>
                    <td className="px-4 py-2 text-neutral-600">—</td>
                    <td className="px-4 py-2 font-mono text-neutral-600">{watch('network.serialNumber') || '—'}</td>
                    <td className="px-4 py-2 text-neutral-600 uppercase font-semibold text-[10px]">{copy.signal}: {equipmentStatusLabel(language, watch('network.signalStatus'))}</td>
                  </tr>
                  {/* Engine SD */}
                  <tr>
                    <td className="px-4 py-2 font-medium text-neutral-800">{copy.workingHoursDevice}</td>
                    <td className="px-4 py-2 text-center font-bold">{engineSns.some(s => s.trim() !== '') ? engineQty : 0}</td>
                    <td className="px-4 py-2 text-neutral-600">{watch('engine.connectedEngines') || '—'}</td>
                    <td className="px-4 py-2 font-mono text-neutral-600">{watch('engine.serialNumber') || '—'}</td>
                    <td className="px-4 py-2 text-neutral-600 uppercase font-semibold text-[10px]">{copy.operational}</td>
                  </tr>
                  {/* Solar panel */}
                  <tr>
                    <td className="px-4 py-2 font-medium text-neutral-800">{ui('Wireless Solar Panel with Power Storage', '带储能装置的无线太阳能板')}</td>
                    <td className="px-4 py-2 text-center font-bold">{solarSns.some(s => s.trim() !== '') ? solarQty : 0}</td>
                    <td className="px-4 py-2 text-neutral-600">{watch('solar.installationLocation') || '—'}</td>
                    <td className="px-4 py-2 font-mono text-neutral-600">{watch('solar.serialNumber') || '—'}</td>
                    <td className="px-4 py-2 text-neutral-600 uppercase font-semibold text-[10px]">{equipmentStatusLabel(language, watch('solar.powerStatus'))}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Remarks */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 mb-6">
              <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">{copy.remarksTitle.replace(/^5\.\s*/, '')}</h4>
              <p className="whitespace-pre-wrap text-xs text-neutral-800 leading-relaxed min-h-[3rem]">
                {watch('remarks') || copy.installationDone}
              </p>
            </div>

            {/* Sign-off / Signatures */}
            <div className="border-t border-neutral-100 pt-6">
              <div className="grid grid-cols-2 gap-16 text-center text-neutral-700">
                <div className="space-y-2">
                  <div className="border-b border-neutral-300 mx-auto w-48 h-8 font-serif text-sm italic flex items-end justify-center pb-1 text-neutral-800">{watch('vesselInfo.leadEngineer')}</div>
                  <div className="text-[9px] uppercase font-bold text-neutral-500">{copy.releasedBy}</div>
                </div>
                <div className="space-y-2">
                  <div className="border-b border-neutral-300 mx-auto w-48 h-8"></div>
                  <div className="text-[9px] uppercase font-bold text-neutral-500">{copy.receivedBy}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground/50">
        {copy.footer} · AIMF Tech. Corp. ©{new Date().getFullYear()}
      </footer>
    </div>
  );
}

export default function EquipmentAccountabilityPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    }>
      <EquipmentAccountabilityContent />
    </Suspense>
  );
}
