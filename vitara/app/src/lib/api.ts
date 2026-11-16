import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export class ApiError extends Error { constructor(public code: string, message: string) { super(message); } }

/** Llama a una Edge Function (las claves secretas y la IA viven allí). Devuelve el JSON o lanza ApiError con mensaje legible. */
export async function callFn<T>(name: string, body?: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const j = await error.context.json().catch(() => null);
      throw new ApiError(j?.error ?? 'http', j?.message ?? 'No se pudo completar la acción.');
    }
    throw new ApiError('network', 'No hay conexión con el servidor. Revisá tu internet.');
  }
  return data as T;
}
