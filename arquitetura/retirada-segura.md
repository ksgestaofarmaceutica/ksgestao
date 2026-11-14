# Protocolo de retirada e exclusão

Nenhum recurso KS poderá ser apagado apenas por parecer duplicado, antigo, sem deploy recente ou por possuir nome de homologação.

Para cada recurso:
1. **Identificar proprietário**, rotas, domínio, dependências, triggers, cron, secrets, leitores e escritores do banco/storage.
2. **Verificar tráfego e referência**: logs Cloudflare, DNS, scripts, workflows, agentes, painéis, clientes e aplicativos dependentes.
3. **Snapshot/backup verificável**: commits/tags, export da configuração e das políticas, banco/storage conforme retenção e teste de restauração.
4. **Retirar da rota com rollback pronto**: desligar encaminhamento somente depois que o substituto estiver homologado. Não destruir recurso no corte.
5. **Monitorar por período suficiente**, cobrindo rotinas diárias, semanais e mensais relevantes; a duração concreta será definida por serviço e suas obrigações.
6. **Aprovação explícita por recurso** após relatório de não utilização. Confirmar política de retenção e obrigações legais, especialmente dados pessoais, fiscais e sanitários.
7. **Excluir em lote pequeno** somente após terminar o prazo de reversão, com relatório do que foi removido.
8. **Verificar após exclusão**: métricas, rotas e erros de todos os módulos; registrar o resultado.

O que NÃO apagar antes de análise formal: banco Supabase, Storage, buckets, chaves e registros fiscais, backups, domínios, filas, certificados, Workers com rotas, projetos de lojas, históricos de auditoria e repositórios antigos.

Em todos os passos, se houver indicador de regressão, interromper e executar rollback.
