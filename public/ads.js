/**
 * Social Downloader - Ad Rendering & Controller Engine
 */

(function () {
  const config = window.SOCIAL_DOWNLOADER_ADS || { enabled: false };

  if (!config.enabled) {
    document.querySelectorAll(".ad-slot-container").forEach((el) => {
      el.style.display = "none";
    });
    return;
  }

  // 1. Inject Google AdSense Client Script if configured
  if (config.adsenseClientId && !document.querySelector("#adsense-script")) {
    const script = document.createElement("script");
    script.id = "adsense-script";
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(config.adsenseClientId)}`;
    script.crossOrigin = "anonymous";
    document.head.appendChild(script);
  }

  // Helper to safely execute scripts inserted via HTML string
  const injectHtmlWithScripts = (container, htmlString) => {
    container.innerHTML = htmlString;
    const scripts = container.querySelectorAll("script");
    scripts.forEach((oldScript) => {
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });
      if (oldScript.src) {
        newScript.src = oldScript.src;
      } else {
        newScript.textContent = oldScript.textContent;
      }
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });

    // If Google AdSense is loaded and adsbygoogle push is needed
    try {
      if (typeof window.adsbygoogle !== "undefined") {
        container.querySelectorAll(".adsbygoogle").forEach(() => {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        });
      }
    } catch (e) {
      console.warn("adsbygoogle push error:", e);
    }
  };

  // Helper to create placeholder UI
  const createPlaceholder = (slotKey, dimensions, labelText) => {
    return `
      <div class="ad-placeholder-box">
        <div class="ad-placeholder-badge">
          <span class="material-symbols-outlined" style="font-size: 1rem; vertical-align: -2px;">featured_video</span>
          <span>${labelText || "Ad Space"} (${dimensions})</span>
        </div>
        <p class="ad-placeholder-hint">Configurable in <code>public/ads-config.js</code></p>
      </div>
    `;
  };

  const slotMeta = {
    header: { id: "ad-slot-header", dimensions: "728 × 90 / 320 × 50", defaultLabel: "Advertisement" },
    belowForm: { id: "ad-slot-below-form", dimensions: "728 × 90 / 300 × 250", defaultLabel: "Sponsored" },
    downloadResults: { id: "ad-slot-download-results", dimensions: "Responsive Banner", defaultLabel: "Sponsored Download" },
    stickyBottom: { id: "ad-slot-sticky-bottom", dimensions: "728 × 90 / 320 × 50", defaultLabel: "Advertisement" }
  };

  // Render each slot
  const renderSlots = () => {
    Object.keys(slotMeta).forEach((key) => {
      const meta = slotMeta[key];
      const slotConfig = (config.slots && config.slots[key]) || { enabled: false };
      const el = document.getElementById(meta.id);

      if (!el) return;

      if (!slotConfig.enabled) {
        el.style.display = "none";
        return;
      }

      el.style.display = "";

      const labelEl = el.querySelector(".ad-label");
      if (labelEl) {
        labelEl.textContent = slotConfig.label || meta.defaultLabel;
      }

      const contentEl = el.querySelector(".ad-content-wrapper");
      if (!contentEl) return;

      const hasCustomHtml = slotConfig.html && slotConfig.html.trim().length > 0 && !slotConfig.html.includes("<!-- Paste your");

      if (config.mode === "custom" && hasCustomHtml) {
        injectHtmlWithScripts(contentEl, slotConfig.html);
      } else {
        contentEl.innerHTML = createPlaceholder(key, meta.dimensions, slotConfig.label || meta.defaultLabel);
      }
    });

    // Sticky bottom close button handler
    const stickyEl = document.getElementById("ad-slot-sticky-bottom");
    if (stickyEl) {
      const closeBtn = stickyEl.querySelector(".ad-close-btn");
      if (closeBtn) {
        closeBtn.addEventListener("click", () => {
          stickyEl.style.display = "none";
          sessionStorage.setItem("pwa_sticky_ad_dismissed", "1");
        });
      }
      if (sessionStorage.getItem("pwa_sticky_ad_dismissed") === "1") {
        stickyEl.style.display = "none";
      }
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderSlots);
  } else {
    renderSlots();
  }

  // Also expose a reload function so if dynamically rendered, ads can re-initialize
  window.refreshSocialDownloaderAds = renderSlots;
})();
