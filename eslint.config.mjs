import neostandard from 'neostandard'

export default neostandard({
  // Chrome 拡張機能の Service Worker として動作するため、
  // browser と webextensions のグローバル（chrome など）を有効にする
  env: ['browser', 'webextensions']
})
