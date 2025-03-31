/** @type {import("prettier").Options} */
module.exports = {
  plugins: [
    require.resolve('@trivago/prettier-plugin-sort-imports'),
    require.resolve('prettier-plugin-organize-attributes'),
    require.resolve('prettier-plugin-tailwindcss'),
  ],
  attributeGroups: ['$CODE_GUIDE'],
  attributeSort: 'ASC',
  printWidth: 100,
  singleQuote: true,
  importOrder: ['^@/(.*)$', '^[./]'],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  tailwindStylesheet: './src/App.css',
};
