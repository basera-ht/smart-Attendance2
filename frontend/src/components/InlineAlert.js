'use client'

export default function InlineAlert({ message, type = 'info', onClose }) {
  if (!message) return null

  const styles = {
    success: 'bg-green-50 border-green-200 text-green-700',
    error: 'bg-red-50 border-red-200 text-red-700',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    info: 'bg-blue-50 border-blue-200 text-blue-700'
  }

  const classes = styles[type] || styles.info

  return (
    <div className={`border px-4 py-3 rounded-lg flex items-start justify-between ${classes}`}>
      <div className="text-sm">{message}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="ml-4 text-sm underline"
        >
          Dismiss
        </button>
      )}
    </div>
  )
}
