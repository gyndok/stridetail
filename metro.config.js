// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Plan 4 Task 8: expo-sqlite's web build imports the wa-sqlite wasm worker,
// which needs a dedicated Metro/headers setup this app deliberately does not
// use — offline storage is field-side (spec §8) and the web persister is
// memory-mapped (Task 3, DEVIATIONS.md). Without this redirect the WEB bundle
// fails to resolve `wa-sqlite.wasm`. Native resolution is untouched.
const WEB_STUBS = {
  'expo-sqlite': path.resolve(__dirname, 'src/lib/web/expoSqliteWebStub.ts'),
  'expo-sqlite/kv-store': path.resolve(__dirname, 'src/lib/web/kvStoreWebStub.ts'),
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_STUBS[moduleName]) {
    return { type: 'sourceFile', filePath: WEB_STUBS[moduleName] };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
