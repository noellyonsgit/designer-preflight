create table public.profiles (
  id uuid primary key references auth.users,
  name text,
  avatar_url text
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  email text not null,
  address text not null,
  total numeric not null,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Anyone can update profiles" on public.profiles
  for update using (true);
