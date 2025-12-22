import antfu from '@antfu/eslint-config'

export default antfu({
  stylistic: {
    indent: 4,
    quotes: 'single',
    semi: true,
  },
  typescript: true,
  rules: {
    'no-console': 'off',
    'no-new': 'off',
    'style/max-statements-per-line': 'off',
    'no-case-declarations': 'off',
    'unicorn/prefer-dom-node-text-content': 'off',
  },
})
