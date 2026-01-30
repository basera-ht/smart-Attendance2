'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { employeesAPI } from '../../services/api'
import DashboardLayout from '../../components/DashboardLayout'
import InlineAlert from '../../components/InlineAlert'

export default function Employees() {
  const { user, hasRole } = useAuth()
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [editingEmployeeId, setEditingEmployeeId] = useState(null)
  const [pageAlert, setPageAlert] = useState(null)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'employee',
    department: '',
    position: '',
    phone: ''
  })

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        setLoading(true)
        const response = await employeesAPI.getEmployees()
        
        if (response.data && response.data.success) {
          // Backend returns a paginated object { docs, ... }
          const payload = response.data.data
          setEmployees(Array.isArray(payload) ? payload : (payload?.docs || []))
        } else {
          setError('Failed to fetch employees data')
        }
      } catch (err) {
        console.error('Error fetching employees:', err)
        setError('Error loading employees data')
        // Set some sample data for demo
        setEmployees([
          {
            id: 1,
            name: 'John Doe',
            email: 'john@company.com',
            role: 'employee',
            department: 'IT',
            position: 'Developer',
            employeeId: 'EMP001',
            isActive: true
          },
          {
            id: 2,
            name: 'Jane Smith',
            email: 'jane@company.com',
            role: 'hr',
            department: 'HR',
            position: 'HR Manager',
            employeeId: 'EMP002',
            isActive: true
          },
          {
            id: 3,
            name: 'Mike Johnson',
            email: 'mike@company.com',
            role: 'admin',
            department: 'IT',
            position: 'System Administrator',
            employeeId: 'EMP003',
            isActive: true
          }
        ])
      } finally {
        setLoading(false)
      }
    }

    fetchEmployees()
  }, [])

  useEffect(() => {
    if (!pageAlert) return
    const timer = setTimeout(() => setPageAlert(null), 6000)
    return () => clearTimeout(timer)
  }, [pageAlert])

  const showPageAlert = (message, type = 'info') => {
    setPageAlert({ message, type })
  }

  const handleDeleteClick = (employee) => {
    if (!hasRole('admin')) return
    setSelectedEmployee(employee)
    setShowDeleteModal(true)
  }

  const handleEditClick = (employee) => {
    if (!hasRole('admin')) return
    const employeeId = employee._id || employee.id
    setEditingEmployeeId(employeeId)
    setShowForm(true)
    setFormData({
      name: employee.name || '',
      email: employee.email || '',
      password: '',
      role: employee.role || 'employee',
      department: employee.department || '',
      position: employee.position || '',
      phone: employee.phone || ''
    })
  }

  const handleDeactivate = async () => {
    if (!selectedEmployee) return
    const employeeId = selectedEmployee._id || selectedEmployee.id
    
    try {
      await employeesAPI.deleteEmployee(employeeId, false) // false = deactivate (soft delete)
      // Optimistically update UI: mark employee as inactive
      setEmployees((prev) => prev.map((e) => {
        const id = e._id || e.id
        if (id === employeeId) {
          return { ...e, isActive: false, status: 'inactive' }
        }
        return e
      }))
      setShowDeleteModal(false)
      setSelectedEmployee(null)
      showPageAlert('Employee deactivated successfully', 'success')
    } catch (err) {
      console.error('Error deactivating employee:', err)
      showPageAlert(err.response?.data?.message || 'Failed to deactivate employee. Please try again.', 'error')
    }
  }

  const handlePermanentDelete = async () => {
    if (!selectedEmployee) return
    const employeeId = selectedEmployee._id || selectedEmployee.id
    
    // Double confirmation for permanent delete
    const confirmed = window.confirm(
      `WARNING: This will permanently delete ${selectedEmployee.name} from the database. This action cannot be undone.\n\nAre you absolutely sure you want to proceed?`
    )
    if (!confirmed) return

    try {
      await employeesAPI.deleteEmployee(employeeId, true) // true = permanent delete
      // Remove employee from list
      setEmployees((prev) => prev.filter((e) => {
        const id = e._id || e.id
        return id !== employeeId
      }))
      setShowDeleteModal(false)
      setSelectedEmployee(null)
      showPageAlert('Employee permanently deleted from database', 'success')
    } catch (err) {
      console.error('Error permanently deleting employee:', err)
      showPageAlert(err.response?.data?.message || 'Failed to delete employee. Please try again.', 'error')
    }
  }

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        department: formData.department,
        position: formData.position,
        phone: formData.phone
      }

      if (!editingEmployeeId) {
        if (!formData.password || formData.password.length < 6) {
          showPageAlert('Password must be at least 6 characters', 'error')
          return
        }
        payload.password = formData.password
      } else if (formData.password) {
        if (formData.password.length < 6) {
          showPageAlert('Password must be at least 6 characters', 'error')
          return
        }
        payload.password = formData.password
      }

      const response = editingEmployeeId
        ? await employeesAPI.updateEmployee(editingEmployeeId, payload)
        : await employeesAPI.createEmployee(payload)
      
      if (response.data && response.data.success) {
        showPageAlert(`Employee ${editingEmployeeId ? 'updated' : 'created'} successfully!`, 'success')
        setShowForm(false)
        setEditingEmployeeId(null)
        setFormData({
          name: '',
          email: '',
          password: '',
          role: 'employee',
          department: '',
          position: '',
          phone: ''
        })
        // Refresh employees list
        window.location.reload()
      }
    
    } catch (err) {
      console.error('Error creating employee:', err)
      // Show detailed error message from backend if available
      const errorMessage = err.response?.data?.message 
        || err.response?.data?.errors?.[0]?.msg 
        || err.message 
        || 'Failed to create employee. Please try again.'
      showPageAlert(`Error: ${errorMessage}`, 'error')
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="loading-spinner"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Employee Management</h1>
          {hasRole('admin') && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              {showForm ? 'Cancel' : 'Add Employee'}
            </button>
          )}
        </div>

        {error && (
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        {pageAlert && (
          <InlineAlert
            message={pageAlert.message}
            type={pageAlert.type}
            onClose={() => setPageAlert(null)}
          />
        )}

        {showForm && hasRole('admin') && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {editingEmployeeId ? 'Edit Employee' : 'Add New Employee'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Temporary Password</label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required={!editingEmployeeId}
                    placeholder={editingEmployeeId ? 'Leave blank to keep password' : 'Min 6 characters'}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Role</label>
                  <select
                    name="role"
                    value={formData.role}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="employee">Employee</option>
                    <option value="hr">HR Manager</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Department</label>
                  <input
                    type="text"
                    name="department"
                    value={formData.department}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Position</label>
                  <input
                    type="text"
                    name="position"
                    value={formData.position}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setEditingEmployeeId(null)
                    setFormData({
                      name: '',
                      email: '',
                      password: '',
                      role: 'employee',
                      department: '',
                      position: '',
                      phone: ''
                    })
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  {editingEmployeeId ? 'Update Employee' : 'Create Employee'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white shadow rounded-lg">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">All Employees</h3>
          </div>
          <div className="md:hidden space-y-3 p-4">
            {employees.length > 0 ? (
              employees.map((employee) => {
                const employeeId = employee._id || employee.id
                return (
                  <div key={employeeId} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-gray-500">Name</p>
                        <p className="text-base font-semibold text-gray-900">{employee.name}</p>
                        <p className="text-xs text-gray-500">{employee.email}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        employee.role === 'admin' 
                          ? 'bg-red-100 text-red-800' 
                          : employee.role === 'hr'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {employee.role.charAt(0).toUpperCase() + employee.role.slice(1)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-600">
                      <div>
                        <p className="text-xs uppercase text-gray-400">Employee ID</p>
                        <p className="text-gray-900">{employee.employeeId || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-gray-400">Status</p>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          employee.isActive 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {employee.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-gray-400">Department</p>
                        <p className="text-gray-900">{employee.department || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-gray-400">Position</p>
                        <p className="text-gray-900">{employee.position || '-'}</p>
                      </div>
                    </div>
                    {hasRole('admin') && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleEditClick(employee)}
                          className="flex-1 px-3 py-2 bg-blue-500 text-white rounded-md text-xs font-medium hover:bg-blue-600"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteClick(employee)}
                          className="flex-1 px-3 py-2 bg-red-500 text-white rounded-md text-xs font-medium hover:bg-red-600 disabled:opacity-50"
                          disabled={employee.isActive === false}
                        >
                          {employee.isActive === false ? 'Deactivated' : 'Delete'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <div className="text-center text-sm text-gray-500 py-6">
                No employees found
              </div>
            )}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employee ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  {hasRole('admin') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {employees.length > 0 ? (
                  employees.map((employee) => (
                    <tr key={(employee && (employee._id || employee.id)) || Math.random()}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {employee.employeeId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {employee.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {employee.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          employee.role === 'admin' 
                            ? 'bg-red-100 text-red-800' 
                            : employee.role === 'hr'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {employee.role.charAt(0).toUpperCase() + employee.role.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {employee.department}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {employee.position}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          employee.isActive 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {employee.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {hasRole('admin') && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => handleEditClick(employee)}
                            className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 mr-2"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteClick(employee)}
                            className="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50"
                            disabled={employee.isActive === false}
                          >
                            {employee.isActive === false ? 'Deactivated' : 'Delete'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={hasRole('admin') ? 8 : 7} className="px-6 py-4 text-center text-sm text-gray-500">
                      No employees found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && selectedEmployee && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Delete Employee</h3>
              </div>
              <div className="px-6 py-4">
                <p className="text-sm text-gray-600 mb-4">
                  What would you like to do with <strong>{selectedEmployee.name}</strong>?
                </p>
                <div className="space-y-3">
                  <button
                    onClick={handleDeactivate}
                    className="w-full px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors text-left"
                  >
                    <div className="font-medium">Deactivate Employee</div>
                    <div className="text-sm opacity-90">Employee will be deactivated but data will be preserved</div>
                  </button>
                  <button
                    onClick={handlePermanentDelete}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-left"
                  >
                    <div className="font-medium">Permanently Delete</div>
                    <div className="text-sm opacity-90">Employee will be permanently removed from database (cannot be undone)</div>
                  </button>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => {
                    setShowDeleteModal(false)
                    setSelectedEmployee(null)
                  }}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
