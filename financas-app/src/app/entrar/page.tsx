import { redirect } from 'next/navigation';
import { getActiveWorkspace } from '@/lib/workspace';
import { EntrarForm } from '@/components/entrar-form';

export default async function EntrarPage() {
  // Se já está logado, manda pra home
  const active = await getActiveWorkspace();
  if (active) redirect('/');

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-medium tracking-tight">
            Finanças
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Digite seu código de acesso
          </p>
        </div>
        <EntrarForm />
      </div>
    </div>
  );
}
