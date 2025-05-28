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
  const previousTimeline = JSON.parse(sessionStorage.getItem("fsd_timeline") || "[]");
  const timeline = [...previousTimeline];

  function logEvent(message) {
    const event = { timestamp: new Date().toISOString(), message };
    timeline.push(event);
    console.log("🕒", message);
    sessionStorage.setItem("fsd_timeline", JSON.stringify(timeline));
  }

  const sessionId = sessionStorage.getItem("fsd_session_id") || crypto.randomUUID();
  sessionStorage.setItem("fsd_session_id", sessionId);

  const fsd = {
    session_id: sessionId,
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
      typed_into_fields: false,
      seen_price: false
    },
    user_history: {
      is_returning: !!localStorage.getItem("fsd_last_seen"),
      last_seen: localStorage.getItem("fsd_last_seen") || null,
      pages_viewed_last_session: [],
      last_session_cart_status: null
    }
  };

  logEvent(`Session started on ${window.location.pathname}`);

  // Scroll tracking with direction + debounce + 10% step logging
  let maxScroll = 0;
  let lastScrollTop = window.scrollY;

  const handleScroll = () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const percent = Math.round((scrollTop / docHeight) * 100);
    const step = 10;

    const direction =
      scrollTop > lastScrollTop ? "down" : scrollTop < lastScrollTop ? "up" : "none";

    if (percent >= maxScroll + step || direction !== fsd.behavior.last_scroll_direction) {
      if (percent >= maxScroll + step) {
        maxScroll = percent;
        fsd.behavior.scroll_depth_percent = maxScroll;
        logEvent(`Scrolled ${maxScroll}% of page (${direction})`);
        if (maxScroll >= 4 && !fsd.behavior.seen_price) {
          fsd.behavior.seen_price = true;
          logEvent("💸 Seen price section");
        }
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

  // Track cart status and changes
  let previousCartSnapshot = "";
  const pollCart = () => {
    fetch("/cart.js")
      .then(res => res.json())
      .then(data => {
        const previousStatus = fsd.shopify.cart_status;
        const currentItemCount = data.items.length;
        fsd.shopify.cart_status = currentItemCount > 0 ? "has_items" : "empty";

        const newSnapshot = JSON.stringify(data.items.map(item => `${item.id}-${item.quantity}`));
        if (newSnapshot !== previousCartSnapshot) {
          if (data.items.length > 0) {
            const lastItem = data.items[data.items.length - 1];
            if (lastItem && lastItem.product_title) {
              logEvent(`🛒 Product added/updated: ${lastItem.product_title} (x${lastItem.quantity})`);
            }
          } else {
            logEvent("🗑️ All products removed from cart");
          }
          previousCartSnapshot = newSnapshot;
        }

        if (previousStatus !== fsd.shopify.cart_status) {
          logEvent(`Cart status: ${fsd.shopify.cart_status}`);
        }
      });
  };
  setInterval(pollCart, 15000);
  pollCart();

  // Save last seen
  localStorage.setItem("fsd_last_seen", new Date().toISOString());

  // Expose for testing
  window.__fsd = fsd;
  console.log("✅ FSD Tracker with Timeline Loaded");

  // Custom button tracker mapping
  const buttonMap = {
    ".product-optionnew": "🧩 Product Options",
    ".orderbtn": "🛒 Add to cart"
  };

  // Track clicks using buttonMap
  document.addEventListener("click", function (e) {
    Object.keys(buttonMap).forEach(selector => {
      if (e.target.closest(selector)) {
        const name = buttonMap[selector];
        logEvent(`🖱️ Clicked: ${name}`);
        if (selector === ".orderbtn") {
          window.__fsd.behavior.clicked_add_to_cart = true;
        }
      }
    });
  });

  // Track hovers using buttonMap - with delay to avoid spam
  const hoverDelays = {};
  window.addEventListener("load", () => {
    Object.keys(buttonMap).forEach(selector => {
      document.querySelectorAll(selector).forEach((el) => {
        const name = buttonMap[selector];
        const markHovered = () => {
          const now = Date.now();
          if (!hoverDelays[selector] || now - hoverDelays[selector] > 3000) {
            logEvent(`👆 Hovered: ${name}`);
            window.__fsd.behavior.hovered_cta = true;
            hoverDelays[selector] = now;
          }
        };
        el.addEventListener("mouseenter", markHovered);
        el.addEventListener("mouseover", markHovered);
        el.addEventListener("touchstart", markHovered);
      });
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
