import axios from 'axios'
import toast from 'react-hot-toast'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://apifinanceiro.msxsystem.site',
  timeout: 15000,
  withCredentials: true,
})

// Adiciona token em todas as requisicoes
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fin_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Refresh token automatico + tratamento de erros
let isRefreshing = false
let refreshQueue = []

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Tentar refresh se 401 e nao e o proprio refresh
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes('/auth/refresh')) {
      originalRequest._retry = true

      if (!isRefreshing) {
        isRefreshing = true
        try {
          const refreshToken = localStorage.getItem('fin_refresh_token')
          const { data } = await axios.post(
            `${api.defaults.baseURL}/api/auth/refresh`,
            { refresh_token: refreshToken },
            { withCredentials: true }
          )
          // Salvar novo token
          localStorage.setItem('fin_token', data.token)
          api.defaults.headers.common.Authorization = `Bearer ${data.token}`

          // Reprocessar fila de requests que falharam
          refreshQueue.forEach(cb => cb(data.token))
          refreshQueue = []

          originalRequest.headers.Authorization = `Bearer ${data.token}`
          return api(originalRequest)
        } catch {
          // Refresh falhou — fazer logout
          localStorage.removeItem('fin_token')
          localStorage.removeItem('fin_user')
          localStorage.removeItem('fin_refresh_token')
          api.post('/api/auth/logout').catch(() => {})
          toast.error('Sessao expirada. Faca login novamente.')
          setTimeout(() => { window.location.href = '/login' }, 1500)
          return Promise.reject(error)
        } finally {
          isRefreshing = false
        }
      }

      // Se ja esta refreshing, enfileirar
      return new Promise((resolve) => {
        refreshQueue.push((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          resolve(api(originalRequest))
        })
      })
    }

    // Outros 401 (ex: login invalido)
    if (error.response?.status === 401) {
      localStorage.removeItem('fin_token')
      localStorage.removeItem('fin_user')
      localStorage.removeItem('fin_refresh_token')
      api.post('/api/auth/logout').catch(() => {})
      toast.error('Sessao expirada. Faca login novamente.')
      setTimeout(() => { window.location.href = '/login' }, 1500)
    }

    return Promise.reject(error)
  }
)

export default api
