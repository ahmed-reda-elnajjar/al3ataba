-- Backup copy of the public catalogue (used only when Firebase reaches its free daily limit).
-- Run once in Supabase → SQL Editor.
create table if not exists public.catalog_snapshot (
  id   int primary key,
  data jsonb not null,
  at   timestamptz not null default now()
);
-- Nobody can read/write it from the browser; only the server (service key) can.
alter table public.catalog_snapshot enable row level security;
