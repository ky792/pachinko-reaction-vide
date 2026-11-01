-- =====================================================================
-- なおしてナビ 初期スキーマ【設計ドラフト・未適用】
-- Phase 2 でローカル Supabase（supabase start）に適用し、RLS をテストしてから使う。
-- 本番プロジェクトへの適用は承認後に行うこと。
--
-- 方針
--  * 店舗の個人情報（連絡先）は request_contacts に分離し、RLS で
--    「担当に決定した業者」と「管理者」だけが読めるようにする。
--  * 業者の受諾は accept_offer() 関数（SECURITY DEFINER）経由のみ。
--    行ロック＋状態条件付き更新で二重マッチングを防ぐ。
--  * 店舗は匿名で依頼するため、依頼の作成・進捗参照はサーバー側（service role）
--    の Route Handler / Server Action からのみ行い、anon には直接権限を与えない。
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- 列挙型 ----------
create type equipment_type as enum ('refrigerator', 'freezer', 'cold_table');
create type request_status as enum ('received','matching','no_match','matched','in_progress','completed','cancelled');
create type vendor_status as enum ('pending','approved','rejected','suspended');
create type offer_status as enum ('pending','accepted','declined','superseded');
create type fee_status as enum ('recorded','invoiced','paid','waived');
create type app_role as enum ('vendor','admin');

-- ---------- ユーザーと役割 ----------
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role app_role not null,
  vendor_id uuid,           -- role = vendor のとき必須
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where user_id = auth.uid() and role = 'admin');
$$;

create or replace function my_vendor_id() returns uuid
language sql stable security definer set search_path = public as $$
  select vendor_id from profiles where user_id = auth.uid() and role = 'vendor';
$$;

-- ---------- 業者 ----------
create table vendors (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (char_length(company_name) between 1 and 80),
  representative text not null,
  phone text not null,
  email text not null,
  equipment_types equipment_type[] not null check (cardinality(equipment_types) > 0),
  areas text[] not null check (cardinality(areas) > 0),
  weekly_hours jsonb not null,           -- {"1":{"start":"09:00","end":"18:00"},...}
  accepting_today boolean not null default false,
  avg_response_minutes int not null default 30,
  status vendor_status not null default 'pending',
  license_note text,
  review_note text,
  applied_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table profiles add constraint profiles_vendor_fk foreign key (vendor_id) references vendors(id);

-- ---------- 依頼（個人情報を含まない部分） ----------
create table requests (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  -- 進捗ページ用の推測困難なトークン（URL に使う。ハッシュのみ保存）
  access_token_hash text not null,
  version int not null default 1,
  status request_status not null default 'received',
  equipment_type equipment_type not null,
  manufacturer text,
  symptoms text[] not null check (cardinality(symptoms) > 0),
  symptom_note text,
  area text not null,
  visit_date date not null,
  visit_start time not null,
  visit_end time not null check (visit_end > visit_start),
  assigned_vendor_id uuid references vendors(id),
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 決定済みなら担当業者が必ずいる
  check ((status in ('matched','in_progress','completed')) = (assigned_vendor_id is not null) or status = 'cancelled')
);

-- ---------- 依頼者の連絡先（個人情報） ----------
create table request_contacts (
  request_id uuid primary key references requests(id) on delete cascade,
  store_name text not null,
  contact_name text not null,
  phone text not null,
  address text not null,
  email text,
  -- 保存期間経過後に匿名化するための日時（運用ルールで設定）
  purge_after timestamptz not null default now() + interval '2 years'
);

-- ---------- 通知（オファー） ----------
create table offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  vendor_id uuid not null references vendors(id),
  status offer_status not null default 'pending',
  notified_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (request_id, vendor_id)
);
-- 1依頼につき accepted は最大1件（DB レベルでの二重マッチング最終防衛線）
create unique index offers_one_accepted_per_request on offers(request_id) where status = 'accepted';

-- ---------- 完了報告・手数料 ----------
create table completions (
  request_id uuid primary key references requests(id) on delete cascade,
  vendor_id uuid not null references vendors(id),
  repair_amount_yen int not null check (repair_amount_yen >= 0),
  work_summary text not null,
  needs_revisit boolean not null default false,
  reported_at timestamptz not null default now()
);

create table fees (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references requests(id),  -- 1依頼1件
  vendor_id uuid not null references vendors(id),
  repair_amount_yen int not null check (repair_amount_yen >= 0),
  fee_yen int not null check (fee_yen >= 0),
  rate numeric(5,4) not null,
  cap_yen int not null,
  status fee_status not null default 'recorded',
  recorded_at timestamptz not null default now()
);

create table timeline_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  type text not null,
  message text not null,
  at timestamptz not null default now()
);

-- 管理者による個人情報閲覧ログ
create table pii_access_logs (
  id bigserial primary key,
  user_id uuid not null,
  request_id uuid not null,
  reason text,
  at timestamptz not null default now()
);

-- =====================================================================
-- RLS
-- =====================================================================
alter table profiles enable row level security;
alter table vendors enable row level security;
alter table requests enable row level security;
alter table request_contacts enable row level security;
alter table offers enable row level security;
alter table completions enable row level security;
alter table fees enable row level security;
alter table timeline_events enable row level security;
alter table pii_access_logs enable row level security;

