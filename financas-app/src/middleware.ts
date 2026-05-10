import { NextResponse, type NextRequest } from 'next/server';

const COOKIE_NAME = 'active_workspace_id';
const PUBLIC_PATHS = ['/entrar'];

/**
 * Middleware: redireciona pra /entrar se não tem cookie de workspace.
 *
 * Não valida o cookie contra o banco aqui (middleware roda em Edge runtime,
 * sem acesso ao Postgres). A validação real acontece em
 * `requireActiveWorkspace()` dentro das pages, que joga redirect se o ID
 * cookie aponta pra workspace deletado.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Permite assets e API
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Permite rotas públicas
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const hasCookie = req.cookies.has(COOKIE_NAME);
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = '/entrar';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
