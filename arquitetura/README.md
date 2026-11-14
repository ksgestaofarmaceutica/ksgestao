> **Atualização de segurança e origem central (14/11/2026):** este repositório `ksgestao` é **público** e deve permanecer limitado a inventário não sensível, documentação e referências. O código operacional privado e a governança técnica de deploy foram centralizados inicialmente no repositório **privado** `ksgestaofarmaceutica/screenshot-match`, dentro de `ops/` (PR #16). Não migrar código-fonte privado, credenciais nem backups para `ksgestao`. A consolidação completa em um único repositório privado ainda está em andamento; os Workers atuais permanecem ativos.

# KS Gestão Farmacêutica — consolidação controlada

**Estado: fase 1 (inventário e preparação), nenhuma migração executada.**

## Regras obrigatórias

1. **Sem indisponibilidade planejada:** a plataforma atual continua atendendo tráfego durante todo o trabalho. Zero downtime absoluto não é garantível; reduzir risco usando deploy paralelo, testes, corte reversível e monitoração.
2. **Uma fonte de verdade para o portal:** código-fonte consolidado em um repositório principal, com módulos internos, pipeline CI/CD rastreável e ambiente de homologação. Serviços especializados podem permanecer em Workers independentes **gerenciados pelo mesmo repositório**.
3. **Desativar antes de apagar:** só excluir Workers, DNS, rotas, repositórios, buckets, dados ou credenciais com inventário, prova de não utilização, exportação/backup testado, retenção legal verificada, período de observação, aprovação e janela de reversão encerrada.
4. **Nada de mesclar banco de dados sem plano de migração:** o Supabase KS permanece em operação; Supabase de lojas distintas não é automaticamente absorvido.
5. **Nenhuma alteração em produção por este plano:** este repositório contém documentação e referências; não está configurado como origem verificada dos Workers em produção.

## Inventário inicial — confirmado em 14/11/2026

| Recurso | Evidência | Estado / próxima ação |
|---|---|---|
| Cloudflare Worker `ksgestaofarma-institucional` | Capturas da Cloudflare; domínio institucional; builds GitHub de `ksgestaofarmaceutica/screenshot-match`, branch `prod-institucional-ksgestaofarma` | Em produção; **não excluir** |
| Cloudflare Worker `ks-farmaconnect-producao` | Captura da aba Domains: custom domains `fp.ksgestaofarma.com.br` e `admin.ksgestaofarma.com.br` | Em produção; origem do código **não confirmada**; **não excluir** |
| Cloudflare Worker `ks-portal-sistemas` | Captura da aba Domains: rotas `admin.ksgestaofarma.com.br/sistemas*` e `ksgestaofarma.com.br/sistemas*` | Em produção; **não excluir** |
| Cloudflare Worker `ks-farmaconnect-homologacao` | Captura da lista Workers & Pages | Uso atual por verificar; não excluir |
| Cloudflare Worker `ks-gestao-crm-isolado` | Captura da lista Workers & Pages | Uso atual por verificar; não excluir |
| Cloudflare Worker `ksgestaofarmaceutica-screenshot-match` | Captura da lista Workers & Pages | Uso atual por verificar; não excluir |
| Cloudflare Worker `screenshot-match` | Captura da lista Workers & Pages | Uso atual por verificar; não excluir |
| GitHub `ksgestaofarmaceutica/screenshot-match` | Conector GitHub; código do institucional; branches `main` e `prod-institucional-ksgestaofarma` | Origem **confirmada apenas** para o Worker institucional |
| GitHub `ksgestaofarmaceutica/ksgestao` | Conector GitHub; arquivos de integração avulsos | Candidato a **repositório central**, ainda não repositório operacional de produção |
| GitHub `ksgestaofarmaceutica/pixel-perfect-replica` | Conector GitHub | Uso a verificar |
| GitHub `stinovafarma-cmd/pixel-perfect-match` | Conector GitHub | Uso a verificar |
| GitHub `stinovafarma-cmd/flowaudit` | Conector GitHub | Projeto especializado; não excluir |
| GitHub `stinovafarma-cmd/ks-cloud-backup-homologacao` | Conector GitHub | Projeto especializado; não excluir |
| GitHub `BancoDrogariaPopular/drogariapopularcearense` | Conector GitHub | Negócio separado; fora do escopo inicial |
| Supabase `ks-gestao-farmaceutica` (`skysdjpfqpmavtqbzxpg`) | Conector Supabase, estado ACTIVE_HEALTHY | Banco principal KS, preservar |
| Supabase `farmacia-oficial` (`urlxolfntmfukooiyawi`) | Conector Supabase | Banco de loja, preservar |
| Supabase `farmacia-parente` (`iwcfixugxgvntbvvhmmy`) | Conector Supabase | Banco de loja, preservar |

**Atenção:** o domínio `admin.ksgestaofarma.com.br` pertence ao Worker `ks-farmaconnect-producao` na captura. Logo, código em `screenshot-match` e publicação em `ksgestaofarma-institucional` não comprovam alteração efetiva em `/admin/clientes`. As funcionalidades de CNPJ e notificações devem ser migradas/testadas no Worker realmente responsável antes de anunciar prontidão.

## Arquitetura-alvo

- **Um repositório central:** monorepo `ksgestao` após proveniência de cada Worker e histórico serem verificados; adotar monorepo somente para o código comprovadamente atual.
- **Um ponto de entrada do portal:** menu, design system e autenticação consistentes, mantendo rotas antigas por redirecionamento controlado/roteamento reversível.
- **Módulos no portal:** institucional, administrativo/CRM, processos/notificações, FarmaConnect, Insights e demais soluções existentes.
- **Infra separada quando necessário:** workers de jobs, integrações, telemetria e agentes Windows, todos versionados e implantados via o mesmo pipeline.
- **Banco:** Supabase principal e segregação apropriada por CNPJ/loja; preservar RLS, backups e migrações.
- **Environments:** desenvolvimento, homologação e produção com variáveis/credenciais segregadas. Nenhum preview recebe segredos de produção.
- **Deploy:** um pipeline por módulo com artefato imutável, smoke tests, canary/rollback e registro de commits.

## Critérios para troca de tráfego por módulo

- Código-fonte do serviço atual identificado e espelhado em tag/commit; dependências e configuração exportadas.
- Build determinístico e testes de tipo/lint/unidade/smoke passando.
- Homologação por usuários e rotas reais, inclusive `/admin/clientes`, `/admin/processos`, `/sistemas` e `fp`.
- Autenticação MFA/RLS, documentos, integrações e envio de e-mail testados em ambiente controlado.
- Nova versão paralela disponível, logs/alertas monitorados, rollout pequeno e reversão imediata definida.
- Ausência de erro novo e métricas estáveis durante período de observação definido pela operação.

## Política de limpeza final

Aplicar critérios do arquivo `retirada-segura.md`. Nada será apagado automaticamente.


## Complemento do inventário de Supabase

Consulta direta ao projeto `skysdjpfqpmavtqbzxpg`: **61 tabelas públicas** e **16 Edge Functions**. Funções identificadas: `farmaconsulta-login-cnpj`, `farmaconsulta-create-pix`, `farmaconsulta-pix-webhook`, `farmaconsulta-orders-test`, `ks-archive-secure-file`, `ks-archive-demo-provision`, `ks-store-admin-provision`, `ks-store-staff-provision`, `ks-store-staff-login`, `ks-demo-staff-provision`, `ks-demo-staff-login`, `ks-insights-agent`, `ks-insights-client-admin`, `ks-insights-updates`, `ks-insights-online-price-pilot`, `ks-process-notifications`.

**Ponto de atenção:** neste projeto, `clients`, `administrative_processes`, `documents` e `ks_process_notifications` registram 0 linhas segundo as métricas disponíveis. Antes de migrar ou apagar, verificar se a interface realmente utiliza este projeto ou outro backend/ambiente. Contagem de 0 linhas não significa inutilização.
