// Edge Function: check-kit-expiry
// ตรวจล็อตยาในกล่องฉุกเฉินที่ใกล้หมดอายุ (ตามเดือนที่ตั้งค่าไว้ เช่น 6/3/1 เดือน)
// แล้วส่งแจ้งเตือนเข้า Telegram — ตั้งให้รันทุกวันด้วย pg_cron (ดูคู่มือติดตั้ง)
//
// Secrets ที่ต้องตั้งไว้ล่วงหน้า (Supabase Dashboard -> Edge Functions -> Secrets):
//   TELEGRAM_BOT_TOKEN   โทเคนของบอท Telegram ที่สร้างใหม่ (ห้ามใช้ร่วมกับระบบอื่น)
// ตัวแปรต่อไปนี้ Supabase ใส่ให้อัตโนมัติ ไม่ต้องตั้งเอง:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// "วันนี้" ตามเวลาไทย (UTC+7) — เซิร์ฟเวอร์ของ Edge Function รันเวลา UTC
function bangkokToday(): string {
  const bangkokMs = Date.now() + 7 * 60 * 60 * 1000;
  return new Date(bangkokMs).toISOString().slice(0, 10); // YYYY-MM-DD
}

function daysBetween(fromISODate: string, toISODate: string): number {
  const a = new Date(`${fromISODate}T00:00:00Z`).getTime();
  const b = new Date(`${toISODate}T00:00:00Z`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("ไม่พบ TELEGRAM_BOT_TOKEN — ตั้งค่าใน Edge Function Secrets ก่อน");
    return false;
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
      },
    );
    const body = await res.json();
    if (!res.ok || body.ok === false) {
      console.error("Telegram sendMessage failed:", body);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Telegram sendMessage error:", err);
    return false;
  }
}

interface LotRow {
  id: string;
  lot_no: string | null;
  quantity: number;
  expiry_date: string | null;
  flagged: boolean;
  kit_items: {
    drug_name: string;
    strength: string | null;
    unit: string | null;
    kit_boxes: { name: string } | null;
  } | null;
}

Deno.serve(async () => {
  const today = bangkokToday();
  const summary = { expirySent: 0, skippedNoChat: false, skippedFlagged: 0, errors: [] as string[] };

  const { data: settings, error: settingsErr } = await supabase
    .from("alert_settings")
    .select("telegram_chat_id, expiry_alert_months")
    .eq("id", 1)
    .single();

  if (settingsErr || !settings) {
    summary.errors.push(`อ่านการตั้งค่าไม่สำเร็จ: ${settingsErr?.message ?? "ไม่พบข้อมูล"}`);
    return new Response(JSON.stringify(summary), { status: 500 });
  }

  if (!settings.telegram_chat_id) {
    summary.skippedNoChat = true;
    return new Response(JSON.stringify(summary), { status: 200 });
  }

  const chatId = settings.telegram_chat_id as string;
  const thresholdMonths = ((settings.expiry_alert_months as number[]) ?? [6, 3, 1])
    .slice()
    .sort((a, b) => b - a);

  const { data: lots, error: lotsErr } = await supabase
    .from("kit_item_lots")
    .select(
      "id, lot_no, quantity, expiry_date, flagged, kit_items(drug_name, strength, unit, kit_boxes(name))",
    )
    .gt("quantity", 0)
    .not("expiry_date", "is", null)
    .order("expiry_date");

  if (lotsErr) {
    summary.errors.push(`อ่านล็อตยาไม่สำเร็จ: ${lotsErr.message}`);
    return new Response(JSON.stringify(summary), { status: 500 });
  }

  for (const lot of lots as unknown as LotRow[]) {
    if (!lot.kit_items || !lot.expiry_date) continue;

    // ล็อตที่มีวันที่ดูผิดปกติ (ถูกตั้งค่า flagged ตอนนำเข้า) — ข้ามการแจ้งเตือนจนกว่าจะแก้ไข
    if (lot.flagged) {
      summary.skippedFlagged += 1;
      continue;
    }

    const daysUntilExpiry = daysBetween(today, lot.expiry_date);

    const candidateThresholds: { key: string; label: string }[] = [];
    if (daysUntilExpiry < 0) {
      candidateThresholds.push({ key: "expired", label: "หมดอายุแล้ว" });
    }
    for (const m of thresholdMonths) {
      if (daysUntilExpiry >= 0 && daysUntilExpiry <= m * 30) {
        candidateThresholds.push({ key: `expiry_${m}m`, label: `ใกล้หมดอายุภายใน ${m} เดือน` });
      }
    }

    for (const threshold of candidateThresholds) {
      const { data: already } = await supabase
        .from("notification_log")
        .select("id")
        .eq("lot_id", lot.id)
        .eq("threshold_key", threshold.key)
        .limit(1)
        .maybeSingle();

      if (already) continue;

      const boxName = lot.kit_items.kit_boxes?.name ?? "(ไม่ทราบกล่อง)";
      const strength = lot.kit_items.strength ? ` ${lot.kit_items.strength}` : "";
      const lotLabel = lot.lot_no ? ` ล็อต ${lot.lot_no}` : "";
      const text =
        `⏰ *แจ้งเตือนยากล่องฉุกเฉินใกล้หมดอายุ*\n` +
        `กล่อง: ${boxName}\n` +
        `ยา: ${lot.kit_items.drug_name}${strength}${lotLabel}\n` +
        `คงเหลือ: ${lot.quantity} ${lot.kit_items.unit ?? ""}\n` +
        `วันหมดอายุ: ${lot.expiry_date}\n` +
        `สถานะ: ${threshold.label}`;

      const ok = await sendTelegram(chatId, text);
      await supabase.from("notification_log").insert({
        lot_id: lot.id,
        threshold_key: threshold.key,
        telegram_ok: ok,
        detail: `${boxName} / ${lot.kit_items.drug_name} หมดอายุ ${lot.expiry_date}`,
      });
      if (ok) summary.expirySent += 1;
    }
  }

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
