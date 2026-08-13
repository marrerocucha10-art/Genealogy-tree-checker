create table if not exists public.digital_products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null,
  access_type text not null check (access_type in ('subscription', 'purchase')),
  required_tier text,
  storage_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.digital_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.digital_products(id) on delete cascade,
  source text not null check (source in ('subscription', 'purchase')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table public.digital_products enable row level security;
alter table public.digital_entitlements enable row level security;

create policy "Anyone can view product previews"
  on public.digital_products for select using (true);

create policy "Users can view their own entitlements"
  on public.digital_entitlements for select using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('digital-products', 'digital-products', false)
on conflict (id) do nothing;
