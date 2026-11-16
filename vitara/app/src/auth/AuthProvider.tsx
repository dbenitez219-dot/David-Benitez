import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string; display_name: string; birth_date: string | null; biological_sex: string | null; gender_identity: string | null;
  height_cm: number | null; weight_kg: number | null; target_weight_kg: number | null; onboarding_completed_at: string | null;
};
export type Preferences = {
  goals: string[]; activity_level: string | null; training_experience: string | null; training_place: string | null; equipment: string[];
  training_days: number[]; session_minutes: number | null; favorite_foods: string[]; meal_times: Record<string, string>;
  sleep_hours_target: number | null; timezone: string;
};
export type Health = {
  injuries: string | null; conditions: string | null; medications: string | null; allergies: string[]; dietary_restrictions: string[]; health_consent_at: string | null;
};

type Ctx = {
  session: Session | null; loading: boolean;
  profile: Profile | null; prefs: Preferences | null; health: Health | null;
  refresh: () => Promise<void>; signOut: () => Promise<void>;
};
const AuthCtx = createContext<Ctx>(null!);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [health, setHealth] = useState<Health | null>(null);

  const load = useCallback(async (uid: string | null) => {
    if (!uid) { setProfile(null); setPrefs(null); setHealth(null); return; }
    const [p, pr, h] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('preferences').select('*').eq('user_id', uid).maybeSingle(),
      supabase.from('health_profiles').select('*').eq('user_id', uid).maybeSingle(),
    ]);
    setProfile(p.data as Profile | null); setPrefs(pr.data as Preferences | null); setHealth(h.data as Health | null);
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await load(data.session?.user.id ?? null);
      if (alive) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      // Diferido: no llamar a Supabase dentro del callback de auth.
      setTimeout(() => { load(s?.user.id ?? null); }, 0);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [load]);

  const value = useMemo<Ctx>(() => ({
    session, loading, profile, prefs, health,
    refresh: () => load(session?.user.id ?? null),
    signOut: async () => { await supabase.auth.signOut(); },
  }), [session, loading, profile, prefs, health, load]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
