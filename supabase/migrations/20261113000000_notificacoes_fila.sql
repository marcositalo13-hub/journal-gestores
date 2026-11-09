-- Fila de notificações (webhook da monday → regras → fila → envio pelo cron).
-- Idempotente: pode ser executado mais de uma vez (SQL Editor do Supabase).
--
-- Só o servidor (service role, que ignora RLS) lê e grava. RLS ligada SEM nenhuma policy:
-- usuários autenticados e anônimos não enxergam nem alteram nada.

create table if not exists public.notificacoes_fila (
  id            uuid primary key default gen_random_uuid(),
  chave_dedupe  text unique not null,
  regra         text not null,
  prioridade    text not null check (prioridade in ('imediata', 'normal')),
  titulo        text not null,
  corpo         text not null,
  url           text not null,
  item_id       text not null,
  criado_em     timestamptz default now(),
  enviado_em    timestamptz
);

-- pendentes (enviado_em nulo) em ordem de chegada
create index if not exists notificacoes_fila_pendentes_idx on public.notificacoes_fila (criado_em) where enviado_em is null;

alter table public.notificacoes_fila enable row level security;
-- (sem policies de propósito)
