# Mapa de publicações (fonte rastreada)

## Correção confirmada no workflow GitHub

A análise dos arquivos **reais** do repositório `ksgestaofarmaceutica/screenshot-match` revelou a origem da confusão anterior:

- `ksgestaofarma-institucional` é publicado pela Cloudflare Builds a partir de `prod-institucional-ksgestaofarma` (captura da configuração do Worker; `wrangler.jsonc` da branch).
- **`ks-farmaconnect-producao`**, que serve `admin.ksgestaofarma.com.br` e `fp.ksgestaofarma.com.br`, está configurado no workflow `.github/workflows/ks-farmaconnect-producao.yml` para executar `actions/checkout` em **`feat-farmaconsult-empresa-pix-20261102`** e `wrangler deploy --config wrangler.producao.jsonc`. O arquivo da branch referida confirma o nome do Worker e os dois domínios.
- `ks-farmaconnect-homologacao` usa a **mesma branch de origem** e `wrangler.homologacao.jsonc`, com secrets do ambiente homologacao.
- O workflow de produção é `workflow_dispatch` ou acionado por alteração no próprio YAML na main. **Um merge em `prod-institucional-ksgestaofarma` não publica automaticamente a interface administrativa do FarmaConnect.** Essa é a causa fundamentada de alterações de Clientes e Processos não aparecerem no subdomínio `admin`.
- `ks-portal-sistemas` assume especificamente `/sistemas*` em ambos os hostnames. Sua origem de código ainda exige confirmação.

## Plano para publicar no local correto

1. Fazer mudanças e testes na **branch real de origem** do FarmaConnect, em uma branch derivada de `feat-farmaconsult-empresa-pix-20261102` e PR com destino a ela.
2. Não alterar `prod-institucional-ksgestaofarma` nem a main só para publicar funcionalidades administrativas.
3. Testar com workflow de homologação sem segredos de produção e revisar regressões, MFA/RLS, anexos e e-mail. Não liberar envio sem confirmação do destinatário e domínio remetente.
4. Somente após aprovação, publicar no Worker `ks-farmaconnect-producao` pelo workflow existente e conferir rotas `admin` e `fp`.
5. Tornar o repositório `ksgestao` a origem única apenas quando o conteúdo realmente implantado em cada Worker tiver sido sincronizado, testado e a Cloudflare/GitHub Actions estiverem configurados para buscar nele. Até lá, o `infra/servicos.json` centraliza **governança e descoberta**, não os deploys reais.

## Regra para scripts e agentes

Nenhuma automação de CI na central `ksgestao` possui credenciais de deploy ou permissões de exclusão. A proteção é deliberada. Não duplicar segredos, tokens ou chaves service_role em arquivos do GitHub.


## Homologação de código confirmada em 14/11/2026

- PR de origem correta: [screenshot-match #15](https://github.com/ksgestaofarmaceutica/screenshot-match/pull/15), base `feat-farmaconsult-empresa-pix-20261102`, 5 arquivos alterados, merge pendente.
- GitHub Actions: run `43628207133` do workflow `KS ADM — verificar integração sem publicar`.
- **Resultado: success** na instalação reproduzível, testes, validação dos componentes CNPJ/notificações, build e `wrangler deploy --dry-run` com a configuração de produção.
- Não houve deploy real de Worker nem habilitação de envio de e-mails.
- Bloqueadores remanescentes: preview funcional do Worker admin, autenticação MFA, CNPJ consultado no navegador, processos/documentos vinculados, domínio remetente e envio controlado. Somente então aprovar merge/publicação pela pipeline existente.
