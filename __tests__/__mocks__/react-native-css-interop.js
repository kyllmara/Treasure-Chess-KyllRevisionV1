// Mock for react-native-css-interop
module.exports = {
  cssInterop: jest.fn((component) => component),
  remapProps: jest.fn((component) => component),
  createInteropElement: jest.fn(),
  useColorScheme: jest.fn(() => "dark"),
  vars: jest.fn(() => ({})),
  StyleSheet: {
    create: (styles) => styles,
    flatten: (style) => style,
  },
};
