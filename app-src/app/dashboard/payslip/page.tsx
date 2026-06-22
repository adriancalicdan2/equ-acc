'use client';

import { useState, useEffect, useRef } from 'react';
import { calculatePayroll, PayrollInput, PayrollResult } from '@/lib/payrollCalc';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Printer, RefreshCw, FileText, User, Calendar, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/firebase/AuthContext';
import { firestore } from '@/lib/firebase/client';
import { collection, onSnapshot, query, orderBy, doc, getDoc } from 'firebase/firestore';

interface PayslipFormState {
  dateOfJoining: string;
  employeeName: string;
  payPeriod: string;
  designation: string;
  workedDays: string;
  department: string;
  basic: string; // Keep as string for empty placeholder support
  incentivePay: string;
  overtime: string;
  otherEarnings: string;
  absences: string;
  otherDeductions: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function PayslipPage() {
  const { isAdmin, user } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedUid, setSelectedUid] = useState<string>('');
  
  // Date/Period filters
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [period, setPeriod] = useState<'period1' | 'period2'>(
    now.getDate() >= 11 && now.getDate() <= 25 ? 'period1' : 'period2'
  );

  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [fetchingTimecard, setFetchingTimecard] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [form, setForm] = useState<PayslipFormState>({
    dateOfJoining: '',
    employeeName: '',
    payPeriod: '',
    designation: '',
    workedDays: '',
    department: '',
    basic: '',
    incentivePay: '',
    overtime: '',
    otherEarnings: '',
    absences: '',
    otherDeductions: '',
  });

  const [timecardHours, setTimecardHours] = useState({
    otHoursSum: 0,
    scheduledRestDayHours: 0,
    scheduledRestDayOTHours: 0,
    specialHolidayRestDayHours: 0,
    specialHolidayRestDayOTHours: 0,
    regularHolidayRestDayHours: 0,
    regularHolidayRestDayOTHours: 0,
    regularHolidayWorkedCount: 0,
    specialHolidayWorkedCount: 0,
    absentDaysCount: 0,
    empShiftHours: 10,
    annualFactor: 261,
  });

  const previewRef = useRef<HTMLDivElement>(null);

  // Subscribe to employee directory for dropdown list
  useEffect(() => {
    const q = query(collection(firestore, 'users'), orderBy('displayName', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const emps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEmployees(emps);
      // Auto-select current logged-in user initially
      if (user?.uid && !selectedUid) {
        setSelectedUid(user.uid);
      }
    }, (err) => {
      console.error('Error fetching users:', err);
    });
    return () => unsubscribe();
  }, [user]);

