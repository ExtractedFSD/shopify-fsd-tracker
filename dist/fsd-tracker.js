// Debounce helper
function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

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
  const timeline = [];

  function logEvent(message) {
    timeline.push({ timestamp: new Date().toISOString(), message });
    console.log("🕒", message);
  }

  const fsd = {
    session_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    timeline,
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
      viewed_pages: [window.location.pathname],
      last_scroll_direction: null,
      tab_visibility_changes: 0,
      typed_into_fields: false
    },
    user_history: {
      is_returning: !!localStorage.getItem("fsd_last_seen"),
      last_seen: localStorage.getItem("fsd_last_seen") || null,
      pages_viewed_last_session: [],
      last_session_cart_status: null
    }
  };

  logEvent(`Session started on ${window.location.pathname}`);

  // Scroll tracking with direction + debounce
  let maxScroll = 0;
  let lastScrollTop = window.scrollY;

  const handleScroll = () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const percent = Math.round((scrollTop / docHeight) * 100);

    const direction =
      scrollTop > lastScrollTop ? "down" : scrollTop < lastScrollTop ? "up" : "none";

    if (percent > maxScroll || direction !== fsd.behavior.last_scroll_direction) {
      if (percent > maxScroll) {
        maxScroll = percent;
        fsd.behavior.scroll_depth_percent = maxScroll;
        logEvent(`Scrolled ${maxScroll}% of page (${direction})`);
      } else {
        logEvent(`Scrolled ${direction}`);
      }
      fsd.behavior.last_scroll_direction = direction;
    }

    lastScrollTop = scrollTop;
  };

  window.addEventListener("scroll", debounce(handleScroll, 200));

  // Track idle time
  let idleCounter = 0;
  setInterval(() => {
    idleCounter++;
    fsd.behavior.idle_seconds++;
    if (idleCounter === 10) {
      logEvent("User idle for 10 seconds");
    }
  }, 1000);

  ["mousemove", "keydown", "scroll", "touchstart"].forEach(evt =>
    document.addEventListener(evt, () => {
      idleCounter = 0;
      fsd.behavior.idle_seconds = 0;
    })
  );

  // Track cart status (periodically)
  const pollCart = () => {
    fetch("/cart.js")
      .then(res => res.json())
      .then(data => {
        const previous = fsd.shopify.cart_status;
        fsd.shopify.cart_status = data.items.length > 0 ? "has_items" : "empty";
        if (previous !== fsd.shopify.cart_status) {
          logEvent(`Cart status: ${fsd.shopify.cart_status}`);
        }
      });
  };
  setInterval(pollCart, 15000);
  pollCart(); // Initial check

  // Save last seen
  localStorage.setItem("fsd_last_seen", new Date().toISOString());

  // Expose for testing
  window.__fsd = fsd;
  console.log("✅ FSD Tracker with Timeline Loaded");

  // Track Add to Cart clicks
  document.addEventListener("click", function (e) {
    const target = e.target.closest("button[name='add'], input[name='add']");
    if (target) {
      window.__fsd.behavior.clicked_add_to_cart = true;
      logEvent("🛒 Add to Cart clicked!");
    }
  });

  // Track CTA hovers (mobile & desktop)
  window.addEventListener("load", () => {
    const ctaElements = document.querySelectorAll(".cta-button, .btn, .button, .product-form__submit");
    ctaElements.forEach((el) => {
      const markHovered = () => {
        if (!fsd.behavior.hovered_cta) {
          fsd.behavior.hovered_cta = true;
          logEvent("👆 CTA hovered or tapped!");
        }
      };
      el.addEventListener("mouseenter", markHovered);
      el.addEventListener("mouseover", markHovered);
      el.addEventListener("touchstart", markHovered);
    });
  });

  // GDPR-enhanced tracking
  function hasGDPRConsent() {
    return window.Cookiebot?.consent?.marketing === true || true;
  }

  if (hasGDPRConsent()) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        fsd.behavior.tab_visibility_changes++;
        logEvent("👁️ Tab hidden");
      }
    });

    document.querySelectorAll("input, textarea").forEach((input) => {
      input.addEventListener("input", () => {
        if (!fsd.behavior.typed_into_fields) {
          fsd.behavior.typed_into_fields = true;
          logEvent("⌨️ User typed into a field");
        }
      });
    });
  }
})();
