-- Inscrições de Web Push (uma por aparelho/navegador do leitor).
-- Idempotente: pode ser executado mais de uma vez (SQL Editor do Supabase).
--
-- O app grava e lê as próprias inscrições com a sessão do leitor (chave publicável + JWT).
-- O ENVIO das notificações roda no servidor com a service role (ignora RLS) e atualiza
-- ultimo_envio/ativo; por isso não há policy de UPDATE para os usuários.

create table if not exists public.push_inscricoes (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  endpoint     text unique not null,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  criado_em    timestamptz default now(),
  ultimo_envio timestamptz,
  ativo        boolean default true
);

create index if not exists push_inscricoes_email_idx on public.push_inscricoes (email);

alter table public.push_inscricoes enable row level security;

drop policy if exists "push_select_proprias" on public.push_inscricoes;
create policy "push_select_proprias"
  on public.push_inscricoes for select to authenticated
  using (email = (auth.jwt() ->> 'email'));

drop policy if exists "push_insert_proprias" on public.push_inscricoes;
create policy "push_insert_proprias"
  on public.push_inscricoes for insert to authenticated
  with check (email = (auth.jwt() ->> 'email'));

drop policy if exists "push_delete_proprias" on public.push_inscricoes;
create policy "push_delete_proprias"
  on public.push_inscricoes for delete to authenticated
  using (email = (auth.jwt() ->> 'email'));

-- Sem policy de UPDATE e nenhuma para `anon`: não há acesso público.
grant select, insert, delete on public.push_inscricoes to authenticated;