  // Main effect to fetch Timecard data and update auto-calculations
  useEffect(() => {
    if (!selectedUid) return;

    async function fetchTimecardAndProfile() {
      setFetchingTimecard(true);
      try {
        // 1. Fetch employee details (Joining date, department, designation, etc.)
        const userDocRef = doc(firestore, 'users', selectedUid);
        const userSnap = await getDoc(userDocRef);
        let empName = '';
        let empDept = '';
        let empDesig = '';
        let empJoined = '';
        let empRestDays = [0, 6]; // Default to 5-day workweek (Sunday and Saturday rest days)

        if (userSnap.exists()) {
          const userData = userSnap.data();
          empName = userData.displayName || '';
          empDept = userData.department || 'Operations';
          empDesig = userData.designation || 'Technician';
          empJoined = userData.dateOfJoining || userData.createdAt?.toDate?.()?.toLocaleDateString() || '';
          if (Array.isArray(userData.restDays)) {
            empRestDays = userData.restDays;
          }
        }

        const annualFactor = (7 - empRestDays.length) >= 6 ? 313 : 261;

        // 2. Fetch Timecard document
        const key = `${year}-${String(month).padStart(2, '0')}`;
        const timecardDocRef = doc(firestore, 'timecards', selectedUid, key, period);
        const timecardSnap = await getDoc(timecardDocRef);

        let workedDaysCount = 0;
        let absentDaysCount = 0;
        let otHoursSum = 0;
        let regularHolidayWorkedCount = 0;
        let specialHolidayWorkedCount = 0;
        let scheduledRestDayHours = 0;
        let scheduledRestDayOTHours = 0;
        let specialHolidayRestDayHours = 0;
        let specialHolidayRestDayOTHours = 0;
        let regularHolidayRestDayHours = 0;
        let regularHolidayRestDayOTHours = 0;
        let empShiftHours = 10; // Default threshold

        if (timecardSnap.exists()) {
          const tcData = timecardSnap.data();
          empShiftHours = tcData.shiftHours || 10;
          const entries = (tcData.entries || []) as any[];

          // Helper to calculate hours worked
          const getEntryHours = (entry: any) => {
            if (entry.status === 'Absent' || entry.status === 'Holiday No Work') return 0;
            if (!entry.timeIn || !entry.timeOut) return 0;
            const [inH, inM] = entry.timeIn.split(':').map(Number);
            const [outH, outM] = entry.timeOut.split(':').map(Number);
            const mins = (outH * 60 + outM) - (inH * 60 + inM);
            if (mins <= 0) return 0;
            if (entry.status === 'Half-day') return Math.min(mins / 60, 5);
            return mins / 60;
          };

          entries.forEach(entry => {
            const hrs = getEntryHours(entry);

            if (entry.status === 'Present') {
              workedDaysCount += 1;
              const ot = Math.max(0, hrs - empShiftHours);
              otHoursSum += ot;
            } else if (entry.status === 'Half-day') {
              workedDaysCount += 0.5;
              const ot = Math.max(0, hrs - empShiftHours);
              otHoursSum += ot;
            } else if (entry.status === 'Holiday' || entry.status === 'Regular Holiday') {
              workedDaysCount += 1;
              if (hrs > 0) regularHolidayWorkedCount += 1;
              const ot = Math.max(0, hrs - empShiftHours);
              otHoursSum += ot;
            } else if (entry.status === 'Special Holiday') {
              workedDaysCount += 1;
              if (hrs > 0) specialHolidayWorkedCount += 1;
              const ot = Math.max(0, hrs - empShiftHours);
              otHoursSum += ot;
            } else if (entry.status === 'Holiday No Work') {
              workedDaysCount += 1;
            } else if (entry.status === 'Absent') {
              absentDaysCount += 1;
            } else if (
              entry.status === 'Rest Day' ||
              entry.status === 'Special Holiday on Rest Day' ||
              entry.status === 'Regular Holiday on Rest Day'
            ) {
              if (hrs > 0) {
                workedDaysCount += 1;
                const restHrs = hrs >= 5 ? hrs - 1 : hrs;
                const threshold = Math.max(1, empShiftHours - 1);
                const normHrs = Math.min(threshold, restHrs);
                const otHrs = Math.max(0, restHrs - threshold);

                if (entry.status === 'Rest Day') {
                  scheduledRestDayHours += normHrs;
                  scheduledRestDayOTHours += otHrs;
                } else if (entry.status === 'Special Holiday on Rest Day') {
                  specialHolidayRestDayHours += normHrs;
                  specialHolidayRestDayOTHours += otHrs;
                } else if (entry.status === 'Regular Holiday on Rest Day') {
                  regularHolidayRestDayHours += normHrs;
                  regularHolidayRestDayOTHours += otHrs;
                }
              }
            }
          });
        }

        setTimecardHours({
          otHoursSum,
          scheduledRestDayHours,
          scheduledRestDayOTHours,
          specialHolidayRestDayHours,
          specialHolidayRestDayOTHours,
          regularHolidayRestDayHours,
          regularHolidayRestDayOTHours,
          regularHolidayWorkedCount,
          specialHolidayWorkedCount,
          absentDaysCount,
          empShiftHours,
          annualFactor,
        });

        // 3. Format period string
        const periodStr = `${MONTH_NAMES[month - 1]} ${year} (${period === 'period1' ? '11th-25th' : '26th-10th'})`;

        // Update form state (Keeping numeric entries blank/placeholder, auto-filled with suggestions if salary is entered)
        setForm(prev => {
          const monthlyBasic = parseFloat(prev.basic) || 0;
          let calculatedOvertime = 0;
          let calculatedAbsences = 0;

          if (monthlyBasic > 0) {
            const dailyRate = (monthlyBasic * 12) / annualFactor;
            const totalNormalHours = Math.max(1, empShiftHours - 1);
            const hourlyRate = dailyRate / totalNormalHours;
            
            const otRate = hourlyRate * 1.25;

            const otPay = otHoursSum * otRate;
            const regularHolidayPay = regularHolidayWorkedCount * (dailyRate * 2.0);
            const specialHolidayPay = specialHolidayWorkedCount * (dailyRate * 1.30);

            // Rest Day Payouts
            const scheduledRestDayPay = (scheduledRestDayHours * (hourlyRate * 1.30)) + (scheduledRestDayOTHours * (hourlyRate * 1.69));
            const specialHolidayRestDayPay = (specialHolidayRestDayHours * (hourlyRate * 1.50)) + (specialHolidayRestDayOTHours * (hourlyRate * 1.95));
            const regularHolidayRestDayPay = (regularHolidayRestDayHours * (hourlyRate * 2.60)) + (regularHolidayRestDayOTHours * (hourlyRate * 3.38));

            calculatedOvertime = Math.round((otPay + regularHolidayPay + specialHolidayPay + scheduledRestDayPay + specialHolidayRestDayPay + regularHolidayRestDayPay) * 100) / 100;
            calculatedAbsences = Math.round((absentDaysCount * dailyRate) * 100) / 100;
          }

          return {
            ...prev,
            employeeName: empName,
            department: empDept,
            designation: empDesig,
            dateOfJoining: empJoined,
            payPeriod: periodStr,
            workedDays: workedDaysCount > 0 ? String(workedDaysCount) : '',
            overtime: calculatedOvertime > 0 ? String(calculatedOvertime) : '',
            absences: calculatedAbsences > 0 ? String(calculatedAbsences) : '',
          };
        });

      } catch (err: any) {
        toast.error('Error fetching timecard info: ' + err.message);
      } finally {
        setFetchingTimecard(false);
      }
    }

    fetchTimecardAndProfile();
  }, [selectedUid, year, month, period]);

