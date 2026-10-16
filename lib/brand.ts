export const brand = {
  careImage: process.env.NEXT_PUBLIC_CARE_IMAGE || '/images/care-learning.webp',
  demoPortraits: process.env.NEXT_PUBLIC_DEMO_PORTRAITS || '/images/demo-portraits.webp',
  chartMonths: 6,
  categoryColors: ['#23856a', '#ef709a', '#a2dccc', '#7979a1', '#c5cfa4', '#54b8b1'],
};
export const demoPortraitPositions: Record<string, string> = {
  'child-1': '0% 0%',
  'child-2': '100% 0%',
  'child-3': '0% 100%',
  'child-4': '100% 100%',
};
