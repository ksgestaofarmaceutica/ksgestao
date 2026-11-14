import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ksProcessNotifications, type KsNotification, type KsNotificationEvent } from "./ks-process-notifications-client";

type Process = { id: string; client_id: string; protocolo: string; orgao: string; assunto: string; status: string; data_protocolo: string };
type Client = { id: string; razao_social: string; nome_fantasia: string | null; email: string | null };
type Contact = { id: string; cliente_id: string; nome: string; email: string | null };
type Document = { id: string; client_id: string; titulo: string; categoria: string };
type Props = { supabase: SupabaseClient; onClose?: () => void };
const eventLabels: Record<KsNotificationEvent,string> = {
  protocolado:"Processo protocolado", em_analise:"Em análise", exigencia:"Exigência emitida",
  deferido:"Deferido", indeferido:"Indeferido", concluido:"Concluído", personalizado:"Comunicado personalizado"
};
const colors: Record<string,string> = {draft:"#6b7280",queued:"#a16207",sending:"#2563eb",sent:"#15803d",delivered:"#15803d",failed:"#b91c1c",cancelled:"#6b7280"};
const inputStyle: React.CSSProperties = {border:"1px solid #d3dce8",borderRadius:8,padding:"10px 12px",width:"100%",background:"#fff",color:"#17243b",boxSizing:"border-box"};
const btnStyle: React.CSSProperties = {border:0,borderRadius:8,padding:"10px 14px",cursor:"pointer",background:"#173c6d",color:"white",fontWeight:600};
const blockStyle: React.CSSProperties = {border:"1px solid #e2e8f0",borderRadius:12,padding:16,background:"white"};
const labelStyle: React.CSSProperties = {fontSize:12,fontWeight:700,color:"#48617e",display:"block",marginBottom:5};