  // Triggered when basic monthly salary is adjusted to compute rates live
  const handleBasicSalaryChange = (basicSalaryStr: string) => {
    const monthlyBasic = parseFloat(basicSalaryStr) || 0;
    setForm(prev => {
      let calculatedOvertime = 0;
      let calculatedAbsences = 0;

      // Re-run the calculations if basic changes
      if (monthlyBasic > 0) {
        const dailyRate = (monthlyBasic * 12) / timecardHours.annualFactor;
        const totalNormalHours = Math.max(1, timecardHours.empShiftHours - 1);
        const hourlyRate = dailyRate / totalNormalHours;
        
        const otRate = hourlyRate * 1.25;

        const otPay = timecardHours.otHoursSum * otRate;
        const regularHolidayPay = timecardHours.regularHolidayWorkedCount * (dailyRate * 2.0);
        const specialHolidayPay = timecardHours.specialHolidayWorkedCount * (dailyRate * 1.30);

        // Rest Day Payouts
        const scheduledRestDayPay = (timecardHours.scheduledRestDayHours * (hourlyRate * 1.30)) + (timecardHours.scheduledRestDayOTHours * (hourlyRate * 1.69));
        const specialHolidayRestDayPay = (timecardHours.specialHolidayRestDayHours * (hourlyRate * 1.50)) + (timecardHours.specialHolidayRestDayOTHours * (hourlyRate * 1.95));
        const regularHolidayRestDayPay = (timecardHours.regularHolidayRestDayHours * (hourlyRate * 2.60)) + (timecardHours.regularHolidayRestDayOTHours * (hourlyRate * 3.38));

        calculatedOvertime = Math.round((otPay + regularHolidayPay + specialHolidayPay + scheduledRestDayPay + specialHolidayRestDayPay + regularHolidayRestDayPay) * 100) / 100;
        calculatedAbsences = Math.round((timecardHours.absentDaysCount * dailyRate) * 100) / 100;
      }

      return {
        ...prev,
        basic: basicSalaryStr,
        overtime: calculatedOvertime > 0 ? String(calculatedOvertime) : '',
        absences: calculatedAbsences > 0 ? String(calculatedAbsences) : '',
      };
    });
  };

