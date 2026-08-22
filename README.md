# Chrome Extension "Silent Tab"

![Silent Tab Logo](src/images/muted128.png)

## Overview

"Silent Tab" is a Chrome extension that automatically opens new tabs in a muted state. It prevents unexpected audio playback and provides a quiet browsing experience.

## Features

- **Auto-Mute**: New tabs are automatically opened in a muted state
- **Persists on Navigation**: Existing tabs are re-muted automatically when you navigate to another page
- **Easy Toggle**: Simply click the extension icon to toggle the mute state of a tab
- **Visual Feedback**: The icon changes based on the tab's mute state
- **Lightweight**: Operates with minimal resource usage
- **Multilingual**: Supports English and Japanese

## Screenshot

![English Screenshot](etc/screen1-en.png)

## Installation

### Install from Chrome Web Store (Recommended)

1. Access the [Chrome Web Store](https://chromewebstore.google.com/detail/%E9%9D%99%E5%AF%82/gaomeihjahnankimbcfcpgadfoldhebk?authuser=0&hl=ja)
2. Click the "Add to Chrome" button
3. Click "Add extension" in the confirmation dialog

### Install in Developer Mode

1. Clone or download this repository
2. Access `chrome://extensions/` in Chrome
3. Turn on "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the `src` folder from the downloaded repository

## Usage

1. After installation, new tabs will automatically open in a muted state
2. To toggle the mute state of a tab, click the extension icon
   - Muted: ![Muted Icon](etc/muted256.png)
   - Unmuted: ![Unmuted Icon](etc/unmuted256.png)
3. A tab you unmute stays unmuted across navigations. This choice is kept until the tab is closed (it resets when the browser restarts)
4. To use in Incognito mode, enable "Allow in Incognito" in the extension settings

## Developer Information

### Project Structure

```text
src/
├── manifest.json        # Extension configuration file
├── service_worker.js    # Background script
├── _locales/            # Multilingual support
│   ├── en/              # English
│   │   └── messages.json
│   └── ja/              # Japanese
│       └── messages.json
└── images/              # Icon images
    ├── muted*.png       # Muted state icons
    └── unmuted*.png     # Unmuted state icons
```

### Development Environment Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Verify code:

   ```bash
   npm run lint
   ```

## Future Plans

- Add user configuration options
- Feature to exclude specific domains from muting

## License

[MIT License](LICENSE)

## Author

[www.harurow](https://zenn.dev/harurow/)

---

*For Japanese documentation, please see [README.ja.md](README.ja.md)*
