import { useEffect, useMemo, useState } from "react";
import { daysUntil, expiryTone, mapBoxRow, mapItemWithLotsRow } from "../lib/mappers";
import { supabase } from "../lib/supabaseClient";
import type { KitBox, KitItemWithLots } from "../types";

const TONE_CLASSES: Record<string, string> = {
  critical: "text-status-critical font-semibold",
  serious: "text-status-serious font-semibold",
  warning: "text-status-warning font-semibold",
  good: "text-status-good",
  none: "text-kit-muted",
};

function StatCard({ label, value, tone }: { label: string; value: number; tone: "good" | "warning" | "serious" | "critical" }) {
  const toneClasses: Record<typeof tone, string> = {
    good: "bg-status-good-bg text-status-good",
    warning: "bg-status-warning-bg text-status-warning",
    serious: "bg-status-serious-bg text-status-serious",
    critical: "bg-status-critical-bg text-status-critical",
  };
  return (
    <div className={`rounded-2xl p-4 ${toneClasses[tone]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [boxes, setBoxes] = useState<KitBox[]>([]);
  const [items, setItems] = useState<KitItemWithLots[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    const [boxesRes, itemsRes] = await Promise.all([
      supabase.from("kit_boxes").select("*").order("sort_order"),
      supabase
        .from("kit_items")
        .select("*, kit_boxes(id, name), kit_item_lots(*)")
        .order("seq"),
    ]);
    if (boxesRes.error) setError(boxesRes.error.message);
    if (itemsRes.error) setError(itemsRes.error.message);
    setBoxes((boxesRes.data ?? []).map(mapBoxRow));
    setItems((itemsRes.data ?? []).map(mapItemWithLotsRow));
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    let expired = 0;
    let within1m = 0;
    let within3m = 0;
    let within6m = 0;
    let flagged = 0;
    for (const item of items) {
      for (const lot of item.lots) {
        if (lot.flagged) flagged += 1;
        if (!lot.expiryDate) continue;
        const d = daysUntil(lot.expiryDate);
        if (d < 0) expired += 1;
        else if (d <= 30) within1m += 1;
        else if (d <= 90) within3m += 1;
        else if (d <= 180) within6m += 1;
      }
    }
    return { expired, within1m, within3m, within6m, flagged };
  }, [items]);

  if (loading) return <p className="text-kit-muted">กำลังโหลดข้อมูล...</p>;

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-lg bg-status-critical-bg px-4 py-2 text-sm text-status-critical">{error}</p>
      )}

      <section>
        <h2 className="font-display text-lg font-semibold text-kit-ink">ภาพรวมวันหมดอายุ</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="หมดอายุแล้ว" value={stats.expired} tone="critical" />
          <StatCard label="ใกล้หมดอายุ ≤1 เดือน" value={stats.within1m} tone="serious" />
          <StatCard label="ใกล้หมดอายุ ≤3 เดือน" value={stats.within3m} tone="warning" />
          <StatCard label="ใกล้หมดอายุ ≤6 เดือน" value={stats.within6m} tone="good" />
        </div>
        {stats.flagged > 0 && (
          <p className="mt-2 text-sm text-status-warning">
            ⚠️ มี {stats.flagged} ล็อตที่วันหมดอายุดูผิดปกติ ถูกพักการแจ้งเตือนไว้ — ดูรายละเอียดด้านล่างแล้วแก้ไขให้ถูกต้อง
          </p>
        )}
      </section>

      {boxes.map((box) => {
        const boxItems = items.filter((i) => i.boxId === box.id);
        if (boxItems.length === 0) return null;
        return (
          <section key={box.id}>
            <h2 className="font-display text-lg font-semibold text-kit-ink">{box.name}</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-kit-border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-kit-bg text-left text-xs font-medium text-kit-muted">
                  <tr>
                    <th className="px-4 py-2">ยา</th>
                    <th className="px-4 py-2">ความแรง</th>
                    <th className="px-4 py-2">คงเหลือ</th>
                    <th className="px-4 py-2">วันหมดอายุ</th>
                  </tr>
                </thead>
                <tbody>
                  {boxItems.map((item) =>
                    item.lots.length === 0 ? (
                      <tr key={item.id} className="border-t border-kit-border">
                        <td className="px-4 py-2">{item.drugName}</td>
                        <td className="px-4 py-2 text-kit-muted">{item.strength ?? "-"}</td>
                        <td className="px-4 py-2 text-kit-muted">ไม่มีของ</td>
                        <td className="px-4 py-2 text-kit-muted">-</td>
                      </tr>
                    ) : (
                      item.lots.map((lot, li) => {
                        const tone = lot.flagged ? "warning" : expiryTone(lot.expiryDate);
                        const d = lot.expiryDate ? daysUntil(lot.expiryDate) : null;
                        return (
                          <tr key={`${item.id}-${li}`} className="border-t border-kit-border">
                            <td className="px-4 py-2">
                              {item.drugName}
                              {lot.lotNo ? <span className="text-kit-muted"> (ล็อต {lot.lotNo})</span> : ""}
                            </td>
                            <td className="px-4 py-2 text-kit-muted">{item.strength ?? "-"}</td>
                            <td className="px-4 py-2">
                              {lot.quantity} {item.unit ?? ""}
                            </td>
                            <td className={`px-4 py-2 ${TONE_CLASSES[tone]}`}>
                              {lot.expiryDate ?? "ไม่ทราบ"}
                              {lot.flagged
                                ? " (ผิดปกติ — ตรวจสอบ)"
                                : d !== null
                                  ? d < 0
                                    ? ` (หมดอายุแล้ว ${Math.abs(d)} วัน)`
                                    : ` (อีก ${d} วัน)`
                                  : ""}
                            </td>
                          </tr>
                        );
                      })
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {items.length === 0 && (
        <p className="text-kit-muted">ยังไม่มีข้อมูล — ไปที่เมนู "นำเข้าจาก Excel" เพื่อนำเข้าเช็คลิสต์กล่องยาฉุกเฉิน</p>
      )}
    </div>
  );
}
