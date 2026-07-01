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
  // Referral & sub-agent pricing system
  referred_by?: string | null;              // slug of the agent who referred this one
  referred_by_id?: string | null;           // stable UUID of the referrer (add this line)
  can_set_subagent_prices?: boolean;        // admin-toggled permission
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
  floor_source?: 'admin' | 'subagent';
}

export interface SubAgentFloorPrice {
  id: string;
  agent_id: string;       // the referrer who set this floor
  bundle_key: string;
  network: string;
  size: string;
  volume: string;
  hubnet_cost: number;
  admin_floor: number;
  agent_floor: number;
  validity: string;
  updated_at: string;
}

export interface ReferralEarning {
  id: string;
  referrer_id: string;
  referred_id: string;
  order_id: string;
  referred_profit: number;
  pct: number;
  bonus_amount: number;
  status: 'credited' | 'skipped' | 'reversed' | 'frozen';
  skip_reason?: string | null;
  reversed_at?: string | null;
  created_at: string;
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
  referrer_agent_id?: string | null;  // audit trail — who referred the selling agent
  referral_bonus?: number;            // amount deducted from agent_profit for referral
  source: 'main' | 'agent';
  payment_method?: 'paystack' | 'wallet';
  wallet_transaction_id?: string;
  status: 'pending' | 'success' | 'failed' | 'processing';
  delivery_status?: 'pending' | 'processing' | 'delivered' | 'failed';
  delivery_provider?: 'xpresportal' | 'hubnet';
  delivered_at?: string;
  paystack_ref?: string;
  hubnet_transaction_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Withdrawal {
  id: string;
  type: 'admin' | 'agent' | 'referral';
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
