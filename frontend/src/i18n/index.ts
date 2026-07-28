export const messages = {
  en: {
    appName: 'Jagoo Bahee',
    feed: 'Feed',
    communities: 'Communities',
    messages: 'Messages',
    notifications: 'Notifications',
    verified: 'Verified publication',
    unverified: 'Could not verify',
    offline: 'Offline — showing saved content',
    stale: 'Last updated {time}',
    publish: 'Publish',
    audit: 'Audit proof',
  },
  bn: {
    appName: 'জাগো বাহে',
    feed: 'ফিড',
    communities: 'কমিউনিটি',
    messages: 'বার্তা',
    notifications: 'নোটিফিকেশন',
    verified: 'প্রকাশনা যাচাইকৃত',
    unverified: 'যাচাই করা যায়নি',
    offline: 'অফলাইন — সংরক্ষিত কনটেন্ট দেখানো হচ্ছে',
    stale: 'সর্বশেষ হালনাগাদ {time}',
    publish: 'প্রকাশ করুন',
    audit: 'অডিট প্রমাণ',
  },
} as const;

export type Locale = keyof typeof messages;
export type MessageKey = keyof (typeof messages)['en'];

export function translate(
  locale: Locale,
  key: MessageKey,
  variables: Readonly<Record<string, string>> = {},
): string {
  let result: string = messages[locale][key];
  for (const [name, value] of Object.entries(variables)) {
    result = result.replaceAll(`{${name}}`, value);
  }
  return result;
}
