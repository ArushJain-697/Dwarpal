// Where the admin API + WebSocket live. Overridable at build time via Vite env
// vars, defaulting to the local admin port.
export const ADMIN_BASE = import.meta.env.VITE_ADMIN_URL || 'http://localhost:3000';
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws';
