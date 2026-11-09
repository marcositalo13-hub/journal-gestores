-- WhatsApp dos gestores, cadastrado pelo diretor dentro do app.
-- Idempotente: pode ser executado mais de uma vez (SQL Editor do Supabase).
--
-- O app lê e grava com a sessão do próprio leitor (chave publicável + JWT do usuário).
-- A service role NUNCA é usada pelo app. Cadastro de novos usuários está desativado,
-- então "authenticated" = os dois leitores; a Server Action ainda confere config.leitores.

create table if not exists public.contatos_gestores (
  gestor_slug    text primary key,
  whatsapp       text not null check (whatsapp ~ '^[0-9]{12,13}$'),
  atualizado_por text not null,
  atualizado_em  timestamptz not null default now()
);

alter table public.contatos_gestores enable row level security;

drop policy if exists "contatos_leitura_autenticada" on public.contatos_gestores;
create policy "contatos_leitura_autenticada"
  on public.contatos_gestores for select to authenticated using (true);

drop policy if exists "contatos_insercao_autenticada" on public.contatos_gestores;
create policy "contatos_insercao_autenticada"
  on public.contatos_gestores for insert to authenticated with check (true);

drop policy if exists "contatos_atualizacao_autenticada" on public.contatos_gestores;
create policy "contatos_atualizacao_autenticada"
  on public.contatos_gestores for update to authenticated using (true) with check (true);

-- Sem policy de DELETE (ninguém apaga pelo app) e nenhuma policy para `anon`: não há acesso público.
-- Garante os privilégios de tabela para a role authenticated (RLS faz o resto).
grant select, insert, update on public.contatos_gestores to authenticated;
