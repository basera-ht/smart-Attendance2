'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

// Custom tooltip for better display
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-3 border border-gray-200 rounded shadow-lg">
        <p className="font-semibold mb-2">{data.fullName || label}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color }} className="text-sm">
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export const AttendanceBarChart = ({ data, period = 'weekly' }) => {
  // Validate and clean data
  const validData = Array.isArray(data)
    ? data.filter(item =>
      item &&
      typeof item === 'object' &&
      item.name
    ).map(item => {
      const base = {
        name: item.name,
        fullName: item.fullName || item.name,
        present: Number(item.present) || 0,
        absent: Number(item.absent) || 0,
        late: Number(item.late) || 0,
        halfDay: Number(item.halfDay) || 0
      };

      // For daily view, include additional metrics
      if (period === 'daily') {
        base.early = Number(item.early) || 0;
        base.onTime = Number(item.onTime) || 0;
        base.late = Number(item.late) || 0;
        base.veryLate = Number(item.veryLate) || 0;
        base.halfDay = Number(item.halfDay) || 0;
        base.checkOuts = Number(item.checkOuts) || 0;
      }

      return base;
    })
    : []

  // Determine which bars to show based on period
  const isDaily = period === 'daily';

  if (validData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        No attendance data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={validData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="name"
          angle={period === 'monthly' ? -45 : 0}
          textAnchor={period === 'monthly' ? 'end' : 'middle'}
          height={period === 'monthly' ? 80 : 30}
        />
        <YAxis />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        {isDaily ? (
          <>
            <Bar dataKey="early" fill="#10B981" name="Early (Before 10 AM)" />
            <Bar dataKey="onTime" fill="#3B82F6" name="On Time (10-11 AM)" />
            <Bar dataKey="late" fill="#FBBF24" name="Late (11 AM-12 PM)" />
            <Bar dataKey="veryLate" fill="#F97316" name="Very Late (After 12 PM)" />
            <Bar dataKey="halfDay" fill="#A855F7" name="Half Day" />
          </>
        ) : (
          <>
            <Bar dataKey="present" fill="#10B981" name="Present" />
            <Bar dataKey="halfDay" fill="#A855F7" name="Half Day" />
            <Bar dataKey="absent" fill="#EF4444" name="Absent" />
            <Bar dataKey="late" fill="#FBBF24" name="Late" />
          </>
        )}
      </BarChart>
    </ResponsiveContainer>
  )
}

export const StatusPieChart = ({ data }) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">Attendance Distribution</h3>
      {(!data || data.length === 0) ? (
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
          No distribution data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              // label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
              outerRadius={100}
              innerRadius={60}
              fill="#8884d8"
              dataKey="value"
              paddingAngle={5}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend verticalAlign="bottom" height={36} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}