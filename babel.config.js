module.exports = function (api) {
  api.cache(true);

  // Use standard React JSX runtime for tests to avoid nativewind JSX issues
  const isTest = process.env.NODE_ENV === "test";

  return {
    presets: [
      [
        "babel-preset-expo",
        {
          jsxImportSource: isTest ? "react" : "nativewind",
          // Enable import.meta polyfill for wagmi/zustand compatibility
          unstable_transformImportMeta: true,
        },
      ],
      ...(isTest ? [] : ["nativewind/babel"]),
    ],
  };
};
