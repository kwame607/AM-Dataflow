export interface Bundle {
  key: string;
  size: string;
  volume: string;
  cost: number;
  validity: string;
  type?: string;
  network?: string;
}

export interface BundleWithPrice extends Bundle {
  adminPrice: number;
  agentPrice?: number;
  customerPays: number;
  adminProfit: number;
  agentProfit: number;
}

export interface Agent {
  id: string;
  name: string;
  phone: string;
  email: string;
  slug: string;
  status: 'pending' | 'active' | 'suspended';
  whatsapp?: string;
  created_at: string;
  auth_user_id?: string;
  // Wallet/Flyer Store additions
  store_description?: string;
  store_logo_url?: string;
  store_banner_text?: string;
  store_color?: string;
  show_mtn?: boolean;
  show_at?: boolean;
  show_telecel?: boolean;
  // Referral / Sub-agent additions  ← ADD THESE
  referral_code?: string;
  referred_by?: string;
  commission_pct?: number;
  can_set_subagent_prices?: boolean;
}


export interface AdminPrice {
  id: string;
  network: string;
  bundle_key: string;
  size: string;
  volume: string;
  hubnet_cost: number;
  selling_price: number;
  store_price: number | null;
  admin_profit: number;
  validity: string;
  updated_at: string;
}

export interface AgentPrice {
  id: string;
  agent_id: string;
  network: string;
  bundle_key: string;
  size: string;
  volume: string;
  hubnet_cost: number;
  admin_price: number;
  agent_price: number;
  agent_profit: number;
  validity: string;
  updated_at: string;
}

export interface Order {
  id: string;
  reference: string;
  phone: string;
  buyer_name?: string;
  buyer_contact?: string;
  network: string;
  bundle_key: string;
  size: string;
  volume: string;
  hubnet_cost: number;
  admin_price: number;
  agent_price?: number;
  admin_profit: number;
  agent_profit: number;
  agent_id?: string;
  agent_slug?: string;
  source: 'main' | 'agent';
  status: 'pending' | 'success' | 'failed' | 'processing';
  delivery_status?: 'pending' | 'processing' | 'delivered' | 'failed';
  delivered_at?: string;
  paystack_ref?: string;
  hubnet_transaction_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Withdrawal {
  id: string;
  type: 'admin' | 'agent';
  agent_id?: string;
  amount: number;
  momo_number: string;
  momo_name: string;
  network: string;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  note?: string;
  requested_at: string;
  resolved_at?: string;
}

export interface Notification {
  id: string;
  target: 'admin' | 'agent';
  agent_id?: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export type Network = 'mtn' | 'telecel' | 'at';
export type HubnetNetwork = 'mtn' | 'telecel' | 'at' | 'big-time';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warn';
}
