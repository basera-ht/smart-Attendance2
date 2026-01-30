import '../styles/globals.css'
import { useEffect } from 'react'
import ReduxProvider from '../components/ReduxProvider'
import Head from 'next/head'

export default function App({ Component, pageProps }) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        registration.active?.postMessage({ type: 'SYNC_QUEUE' })
      })
      .catch((err) => {
        console.error('Service worker registration failed:', err)
      })

    const handleOnline = () => {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SYNC_QUEUE' })
      }
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  return (
    <>
      <Head>
        <title>Corporate Smart Attendance System</title>
        <meta name="description" content="Modern attendance management system for corporations" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" sizes="192x192" href="/logo.png" />
      </Head>
      <ReduxProvider>
        <Component {...pageProps} />
      </ReduxProvider>
    </>
  )
}
