import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext.jsx';
import { Spinner } from '../components/ui/index.jsx';

// Защищенный маршрут (аналог навигационного хука beforeEach во Vue Router):
// гость перенаправляется на вход с возвратом на исходную страницу, пользователь без нужной роли – на главную
export default function ProtectedRoute({ adminOnly = false, roles }) {
  const { status, isAdmin, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <div className="container"><Spinner label="Проверка входа…" /></div>;
  if (status === 'guest') return <Navigate to="/login" replace state={{ from: location }} />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

// Страницы входа и регистрации не нужны вошедшему пользователю
export function GuestRoute() {
  const { status } = useAuth();
  if (status === 'loading') return null;
  return status === 'authenticated' ? <Navigate to="/profile" replace /> : <Outlet />;
}
