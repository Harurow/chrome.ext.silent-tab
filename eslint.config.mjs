import neostandard from 'neostandard'

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'test-results/**',
      'playwright-report/**'
    ]
  },

  ...neostandard(),

  // Chrome 拡張機能の Service Worker。neostandard の既定で browser のグローバルも入るので、
  // window などの誤用は lint では止まらない
  {
    files: ['src/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        chrome: 'readonly',
        console: 'readonly',
        self: 'readonly'
      }
    }
  },

  // Node で動く開発用スクリプトとテスト
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', '.claude/hooks/*.mjs', '*.config.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly'
      }
    },
    rules: {
      // Playwright の fixture は `async ({}, use) => {}` の形を取る
      'no-empty-pattern': 'off'
    }
  },

  // テストから Service Worker 内で評価されるコード片は、実行時にそちらのグローバルを参照する
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      globals: {
        chrome: 'readonly',
        globalThis: 'readonly'
      }
    }
  }
]
