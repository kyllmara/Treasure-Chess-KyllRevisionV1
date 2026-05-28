// Mock for nativewind/jsx-runtime - delegate to React's jsx-runtime
const ReactJsxRuntime = require("react/jsx-runtime");

module.exports = {
  jsx: ReactJsxRuntime.jsx,
  jsxs: ReactJsxRuntime.jsxs,
  Fragment: ReactJsxRuntime.Fragment,
};
