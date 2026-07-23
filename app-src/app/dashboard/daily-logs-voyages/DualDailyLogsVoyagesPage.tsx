'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Gauge,
  Keyboard,
  Loader2,
  Plus,
  RotateCcw,
  Ship,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authenticatedFetch } from '@/lib/firebase/authenticatedFetch';
import { calculateVoyages } from '@/lib/voyage/calculations';
import {
  dailyInDateRange,
  manualInputToDailyLog,
  validateDateRange,
  voyageInDateRange,
} from '@/lib/voyage/manual';
import type {
  DailyLogRecord,
  ManualDailyLogInput,
  VoyageDefinition,
  VoyageResult,
} from '@/lib/voyage/types';
import { cn } from '@/lib/utils';
import { detectedVesselNames, vesselFileStem } from '@/lib/voyage/vessel';

interface AnalysisResponse {
  dailyLogs: DailyLogRecord[];
  voyages: VoyageResult[];
  warnings: string[];
}

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const EMPTY_MANUAL_ENTRY: ManualDailyLogInput = {
  id: '',
  date: '',
  location: '',
  activity: '',
  portHours: 0,
  starboardHours: 0,
  mainEngineFuel: 0,
  auxiliaryEngineFuel: 0,
  otherFuel: 0,
};

function inputDateTime(iso: string) {
  return iso ? iso.replace(/Z$/, '').slice(0, 19) : '';
}

