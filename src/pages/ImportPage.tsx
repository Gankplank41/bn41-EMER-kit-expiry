import ExcelJS from "exceljs";
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { parseKitWorkbook, type ParseResult } from "../lib/kitExcelParser";

export default function ImportPage() {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    setImportSummary(null);
    setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const parsed = parseKitWorkbook(workbook);
      if (parsed.boxes.length === 0) {
        setFileError("ไม่พบชีตที่มีคอลัมน์ 'ลำดับ' และ 'รายการยาฉีด' ในไฟล์นี้");
        return;
      }
      setResult(parsed);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "อ่านไฟล์ไม่สำเร็จ — ตรวจสอบว่าเป็นไฟล์ .xlsx");
    }
  }

  async function handleImport() {
    if (!result) return;
    setImporting(true);
    setImportSummary(null);
    const boxCounts: string[] = [];

    try {
      for (const box of result.boxes) {
        // หากล่องที่มีชื่อตรงกับชีต — ถ้าไม่มีให้สร้างใหม่
        let boxId: string;
        const { data: existingBox } = await supabase
          .from("kit_boxes")
          .select("id")
          .eq("name", box.sheetName)
          .maybeSingle();

        if (existingBox) {
          boxId = existingBox.id;
          // ลบรายการเดิมของกล่องนี้ทั้งหมดก่อน (re-sync ตามไฟล์ล่าสุด) — lots ลบตามด้วย cascade
          await supabase.from("kit_items").delete().eq("box_id", boxId);
        } else {
          const { data: newBox, error: boxErr } = await supabase
            .from("kit_boxes")
            .insert({ name: box.sheetName, sort_order: 99 })
            .select("id")
            .single();
          if (boxErr || !newBox) throw new Error(boxErr?.message ?? "สร้างกล่องใหม่ไม่สำเร็จ");
          boxId = newBox.id;
        }

        let itemCount = 0;
        let lotCount = 0;
        for (const item of box.items) {
          const { data: newItem, error: itemErr } = await supabase
            .from("kit_items")
            .insert({
              box_id: boxId,
              seq: item.seq,
              drug_name: item.drugName,
              strength: item.strength,
              unit: item.unit,
              standard_qty: item.standardQty,
            })
            .select("id")
            .single();
          if (itemErr || !newItem) throw new Error(itemErr?.message ?? "บันทึกรายการยาไม่สำเร็จ");
          itemCount += 1;

          if (item.lots.length > 0) {
            const { error: lotsErr } = await supabase.from("kit_item_lots").insert(
              item.lots.map((lot) => ({
                item_id: newItem.id,
                lot_no: lot.lotNo,
                quantity: lot.quantity,
                expiry_date: lot.expiryDate,
                flagged: lot.flagged,
              })),
            );
            if (lotsErr) throw new Error(lotsErr.message);
            lotCount += item.lots.length;
          }
        }

        boxCounts.push(`${box.sheetName}: ${itemCount} รายการ (${lotCount} ล็อต)`);
      }

      setImportSummary(`นำเข้าสำเร็จ — ${boxCounts.join(", ")}`);
    } catch (err) {
      setImportSummary(
        `เกิดข้อผิดพลาดระหว่างนำเข้า: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setImporting(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-kit-ink">นำเข้าเช็คลิสต์กล่องยาฉุกเฉิน</h2>
        <p className="mt-1 text-sm text-kit-muted">
          เลือกไฟล์ .xlsx ที่มีชีตแยกตามกล่อง (เช่น "กล่อง 1 ER", "กล่อง 2") — การนำเข้าจะ
          <span className="font-medium text-kit-crimson"> แทนที่ข้อมูลเดิมของกล่องนั้นทั้งหมด </span>
          ด้วยข้อมูลในไฟล์ (เหมาะกับการอัปโหลดทุกครั้งที่ตรวจนับกล่องจริง)
        </p>
      </div>

      <input type="file" accept=".xlsx" onChange={(e) => void handleFile(e)} className="block text-sm" />

      {fileError && (
        <p className="rounded-lg bg-status-critical-bg px-4 py-2 text-sm text-status-critical">{fileError}</p>
      )}

      {result && (
        <div className="space-y-4">
          {result.warnings.length > 0 && (
            <div className="space-y-1 rounded-xl border border-status-warning bg-status-warning-bg p-4">
              <h3 className="text-sm font-semibold text-status-warning">
                พบข้อมูลที่ควรตรวจสอบ ({result.warnings.length} รายการ)
              </h3>
              {result.warnings.map((w, idx) => (
                <p key={idx} className="text-xs text-status-warning">
                  [{w.sheetName}] {w.drugName}: {w.message}
                </p>
              ))}
            </div>
          )}

          {result.boxes.map((box) => (
            <div key={box.sheetName} className="rounded-xl border border-kit-border bg-white p-4">
              <h3 className="font-medium text-kit-ink">
                {box.sheetName} ({box.items.length} รายการ)
              </h3>
              <div className="mt-2 overflow-x-auto rounded-lg border border-kit-border">
                <table className="w-full text-xs">
                  <thead className="bg-kit-bg text-left text-kit-muted">
                    <tr>
                      <th className="px-3 py-1.5">ยา</th>
                      <th className="px-3 py-1.5">ความแรง</th>
                      <th className="px-3 py-1.5">จำนวนรวม</th>
                      <th className="px-3 py-1.5">ล็อต/วันหมดอายุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {box.items.map((item, idx) => (
                      <tr key={idx} className="border-t border-kit-border align-top">
                        <td className="px-3 py-1.5">{item.drugName}</td>
                        <td className="px-3 py-1.5 text-kit-muted">{item.strength ?? "-"}</td>
                        <td className="px-3 py-1.5">
                          {item.standardQty ?? 0} {item.unit ?? ""}
                        </td>
                        <td className="px-3 py-1.5">
                          {item.lots.length === 0
                            ? "(ไม่มีของในขณะนี้)"
                            : item.lots.map((lot, li) => (
                                <div key={li} className={lot.flagged ? "text-status-warning" : ""}>
                                  {lot.quantity} {item.unit ?? ""}
                                  {lot.lotNo ? ` (ล็อต ${lot.lotNo})` : ""} —{" "}
                                  {lot.expiryDate ?? "ไม่ทราบวันหมดอายุ"}
                                  {lot.flagged ? " ⚠️" : ""}
                                </div>
                              ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <button
            type="button"
            disabled={importing}
            onClick={() => void handleImport()}
            className="rounded-lg bg-kit-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-kit-crimson-dark disabled:opacity-60"
          >
            {importing ? "กำลังนำเข้า..." : `นำเข้า ${result.boxes.length} กล่อง`}
          </button>

          {importSummary && (
            <p className="rounded-lg bg-status-good-bg px-4 py-2 text-sm text-status-good">{importSummary}</p>
          )}
        </div>
      )}
    </div>
  );
}
