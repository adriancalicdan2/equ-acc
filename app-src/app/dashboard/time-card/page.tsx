'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext';
import { firestore } from '@/lib/firebase/client';
import {
  collection, doc, getDoc, setDoc, onSnapshot, query, orderBy
} from 'firebase/firestore';
import { format, getDaysInMonth, getDay } from 'date-fns';
import { Clock, Printer, Save, ChevronLeft, ChevronRight, Loader2, User, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────────────────────────
type DayStatus = 'Present' | 'Absent' | 'Rest Day' | 'Half-day';

interface DayEntry {
  date: string;       // YYYY-MM-DD
  status: DayStatus;
  timeIn: string;     // HH:mm (24h)
  timeOut: string;    // HH:mm (24h)
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDow(dateStr: string): number {
  return getDay(new Date(dateStr + 'T00:00:00'));
}

function calcHours(entry: DayEntry): number {
  if (entry.status === 'Absent' || entry.status === 'Rest Day') return 0;
  if (!entry.timeIn || !entry.timeOut) return 0;
  const [inH, inM] = entry.timeIn.split(':').map(Number);
  const [outH, outM] = entry.timeOut.split(':').map(Number);
  const mins = (outH * 60 + outM) - (inH * 60 + inM);
  if (mins <= 0) return 0;
  if (entry.status === 'Half-day') return Math.min(mins / 60, 5);
  return mins / 60;
}

function calcOT(entry: DayEntry, shiftHours: number): number {
  return Math.max(0, calcHours(entry) - shiftHours);
}

function fmt2(n: number) {
  return n.toFixed(2);
}

function buildPeriod1Dates(year: number, month: number): string[] {
  const dates: string[] = [];
  for (let d = 11; d <= 25; d++) {
    dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return dates;
}

function buildPeriod2Dates(year: number, month: number): string[] {
  const dates: string[] = [];
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  for (let d = 26; d <= daysInMonth; d++) {
    dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 12) { nextMonth = 1; nextYear++; }
  for (let d = 1; d <= 10; d++) {
    dates.push(`${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return dates;
}

function makeDefaultEntries(dates: string[], restDays: number[]): DayEntry[] {
  return dates.map(date => {
    const dow = getDow(date);
    const isRest = restDays.includes(dow);
    return {
      date,
      status: isRest ? 'Rest Day' : 'Present',
      timeIn: isRest ? '' : '08:00',
      timeOut: isRest ? '' : '18:00',
    };
  });
}

// ─── Sub-component: Period Table ─────────────────────────────────────────────
function PeriodTable({
  title, entries, shiftHours, restDays, onChange,
}: {
  title: string;
  entries: DayEntry[];
  shiftHours: number;
  restDays: number[];
  onChange: (entries: DayEntry[]) => void;
}) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const visibleEntries = entries.filter(e => e.date <= todayStr);

  const totalHours = visibleEntries.reduce((acc, e) => acc + calcHours(e), 0);
  const totalOT = visibleEntries.reduce((acc, e) => acc + calcOT(e, shiftHours), 0);

  const update = (visibleIdx: number, patch: Partial<DayEntry>) => {
    const targetEntry = visibleEntries[visibleIdx];
    const originalIdx = entries.findIndex(e => e.date === targetEntry.date);
    if (originalIdx !== -1) {
      onChange(entries.map((e, i) => (i === originalIdx ? { ...e, ...patch } : e)));
    }
  };

  const inputCls = 'bg-muted/40 border border-border/60 rounded px-2 h-8 text-xs text-foreground focus:border-primary/50 outline-none transition-all w-full';
  const selectCls = 'bg-muted/40 border border-border/60 rounded px-2 h-8 text-xs text-foreground focus:border-primary/50 outline-none transition-all w-full appearance-none';

  if (visibleEntries.length === 0) {
    return (
      <div className="period-table">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            {title}
          </h3>
        </div>
        <div className="flex flex-col items-center justify-center py-8 px-4 border border-dashed border-border/60 rounded-xl bg-muted/10 text-center">
          <Clock className="w-8 h-8 text-muted-foreground/40 mb-2" />
          <p className="text-xs font-semibold text-muted-foreground">This period has not started yet</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">Dates in this period are in the future.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="period-table">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          {title}
        </h3>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Total Hours: <span className="font-bold text-foreground">{fmt2(totalHours)}</span></span>
          <span>Total OT: <span className="font-bold text-amber-400">{fmt2(totalOT)}</span></span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full text-xs min-w-[680px]">
          <thead>
            <tr className="bg-muted/40 border-b border-border/60 text-muted-foreground font-semibold">
              <th className="px-3 py-2.5 text-left w-28">Date</th>
              <th className="px-3 py-2.5 text-left w-10">Day</th>
              <th className="px-3 py-2.5 text-left w-32">Status</th>
              <th className="px-3 py-2.5 text-left w-28">Time In</th>
              <th className="px-3 py-2.5 text-left w-28">Time Out</th>
              <th className="px-3 py-2.5 text-center w-24">Hours Worked</th>
              <th className="px-3 py-2.5 text-center w-20">OT Hours</th>
            </tr>
          </thead>
          <tbody>
            {visibleEntries.map((entry, idx) => {
              const dateObj = new Date(entry.date + 'T00:00:00');
              const dow = getDay(dateObj);
              const dayName = DAY_NAMES[dow];
              const isRestDay = restDays.includes(dow);
              const isRest = entry.status === 'Rest Day';
              const isAbsent = entry.status === 'Absent';
              const hrs = calcHours(entry);
              const ot = calcOT(entry, shiftHours);

              return (
                <tr
                  key={entry.date}
                  className={cn(
                    'border-b border-border/40 transition-colors',
                    isRest ? 'bg-muted/10 opacity-60' : 'hover:bg-muted/20',
                    isAbsent && 'bg-destructive/5'
                  )}
                >
                  <td className="px-3 py-2 font-medium text-foreground">
                    {format(dateObj, 'MMM d, yyyy')}
                  </td>
                  <td className={cn('px-3 py-2 font-semibold', isRestDay ? 'text-amber-400' : 'text-muted-foreground')}>
                    {dayName}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={entry.status}
                      onChange={e => {
                        const s = e.target.value as DayStatus;
                        update(idx, {
                          status: s,
                          timeIn: (s === 'Rest Day' || s === 'Absent') ? '' : (entry.timeIn || '08:00'),
                          timeOut: (s === 'Rest Day' || s === 'Absent') ? '' : (entry.timeOut || '18:00'),
                        });
                      }}
                      className={selectCls}
                    >
                      <option value="Present">Present</option>
                      <option value="Half-day">Half-day</option>
                      <option value="Absent">Absent</option>
                      <option value="Rest Day">Rest Day</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={entry.timeIn}
                      disabled={isRest || isAbsent}
                      onChange={e => update(idx, { timeIn: e.target.value })}
                      className={cn(inputCls, (isRest || isAbsent) && 'opacity-40 cursor-not-allowed')}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={entry.timeOut}
                      disabled={isRest || isAbsent}
                      onChange={e => update(idx, { timeOut: e.target.value })}
                      className={cn(inputCls, (isRest || isAbsent) && 'opacity-40 cursor-not-allowed')}
                    />
                  </td>
                  <td className="px-3 py-2 text-center font-semibold text-foreground">
                    {isRest || isAbsent ? <span className="text-muted-foreground">—</span> : fmt2(hrs)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn('font-semibold', ot > 0 ? 'text-amber-400' : 'text-muted-foreground')}>
                      {isRest || isAbsent ? '—' : fmt2(ot)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30 border-t-2 border-primary/30 font-bold text-foreground text-xs">
              <td colSpan={5} className="px-3 py-2.5 text-right">Period Total:</td>
              <td className="px-3 py-2.5 text-center text-primary">{fmt2(totalHours)}</td>
              <td className="px-3 py-2.5 text-center text-amber-400">{fmt2(totalOT)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function TimeCardPage() {
  const router = useRouter();
  const { user, displayName, shiftHours: myShiftHours, restDays: myRestDays, isAdmin, allowedViews, loading } = useAuth();

  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedUid, setSelectedUid] = useState<string>('');

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // Per-session overrides (synced from Firestore profile)
  const [shiftHours, setShiftHours] = useState(myShiftHours);
  const [restDays, setRestDays] = useState<number[]>(myRestDays);

  const [period1, setPeriod1] = useState<DayEntry[]>([]);
  const [period2, setPeriod2] = useState<DayEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'period1' | 'period2'>(
    now.getDate() >= 11 && now.getDate() <= 25 ? 'period1' : 'period2'
  );
  const [downloading, setDownloading] = useState(false);

  const p1Dates = buildPeriod1Dates(year, month);
  const p2Dates = buildPeriod2Dates(year, month);

  // Access check
  useEffect(() => {
    if (!loading && user && !isAdmin && allowedViews && !allowedViews.includes('time-card')) {
      toast.error('Access denied: Time Card not in your allowed views.');
      router.replace('/dashboard/equipment-accountability');
    }
  }, [user, isAdmin, allowedViews, loading, router]);

  // Sync own profile values
  useEffect(() => { setShiftHours(myShiftHours); }, [myShiftHours]);
  useEffect(() => { setRestDays(myRestDays); }, [myRestDays]);

  // Load employees for admin switcher
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(
      query(collection(firestore, 'users'), orderBy('displayName')),
      snap => setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [isAdmin]);

  const targetUid = isAdmin && selectedUid ? selectedUid : (user?.uid ?? '');
  const targetEmployee = isAdmin && selectedUid ? employees.find(e => e.id === selectedUid) : null;
  const targetName = targetEmployee?.displayName || displayName || user?.email || '';

  // Load time card + employee settings from Firestore
  const loadData = useCallback(async () => {
    if (!targetUid) return;
    setDataLoading(true);
    try {
      // Fetch employee profile for shiftHours & restDays
      const empSnap = await getDoc(doc(firestore, 'users', targetUid));
      let empShiftHours = myShiftHours;
      let empRestDays = myRestDays;
      if (empSnap.exists()) {
        const d = empSnap.data();
        empShiftHours = typeof d.shiftHours === 'number' ? d.shiftHours : myShiftHours;
        empRestDays = Array.isArray(d.restDays) ? d.restDays : myRestDays;
      }
      setShiftHours(empShiftHours);
      setRestDays(empRestDays);

      const key = `${year}-${String(month).padStart(2, '0')}`;
      const [p1Snap, p2Snap] = await Promise.all([
        getDoc(doc(firestore, 'timecards', targetUid, key, 'period1')),
        getDoc(doc(firestore, 'timecards', targetUid, key, 'period2')),
      ]);

      setPeriod1(p1Snap.exists() && p1Snap.data().entries
        ? p1Snap.data().entries as DayEntry[]
        : makeDefaultEntries(p1Dates, empRestDays));

      setPeriod2(p2Snap.exists() && p2Snap.data().entries
        ? p2Snap.data().entries as DayEntry[]
        : makeDefaultEntries(p2Dates, empRestDays));

    } catch (err: any) {
      toast.error('Failed to load time card: ' + err.message);
    } finally {
      setDataLoading(false);
    }
  }, [targetUid, year, month]);

  useEffect(() => { if (targetUid) loadData(); }, [loadData, targetUid]);

  // Reset when month changes — use current restDays
  useEffect(() => {
    setPeriod1(makeDefaultEntries(p1Dates, restDays));
    setPeriod2(makeDefaultEntries(p2Dates, restDays));
  }, [year, month]);

  const handleSave = async () => {
    if (!targetUid) return;
    setSaving(true);
    try {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      await Promise.all([
        setDoc(doc(firestore, 'timecards', targetUid, key, 'period1'), { entries: period1, shiftHours }),
        setDoc(doc(firestore, 'timecards', targetUid, key, 'period2'), { entries: period2, shiftHours }),
      ]);
      toast.success('Time card saved successfully!');
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (!targetUid) return;
    setDownloading(true);
    try {
      const res = await fetch('/api/generate-timecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeName: targetName,
          monthName,
          period1,
          period2,
          shiftHours,
          year,
          month,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to generate excel');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Timecard-${targetName.replace(/\s+/g, '-')}-${monthName.replace(/\s+/g, '-')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Excel downloaded successfully!');
    } catch (err: any) {
      toast.error('Download failed: ' + err.message);
    } finally {
      setDownloading(false);
    }
  };

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const grandHours = [...period1, ...period2].filter(e => e.date <= todayStr).reduce((acc, e) => acc + calcHours(e), 0);
  const grandOT = [...period1, ...period2].filter(e => e.date <= todayStr).reduce((acc, e) => acc + calcOT(e, shiftHours), 0);
  const monthName = format(new Date(year, month - 1, 1), 'MMMM yyyy');

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const restDayLabels = restDays.sort().map(d => DAY_NAMES[d]).join(', ') || 'None';

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .print-container { padding: 0 !important; }
          .period-table table { border: 1px solid #ccc; }
          .period-table th, .period-table td { border: 1px solid #ddd; color: black !important; }
          .period-table thead tr { background: #f0f0f0 !important; }
          .grand-totals-box { border: 2px solid #333 !important; color: black !important; background: #fafafa !important; }
        }
      `}</style>

      <div className="min-h-screen pb-16 print-container">
        {/* Header */}
        <div className="max-w-6xl mx-auto px-4 pt-10 pb-4 animate-fadeIn no-print">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-3">
            <Clock className="w-3.5 h-3.5" /> Time Card
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-foreground">Time Card</h1>
              <p className="text-muted-foreground text-sm mt-1">Track attendance, hours worked, and overtime per cutoff period.</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleDownloadExcel} disabled={downloading || !targetUid} variant="outline" className="h-9 px-4 text-xs border-amber-500/30 hover:bg-amber-500/10 text-amber-400 hover:text-amber-300 bg-transparent flex items-center gap-1.5">
                {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                Download Excel
              </Button>
              <Button onClick={() => window.print()} variant="outline" className="h-9 px-4 text-xs border-border hover:bg-muted text-foreground bg-transparent flex items-center gap-1.5">
                <Printer className="w-3.5 h-3.5" /> Print
              </Button>
              <Button onClick={handleSave} disabled={saving || !targetUid} className="h-9 px-4 text-xs bg-primary text-primary-foreground flex items-center gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Time Card
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 space-y-6">
          {/* Controls */}
          <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg no-print">
            <div className="flex flex-wrap gap-6 items-end">
              {isAdmin && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> View Employee
                  </label>
                  <select
                    value={selectedUid}
                    onChange={e => setSelectedUid(e.target.value)}
                    className="bg-muted/40 border border-border/60 rounded-lg px-3 h-9 text-xs text-foreground focus:border-primary/50 outline-none transition-all min-w-[200px]"
                  >
                    <option value="">— My Own Time Card —</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.displayName || emp.email}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cutoff Month</label>
                <div className="flex items-center gap-2">
                  <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-lg border border-border/60 bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-all">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-bold text-foreground w-36 text-center">{monthName}</span>
                  <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-lg border border-border/60 bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Period</label>
                <div className="flex bg-muted/40 p-1 rounded-lg border border-border/60 h-9 items-center">
                  <button
                    onClick={() => setSelectedPeriod('period1')}
                    className={cn(
                      "px-3 py-1 text-xs font-semibold rounded-md transition-all h-7 cursor-pointer",
                      selectedPeriod === 'period1'
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Period 1 (11-25)
                  </button>
                  <button
                    onClick={() => setSelectedPeriod('period2')}
                    className={cn(
                      "px-3 py-1 text-xs font-semibold rounded-md transition-all h-7 cursor-pointer",
                      selectedPeriod === 'period2'
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Period 2 (26-10)
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shift Hours (OT threshold)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={shiftHours}
                    disabled={!isAdmin}
                    onChange={e => setShiftHours(Number(e.target.value))}
                    className={cn(
                      "bg-muted/40 border border-border/60 rounded-lg px-3 h-9 text-xs text-foreground focus:border-primary/50 outline-none transition-all w-20 text-center",
                      !isAdmin && "opacity-60 cursor-not-allowed"
                    )}
                  />
                  <span className="text-xs text-muted-foreground">hours/day</span>
                  {!isAdmin && <span className="text-muted-foreground text-[10px] ml-1">(set by admin)</span>}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rest Days</label>
                <p className="text-xs text-foreground font-medium bg-muted/30 border border-border/60 rounded-lg px-3 h-9 flex items-center">
                  {restDayLabels}
                  {isAdmin && <span className="text-muted-foreground text-[10px] ml-2">(set in Admin → Employee)</span>}
                </p>
              </div>
            </div>
          </div>

          {/* Print header */}
          <div className="hidden print:block text-center border-b-2 border-black pb-4 mb-4">
            <h1 className="text-2xl font-extrabold">AIMF Tech. Corp.</h1>
            <h2 className="text-lg font-bold mt-1">Employee Time Card</h2>
            <p className="text-sm mt-1">Name: <strong>{targetName}</strong> &nbsp;|&nbsp; Period: <strong>{monthName}</strong> &nbsp;|&nbsp; Shift: <strong>{shiftHours}h/day</strong> &nbsp;|&nbsp; Rest Days: <strong>{restDayLabels}</strong></p>
          </div>

          {/* Employee Info */}
          <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg">
            <div className="flex flex-wrap gap-6 items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-bold text-primary uppercase">
                  {targetName?.[0] || 'U'}
                </div>
                <div>
                  <p className="font-bold text-foreground text-sm">{targetName || '—'}</p>
                  <p className="text-[11px] text-muted-foreground">{targetEmployee?.email || user?.email}</p>
                </div>
              </div>
              <div className="ml-auto flex flex-wrap gap-6 text-center">
                {[
                  { label: 'Cutoff Month', value: monthName, color: 'text-foreground' },
                  { label: 'Shift Hours', value: `${shiftHours}h / day`, color: 'text-foreground' },
                  { label: 'Rest Days', value: restDayLabels, color: 'text-amber-400' },
                  { label: 'Grand Total Hrs', value: fmt2(grandHours), color: 'text-primary' },
                  { label: 'Grand Total OT', value: fmt2(grandOT), color: 'text-amber-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="border-l border-border/60 pl-6 first:border-l-0 first:pl-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className={cn('text-sm font-bold mt-0.5', color)}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {dataLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
            </div>
          ) : (
            <>
              {/* Period 1 */}
              {selectedPeriod === 'period1' && (
                <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg">
                  <PeriodTable
                    title={`Period 1 — ${format(new Date(year, month - 1, 11), 'MMM d')} to ${format(new Date(year, month - 1, 25), 'MMM d, yyyy')}`}
                    entries={period1}
                    shiftHours={shiftHours}
                    restDays={restDays}
                    onChange={setPeriod1}
                  />
                </div>
              )}

              {/* Period 2 */}
              {selectedPeriod === 'period2' && (
                <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg">
                  <PeriodTable
                    title={`Period 2 — ${format(new Date(year, month - 1, 26), 'MMM d, yyyy')} to ${format(new Date(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 10), 'MMM d, yyyy')}`}
                    entries={period2}
                    shiftHours={shiftHours}
                    restDays={restDays}
                    onChange={setPeriod2}
                  />
                </div>
              )}

              {/* Grand Totals */}
              <div className="grand-totals-box bg-card/60 backdrop-blur-xl border-2 border-primary/30 rounded-2xl p-6 shadow-lg">
                <h3 className="font-bold text-sm text-foreground mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" /> Grand Totals — {monthName}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Period 1 Hours', value: fmt2(period1.filter(e => e.date <= todayStr).reduce((a, e) => a + calcHours(e), 0)), color: 'text-primary' },
                    { label: 'Period 1 OT', value: fmt2(period1.filter(e => e.date <= todayStr).reduce((a, e) => a + calcOT(e, shiftHours), 0)), color: 'text-amber-400' },
                    { label: 'Period 2 Hours', value: fmt2(period2.filter(e => e.date <= todayStr).reduce((a, e) => a + calcHours(e), 0)), color: 'text-primary' },
                    { label: 'Period 2 OT', value: fmt2(period2.filter(e => e.date <= todayStr).reduce((a, e) => a + calcOT(e, shiftHours), 0)), color: 'text-amber-400' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-muted/30 border border-border/40 rounded-xl p-4 text-center">
                      <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">{label}</p>
                      <p className={cn('text-2xl font-extrabold mt-1', color)}>{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-border/40 grid grid-cols-2 gap-4">
                  <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 text-center">
                    <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">Grand Total Hours Worked</p>
                    <p className="text-3xl font-extrabold text-primary mt-1">{fmt2(grandHours)}</p>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
                    <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">Grand Total OT Hours</p>
                    <p className="text-3xl font-extrabold text-amber-400 mt-1">{fmt2(grandOT)}</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end no-print">
                <Button onClick={handleSave} disabled={saving || !targetUid} className="h-10 px-6 text-sm bg-primary text-primary-foreground flex items-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Time Card
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
