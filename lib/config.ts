export const config = {
  name: process.env.NEXT_PUBLIC_APP_NAME || 'CareLedger',
  organization: process.env.NEXT_PUBLIC_ORGANIZATION_NAME || 'Your organization',
  currency: process.env.NEXT_PUBLIC_CURRENCY || 'PKR',
  locale: process.env.NEXT_PUBLIC_LOCALE || 'en-PK',
  timezone: process.env.NEXT_PUBLIC_TIMEZONE || 'Asia/Karachi',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
  receiptBucket: process.env.NEXT_PUBLIC_RECEIPT_BUCKET || 'receipts',
  photoBucket: process.env.NEXT_PUBLIC_PHOTO_BUCKET || 'child-photos',
  maxUploadMB: Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || 10),
};
export const permissions = ['manage_orphans', 'assign_donors', 'view_financials', 'manage_financials', 'approve_donors', 'run_audits'] as const;
export type Permission = typeof permissions[number];
export const categories = (process.env.NEXT_PUBLIC_EXPENSE_CATEGORIES || 'Education,Healthcare,Nutrition,Clothing,Housing,General').split(',').map(value=>value.trim()).filter(Boolean);
export function money(value: number) { return new Intl.NumberFormat(config.locale, { style: 'currency', currency: config.currency, maximumFractionDigits: 2 }).format(value); }
