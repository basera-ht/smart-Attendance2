'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../../../hooks/useAuth'
import { employeesAPI } from '../../../services/api'
import Layout from '../../../components/Layout'
import {
    Users,
    Search,
    AlertTriangle,
    Smartphone,
    SmartphoneNfc,
    RefreshCw,
    Clock
} from 'lucide-react'
import moment from 'moment'
import { toast } from 'react-hot-toast'

export default function DeviceManagement() {
    const router = useRouter()
    const { user, loading: authLoading } = useAuth()
    const [employees, setEmployees] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [resetModalOpen, setResetModalOpen] = useState(false)
    const [selectedEmployee, setSelectedEmployee] = useState(null)
    const [resetting, setResetting] = useState(false)

    useEffect(() => {
        if (!authLoading && user) {
            if (user.role !== 'admin') {
                router.push('/dashboard')
                return
            }
            fetchEmployees()
        }
    }, [user, authLoading, router])

    const fetchEmployees = async () => {
        try {
            setLoading(true)
            const response = await employeesAPI.getEmployees()
            if (response.data.success) {
                setEmployees(response.data.data.docs)
            }
        } catch (error) {
            console.error('Error fetching employees:', error)
            toast.error('Failed to load employee list')
        } finally {
            setLoading(false)
        }
    }

    const handleResetClick = (employee) => {
        setSelectedEmployee(employee)
        setResetModalOpen(true)
    }

    const confirmReset = async () => {
        if (!selectedEmployee) return

        try {
            setResetting(true)
            await employeesAPI.resetDevice(selectedEmployee.id)
            toast.success(`Device reset for ${selectedEmployee.name}`)
            setResetModalOpen(false)
            fetchEmployees() // Refresh list
        } catch (error) {
            console.error('Reset error:', error)
            toast.error('Failed to reset device')
        } finally {
            setResetting(false)
            setSelectedEmployee(null)
        }
    }

    const filteredEmployees = employees.filter(emp =>
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchTerm.toLowerCase())
    )

    if (authLoading || (loading && employees.length === 0)) {
        return (
            <Layout>
                <div className="flex justify-center items-center h-screen">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            </Layout>
        )
    }

    return (
        <Layout>
            <div className="p-6">
                <div className="mb-6 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                            <Smartphone className="mr-2 h-6 w-6 text-blue-600" />
                            Device Management
                        </h1>
                        <p className="text-gray-600 mt-1">Manage employee device bindings and security</p>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="mb-6">
                    <div className="relative max-w-md">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Search by name, ID or email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Employees Table */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Seen</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredEmployees.map((employee) => (
                                    <tr key={employee.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="flex-shrink-0 h-10 w-10">
                                                    {employee.profilePicture ? (
                                                        <img className="h-10 w-10 rounded-full object-cover" src={employee.profilePicture} alt="" />
                                                    ) : (
                                                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                                                            {employee.name.charAt(0)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="ml-4">
                                                    <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                                                    <div className="text-sm text-gray-500">{employee.email}</div>
                                                    <div className="text-xs text-gray-400">{employee.employeeId}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {employee.registeredDeviceId ? (
                                                <div className="flex flex-col">
                                                    <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 w-fit">
                                                        Linked
                                                    </span>
                                                    <span className="text-xs text-gray-400 mt-1 font-mono">
                                                        ID: {employee.registeredDeviceId.substring(0, 16)}...
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                                                    Unlinked
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {employee.deviceLastSeen ? (
                                                <div className="flex items-center">
                                                    <Clock className="w-3 h-3 mr-1" />
                                                    {moment(employee.deviceLastSeen).fromNow()}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            {employee.registeredDeviceId && (
                                                <button
                                                    onClick={() => handleResetClick(employee)}
                                                    className="text-orange-600 hover:text-orange-900 bg-orange-50 hover:bg-orange-100 px-3 py-1 rounded-md transition-colors flex items-center ml-auto"
                                                >
                                                    <RefreshCw className="w-3 h-3 mr-1" />
                                                    Reset Device
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}

                                {filteredEmployees.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-12 text-center text-gray-500">
                                            <div className="flex flex-col items-center justify-center">
                                                <Users className="h-10 w-10 text-gray-300 mb-2" />
                                                <p>No employees found matching your search.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Reset Confirmation Modal */}
            {resetModalOpen && selectedEmployee && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={() => setResetModalOpen(false)}></div>

                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

                        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <div className="sm:flex sm:items-start">
                                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                                        <AlertTriangle className="h-6 w-6 text-red-600" />
                                    </div>
                                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                                        <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                                            Reset Device Binding?
                                        </h3>
                                        <div className="mt-2">
                                            <p className="text-sm text-gray-500">
                                                Are you sure you want to unbind the device for <strong>{selectedEmployee.name}</strong>?
                                            </p>
                                            <p className="text-sm text-gray-500 mt-2">
                                                This action cannot be undone. The user will be able to register a new device on their next login.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                                <button
                                    type="button"
                                    onClick={confirmReset}
                                    disabled={resetting}
                                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {resetting ? 'Resetting...' : 'Yes, Reset Device'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setResetModalOpen(false)}
                                    disabled={resetting}
                                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    )
}
