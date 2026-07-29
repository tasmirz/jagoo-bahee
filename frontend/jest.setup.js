jest.mock('@expo/vector-icons/Ionicons', () => ({
  __esModule: true,
  default: ({ name, ...props }) => {
    const mockReact = require('react');
    const { Text: MockText } = require('react-native');
    return mockReact.createElement(MockText, props, name);
  },
}));

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: () => () => undefined,
    fetch: async () => ({ isConnected: false, isInternetReachable: false }),
  },
}));
