// eslint-config-next 16 ships native flat configs, so these are spread
// directly — no FlatCompat shim (which throws on this package's plugin graph).
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "out/**", "build/**", "node_modules/**", "data/**"],
  },
];

export default eslintConfig;
