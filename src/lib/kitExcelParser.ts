import type ExcelJS from "exceljs";

export interface ParsedLot {
  lotNo: string | null;
  quantity: number;
  expiryDate: string | null; // YYYY-MM-DD หรือ null
  flagged: boolean;
  rawExpiry: string; // ค่าดิบจากไฟล์ ไว้แสดงในคำเตือน
}

export interface ParsedItem {
  seq: number | null;
  drugName: string;
  strength: string | null;
  unit: string | null;
  standardQty: number | null;
  lots: ParsedLot[];
}

export interface ParsedBox {
  sheetName: string;
  items: ParsedItem[];
}

export interface ParseWarning {
  sheetName: string;
  drugName: string;
  message: string;
}

export interface ParseResult {
  boxes: ParsedBox[];
  warnings: ParseWarning[];
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "text" in (v as Record<string, unknown>)) {
    return String((v as { text: unknown }).text ?? "");
  }
  if (typeof v === "object" && "result" in (v as Record<string, unknown>)) {
    // สูตรในเซลล์ — ใช้ผลลัพธ์ที่คำนวณไว้
    return cellText((v as { result: unknown }).result);
  }
  return String(v).trim();
}

function isLegendRow(drugName: string): boolean {
  // แถวคำอธิบายสี เช่น "สีแดง =หมดอายุปีนี้" — \w ของ JS ไม่จับอักษรไทย จึงใช้ .* แทน
  return /^สี.*=/.test(drugName.trim()) || drugName.trim() === "";
}

const MONTH_YEAR_RE = /^(\d{1,2})\s*\/\s*(\d{2,4})$/;

function parseExpiryCell(raw: unknown): { iso: string | null; flagged: boolean; text: string } {
  if (raw === null || raw === undefined) return { iso: null, flagged: false, text: "" };

  if (raw instanceof Date) {
    const year = raw.getFullYear();
    const iso = raw.toISOString().slice(0, 10);
    const flagged = year < 2020 || year > 2045;
    return { iso, flagged, text: iso };
  }

  const text = cellText(raw).trim();
  if (text === "" || text === "-" || text === "–") {
    return { iso: null, flagged: false, text };
  }

  const m = MONTH_YEAR_RE.exec(text);
  if (m) {
    const month = parseInt(m[1], 10);
    let year = parseInt(m[2], 10);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12) {
      // วันสุดท้ายของเดือนนั้น (ปกติ "EXP 08/26" หมายถึงใช้ได้ถึงสิ้นเดือนนั้น)
      const lastDay = new Date(Date.UTC(year, month, 0));
      const iso = lastDay.toISOString().slice(0, 10);
      const flagged = year < 2020 || year > 2045;
      return { iso, flagged, text };
    }
  }

  // รูปแบบอื่นที่แกะไม่ได้ — ให้ผู้ใช้ตรวจสอบเอง ไม่ตั้งวันหมดอายุอัตโนมัติ
  return { iso: null, flagged: text.length > 0, text };
}

function toNumber(v: unknown): number {
  const text = cellText(v).replace(/,/g, "");
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : 0;
}

interface ColumnMap {
  seq: number;
  drugName: number;
  lotNo: number | null;
  strength: number | null;
  qty: number | null;
  unit: number | null;
  exp: number | null;
}

function detectColumns(headerRow: string[]): ColumnMap | null {
  const find = (re: RegExp) => headerRow.findIndex((h) => re.test(h));
  const seq = find(/^ลำดับ/);
  const drugName = find(/รายการยา/);
  if (seq < 0 || drugName < 0) return null;
  return {
    seq,
    drugName,
    lotNo: ((): number | null => {
      const i = find(/LOT/i);
      return i >= 0 ? i : null;
    })(),
    strength: ((): number | null => {
      const i = find(/ความแรง/);
      return i >= 0 ? i : null;
    })(),
    qty: ((): number | null => {
      const i = headerRow.findIndex((h) => /^จำนวน$/.test(h.trim()));
      return i >= 0 ? i : null;
    })(),
    unit: ((): number | null => {
      const i = find(/หน่วยนับ/);
      return i >= 0 ? i : null;
    })(),
    exp: ((): number | null => {
      const i = find(/^EXP/i);
      return i >= 0 ? i : null;
    })(),
  };
}

export function parseKitWorkbook(workbook: ExcelJS.Workbook): ParseResult {
  const boxes: ParsedBox[] = [];
  const warnings: ParseWarning[] = [];

  for (const sheet of workbook.worksheets) {
    const rawRows: unknown[][] = [];
    sheet.eachRow((row) => {
      rawRows.push((row.values as unknown[]).slice(1));
    });
    if (rawRows.length < 2) continue;

    const headerRow = rawRows[0].map(cellText);
    const cols = detectColumns(headerRow);
    if (!cols) {
      warnings.push({
        sheetName: sheet.name,
        drugName: "-",
        message: "ไม่พบคอลัมน์ 'ลำดับ' หรือ 'รายการยาฉีด' ในชีตนี้ — ข้ามทั้งชีต",
      });
      continue;
    }

    // รวมแถวที่เป็นยาตัวเดียวกันแต่มีหลายล็อต (ชื่อยา+ความแรงเดียวกัน) เป็นรายการเดียว
    const itemsByKey = new Map<string, ParsedItem>();
    const order: string[] = [];

    for (const rawRow of rawRows.slice(1)) {
      const drugNameRaw = cellText(rawRow[cols.drugName]);
      if (isLegendRow(drugNameRaw)) continue;

      const drugName = drugNameRaw.trim();
      const strength = cols.strength !== null ? cellText(rawRow[cols.strength]).trim() || null : null;
      const unit = cols.unit !== null ? cellText(rawRow[cols.unit]).trim() || null : null;
      const lotNo = cols.lotNo !== null ? cellText(rawRow[cols.lotNo]).trim() || null : null;
      const qty = cols.qty !== null ? toNumber(rawRow[cols.qty]) : 0;
      const seqVal = cellText(rawRow[cols.seq]);
      const seq = seqVal ? parseInt(seqVal, 10) : null;

      const expRaw = cols.exp !== null ? rawRow[cols.exp] : null;
      const { iso, flagged, text } = parseExpiryCell(expRaw);

      if (flagged) {
        warnings.push({
          sheetName: sheet.name,
          drugName,
          message: iso
            ? `วันหมดอายุที่อ่านได้ (${iso}) ดูผิดปกติ (จากค่าดิบ "${text}") — นำเข้าแล้วแต่ถูกพักการแจ้งเตือนไว้ก่อน กรุณาตรวจสอบ`
            : `อ่านวันหมดอายุจากค่า "${text}" ไม่ได้ — นำเข้าโดยไม่มีวันหมดอายุ กรุณากรอกเองในระบบ`,
        });
      }

      const key = `${drugName.toUpperCase()}|${strength ?? ""}`;
      let item = itemsByKey.get(key);
      if (!item) {
        item = { seq, drugName, strength, unit, standardQty: 0, lots: [] };
        itemsByKey.set(key, item);
        order.push(key);
      }

      // ข้ามการสร้างล็อตถ้าไม่มีของและไม่มีวันหมดอายุ (ช่องว่างในเช็คลิสต์)
      if (qty > 0 || iso) {
        item.lots.push({ lotNo, quantity: qty, expiryDate: iso, flagged, rawExpiry: text });
        item.standardQty = (item.standardQty ?? 0) + qty;
      }
    }

    const items = order.map((k) => itemsByKey.get(k)!);
    boxes.push({ sheetName: sheet.name, items });
  }

  return { boxes, warnings };
}
