// types/support.ts — add to your existing types/index.ts or create new file

export type TicketStatus   = 'open' | 'pending' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type SenderType     = 'agent' | 'admin';

export type TicketCategory =
  | 'Failed Data Delivery'
  | 'Payment Issue'
  | 'Wallet Funding'
  | 'Commission Issue'
  | 'Technical Issue'
  | 'Account Verification'
  | 'General Inquiry';

export interface SupportTicket {
  id:                    string;
  ticket_number:         string;
  agent_id:              string;
  subject:               string;
  category:              TicketCategory;
  status:                TicketStatus;
  priority:              TicketPriority;
  transaction_reference?: string;
  last_message_at:       string;
  created_at:            string;
  updated_at:            string;
  // joined
  agent_name?:           string;
  agent_slug?:           string;
  unread_count?:         number;
  last_message?:         string;
}

export interface TicketMessage {
  id:               string;
  ticket_id:        string;
  sender_type:      SenderType;
  sender_id?:       string;
  message:          string;
  attachment_url?:  string;
  attachment_type?: 'image' | 'file';
  is_read:          boolean;
  created_at:       string;
  // display name — always 'Admunz Support' for admin
  display_name?:    string;
}

export interface SupportNotification {
  id:          string;
  target_type: 'agent' | 'admin';
  agent_id?:   string;
  ticket_id?:  string;
  title:       string;
  message:     string;
  is_read:     boolean;
  created_at:  string;
}

export const TICKET_CATEGORIES: TicketCategory[] = [
  'Failed Data Delivery',
  'Payment Issue',
  'Wallet Funding',
  'Commission Issue',
  'Technical Issue',
  'Account Verification',
  'General Inquiry',
];

export const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; bg: string; border: string }> = {
  open:     { label: 'Open',     color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)'  },
  pending:  { label: 'Pending',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)'  },
  resolved: { label: 'Resolved', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)'  },
  closed:   { label: 'Closed',   color: '#64748b', bg: 'rgba(100,116,139,0.12)',border: 'rgba(100,116,139,0.3)' },
};

export const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string }> = {
  low:    { label: 'Low',    color: '#64748b' },
  normal: { label: 'Normal', color: '#94a3b8' },
  high:   { label: 'High',   color: '#f59e0b' },
  urgent: { label: 'Urgent', color: '#f43f5e' },
};
