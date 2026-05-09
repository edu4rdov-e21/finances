/**
 * Tipo de retorno padrão pras Server Actions.
 *
 *   ok:false  → erro humano + opcionalmente erros por campo (Zod flatten)
 *   ok:true   → data tipada
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[] | undefined>;
    };
