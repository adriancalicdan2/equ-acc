'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Database,
  Download,
  FolderOpen,
  FileSpreadsheet,
  Gauge,
  Keyboard,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Ship,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authenticatedFetch } from '@/lib/firebase/authenticatedFetch';
import { useAuth } from '@/lib/firebase/AuthContext';
import {
  clearSavedVesselHistory,
  listSavedVesselHistories,
  loadSavedVesselHistory,
  saveVesselHistory,
  type SavedVesselHistorySummary,
} from '@/lib/voyage/vesselHistoryClient';
import { calculateVoyages } from '@/lib/voyage/calculations';
import { suggestVoyageDefinitions } from '@/lib/voyage/detection';
import {
  duplicateDailyLogDates,
  normalizeVesselVoyageDefinitions,
  vesselHistoryId,
} from '@/lib/voyage/history';
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
import { cleanVesselName, detectedVesselNames, vesselFileStem } from '@/lib/voyage/vessel';

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
    status: voyage.status ?? 'completed',
    source: voyage.source === 'suggested' ? 'suggested' : 'manual',
    confirmed: voyage.confirmed ?? true,
    interruptionReason: voyage.interruptionReason ?? '',
    mainEngineFuelOverride: voyage.mainEngineFuelOverride ?? null,
    otherFuelOverride: voyage.otherFuelOverride ?? voyage.auxiliaryEngineFuelOverride ?? null,
  };
}

function fullDateRange(records: DailyLogRecord[]) {
  const dates = records.map((record) => record.date).sort();
  return dates.length > 0 ? { from: dates[0], to: dates.at(-1) ?? dates[0] } : null;
}

function voyageOverlapsDates(definition: VoyageDefinition, dates: Set<string>) {
  const departure = Date.parse(definition.departure);
  const arrival = Date.parse(definition.arrival);
  if (!Number.isFinite(departure) || !Number.isFinite(arrival) || arrival <= departure) return false;
  return [...dates].some((date) => {
    const dayStart = Date.parse(`${date}T00:00:00.000Z`);
    const dayEnd = dayStart + 86_400_000;
    return departure < dayEnd && arrival > dayStart;
  });
}

function selectedDateSummary(dates: Set<string>) {
  const sorted = [...dates].sort();
  if (sorted.length === 0) return '';
  if (sorted.length <= 5) return sorted.join(', ');
  return `${sorted[0]} through ${sorted.at(-1)} (${sorted.length} selected dates)`;
}