  // Compute live payroll result
  const payrollInput: PayrollInput = {
    basic: parseFloat(form.basic) || 0,
    incentivePay: parseFloat(form.incentivePay) || 0,
    overtime: parseFloat(form.overtime) || 0,
    otherEarnings: parseFloat(form.otherEarnings) || 0,
    absences: parseFloat(form.absences) || 0,
    otherDeductions: parseFloat(form.otherDeductions) || 0,
  };

  const results: PayrollResult = calculatePayroll(payrollInput);

  // Reset form to completely empty
  const handleClear = () => {
    setForm({
      dateOfJoining: '',
      employeeName: '',
      payPeriod: '',
      designation: '',
      workedDays: '',
      department: '',
      basic: '',
      incentivePay: '',
      overtime: '',
      otherEarnings: '',
      absences: '',
      otherDeductions: '',
    });
    toast.success('Form cleared.');
  };

  // Trigger PDF download of the exact preview
  const handleDownloadPDF = () => {
    if (!form.employeeName) {
      toast.error('Please select or specify an employee first');
      return;
    }
    const element = previewRef.current;
    if (!element) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print/download PDF');
      return;
    }

    // Copy the styles of the current page so layout looks identical
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(el => el.outerHTML)
      .join('\n');

    const content = element.innerHTML;

