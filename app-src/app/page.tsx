'use client';
 
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import {
  FileText, Ship, Wifi, Zap, Sun, StickyNote, PenLine,
  Download, Loader2, CheckCircle2, ChevronRight, AlertCircle,
} from 'lucide-react';
 
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { PhotoUploader } from '@/components/form/PhotoUploader';
import { accountabilityFormSchema, AccountabilityFormValues } from '@/lib/validations/formSchema';
import { CopyType } from '@/types/form';
import { cn } from '@/lib/utils';
import { firestore, auth } from '@/lib/firebase/client';
import { collection, addDoc, onSnapshot, query, orderBy, Timestamp, doc, setDoc } from 'firebase/firestore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COPY_OPTIONS: { value: CopyType; label: string; desc: string }[] = [
  { value: 'aimf', label: 'AIMF Copy', desc: 'For AIMF Tech. Corp. records' },
  { value: 'vessel', label: 'Vessel Copy', desc: 'For the vessel\'s own files' },
  { value: 'vessel_owner', label: 'Vessel Owner Copy', desc: 'For the vessel owner' },
];

const SECTIONS = [
  { id: 'vessel', label: 'Vessel Info', icon: Ship },
  { id: 'fls', label: 'Fuel Level Sensors', icon: Zap },
  { id: 'network', label: 'Network & Telemetry', icon: Wifi },
  { id: 'engine', label: 'Engine Monitoring', icon: FileText },
  { id: 'solar', label: 'Solar Power', icon: Sun },
  { id: 'remarks', label: 'Remarks', icon: StickyNote },
];

