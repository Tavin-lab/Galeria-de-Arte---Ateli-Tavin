# Publicar sua galeria com painel administrativo

Este projeto mantém o design atual e usa Supabase para login, banco de dados e armazenamento de imagens, além da Vercel para hospedagem do site. O código é estático (HTML, CSS e JavaScript).

## Antes de começar

Você vai criar contas gratuitas na Vercel e no Supabase. Os planos gratuitos têm limites de uso e podem mudar; confira os limites atuais nos próprios serviços.

## 1. Criar o projeto Supabase

1. Acesse https://supabase.com e crie um projeto.
2. Guarde a senha do banco em local seguro.
3. Abra **SQL Editor** no painel Supabase.
4. Abra o arquivo `supabase-setup.sql`, copie todo o conteúdo e execute no SQL Editor.
5. Em **Project Settings > API** (ou seção equivalente de API), copie o **Project URL** e a chave **anon/public**.
6. Abra `config.js` e substitua os dois valores de exemplo:

```js
window.GALERIA_SUPABASE = {
  url: "https://SEU-PROJETO.supabase.co",
  anonKey: "SUA-CHAVE-ANON-PUBLIC"
};
```

Use o URL e a chave anon/public do seu próprio projeto. **Nunca use a chave `service_role` no site ou em arquivos publicados.** A chave pública é esperada no navegador; as políticas RLS do SQL controlam o que pode ser alterado.

## 2. Criar o usuário administrador

1. No Supabase, abra **Authentication > Users** e crie/adicone seu usuário com o e-mail que usará no painel. Se disponível, desative o cadastro público de novos usuários em **Authentication > Settings/Signups** para que apenas contas criadas por você possam entrar.
2. Copie o e-mail usado e abra o SQL Editor.
3. Execute este comando, substituindo `SEU-EMAIL@EXEMPLO.COM` pelo e-mail exato da sua conta:

```sql
insert into public.gallery_admins (user_id)
select id from auth.users where lower(email) = lower('SEU-EMAIL@EXEMPLO.COM')
on conflict (user_id) do nothing;
```

O comando não cria o usuário; apenas autoriza como administrador uma conta que já existe. Não compartilhe a senha com ninguém.

## 3. Testar localmente

1. Abra a pasta do projeto no VS Code.
2. Use a extensão **Live Server** para abrir `index.html` (ou use um servidor local equivalente). Evite testar autenticação abrindo o arquivo como `file://`.
3. Clique em **Entrar no painel** e entre com o e-mail e senha cadastrados.
4. Adicione um projeto de teste e confirme que ele aparece na galeria.
5. Abra o Supabase > **Table Editor > gallery_projects** para verificar os registros e **Storage > gallery-images** para verificar as imagens.

## 4. Publicar gratuitamente na Vercel

1. Crie uma conta em https://vercel.com.
2. Crie um repositório Git no GitHub e envie os arquivos desta pasta. Inclua `index.html`, `style.css`, `script.js`, `config.js`, `supabase-setup.sql` e este README. O SQL também pode ficar no repositório, mas não precisa ser servido pelo site.
3. Na Vercel, escolha **Add New > Project** e importe o repositório.
4. Como é um site estático, não precisa de comando de build. Se solicitado, deixe o diretório raiz como a pasta que contém `index.html` e publique.
5. Abra o endereço gerado pela Vercel e teste a galeria e o login.
6. Em Supabase > Authentication > URL Configuration, defina o endereço do site publicado como **Site URL**. Se o login for redirecionado, adicione também o domínio da Vercel às URLs permitidas.

Se preferir não usar GitHub, a Vercel pode oferecer outras formas de implantação, mas a importação de um repositório costuma ser o caminho mais simples para atualizar o site depois.

## Como funciona

- Visitantes podem ver os projetos publicados, mas não editar.
- Só usuários que existem no Supabase e estão listados em `gallery_admins` podem usar o painel e alterar projetos/imagens.
- Os arquivos de imagem ficam no bucket `gallery-images`; o banco guarda os metadados e URLs.
- Os exemplos ilustrativos continuam no código até você marcar **Ocultar exemplos de demonstração** no painel.
- O armazenamento local do navegador pode manter preferências antigas. Para conferir os dados oficiais online, recarregue a página depois de configurar o Supabase.

## Limitações e cuidados

- O painel foi preparado para arquivos de imagem comuns e SVG. Não envie arquivos privados ou conteúdo que não queira que seja público: as imagens da galeria são publicamente acessíveis por URL.
- O bucket de imagens é público para permitir a visualização da galeria sem login; escrita e exclusão são restritas por políticas RLS aos administradores.
- A exclusão de um projeto remove o registro do banco, mas versões antigas das imagens no Storage podem permanecer ocupando espaço. Apague arquivos órfãos em Storage quando necessário.
- Mantenha cópias de segurança das artes originais.
- Se houver erro ao sincronizar, confira se o SQL foi executado, se o e-mail foi adicionado a `gallery_admins`, e se `config.js` contém o URL e a chave corretos.