    printWindow.document.write(`
      <html>
        <head>
          <title>Payslip-${form.employeeName.replace(/\s+/g, '_')}</title>
          ${styles}
          <style>
            @page {
              margin: 0;
            }
            body {
              background: white !important;
              color: black !important;
              padding: 2cm !important;
              margin: 0 !important;
            }
            .printable-payslip {
              width: 100% !important;
              max-width: 100% !important;
              border: none !important;
              box-shadow: none !important;
              padding: 0 !important;
              margin: 0 !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .print-hidden {
              display: none !important;
              visibility: hidden !important;
            }
          </style>
        </head>
        <body>
          <div class="printable-payslip">
            ${content}
          </div>
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

  // Trigger Excel download
  const handleDownload = async () => {
    if (!form.employeeName) {
      toast.error('Please select or specify an employee first');
      return;
    }
    setDownloading(true);
    try {
      const res = await fetch('/api/generate-payslip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        throw new Error('Failed to generate spreadsheet file');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Payslip-${form.employeeName.replace(/\s+/g, '_')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Spreadsheet generated and downloaded!');
    } catch (err: any) {
      toast.error(err.message || 'Error occurred during generation');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <style>{`
        @media print {
          @page {
            margin: 0;
          }
          body {
            background: white !important;
            color: black !important;
          }
          /* Hide all screen elements */
          body * {
            visibility: hidden;
          }
          /* Show only the payslip preview card and its contents */
          .printable-payslip, .printable-payslip * {
            visibility: visible;
          }
          /* Position the payslip card to fill the paper correctly with margins */
          .printable-payslip {
            position: absolute;
            left: 2cm !important;
            top: 2cm !important;
            width: calc(100% - 4cm) !important;
            max-width: none !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            color: black !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print-hidden {
            display: none !important;
            visibility: hidden !important;
          }
        }
      `}</style>
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Interactive Payroll Center</h1>
          <p className="text-xs text-muted-foreground">
            Compute semi-monthly 2026 Philippine-compliant employee payslips auto-integrated with time card records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleClear} className="h-9 gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Clear Form
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="h-9 gap-1.5 text-xs">
            <Printer className="w-3.5 h-3.5" /> Print View
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={!form.employeeName} className="h-9 gap-1.5 text-xs text-primary border-primary/40 hover:bg-primary/5">
            <Download className="w-3.5 h-3.5" /> Download PDF
          </Button>
        </div>
      </div>

      {/* FILTERS CONTAINER */}
      <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-lg space-y-4">
        <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-primary" /> Dynamic Cutoff Filters
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <User className="w-3 h-3" /> Select Employee
            </label>
            <select
              value={selectedUid}
              onChange={e => setSelectedUid(e.target.value)}
              className="bg-muted/40 border border-border/60 rounded-lg px-3 h-9 text-xs text-foreground focus:border-primary/50 outline-none w-full cursor-pointer"
            >
              <option value="">— Select Employee —</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.displayName || emp.email}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Year</label>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="bg-muted/40 border border-border/60 rounded-lg px-3 h-9 text-xs text-foreground focus:border-primary/50 outline-none w-full cursor-pointer"
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Month</label>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="bg-muted/40 border border-border/60 rounded-lg px-3 h-9 text-xs text-foreground focus:border-primary/50 outline-none w-full cursor-pointer"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx} value={idx + 1}>{name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Period Cutoff</label>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as any)}
              className="bg-muted/40 border border-border/60 rounded-lg px-3 h-9 text-xs text-foreground focus:border-primary/50 outline-none w-full cursor-pointer"
            >
              <option value="period1">Period 1 (11th - 25th)</option>
              <option value="period2">Period 2 (26th - 10th)</option>
            </select>
          </div>
        </div>
        {fetchingTimecard && (
          <p className="text-[10px] text-primary flex items-center gap-1 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" /> Pulling attendance matrices...
          </p>
        )}
      </div>

      <div className="space-y-8">
        {/* Form Editor */}
        <div className="bg-card/40 backdrop-blur-xl border border-border/80 rounded-2xl p-5 space-y-5 shadow-lg">
          <h2 className="font-semibold text-sm border-b border-border/40 pb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Parameters & Cutoff Figures
          </h2>

          <div className="space-y-4">
            {/* Metadata Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Employee Name</label>
                <input
                  type="text"
                  value={form.employeeName}
                  onChange={e => setForm({ ...form, employeeName: e.target.value })}
                  placeholder="e.g. Sally Harley"
                  className="bg-muted/40 border-border text-foreground text-xs h-9 px-3 w-full rounded-lg border outline-none focus:border-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Designation</label>
                <input
                  type="text"
                  value={form.designation}
                  onChange={e => setForm({ ...form, designation: e.target.value })}
                  placeholder="e.g. Marketing Executive"
                  className="bg-muted/40 border-border text-foreground text-xs h-9 px-3 w-full rounded-lg border outline-none focus:border-primary/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Department</label>
                <input
                  type="text"
                  value={form.department}
                  onChange={e => setForm({ ...form, department: e.target.value })}
                  placeholder="e.g. Marketing"
                  className="bg-muted/40 border-border text-foreground text-xs h-9 px-3 w-full rounded-lg border outline-none focus:border-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Date</label>
                <input
                  type="text"
                  value={form.dateOfJoining}
                  onChange={e => setForm({ ...form, dateOfJoining: e.target.value })}
                  placeholder="e.g. 2018-06-23"
                  className="bg-muted/40 border-border text-foreground text-xs h-9 px-3 w-full rounded-lg border outline-none focus:border-primary/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pay Period</label>
                <input
                  type="text"
                  value={form.payPeriod}
                  onChange={e => setForm({ ...form, payPeriod: e.target.value })}
                  placeholder="e.g. August 2021"
                  className="bg-muted/40 border-border text-foreground text-xs h-9 px-3 w-full rounded-lg border outline-none focus:border-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Worked Days</label>
                <input
                  type="text"
                  value={form.workedDays}
                  onChange={e => setForm({ ...form, workedDays: e.target.value })}
                  placeholder="e.g. 26"
                  className="bg-muted/40 border-border text-foreground text-xs h-9 px-3 w-full rounded-lg border outline-none focus:border-primary/50"
                />
              </div>
            </div>

            <hr className="border-border/40" />

            {/* Earnings inputs */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Earnings Components</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Monthly Basic Salary</label>
                  <input
                    type="number"
                    value={form.basic}
                    onChange={e => handleBasicSalaryChange(e.target.value)}
                    placeholder="e.g. 30000"
                    className="bg-muted/40 border-border text-foreground text-xs h-9 px-3 w-full rounded-lg border outline-none focus:border-primary/50 text-right"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Incentive Pay</label>
                  <input
                    type="number"
                    value={form.incentivePay}
                    onChange={e => setForm({ ...form, incentivePay: e.target.value })}
                    placeholder="e.g. 1000"
                    className="bg-muted/40 border-border text-foreground text-xs h-9 px-3 w-full rounded-lg border outline-none focus:border-primary/50 text-right"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Overtime Pay (Cutoff)</label>
                  <input
                    type="number"
                    value={form.overtime}
                    onChange={e => setForm({ ...form, overtime: e.target.value })}
                    placeholder="e.g. 400"
                    className="bg-muted/40 border-border text-foreground text-xs h-9 px-3 w-full rounded-lg border outline-none focus:border-primary/50 text-right animate-pulse"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Other Earnings</label>
                  <input
                    type="number"
                    value={form.otherEarnings}
                    onChange={e => setForm({ ...form, otherEarnings: e.target.value })}
                    placeholder="e.g. 200"
                    className="bg-muted/40 border-border text-foreground text-xs h-9 px-3 w-full rounded-lg border outline-none focus:border-primary/50 text-right"
                  />
                </div>
              </div>
            </div>

            <hr className="border-border/40" />

            {/* Deductions inputs */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Other Deductions</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Absences (Deductions)</label>
                  <input
                    type="number"
                    value={form.absences}
                    onChange={e => setForm({ ...form, absences: e.target.value })}
                    placeholder="e.g. 0"
                    className="bg-muted/40 border-border text-foreground text-xs h-9 px-3 w-full rounded-lg border outline-none focus:border-primary/50 text-right"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Other Deductions</label>
                  <input
                    type="number"
                    value={form.otherDeductions}
                    onChange={e => setForm({ ...form, otherDeductions: e.target.value })}
                    placeholder="e.g. 0"
                    className="bg-muted/40 border-border text-foreground text-xs h-9 px-3 w-full rounded-lg border outline-none focus:border-primary/50 text-right"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Payslip Live Preview */}
        <div className="space-y-4 pt-6 border-t border-border/40">
          <div className="text-xs font-semibold text-muted-foreground tracking-wider uppercase text-center">
            Payslip Live Preview (2026 PH Cutoff Computations)
          </div>

          <div
            ref={previewRef}
            className="printable-payslip bg-white text-neutral-900 border border-neutral-200 rounded-xl p-8 shadow-2xl flex flex-col font-sans max-w-2xl mx-auto w-full"
          >
            {/* Centered Header */}
            <div className="text-center space-y-1 border-b-2 border-neutral-200 pb-4 mb-6">
              <h2 className="text-xl font-extrabold uppercase tracking-tight text-neutral-800">Payslip</h2>
              <div className="text-sm font-bold text-neutral-700">AIMF Technologies Corporation</div>
              <div className="text-[11px] text-neutral-500">Kynsna Building Manila Harbour Centre, Tondo, Manila</div>
            </div>

            {/* 2-Column Employee Metadata */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-xs text-neutral-700 mb-6 bg-neutral-50 p-4 rounded-lg border border-neutral-100">
              <div>
                <span className="font-semibold text-neutral-500 uppercase tracking-wide block text-[10px]">Employee Name</span>
                <span className="font-bold text-neutral-800 text-sm">{form.employeeName || '—'}</span>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 uppercase tracking-wide block text-[10px]">Date</span>
                <span className="font-semibold text-neutral-800">{form.dateOfJoining || '—'}</span>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 uppercase tracking-wide block text-[10px]">Designation</span>
                <span className="font-semibold text-neutral-800">{form.designation || '—'}</span>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 uppercase tracking-wide block text-[10px]">Pay Period</span>
                <span className="font-semibold text-neutral-800">{form.payPeriod || '—'}</span>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 uppercase tracking-wide block text-[10px]">Department</span>
                <span className="font-semibold text-neutral-800">{form.department || '—'}</span>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 uppercase tracking-wide block text-[10px]">Worked Days</span>
                <span className="font-semibold text-neutral-800">{form.workedDays || '—'}</span>
              </div>
            </div>

            {/* Stacked Tables */}
            <div className="space-y-6 flex-1">
              {/* Earnings Table */}
              <div className="border border-neutral-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-neutral-700">
                  <thead className="bg-neutral-100 border-b border-neutral-200 font-bold uppercase tracking-wider text-neutral-600 text-[10px]">
                    <tr>
                      <th className="px-4 py-2 text-left">Earnings Component</th>
                      <th className="px-4 py-2 text-right w-36">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    <tr>
                      <td className="px-4 py-2 font-medium">Basic Salary (Semi-Monthly)</td>
                      <td className="px-4 py-2 text-right">₱{results.basicCutoff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                    {payrollInput.incentivePay > 0 && (
                      <tr>
                        <td className="px-4 py-2 font-medium">Incentive Pay</td>
                        <td className="px-4 py-2 text-right">₱{payrollInput.incentivePay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    )}
                    {payrollInput.overtime > 0 && (
                      <tr>
                        <td className="px-4 py-2 font-medium">Overtime & Special Hours</td>
                        <td className="px-4 py-2 text-right">₱{payrollInput.overtime.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    )}
                    {payrollInput.otherEarnings > 0 && (
                      <tr>
                        <td className="px-4 py-2 font-medium">Other Earnings</td>
                        <td className="px-4 py-2 text-right">₱{payrollInput.otherEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    )}
                    <tr className="bg-neutral-50/50 font-bold border-t border-neutral-200">
                      <td className="px-4 py-2.5 text-right uppercase tracking-wider text-[10px] text-neutral-500">Total Earnings</td>
                      <td className="px-4 py-2.5 text-right text-sm text-neutral-800">
                        ₱{results.grossEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Deductions Table */}
              <div className="border border-neutral-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-neutral-700">
                  <thead className="bg-neutral-100 border-b border-neutral-200 font-bold uppercase tracking-wider text-neutral-600 text-[10px]">
                    <tr>
                      <th className="px-4 py-2 text-left">Deductions (Statutory & Voluntary)</th>
                      <th className="px-4 py-2 text-right w-36">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    <tr>
                      <td className="px-4 py-2 font-medium">Pag-Ibig (HDMF)</td>
                      <td className="px-4 py-2 text-right text-red-600">₱{results.pagibig.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-medium">Philhealth</td>
                      <td className="px-4 py-2 text-right text-red-600">₱{results.philhealth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-medium">SSS</td>
                      <td className="px-4 py-2 text-right text-red-600">₱{results.sss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                    {results.withholdingTax > 0 && (
                      <tr>
                        <td className="px-4 py-2 font-medium">Withholding Tax (TRAIN Law Cutoff)</td>
                        <td className="px-4 py-2 text-right text-red-600">₱{results.withholdingTax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    )}
                    {payrollInput.absences > 0 && (
                      <tr>
                        <td className="px-4 py-2 font-medium">Absences Deduction</td>
                        <td className="px-4 py-2 text-right text-red-600">₱{payrollInput.absences.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    )}
                    {payrollInput.otherDeductions > 0 && (
                      <tr>
                        <td className="px-4 py-2 font-medium">Other Deductions</td>
                        <td className="px-4 py-2 text-right text-red-600">₱{payrollInput.otherDeductions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    )}
                    <tr className="bg-neutral-50/50 font-bold border-t border-neutral-200">
                      <td className="px-4 py-2.5 text-right uppercase tracking-wider text-[10px] text-neutral-500">Total Deductions</td>
                      <td className="px-4 py-2.5 text-right text-sm text-neutral-800">
                        ₱{results.totalDeductions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bold Net Pay Total & Centered Words */}
            <div className="border-t-2 border-neutral-200 pt-5 mt-6 text-center space-y-1">
              <div className="text-xs uppercase tracking-wider font-bold text-neutral-500">Net Take-Home Pay (Cutoff)</div>
              <div className="text-2xl font-black text-neutral-900">
                ₱{results.netPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs italic text-neutral-600 font-medium">
                ({results.netPayWords} Only)
              </div>
            </div>

            {/* Footer Signatures & System Generated Text */}
            <div className="grid grid-cols-2 gap-12 mt-12 pt-8 text-center text-xs text-neutral-600 border-t border-neutral-100">
              <div className="space-y-4">
                <div className="border-b border-neutral-300 mx-auto w-40 h-8"></div>
                <div className="font-semibold uppercase tracking-wider text-[10px]">Employer Signature</div>
              </div>
              <div className="space-y-4">
                <div className="border-b border-neutral-300 mx-auto w-40 h-8"></div>
                <div className="font-semibold uppercase tracking-wider text-[10px]">Employee Signature</div>
              </div>
            </div>

            <div className="print-hidden text-center text-[9px] text-neutral-400 mt-8 tracking-widest uppercase">
              This is system generated payslip
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
