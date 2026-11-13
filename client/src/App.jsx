import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import Layout from './components/layout/Layout.jsx';
import ProtectedRoute, { GuestRoute } from './routes/ProtectedRoute.jsx';
import HomePage from './pages/HomePage.jsx';
import CatalogPage from './pages/CatalogPage.jsx';
import EventPage from './pages/EventPage.jsx';
import { LoginPage, RegisterPage } from './pages/AuthPages.jsx';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordRecoveryPages.jsx';
import ProfileLayout, { MyFavorites, MyRegistrations, MyReminders, ProfileSettings } from './pages/ProfilePage.jsx';
import { AboutPage, NotFoundPage } from './pages/MiscPages.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';

// Страницы администратора загружаются отдельными частями сборки (code splitting)
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout.jsx'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard.jsx'));
const AdminEvents = lazy(() => import('./pages/admin/AdminEvents.jsx'));
const EventFormPage = lazy(() => import('./pages/admin/EventFormPage.jsx'));
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories.jsx'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers.jsx'));
const OrganizerEvents = lazy(() => import('./pages/organizer/OrganizerEvents.jsx'));

// Карта маршрутов приложения: публичные, только для гостей, для вошедших и для администраторов
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="events" element={<CatalogPage />} />
        <Route path="events/:id" element={<EventPage />} />
        <Route path="about" element={<AboutPage />} />
        {/* восстановление пароля доступно и вошедшему пользователю: ссылка из письма открывается где угодно */}
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />

        <Route element={<GuestRoute />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfileLayout />}>
            <Route index element={<MyRegistrations />} />
            <Route path="favorites" element={<MyFavorites />} />
            <Route path="reminders" element={<MyReminders />} />
            <Route path="settings" element={<ProfileSettings />} />
          </Route>
        </Route>

        {/* кабинет организатора: свои мероприятия, участники, статистика (администратору тоже доступен) */}
        <Route element={<ProtectedRoute roles={['organizer', 'admin']} />}>
          <Route path="organizer" element={<OrganizerEvents />} />
          <Route path="organizer/events/new" element={<EventFormPage />} />
          <Route path="organizer/events/:id/edit" element={<EventFormPage />} />
        </Route>

        <Route element={<ProtectedRoute adminOnly />}>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="events" element={<AdminEvents />} />
            <Route path="events/new" element={<EventFormPage />} />
            <Route path="events/:id/edit" element={<EventFormPage />} />
            <Route path="categories" element={<AdminCategories />} />
            <Route path="users" element={<AdminUsers />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
