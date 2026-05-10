'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { enterWorkspace } from '@/lib/actions/workspace';

export function EntrarForm() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await enterWorkspace({ code });
      // Sucesso redireciona — só caímos aqui em erro
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-border bg-surface p-6 flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Código</Label>
        <Input
          id="code"
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="seucodigo"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={isPending}
          autoFocus
        />
      </div>

      {error && (
        <p className="text-sm text-negative" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={isPending || !code.trim()}>
        <LogIn />
        {isPending ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  );
}
