import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';

// Cualquier ruta no disponible (p. ej. «/» sin sesión) vuelve al lugar correcto.
export default function NotFound() {
  const { session } = useAuth();
  return <Redirect href={session ? '/' : '/login'} />;
}
