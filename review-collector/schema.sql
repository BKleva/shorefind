-- Review Collector schema
-- Run this once in a NEW Supabase project's SQL editor (Project Settings > SQL Editor).
-- Do not run this against the Shoreworks catalog project — this is a separate product.

create extension if not exists pgcrypto;

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  google_place_id text,
  gate_enabled boolean not null default true,
  brand_color text default '#0D3D54',
  logo_url text,
  created_at timestamptz default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  created_at timestamptz default now()
);

create table if not exists review_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  token text unique not null,
  channel text not null,               -- 'email' | 'sms' | 'both'
  status text not null default 'sent', -- sent -> opened -> routed_google | private_feedback
  rating int,
  sent_at timestamptz default now(),
  opened_at timestamptz,
  responded_at timestamptz
);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  review_request_id uuid not null references review_requests(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  rating int not null,
  comment text,
  created_at timestamptz default now()
);

create index if not exists idx_customers_business on customers(business_id);
create index if not exists idx_requests_business on review_requests(business_id);
create index if not exists idx_requests_token on review_requests(token);
create index if not exists idx_feedback_business on feedback(business_id);

-- Row Level Security: every table is only readable/writable by the owning
-- business's authenticated owner. The public-facing r.html page never talks
-- to Supabase directly — it only calls the Netlify functions, which use the
-- service_role key (bypasses RLS) server-side. So no anon/public policies
-- are needed here at all.

alter table businesses enable row level security;
alter table customers enable row level security;
alter table review_requests enable row level security;
alter table feedback enable row level security;

create policy "owner can manage own business" on businesses
  for all using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "owner can manage own customers" on customers
  for all using (
    exists (select 1 from businesses b where b.id = customers.business_id and b.owner_user_id = auth.uid())
  )
  with check (
    exists (select 1 from businesses b where b.id = customers.business_id and b.owner_user_id = auth.uid())
  );

create policy "owner can view own requests" on review_requests
  for select using (
    exists (select 1 from businesses b where b.id = review_requests.business_id and b.owner_user_id = auth.uid())
  );

create policy "owner can view own feedback" on feedback
  for select using (
    exists (select 1 from businesses b where b.id = feedback.business_id and b.owner_user_id = auth.uid())
  );

-- Storage bucket for business logos. Public read (so logos render in emails
-- and on the public r.html page without signed URLs); writes are restricted
-- to the owning business's own folder, keyed by business id.

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy "Public read access to logos" on storage.objects
  for select using (bucket_id = 'logos');

create policy "Owners can upload their business logo" on storage.objects
  for insert with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] in (
      select id::text from businesses where owner_user_id = auth.uid()
    )
  );

create policy "Owners can update their business logo" on storage.objects
  for update using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] in (
      select id::text from businesses where owner_user_id = auth.uid()
    )
  );
