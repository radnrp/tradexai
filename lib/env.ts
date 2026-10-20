// Public config only. Bot token, JWT/OTP secrets and gateway keys never belong in the frontend.
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3003").replace(/\/+$/, "");
export const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME ?? "";
export const MINI_APP_SHORT_NAME = process.env.NEXT_PUBLIC_MINI_APP_SHORT_NAME ?? "";
