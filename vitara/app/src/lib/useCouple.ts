import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type CoupleStatus = { linked: boolean; couple_id: string | null; partner_id: string | null; partner_name: string | null };

export function useCouple() {
  const [status, setStatus] = useState<CoupleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const { data } = await supabase.rpc('couple_status');
    const row = Array.isArray(data) ? data[0] : data;
    setStatus(row ?? { linked: false, couple_id: null, partner_id: null, partner_name: null });
    setLoading(false);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { status, loading, reload };
}
