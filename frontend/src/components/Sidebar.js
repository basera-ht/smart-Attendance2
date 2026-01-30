'use client'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '../hooks/useAuth'
import { 
  LayoutDashboard, 
  Clock, 
  Users, 
  BarChart3, 
  User,
  Calendar,
  CalendarDays,
  QrCode,
  ScanLine,
  Building2,
  X
} from 'lucide-react'

const Sidebar = ({ isOpen = false, onClose = () => {} }) => {
  const router = useRouter()
  const { user, hasRole } = useAuth()

  const menuItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      roles: ['admin', 'hr', 'employee']
    },
    {
      name: 'Attendance',
      href: '/dashboard/attendance',
      icon: Clock,
      roles: ['admin', 'hr', 'employee']
    },
    {
      name: 'Employees',
      href: '/dashboard/employees',
      icon: Users,
      roles: ['admin', 'hr']
    },
    {
      name: 'Offices',
      href: '/dashboard/offices',
      icon: Building2,
      roles: ['admin', 'hr']
    },
    {
      name: 'Analytics',
      href: '/dashboard/analytics',
      icon: BarChart3,
      roles: ['admin', 'hr']
    },
    {
      name: 'Leaves',
      href: '/dashboard/leaves',
      icon: Calendar,
      roles: ['admin', 'hr', 'employee']
    },
    {
      name: 'Holidays',
      href: '/dashboard/holidays',
      icon: CalendarDays,
      roles: ['admin', 'hr', 'employee']
    },
    {
      name: 'Profile',
      href: '/dashboard/profile',
      icon: User,
      roles: ['admin', 'hr', 'employee']
    },
    {
      name: 'QR Admin',
      href: '/dashboard/qr-admin',
      icon: QrCode,
      roles: ['admin', 'hr']
    },
    {
      name: 'Scan QR',
      href: '/attendance/scan',
      icon: ScanLine,
      roles: ['admin', 'hr', 'employee']
    },
    {
      name: 'Show QR',
      href: '/attendance/qr',
      icon: QrCode,
      roles: ['admin', 'hr', 'employee']
    },
  ]

  const filteredMenuItems = menuItems.filter(item => 
    item.roles.includes(user?.role)
  )

  return (
    <div
      className={`fixed inset-y-0 left-0 z-40 w-64 bg-white shadow-lg transform transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="p-4 h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-4 md:hidden">
          <h2 className="text-lg font-semibold text-gray-800">Navigation</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md text-gray-600 hover:bg-gray-100"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-4 hidden md:block">Navigation</h2>
        <nav className="space-y-2">
          {filteredMenuItems.map((item) => {
            const isActive = router.pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon size={18} className="mr-3" />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

export default Sidebar