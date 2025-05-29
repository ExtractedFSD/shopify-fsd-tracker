// Cleaned FSD Tracker with Enriched Session Payload and Timeline Logging

(function () {
  const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };
  };

  const getUTMParams = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      utm_term: params.get("utm_term"),
      utm_content: params.get("utm_content")
    };
  };

  const sessionId = sessionStorage.getItem("fsd_session_id") || crypto.randomUUID();
  sessionStorage.setItem("fsd_session_id", sessionId);
  const userId = localStorage.getItem("fsd_user_id") || crypto.randomUUID();
  localStorage.setItem("fsd_user_id", userId);

  const timeline = JSON.parse(sessionStorage.getItem("fsd_timeline") || "[]");

  const supabaseClient = typeof window.supabase !== "undefined"
    ? window.supabase.createClient(
        "https://cehbdpqqyfnqthvgyqhe.supabase.co",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      )
    : null;

  const logEvent = (message) => {
    const event = { timestamp: new Date().toISOString(), message };
    timeline.push(event);
    sessionStorage.setItem("fsd_timeline", JSON.stringify(timeline));

    if (supabaseClient) {
      supabaseClient.from("fsd_timeline_events").insert([
        {
          user_id: userId,
          session_id: sessionId,
          timestamp: event.timestamp,
          event_type: "event",
          message
        }
      ]).then(({ error }) => {
        if (error) console.error("❌ Timeline insert error", error);
      });
    }
  };

  const now = new Date();
  const time = {
    local_hour: now.getHours(),
    local_day: now.toLocaleDateString('en-GB', { weekday: 'long' }),
    part_of_day: now.getHours() < 6 ? "early_morning" :
                now.getHours() < 12 ? "morning" :
                now.getHours() < 18 ? "afternoon" :
                now.getHours() < 22 ? "evening" : "late_night",
    is_weekend: [0, 6].includes(now.getDay())
  };

  const today = new Date();
  const payday = new Date(today.getFullYear(), today.getMonth(), 28);
  const daysUntilPayday = Math.max(0, Math.ceil((payday - today) / (1000 * 60 * 60 * 24)));
  const real_world = {
    days_until_payday: daysUntilPayday,
    is_near_payday: daysUntilPayday <= 3,
    season: ["Winter", "Spring", "Summer", "Autumn"][Math.floor((today.getMonth() % 12) / 3)]
  };

  const fsd = {
    session_id: sessionId,
    user_id: userId,
    timestamp: now.toISOString(),
    timeline,
    traffic: {
      ...getUTMParams(),
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
      product_tags: window.meta?.product?.tags || [],
      collection_viewed: window.location.pathname.includes("/collections/") ? window.location.pathname.split("/")[window.location.pathname.split("/").indexOf("collections") + 1] || null : null,
      cart_status: "unknown",
      currency: Shopify.currency.active,
      language: navigator.language || "en"
    },
    user_history: {
      is_returning: !!localStorage.getItem("fsd_last_seen"),
      last_seen: localStorage.getItem("fsd_last_seen") || null,
      pages_viewed_last_session: JSON.parse(localStorage.getItem("fsd_last_pages") || "[]"),
      last_session_cart_status: localStorage.getItem("fsd_last_cart_status") || null
    },
    behavior: {
      scroll_depth_percent: 0,
      idle_seconds: 0,
      clicked_add_to_cart: false,
      hovered_cta: false,
      viewed_pages: [window.location.pathname],
      last_scroll_percent: 0,
      last_scroll_direction: null,
      tab_visibility_changes: 0,
      typed_into_fields: false,
      seen_price: false
    },
    time,
    real_world
  };

  logEvent(`Session started on ${window.location.pathname}`);

  // Scroll tracking
  let lastLoggedScroll = 0;
  let lastScrollTop = window.scrollY;
  const handleScroll = () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const percent = Math.round((scrollTop / docHeight) * 100);
    const direction = scrollTop > lastScrollTop ? "down" : scrollTop < lastScrollTop ? "up" : null;

    if (!fsd.behavior.seen_price && percent >= 4) {
      fsd.behavior.seen_price = true;
      logEvent("💸 Seen price section");
    }

    if (direction && Math.abs(percent - lastLoggedScroll) >= 10) {
      logEvent(`📜 Scrolled ${direction} to ${percent}%`);
      fsd.behavior.scroll_depth_percent = percent;
      fsd.behavior.last_scroll_percent = percent;
      fsd.behavior.last_scroll_direction = direction;
      lastLoggedScroll = percent;
    }
    lastScrollTop = scrollTop;
  };
  window.addEventListener("scroll", debounce(handleScroll, 200));

  // Idle tracking
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

  // Cart polling
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
  setInterval(pollCart, 10000);
  pollCart();

  window.addEventListener("beforeunload", () => {
    localStorage.setItem("fsd_last_pages", JSON.stringify(fsd.behavior.viewed_pages));
    localStorage.setItem("fsd_last_cart_status", fsd.shopify.cart_status);
    localStorage.setItem("fsd_last_seen", new Date().toISOString());
  });

  // Button click & hover tracking
  const buttonMap = {
    ".product-optionnew": "🧩 Product Options",
    ".orderbtn": "🛒 Add to cart"
  };
  document.addEventListener("click", function (e) {
    Object.keys(buttonMap).forEach(selector => {
      if (e.target.closest(selector)) {
        const name = buttonMap[selector];
        logEvent(`🖱️ Clicked: ${name}`);
        if (selector === ".orderbtn") {
          fsd.behavior.clicked_add_to_cart = true;
        }
      }
    });
  });
  const hoverDelays = {};
  window.addEventListener("load", () => {
    Object.keys(buttonMap).forEach(selector => {
      document.querySelectorAll(selector).forEach((el) => {
        const name = buttonMap[selector];
        const markHovered = () => {
          const now = Date.now();
          if (!hoverDelays[selector] || now - hoverDelays[selector] > 3000) {
            logEvent(`👆 Hovered: ${name}`);
            fsd.behavior.hovered_cta = true;
            hoverDelays[selector] = now;
          }
        };
        el.addEventListener("mouseenter", markHovered);
        el.addEventListener("mouseover", markHovered);
        el.addEventListener("touchstart", markHovered);
      });
    });
  });

  // Typing and tab visibility tracking (GDPR check optional)
  function hasGDPRConsent() {
    return window.Cookiebot?.consent?.marketing === true || true;
  }
  if (hasGDPRConsent()) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        fsd.behavior.tab_visibility_changes++;
        logEvent("👁️ Tab hidden");
      } else {
        logEvent("👁️ Tab active again");
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

  // Geo enrichment
  fetch("https://ipapi.co/json")
    .then(res => res.json())
    .then(location => {
      fsd.location = {
        country: location.country_name,
        region: location.region,
        city: location.city,
        postal_code: location.postal,
        timezone: location.timezone
      };
      insertSession();
    })
    .catch(() => insertSession());

  function insertSession() {
    if (supabaseClient) {
      const flat = {
        session_id: fsd.session_id,
        user_id: fsd.user_id,
        timestamp: fsd.timestamp,
        utm_source: fsd.traffic.utm_source,
        utm_medium: fsd.traffic.utm_medium,
        utm_campaign: fsd.traffic.utm_campaign,
        utm_term: fsd.traffic.utm_term,
        utm_content: fsd.traffic.utm_content,
        referrer: fsd.traffic.referrer,
        device_type: fsd.device.device_type,
        os: fsd.device.os,
        browser: fsd.device.browser,
        screen_width: fsd.device.screen_width,
        screen_height: fsd.device.screen_height,
        currency: fsd.shopify.currency,
        language: fsd.shopify.language,
        product_viewed: fsd.shopify.product_viewed,
        product_tags: fsd.shopify.product_tags,
        collection_viewed: fsd.shopify.collection_viewed,
        last_session_cart_status: fsd.user_history.last_session_cart_status,
        pages_viewed_last_session: fsd.user_history.pages_viewed_last_session,
        is_returning: fsd.user_history.is_returning,
        last_seen: fsd.user_history.last_seen,
        country: fsd.location?.country,
        region: fsd.location?.region,
        city: fsd.location?.city,
        postal_code: fsd.location?.postal_code,
        timezone: fsd.location?.timezone,
        local_hour: fsd.time.local_hour,
        local_day: fsd.time.local_day,
        part_of_day: fsd.time.part_of_day,
        is_weekend: fsd.time.is_weekend,
        days_until_payday: fsd.real_world.days_until_payday,
        is_near_payday: fsd.real_world.is_near_payday,
        season: fsd.real_world.season
      };
      supabaseClient.from("fsd_sessions").insert([flat])
        .then(({ data, error }) => {
          if (error) console.error("❌ Supabase insert error", error);
          else console.log("✅ Supabase session saved", data);
        });
    }
  }

  window.__fsd = fsd;
})();

