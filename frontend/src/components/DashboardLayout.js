'use client'
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import ProtectedRoute from './ProtectedRoute'
import Navbar from './Navbar'
import Sidebar from './Sidebar'

export default function DashboardLayout({ children }) {
  const { user } = useAuth()
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar
          onMenuToggle={() => setIsMobileNavOpen((prev) => !prev)}
          isMobileNavOpen={isMobileNavOpen}
        />
        <div className="flex">
          <Sidebar
            isOpen={isMobileNavOpen}
            onClose={() => setIsMobileNavOpen(false)}
          />
          {isMobileNavOpen && (
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setIsMobileNavOpen(false)}
              className="fixed inset-0 z-30 bg-black/40 md:hidden"
            />
          )}
          <main className="flex-1 p-4 sm:p-6">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  )
}