-- profiles: 自分の行のみ参照。変更は管理者のみ
create policy profiles_self on profiles for select using (user_id = auth.uid() or is_admin());
create policy profiles_admin on profiles for all using (is_admin()) with check (is_admin());

-- vendors: 自社の行と管理者。業者が直接更新できるのは accepting_today のみ（関数経由）
create policy vendors_read on vendors for select using (id = my_vendor_id() or is_admin());
create policy vendors_admin on vendors for all using (is_admin()) with check (is_admin());

-- requests: 自社に通知された依頼のみ（業者）、管理者は全件
create policy requests_vendor_read on requests for select using (
  is_admin() or exists (select 1 from offers o where o.request_id = requests.id and o.vendor_id = my_vendor_id())
);
create policy requests_admin on requests for update using (is_admin()) with check (is_admin());

-- request_contacts: 担当に決定した業者と管理者のみ
create policy contacts_assigned_vendor on request_contacts for select using (
  is_admin() or exists (
    select 1 from requests r
    where r.id = request_contacts.request_id
      and r.assigned_vendor_id = my_vendor_id()
      and r.status in ('matched','in_progress','completed')
  )
);

-- offers: 自社分のみ
create policy offers_vendor_read on offers for select using (vendor_id = my_vendor_id() or is_admin());

-- completions / fees: 自社分と管理者。書き込みは関数経由のみ
create policy completions_read on completions for select using (vendor_id = my_vendor_id() or is_admin());
create policy fees_read on fees for select using (vendor_id = my_vendor_id() or is_admin());
create policy fees_admin_update on fees for update using (is_admin()) with check (is_admin());

-- timeline: 管理者と、通知を受けた業者
create policy timeline_read on timeline_events for select using (
  is_admin() or exists (select 1 from offers o where o.request_id = timeline_events.request_id and o.vendor_id = my_vendor_id())
);

create policy pii_logs_admin on pii_access_logs for select using (is_admin());

-- =====================================================================
-- 業務関数（二重マッチング防止など）
-- =====================================================================

-- 受諾: 行ロック → 状態・version・オファーを検査 → 決定
create or replace function accept_offer(p_request_id uuid, p_expected_version int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_vendor uuid := my_vendor_id();
  v_req requests%rowtype;
begin
  if v_vendor is null or not exists (select 1 from vendors where id = v_vendor and status = 'approved') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_req from requests where id = p_request_id for update;  -- 同時受諾を直列化
  if not found then raise exception 'not_found'; end if;
  if v_req.status <> 'matching' or v_req.assigned_vendor_id is not null then
    raise exception 'conflict: already matched' using errcode = '40001';
  end if;
  if v_req.version <> p_expected_version then
    raise exception 'conflict: stale version' using errcode = '40001';
  end if;

  update offers set status = 'accepted', responded_at = now()
   where request_id = p_request_id and vendor_id = v_vendor and status = 'pending';
  if not found then raise exception 'forbidden: no pending offer' using errcode = '42501'; end if;

  update offers set status = 'superseded'
   where request_id = p_request_id and vendor_id <> v_vendor and status = 'pending';

  update requests
     set status = 'matched', assigned_vendor_id = v_vendor, version = version + 1, updated_at = now()
   where id = p_request_id;

  insert into timeline_events(request_id, type, message)
  select p_request_id, 'accepted', company_name || ' が対応を受諾しました' from vendors where id = v_vendor;
end;
$$;

-- 完了報告と手数料記録（料率・上限は引数でなくサーバー設定から渡す想定）
create or replace function complete_request(
  p_request_id uuid, p_amount int, p_summary text, p_revisit boolean,
  p_rate numeric default 0.08, p_cap int default 8000
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_vendor uuid := my_vendor_id();
  v_req requests%rowtype;
begin
  select * into v_req from requests where id = p_request_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_req.assigned_vendor_id is distinct from v_vendor then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_req.status not in ('matched','in_progress') then raise exception 'invalid_state'; end if;
  if p_amount < 0 then raise exception 'invalid_input'; end if;

  insert into completions(request_id, vendor_id, repair_amount_yen, work_summary, needs_revisit)
  values (p_request_id, v_vendor, p_amount, p_summary, p_revisit);

  insert into fees(request_id, vendor_id, repair_amount_yen, fee_yen, rate, cap_yen)
  values (p_request_id, v_vendor, p_amount, least(floor(p_amount * p_rate)::int, p_cap), p_rate, p_cap);

  update requests set status = 'completed', version = version + 1, updated_at = now() where id = p_request_id;
  insert into timeline_events(request_id, type, message) values (p_request_id, 'completed', '修理完了の報告がありました');
end;
$$;

revoke all on function accept_offer(uuid, int) from public, anon;
revoke all on function complete_request(uuid, int, text, boolean, numeric, int) from public, anon;
grant execute on function accept_offer(uuid, int) to authenticated;
grant execute on function complete_request(uuid, int, text, boolean, numeric, int) to authenticated;
