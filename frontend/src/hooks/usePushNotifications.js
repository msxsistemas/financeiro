import { useEffect, useState, useCallback } from 'react'
import api from '../api'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i)
  return out
}

export function usePushNotifications() {
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState('default')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  const check = useCallback(async () => {
    const sup = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    setSupported(sup)
    if (!sup) return
    setPermission(Notification.permission)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setSubscribed(!!sub)
    } catch {}
  }, [])

  useEffect(() => { check() }, [check])

  const subscribe = async () => {
    setLoading(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        setLoading(false)
        return { ok: false, reason: 'permission_denied' }
      }
      const { data } = await api.get('/api/push/vapid-public-key')
      if (!data.publicKey) {
        setLoading(false)
        return { ok: false, reason: 'vapid_not_configured' }
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey)
      })
      const subJson = sub.toJSON()
      await api.post('/api/push/subscribe', {
        endpoint: subJson.endpoint,
        keys: subJson.keys
      })
      setSubscribed(true)
      return { ok: true }
    } catch (err) {
      return { ok: false, reason: err.message || 'error' }
    } finally {
      setLoading(false)
    }
  }

  const unsubscribe = async () => {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {})
        await sub.unsubscribe()
      }
      setSubscribed(false)
      return { ok: true }
    } catch (err) {
      return { ok: false, reason: err.message }
    } finally {
      setLoading(false)
    }
  }

  const sendTest = async () => {
    try {
      const r = await api.post('/api/push/test')
      return r.data
    } catch (err) {
      return { error: err.response?.data?.error || err.message }
    }
  }

  return { supported, permission, subscribed, loading, subscribe, unsubscribe, sendTest, refresh: check }
}
