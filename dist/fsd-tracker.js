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
  // Generate or retrieve persistent user ID
  let userId = localStorage.getItem("fsd_user_id");
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem("fsd_user_id", userId);
  }

  // Generate session ID for this session
  const sessionId = sessionStorage.getItem("fsd_session_id") || crypto.randomUUID();
  sessionStorage.setItem("fsd_session_id", sessionId);

  // Track if this is a returning user
  const isReturning = !!localStorage.getItem("fsd_last_seen");

  // Initialize Supabase client
  let supabaseClient = null;
  let supabaseReady = false;

  // Queue for events that occur before Supabase is ready
  const eventQueue = [];

  // Helper to process queued events
  async function processEventQueue() {
    if (!supabaseReady || eventQueue.length === 0) return;
    
    const events = [...eventQueue];
    eventQueue.length = 0;
    
    try {
      const { error } = await supabaseClient
        .from("fsd_timeline_events")
        .insert(events);
      
      if (error) {
        console.error("❌ Failed to insert queued events:", error);
        // Re-queue failed events
        eventQueue.push(...events);
      }
    } catch (err) {
      console.error("❌ Error processing event queue:", err);
      eventQueue.push(...events);
    }
  }

  // Helper to log timeline events
  async function logEvent(eventType, message, metadata = {}) {
    const event = {
      user_id: userId,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      event_type: eventType,
      message: message,
      metadata: metadata
    };

    console.log(`🕒 [${eventType}]`, message);

    if (supabaseReady && supabaseClient) {
      try {
        const { error } = await supabaseClient
          .from("fsd_timeline_events")
          .insert([event]);
        
        if (error) {
          console.error("❌ Failed to log event:", error);
          eventQueue.push(event);
        }
      } catch (err) {
        console.error("❌ Error logging event:", err);
        eventQueue.push(event);
      }
    } else {
      eventQueue.push(event);
    }
  }

  // Core tracking object
  const fsd = {
    user_id: userId,
    session_id: sessionId,
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
      product_tags: window.meta?.product?.tags || [],
      collection_viewed: window.location.pathname.includes("/collections/") 
        ? window.location.pathname.split("/")[window.location.pathname.split("/").indexOf("collections") + 1] || null 
        : null,
      cart_status: "unknown",
      currency: window.Shopify?.currency?.active || "USD",
      language: navigator.language || "en"
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
    user_history: {
      is_returning: isReturning,
      last_seen: localStorage.getItem("fsd_last_seen") || null,
      pages_viewed_last_session: JSON.parse(localStorage.getItem("fsd_last_pages") || "[]"),
      last_session_cart_status: localStorage.getItem("fsd_last_cart_status") || null
    }
  };

  // Log session start
  logEvent("session_start", `Session started on ${window.location.pathname}`, {
    utm_params: utmParams,
    referrer: document.referrer
  });

  // Initialize Supabase connection
  async function initializeSupabase() {
    if (typeof window.supabase === "undefined") {
      console.error("❌ Supabase library not loaded!");
      return;
    }

    supabaseClient = window.supabase.createClient(
      "https://cehbdpqqyfnqthvgyqhe.supabase.co",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlaGJkcHFxeWZucXRodmd5cWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0NDMxNTMsImV4cCI6MjA2NDAxOTE1M30.1Cd1VCSyEJk1Dfr17ZjNVmsMt0oj8z8h2HBy7_oiEfY"
    );

    try {
      // Create or update user record
      const userData = {
        user_id: userId,
        last_seen: new Date().toISOString(),
        is_returning: isReturning,
        device_type: fsd.device.device_type,
        os: fsd.device.os,
        browser: fsd.device.browser,
        language: fsd.shopify.language,
        screen_width: fsd.device.screen_width,
        screen_height: fsd.device.screen_height,
        currency: fsd.shopify.currency
      };

      // If new user, set first_seen
      if (!isReturning) {
        userData.first_seen = new Date().toISOString();
      }

      const { error: userError } = await supabaseClient
        .from("fsd_users")
        .upsert([userData], { onConflict: "user_id" });

      if (userError) {
        console.error("❌ Failed to upsert user:", userError);
      } else {
        console.log("✅ User record updated");
      }

      // Create session record
      const sessionData = {
        session_id: sessionId,
        user_id: userId,
        timestamp: fsd.timestamp,
        referrer: fsd.traffic.referrer,
        utm_source: fsd.traffic.utm_source,
        utm_medium: fsd.traffic.utm_medium,
        utm_campaign: fsd.traffic.utm_campaign,
        utm_term: fsd.traffic.utm_term,
        utm_content: fsd.traffic.utm_content,
        product_viewed: fsd.shopify.product_viewed,
        product_tags: fsd.shopify.product_tags,
        collection_viewed: fsd.shopify.collection_viewed,
        last_session_cart_status: fsd.user_history.last_session_cart_status,
        pages_viewed_last_session: fsd.user_history.pages_viewed_last_session,
        device_type: fsd.device.device_type,
        os: fsd.device.os,
        browser: fsd.device.browser,
        language: fsd.shopify.language,
        screen_width: fsd.device.screen_width,
        screen_height: fsd.device.screen_height,
        currency: fsd.shopify.currency
        // Note: Location and weather fields are null for now
        // You would need to integrate with IP geolocation and weather APIs to populate these
      };

      const { error: sessionError } = await supabaseClient
        .from("fsd_sessions")
        .insert([sessionData]);

      if (sessionError) {
        console.error("❌ Failed to create session:", sessionError);
      } else {
        console.log("✅ Session record created");
        supabaseReady = true;
        // Process any queued events
        await processEventQueue();
      }

    } catch (err) {
      console.error("❌ Supabase initialization error:", err);
    }
  }

  // Wait for window load to initialize Supabase
  if (document.readyState === 'complete') {
    initializeSupabase();
  } else {
    window.addEventListener("load", initializeSupabase);
  }

  // Scroll tracking with direction in 10% increments
  let lastLoggedScroll = 0;
  let lastScrollTop = window.scrollY;

  const handleScroll = () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const percent = Math.round((scrollTop / docHeight) * 100);
    const direction = scrollTop > lastScrollTop ? "down" : scrollTop < lastScrollTop ? "up" : null;

    if (!fsd.behavior.seen_price && percent >= 40) {
      fsd.behavior.seen_price = true;
      logEvent("interaction", "Viewed price section", { scroll_percent: percent });
    }

    const scrollIncrement = 10;
    if (direction && Math.abs(percent - lastLoggedScroll) >= scrollIncrement) {
      logEvent("scroll", `Scrolled ${direction} to ${percent}%`, { 
        direction: direction,
        percent: percent 
      });
      fsd.behavior.scroll_depth_percent = Math.max(fsd.behavior.scroll_depth_percent, percent);
      fsd.behavior.last_scroll_percent = percent;
      fsd.behavior.last_scroll_direction = direction;
      lastLoggedScroll = percent;
    }

    lastScrollTop = scrollTop;
  };

  window.addEventListener("scroll", debounce(handleScroll, 200));

  // Track idle time
  let idleCounter = 0;
  const idleInterval = setInterval(() => {
    idleCounter++;
    fsd.behavior.idle_seconds++;
    if (idleCounter === 10) {
      logEvent("behavior", "User idle for 10 seconds", { idle_seconds: 10 });
    } else if (idleCounter === 30) {
      logEvent("behavior", "User idle for 30 seconds", { idle_seconds: 30 });
    }
  }, 1000);

  ["mousemove", "keydown", "scroll", "touchstart"].forEach(evt =>
    document.addEventListener(evt, () => {
      idleCounter = 0;
    })
  );

  // Track cart status and changes
  let previousCartSnapshot = "";
  const pollCart = async () => {
    try {
      const response = await fetch("/cart.js");
      const data = await response.json();
      
      const previousStatus = fsd.shopify.cart_status;
      const currentItemCount = data.items.length;
      fsd.shopify.cart_status = currentItemCount > 0 ? "has_items" : "empty";

      const newSnapshot = JSON.stringify(data.items.map(item => `${item.id}-${item.quantity}`));
      if (newSnapshot !== previousCartSnapshot) {
        if (data.items.length > 0) {
          const lastItem = data.items[data.items.length - 1];
          if (lastItem && lastItem.product_title) {
            logEvent("cart_update", `Product added/updated: ${lastItem.product_title}`, {
              product_id: lastItem.product_id,
              variant_id: lastItem.variant_id,
              quantity: lastItem.quantity,
              price: lastItem.price
            });
          }
        } else {
          logEvent("cart_update", "All products removed from cart", {
            previous_items: previousCartSnapshot
          });
        }
        previousCartSnapshot = newSnapshot;
      }

      if (previousStatus !== fsd.shopify.cart_status) {
        logEvent("cart_status", `Cart status changed to: ${fsd.shopify.cart_status}`, {
          item_count: currentItemCount,
          total_price: data.total_price
        });
      }
    } catch (err) {
      console.error("Failed to poll cart:", err);
    }
  };
  
  // Initial cart poll
  pollCart();
  // Poll less frequently - every 30 seconds instead of 10
  const cartInterval = setInterval(pollCart, 30000);

  // Custom button tracker mapping
  const buttonMap = {
    ".product-optionnew": { name: "Product Options", event_type: "product_option_click" },
    ".orderbtn": { name: "Add to Cart", event_type: "add_to_cart_click" }
  };

  // Track clicks
  document.addEventListener("click", function (e) {
    Object.keys(buttonMap).forEach(selector => {
      const element = e.target.closest(selector);
      if (element) {
        const config = buttonMap[selector];
        logEvent("click", config.name, {
          element_class: selector,
          element_text: element.textContent?.trim() || "",
          product_title: document.querySelector(".product-title")?.textContent || "Unknown"
        });
        
        if (selector === ".orderbtn") {
          fsd.behavior.clicked_add_to_cart = true;
        }
      }
    });
  });

  // Track hovers with debouncing
  const hoverDelays = {};
  const setupHoverTracking = () => {
    Object.keys(buttonMap).forEach(selector => {
      document.querySelectorAll(selector).forEach((el) => {
        const config = buttonMap[selector];
        const trackHover = () => {
          const now = Date.now();
          if (!hoverDelays[selector] || now - hoverDelays[selector] > 3000) {
            logEvent("hover", config.name, {
              element_class: selector,
              hover_count: (hoverDelays[selector] ? 2 : 1)
            });
            fsd.behavior.hovered_cta = true;
            hoverDelays[selector] = now;
          }
        };
        el.addEventListener("mouseenter", trackHover);
        el.addEventListener("touchstart", trackHover, { passive: true });
      });
    });
  };

  // Set up hover tracking when DOM is ready
  if (document.readyState === 'complete') {
    setupHoverTracking();
  } else {
    window.addEventListener("load", setupHoverTracking);
  }

  // Track page visibility changes
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      fsd.behavior.tab_visibility_changes++;
      logEvent("visibility", "Tab hidden", { 
        visibility_changes: fsd.behavior.tab_visibility_changes 
      });
    } else {
      logEvent("visibility", "Tab became active", {
        visibility_changes: fsd.behavior.tab_visibility_changes
      });
    }
  });

  // Track form interactions
  const setupFormTracking = () => {
    document.querySelectorAll("input, textarea").forEach((input) => {
      input.addEventListener("input", () => {
        if (!fsd.behavior.typed_into_fields) {
          fsd.behavior.typed_into_fields = true;
          logEvent("form_interaction", "User typed into a field", {
            field_type: input.type,
            field_name: input.name || "unnamed"
          });
        }
      }, { once: true });
    });
  };

  if (document.readyState === 'complete') {
    setupFormTracking();
  } else {
    window.addEventListener("load", setupFormTracking);
  }

  // Clean up and save state before unload
  window.addEventListener("beforeunload", () => {
    // Save user state
    localStorage.setItem("fsd_last_pages", JSON.stringify(fsd.behavior.viewed_pages));
    localStorage.setItem("fsd_last_cart_status", fsd.shopify.cart_status);
    localStorage.setItem("fsd_last_seen", new Date().toISOString());
    
    // Log session end
    logEvent("session_end", "User leaving site", {
      session_duration_seconds: Math.round((Date.now() - new Date(fsd.timestamp).getTime()) / 1000),
      max_scroll_depth: fsd.behavior.scroll_depth_percent,
      total_idle_seconds: fsd.behavior.idle_seconds,
      pages_viewed: fsd.behavior.viewed_pages.length
    });

    // Clean up intervals
    clearInterval(idleInterval);
    clearInterval(cartInterval);
  });

  // Track page navigation (for SPAs)
  let currentPath = window.location.pathname;
  const checkNavigation = () => {
    if (window.location.pathname !== currentPath) {
      currentPath = window.location.pathname;
      fsd.behavior.viewed_pages.push(currentPath);
      logEvent("navigation", `Navigated to ${currentPath}`, {
        from_page: fsd.behavior.viewed_pages[fsd.behavior.viewed_pages.length - 2] || "direct",
        to_page: currentPath
      });
    }
  };
  setInterval(checkNavigation, 1000);

  // Expose for debugging
  window.__fsd = fsd;
  window.__fsd_logEvent = logEvent;
  console.log("✅ FSD Tracker v3 Initialized");
})();
