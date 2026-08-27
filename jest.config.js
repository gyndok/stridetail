module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@supabase/.*)',
  ],
  // \.d\.ts: ambient declaration files scoped inside __tests__ (e.g. the
  // manual suite's nodeShim.d.ts) otherwise match the __tests__ glob and fail
  // as "must contain at least one test".
  testPathIgnorePatterns: ['/node_modules/', '/supabase/', '\\.d\\.ts$'],
};
