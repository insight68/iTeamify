export interface TeamActivity {
  target_type: "agent" | "member";
  target_id: string;
  last_contact_at: string | null;
  resume_session_id: string | null;
  has_unread: boolean;
}

export interface DirectMessage {
  chat_session_id: string;
  id: string;
  sender_id: string;
  client_message_id: string;
  sequence: number;
  content: string;
  created_at: string;
}

export interface DirectMessagesPage {
  messages: DirectMessage[];
  has_more: boolean;
  next_cursor: number | null;
  read_sequence: number;
  can_send: boolean;
}

export interface TeamContact {
  type: "agent" | "member";
  id: string;
  name: string;
  description: string;
  avatar_url: string | null;
  last_contact_at: string | null;
  resume_session_id: string | null;
  has_unread: boolean;
}

export interface DirectSession {
  container?: import("../session-containers/schemas").SessionContainer;
  container_has_unread?: boolean;
  last_activity_at?: string | null;
  id: string;
  workspace_id: string;
  kind: "direct";
  peer_user_id: string;
  title: string;
  has_unread: boolean;
  last_sequence: number;
  last_message_at: string | null;
  last_message_content: string;
  created_at: string;
}
export interface SessionsPage<T> { sessions: T[]; next_cursor: string | null }
export interface DirectSendResult { session: DirectSession; message: DirectMessage }
