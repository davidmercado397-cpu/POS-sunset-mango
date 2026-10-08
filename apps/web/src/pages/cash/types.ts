export type Method = 'CASH' | 'TRANSFER' | 'QR_BOLD';
export type ByMethod = Record<Method, number>;

export interface CashSummary {
  openingAmount: number;
  salesCount: number;
  voidedCount: number;
  salesTotal: number;
  discountsTotal?: number;
  tipsTotal: number;
  collected: ByMethod;
  sales: ByMethod;
  tips: ByMethod;
  expenses: number;
  expensesTransfer?: number;
  withdrawals: number;
  deposits: number;
  expected: ByMethod;
  counted?: ByMethod;
  difference?: ByMethod;
}

export interface CashMovement {
  id: string;
  type: 'EXPENSE' | 'WITHDRAWAL' | 'DEPOSIT';
  method?: 'CASH' | 'TRANSFER';
  amount: number;
  description: string | null;
  createdAt: string;
  category: { name: string } | null;
  createdBy: { fullName: string };
}

export interface CashSession {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  openingAmount: number;
  notes: string | null;
  openedBy: { fullName: string };
  closedBy?: { fullName: string } | null;
  movements?: CashMovement[];
  summary?: CashSummary | null;
}

export const METHODS: Method[] = ['CASH', 'TRANSFER', 'QR_BOLD'];
export const MOVEMENT_LABELS = { EXPENSE: 'Gasto', WITHDRAWAL: 'Salida de efectivo', DEPOSIT: 'Entrada de efectivo' } as const;
