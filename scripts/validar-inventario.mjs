import { readFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync(new URL("../infra/servicos.json", import.meta.url), "utf8"));
const errors = [];
const ids = new Set();
const allowedTypes = new Set(["cloudflare_worker", "supabase"]);
const statuses = new Set(["active", "requires_verification", "retired"]);
const confidences = new Set(["confirmed", "confirmed_via_workflow", "unverified"]);
if (manifest.schema_version !== 1) errors.push("schema_version deve ser 1");
if (manifest.policy?.automatic_deletions !== false) errors.push("Exclusões automáticas devem ficar bloqueadas");
if (manifest.policy?.unverified_sources_may_deploy !== false) errors.push("Deploy de fontes não verificadas deve ficar bloqueado");
if (!Array.isArray(manifest.services) || !manifest.services.length) errors.push("Inventário sem serviços");
for (const service of manifest.services ?? []) {
  if (!service.id || ids.has(service.id)) errors.push("ID ausente/duplicado: " + service.id);
  ids.add(service.id);
  if (!allowedTypes.has(service.type)) errors.push("Tipo desconhecido: " + service.id);
  if (!statuses.has(service.status)) errors.push("Status desconhecido: " + service.id);
  if (!confidences.has(service.source?.confidence)) errors.push("Confiança não definida: " + service.id);
  if (service.deletion_allowed !== false) errors.push("Exclusão indevidamente autorizada: " + service.id);
  if (service.source?.confidence === "unverified" && (service.source?.repository || service.source?.branch))
    errors.push("Origem marcada como não verificada mas contém repo/branch: " + service.id);
  if (service.source?.confidence !== "unverified" && (!service.source?.repository || !service.source?.branch))
    errors.push("Origem confirmada sem repo/branch: " + service.id);
  if (!Array.isArray(service.routes) || !Array.isArray(service.entrypoints)) errors.push("Rotas/entradas inválidas: " + service.id);
  if (!service.deployment?.mechanism) errors.push("Deploy sem mecanismo: " + service.id);
}
if (errors.length) {
  console.error("Inventário KS inválido:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("Inventário KS válido:", ids.size, "serviços, nenhuma exclusão habilitada.");
