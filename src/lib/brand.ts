export const APP_NAME = 'Stridetail';
export const SUPPORT_EMAIL = 'support@stridetail.app';

/**
 * Base URL for public visit-report links (Plan 4 Task 7). MIRRORS the
 * send-sms function's DEFAULT_REPORT_BASE (its REPORT_BASE_URL env default) —
 * supabase/functions/send-sms/index.ts — so the link the owner shares is the
 * same link the client got by SMS. Change both together.
 */
export const REPORT_BASE_URL = 'https://stridetail.app/report';
