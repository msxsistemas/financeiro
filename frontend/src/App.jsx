import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useState, lazy, Suspense } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import AdminLayout from './components/AdminLayout'
import Onboarding from './components/Onboarding'
import LoadingSpinner from './components/LoadingSpinner'

// Login é síncrono (rota pública, first paint)
import Login from './pages/Login'

// Resto: code-split por rota
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Debts = lazy(() => import('./pages/Debts'))
const WhatsApp = lazy(() => import('./pages/WhatsApp'))
const Calendar = lazy(() => import('./pages/Calendar'))
const Reports = lazy(() => import('./pages/Reports'))
const Settings = lazy(() => import('./pages/Settings'))
const Contacts = lazy(() => import('./pages/Contacts'))
const Goals = lazy(() => import('./pages/Goals'))
const Loans = lazy(() => import('./pages/Loans'))
const Delinquents = lazy(() => import('./pages/Delinquents'))
const WhatsAppLog = lazy(() => import('./pages/WhatsAppLog'))
const IPTV = lazy(() => import('./pages/IPTV'))
const IPTVDebts = lazy(() => import('./pages/IPTVDebts'))
const IPTVExpenses = lazy(() => import('./pages/IPTVExpenses'))
const Expenses = lazy(() => import('./pages/Expenses'))
const Products = lazy(() => import('./pages/Products'))
const Categories = lazy(() => import('./pages/Categories'))
const Trash = lazy(() => import('./pages/Trash'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'))
const AdminActivity = lazy(() => import('./pages/admin/AdminActivity'))
const History = lazy(() => import('./pages/History'))

function PrivateRoute({ children }) {
  const token = localStorage.getItem('fin_token')
  const user = (() => { try { return JSON.parse(localStorage.getItem('fin_user') || '{}') } catch { return {} } })()
  const [showOnboarding, setShowOnboarding] = useState(() => {
    // Só mostra onboarding se o usuário não deve trocar senha
    return !localStorage.getItem('fin_onboarding_done')
      && !!localStorage.getItem('fin_token')
      && !user.must_change_password
  })
  if (!token) return <Navigate to="/login" replace />
  if (showOnboarding) return <Onboarding onComplete={() => { localStorage.setItem('fin_onboarding_done', '1'); setShowOnboarding(false) }} />
  return children
}

export default function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><LoadingSpinner /></div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="debts" element={<Debts />} />
              <Route path="debts/:subtab" element={<Debts />} />
              <Route path="reports" element={<Reports />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="whatsapp" element={<WhatsApp />} />
              <Route path="contacts" element={<Contacts />} />
              <Route path="goals" element={<Goals />} />
              <Route path="expenses" element={<Expenses />} />
              <Route path="products" element={<Products />} />
              <Route path="categories" element={<Categories />} />
              <Route path="loans" element={<Loans />} />
              <Route path="delinquents" element={<Delinquents />} />
              <Route path="whatsapp-log" element={<WhatsAppLog />} />
              <Route path="iptv" element={<IPTV />} />
              <Route path="iptv/debts" element={<IPTVDebts />} />
              <Route path="iptv/expenses" element={<IPTVExpenses />} />
              <Route path="iptv/:subtab" element={<IPTV />} />
              <Route path="trash" element={<Trash />} />
              <Route path="history" element={<History />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            {/* Painel Admin — layout totalmente separado */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="activity" element={<AdminActivity />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
    </ErrorBoundary>
  )
}
