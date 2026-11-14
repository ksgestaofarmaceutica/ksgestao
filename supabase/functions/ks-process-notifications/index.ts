import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const permittedOrigins = new Set(["https://ksgestaofarma.com.br", "https://www.ksgestaofarma.com.br", "https://admin.ksgestaofarma.com.br"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const events = new Set(["protocolado", "em_analise", "exigencia", "deferido", "indeferido", "concluido", "personalizado"]);
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function response(status: number, value: unknown, origin = "") {
  const headers: Record<string,string> = {...jsonHeaders};
  if (permittedOrigins.has(origin)) { headers["access-control-allow-origin"] = origin; headers["vary"] = "Origin"; }
  return new Response(JSON.stringify(value), { status, headers });
}
function escapeHTML(value: string) { return value.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]!)); }
function readJwtAal(jwt: string) {
  try { const segment = jwt.split(".")[1]; const payload = JSON.parse(atob(segment.replace(/-/g, "+").replace(/_/g, "/"))); return payload?.aal === "aal2" && payload?.is_anonymous !== true; }
  catch { return false; }
}
async function audit(id:string, type:string, actor:string, details:Record<string,unknown> = {}) {
  await db.from("ks_process_notification_events").insert({ notification_id:id, event_type:type, actor_uid:actor, details });
}
function fail(message: string): never { throw new Error(message); }
async function verifyDocuments(processId:string, ids:string[]) {
  if (ids.length > 10 || new Set(ids).size !== ids.length || ids.some(v=>!uuidPattern.test(v))) fail("Documentos inválidos");
  const {data:process,error:pErr} = await db.from("administrative_processes").select("id,client_id,protocolo,orgao,assunto,data_protocolo").eq("id",processId).single();
  if (pErr || !process) fail("Processo não encontrado");
  if (!ids.length) return {process,documents:[]};
  const {data:documents,error:dErr} = await db.from("documents").select("id,client_id,titulo,url,mime_type,tamanho_bytes").in("id",ids);
  if (dErr || !documents || documents.length !== ids.length || documents.some(d=>d.client_id !== process.client_id)) fail("Documento não pertence ao cliente do processo");
  return {process,documents};
}
async function recipientAllowed(clientId:string, recipient:string) {
  const {data:client,error} = await db.from("clients").select("razao_social,email").eq("id",clientId).single();
  if (error || !client) fail("Cliente não encontrado");
  if (client.email?.trim().toLowerCase() === recipient) return client;
  const {data:contacts,error:contactsError}=await db.from("client_contacts").select("id").eq("cliente_id",clientId).ilike("email",recipient).limit(1);
  if (contactsError || !contacts?.length) fail("Destinatário deve estar cadastrado no cliente");
  return client;
}
async function makeAttachments(documents:Array<Record<string,unknown>>) {
  const attachments: {filename:string,content:string}[] = [];
  let total = 0;
  for (const doc of documents) {
    const raw = String(doc.url ?? "");
    // Only private storage object paths; never fetch arbitrary external URLs.
    const path = raw.startsWith("ks-documents/") ? raw.slice("ks-documents/".length) : raw;
    if (!path || path.startsWith("/") || path.includes("..") || path.includes("?") || path.includes("://") || path.includes("\\")) fail("Documento não armazenado em caminho privado válido");
    const {data,error}=await db.storage.from("ks-documents").download(path);
    if (error || !data) fail("Não foi possível ler um anexo privado");
    total += data.size;
    if (total > 6*1024*1024) fail("Anexos excedem o limite operacional de 6 MB");
    const bytes = new Uint8Array(await data.arrayBuffer());
    let binary = "";
    for (let i=0;i<bytes.length;i+=16384) binary += String.fromCharCode(...bytes.subarray(i,i+16384));
    const bytesHeader = bytes.subarray(0, 12);
    const isPdf = bytesHeader.length>=5 && String.fromCharCode(...bytesHeader.subarray(0,5))==="%PDF-";
    const isPng = bytesHeader.length>=8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytesHeader[i]===v);
    const isJpeg = bytesHeader.length>=3 && bytesHeader[0]===255 && bytesHeader[1]===216 && bytesHeader[2]===255;
    if (!isPdf && !isPng && !isJpeg) fail("Anexo não suportado: somente PDF, PNG e JPEG");
    const ext = isPdf?".pdf":isPng?".png":".jpg";
    const title = String(doc.titulo || "comprovante").replace(/[\\/\r\n]/g, "_").replace(/\.(pdf|png|jpe?g)$/i,"").slice(0,125);
    attachments.push({filename:title+ext,content:btoa(binary)});
  }
  return attachments;
}
Deno.serve(async (req: Request) => {
 const origin = req.headers.get("origin") || "";
 if (req.method==="OPTIONS") {
  if (!permittedOrigins.has(origin)) return response(403,{error:"Origem não autorizada"},origin);
  return new Response(null,{status:204,headers:{"access-control-allow-origin":origin,"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"authorization,apikey,content-type","vary":"Origin"}});
 }
 if (!["GET","POST"].includes(req.method)) return response(405,{error:"Método não permitido"},origin);
 try {
  const auth = req.headers.get("authorization") || "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return response(401,{error:"Autenticação obrigatória"},origin);
  const {data:userData,error:userError} = await db.auth.getUser(token);
  const uid=userData?.user?.id;
  if (userError || !uid || !readJwtAal(token)) return response(403,{error:"É necessário login administrativo com MFA"},origin);
  const {data:admin,error:adminError}=await db.from("admin_profiles").select("id,totp_enabled").eq("id",uid).maybeSingle();
  if (adminError || !admin?.totp_enabled) return response(403,{error:"Acesso administrativo negado"},origin);
  if (req.method==="GET") {
   const {data,error}=await db.from("ks_process_notifications").select("id,process_id,recipient_email,event_type,subject,status,approved_at,attempted_at,sent_at,created_at,provider_message_id").order("created_at",{ascending:false}).limit(100);
   if (error) throw error;
   return response(200,{notifications:data, email_enabled:Deno.env.get("KS_PROCESS_EMAIL_ENABLED")==="true"},origin);
  }
  const body=await req.json().catch(()=>null);
  if (!body || typeof body!=="object") return response(400,{error:"JSON inválido"},origin);
  const action=String(body.action||"");
  if (action==="create") {
   const processId=String(body.process_id||""); const recipient=String(body.recipient_email||"").trim().toLowerCase();
   const event=String(body.event_type||""); const subject=String(body.subject||"").trim(); const message=String(body.message||"").trim();
   const ids=Array.isArray(body.document_ids)?body.document_ids.map(String):[];
   if (!uuidPattern.test(processId) || !emailPattern.test(recipient) || recipient.length>320 || !events.has(event) || subject.length<1 || subject.length>300 || message.length>5000) return response(400,{error:"Campos inválidos"},origin);
   if (event==="protocolado" && !ids.length) return response(400,{error:"Anexe um comprovante antes de preparar o aviso de protocolo"},origin);
   const {process}=await verifyDocuments(processId,ids);
   await recipientAllowed(process.client_id,recipient);
   const {data:notification,error}=await db.from("ks_process_notifications").insert({process_id:processId,recipient_email:recipient,event_type:event,subject,message,status:"draft",created_by:uid}).select("id,status").single();
   if (error || !notification) throw error||new Error("Falha ao criar rascunho");
   if (ids.length) {
    const {error:docErr}=await db.from("ks_process_notification_documents").insert(ids.map(document_id=>({notification_id:notification.id,document_id})));
    if (docErr) { await db.from("ks_process_notifications").delete().eq("id",notification.id); throw docErr; }
   }
   await audit(notification.id,"created",uid,{document_count:ids.length});
   return response(201,{id:notification.id,status:"draft"},origin);
  }
  const id=String(body.notification_id||"");
  if (!uuidPattern.test(id)) return response(400,{error:"ID de notificação inválido"},origin);
  const {data:n,error:nErr}=await db.from("ks_process_notifications").select("*").eq("id",id).single();
  if (nErr || !n) return response(404,{error:"Notificação não encontrada"},origin);
  if (action==="approve") {
   if (n.status!=="draft" && n.status!=="failed") return response(409,{error:"Somente rascunhos ou falhas podem ser aprovados"},origin);
   const {data:links,error:linksError}=await db.from("ks_process_notification_documents").select("document_id").eq("notification_id",id);
   if (linksError) throw linksError;
   const ids=(links||[]).map(x=>x.document_id);
   const {process}=await verifyDocuments(n.process_id,ids);
   await recipientAllowed(process.client_id,String(n.recipient_email).trim().toLowerCase());
   if (n.event_type==="protocolado" && !ids.length) return response(409,{error:"O comprovante de protocolo é obrigatório"},origin);
   const {data:updated,error}=await db.from("ks_process_notifications").update({status:"queued",approved_by:uid,approved_at:new Date().toISOString(),error_message:null}).eq("id",id).eq("status",n.status).select("id,status").maybeSingle();
   if (error || !updated) return response(409,{error:"Notificação já alterada ou duplicada"},origin);
   await audit(id,"approved",uid);
   return response(200,{id,status:"queued",message:"Aprovado. Envio externo continua controlado."},origin);
  }
  if (action==="send") {
   if (Deno.env.get("KS_PROCESS_EMAIL_ENABLED")!=="true") return response(409,{error:"Envio externo desativado para homologação"},origin);
   const key=Deno.env.get("RESEND_API_KEY"); const sender=Deno.env.get("KS_PROCESS_EMAIL_FROM");
   if (!key || !sender) return response(503,{error:"Provedor de e-mail não configurado"},origin);
   if (n.status!=="queued" || !n.approved_by || !n.approved_at) return response(409,{error:"É necessário aprovar antes de enviar"},origin);
   const {data:links,error:linksError}=await db.from("ks_process_notification_documents").select("document_id").eq("notification_id",id);
   if (linksError) throw linksError;
   const ids=(links||[]).map(x=>x.document_id);
   const {process,documents}=await verifyDocuments(n.process_id,ids);
   const client=await recipientAllowed(process.client_id,String(n.recipient_email).trim().toLowerCase());
   if (n.event_type==="protocolado" && !ids.length) return response(409,{error:"Comprovante ausente"},origin);
   const attachments=await makeAttachments(documents);
   const {data:locked,error:lockErr}=await db.from("ks_process_notifications").update({status:"sending",attempted_at:new Date().toISOString()}).eq("id",id).eq("status","queued").select("id").maybeSingle();
   if (lockErr || !locked) return response(409,{error:"Este envio já está em processamento"},origin);
   await audit(id,"send_started",uid);
   const content="Olá, "+client.razao_social+"!\n\n"+n.message+"\n\nÓrgão: "+process.orgao+"\nProtocolo: "+process.protocolo+"\nProcesso: "+process.assunto+"\nData do protocolo: "+process.data_protocolo+"\n\nKS Gestão Farmacêutica";
   try {
    const providerResponse=await fetch("https://api.resend.com/emails",{
      method:"POST",headers:{"authorization":"Bearer "+key,"content-type":"application/json","idempotency-key":"ks-notification-"+id},
      body:JSON.stringify({from:sender,to:[n.recipient_email],subject:n.subject,text:content,html:"<div style=\"font-family:Arial,sans-serif;line-height:1.6;max-width:640px\"><h2>KS Gestão Farmacêutica</h2><p>"+escapeHTML(content).replace(/\n/g,"<br>")+"</p></div>",attachments})
    });
    const providerBody=await providerResponse.json().catch(()=>({}));
    if (!providerResponse.ok || !providerBody.id) throw new Error("Provedor recusou o envio (HTTP "+providerResponse.status+")");
    await db.from("ks_process_notifications").update({status:"sent",provider_message_id:String(providerBody.id),sent_at:new Date().toISOString(),error_message:null}).eq("id",id).eq("status","sending");
    await audit(id,"provider_accepted",uid,{provider_message_id:String(providerBody.id)});
    return response(200,{id,status:"sent",note:"Aceito pelo provedor; entrega final depende de confirmação do provedor"},origin);
   } catch (err) {
    // Uma falha de rede pode ocorrer após o aceite pelo provedor: mantenha 'sending' para conciliação manual.
    // Não liberar repetição automática que possa duplicar comunicados.
    await db.from("ks_process_notifications").update({error_message:"Confirmação indisponível; requer conciliação com o provedor."}).eq("id",id).eq("status","sending");
    await audit(id,"delivery_failed",uid,{reason:"provider_confirmation_unknown"});
    return response(502,{id,status:"sending",error:"Confirmação de envio indisponível. Conciliar com o provedor antes de tentar novamente."},origin);
   }
  }
  return response(400,{error:"Ação não reconhecida"},origin);
 } catch (error) {
  return response(400,{error:String(error instanceof Error?error.message:error).slice(0,300)},origin);
 }
});
