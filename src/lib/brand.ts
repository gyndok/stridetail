export const APP_NAME = 'Stridetail';
export const SUPPORT_EMAIL = 'support@stridetail.app';

/**
 * Public web origin (the Expo Web export lives here alongside the public
 * report/invoice pages). The user's manual and other shared copy build their
 * URLs from this, keeping the domain in one place like the bases below.
 */
export const WEB_BASE_URL = 'https://stridetail.app';
export const PORTAL_LOGIN_URL = `${WEB_BASE_URL}/portal-login`;

/**
 * Base URL for public visit-report links (Plan 4 Task 7). MIRRORS the
 * send-sms function's DEFAULT_REPORT_BASE (its REPORT_BASE_URL env default) —
 * supabase/functions/send-sms/index.ts — so the link the owner shares is the
 * same link the client got by SMS. Change both together.
 */
export const REPORT_BASE_URL = 'https://stridetail.app/report';

/**
 * Base URL for public invoice links (Plan 5), mirroring REPORT_BASE_URL. The
 * invoice-public function and email template land in Plan 5 Task 5 — keep
 * their base in sync with this constant, exactly like the report pair.
 */
export const INVOICE_BASE_URL = 'https://stridetail.app/invoice';
