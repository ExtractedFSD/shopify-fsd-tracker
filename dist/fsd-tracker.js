function getUTMParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
    utm_term: params.get("utm_term"),
    utm_content: params.get("utm_content")
  };
}

const utmParams = getUTMParams();

(function () {
  const fsd = {
    session_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    traffic: {
      ...utmParams,
      referrer: document.referrer || ""
    },
    device: {
      device_type: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
      os: navigator.platform,
      browser: navigator.userAgent,
      screen_width: window.innerWidth,
      screen_height: window.innerHeight
    },
    shopify: {
      product_viewed: window.location.pathname,
      product_tags: [],
      collection_viewed: null,
      cart_status: "unknown",
      currency: Shopify.currency.active,
      language: navigator.language || "en"
    },
    behavior: {
      scroll_depth_percent: 0,
      idle_seconds: 0,
      clicked_add_to_cart: false,
      hovered_cta: false,
      viewed_pages: [window.location.pathname]
    },
    user_history: {
      is_returning: !!localStorage.getItem("fsd_last_seen"),
      last_seen: localStorage.getItem("fsd_last_seen") || null,
      pages_viewed_last_session: [],
      last_session_cart_status: null
    }
  };

  // Update scroll depth
  let maxScroll = 0;
  window.addEventListener("scroll", () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const percent = Math.round((scrollTop / docHeight) * 100);
    if (percent > maxScroll) maxScroll = percent;
    fsd.behavior.scroll_depth_percent = maxScroll;
  });

  // Track idle time
  setInterval(() => fsd.behavior.idle_seconds++, 1000);
  ["mousemove", "keydown", "scroll", "touchstart"].forEach(evt =>
    document.addEventListener(evt, () => (fsd.behavior.idle_seconds = 0))
  );

  // Track cart status (periodically)
  const pollCart = () => {
    fetch("/cart.js")
      .then(res => res.json())
      .then(data => {
        fsd.shopify.cart_status = data.items.length > 0 ? "has_items" : "empty";
      });
  };
  setInterval(pollCart, 15000);
  pollCart(); // Initial check

  // Save last seen
  localStorage.setItem("fsd_last_seen", new Date().toISOString());

  // Expose for testing
  window.__fsd = fsd;
  console.log("✅ FSD Tracker with GDPR loaded");

  // Track Add to Cart clicks
  document.addEventListener("click", function (e) {
    const target = e.target.closest("button[name='add'], input[name='add']");
    if (target) {
      window.__fsd.behavior.clicked_add_to_cart = true;
      console.log("🛒 Add to Cart clicked!");
    }
  });

  // Track CTA hovers (mobile & desktop)
  window.addEventListener("load", () => {
    const ctaElements = document.querySelectorAll(".cta-button, .btn, .button, .product-form__submit");
    console.log("🎯 Found CTA elements:", ctaElements);

    ctaElements.forEach((el) => {
      const markHovered = () => {
        window.__fsd.behavior.hovered_cta = true;
        console.log("👆 CTA hovered or tapped!");
      };
      el.addEventListener("mouseenter", markHovered);
      el.addEventListener("mouseover", markHovered);
      el.addEventListener("touchstart", markHovered);
    });
  });

  // GDPR-enhanced tracking
  function hasGDPRConsent() {
    // Replace this check with your real consent tool condition
    return window.Cookiebot?.consent?.marketing === true || true; // default true for testing
  }

  if (hasGDPRConsent()) {
    fsd.behavior.tab_visibility_changes = 0;
    fsd.behavior.typed_into_fields = false;

    // Tab focus/blur
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        fsd.behavior.tab_visibility_changes++;
        console.log("👁️ Tab hidden");
      }
    });

    // Typing detection (basic)
    document.querySelectorAll("input, textarea").forEach((input) => {
      input.addEventListener("input", () => {
        fsd.behavior.typed_into_fields = true;
        console.log("⌨️ User typed into a field");
      });
    });
  }

})();

