'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  FileText,
  AlertTriangle,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDateShort, formatTxAmount } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ImportPreviewItem } from '@/lib/import';
import {
  previewImport,
  confirmImport,
  discardImport,
} from '@/lib/actions/imports';
import type { AccountRow, CategoryRow } from '@/lib/accounts';

interface Props {
  accounts: AccountRow[];
  categories: CategoryRow[];
}

type PreviewState = {
  batchId: string;
  items: ImportPreviewItem[];
} | null;

type Source = 'csv' | 'ofx' | 'pdf' | 'md';

function detectSource(filename: string): Source | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'csv') return 'csv';
  if (ext === 'ofx') return 'ofx';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'md' || ext === 'markdown') return 'md';
  return null;
}

/**
 * Lê arquivo binário (PDF) como base64 sem o prefixo `data:`.
 * Usa FileReader.readAsDataURL pra evitar problemas com arquivos grandes
 * (que `btoa(String.fromCharCode(...))` quebra em stack overflow).
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

export function ImportForm({ accounts, categories }: Props) {
  const router = useRouter();
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewState>(null);
  // Identidade interna dos items é o ÍNDICE no array (não o hash) — porque
  // dois items podem ter o mesmo hash legitimamente (compras idênticas no
  // mesmo dia). O hash continua sendo usado pra dedup contra o banco.
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set()
  );
  const [categoryOverrides, setCategoryOverrides] = useState<
    Record<number, string | null>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.kind === 'expense'),
    [categories]
  );
  const incomeCategories = useMemo(
    () => categories.filter((c) => c.kind === 'income'),
    [categories]
  );

  function handlePreview() {
    setError(null);
    if (!accountId) {
      setError('Escolha a conta de destino');
      return;
    }
    if (!file) {
      setError('Selecione um arquivo CSV, OFX ou PDF');
      return;
    }

    const source = detectSource(file.name);
    if (!source) {
      const ext = file.name.split('.').pop() ?? 'desconhecida';
      setError(`Formato não suportado: .${ext}. Use CSV, OFX ou PDF.`);
      return;
    }

    startTransition(async () => {
      // PDF vai como base64 (LLM aceita binário); CSV/OFX/MD vão como texto.
      const content =
        source === 'pdf' ? await fileToBase64(file) : await file.text();
      const result = await previewImport({
        content,
        source,
        accountId,
        filename: file.name,
      });
      if (result.ok) {
        setPreview(result.data);
        // Marca todos exceto duplicatas (por índice, não por hash)
        const initial = new Set<number>();
        result.data.items.forEach((item, idx) => {
          if (!item.duplicateOfId) initial.add(idx);
        });
        setSelectedIndices(initial);
        setCategoryOverrides({});
      } else {
        setError(result.error);
      }
    });
  }

  function toggleSelected(index: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAll() {
    if (!preview) return;
    if (selectedIndices.size === preview.items.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(
        new Set(preview.items.map((_, idx) => idx))
      );
    }
  }

  function setCategory(index: number, categoryId: string) {
    setCategoryOverrides((prev) => ({ ...prev, [index]: categoryId }));
  }

  function handleConfirm() {
    if (!preview) return;
    setError(null);
    const items = preview.items
      .map((i, idx) => ({ item: i, idx }))
      .filter(({ idx }) => selectedIndices.has(idx))
      .map(({ item: i, idx }) => ({
        externalHash: i.externalHash,
        date: i.date,
        rawDescription: i.rawDescription,
        normalizedDescription: i.normalizedDescription,
        amountCents: i.amountCents,
        kind: i.kind,
        categoryId:
          categoryOverrides[idx] !== undefined
            ? categoryOverrides[idx]
            : i.suggestedCategoryId,
        originalSuggestedCategoryId: i.suggestedCategoryId,
      }));

    if (items.length === 0) {
      setError('Selecione ao menos um item pra importar');
      return;
    }

    startTransition(async () => {
      const result = await confirmImport({
        batchId: preview.batchId,
        items,
      });
      if (result.ok) {
        router.push('/lancamentos');
      } else {
        setError(result.error);
      }
    });
  }

  function handleDiscard() {
    if (!preview) return;
    startTransition(async () => {
      await discardImport(preview.batchId);
      setPreview(null);
      setSelectedIndices(new Set());
      setCategoryOverrides({});
      setFile(null);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">
            Importar extrato
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aceita CSV, OFX, Markdown (parser local) e PDF (caro — prefira MD).
          </p>
        </div>
      </div>
      <PromptTemplateDialog
        open={promptDialogOpen}
        onOpenChange={setPromptDialogOpen}
      />

      {!preview && (
        <div className="rounded-md border border-border bg-surface p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account">Conta de destino</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="file">Arquivo</Label>
            <label
              htmlFor="file"
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background py-12 text-center transition-colors hover:bg-muted',
                file && 'border-positive/60'
              )}
            >
              <Upload className="size-6 text-muted-foreground" />
              <div className="text-sm">
                {file ? (
                  <span className="font-medium">{file.name}</span>
                ) : (
                  <span className="text-muted-foreground">
                    Clique pra escolher ou arraste o arquivo aqui
                  </span>
                )}
              </div>
              <input
                id="file"
                type="file"
                accept=".csv,.ofx,.pdf,.md,.markdown"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="flex flex-col gap-1.5 text-xs">
              <p className="flex items-start gap-2 text-muted-foreground">
                <Sparkles className="mt-0.5 size-3 shrink-0 text-positive" />
                <span>
                  <strong className="text-foreground">Recomendado:</strong>{' '}
                  use Claude.ai (web) pra extrair sua fatura/extrato em
                  Markdown e importe o <code className="font-mono">.md</code>.
                  Custo ~zero, controle total.
                  <button
                    type="button"
                    onClick={() => setPromptDialogOpen(true)}
                    className="ml-1 inline-flex items-center gap-1 underline hover:text-foreground"
                  >
                    Copiar prompt <ExternalLink className="size-3" />
                  </button>
                </span>
              </p>
              {file && detectSource(file.name) === 'pdf' && (
                <p className="flex items-start gap-2 text-negative">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  <span>
                    PDF custa ~$0.20-0.30 por arquivo (Sonnet processa
                    imagem). Prefira Markdown via Claude.ai.
                  </span>
                </p>
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm text-negative" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handlePreview}
              disabled={isPending}
            >
              {isPending
                ? file && detectSource(file.name) === 'pdf'
                  ? 'Extraindo via IA…'
                  : 'Lendo arquivo…'
                : 'Pré-visualizar'}
            </Button>
          </div>
        </div>
      )}

      {preview && (
        <>
          <PreviewSummary
            preview={preview}
            selectedSize={selectedIndices.size}
          />

          <div className="rounded-md border border-border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        selectedIndices.size === preview.items.length
                      }
                      onCheckedChange={toggleAll}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  <TableHead className="w-24">Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.items.map((item, idx) => {
                  const isSelected = selectedIndices.has(idx);
                  const isDup = !!item.duplicateOfId;
                  const currentCategory =
                    categoryOverrides[idx] !== undefined
                      ? categoryOverrides[idx]
                      : item.suggestedCategoryId;
                  const eligibleCategories =
                    item.kind === 'income'
                      ? incomeCategories
                      : expenseCategories;
                  const { display, tone } = formatTxAmount(
                    item.amountCents,
                    item.kind
                  );
                  return (
                    <TableRow
                      key={idx}
                      className={cn(isDup && 'bg-neutral/5')}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelected(idx)}
                          aria-label="Importar este item"
                        />
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatDateShort(item.date)}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-col gap-0.5">
                          <span>{item.rawDescription}</span>
                          <div className="flex flex-wrap gap-1.5">
                            {isDup && (
                              <Badge tone="neutral">
                                possível duplicata
                              </Badge>
                            )}
                            {item.installmentInfo && (
                              <Badge tone="muted">
                                parcela {item.installmentInfo.current}/
                                {item.installmentInfo.total}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={currentCategory ?? ''}
                          onValueChange={(v) => setCategory(idx, v)}
                        >
                          <SelectTrigger className="h-8 border-transparent bg-transparent px-2 text-sm hover:bg-muted">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {eligibleCategories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums font-medium',
                          tone === 'positive' && 'text-positive',
                          tone === 'negative' && 'text-negative'
                        )}
                      >
                        {display}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {error && (
            <p className="text-sm text-negative" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleDiscard}
              disabled={isPending}
              type="button"
            >
              Descartar
            </Button>
            <Button
              variant="positive"
              onClick={handleConfirm}
              disabled={isPending || selectedIndices.size === 0}
              type="button"
            >
              {isPending
                ? 'Importando…'
                : `Confirmar ${selectedIndices.size} item${
                    selectedIndices.size === 1 ? '' : 's'
                  }`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function PreviewSummary({
  preview,
  selectedSize,
}: {
  preview: NonNullable<PreviewState>;
  selectedSize: number;
}) {
  const totalCount = preview.items.length;
  const dupCount = preview.items.filter((i) => i.duplicateOfId).length;
  const newCount = totalCount - dupCount;
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <FileText className="size-5 text-muted-foreground" />
        <div className="flex-1">
          <div className="text-sm font-medium">
            {totalCount} lançamento{totalCount === 1 ? '' : 's'} encontrado
            {totalCount === 1 ? '' : 's'} —{' '}
            <span className="text-muted-foreground font-normal">
              {newCount} novo{newCount === 1 ? '' : 's'}, {dupCount} possível
              {dupCount === 1 ? '' : 'is'} duplicata
              {dupCount === 1 ? '' : 's'}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {selectedSize} selecionado{selectedSize === 1 ? '' : 's'} pra
            importar. Edite categorias antes de confirmar.
          </div>
        </div>
        {dupCount > 0 && (
          <AlertTriangle className="size-4 shrink-0 text-neutral" />
        )}
      </div>
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'neutral' | 'muted';
}) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-xs',
        tone === 'neutral' && 'bg-neutral/15 text-neutral',
        tone === 'muted' && 'bg-muted text-muted-foreground'
      )}
    >
      {children}
    </span>
  );
}

const PROMPT_TEMPLATE = `Vou colar abaixo o conteúdo de uma fatura de cartão de crédito ou extrato bancário. Extraia TODAS as transações e formate como uma tabela markdown EXATAMENTE neste formato:

| Data | Descrição | Valor |
|------|-----------|-------|
| YYYY-MM-DD | Descrição limpa | -valor.cents |

REGRAS:
- Datas em ISO (YYYY-MM-DD)
- Valores em formato US (ponto decimal, sem separador de milhar). Ex: -1234.56
- Negativo = saída de dinheiro. Positivo = entrada.

PARA FATURA DE CARTÃO:
- TODOS os valores devem ser negativos, EXCETO estornos/créditos legítimos.
- NÃO INCLUA: total da fatura, valor a pagar, saldo anterior, juros sobre saldo, pagamento da fatura anterior, valor mínimo. Esses NÃO são transações.
- INCLUA APENAS: compras (negativas) e estornos/cancelamentos (positivos).

PARA EXTRATO BANCÁRIO:
- Respeite os sinais. Negativo pra saídas (débitos, Pix enviado, saques).
- Positivo pra entradas (créditos, Pix recebido, depósitos).
- NÃO INCLUA: saldos parciais, saldo anterior, saldo final.

OUTRAS REGRAS:
- Limpe descrições: remova códigos numéricos longos, datas redundantes no meio do texto, asteriscos isolados, prefixos como "PIX TRANSF" se forem ruído.
- Mantenha o nome do estabelecimento legível.
- Detecte e preserve marcadores de parcela: "PARC 3/12", "Parcela 2 de 10", etc.

Retorne APENAS a tabela markdown, sem explicação extra. Aqui está o documento:

[COLE A FATURA OU EXTRATO AQUI]`;

function PromptTemplateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(PROMPT_TEMPLATE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Prompt pra Claude.ai</DialogTitle>
          <DialogDescription>
            Cole esse prompt no Claude.ai (web), depois adicione sua fatura
            ou extrato. Ele vai gerar uma tabela markdown que você cola num{' '}
            <code className="font-mono">.md</code> e importa aqui.
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-[40vh] overflow-auto rounded-md border border-border bg-muted p-4 text-xs whitespace-pre-wrap font-mono">
          {PROMPT_TEMPLATE}
        </pre>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button">
              Fechar
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleCopy}>
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copiado!' : 'Copiar prompt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
