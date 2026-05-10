/**
 * Cálculo PURO de saldo histórico por conta.
 * Sem dependência de banco — testável.
 *
 * Decisão de domínio: patrimônio usa SÓ transactions confirmed.
 * Pending é projeção, não realidade — patrimônio é medida contábil.
 */

export type AccountForPatrimony = {
  id: string;
  initialBalance: number;
  ownership: 'PF' | 'PJ';
  kind: 'checking' | 'credit_card';
};

export type TxForPatrimony = {
  accountId: string;
  date: string;
  amount: number;
  kind: 'expense' | 'income' | 'transfer_out' | 'transfer_in';
  status: 'confirmed' | 'pending';
};

function signed(t: Pick<TxForPatrimony, 'amount' | 'kind'>): number {
  if (t.kind === 'income' || t.kind === 'transfer_in') return t.amount;
  return -t.amount;
}

/**
 * Saldo de uma conta numa data, considerando só transactions confirmadas.
 * Inclui o initialBalance da conta.
 */
export function computeAccountBalanceAt(opts: {
  account: AccountForPatrimony;
  transactions: TxForPatrimony[];
  dateIso: string;
}): number {
  const txs = opts.transactions.filter(
    (t) =>
      t.accountId === opts.account.id &&
      t.status === 'confirmed' &&
      t.date <= opts.dateIso
  );
  return (
    opts.account.initialBalance + txs.reduce((s, t) => s + signed(t), 0)
  );
}

/**
 * Patrimônio em uma data: soma dos saldos das contas (checking positivos,
 * credit_card negativos pelas compras pending? não — só confirmed) + invest.
 *
 * Cartões com saldo "negativo" significa "você deve essa parte" — reduz
 * patrimônio. Mas como pra cartão a gente só registra expense (sem
 * "pagamento" como tx interna do cartão), o saldo dele acumula puxando
 * patrimônio pra baixo. Compensado quando o usuário registra a transferência
 * de pagamento da fatura (transfer_in pro cartão).
 */
export function computePatrimonyAt(opts: {
  accounts: AccountForPatrimony[];
  transactions: TxForPatrimony[];
  dateIso: string;
  investments: number;
  ownership?: 'PF' | 'PJ' | 'both';
}): {
  checking: number;
  cards: number;
  investments: number;
  total: number;
} {
  const ownership = opts.ownership ?? 'both';
  const filtered = opts.accounts.filter(
    (a) => ownership === 'both' || a.ownership === ownership
  );

  let checking = 0;
  let cards = 0;
  for (const a of filtered) {
    const balance = computeAccountBalanceAt({
      account: a,
      transactions: opts.transactions,
      dateIso: opts.dateIso,
    });
    if (a.kind === 'checking') checking += balance;
    else cards += balance; // tipicamente negativo (gastos no cartão sem pagamento)
  }

  return {
    checking,
    cards,
    investments: opts.investments,
    total: checking + cards + opts.investments,
  };
}
