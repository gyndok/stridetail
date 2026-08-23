import '@testing-library/react-native';

jest.mock('expo-crypto', () => ({ randomUUID: () => Math.random().toString(36).slice(2) }));