const FieldError = ({ name, errors }: { name: string; errors: any }) => {
  const parts = name.split('.');
  let err: any = errors;
  for (const p of parts) err = err?.[p];
  if (!err?.message) return null;
  return (
    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
      <AlertCircle className="w-3 h-3" /> {err.message}
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
  value,
  onChange,
  min = 1,
  max = 100,
}: {
  value: string;
  onChange: (val: string) => void;
  min?: number;
  max?: number;
}) => {
  const num = parseInt(value || '1', 10) || 1;

  const handleDecrement = () => {
    if (num > min) {
      onChange(String(num - 1));
    }
  };

  const handleIncrement = () => {
    if (num < max) {
      onChange(String(num + 1));
    }
  };

  return (
    <div className="flex items-center gap-1.5 mt-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleDecrement}
        disabled={num <= min}
        className="w-9 h-9 rounded-xl border-border bg-muted/40 hover:bg-muted transition-all active:scale-95"
      >
        -
      </Button>
      <div className="w-12 h-9 flex items-center justify-center font-bold text-sm bg-muted/20 border border-border rounded-xl">
        {num}
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleIncrement}
        disabled={num >= max}
        className="w-9 h-9 rounded-xl border-border bg-muted/40 hover:bg-muted transition-all active:scale-95"
      >
        +
      </Button>
    </div>
  );
};

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [photoState, setPhotoState] = useState<{
    fls: File[]; network: File[]; engine: File[]; solar: File[];
  }>({ fls: [], network: [], engine: [], solar: [] });
  const [savedReports, setSavedReports] = useState<any[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>('');
  const formRef = useRef<HTMLFormElement>(null);

  // Subscribe to real-time reports from Firestore
  useEffect(() => {
    const q = query(collection(firestore, 'reports'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reports = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          vesselName: data.vesselInfo?.vesselName || 'Unnamed Vessel',
          installationDate: data.vesselInfo?.installationDate || '',
          data: data
        };
      });
      setSavedReports(reports);
    }, (error) => {
      console.error("Error listening to reports: ", error);
    });
    return () => unsubscribe();
  }, []);

  const handleLoadReport = (reportId: string) => {
    if (reportId === 'none') return;
    const reportObj = savedReports.find((r) => r.id === reportId);
    if (!reportObj) return;

    setSelectedReportId(reportId);
    const report = reportObj.data;
    if (!report) return;

    const parseList = (str: string, expectedLen: number) => {
      const arr = str ? str.split(',').map((s) => s.trim()) : [];
      while (arr.length < expectedLen) arr.push('');
      return arr;
    };

    const capQ = parseInt(report.flsCapacitance?.qty || '1', 10) || 1;
    const floaterQ = parseInt(report.flsFloater?.qty || '1', 10) || 1;
    const netQ = parseInt(report.network?.qty || '1', 10) || 1;
    const engQ = parseInt(report.engine?.qty || '1', 10) || 1;
    const solQ = parseInt(report.solar?.qty || '1', 10) || 1;

    setCapSns(parseList(report.flsCapacitance?.serialNumber || '', capQ));
    setCapTanks(parseList(report.flsCapacitance?.tankAssigned || '', capQ));
    
    setFloaterSns(parseList(report.flsFloater?.serialNumber || '', floaterQ * 2));
    setFloaterTanks(parseList(report.flsFloater?.tankAssigned || '', floaterQ));

    setNetworkSns(parseList(report.network?.serialNumber || '', netQ));
    
    setEngineSns(parseList(report.engine?.serialNumber || '', engQ));
    setEngineAssets(parseList(report.engine?.connectedEngines || '', engQ));

    setSolarSns(parseList(report.solar?.serialNumber || '', solQ));
    setSolarLocations(parseList(report.solar?.installationLocation || '', solQ));

    reset({
      copyTypes: report.copyTypes || ['aimf', 'vessel', 'vessel_owner'],
      vesselInfo: {
        vesselName: report.vesselInfo?.vesselName || '',
        installationDate: report.vesselInfo?.installationDate || '',
        leadEngineer: report.vesselInfo?.leadEngineer || '',
      },
      flsCapacitance: {
        qty: report.flsCapacitance?.qty || '1',
        tankAssigned: report.flsCapacitance?.tankAssigned || '',
        serialNumber: report.flsCapacitance?.serialNumber || '',
        calibrationStatus: report.flsCapacitance?.calibrationStatus || 'good',
      },
      flsFloater: {
        qty: report.flsFloater?.qty || '1',
        tankAssigned: report.flsFloater?.tankAssigned || '',
        serialNumber: report.flsFloater?.serialNumber || '',
        calibrationStatus: report.flsFloater?.calibrationStatus || 'good',
      },
      network: {
        qty: report.network?.qty || '1',
        serialNumber: report.network?.serialNumber || '',
        signalStatus: report.network?.signalStatus || 'excellent',
      },
      engine: {
        qty: report.engine?.qty || '1',
        connectedEngines: report.engine?.connectedEngines || '',
        serialNumber: report.engine?.serialNumber || '',
      },
      solar: {
        qty: report.solar?.qty || '1',
        installationLocation: report.solar?.installationLocation || '',
        serialNumber: report.solar?.serialNumber || '',
        powerStatus: report.solar?.powerStatus || 'fully_charged',
      },
      remarks: report.remarks || '',
      signoff: {
        technicianName: report.signoff?.technicianName || '',
        technicianDesignation: report.signoff?.technicianDesignation || '',
        signoffDate: report.signoff?.signoffDate || '',
        receiverName: report.signoff?.receiverName || '',
        receiverDesignation: report.signoff?.receiverDesignation || '',
      },
    });

    toast.success(`Loaded report for ${report.vesselInfo?.vesselName || 'vessel'}`);
  };

  const handleSaveReport = async () => {
    const values = watch();
    if (!values.vesselInfo?.vesselName) {
      toast.error('Vessel Name / IMO No. is required to save a report');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        copyTypes: values.copyTypes,
        vesselInfo: values.vesselInfo,
        flsCapacitance: values.flsCapacitance,
        flsFloater: values.flsFloater,
        network: values.network,
        engine: values.engine,
        solar: values.solar,
        remarks: values.remarks || '',
        signoff: values.signoff || {},
        createdAt: new Date(),
        uid: auth?.currentUser?.uid ?? null,
      };

      if (selectedReportId) {
        await setDoc(doc(firestore, 'reports', selectedReportId), payload, { merge: true });
        toast.success('Report updated successfully!');
      } else {
        const docRef = await addDoc(collection(firestore, 'reports'), payload);
        setSelectedReportId(docRef.id);
        toast.success('Report saved successfully!');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast.error('Failed to save report', { description: msg });
    } finally {
      setSaving(false);
    }
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<AccountabilityFormValues>({
    resolver: zodResolver(accountabilityFormSchema),
    defaultValues: {
      copyTypes: ['aimf', 'vessel', 'vessel_owner'],
      vesselInfo: {
        vesselName: '',
        installationDate: '',
        leadEngineer: '',
      },
      flsCapacitance: {
        qty: '1',
        tankAssigned: '',
        serialNumber: '',
        calibrationStatus: 'good',
      },
      flsFloater: {
        qty: '1',
        tankAssigned: '',
        serialNumber: '',
        calibrationStatus: 'good',
      },
      network: {
        qty: '1',
        serialNumber: '',
        signalStatus: 'excellent',
      },
      engine: {
        qty: '1',
        connectedEngines: '',
        serialNumber: '',
      },
      solar: {
        qty: '1',
        installationLocation: '',
        serialNumber: '',
        powerStatus: 'fully_charged',
      },
      remarks: '',
      signoff: {
        technicianName: '',
        technicianDesignation: '',
        signoffDate: '',
        receiverName: '',
        receiverDesignation: '',
      },
    },
  });

  // Client-only date hydration to prevent Next.js hydration warning
  useEffect(() => {
    setValue('vesselInfo.installationDate', format(new Date(), 'MMMM d, yyyy'));
    setValue('signoff.signoffDate', format(new Date(), 'MMMM d, yyyy'));
  }, [setValue]);

  const watchedCopyTypes = watch('copyTypes');

  // Watch quantities to dynamically render S/N input fields
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

  useEffect(() => {
    setCapSns((prev) => {
      const next = [...prev];
      while (next.length < capQty) next.push('');
      setValue('flsCapacitance.serialNumber', next.slice(0, capQty).join(', '));
      return next;
    });
  }, [capQty, setValue]);

  useEffect(() => {
    setCapTanks((prev) => {
      const next = [...prev];
      while (next.length < capQty) next.push('');
      setValue('flsCapacitance.tankAssigned', next.slice(0, capQty).join(', '));
      return next;
    });
  }, [capQty, setValue]);

  useEffect(() => {
    const targetSnQty = floaterQty * 2;
    setFloaterSns((prev) => {
      const next = [...prev];
      while (next.length < targetSnQty) next.push('');
      setValue('flsFloater.serialNumber', next.slice(0, targetSnQty).join(', '));
      return next;
    });
  }, [floaterQty, setValue]);

  useEffect(() => {
    setFloaterTanks((prev) => {
      const next = [...prev];
      while (next.length < floaterQty) next.push('');
      setValue('flsFloater.tankAssigned', next.slice(0, floaterQty).join(', '));
      return next;
    });
  }, [floaterQty, setValue]);

  useEffect(() => {
    setNetworkSns((prev) => {
      const next = [...prev];
      while (next.length < networkQty) next.push('');
      setValue('network.serialNumber', next.slice(0, networkQty).join(', '));
      return next;
    });
  }, [networkQty, setValue]);

  useEffect(() => {
    setEngineSns((prev) => {
      const next = [...prev];
      while (next.length < engineQty) next.push('');
      setValue('engine.serialNumber', next.slice(0, engineQty).join(', '));
      return next;
    });
  }, [engineQty, setValue]);

  useEffect(() => {
    setEngineAssets((prev) => {
      const next = [...prev];
      while (next.length < engineQty) next.push('');
      setValue('engine.connectedEngines', next.slice(0, engineQty).join(', '));
      return next;
    });
  }, [engineQty, setValue]);

  useEffect(() => {
    setSolarSns((prev) => {
      const next = [...prev];
      while (next.length < solarQty) next.push('');
      setValue('solar.serialNumber', next.slice(0, solarQty).join(', '));
      return next;
    });
  }, [solarQty, setValue]);

  useEffect(() => {
    setSolarLocations((prev) => {
      const next = [...prev];
      while (next.length < solarQty) next.push('');
      setValue('solar.installationLocation', next.slice(0, solarQty).join(', '));
      return next;
    });
  }, [solarQty, setValue]);

  const handleSnsChange = (
    index: number,
    val: string,
    sns: string[],
    setSns: React.Dispatch<React.SetStateAction<string[]>>,
    formKey: 'flsCapacitance.serialNumber' | 'flsFloater.serialNumber' | 'network.serialNumber' | 'engine.serialNumber' | 'solar.serialNumber'
  ) => {
    const next = [...sns];
    next[index] = val;
    setSns(next);
    setValue(formKey, next.filter(Boolean).join(', '), { shouldValidate: true });
  };

  const handleArrayChange = (
    index: number,
    val: string,
    arr: string[],
    setArr: React.Dispatch<React.SetStateAction<string[]>>,
    formKey: 'flsCapacitance.tankAssigned' | 'flsFloater.tankAssigned' | 'engine.connectedEngines' | 'solar.installationLocation'
  ) => {
    const next = [...arr];
    next[index] = val;
    setArr(next);
    setValue(formKey, next.filter(Boolean).join(', '), { shouldValidate: true });
  };

  const handleClear = () => {
    setSelectedReportId('');
    reset({
      copyTypes: ['aimf', 'vessel', 'vessel_owner'],
      vesselInfo: { vesselName: '', installationDate: '', leadEngineer: '' },
      flsCapacitance: { qty: '1', tankAssigned: '', serialNumber: '', calibrationStatus: 'good' },
      flsFloater: { qty: '1', tankAssigned: '', serialNumber: '', calibrationStatus: 'good' },
      network: { qty: '1', serialNumber: '', signalStatus: 'excellent' },
      engine: { qty: '1', connectedEngines: '', serialNumber: '' },
      solar: { qty: '1', installationLocation: '', serialNumber: '', powerStatus: 'fully_charged' },
      remarks: '',
      signoff: { technicianName: '', technicianDesignation: '', signoffDate: '', receiverName: '', receiverDesignation: '' },
    });
    setPhotoState({ fls: [], network: [], engine: [], solar: [] });
    setCapSns(['']);
    setFloaterSns(['']);
    setNetworkSns(['']);
    setEngineSns(['']);
    setSolarSns(['']);
    setCapTanks(['']);
    setFloaterTanks(['']);
    setEngineAssets(['']);
    setSolarLocations(['']);
    // Re-hydrate dates
    setValue('vesselInfo.installationDate', format(new Date(), 'MMMM d, yyyy'));
    setValue('signoff.signoffDate', format(new Date(), 'MMMM d, yyyy'));
    toast.success('Form cleared!');
  };

  const toggleCopyType = (ct: CopyType) => {
    const current = watchedCopyTypes ?? [];
    if (current.includes(ct)) {
      setValue('copyTypes', current.filter((c) => c !== ct), { shouldValidate: true });
    } else {
      setValue('copyTypes', [...current, ct], { shouldValidate: true });
    }
  };

  const onSubmit = async (rawValues: AccountabilityFormValues) => {
    const values = rawValues as any;
    setLoading(true);
    setDownloaded(false);

    try {
      const fd = new FormData();

      // Vessel Info
      fd.append('vesselName', values.vesselInfo.vesselName);
      fd.append('installationDate', values.vesselInfo.installationDate);
      fd.append('leadEngineer', values.vesselInfo.leadEngineer);

      // FLS
      fd.append('flsCapacitanceQty', values.flsCapacitance.qty);
      fd.append('flsCapacitanceTank', values.flsCapacitance.tankAssigned);
      fd.append('flsCapacitanceSN', values.flsCapacitance.serialNumber);
      fd.append('flsCapacitanceStatus', values.flsCapacitance.calibrationStatus);
      fd.append('flsFloaterQty', String(floaterQty * 2));
      fd.append('flsFloaterTank', values.flsFloater.tankAssigned);
      fd.append('flsFloaterSN', values.flsFloater.serialNumber);
      fd.append('flsFloaterStatus', values.flsFloater.calibrationStatus);

      // Network
      fd.append('networkQty', values.network.qty);
      fd.append('networkSN', values.network.serialNumber);
      fd.append('networkSignalStatus', values.network.signalStatus);

      // Engine
      fd.append('engineQty', values.engine.qty);
      fd.append('engineConnected', values.engine.connectedEngines);
      fd.append('engineSN', values.engine.serialNumber);

      // Solar
      fd.append('solarQty', values.solar.qty);
      fd.append('solarLocation', values.solar.installationLocation);
      fd.append('solarSN', values.solar.serialNumber);
      fd.append('solarPowerStatus', values.solar.powerStatus);

      // Remarks + Signoff
      fd.append('remarks', values.remarks?.trim() || 'Installation done properly');

      // Copy types
      fd.append('copyTypes', JSON.stringify(values.copyTypes));

      // Photos
      photoState.fls.forEach((f) => fd.append('flsPhotos', f));
      photoState.network.forEach((f) => fd.append('networkPhotos', f));
      photoState.engine.forEach((f) => fd.append('enginePhotos', f));
      photoState.solar.forEach((f) => fd.append('solarPhotos', f));

      const res = await fetch('/api/generate-docx', { method: 'POST', body: fd });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Generation failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Equipment-Accountability-Report-${format(new Date(), 'yyyy-MM-dd')}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      setDownloaded(true);
      toast.success('Report Generated!', {
        description: `${values.copyTypes.length} DOCX ${values.copyTypes.length === 1 ? 'copy' : 'copies'} downloaded as a ZIP file.`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast.error('Generation Failed', { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validate form values using watch/getValues
    const values = watch();
    if (!values.vesselInfo?.vesselName) {
      toast.error('Validation Error', { description: 'Vessel Name is required to save report.' });
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(firestore, 'reports'), {
        ...values,
        createdAt: Timestamp.now()
      });
      toast.success('Report saved to database successfully!');
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast.error('Failed to save report', { description: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleSelectReport = (reportId: string | null) => {
    if (!reportId) return;
    const report = savedReports.find((r) => r.id === reportId);
    if (!report) return;
    
    // Fill the react-hook-form
    reset(report.data);

    // Sync individual item states so array inputs expand correctly
    const capQty = Math.max(1, parseInt(report.data.flsCapacitance?.qty || '1', 10));
    const floaterQty = Math.max(1, parseInt(report.data.flsFloater?.qty || '1', 10));
    const networkQty = Math.max(1, parseInt(report.data.network?.qty || '1', 10));
    const engineQty = Math.max(1, parseInt(report.data.engine?.qty || '1', 10));
    const solarQty = Math.max(1, parseInt(report.data.solar?.qty || '1', 10));

    // Split serial numbers and tanks from stored strings
    setCapSns(report.data.flsCapacitance?.serialNumber?.split(', ') || ['']);
    setCapTanks(report.data.flsCapacitance?.tankAssigned?.split(', ') || ['']);

    setFloaterSns(report.data.flsFloater?.serialNumber?.split(', ') || ['']);
    setFloaterTanks(report.data.flsFloater?.tankAssigned?.split(', ') || ['']);

    setNetworkSns(report.data.network?.serialNumber?.split(', ') || ['']);

    setEngineSns(report.data.engine?.serialNumber?.split(', ') || ['']);
    setEngineAssets(report.data.engine?.connectedEngines?.split(', ') || ['']);

    setSolarSns(report.data.solar?.serialNumber?.split(', ') || ['']);
    setSolarLocations(report.data.solar?.installationLocation?.split(', ') || ['']);

    toast.success('Form filled with saved vessel info!');
  };



  const inputCls = 'bg-muted/50 border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all';

  return (
    <div className="min-h-screen">
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-sm leading-tight">Equipment Accountability</h1>
              <p className="text-xs text-muted-foreground">AIMF Tech. Corp. · Report Generator</p>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {/* ── HERO ── */}
      <div className="max-w-5xl mx-auto px-4 pt-12 pb-8 text-center space-y-6 animate-fadeIn">
        <div className="flex flex-col items-center justify-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Post-Installation Hardware Deployment Report
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-br from-foreground via-foreground to-foreground/50 bg-clip-text text-transparent mb-4">
            Generate Your Accountability<br className="hidden md:block" /> Report
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Fill out the form, upload installation photos, and instantly download all three DOCX copies — AIMF, Vessel, and Vessel Owner — in a single ZIP file.
          </p>
        </div>

        {/* ── SAVED VESSEL SELECTOR ── */}
        <div className="bg-card/50 backdrop-blur border border-border/80 rounded-2xl p-5 max-w-xl mx-auto flex flex-col sm:flex-row items-center gap-4 text-left shadow-lg">
          <div className="flex-1 space-y-1 w-full">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Saved Vessel Info</Label>
            <Select onValueChange={handleSelectReport}>
              <SelectTrigger className="w-full h-11 bg-muted/40 border-border text-sm font-medium focus:ring-1 focus:ring-primary/20">
                <SelectValue placeholder={savedReports.length > 0 ? "Choose a vessel..." : "No saved vessels found"} />
              </SelectTrigger>
              <SelectContent>
                {savedReports.map((report) => (
                  <SelectItem key={report.id} value={report.id}>
                    {report.vesselName} {report.installationDate ? `(${report.installationDate})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── FORM ── */}
      <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="max-w-5xl mx-auto px-4 pb-24 space-y-6">

        {/* ── 1. VESSEL INFO ── */}
        <SectionCard id="vessel" icon={Ship} title="Vessel Information">
          <div className="grid md:grid-cols-2 gap-5">
            <Field label="Vessel Name / IMO No." error={!!errors.vesselInfo?.vesselName}>
              <Input
                {...register('vesselInfo.vesselName')}
                placeholder="e.g. BTC MT MAKILING / IMO 1234567"
                className={inputCls}
              />
              <FieldError name="vesselInfo.vesselName" errors={errors} />
            </Field>
            <Field label="Installation Date" error={!!errors.vesselInfo?.installationDate}>
              <Input
                {...register('vesselInfo.installationDate')}
                placeholder="e.g. June 3, 2026"
                className={inputCls}
              />
              <FieldError name="vesselInfo.installationDate" errors={errors} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Technician / Lead Engineer" error={!!errors.vesselInfo?.leadEngineer}>
                <Input
                  {...register('vesselInfo.leadEngineer')}
                  placeholder="e.g. Melchor Adrian Calicdan & Jhiro Fronda"
                  className={inputCls}
                />
                <FieldError name="vesselInfo.leadEngineer" errors={errors} />
              </Field>
            </div>
          </div>
        </SectionCard>

        {/* ── 2. FLS ── */}
        <SectionCard id="fls" icon={Zap} title="1. Fuel Level Sensors (FLS)" badge="Section 1">
          {/* Capacitance */}
          <div>
            <p className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
              <ChevronRight className="w-4 h-4" />
              Capacitance Fuel Sensor (VSP)
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Qty" error={!!errors.flsCapacitance?.qty}>
                <QuantitySelector
                  value={watch('flsCapacitance.qty') || '1'}
                  onChange={(val) => setValue('flsCapacitance.qty', val, { shouldValidate: true })}
                />
                <FieldError name="flsCapacitance.qty" errors={errors} />
              </Field>
              <div className="space-y-1.5 md:col-span-1">
                <Label className={cn('text-sm font-medium', errors.flsCapacitance?.tankAssigned && 'text-destructive')}>
                  Tanks Assigned ({capQty})
                </Label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {capTanks.slice(0, capQty).map((tank, idx) => (
                    <Input
                      key={idx}
                      value={tank}
                      onChange={(e) => handleArrayChange(idx, e.target.value, capTanks, setCapTanks, 'flsCapacitance.tankAssigned')}
                      placeholder={`Tank Assigned #${idx + 1}`}
                      className={inputCls}
                    />
                  ))}
                </div>
                <FieldError name="flsCapacitance.tankAssigned" errors={errors} />
              </div>
              <div className="space-y-1.5 md:col-span-1">
                <Label className={cn('text-sm font-medium', errors.flsCapacitance?.serialNumber && 'text-destructive')}>
                  Serial Numbers ({capQty})
                </Label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {capSns.slice(0, capQty).map((sn, idx) => (
                    <Input
                      key={idx}
                      value={sn}
                      onChange={(e) => handleSnsChange(idx, e.target.value, capSns, setCapSns, 'flsCapacitance.serialNumber')}
                      placeholder={`S/N #${idx + 1}`}
                      className={inputCls}
                    />
                  ))}
                </div>
                <FieldError name="flsCapacitance.serialNumber" errors={errors} />
              </div>
              <Field label="Calibration Status">
                <select
                  {...register('flsCapacitance.calibrationStatus')}
                  className={cn('w-full rounded-lg border px-3 py-2 text-sm', inputCls)}
                >
                  <option value="good">✔ Good Working Condition</option>
                  <option value="defective">✘ Defective</option>
                </select>
              </Field>
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <p className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
              <ChevronRight className="w-4 h-4" />
              Floater Fuel Sensor (SP)
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Qty" error={!!errors.flsFloater?.qty}>
                <QuantitySelector
                  value={watch('flsFloater.qty') || '1'}
                  onChange={(val) => setValue('flsFloater.qty', val, { shouldValidate: true })}
                />
                <FieldError name="flsFloater.qty" errors={errors} />
              </Field>
              <Field label="Calibration Status">
                <select
                  {...register('flsFloater.calibrationStatus')}
                  className={cn('w-full rounded-lg border px-3 py-2 text-sm', inputCls)}
                >
                  <option value="good">✔ Good Working Condition</option>
                  <option value="defective">✘ Defective</option>
                </select>
              </Field>
              <div className="md:col-span-2 lg:col-span-4 space-y-4">
                <Label className="text-sm font-semibold text-muted-foreground">Tanks & Devices (1 Tank Assigned = 2 S/Ns)</Label>
                <div className="grid md:grid-cols-2 gap-4">
                  {Array.from({ length: floaterQty }).map((_, tankIdx) => (
                    <div key={tankIdx} className="grid grid-cols-2 gap-4 p-4 border border-border/60 bg-muted/10 rounded-xl">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Tank Assigned #{tankIdx + 1}</Label>
                        <Input
                          value={floaterTanks[tankIdx] || ''}
                          onChange={(e) => handleArrayChange(tankIdx, e.target.value, floaterTanks, setFloaterTanks, 'flsFloater.tankAssigned')}
                          placeholder="e.g. Port Fuel Tank"
                          className={inputCls}
                        />
                        <FieldError name="flsFloater.tankAssigned" errors={errors} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Serial Numbers</Label>
                        <div className="space-y-1.5">
                          <Input
                            value={floaterSns[tankIdx * 2] || ''}
                            onChange={(e) => handleSnsChange(tankIdx * 2, e.target.value, floaterSns, setFloaterSns, 'flsFloater.serialNumber')}
                            placeholder={`S/N #${tankIdx * 2 + 1}`}
                            className={inputCls}
                          />
                          <Input
                            value={floaterSns[tankIdx * 2 + 1] || ''}
                            onChange={(e) => handleSnsChange(tankIdx * 2 + 1, e.target.value, floaterSns, setFloaterSns, 'flsFloater.serialNumber')}
                            placeholder={`S/N #${tankIdx * 2 + 2}`}
                            className={inputCls}
                          />
                        </div>
                        <FieldError name="flsFloater.serialNumber" errors={errors} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* FLS Photos */}
          <div className="border-t border-border pt-5">
            <PhotoUploader
              label="FLS Installation Photos (up to 3)"
              maxFiles={3}
              onChange={(files) => setPhotoState((p) => ({ ...p, fls: files }))}
            />
          </div>
        </SectionCard>

        {/* ── 3. NETWORK ── */}
        <SectionCard id="network" icon={Wifi} title="2. Network & Telemetry Infrastructure" badge="Section 2">
          <p className="text-sm text-muted-foreground -mt-1">
            Device: <span className="text-foreground font-medium">Wireless Network Transmitter (NR)</span>
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Qty" error={!!errors.network?.qty}>
              <QuantitySelector
                value={watch('network.qty') || '1'}
                onChange={(val) => setValue('network.qty', val, { shouldValidate: true })}
              />
              <FieldError name="network.qty" errors={errors} />
            </Field>
              <div className="space-y-1.5 md:col-span-1">
                <Label className={cn('text-sm font-medium', errors.network?.serialNumber && 'text-destructive')}>
                  Serial Numbers ({networkQty})
                </Label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {networkSns.slice(0, networkQty).map((sn, idx) => (
                    <Input
                      key={idx}
                      value={sn}
                      onChange={(e) => handleSnsChange(idx, e.target.value, networkSns, setNetworkSns, 'network.serialNumber')}
                      placeholder={`S/N #${idx + 1}`}
                      className={inputCls}
                    />
                  ))}
                </div>
                <FieldError name="network.serialNumber" errors={errors} />
              </div>
            <Field label="Signal Strength / Status">
              <select
                {...register('network.signalStatus')}
                className={cn('w-full rounded-lg border px-3 py-2 text-sm', inputCls)}
              >
                <option value="excellent">✔ Excellent</option>
                <option value="good">✔ Good</option>
                <option value="poor">✘ Poor</option>
              </select>
            </Field>
          </div>

          <div className="border-t border-border pt-5">
            <PhotoUploader
              label="Network Installation Photos (up to 3)"
              maxFiles={3}
              onChange={(files) => setPhotoState((p) => ({ ...p, network: files }))}
            />
          </div>
        </SectionCard>

        {/* ── 4. ENGINE ── */}
        <SectionCard id="engine" icon={FileText} title="3. Engine Operations & Working Hours Monitoring" badge="Section 3">
          <p className="text-sm text-muted-foreground -mt-1">
            Device: <span className="text-foreground font-medium">Working Hours Monitoring Device (SD)</span>
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Qty" error={!!errors.engine?.qty}>
              <QuantitySelector
                value={watch('engine.qty') || '1'}
                onChange={(val) => setValue('engine.qty', val, { shouldValidate: true })}
              />
              <FieldError name="engine.qty" errors={errors} />
            </Field>
              <div className="space-y-1.5 md:col-span-1">
                <Label className={cn('text-sm font-medium', errors.engine?.serialNumber && 'text-destructive')}>
                  Serial Numbers ({engineQty})
                </Label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {engineSns.slice(0, engineQty).map((sn, idx) => (
                    <Input
                      key={idx}
                      value={sn}
                      onChange={(e) => handleSnsChange(idx, e.target.value, engineSns, setEngineSns, 'engine.serialNumber')}
                      placeholder={`S/N #${idx + 1}`}
                      className={inputCls}
                    />
                  ))}
                </div>
                <FieldError name="engine.serialNumber" errors={errors} />
              </div>
              <div className="space-y-1.5 md:col-span-1">
                <Label className={cn('text-sm font-medium', errors.engine?.connectedEngines && 'text-destructive')}>
                  Connected Engines / Assets ({engineQty})
                </Label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {engineAssets.slice(0, engineQty).map((asset, idx) => (
                    <Input
                      key={idx}
                      value={asset}
                      onChange={(e) => handleArrayChange(idx, e.target.value, engineAssets, setEngineAssets, 'engine.connectedEngines')}
                      placeholder={`Connected Engine #${idx + 1}`}
                      className={inputCls}
                    />
                  ))}
                </div>
                <FieldError name="engine.connectedEngines" errors={errors} />
              </div>
          </div>

          <div className="border-t border-border pt-5">
            <PhotoUploader
              label="Engine Monitoring Photos (up to 3)"
              maxFiles={3}
              onChange={(files) => setPhotoState((p) => ({ ...p, engine: files }))}
            />
          </div>
        </SectionCard>

        {/* ── 5. SOLAR ── */}
        <SectionCard id="solar" icon={Sun} title="4. Solar Power & Energy Storage Deployment" badge="Section 4">
          <p className="text-sm text-muted-foreground -mt-1">
            Device: <span className="text-foreground font-medium">Wireless Solar Panel with Power Storage Device (Terminal)</span>
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Qty" error={!!errors.solar?.qty}>
              <QuantitySelector
                value={watch('solar.qty') || '1'}
                onChange={(val) => setValue('solar.qty', val, { shouldValidate: true })}
              />
              <FieldError name="solar.qty" errors={errors} />
            </Field>
              <div className="space-y-1.5 md:col-span-1">
                <Label className={cn('text-sm font-medium', errors.solar?.installationLocation && 'text-destructive')}>
                  Installation Locations ({solarQty})
                </Label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {solarLocations.slice(0, solarQty).map((loc, idx) => (
                    <Input
                      key={idx}
                      value={loc}
                      onChange={(e) => handleArrayChange(idx, e.target.value, solarLocations, setSolarLocations, 'solar.installationLocation')}
                      placeholder={`Location #${idx + 1}`}
                      className={inputCls}
                    />
                  ))}
                </div>
                <FieldError name="solar.installationLocation" errors={errors} />
              </div>
              <div className="space-y-1.5 md:col-span-1">
                <Label className={cn('text-sm font-medium', errors.solar?.serialNumber && 'text-destructive')}>
                  Serial Numbers ({solarQty})
                </Label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {solarSns.slice(0, solarQty).map((sn, idx) => (
                    <Input
                      key={idx}
                      value={sn}
                      onChange={(e) => handleSnsChange(idx, e.target.value, solarSns, setSolarSns, 'solar.serialNumber')}
                      placeholder={`S/N #${idx + 1}`}
                      className={inputCls}
                    />
                  ))}
                </div>
                <FieldError name="solar.serialNumber" errors={errors} />
              </div>
            <Field label="Initial Battery / Power Status">
              <select
                {...register('solar.powerStatus')}
                className={cn('w-full rounded-lg border px-3 py-2 text-sm', inputCls)}
              >
                <option value="fully_charged">✔ Fully Charged</option>
                <option value="charging">✔ Charging</option>
                <option value="operational">✔ Operational</option>
              </select>
            </Field>
          </div>

          <div className="border-t border-border pt-5">
            <PhotoUploader
              label="Solar Installation Photos (up to 3)"
              maxFiles={3}
              onChange={(files) => setPhotoState((p) => ({ ...p, solar: files }))}
            />
          </div>
        </SectionCard>

        {/* ── 6. REMARKS ── */}
        <SectionCard id="remarks" icon={StickyNote} title="5. Remarks & Exceptions">
          <p className="text-sm text-muted-foreground -mt-1">
            Note any environmental conditions, deviations, or outstanding tasks.
          </p>
          <Textarea
            {...register('remarks')}
            placeholder="Enter remarks here, or leave blank to use: 'Installation done properly'…"
            rows={4}
            className={cn(inputCls, 'resize-none')}
          />
        </SectionCard>



        {/* ── 8. COPY SELECTION ── */}
        <SectionCard id="copies" icon={Download} title="Select Copies to Download">
          <p className="text-sm text-muted-foreground -mt-1">
            All selected copies will be bundled into one ZIP download.
          </p>
          {errors.copyTypes && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {errors.copyTypes.message}
            </p>
          )}
          <div className="grid md:grid-cols-3 gap-3">
            {COPY_OPTIONS.map((opt) => {
              const selected = (watchedCopyTypes ?? []).includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleCopyType(opt.value)}
                  className={cn(
                    'flex flex-col gap-1 p-4 rounded-xl border-2 text-left transition-all',
                    selected
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-muted/20 text-muted-foreground hover:border-primary/40 hover:bg-muted/40'
                  )}
                >
                  <span className="font-semibold text-sm flex items-center gap-2">
                    <span
                      className={cn(
                        'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
                        selected ? 'border-primary bg-primary' : 'border-muted-foreground'
                      )}
                    >
                      {selected && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                    </span>
                    {opt.label}
                  </span>
                  <span className="text-xs pl-6 opacity-70">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* ── SUBMIT ── */}
        <div className="flex flex-col items-center gap-4 pt-4">
          {downloaded && (
            <div className="flex items-center gap-2 text-green-400 text-sm font-medium animate-fadeInUp">
              <CheckCircle2 className="w-5 h-5" />
              Report downloaded! You can generate again with updated data.
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 w-full justify-center max-w-2xl">
            <Button
              type="button"
              variant="outline"
              onClick={handleClear}
              disabled={loading || saving}
              className="h-14 px-6 text-base font-semibold rounded-2xl border-border hover:bg-muted/50 transition-all flex-1"
            >
              Clear Form
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSave}
              disabled={loading || saving}
              className="h-14 px-6 text-base font-semibold rounded-2xl border-primary/35 text-primary hover:bg-primary/5 transition-all flex-1"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  Save Report Info
                </>
              )}
            </Button>
            <Button
              type="submit"
              disabled={loading || saving}
              className={cn(
                'btn-glow h-14 px-8 text-base font-semibold rounded-2xl gap-3 flex-1',
                'bg-primary hover:bg-primary/90 text-primary-foreground',
                'disabled:opacity-60 disabled:cursor-not-allowed transition-all'
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating Report…
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Generate & Download
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Generates {(watchedCopyTypes ?? []).length} DOCX{' '}
            {(watchedCopyTypes ?? []).length === 1 ? 'copy' : 'copies'} bundled in a ZIP file
          </p>
        </div>
      </form>

      {/* Footer */}
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground/50">
        Equipment Accountability Report Generator · AIMF Tech. Corp. ©{new Date().getFullYear()}
      </footer>
    </div>
  );
}
