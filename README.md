# lushai-attendance
Office attendance management

## Environment variables

Backend:
- `OFFICE_ALLOWED_IPS`: Comma-separated IPs or CIDR ranges allowed for button check-in. Example: `203.0.113.10` or `203.0.113.0/24`.
- `TRUST_PROXY`: Set when running behind a reverse proxy so `X-Forwarded-For` is used to detect the real client IP (e.g. `1`, `loopback`, or `true`).