export default function KsProcessosNotificacoes({supabase,onClose}:Props) {
  const api = useMemo(()=>ksProcessNotifications(supabase),[supabase]);
  const [processes,setProcesses]=useState<Process[]>([]);
  const [clients,setClients]=useState<Client[]>([]);
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [documents,setDocuments]=useState<Document[]>([]);
  const [notifications,setNotifications]=useState<KsNotification[]>([]);
  const [enabled,setEnabled]=useState(false);
  const [detail,setDetail]=useState<{notification: KsNotification;history:Array<{id:number;event_type:string;created_at:string}>;documents:Array<{id:string;title:string}>}|null>(null);
  const [processId,setProcessId]=useState("");
  const [recipient,setRecipient]=useState("");
  const [eventType,setEventType]=useState<KsNotificationEvent>("protocolado");
  const [subject,setSubject]=useState("");
  const [message,setMessage]=useState("");
  const [selectedDocs,setSelectedDocs]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const current = processes.find(p=>p.id===processId);
  const currentClient = clients.find(c=>c.id===current?.client_id);
  const recipients = [...(currentClient?.email?[{name:"Email da empresa",email:currentClient.email}]:[]),
    ...contacts.filter(c=>c.cliente_id===current?.client_id&&c.email).map(c=>({name:c.nome,email:c.email!}))];
  const availableDocs=documents.filter(d=>d.client_id===current?.client_id);

  const load = useCallback(async()=>{
    setError("");setLoading(true);
    try {
      const [p,c,ct,d,n] = await Promise.all([
        supabase.from("administrative_processes").select("id,client_id,protocolo,orgao,assunto,status,data_protocolo").order("created_at",{ascending:false}).limit(300),
        supabase.from("clients").select("id,razao_social,nome_fantasia,email").limit(300),
        supabase.from("client_contacts").select("id,cliente_id,nome,email").limit(500),
        supabase.from("documents").select("id,client_id,titulo,categoria").order("created_at",{ascending:false}).limit(500),
        api.list()
      ]);
      for(const result of [p,c,ct,d]) if(result.error) throw result.error;
      setProcesses(p.data||[]);setClients(c.data||[]);setContacts(ct.data||[]);setDocuments(d.data||[]);
      setNotifications(n.notifications||[]);setEnabled(Boolean(n.email_enabled));
    } catch (e) { setError(e instanceof Error?e.message:"Não foi possível consultar os registros"); }
    finally {setLoading(false);}
  },[supabase,api]);
  useEffect(()=>{void load();},[load]);

  const resetSelection=(id:string)=>{
    setProcessId(id);setRecipient("");setSelectedDocs([]);
    const p=processes.find(x=>x.id===id);
    setSubject(p?`KS Gestão Farmacêutica | Protocolo ${p.protocolo}`:"");
    setMessage(p?`Informamos que o processo ${p.assunto} foi protocolado junto ao órgão ${p.orgao}. O comprovante está anexado. Nossa equipe acompanhará as próximas etapas.`:"");
  };
  const createDraft=async()=>{
    setError("");setSuccess("");
    if(!current||!recipient||!subject.trim()) return setError("Selecione um processo, destinatário e assunto.");
    if(eventType==="protocolado"&&selectedDocs.length===0) return setError("Selecione o comprovante do protocolo.");
    setBusy(true);
    try {
      await api.createDraft({process_id:current.id,recipient_email:recipient,event_type:eventType,subject:subject.trim(),message:message.trim(),document_ids:selectedDocs});
      setSuccess("Rascunho registrado. Nenhum e-mail foi enviado.");
      setSelectedDocs([]);await load();
    } catch (e) {setError(e instanceof Error?e.message:"Erro ao registrar");}
    finally {setBusy(false);}
  };
  const showDetail=async(id:string)=>{
    setBusy(true);setError("");
    try { const result=await api.detail(id); setDetail(result); }
    catch(e){setError(e instanceof Error?e.message:"Falha ao consultar histórico");}
    finally{setBusy(false);}
  };
  const action=async(n:KsNotification,kind:"approve"|"send"|"cancel")=>{
    if(kind==="send"&&!enabled) return;
    if(!window.confirm(kind==="approve"?"Aprovar esta notificação? Nenhum e-mail será enviado nesta etapa.":kind==="cancel"?"Cancelar esta notificação ainda não enviada?":`Confirmar envio para ${n.recipient_email}? Esta ação pode enviar um e-mail real.`)) return;
    setBusy(true);setError("");setSuccess("");
    try {
      if(kind==="approve") await api.approve(n.id); else if(kind==="cancel") await api.cancel(n.id); else await api.send(n.id);
      setSuccess(kind==="approve"?"Notificação aprovada.":kind==="cancel"?"Notificação cancelada.":"Solicitação de envio processada. Consulte o status.");setDetail(null);await load();
    } catch(e) {setError(e instanceof Error?e.message:"Operação não concluída");}
    finally {setBusy(false);}
  };
  return <main style={{background:"#f5f8fc",padding:20,maxWidth:1160,margin:"0 auto",fontFamily:"Inter,Arial,sans-serif",color:"#17243b"}}>
    <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:20}}>
      <div><div style={{fontSize:12,color:"#54708b"}}>KS GESTÃO FARMACÊUTICA / ADMINISTRATIVO</div><h1 style={{margin:"5px 0",fontSize:26}}>Processos e notificações</h1><small>Comprovantes, comunicação com clientes e histórico de aprovação</small></div>
      <div style={{display:"flex",gap:8}}>
        <button style={{...btnStyle,background:"#edf2f7",color:"#173c6d"}} onClick={()=>void load()} disabled={busy}>Atualizar</button>
        {onClose&&<button style={{...btnStyle,background:"#edf2f7",color:"#173c6d"}} onClick={onClose}>Voltar</button>}
      </div>
    </header>
    <div role="status" style={{...blockStyle,marginBottom:14,background:enabled?"#fff8e9":"#edf4fd",fontSize:13}}>
      {enabled?"Envio externo habilitado na API. Confirme destinatários e documentos antes de disparar.":"Envio externo desativado para homologação. Rascunhos e aprovações podem ser preparados sem enviar e-mails."}
    </div>
    {error&&<p role="alert" style={{color:"#9f1239",background:"#fff1f2",padding:12,borderRadius:8}}>{error}</p>}
    {success&&<p role="status" style={{color:"#166534",background:"#f0fdf4",padding:12,borderRadius:8}}>{success}</p>}
    <section style={{...blockStyle,marginBottom:18}}>
      <h2 style={{marginTop:0,fontSize:18}}>Preparar comunicação</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:14}}>
        <label><span style={labelStyle}>Processo administrativo</span><select style={inputStyle} value={processId} onChange={e=>resetSelection(e.target.value)}><option value="">Selecione um processo</option>{processes.map(p=><option key={p.id} value={p.id}>{p.protocolo} — {p.assunto}</option>)}</select></label>
        <label><span style={labelStyle}>Destinatário cadastrado</span><select style={inputStyle} value={recipient} onChange={e=>setRecipient(e.target.value)} disabled={!current}><option value="">Selecione o e-mail</option>{recipients.map((r,i)=><option key={r.email+i} value={r.email}>{r.name} — {r.email}</option>)}</select></label>
        <label><span style={labelStyle}>Tipo de comunicado</span><select style={inputStyle} value={eventType} onChange={e=>setEventType(e.target.value as KsNotificationEvent)}>{Object.entries(eventLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label><span style={labelStyle}>Assunto</span><input style={inputStyle} value={subject} onChange={e=>setSubject(e.target.value)} maxLength={300}/></label>
      </div>
      {current&&<p style={{fontSize:13,color:"#48617e"}}>Cliente: <b>{currentClient?.nome_fantasia||currentClient?.razao_social||"Não identificado"}</b> · Órgão: <b>{current.orgao}</b> · Status do processo: <b>{current.status}</b></p>}
      <label style={{display:"block",marginTop:14}}><span style={labelStyle}>Mensagem ao cliente</span><textarea style={{...inputStyle,minHeight:110,resize:"vertical"}} value={message} onChange={e=>setMessage(e.target.value)} maxLength={5000}/></label>
      <fieldset style={{border:"1px solid #e2e8f0",margin:"14px 0",borderRadius:10,padding:12}} disabled={!current}>
        <legend style={{fontWeight:700,fontSize:13}}>Anexos já cadastrados ({selectedDocs.length}/10)</legend>
        {!availableDocs.length&&<small>Nenhum documento associado ao cliente. Cadastre o comprovante primeiro no módulo Documentos.</small>}
        {availableDocs.map(d=><label key={d.id} style={{display:"block",padding:"5px 0",fontSize:13}}><input type="checkbox" checked={selectedDocs.includes(d.id)} onChange={e=>setSelectedDocs(x=>e.target.checked?[...x,d.id].slice(0,10):x.filter(v=>v!==d.id))}/> {d.titulo} ({d.categoria})</label>)}
      </fieldset>
      <button style={btnStyle} disabled={busy||loading||!processId||!recipient} onClick={()=>void createDraft()}>{busy?"Processando...":"Salvar rascunho"}</button>
      <p style={{fontSize:12,color:"#64748b",marginBottom:0}}>Este formulário não protocola processos junto aos órgãos. Registra apenas notificações sobre processos cadastrados na KS.</p>
    </section>
    <section style={blockStyle}>
      <h2 style={{marginTop:0,fontSize:18}}>Central de notificações</h2>
      {loading?<p>Carregando registros...</p>:notifications.length===0?<p style={{color:"#64748b"}}>Ainda não há notificações registradas.</p>:
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,textAlign:"left"}}>
        <thead><tr>{["Criado em","Destinatário","Assunto","Situação","Ações"].map(x=><th key={x} style={{padding:10,borderBottom:"1px solid #dbe4ee"}}>{x}</th>)}</tr></thead>
        <tbody>{notifications.map(n=><tr key={n.id}>
          <td style={{padding:10,borderBottom:"1px solid #edf2f7",whiteSpace:"nowrap"}}>{new Date(n.created_at).toLocaleString("pt-BR")}</td>
          <td style={{padding:10,borderBottom:"1px solid #edf2f7"}}>{n.recipient_email}</td>
          <td style={{padding:10,borderBottom:"1px solid #edf2f7"}}>{n.subject}</td>
          <td style={{padding:10,borderBottom:"1px solid #edf2f7",color:colors[n.status]||"#475569",fontWeight:700}}>{n.status}</td>
          <td style={{padding:10,borderBottom:"1px solid #edf2f7",whiteSpace:"nowrap"}}>
            <button style={{...btnStyle,padding:"7px 9px",fontSize:12,marginRight:6,background:"#475569"}} disabled={busy} onClick={()=>void showDetail(n.id)}>Histórico</button>
            {(n.status==="draft"||n.status==="failed")&&<button style={{...btnStyle,padding:"7px 9px",fontSize:12,marginRight:6}} disabled={busy} onClick={()=>void action(n,"approve")}>Aprovar</button>}
            {(n.status==="draft"||n.status==="queued")&&<button style={{...btnStyle,padding:"7px 9px",fontSize:12,marginRight:6,background:"#9f1239"}} disabled={busy} onClick={()=>void action(n,"cancel")}>Cancelar</button>}
            {n.status==="queued"&&<button style={{...btnStyle,padding:"7px 9px",fontSize:12,background:enabled?"#047857":"#94a3b8",cursor:enabled?"pointer":"not-allowed"}} disabled={busy||!enabled} title={!enabled?"Envio bloqueado até homologação":"Enviar comunicado"} onClick={()=>void action(n,"send")}>Enviar</button>}
          </td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    {detail&&<section style={{...blockStyle,marginTop:18}} aria-label="Histórico da notificação">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{fontSize:18}}>Histórico do comunicado</h2><button style={{...btnStyle,background:"#475569"}} onClick={()=>setDetail(null)}>Fechar</button></div>
      <p><b>Destinatário:</b> {detail.notification.recipient_email}<br/><b>Assunto:</b> {detail.notification.subject}<br/><b>Situação:</b> {detail.notification.status}</p>
      <h3 style={{fontSize:14}}>Documentos vinculados</h3>
      <ul>{detail.documents.map(d=><li key={d.id}>{d.title}</li>)}</ul>
      <h3 style={{fontSize:14}}>Eventos registrados</h3>
      <ol>{detail.history.map(h=><li key={h.id}>{new Date(h.created_at).toLocaleString("pt-BR")} — {h.event_type}</li>)}</ol>
    </section>}
  </main>;
}
