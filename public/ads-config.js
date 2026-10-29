/**
 * Social Downloader - Advertisements Configuration
 * 
 * Instructions:
 * - To enable/disable all ads: set `enabled: true` or `false`
 * - Mode:
 *     - "placeholder": Shows styled preview boxes indicating ad dimensions and slots.
 *     - "custom": Renders your actual ad network code (Google AdSense, Adsterra, Monetag, etc.)
 * - To use Google AdSense:
 *     - Put your Publisher ID in `adsenseClientId` (e.g., "ca-pub-1234567890123456")
 *     - Paste your `<ins class="adsbygoogle" ...></ins>` ad code inside each slot's `html` property.
 * - To use other networks (Adsterra, PropellerAds, PopAds, Banner IFrames):
 *     - Paste the HTML/JS/IFrame snippet directly into the `html` property of the slot.
 */

window.SOCIAL_DOWNLOADER_ADS = {
  enabled: true,
  mode: "placeholder", // Change to "custom" when you paste your actual ad codes below

  // Google AdSense Publisher ID (Optional: leave empty if using other ad networks)
  adsenseClientId: "",

  slots: {
    // Top Banner / Leaderboard (Below header, Above tool) - 728x90 or 320x50
    header: {
      enabled: true,
      label: "Advertisement",
      html: `<!-- Paste your Header Ad Code (728x90 or responsive) here -->`
    },

    // Mid Banner (Directly below the URL input form) - 728x90 or 300x250
    belowForm: {
      enabled: true,
      label: "Sponsored",
      html: `<!-- Paste your Mid-Page Ad Code here -->`
    },

    // Results Banner (Appears right above download quality buttons when video is fetched)
    downloadResults: {
      enabled: true,
      label: "Sponsored",
      html: `<!-- Paste your Download Results Ad Code here -->`
    },

    // Sticky Bottom Anchor Ad (Fixed to bottom of screen with close button)
    stickyBottom: {
      enabled: true,
      label: "Advertisement",
      html: `<!-- Paste your Sticky Footer Ad Code (728x90 / 320x50) here -->`
    }
  }
};
