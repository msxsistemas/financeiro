import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useState, useEffect } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'
import Layout from './components/Layout'
import Onboarding from './components/Onboarding'
import Dashboard from './pages/Dashboard'
import Debts from './pages/Debts'
import WhatsApp from './pages/WhatsApp'
import Calendar from './pages/Calendar'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Contacts from './pages/Contacts'
import Goals from './pages/Goals'
import Loans from './pages/Loans'
import Delinquents from './pages/Delinquents'
import WhatsAppLog from './pages/WhatsAppLog'
import IPTV from './pages/IPTV'
import IPTVDebts from './pages/IPTVDebts'
import IPTVExpenses from './pages/IPTVExpenses'
import Expenses from './pages/Expenses'
import Products from './pages/Products'
import Categories from './pages/Categories'

function PrivateRoute({ children }) {
  const token = localStorage.getItem('fin_token')
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('fin_onboarding_done') && !!localStorage.getItem('fin_token')
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
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
    </ErrorBoundary>
  )
}
