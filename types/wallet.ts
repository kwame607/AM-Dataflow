// types/wallet.ts — NEW FILE
// Add these to your existing types/index.ts or import from here

export interface Wallet {
  id: string;
  agent_id: string;
  balance: number;
  pending_balance: number;
  locked_balance: number;
  total_deposited: number;
  total_spent: number;
  total_withdrawn: number;
  is_frozen: boolean;
  low_balance_threshold: number;
  created_at: string;
  updated_at: string;
}

export type WalletTransactionType =
  | 'deposit'
  | 'purchase'
  | 'refund'
  | 'withdrawal'
  | 'adjustment'
  | 'bonus'
  | 'reversal';

export type WalletTransactionStatus = 'pending' | 'success' | 'failed' | 'reversed';

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  agent_id: string;
  type: WalletTransactionType;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference: string;
  status: WalletTransactionStatus;
  description?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export type DepositClaimStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface DepositClaim {
  id: string;
  agent_id: string;
  network: string;
  sender_number: string;
  transaction_id: string;
  amount: number;
  proof_url?: string;
  status: DepositClaimStatus;
  admin_note?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

export type PaymentMethod = 'paystack' | 'wallet';

// Collection accounts for deposits
export const COLLECTION_ACCOUNTS = [
  { network: 'mtn',     label: 'MTN MoMo',         number: '059XXXXXXX', name: 'ADMUNZ Data' },
  { network: 'telecel', label: 'Telecel Cash',       number: '020XXXXXXX', name: 'ADMUNZ Data' },
  { network: 'at',      label: 'AirtelTigo Money',   number: '027XXXXXXX', name: 'ADMUNZ Data' },
] as const;

export const WALLET_TXN_LABELS: Record<WalletTransactionType, { label: string; icon: string; color: string }> = {
  deposit:    { label: 'Deposit',    icon: '⬇',  color: '#10b981' },
  purchase:   { label: 'Purchase',   icon: '📦', color: '#f43f5e' },
  refund:     { label: 'Refund',     icon: '↩',  color: '#10b981' },
  withdrawal: { label: 'Withdrawal', icon: '💸', color: '#f59e0b' },
  adjustment: { label: 'Adjustment', icon: '⚙',  color: '#94a3b8' },
  bonus:      { label: 'Bonus',      icon: '🎁', color: '#00d4aa' },
  reversal:   { label: 'Reversal',   icon: '↺',  color: '#f59e0b' },
};
