export interface GmailConnection {
  can_send?: boolean;
  id: string;
  email_address: string;
  status: "active" | "attention" | string;
  analysis_enabled: boolean;
  message_count: number;
  analyzed_count: number;
  connected_at: string;
  last_sync_at?: string | null;
  watch_expiration?: string | null;
  last_error_code?: string | null;
}

export interface ListGmailConnectionsResponse {
  configured: boolean;
  analysis_configured: boolean;
  connections: GmailConnection[];
}

export interface GmailConnectInitResponse {
  redirect_url: string;
}
