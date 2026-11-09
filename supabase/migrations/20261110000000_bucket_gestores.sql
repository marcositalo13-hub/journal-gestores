-- Fotos dos gestores: bucket PRIVADO + leitura apenas para usuários autenticados.
-- Idempotente: pode ser executado mais de uma vez (SQL Editor do Supabase).
--
-- O app gera URLs assinadas de curta duração NO SERVIDOR, com a sessão do próprio leitor
-- (chave publicável + JWT do usuário). A service role NUNCA vai para o Vercel.

-- 1) Bucket privado (o script `npm run fotos:bucket` cria o mesmo bucket pela API de Storage).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gestores', 'gestores', false, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Leitura: só usuários autenticados, só deste bucket.
drop policy if exists "gestores_leitura_autenticada" on storage.objects;
create policy "gestores_leitura_autenticada"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'gestores');

-- 3) Sem policies de INSERT/UPDATE/DELETE: com RLS ativa em storage.objects, usuários autenticados
--    e anônimos não conseguem enviar, alterar nem apagar. O envio é feito pelo script local com a
--    service role (que ignora RLS) e jamais pelo app.
--    Nenhuma policy para `anon`: não há acesso público.
