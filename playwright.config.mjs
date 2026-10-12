import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',

  // テストごとに使い捨てのプロファイルで Chromium を1つ起動する。
  // 時間待ち（Service Worker のアイドル停止など）を含むため、並列にしたときの安定性は確かめておらず、直列で回す
  fullyParallel: false,
  workers: 1,

  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  use: {
    trace: 'on-first-retry'
  }
})