function isoDateTime(value: string) {
  const parsed = new Date(`${value}Z`);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function voyageDefinition(voyage: VoyageResult): VoyageDefinition {
  return {
    id: voyage.id,
    cycle: voyage.cycle,
    displayCycle: voyage.displayCycle,
    from: voyage.from,
    to: voyage.to,
    departure: voyage.departure,
    arrival: voyage.arrival,
    distance: voyage.distance,
    averageSpeed: voyage.averageSpeed,
    mainEngineFuelOverride: voyage.mainEngineFuelOverride ?? null,
    auxiliaryEngineFuelOverride: voyage.auxiliaryEngineFuelOverride ?? null,
  };
}

function fullDateRange(records: DailyLogRecord[]) {
  const dates = records.map((record) => record.date).sort();
  return dates.length > 0 ? { from: dates[0], to: dates.at(-1) ?? dates[0] } : null;
}

function parseNonNegative(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export default function DualDailyLogsVoyagesPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedLogs, setUploadedLogs] = useState<DailyLogRecord[]>([]);
  const [manualInputs, setManualInputs] = useState<ManualDailyLogInput[]>([]);
  const [manualDraft, setManualDraft] = useState<ManualDailyLogInput>(EMPTY_MANUAL_ENTRY);
  const [vesselName, setVesselName] = useState('');
  const [definitions, setDefinitions] = useState<VoyageDefinition[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let active = true;
    const loadTemplateDefinitions = async () => {
      try {
        const response = await authenticatedFetch('/api/analyze-voyage-logs');
        const payload = await response.json() as AnalysisResponse | { error?: string };
        if (active && response.ok && 'voyages' in payload) {
          setDefinitions(payload.voyages.map(voyageDefinition));
        }
      } catch {
        // The route guard handles unauthenticated navigation; upload analysis can retry later.
      }
    };
    void loadTemplateDefinitions();
    return () => { active = false; };
  }, []);

  const manualLogs = useMemo(
    () => manualInputs.map((input) => manualInputToDailyLog(input, vesselName)),
    [manualInputs, vesselName],
  );
  const detectedVessels = useMemo(
    () => detectedVesselNames(uploadedLogs),
    [uploadedLogs],
  );
  const dailyLogs = useMemo(
    () => [...uploadedLogs, ...manualLogs].sort((a, b) => a.date.localeCompare(b.date)),
    [manualLogs, uploadedLogs],
  );
  const rangeValid = Boolean(dateFrom && dateTo && validateDateRange(dateFrom, dateTo));
  const allVoyages = useMemo(
    () => calculateVoyages(dailyLogs, definitions),
    [dailyLogs, definitions],
  );
  const filteredDailyLogs = useMemo(
    () => rangeValid
      ? dailyLogs.filter((daily) => dailyInDateRange(daily, dateFrom, dateTo))
      : dailyLogs,
    [dailyLogs, dateFrom, dateTo, rangeValid],
  );
  const filteredVoyages = useMemo(
    () => rangeValid
      ? allVoyages.filter((voyage) => voyageInDateRange(voyage, dateFrom, dateTo))
      : allVoyages,
    [allVoyages, dateFrom, dateTo, rangeValid],
  );
  const warnings = useMemo(() => [
    ...filteredDailyLogs.flatMap((daily) => daily.warnings.map((warning) => `${daily.date}: ${warning}`)),
    ...filteredVoyages.flatMap((voyage) => voyage.warnings.map((warning) => `${voyage.id}: ${warning}`)),
  ], [filteredDailyLogs, filteredVoyages]);
  const dailyTotals = useMemo(() => filteredDailyLogs.reduce(
    (totals, daily) => ({
      main: totals.main + daily.mainEngineFuel,
      auxiliary: totals.auxiliary + daily.auxiliaryEngineFuel,
      total: totals.total + daily.totalFuel,
    }),
    { main: 0, auxiliary: 0, total: 0 },
  ), [filteredDailyLogs]);
  const voyageTotals = useMemo(() => filteredVoyages.reduce(
    (totals, voyage) => ({
      main: totals.main + voyage.mainEngineFuel,
      auxiliary: totals.auxiliary + voyage.auxiliaryEngineFuel,
      total: totals.total + voyage.totalFuel,
    }),
    { main: 0, auxiliary: 0, total: 0 },
  ), [filteredVoyages]);

  const applyFullRange = (records = dailyLogs) => {
    const range = fullDateRange(records);
    if (!range) return;
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return;
    const next = Array.from(selected).filter((file) => /\.xlsx?$/i.test(file.name));
    if (next.length !== selected.length) toast.error('Only .xls and .xlsx workbooks are supported.');
    const unique = new Map(files.map((file) => [`${file.name}:${file.size}`, file]));
    next.forEach((file) => unique.set(`${file.name}:${file.size}`, file));
    setFiles([...unique.values()].sort((a, b) => a.name.localeCompare(b.name)));
    setUploadedLogs([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formDataWithFiles = () => {
    const body = new FormData();
    files.forEach((file) => body.append('files', file, file.name));
    return body;
  };

  const analyze = async () => {
    if (files.length === 0) {
      toast.error('Select at least one daily report.');
      return;
    }
    setAnalyzing(true);
    try {
      const response = await authenticatedFetch('/api/analyze-voyage-logs', {
        method: 'POST',
        body: formDataWithFiles(),
      });
      const payload = await response.json() as AnalysisResponse | { error?: string };
      if (!response.ok || !('dailyLogs' in payload)) {
        throw new Error('error' in payload ? payload.error : 'Analysis failed.');
      }
      const combinedDates = [...payload.dailyLogs, ...manualLogs];
      const detected = detectedVesselNames(payload.dailyLogs);
      if (detected.length > 1) {
        throw new Error(`The uploaded files contain more than one vessel: ${detected.join(', ')}.`);
      }
      if (detected.length === 1) {
        setVesselName((current) => current.trim() ? current : detected[0]);
      }
      setUploadedLogs(payload.dailyLogs);
      setDefinitions(payload.voyages.map(voyageDefinition));
      const range = fullDateRange(combinedDates);
      if (range) {
        setDateFrom(range.from);
        setDateTo(range.to);
      }
      toast.success(`Analyzed ${payload.dailyLogs.length} daily report${payload.dailyLogs.length === 1 ? '' : 's'}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to analyze the reports.');
    } finally {
      setAnalyzing(false);
    }
  };

  const updateManualDraft = <K extends keyof ManualDailyLogInput>(
    key: K,
    value: ManualDailyLogInput[K],
  ) => {
    setManualDraft((current) => ({ ...current, [key]: value }));
  };

  const addManualEntry = () => {
    if (!manualDraft.date) {
      toast.error('Select a date for the manual entry.');
      return;
    }
    if (dailyLogs.some((daily) => daily.date === manualDraft.date)) {
      toast.error(`A daily entry already exists for ${manualDraft.date}.`);
      return;
    }
    if (manualDraft.portHours > 24 || manualDraft.starboardHours > 24) {
      toast.error('Daily engine hours cannot exceed 24.');
      return;
    }
    const entry = {
      ...manualDraft,
      id: `manual-${manualDraft.date}-${Date.now()}`,
    };
    setManualInputs((current) => [...current, entry]);
    setManualDraft({ ...EMPTY_MANUAL_ENTRY, date: manualDraft.date });
    setDateFrom((current) => !current || manualDraft.date < current ? manualDraft.date : current);
    setDateTo((current) => !current || manualDraft.date > current ? manualDraft.date : current);
    toast.success(`Manual daily entry added for ${manualDraft.date}.`);
  };

  const updateDefinition = <K extends keyof VoyageDefinition>(
    id: string,
    key: K,
    value: VoyageDefinition[K],
  ) => {
    setDefinitions((current) => current.map((definition) => (
      definition.id === id ? { ...definition, [key]: value } : definition
    )));
  };

  const generate = async () => {
    if (!vesselName.trim()) {
      toast.error('Enter the vessel name before generating.');
      return;
    }
    if (dailyLogs.length === 0 || definitions.length === 0) {
      toast.error('Add manual daily values or analyze Excel reports before generating.');
      return;
    }
    if (!rangeValid) {
      toast.error('Select a valid From and To date range.');
      return;
    }
    setGenerating(true);
    try {
      const body = formDataWithFiles();
      body.append('vesselName', vesselName.trim());
      body.append('manualLogs', JSON.stringify(manualInputs));
      body.append('voyages', JSON.stringify(definitions));
      body.append('dateFrom', dateFrom);
      body.append('dateTo', dateTo);
      const response = await authenticatedFetch('/api/generate-voyage-report', { method: 'POST', body });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? 'Workbook generation failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${vesselFileStem(vesselName)}-${dateFrom}-to-${dateTo}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded the ${vesselName.trim()} report for ${dateFrom} through ${dateTo}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to generate the workbook.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-primary">
              <Ship className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-[0.18em]">Fleet vessel reporting</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Daily Logs & Voyages</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Enter daily totals manually, analyze WorkTimeStatistics Excel files, or combine both methods.
              Choose the vessel and exact date range before downloading the populated fleet report.
            </p>
          </div>
          {dailyLogs.length > 0 && (
            <Button onClick={generate} disabled={generating || !rangeValid || !vesselName.trim()} className="h-11 gap-2 rounded-xl px-5 font-semibold">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {generating ? 'Generating…' : 'Download selected date range'}
            </Button>
          )}
        </header>

        <section className="section-card rounded-2xl border border-primary/25 bg-card/60 p-5 shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-primary/15 p-2.5 text-primary"><Ship className="h-5 w-5" /></span>
              <div>
                <h2 className="font-semibold">Report vessel</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Enter any vessel in the fleet. Excel uploads fill this automatically when the vessel is present in the report title.
                </p>
              </div>
            </div>
            <label className="w-full space-y-1 text-xs text-muted-foreground md:max-w-md">
              Vessel name
              <Input
                value={vesselName}
                onChange={(event) => setVesselName(event.target.value)}
                maxLength={80}
                placeholder="e.g. Harbor Master 2"
                className="h-11 text-sm font-semibold"
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {detectedVessels.length === 1
              ? `Detected in uploaded Excel: ${detectedVessels[0]}. The name above will be used in workbook titles and the download filename.`
              : 'The selected vessel name will be used for both manual entries and uploaded Excel data.'}
          </p>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <div className="section-card rounded-2xl border border-border/80 bg-card/60 p-5 shadow-lg backdrop-blur-xl">
            <div className="mb-4 flex items-center gap-3">
              <span className="rounded-xl bg-emerald-500/15 p-2.5 text-emerald-400"><FileSpreadsheet className="h-5 w-5" /></span>
              <div>
                <h2 className="font-semibold">Get values from Excel</h2>
                <p className="text-xs text-muted-foreground">Upload one or many daily `.xls` or `.xlsx` reports.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleFiles(event.dataTransfer.files);
              }}
              className="group flex min-h-36 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/20 px-6 text-center transition hover:border-primary/60 hover:bg-primary/5"
            >
              <UploadCloud className="mb-2 h-7 w-7 text-primary" />
              <span className="font-semibold">Select or drop workbooks</span>
              <span className="mt-1 text-xs text-muted-foreground">Legacy .xls and modern .xlsx · multiple files supported</span>
            </button>
            <input ref={fileInputRef} type="file" accept=".xls,.xlsx" multiple className="hidden" onChange={(event) => handleFiles(event.target.files)} />
            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/30 p-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upload queue</p>
                <p className="text-sm font-semibold">{files.length} report{files.length === 1 ? '' : 's'} selected</p>
              </div>
              <Button onClick={analyze} disabled={files.length === 0 || analyzing} className="gap-2 rounded-xl">
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
                {analyzing ? 'Analyzing…' : 'Analyze Excel'}
              </Button>
            </div>
            {files.length > 0 && (
              <div className="mt-3 flex max-h-24 flex-wrap gap-2 overflow-y-auto">
                {files.map((file, index) => (
                  <span key={`${file.name}:${file.size}`} className="flex max-w-full items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-1.5 text-xs">
                    <span className="max-w-60 truncate">{file.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => {
                        setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
                        setUploadedLogs([]);
                      }}
                      className="text-muted-foreground transition hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="section-card rounded-2xl border border-border/80 bg-card/60 p-5 shadow-lg backdrop-blur-xl">
            <div className="mb-4 flex items-center gap-3">
              <span className="rounded-xl bg-sky-500/15 p-2.5 text-sky-400"><Keyboard className="h-5 w-5" /></span>
              <div>
                <h2 className="font-semibold">Type values manually</h2>
                <p className="text-xs text-muted-foreground">Add as many dated daily entries as required.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-1 text-xs text-muted-foreground">Date<Input type="date" value={manualDraft.date} onChange={(event) => updateManualDraft('date', event.target.value)} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">Location / leg<Input value={manualDraft.location} onChange={(event) => updateManualDraft('location', event.target.value)} placeholder="Perez" /></label>
              <label className="space-y-1 text-xs text-muted-foreground">Activity<Input value={manualDraft.activity} onChange={(event) => updateManualDraft('activity', event.target.value)} placeholder="Transit / in port" /></label>
              <label className="space-y-1 text-xs text-muted-foreground">Port ME hours<Input type="number" min="0" max="24" step="0.01" value={manualDraft.portHours} onChange={(event) => updateManualDraft('portHours', parseNonNegative(event.target.value))} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">STBD ME hours<Input type="number" min="0" max="24" step="0.01" value={manualDraft.starboardHours} onChange={(event) => updateManualDraft('starboardHours', parseNonNegative(event.target.value))} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">ME fuel (L)<Input type="number" min="0" step="0.01" value={manualDraft.mainEngineFuel} onChange={(event) => updateManualDraft('mainEngineFuel', parseNonNegative(event.target.value))} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">All AE fuel (L)<Input type="number" min="0" step="0.01" value={manualDraft.auxiliaryEngineFuel} onChange={(event) => updateManualDraft('auxiliaryEngineFuel', parseNonNegative(event.target.value))} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">Other fuel (L)<Input type="number" min="0" step="0.01" value={manualDraft.otherFuel} onChange={(event) => updateManualDraft('otherFuel', parseNonNegative(event.target.value))} /></label>
              <div className="flex items-end"><Button type="button" onClick={addManualEntry} className="h-10 w-full gap-2 rounded-xl"><Plus className="h-4 w-4" />Add daily entry</Button></div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Manual daily ME fuel fills the Daily log. Because a daily total has no operating intervals,
              type the required voyage ME fuel directly in the Voyage review table when applicable.
            </p>
          </div>
        </section>

        {dailyLogs.length > 0 && (
          <>
            <section className="section-card rounded-2xl border border-primary/25 bg-card/60 p-5 shadow-lg">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-primary/15 p-2.5 text-primary"><CalendarRange className="h-5 w-5" /></span>
                  <div>
                    <h2 className="font-semibold">Download date range</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Dates are inclusive. Daily rows and overlapping voyages outside this range are excluded from the downloaded workbook.</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="space-y-1 text-xs text-muted-foreground">From<Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-44" /></label>
                  <label className="space-y-1 text-xs text-muted-foreground">To<Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-44" /></label>
                  <Button type="button" variant="outline" onClick={() => applyFullRange()} className="gap-2"><RotateCcw className="h-4 w-4" />Full range</Button>
                </div>
              </div>
              {!rangeValid && <p className="mt-3 text-xs font-medium text-destructive">Choose a valid From date that is not after the To date.</p>}
              {rangeValid && (
                <p className="mt-3 text-xs text-primary">
                  Selected output: {filteredDailyLogs.length} daily entr{filteredDailyLogs.length === 1 ? 'y' : 'ies'} and {filteredVoyages.length} voyage{filteredVoyages.length === 1 ? '' : 's'}.
                </p>
              )}
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Daily entries', value: String(filteredDailyLogs.length), note: `${uploadedLogs.length} Excel · ${manualInputs.length} manual total` },
                { label: 'Daily total fuel', value: `${numberFormat.format(dailyTotals.total)} L`, note: `${numberFormat.format(dailyTotals.main)} L main engines` },
                { label: 'Voyage total fuel', value: `${numberFormat.format(voyageTotals.total)} L`, note: `${numberFormat.format(voyageTotals.auxiliary)} L all AE` },
                { label: 'Validation warnings', value: String(warnings.length), note: warnings.length === 0 ? 'Ready to generate' : 'Review highlighted items' },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl border border-border/80 bg-card/60 p-4 shadow-lg">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">{card.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{card.note}</p>
                </div>
              ))}
            </section>

            {warnings.length > 0 ? (
              <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  <div>
                    <h2 className="font-semibold text-amber-100">Review selected range</h2>
                    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-2 text-xs text-amber-100/80">
                      {warnings.map((warning, index) => <li key={`${warning}:${index}`}>• {warning}</li>)}
                    </ul>
                  </div>
                </div>
              </section>
            ) : (
              <section className="flex items-center gap-3 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" /> The selected range passed validation.
              </section>
            )}

            <section className="section-card rounded-2xl border border-border/80 bg-card/60 p-5 shadow-lg">
              <div className="mb-4">
                <h2 className="font-semibold">Daily log review</h2>
                <p className="mt-1 text-xs text-muted-foreground">Excel and manual rows are combined, sorted by date, and filtered by the selected output range.</p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="min-w-[1120px] w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      {['Source', 'Date', 'Location', 'Activity', 'Port h', 'STBD h', 'ME fuel', 'All AE fuel', 'Other fuel', 'Day total', 'Status', ''].map((heading, index) => (
                        <th key={`${heading}:${index}`} className="px-3 py-3 text-left font-semibold">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDailyLogs.map((daily) => (
                      <tr key={`${daily.source}:${daily.date}`} className="border-t border-border/40 hover:bg-muted/20">
                        <td className="px-3 py-2.5"><span className={cn('rounded-full px-2 py-1 text-[10px] font-semibold', daily.source === 'excel' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-sky-500/15 text-sky-300')}>{daily.source === 'excel' ? 'Excel' : 'Manual'}</span></td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium">{daily.date}</td>
                        <td className="px-3 py-2.5">{daily.location || '—'}</td>
                        <td className="px-3 py-2.5">{daily.activity || '—'}</td>
                        <td className="px-3 py-2.5 text-right">{numberFormat.format(daily.portHours)}</td>
                        <td className="px-3 py-2.5 text-right">{numberFormat.format(daily.starboardHours)}</td>
                        <td className="px-3 py-2.5 text-right">{numberFormat.format(daily.mainEngineFuel)}</td>
                        <td className="px-3 py-2.5 text-right text-sky-300">{numberFormat.format(daily.auxiliaryEngineFuel)}</td>
                        <td className="px-3 py-2.5 text-right">{numberFormat.format(daily.ancillaryFuel - daily.auxiliaryEngineFuel)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold">{numberFormat.format(daily.totalFuel)}</td>
                        <td className="px-3 py-2.5"><span className={cn('rounded-full px-2 py-1 text-[10px] font-semibold', daily.warnings.length > 0 ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300')}>{daily.warnings.length > 0 ? `${daily.warnings.length} warning${daily.warnings.length === 1 ? '' : 's'}` : 'Valid'}</span></td>
                        <td className="px-2 py-2">
                          {daily.source === 'manual' && (
                            <button type="button" aria-label={`Remove manual entry ${daily.date}`} onClick={() => setManualInputs((current) => current.filter((entry) => entry.date !== daily.date))} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="section-card rounded-2xl border border-border/80 bg-card/60 p-5 shadow-lg">
              <div className="mb-4">
                <h2 className="font-semibold">Voyage review</h2>
                <p className="mt-1 text-xs text-muted-foreground">Excel-derived fuel is shown automatically. Type directly into either fuel field to override it; use the reset icon to restore the calculation.</p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="min-w-[1580px] w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      {['Voyage', 'Cycle', 'From', 'To', 'Departure', 'Arrival', 'Hours', 'ME fuel (editable)', 'All AE fuel (editable)', 'Total', 'Distance', 'Speed', 'Fuel/nm', 'Status'].map((heading) => (
                        <th key={heading} className="px-2 py-3 text-left font-semibold">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVoyages.map((voyage) => {
                      const mainOverridden = voyage.mainEngineFuelOverride != null;
                      const auxiliaryOverridden = voyage.auxiliaryEngineFuelOverride != null;
                      return (
                        <tr key={voyage.id} className="border-t border-border/40 align-top hover:bg-muted/20">
                          <td className="px-2 py-2.5 font-semibold text-primary">{voyage.id}</td>
                          <td className="px-2 py-2.5">{voyage.cycle}</td>
                          <td className="px-1 py-1.5"><Input value={voyage.from} onChange={(event) => updateDefinition(voyage.id, 'from', event.target.value)} className="h-8 min-w-24 text-xs" /></td>
                          <td className="px-1 py-1.5"><Input value={voyage.to} onChange={(event) => updateDefinition(voyage.id, 'to', event.target.value)} className="h-8 min-w-24 text-xs" /></td>
                          <td className="px-1 py-1.5"><Input type="datetime-local" step="1" value={inputDateTime(voyage.departure)} onChange={(event) => { const value = isoDateTime(event.target.value); if (value) updateDefinition(voyage.id, 'departure', value); }} className="h-8 min-w-48 text-xs" /></td>
                          <td className="px-1 py-1.5"><Input type="datetime-local" step="1" value={inputDateTime(voyage.arrival)} onChange={(event) => { const value = isoDateTime(event.target.value); if (value) updateDefinition(voyage.id, 'arrival', value); }} className="h-8 min-w-48 text-xs" /></td>
                          <td className="px-2 py-2.5 text-right">{numberFormat.format(voyage.transitHours)}</td>
                          <td className="px-1 py-1.5">
                            <div className="flex min-w-36 items-center gap-1">
                              <Input type="number" min="0" step="0.01" value={voyage.mainEngineFuel} onChange={(event) => updateDefinition(voyage.id, 'mainEngineFuelOverride', parseNonNegative(event.target.value))} className={cn('h-8 text-right text-xs', mainOverridden && 'border-sky-500/60 bg-sky-500/5')} />
                              {mainOverridden && <button type="button" aria-label={`Restore calculated ME fuel for ${voyage.id}`} onClick={() => updateDefinition(voyage.id, 'mainEngineFuelOverride', null)} className="rounded p-1 text-sky-300 hover:bg-sky-500/10"><RotateCcw className="h-3.5 w-3.5" /></button>}
                            </div>
                          </td>
                          <td className="px-1 py-1.5">
                            <div className="flex min-w-36 items-center gap-1">
                              <Input type="number" min="0" step="0.01" value={voyage.auxiliaryEngineFuel} onChange={(event) => updateDefinition(voyage.id, 'auxiliaryEngineFuelOverride', parseNonNegative(event.target.value))} className={cn('h-8 text-right text-xs', auxiliaryOverridden && 'border-sky-500/60 bg-sky-500/5')} />
                              {auxiliaryOverridden && <button type="button" aria-label={`Restore calculated all AE fuel for ${voyage.id}`} onClick={() => updateDefinition(voyage.id, 'auxiliaryEngineFuelOverride', null)} className="rounded p-1 text-sky-300 hover:bg-sky-500/10"><RotateCcw className="h-3.5 w-3.5" /></button>}
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-right font-semibold">{numberFormat.format(voyage.totalFuel)}</td>
                          <td className="px-1 py-1.5"><Input type="number" min="0" step="0.01" value={voyage.distance} onChange={(event) => updateDefinition(voyage.id, 'distance', parseNonNegative(event.target.value))} className="h-8 w-24 text-right text-xs" /></td>
                          <td className="px-1 py-1.5"><Input type="number" min="0" step="0.01" value={voyage.averageSpeed} onChange={(event) => updateDefinition(voyage.id, 'averageSpeed', parseNonNegative(event.target.value))} className="h-8 w-20 text-right text-xs" /></td>
                          <td className="px-2 py-2.5 text-right">{numberFormat.format(voyage.fuelPerNauticalMile)}</td>
                          <td className="px-2 py-2.5"><span className={cn('rounded-full px-2 py-1 text-[10px] font-semibold', mainOverridden || auxiliaryOverridden ? 'bg-sky-500/15 text-sky-300' : voyage.warnings.length > 0 ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300')}>{mainOverridden || auxiliaryOverridden ? 'Manual override' : voyage.warnings.length > 0 ? `${voyage.warnings.length} issue${voyage.warnings.length === 1 ? '' : 's'}` : 'Ready'}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
