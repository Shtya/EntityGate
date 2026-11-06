import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      // Downloads link to /api routes on purpose: a client-side route change can't deliver a file.
      "@next/next/no-html-link-for-pages": "off",
      "no-restricted-syntax": [
        "error",
        { selector: "JSXOpeningElement[name.name='select']", message: "Use <Select> from components/ui/select: native selects can't follow the design or RTL." },
        { selector: "JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value=/^(date|datetime-local|month|week|time)$/]", message: "Use <DatePicker> from components/ui/date-picker." },
        { selector: "CallExpression[callee.property.name='$queryRawUnsafe'], CallExpression[callee.property.name='$executeRawUnsafe']", message: "Use the tagged-template raw query so values stay parameterized." },
      ],
    },
  },
];

export default eslintConfig;
