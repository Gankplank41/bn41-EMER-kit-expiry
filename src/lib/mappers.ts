import type { AlertSettings, KitBox, KitItemWithLots } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapBoxRow(row: any): KitBox {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

// แปลงผลลัพธ์จาก query ที่ join kit_items + kit_item_lots + kit_boxes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapItemWithLotsRow(row: any): KitItemWithLots {
  return {
    id: row.id,
    boxId: row.box_id,
    seq: row.seq,
    drugName: row.drug_name,
    strength: row.strength,
    unit: row.unit,
    standardQty: row.standard_qty === null ? null : Number(row.standard_qty),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    box: { id: row.kit_boxes?.id ?? row.box_id, name: row.kit_boxes?.name ?? "" },
    lots: (row.kit_item_lots ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (l: any) => ({
        id: l.id,
        itemId: l.item_id,
        lotNo: l.lot_no,
        quantity: Number(l.quantity),
        expiryDate: l.expiry_date,
        flagged: l.flagged,
        createdAt: l.created_at,
        updatedAt: l.updated_at,
      }),
    ),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSettingsRow(row: any): AlertSettings {
  return {
    id: row.id,
    telegramChatId: row.telegram_chat_id,
    expiryAlertMonths: row.expiry_alert_months ?? [6, 3, 1],
    updatedAt: row.updated_at,
  };
}

export function daysUntil(dateISO: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateISO}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export type ExpiryTone = "none" | "good" | "warning" | "serious" | "critical";

export function expiryTone(dateISO: string | null): ExpiryTone {
  if (!dateISO) return "none";
  const d = daysUntil(dateISO);
  if (d < 0) return "critical";
  if (d <= 30) return "serious";
  if (d <= 90) return "warning";
  if (d <= 180) return "good";
  return "none";
}
