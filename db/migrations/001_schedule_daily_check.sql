-- ตั้งเวลาให้ Edge Function "check-kit-expiry" รันอัตโนมัติทุกวัน
-- ทำหลังจากสร้าง Edge Function "check-kit-expiry" บน Dashboard เรียบร้อยแล้วเท่านั้น
-- (ดูขั้นตอนใน คู่มือติดตั้ง.md ก่อน แล้วค่อยกลับมารันไฟล์นี้)
--
-- **ก่อนรัน ต้องแก้บรรทัดที่มีคำว่า YOUR-PROJECT-REF ให้เป็น Project Reference
-- ของโปรเจกต์ใหม่นี้ก่อน** (ดูได้จาก URL ของ Supabase Dashboard เช่น
-- https://supabase.com/dashboard/project/abcdefghijklmnop -> ตรง abcdefghijklmnop
-- คือ Project Reference)

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'check-kit-expiry-daily',
  '0 1 * * *', -- 01:00 UTC = 08:00 เวลาไทย ทุกวัน
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/check-kit-expiry',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- ตรวจสอบว่าตั้งเวลาสำเร็จ (ควรเห็น 1 แถว ชื่อ check-kit-expiry-daily)
select jobname, schedule, active from cron.job where jobname = 'check-kit-expiry-daily';
