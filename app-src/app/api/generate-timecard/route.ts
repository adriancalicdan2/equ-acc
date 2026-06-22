import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import path from 'path';

type DayStatus = 'Present' | 'Absent' | 'Rest Day' | 'Half-day';

interface DayEntry {
  date: string;       // YYYY-MM-DD
  status: DayStatus;
  timeIn: string;     // HH:mm
  timeOut: string;    // HH:mm
  otRemarks?: string;
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

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const {
      employeeName,
      monthName,
      period1 = [],
      period2 = [],
      shiftHours = 10,
      year,
      month
    } = data;

    // Load the template
    const templatePath = path.join(process.cwd(), 'public', 'templates', 'Time Card.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const ws = workbook.getWorksheet(1);
    if (!ws) {
      throw new Error('Worksheet not found in template');
    }

    // Set header values
    ws.getCell('A1').value = `Cutoff Month: ${monthName}`;
    ws.getCell('G1').value = `Cutoff Month: ${monthName}`;
    ws.getCell('A3').value = `Name: ${employeeName}`;
    ws.getCell('G3').value = `Name: ${employeeName}`;

    // Set OT Remarks headers and styles
    const f5 = ws.getCell('F5');
    const e5 = ws.getCell('E5');
    f5.value = 'OT Remarks';
    f5.style = { ...e5.style };

    const l5 = ws.getCell('L5');
    const k5 = ws.getCell('K5');
    l5.value = 'OT Remarks';
    l5.style = { ...k5.style };

    ws.getColumn('F').width = 25;
    ws.getColumn('L').width = 25;

    // Fill Period 1 (11th to 25th) -> Row 7 to 21
    period1.forEach((entry: DayEntry) => {
      const datePart = entry.date.split('-');
      const day = parseInt(datePart[2], 10);
      const row = 7 + (day - 11);

      if (row >= 7 && row <= 21) {
        if (entry.status === 'Rest Day') {
          ws.getCell(`B${row}`).value = 'Rest Day';
          ws.getCell(`C${row}`).value = '';
          ws.getCell(`D${row}`).value = 0;
          ws.getCell(`E${row}`).value = 0;
        } else if (entry.status === 'Absent') {
          ws.getCell(`B${row}`).value = 'Absent';
          ws.getCell(`C${row}`).value = '';
          ws.getCell(`D${row}`).value = 0;
          ws.getCell(`E${row}`).value = 0;
        } else {
          ws.getCell(`B${row}`).value = entry.timeIn || '';
          ws.getCell(`C${row}`).value = entry.timeOut || '';
          ws.getCell(`D${row}`).value = calcHours(entry);
          ws.getCell(`E${row}`).value = calcOT(entry, shiftHours);
        }

        const cellF = ws.getCell(`F${row}`);
        cellF.value = entry.otRemarks || '';
        const cellE = ws.getCell(`E${row}`);
        cellF.style = { ...cellE.style };
        cellF.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });

    // Determine days in this cutoff month
    const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-indexed

    // Fill Period 2 (26th to 10th) -> Row 6 to 21
    // Valid days in period 2: 26 to daysInMonth, then 1 to 10
    const p2DaySet = new Set<number>();
    period2.forEach((entry: DayEntry) => {
      const datePart = entry.date.split('-');
      const day = parseInt(datePart[2], 10);
      p2DaySet.add(day);

      let row = -1;
      if (day >= 26 && day <= 31) {
        row = 6 + (day - 26);
      } else if (day >= 1 && day <= 10) {
        row = 12 + (day - 1);
      }

      if (row >= 6 && row <= 21) {
        ws.getCell(`G${row}`).value = day; // make sure day number is set correctly

        if (entry.status === 'Rest Day') {
          ws.getCell(`H${row}`).value = 'Rest Day';
          ws.getCell(`I${row}`).value = '';
          ws.getCell(`J${row}`).value = 0;
          ws.getCell(`K${row}`).value = 0;
        } else if (entry.status === 'Absent') {
          ws.getCell(`H${row}`).value = 'Absent';
          ws.getCell(`I${row}`).value = '';
          ws.getCell(`J${row}`).value = 0;
          ws.getCell(`K${row}`).value = 0;
        } else {
          ws.getCell(`H${row}`).value = entry.timeIn || '';
          ws.getCell(`I${row}`).value = entry.timeOut || '';
          ws.getCell(`J${row}`).value = calcHours(entry);
          ws.getCell(`K${row}`).value = calcOT(entry, shiftHours);
        }

        const cellL = ws.getCell(`L${row}`);
        cellL.value = entry.otRemarks || '';
        const cellK = ws.getCell(`K${row}`);
        cellL.style = { ...cellK.style };
        cellL.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });

    // Clear rows for non-existent days in February/30-day months
    // e.g. row 9 is 29, row 10 is 30, row 11 is 31
    for (let day = 29; day <= 31; day++) {
      if (day > daysInMonth) {
        const row = 6 + (day - 26);
        ws.getCell(`G${row}`).value = null;
        ws.getCell(`H${row}`).value = null;
        ws.getCell(`I${row}`).value = null;
        ws.getCell(`J${row}`).value = null;
        ws.getCell(`K${row}`).value = null;
        ws.getCell(`L${row}`).value = null;
      }
    }

    // Write workbook to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Timecard-${employeeName.replace(/\s+/g, '-')}-${monthName.replace(/\s+/g, '-')}.xlsx"`,
      },
    });
  } catch (err: any) {
    console.error('Timecard excel generation error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