function parseNonNegative(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

async function readApiJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(response.ok
      ? 'The server returned an invalid response.'
      : text.trim() || `Server request failed (${response.status}).`);
  }
}
export default function DualDailyLogsVoyagesPage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedLogs, setUploadedLogs] = useState<DailyLogRecord[]>([]);
  const [savedLogs, setSavedLogs] = useState<DailyLogRecord[]>([]);
  const [savedHistories, setSavedHistories] = useState<SavedVesselHistorySummary[]>([]);
  const [historySelection, setHistorySelection] = useState('');
  const [loadedHistoryId, setLoadedHistoryId] = useState('');
  const [manualInputs, setManualInputs] = useState<ManualDailyLogInput[]>([]);
  const [manualDraft, setManualDraft] = useState<ManualDailyLogInput>(EMPTY_MANUAL_ENTRY);
  const [vesselName, setVesselName] = useState('');
  const [definitions, setDefinitions] = useState<VoyageDefinition[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySaving, setHistorySaving] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [deletedSavedDateCount, setDeletedSavedDateCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const loadHistories = async () => {
      try {
        const histories = await listSavedVesselHistories();
        if (active) setSavedHistories(histories);
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : 'Unable to load saved vessel histories.');
        }
      }
    };
    void loadHistories();
    return () => { active = false; };
  }, [user]);

  const manualLogs = useMemo(
    () => manualInputs.map((input) => manualInputToDailyLog(input, vesselName)),
    [manualInputs, vesselName],
  );
  const detectedVessels = useMemo(
    () => detectedVesselNames(uploadedLogs),
    [uploadedLogs],
  );
  const dailyLogs = useMemo(
    () => [...savedLogs, ...uploadedLogs, ...manualLogs].sort((a, b) => a.date.localeCompare(b.date)),
    [manualLogs, savedLogs, uploadedLogs],
  );
  const pendingEntryCount = uploadedLogs.length + manualInputs.length;
  const loadedHistory = savedHistories.find((history) => history.id === loadedHistoryId);
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
  const visibleDailyDates = useMemo(
    () => filteredDailyLogs.map((daily) => daily.date),
    [filteredDailyLogs],
  );
  const allVisibleDatesSelected = visibleDailyDates.length > 0
    && visibleDailyDates.every((date) => selectedDates.has(date));
  const someVisibleDatesSelected = visibleDailyDates.some((date) => selectedDates.has(date));
  const hasUnsavedDataChanges = pendingEntryCount > 0 || deletedSavedDateCount > 0;
  const filteredVoyages = useMemo(
    () => rangeValid
      ? allVoyages.filter((voyage) => voyageInDateRange(voyage, dateFrom, dateTo))
      : allVoyages,
    [allVoyages, dateFrom, dateTo, rangeValid],
  );
  const downloadableVoyages = useMemo(
    () => filteredVoyages.filter((voyage) => voyage.confirmed !== false),
    [filteredVoyages],
  );
  const warnings = useMemo(() => [
    ...filteredDailyLogs.flatMap((daily) => daily.warnings.map((warning) => `${daily.date}: ${warning}`)),
    ...filteredVoyages.flatMap((voyage) => voyage.warnings.map((warning) => `${voyage.id}: ${warning}`)),
  ], [filteredDailyLogs, filteredVoyages]);
  const dailyTotals = useMemo(() => filteredDailyLogs.reduce(
    (totals, daily) => ({
      main: totals.main + daily.mainEngineFuel,
      other: totals.other + daily.ancillaryFuel,
      total: totals.total + daily.totalFuel,
    }),
    { main: 0, other: 0, total: 0 },
  ), [filteredDailyLogs]);
  const voyageTotals = useMemo(() => filteredVoyages.reduce(
    (totals, voyage) => ({
      main: totals.main + voyage.mainEngineFuel,
      other: totals.other + voyage.otherFuel,
      total: totals.total + voyage.totalFuel,
    }),
    { main: 0, other: 0, total: 0 },
  ), [filteredVoyages]);

  const applyFullRange = (records = dailyLogs) => {
    const range = fullDateRange(records);
    if (!range) return;
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const loadHistory = async () => {
    if (!historySelection) {
      toast.error('Choose a saved vessel first.');
      return;
    }
    if (hasUnsavedDataChanges && !window.confirm('Loading another vessel will discard the current unsaved changes. Continue?')) return;
    setHistoryLoading(true);
    try {
      const history = await loadSavedVesselHistory(historySelection);
      setLoadedHistoryId(history.id);
      setHistorySelection(history.id);
      setVesselName(history.vesselName);
      setSavedLogs(history.dailyLogs);
      setUploadedLogs([]);
      setManualInputs([]);
      setManualDraft(EMPTY_MANUAL_ENTRY);
      setFiles([]);
      setSelectedDates(new Set());
      setDeletedSavedDateCount(0);
      setDefinitions(history.definitions);
      const range = fullDateRange(history.dailyLogs);
      setDateFrom(range?.from ?? '');
      setDateTo(range?.to ?? '');
      if (history.removedLegacyVoyageCount) {
        toast.info(`${history.removedLegacyVoyageCount} legacy template voyage row${history.removedLegacyVoyageCount === 1 ? '' : 's'} removed. Daily logs were kept.`);
      }
      toast.success(`Loaded ${history.entryCount} saved daily entries for ${history.vesselName}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load the saved vessel.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const startNewHistory = () => {
    if (hasUnsavedDataChanges && !window.confirm('Starting a new vessel will discard the current unsaved changes. Continue?')) return;
    setHistorySelection('');
    setLoadedHistoryId('');
    setSavedLogs([]);
    setUploadedLogs([]);
    setManualInputs([]);
    setManualDraft(EMPTY_MANUAL_ENTRY);
    setFiles([]);
    setSelectedDates(new Set());
    setDeletedSavedDateCount(0);
    setVesselName('');
    setDefinitions([]);
    setDateFrom('');
    setDateTo('');
  };

  const saveHistory = async () => {
    if (!user) {
      toast.error('Sign in again before saving.');
      return;
    }
    if (!vesselName.trim()) {
      toast.error('Enter the vessel name before saving.');
      return;
    }
    if (loadedHistoryId && vesselHistoryId(vesselName) !== loadedHistoryId) {
      toast.error('The loaded vessel name was changed. Choose New vessel to save it separately.');
      return;
    }
    if (dailyLogs.length === 0 && !loadedHistoryId) {
      toast.error('Analyze Excel files or add a manual entry before saving.');
      return;
    }
    setHistorySaving(true);
    try {
      const result = await saveVesselHistory({
        vesselName,
        dailyLogs,
        definitions,
        replaceExisting: Boolean(loadedHistoryId),
      });
      const [history, histories] = await Promise.all([
        loadSavedVesselHistory(result.id),
        listSavedVesselHistories(),
      ]);
      setSavedHistories(histories);
      setHistorySelection(history.id);
      setLoadedHistoryId(history.id);
      setVesselName(history.vesselName);
      setSavedLogs(history.dailyLogs);
      setUploadedLogs([]);
      setManualInputs([]);
      setFiles([]);
      setSelectedDates(new Set());
      setDeletedSavedDateCount(0);
      const range = fullDateRange(history.dailyLogs);
      setDateFrom(range?.from ?? '');
      setDateTo(range?.to ?? '');
      if (result.deleted > 0) {
        toast.success(`Saved changes: ${result.deleted} date${result.deleted === 1 ? '' : 's'} deleted, ${result.added} added, ${result.total} remaining.`);
      } else {
        toast.success(result.added > 0
          ? `Saved ${result.added} new entr${result.added === 1 ? 'y' : 'ies'}; ${result.total} total for ${history.vesselName}.`
          : `No duplicate dates were added. ${result.total} saved entries remain.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save the vessel history.');
    } finally {
      setHistorySaving(false);
    }
  };

  const markAffectedVoyagesForReview = (dates: Set<string>) => {
    const affectedIds = new Set(
      definitions.filter((definition) => voyageOverlapsDates(definition, dates)).map((definition) => definition.id),
    );
    if (affectedIds.size === 0) return [] as string[];
    const reason = `Daily log deleted: ${selectedDateSummary(dates)}`;
    setDefinitions((current) => normalizeVesselVoyageDefinitions(current.map((definition) => (
      affectedIds.has(definition.id)
        ? {
            ...definition,
            confirmed: false,
            interruptionReason: definition.interruptionReason?.trim()
              ? `${definition.interruptionReason}; ${reason}`
              : reason,
          }
        : definition
    ))).definitions);
    return [...affectedIds];
  };

  const deleteDailyDates = (dates: Set<string>) => {
    const selectedRecords = dailyLogs.filter((daily) => dates.has(daily.date));
    if (selectedRecords.length === 0) {
      toast.error('Select at least one daily-log date.');
      return;
    }
    const affectedVoyages = definitions
      .filter((definition) => voyageOverlapsDates(definition, dates))
      .map((definition) => definition.id);
    const savedDateCount = savedLogs.filter((daily) => dates.has(daily.date)).length;
    const warning = [
      `Delete ${selectedRecords.length} date${selectedRecords.length === 1 ? '' : 's'} for ${vesselName.trim() || 'this vessel'}?`,
      `Dates: ${selectedDateSummary(dates)}.`,
      savedDateCount > 0 ? 'Click Save changes afterward to make saved-date deletions permanent.' : '',
      affectedVoyages.length > 0 ? `Affected voyages will return to Review: ${affectedVoyages.join(', ')}.` : '',
    ].filter(Boolean).join('\n\n');
    if (!window.confirm(warning)) return;

    const uploadedFileNames = new Set(
      uploadedLogs.filter((daily) => dates.has(daily.date)).map((daily) => daily.fileName),
    );
    setSavedLogs((current) => current.filter((daily) => !dates.has(daily.date)));
    setUploadedLogs((current) => current.filter((daily) => !dates.has(daily.date)));
    setManualInputs((current) => current.filter((entry) => !dates.has(entry.date)));
    setFiles((current) => current.filter((file) => !uploadedFileNames.has(file.name)));
    setSelectedDates((current) => new Set([...current].filter((date) => !dates.has(date))));
    if (savedDateCount > 0) setDeletedSavedDateCount((current) => current + savedDateCount);
    const reviewedVoyages = markAffectedVoyagesForReview(dates);
    const remainingRange = fullDateRange(dailyLogs.filter((daily) => !dates.has(daily.date)));
    setDateFrom(remainingRange?.from ?? '');
    setDateTo(remainingRange?.to ?? '');
    toast.success(savedDateCount > 0
      ? `Removed ${selectedRecords.length} date${selectedRecords.length === 1 ? '' : 's'}. Click Save changes to keep the deletion.`
      : `Removed ${selectedRecords.length} unsaved date${selectedRecords.length === 1 ? '' : 's'}.`);
    if (reviewedVoyages.length > 0) {
      toast.info(`${reviewedVoyages.join(', ')} marked for review after the daily-log change.`);
    }
  };

  const clearUnsavedEntries = () => {
    if (pendingEntryCount === 0) return;
    const dates = new Set([...uploadedLogs, ...manualLogs].map((daily) => daily.date));
    if (!window.confirm(`Clear ${pendingEntryCount} unsaved entr${pendingEntryCount === 1 ? 'y' : 'ies'}? Saved vessel dates will be kept.`)) return;
    markAffectedVoyagesForReview(dates);
    setUploadedLogs([]);
    setManualInputs([]);
    setManualDraft(EMPTY_MANUAL_ENTRY);
    setFiles([]);
    setSelectedDates((current) => new Set([...current].filter((date) => !dates.has(date))));
    const range = fullDateRange(savedLogs);
    setDateFrom(range?.from ?? '');
    setDateTo(range?.to ?? '');
    toast.success('Unsaved Excel and manual entries cleared. Saved dates were kept.');
  };

  const clearVesselHistory = async () => {
    if (!loadedHistoryId) return;
    const warning = [
      `Permanently clear the saved history for ${vesselName}?`,
      `This deletes ${savedLogs.length} saved daily log${savedLogs.length === 1 ? '' : 's'} and ${definitions.length} voyage row${definitions.length === 1 ? '' : 's'} from this browser.`,
      pendingEntryCount > 0 ? `It will also discard ${pendingEntryCount} unsaved entr${pendingEntryCount === 1 ? 'y' : 'ies'}.` : '',
      'Other vessels will not be affected.',
    ].filter(Boolean).join('\n\n');
    if (!window.confirm(warning)) return;
    setHistorySaving(true);
    try {
      await clearSavedVesselHistory(loadedHistoryId);
      const histories = await listSavedVesselHistories();
      setSavedHistories(histories);
      setHistorySelection('');
      setLoadedHistoryId('');
      setSavedLogs([]);
      setUploadedLogs([]);
      setManualInputs([]);
      setManualDraft(EMPTY_MANUAL_ENTRY);
      setFiles([]);
      setDefinitions([]);
      setSelectedDates(new Set());
      setDeletedSavedDateCount(0);
      setVesselName('');
      setDateFrom('');
      setDateTo('');
      toast.success('Vessel history cleared. Other vessels were not changed.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to clear the vessel history.');
    } finally {
      setHistorySaving(false);
    }
  };

  const toggleDailyDate = (date: string) => {
    setSelectedDates((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const toggleAllVisibleDates = () => {
    setSelectedDates((current) => {
      const next = new Set(current);
      if (allVisibleDatesSelected) visibleDailyDates.forEach((date) => next.delete(date));
      else visibleDailyDates.forEach((date) => next.add(date));
      return next;
    });
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
      const payload = await readApiJson<AnalysisResponse | { error?: string }>(response);
      if (!response.ok || !('dailyLogs' in payload)) {
        throw new Error('error' in payload ? payload.error : 'Analysis failed.');
      }
      const duplicates = duplicateDailyLogDates([...savedLogs, ...manualLogs], payload.dailyLogs);
      if (duplicates.length > 0) {
        throw new Error(`These dates already exist in the saved or manual history: ${duplicates.join(', ')}.`);
      }
      const combinedDates = [...savedLogs, ...payload.dailyLogs, ...manualLogs];
      const detected = detectedVesselNames(payload.dailyLogs);
      if (detected.length > 1) {
        throw new Error(`The uploaded files contain more than one vessel: ${detected.join(', ')}.`);
      }
      if (detected.length === 1 && savedLogs.length > 0
        && cleanVesselName(detected[0]).toLocaleLowerCase('en-US')
          !== cleanVesselName(vesselName).toLocaleLowerCase('en-US')) {
        throw new Error(`The uploaded files are for ${detected[0]}, not ${vesselName}.`);
      }
      if (detected.length === 1) {
        setVesselName((current) => current.trim() ? current : detected[0]);
      }
      setUploadedLogs(payload.dailyLogs);
      const analyzedDefinitions = normalizeVesselVoyageDefinitions(
        payload.voyages.map(voyageDefinition),
      ).definitions;
      if (!loadedHistoryId) setDefinitions(analyzedDefinitions);
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

  const addManualVoyage = () => {
    const range = fullDateRange(dailyLogs);
    if (!range) {
      toast.error('Add daily data before adding a voyage.');
      return;
    }
    const defaultDate = rangeValid ? dateFrom : range.from;
    setDefinitions((current) => normalizeVesselVoyageDefinitions([...current, {
      id: `V${current.length + 1}`,
      cycle: 1,
      displayCycle: true,
      from: '',
      to: '',
      departure: `${defaultDate}T00:00:00.000Z`,
      arrival: `${defaultDate}T23:59:59.000Z`,
      distance: 0,
      averageSpeed: 0,
      status: 'planned',
      source: 'manual',
      confirmed: false,
      interruptionReason: '',
      mainEngineFuelOverride: null,
      otherFuelOverride: null,
    }]).definitions);
  };

  const suggestVoyages = () => {
    const suggestions = suggestVoyageDefinitions(dailyLogs);
    if (suggestions.length === 0) {
      toast.error('No main-engine operating intervals were found. Add a voyage manually.');
      return;
    }
    setDefinitions((current) => {
      const preserved = current.filter((definition) => definition.source !== 'suggested');
      return normalizeVesselVoyageDefinitions([...preserved, ...suggestions]).definitions;
    });
    toast.success(`Created ${suggestions.length} unconfirmed voyage suggestion${suggestions.length === 1 ? '' : 's'}.`);
  };

  const mergeWithPreviousVoyage = (id: string) => {
    setDefinitions((current) => {
      const index = current.findIndex((definition) => definition.id === id);
      if (index <= 0) return current;
      const previous = current[index - 1];
      const selected = current[index];
      const merged = current
        .map((definition, definitionIndex) => definitionIndex === index - 1 ? {
          ...previous,
          arrival: selected.arrival,
          to: selected.to || previous.to,
          confirmed: false,
          interruptionReason: previous.interruptionReason || 'Merged after voyage interruption review',
        } : definition)
        .filter((_, definitionIndex) => definitionIndex !== index);
      return normalizeVesselVoyageDefinitions(merged).definitions;
    });
  };

  const generate = async () => {
    if (!vesselName.trim()) {
      toast.error('Enter the vessel name before generating.');
      return;
    }
    if (dailyLogs.length === 0 || definitions.length === 0) {
      toast.error('Add daily values and at least one voyage before generating.');
      return;
    }
    if (!rangeValid) {
      toast.error('Select a valid From and To date range.');
      return;
    }
    if (downloadableVoyages.length === 0) {
      toast.error('Confirm at least one voyage that overlaps the selected date range.');
      return;
    }
    setGenerating(true);
    try {
      const body = formDataWithFiles();
      body.append('vesselName', vesselName.trim());
      body.append('manualLogs', JSON.stringify(manualInputs));
      body.append('savedLogs', JSON.stringify(savedLogs));
      body.append('voyages', JSON.stringify(definitions));
      body.append('dateFrom', dateFrom);
      body.append('dateTo', dateTo);
      const response = await authenticatedFetch('/api/generate-voyage-report', { method: 'POST', body });
      if (!response.ok) {
        const payload = await readApiJson<{ error?: string }>(response);
        throw new Error(payload.error ?? 'Workbook generation failed.');
      }
      const generatedVoyageCount = Number(response.headers.get('X-AIMF-Voyage-Count'));
      const generatedDailyCount = Number(response.headers.get('X-AIMF-Daily-Count'));
      if (!Number.isInteger(generatedVoyageCount) || generatedVoyageCount !== downloadableVoyages.length) {
        throw new Error('The server did not verify the expected Voyage Summary rows. Please try the download again.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${vesselFileStem(vesselName)}-${dateFrom}-to-${dateTo}-${generatedVoyageCount}-voyages.xlsx`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      toast.success(`Downloaded ${generatedVoyageCount} populated Voyage Summary row${generatedVoyageCount === 1 ? '' : 's'} and ${generatedDailyCount} daily row${generatedDailyCount === 1 ? '' : 's'}.`);
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
                placeholder="Enter vessel name"
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

        <section className="section-card rounded-2xl border border-border/80 bg-card/60 p-5 shadow-lg">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-violet-500/15 p-2.5 text-violet-300"><Database className="h-5 w-5" /></span>
              <div>
                <h2 className="font-semibold">Saved vessel history</h2>
                <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
                  Saved on this browser for your signed-in account. Load a vessel, add the next month by Excel or manual entry, then save again.
                </p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
              <label className="min-w-64 flex-1 space-y-1 text-xs text-muted-foreground">
                Saved vessel
                <select
                  value={historySelection}
                  onChange={(event) => setHistorySelection(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="">{savedHistories.length === 0 ? 'No saved vessels yet' : 'Choose a vessel'}</option>
                  {savedHistories.map((history) => (
                    <option key={history.id} value={history.id}>
                      {history.vesselName} ({history.entryCount} days)
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <Button type="button" variant="outline" onClick={loadHistory} disabled={!historySelection || historyLoading} className="gap-2">
                  {historyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                  Load
                </Button>
                <Button type="button" variant="outline" onClick={startNewHistory}>New vessel</Button>
                <Button type="button" onClick={saveHistory} disabled={historySaving || (!loadedHistoryId && dailyLogs.length === 0) || !vesselName.trim()} className="gap-2">
                  {historySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {loadedHistoryId ? 'Save changes' : 'Save history'}
                </Button>
                <Button type="button" variant="outline" onClick={clearUnsavedEntries} disabled={historySaving || pendingEntryCount === 0}>Clear unsaved</Button>
                <Button type="button" variant="destructive" onClick={clearVesselHistory} disabled={historySaving || !loadedHistoryId}>Clear vessel history</Button>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {loadedHistory ? (
              <span className="rounded-full bg-violet-500/15 px-3 py-1.5 text-violet-200">
                Loaded: {loadedHistory.vesselName} / {savedLogs.length} saved days / {loadedHistory.firstDate} to {loadedHistory.lastDate}
              </span>
            ) : (
              <span className="rounded-full bg-muted/40 px-3 py-1.5 text-muted-foreground">No saved vessel loaded on this browser</span>
            )}
            {pendingEntryCount > 0 && (
              <span className="rounded-full bg-amber-500/15 px-3 py-1.5 text-amber-200">
                {pendingEntryCount} new unsaved entr{pendingEntryCount === 1 ? 'y' : 'ies'}
              </span>
            )}
            {deletedSavedDateCount > 0 && (
              <span className="rounded-full bg-red-500/15 px-3 py-1.5 text-red-200">
                {deletedSavedDateCount} saved date{deletedSavedDateCount === 1 ? '' : 's'} removed — click Save changes
              </span>
            )}
          </div>
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
              <label className="space-y-1 text-xs text-muted-foreground">Location / leg<Input value={manualDraft.location} onChange={(event) => updateManualDraft('location', event.target.value)} placeholder="Port / destination" /></label>
              <label className="space-y-1 text-xs text-muted-foreground">Activity<Input value={manualDraft.activity} onChange={(event) => updateManualDraft('activity', event.target.value)} placeholder="Transit / in port" /></label>
              <label className="space-y-1 text-xs text-muted-foreground">Port ME hours<Input type="number" min="0" max="24" step="0.01" value={manualDraft.portHours} onChange={(event) => updateManualDraft('portHours', parseNonNegative(event.target.value))} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">STBD ME hours<Input type="number" min="0" max="24" step="0.01" value={manualDraft.starboardHours} onChange={(event) => updateManualDraft('starboardHours', parseNonNegative(event.target.value))} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">ME fuel (L)<Input type="number" min="0" step="0.01" value={manualDraft.mainEngineFuel} onChange={(event) => updateManualDraft('mainEngineFuel', parseNonNegative(event.target.value))} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">Other Fuel — all AEs & other machines (L)<Input type="number" min="0" step="0.01" value={manualDraft.otherFuel} onChange={(event) => updateManualDraft('otherFuel', parseNonNegative(event.target.value))} /></label>
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
                  Selected output: {filteredDailyLogs.length} daily entr{filteredDailyLogs.length === 1 ? 'y' : 'ies'} and {downloadableVoyages.length} confirmed voyage{downloadableVoyages.length === 1 ? '' : 's'}.
                </p>
              )}
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Daily entries', value: String(filteredDailyLogs.length), note: `${savedLogs.length} saved / ${uploadedLogs.length} new Excel / ${manualInputs.length} new manual` },
                { label: 'Daily total fuel', value: `${numberFormat.format(dailyTotals.total)} L`, note: `${numberFormat.format(dailyTotals.main)} L main engines` },
                { label: 'Voyage total fuel', value: `${numberFormat.format(voyageTotals.total)} L`, note: `${numberFormat.format(voyageTotals.other)} L Other Fuel` },
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
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="font-semibold">Daily log review</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Select one date, several dates, or every visible row. Saved-date deletions become permanent after Save changes.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{selectedDates.size} date{selectedDates.size === 1 ? '' : 's'} selected</span>
                  <Button type="button" variant="outline" onClick={() => setSelectedDates(new Set())} disabled={selectedDates.size === 0}>Clear selection</Button>
                  <Button type="button" variant="destructive" onClick={() => deleteDailyDates(new Set(selectedDates))} disabled={selectedDates.size === 0} className="gap-2"><Trash2 className="h-4 w-4" />Delete selected</Button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="min-w-[1120px] w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="w-10 px-3 py-3 text-left">
                        <input
                          type="checkbox"
                          aria-label="Select all visible daily logs"
                          checked={allVisibleDatesSelected}
                          ref={(element) => { if (element) element.indeterminate = someVisibleDatesSelected && !allVisibleDatesSelected; }}
                          onChange={toggleAllVisibleDates}
                          className="h-4 w-4 accent-primary"
                        />
                      </th>
                      {['Source', 'Date', 'Location', 'Activity', 'Port h', 'STBD h', 'ME fuel', 'Other Fuel', 'Day total', 'Status', 'Actions'].map((heading, index) => (
                        <th key={`${heading}:${index}`} className="px-3 py-3 text-left font-semibold">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDailyLogs.map((daily) => (
                      <tr key={`${daily.source}:${daily.date}`} className={cn('border-t border-border/40 hover:bg-muted/20', selectedDates.has(daily.date) && 'bg-primary/5')}>
                        <td className="px-3 py-2.5"><input type="checkbox" aria-label={`Select daily log ${daily.date}`} checked={selectedDates.has(daily.date)} onChange={() => toggleDailyDate(daily.date)} className="h-4 w-4 accent-primary" /></td>
                        <td className="px-3 py-2.5"><span className={cn('rounded-full px-2 py-1 text-[10px] font-semibold', daily.source === 'excel' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-sky-500/15 text-sky-300')}>{daily.source === 'excel' ? 'Excel' : 'Manual'}</span></td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium">{daily.date}</td>
                        <td className="px-3 py-2.5">{daily.location || '—'}</td>
                        <td className="px-3 py-2.5">{daily.activity || '—'}</td>
                        <td className="px-3 py-2.5 text-right">{numberFormat.format(daily.portHours)}</td>
                        <td className="px-3 py-2.5 text-right">{numberFormat.format(daily.starboardHours)}</td>
                        <td className="px-3 py-2.5 text-right">{numberFormat.format(daily.mainEngineFuel)}</td>
                        <td className="px-3 py-2.5 text-right text-sky-300">{numberFormat.format(daily.ancillaryFuel)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold">{numberFormat.format(daily.totalFuel)}</td>
                        <td className="px-3 py-2.5"><span className={cn('rounded-full px-2 py-1 text-[10px] font-semibold', daily.warnings.length > 0 ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300')}>{daily.warnings.length > 0 ? `${daily.warnings.length} warning${daily.warnings.length === 1 ? '' : 's'}` : 'Valid'}</span></td>
                        <td className="px-2 py-2">
                          <button type="button" aria-label={`Delete daily log ${daily.date}`} onClick={() => deleteDailyDates(new Set([daily.date]))} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="section-card rounded-2xl border border-border/80 bg-card/60 p-5 shadow-lg">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="font-semibold">Voyage review & confirmation</h2>
                  <p className="mt-1 max-w-4xl text-xs text-muted-foreground">
                    Main-engine activity can suggest a window, but it never starts, ends, or splits a voyage without your confirmation.
                    If one ME is stopped, the other ME keeps the voyage running. Gaps inside a confirmed window are shown as interruptions.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={suggestVoyages} className="gap-2"><Gauge className="h-4 w-4" />Suggest from ME activity</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (definitions.length === 0) return;
                      if (!window.confirm('Clear all voyage rows for this vessel? Daily logs will be kept.')) return;
                      setDefinitions([]);
                      toast.success('Voyages reset. Daily logs were not changed.');
                    }}
                    className="gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />Reset voyages
                  </Button>
                  <Button type="button" onClick={addManualVoyage} className="gap-2"><Plus className="h-4 w-4" />Add voyage</Button>
                </div>
              </div>
              {definitions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No voyage yet. Add one manually or create reviewable suggestions from the uploaded ME intervals.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border/60">
                  <table className="min-w-[2260px] w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        {['Voyage', 'Confirmed', 'Cycle', 'From', 'To', 'Departure', 'Arrival', 'Window h', 'ME running h', 'Gap h', 'ME fuel (editable)', 'Other Fuel (editable)', 'Total', 'Distance', 'Speed', 'Fuel/nm', 'Voyage status', 'Interruption / change reason', 'Actions'].map((heading) => (
                          <th key={heading} className="px-2 py-3 text-left font-semibold">{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVoyages.map((voyage, voyageIndex) => {
                        const mainOverridden = voyage.mainEngineFuelOverride != null;
                        const otherOverridden = voyage.otherFuelOverride != null || voyage.auxiliaryEngineFuelOverride != null;
                        return (
                          <tr key={voyage.id} className="border-t border-border/40 align-top hover:bg-muted/20">
                            <td className="px-2 py-2.5">
                              <p className="font-semibold text-primary">{voyage.id}</p>
                              <p className="mt-1 text-[10px] uppercase text-muted-foreground">{voyage.source ?? 'saved'}</p>
                            </td>
                            <td className="px-2 py-2.5">
                              <label className="inline-flex items-center gap-2 whitespace-nowrap">
                                <input type="checkbox" checked={voyage.confirmed !== false} onChange={(event) => updateDefinition(voyage.id, 'confirmed', event.target.checked)} className="h-4 w-4 accent-primary" />
                                {voyage.confirmed !== false ? 'Yes' : 'Review'}
                              </label>
                            </td>
                            <td className="px-2 py-2.5">{voyage.cycle}</td>
                            <td className="px-1 py-1.5"><Input value={voyage.from} onChange={(event) => updateDefinition(voyage.id, 'from', event.target.value)} className="h-8 min-w-24 text-xs" /></td>
                            <td className="px-1 py-1.5"><Input value={voyage.to} onChange={(event) => updateDefinition(voyage.id, 'to', event.target.value)} className="h-8 min-w-24 text-xs" /></td>
                            <td className="px-1 py-1.5"><Input type="datetime-local" step="1" value={inputDateTime(voyage.departure)} onChange={(event) => { const value = isoDateTime(event.target.value); if (value) updateDefinition(voyage.id, 'departure', value); }} className="h-8 min-w-48 text-xs" /></td>
                            <td className="px-1 py-1.5"><Input type="datetime-local" step="1" value={inputDateTime(voyage.arrival)} onChange={(event) => { const value = isoDateTime(event.target.value); if (value) updateDefinition(voyage.id, 'arrival', value); }} className="h-8 min-w-48 text-xs" /></td>
                            <td className="px-2 py-2.5 text-right">{numberFormat.format(voyage.transitHours)}</td>
                            <td className="px-2 py-2.5 text-right text-emerald-300">{numberFormat.format(voyage.mainEngineRunningHours)}</td>
                            <td className={cn('px-2 py-2.5 text-right', voyage.interruptionHours > 0 && 'text-amber-300')}>{numberFormat.format(voyage.interruptionHours)}</td>
                            <td className="px-1 py-1.5">
                              <div className="flex min-w-36 items-center gap-1">
                                <Input type="number" min="0" step="0.01" value={voyage.mainEngineFuel} onChange={(event) => updateDefinition(voyage.id, 'mainEngineFuelOverride', parseNonNegative(event.target.value))} className={cn('h-8 text-right text-xs', mainOverridden && 'border-sky-500/60 bg-sky-500/5')} />
                                {mainOverridden && <button type="button" aria-label={`Restore calculated ME fuel for ${voyage.id}`} onClick={() => updateDefinition(voyage.id, 'mainEngineFuelOverride', null)} className="rounded p-1 text-sky-300 hover:bg-sky-500/10"><RotateCcw className="h-3.5 w-3.5" /></button>}
                              </div>
                            </td>
                            <td className="px-1 py-1.5">
                              <div className="flex min-w-36 items-center gap-1">
                                <Input type="number" min="0" step="0.01" value={voyage.otherFuel} onChange={(event) => updateDefinition(voyage.id, 'otherFuelOverride', parseNonNegative(event.target.value))} className={cn('h-8 text-right text-xs', otherOverridden && 'border-sky-500/60 bg-sky-500/5')} />
                                {otherOverridden && <button type="button" aria-label={`Restore calculated Other Fuel for ${voyage.id}`} onClick={() => { updateDefinition(voyage.id, 'otherFuelOverride', null); updateDefinition(voyage.id, 'auxiliaryEngineFuelOverride', null); }} className="rounded p-1 text-sky-300 hover:bg-sky-500/10"><RotateCcw className="h-3.5 w-3.5" /></button>}
                              </div>
                            </td>
                            <td className="px-2 py-2.5 text-right font-semibold">{numberFormat.format(voyage.totalFuel)}</td>
                            <td className="px-1 py-1.5"><Input type="number" min="0" step="0.01" value={voyage.distance} onChange={(event) => updateDefinition(voyage.id, 'distance', parseNonNegative(event.target.value))} className="h-8 w-24 text-right text-xs" /></td>
                            <td className="px-1 py-1.5"><Input type="number" min="0" step="0.01" value={voyage.averageSpeed} onChange={(event) => updateDefinition(voyage.id, 'averageSpeed', parseNonNegative(event.target.value))} className="h-8 w-20 text-right text-xs" /></td>
                            <td className="px-2 py-2.5 text-right">{numberFormat.format(voyage.fuelPerNauticalMile)}</td>
                            <td className="px-1 py-1.5">
                              <select value={voyage.status ?? 'planned'} onChange={(event) => updateDefinition(voyage.id, 'status', event.target.value as NonNullable<VoyageDefinition['status']>)} className="h-8 min-w-28 rounded-md border border-input bg-background px-2 text-xs">
                                <option value="planned">Planned</option><option value="underway">Underway</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="aborted">Aborted</option>
                              </select>
                            </td>
                            <td className="px-1 py-1.5"><Input value={voyage.interruptionReason ?? ''} onChange={(event) => updateDefinition(voyage.id, 'interruptionReason', event.target.value)} placeholder={voyage.interruptionHours > 0 ? 'Explain interruption / gap' : 'Optional note'} className="h-8 min-w-56 text-xs" /></td>
                            <td className="px-2 py-2">
                              <div className="flex gap-1">
                                <Button type="button" variant="outline" size="sm" disabled={voyageIndex === 0} onClick={() => mergeWithPreviousVoyage(voyage.id)} className="h-8 px-2 text-[10px]">Merge previous</Button>
                                <button type="button" aria-label={`Delete ${voyage.id}`} onClick={() => setDefinitions((current) => normalizeVesselVoyageDefinitions(
                                  current.filter((definition) => definition.id !== voyage.id),
                                ).definitions)} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
