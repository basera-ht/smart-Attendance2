export const getDeviceId = () => {
    if (typeof window === 'undefined') return null;

    let deviceId = localStorage.getItem('attendance_device_id');
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('attendance_device_id', deviceId);
    }
    return deviceId;
};
