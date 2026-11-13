import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { authApi } from '../api/index.js';
import { tokenStorage } from '../api/client.js';

const AuthContext = createContext(null);

// Состояние аутентификации меняется только через действия (actions) редьюсера –
// тот же принцип «единственного источника истины», что и в хранилищах Vuex/Pinia
const initialState = { status: 'loading', user: null, token: tokenStorage.get() };

function authReducer(state, action) {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return { status: 'authenticated', user: action.user, token: action.token };
    case 'USER_LOADED':
      return { ...state, status: 'authenticated', user: action.user };
    case 'TOKEN_UPDATED':
      return { ...state, token: action.token };
    case 'USER_UPDATED':
      return { ...state, user: { ...state.user, ...action.user } };
    case 'LOGOUT':
      return { status: 'guest', user: null, token: null };
    default:
      throw new Error(`Неизвестное действие: ${action.type}`);
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const logout = useCallback(() => {
    tokenStorage.clear();
    dispatch({ type: 'LOGOUT' });
  }, []);

  // При запуске приложения проверяем сохраненный токен запросом профиля
  useEffect(() => {
    if (!state.token) {
      dispatch({ type: 'LOGOUT' });
      return;
    }
    authApi.me()
      .then((user) => dispatch({ type: 'USER_LOADED', user }))
      .catch(logout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Перехватчик axios сообщает об истекшем токене
  useEffect(() => {
    window.addEventListener('auth:expired', logout);
    return () => window.removeEventListener('auth:expired', logout);
  }, [logout]);

  const applyAuth = useCallback(({ user, token }) => {
    tokenStorage.set(token);
    dispatch({ type: 'LOGIN_SUCCESS', user, token });
    return user;
  }, []);

  const value = useMemo(() => ({
    ...state,
    isAuthenticated: state.status === 'authenticated',
    isAdmin: state.user?.role === 'admin',
    isOrganizer: state.user?.role === 'organizer',
    // создавать мероприятия и управлять своими могут организаторы и администраторы
    canOrganize: ['organizer', 'admin'].includes(state.user?.role),
    // reactivated – вход вернул аккаунт, деактивированный самим пользователем (страница входа сообщает об этом)
    login: (credentials) => authApi.login(credentials).then((res) => ({ user: applyAuth(res), reactivated: Boolean(res.reactivated) })),
    register: (data) => authApi.register(data).then(applyAuth),
    updateUser: (user) => dispatch({ type: 'USER_UPDATED', user }),
    // новый токен после смены пароля: сокет переподключается с ним
    updateToken: (token) => {
      tokenStorage.set(token);
      dispatch({ type: 'TOKEN_UPDATED', token });
    },
    logout,
  }), [state, applyAuth, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth используется вне AuthProvider');
  return ctx;
}
