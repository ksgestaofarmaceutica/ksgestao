import type { SupabaseClient } from "@supabase/supabase-js";

export type KsNotificationEvent = "protocolado" | "em_analise" | "exigencia" | "deferido" | "indeferido" | "concluido" | "personalizado";
export type KsNotificationStatus = "draft" | "queued" | "sending" | "sent" | "delivered" | "failed" | "cancelled";
export type KsNotification = {
  id: string; process_id: string; recipient_email: string;
  subject: string; event_type: KsNotificationEvent;
  status: KsNotificationStatus; created_at: string;
  approved_at: string | null; sent_at: string | null;
  provider_message_id: string | null;
};
type ResponseBase = { error?: string; id?: string; status?: KsNotificationStatus; message?: string };
export type KsNotificationList = ResponseBase & { notifications: KsNotification[]; email_enabled: boolean };

export function ksProcessNotifications(supabase: SupabaseClient) {
  async function call<T extends ResponseBase>(body?: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke<T>(
      "ks-process-notifications",
      body ? {method:"POST",body} : {method:"GET"}
    );
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Resposta vazia do serviço KS");
    if (data.error) throw new Error(data.error);
    return data;
  }
  return {
    list: () => call<KsNotificationList>(),
    createDraft: (input: {
      process_id: string;
      recipient_email: string;
      event_type: KsNotificationEvent;
      subject: string;
      message: string;
      document_ids: string[];
    }) => call<ResponseBase>({action:"create",...input}),
    approve: (notification_id: string) => call<ResponseBase>({action:"approve", notification_id}),
    send: (notification_id: string) => call<ResponseBase>({action:"send", notification_id}),
  };
}
