import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { mapSettingsRow } from "../lib/mappers";
import { supabase } from "../lib/supabaseClient";
import type { AlertSettings } from "../types";

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [chatId, setChatId] = useState("");
  const [months, setMonths] = useState("6,3,1");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error: err } = await supabase.from("alert_settings").select("*").eq("id", 1).single();
    if (err) setError(err.message);
    if (data) {
      const mapped = mapSettingsRow(data);
      setSettings(mapped);
      setChatId(mapped.telegramChatId ?? "");
      setMonths(mapped.expiryAlertMonths.join(","));
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const parsedMonths = months
      .split(",")
      .map((m) => parseFloat(m.trim()))
      .filter((m) => Number.isFinite(m) && m > 0);

    const { error: err } = await supabase
      .from("alert_settings")
      .update({
        telegram_chat_id: chatId.trim() || null,
        expiry_alert_months: parsedMonths.length > 0 ? parsedMonths : [6, 3, 1],
        updated_by: user?.id ?? null,
      })
      .eq("id", 1);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSaved(true);
    void load();
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    const { data, error: err } = await supabase.functions.invoke("check-kit-expiry");
    setTesting(false);
    if (err) {
      setTestResult(`เรียกใช้งานไม่สำเร็จ: ${err.message}`);
      return;
    }
    setTestResult(
      `ตรวจสอบเสร็จแล้ว — ส่งแจ้งเตือน ${data.expirySent} ข้อความ` +
        (data.skippedFlagged ? `, พักไว้ ${data.skippedFlagged} ล็อต (วันที่ผิดปกติ)` : "") +
        (data.skippedNoChat ? " (ยังไม่ได้ตั้งค่า Telegram Chat ID)" : "") +
        (data.errors?.length ? ` — ข้อผิดพลาด: ${data.errors.join(", ")}` : ""),
    );
  }

  if (loading) return <p className="text-kit-muted">กำลังโหลดข้อมูล...</p>;

  return (
    <div className="max-w-xl space-y-6">
      <h2 className="font-display text-lg font-semibold text-kit-ink">ตั้งค่าการแจ้งเตือน</h2>

      {error && (
        <p className="rounded-lg bg-status-critical-bg px-4 py-2 text-sm text-status-critical">{error}</p>
      )}

      <div className="space-y-4 rounded-xl border border-kit-border bg-white p-4">
        <div>
          <label className="block text-sm font-medium text-kit-ink" htmlFor="chatId">
            Telegram Chat ID
          </label>
          <p className="text-xs text-kit-muted">
            รหัสห้องแชท/ผู้ใช้ที่จะรับข้อความแจ้งเตือน — ดูวิธีหาค่านี้ในคู่มือติดตั้ง (ขั้นตอนสร้างบอท Telegram)
          </p>
          <input
            id="chatId"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="เช่น 123456789"
            className="mt-1 w-full rounded-lg border border-kit-border px-3 py-2 text-sm focus:border-kit-crimson focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-kit-ink" htmlFor="months">
            แจ้งเตือนวันหมดอายุล่วงหน้า (เดือน, คั่นด้วยจุลภาค)
          </label>
          <input
            id="months"
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            placeholder="6,3,1"
            className="mt-1 w-full rounded-lg border border-kit-border px-3 py-2 text-sm focus:border-kit-crimson focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-kit-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-kit-crimson-dark disabled:opacity-60"
        >
          {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </button>
        {saved && <span className="ml-3 text-sm text-status-good">บันทึกแล้ว</span>}
      </div>

      <div className="space-y-3 rounded-xl border border-kit-border bg-white p-4">
        <h3 className="font-medium text-kit-ink">ทดสอบระบบแจ้งเตือน</h3>
        <p className="text-sm text-kit-muted">
          กดปุ่มนี้เพื่อให้ระบบตรวจสอบวันหมดอายุทันที (เหมือนที่จะรันอัตโนมัติทุกวัน)
          ใช้ทดสอบว่า Telegram เชื่อมต่อถูกต้องหรือไม่
        </p>
        <button
          type="button"
          onClick={() => void runTest()}
          disabled={testing}
          className="rounded-lg border border-kit-crimson px-4 py-2 text-sm font-semibold text-kit-crimson hover:bg-kit-crimson-light disabled:opacity-60"
        >
          {testing ? "กำลังตรวจสอบ..." : "ทดสอบตอนนี้"}
        </button>
        {testResult && <p className="text-sm text-kit-ink">{testResult}</p>}
      </div>

      {settings?.updatedAt && (
        <p className="text-xs text-kit-muted">อัปเดตล่าสุด: {new Date(settings.updatedAt).toLocaleString("th-TH")}</p>
      )}
    </div>
  );
}
