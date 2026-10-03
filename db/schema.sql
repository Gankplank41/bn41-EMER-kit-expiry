-- BN41 แจ้งเตือนยากล่องฉุกเฉิน — Database schema
-- ระบบนี้แยกจาก BN41 MED-TRACK และ BN41 แจ้งเตือนสต๊อกยา โดยสมบูรณ์
-- รันไฟล์นี้บน Supabase โปรเจกต์ใหม่ (ไม่ใช่โปรเจกต์เดิม) — ดูขั้นตอนในคู่มือติดตั้งที่แนบมาด้วย
--
-- วิธีใช้: Supabase Dashboard ของโปรเจกต์ใหม่ -> SQL Editor -> New query
-- วางไฟล์นี้ทั้งหมด -> กด Run (ครั้งเดียวตอนตั้งระบบ)

-- ============================================================
-- 1) profiles — ผู้ใช้ที่ล็อกอินได้ (ผู้ใช้คนเดียวคือเภสัชกร แต่ยังต้องล็อกอิน
--    เพราะแอปเปิดผ่านอินเทอร์เน็ตสาธารณะ)
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "signed-in user can see own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

grant select on public.profiles to authenticated;

-- ============================================================
-- 2) kit_boxes — กล่องยาฉุกเฉินแต่ละใบ (เช่น กล่อง 1 ER, กล่อง 2, กล่อง 3, กล่องใส)
-- ============================================================

create table public.kit_boxes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.kit_boxes enable row level security;

create policy "signed-in staff can manage kit boxes"
  on public.kit_boxes for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.kit_boxes to authenticated;

-- ============================================================
-- 3) kit_items — รายการยาตามเช็คลิสต์ของแต่ละกล่อง (1 แถว = 1 ชื่อยาใน 1 กล่อง)
-- ============================================================

create table public.kit_items (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.kit_boxes (id) on delete cascade,
  seq int,
  drug_name text not null,
  strength text,
  unit text,
  standard_qty numeric, -- จำนวนที่ควรมีตามเช็คลิสต์ (ไว้อ้างอิง — ระบบนี้ไม่แจ้งเตือนเรื่องจำนวน)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index kit_items_box_id_idx on public.kit_items (box_id);

alter table public.kit_items enable row level security;

create policy "signed-in staff can manage kit items"
  on public.kit_items for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.kit_items to authenticated;

-- ============================================================
-- 4) kit_item_lots — ล็อตของแต่ละรายการยา (บางรายการมีได้มากกว่า 1 ล็อต
--    เช่น ของเก่าใช้ก่อน + ของใหม่สำรอง)
-- ============================================================

create table public.kit_item_lots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.kit_items (id) on delete cascade,
  lot_no text,
  quantity numeric not null default 0,
  expiry_date date, -- null = ไม่มีของ/ไม่ทราบวันหมดอายุ
  flagged boolean not null default false, -- true = วันที่นำเข้ามาดูผิดปกติ ต้องตรวจสอบ
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index kit_item_lots_item_id_idx on public.kit_item_lots (item_id);
create index kit_item_lots_expiry_date_idx on public.kit_item_lots (expiry_date);

alter table public.kit_item_lots enable row level security;

create policy "signed-in staff can manage kit item lots"
  on public.kit_item_lots for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.kit_item_lots to authenticated;

-- ============================================================
-- 5) alert_settings — การตั้งค่าแจ้งเตือน (แถวเดียวตายตัว id = 1)
--    ห้ามเก็บ Telegram Bot Token ในตารางนี้ — โทเคนเก็บเป็น Edge Function
--    secret เท่านั้น (ดูคู่มือติดตั้ง)
-- ============================================================

create table public.alert_settings (
  id int primary key default 1,
  telegram_chat_id text,
  expiry_alert_months int[] not null default '{6,3,1}',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint alert_settings_singleton check (id = 1)
);

insert into public.alert_settings (id) values (1);

alter table public.alert_settings enable row level security;

create policy "signed-in staff can read alert settings"
  on public.alert_settings for select
  to authenticated
  using (true);

create policy "signed-in staff can update alert settings"
  on public.alert_settings for update
  to authenticated
  using (true)
  with check (true);

grant select, update on public.alert_settings to authenticated;

-- ============================================================
-- 6) notification_log — บันทึกการแจ้งเตือนที่ส่งไปแล้ว (กันส่งซ้ำ)
-- ============================================================

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.kit_item_lots (id) on delete cascade,
  threshold_key text not null,
  sent_at timestamptz not null default now(),
  telegram_ok boolean not null default true,
  detail text
);

create index notification_log_lookup_idx
  on public.notification_log (lot_id, threshold_key);

alter table public.notification_log enable row level security;

create policy "signed-in staff can read notification log"
  on public.notification_log for select
  to authenticated
  using (true);

-- เฉพาะ Edge Function (service_role) เท่านั้นที่เขียนตารางนี้ได้

grant select on public.notification_log to authenticated;

-- ============================================================
-- 7) กล่องเริ่มต้น 4 ใบ ตามไฟล์เช็คลิสต์ที่ใช้อยู่ — แก้ชื่อ/เพิ่ม/ลบได้ภายหลัง
-- ============================================================

insert into public.kit_boxes (name, sort_order) values
  ('กล่อง 1 ER', 1),
  ('กล่อง 2', 2),
  ('กล่อง 3', 3),
  ('กล่องใส', 4);

-- ============================================================
-- เสร็จสิ้น — ต่อไปให้สร้าง Edge Function (check-kit-expiry) ตามคู่มือติดตั้ง
-- ============================================================
