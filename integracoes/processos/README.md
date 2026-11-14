# Central de Processos e Protocolos — KS

**Status:** backend operacional para rascunhos e aprovações, sem disparos reais homologados. Este diretório é um pacote de integração para o painel atual da Cloudflare, **não** um novo site KS.

## Ambiente confirmado

- Supabase: `skysdjpfqpmavtqbzxpg`
- Função protegida: `ks-process-notifications` (JWT obrigatório, usuário administrativo com MFA/AAL2)
- Banco: `administrative_processes`, `clients`, `client_contacts`, `documents` e `ks_process_notification*`
- Bucket privado: `ks-documents`

## Como conectar ao frontend atual

1. Recuperar **o código-fonte do projeto Cloudflare Workers/Pages efetivamente em produção** e seu método de deploy. Não supor que este repositório já está conectado.
2. Copiar o cliente `ks-process-notifications-client.ts` e usar a instância Supabase autenticada já existente no painel.
3. Incluir uma rota administrativa para Processos → Notificações com MFA e tratamento dos erros de autorização.
4. Ao criar o aviso, utilizar o `process_id` existente e vincular comprovantes previamente armazenados no bucket privado.
5. Só disponibilizar Enviar após a homologação, configuração segura de `RESEND_API_KEY`, `KS_PROCESS_EMAIL_FROM` e `KS_PROCESS_EMAIL_ENABLED`.
6. Homologar com dados de teste e destinatário autorizado: criar rascunho, aprovar, validar anexos e saída do provedor; validar entregas por webhook antes de marcar como `delivered`.

## Cuidados

- Nunca incluir `service_role`, segredos de Resend ou tokens em JavaScript do navegador.
- A API aceita apenas destinatários registrados no cliente ou contatos vinculados.
- Um envio aceito pelo serviço de e-mail **não** equivale a entrega confirmada.
- Rever MIME/nomes de anexos antes do uso real (o backend v1 usa extensão PDF).
- O backend v1 ainda requer validação end-to-end autenticada; não habilitar e-mails em produção só porque a função está ativa.
- Fazer backup e revisão do deployment Cloudflare antes de qualquer alteração.

## Publicação

Nenhum deploy Cloudflare foi realizado por este commit. O código principal do painel não foi localizado nas integrações conectadas.


## Interface pronta no repositório

- `KsProcessosNotificacoes.tsx`: componente React integrado às tabelas existentes e à Edge Function.
- Propriedade obrigatória `supabase`: passe a instância **autenticada do painel**, sem criar segundo login.
- A interface busca clientes, contatos, processos e documentos respeitando as RLS existentes.
- Exemplo de incorporação à rota administrativa existente:

```tsx
import KsProcessosNotificacoes from "./integracoes/processos/KsProcessosNotificacoes";
// Em uma rota já protegida por autenticação administrativa/MFA:
<KsProcessosNotificacoes supabase={supabase} />
```

A aplicação hospedada na Cloudflare precisa importar o componente usando o caminho correto relativo a seu projeto. A rota e o menu devem ser adaptados à estrutura real; nenhuma implantação automática foi configurada.
