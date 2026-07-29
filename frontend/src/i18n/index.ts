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
    federatedNodes: 'Federated nodes',
    noPeers: 'No connected peers',
    noPeersBody:
      'Posting still works locally. Peers appear here once this server has exchanged keys with one.',
    trustProbation: 'New peer',
    trustNormal: 'Established',
    trustTrusted: 'Trusted',
    trustUnknown: 'Unrecognised',
    vouches: '{count} vouches',
    logSize: '{count} entries in this server’s public log',
    peerAlerts: 'Transparency alerts',
    reachLan: 'Same network',
    reachIspLocal: 'Same ISP',
    reachNational: 'Domestic',
    reachGlobal: 'Internet',
    reachMesh: 'Mesh',
    reachReticulum: 'Radio',
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
    federatedNodes: 'যুক্ত সার্ভার',
    noPeers: 'কোনো যুক্ত সার্ভার নেই',
    noPeersBody:
      'স্থানীয়ভাবে পোস্ট করা এখনো কাজ করে। এই সার্ভার কারও সঙ্গে কি বিনিময় করলে তারা এখানে দেখা যাবে।',
    trustProbation: 'নতুন সার্ভার',
    trustNormal: 'প্রতিষ্ঠিত',
    trustTrusted: 'বিশ্বস্ত',
    trustUnknown: 'অচেনা',
    vouches: '{count} সুপারিশ',
    logSize: 'এই সার্ভারের প্রকাশ্য লগে {count} এন্ট্রি',
    peerAlerts: 'স্বচ্ছতা সতর্কতা',
    reachLan: 'একই নেটওয়ার্ক',
    reachIspLocal: 'একই আইএসপি',
    reachNational: 'দেশীয়',
    reachGlobal: 'ইন্টারনেট',
    reachMesh: 'মেশ',
    reachReticulum: 'রেডিও',
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
