// FSD Tracker v3 with Location & Weather - Pandectes GDPR Integration
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

// GDPR Consent Check - Google Consent Mode & Pandectes Integration
function hasAnalyticsConsent() {
  // Check Google Consent Mode first
  if (typeof gtag !== 'undefined') {
    // Check if analytics_storage is granted
    try {
      // Google Consent Mode v2 check
      const consentState = window.dataLayer?.find(item => 
        item[0] === 'consent' && item[1] === 'default'
      );
      
      if (consentState && consentState[2]?.analytics_storage === 'granted') {
        return true;
      }
      
      // Alternative check for consent update
      const consentUpdate = window.dataLayer?.find(item => 
        item[0] === 'consent' && item[1] === 'update'
      );
      
      if (consentUpdate && consentUpdate[2]?.analytics_storage === 'granted') {
        return true;
      }
    } catch (e) {
      console.log("Could not check Google Consent Mode");
    }
  }
  
  // Fallback to checking Pandectes directly
  if (window.Pandectes) {
    return window.Pandectes.getConsent('analytics') === true || 
           window.Pandectes.getConsent('statistics') === true;
  }
  
  // Final fallback to checking cookie
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'pandectes-consent') {
      try {
        const consent = JSON.parse(decodeURIComponent(value));
        return consent.analytics === true || consent.statistics === true;
      } catch (e) {
        console.log("Could not parse Pandectes consent cookie");
      }
    }
  }
  
  return false;
}

// Wait for consent via Google Consent Mode
function waitForConsent(callback) {
  if (hasAnalyticsConsent()) {
    callback();
  } else {
    // Listen for Google Consent Mode updates
    let originalPush = window.dataLayer.push;
    window.dataLayer.push = function() {
      originalPush.apply(window.dataLayer, arguments);
      
      // Check if this was a consent update
      const args = arguments[0];
      if (args && args[0] === 'consent' && args[1] === 'update') {
        if (args[2]?.analytics_storage === 'granted') {
          window.dataLayer.push = originalPush; // Restore original
          callback();
        }
      }
    };
    
    // Also listen for Pandectes events as backup
    window.addEventListener('pandectes:consent-given', function(e) {
      if (e.detail && (e.detail.analytics || e.detail.statistics)) {
        callback();
      }
    });
    
    // Check periodically in case we missed the event
    let checkCount = 0;
    const checkInterval = setInterval(() => {
      checkCount++;
      if (hasAnalyticsConsent()) {
        clearInterval(checkInterval);
        callback();
      } else if (checkCount > 20) {
        // Stop checking after 10 seconds
        clearInterval(checkInterval);
      }
    }, 500);
  }
}

// Location and Weather API functions
async function getLocationData() {
  try {
    // Using ipapi.co free tier (1,000 requests/day)
    const response = await fetch('https://ipapi.co/json/');
    const data = await response.json();
    
    return {
      country: data.country_name || null,
      region: data.region || null,
      city: data.city || null,
      postal_code: data.postal || null,
      timezone: data.timezone || null,
      latitude: data.latitude || null,
      longitude: data.longitude || null
    };
  } catch (error) {
    console.error('Failed to get location data:', error);
    return {
      country: null,
      region: null,
      city: null,
      postal_code: null,
      timezone: null,
      latitude: null,
      longitude: null
    };
  }
}

async function getWeatherData(latitude, longitude) {
  try {
    // Using OpenWeatherMap free tier (1,000 requests/day)
    const API_KEY = 'd74971d78c4f001281fe256e8078fc87';
    const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${API_KEY}`);
    const data = await response.json();
    
    const now = new Date();
    const localHour = now.getHours();
    const localDay = now.toLocaleDateString('en-US', { weekday: 'long' });
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    
    // Determine part of day
    let partOfDay = 'night';
    if (localHour >= 5 && localHour < 12) partOfDay = 'morning';
    else if (localHour >= 12 && localHour < 17) partOfDay = 'afternoon';
    else if (localHour >= 17 && localHour < 21) partOfDay = 'evening';
    
    // Calculate days until payday (assuming last Friday of the month)
    function getLastFridayOfMonth(date) {
      const year = date.getFullYear();
      const month = date.getMonth();
      const lastDay = new Date(year, month + 1, 0);
      const dayOfWeek = lastDay.getDay();
      const diff = dayOfWeek >= 5 ? dayOfWeek - 5 : dayOfWeek + 2;
      return new Date(year, month + 1, -diff);
    }
    
    const lastFriday = getLastFridayOfMonth(now);
    const nextMonthLastFriday = getLastFridayOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    
    let daysUntilPayday;
    if (now <= lastFriday) {
      // Payday hasn't happened this month yet
      daysUntilPayday = Math.ceil((lastFriday - now) / (1000 * 60 * 60 * 24));
    } else {
      // Payday passed, calculate to next month's last Friday
      daysUntilPayday = Math.ceil((nextMonthLastFriday - now) / (1000 * 60 * 60 * 24));
    }
    
    const isNearPayday = daysUntilPayday <= 3;
    
    // Determine season (Northern Hemisphere)
    const month = now.getMonth();
    let season = 'winter';
    if (month >= 2 && month <= 4) season = 'spring';
    else if (month >= 5 && month <= 7) season = 'summer';
    else if (month >= 8 && month <= 10) season = 'autumn';
    
    return {
      temperature_celsius: Math.round(data.main?.temp) || null,
      weather_condition: data.weather?.[0]?.main || null,
      humidity: data.main?.humidity || null,
      local_hour: localHour,
      local_day: localDay,
      part_of_day: partOfDay,
      is_weekend: isWeekend,
      days_until_payday: daysUntilPayday,
      is_near_payday: isNearPayday,
      season: season
    };
  } catch (error) {
    console.error('Failed to get weather data:', error);
    // Return time-based data even if weather API fails
    const now = new Date();
    const localHour = now.getHours();
    const localDay = now.toLocaleDateString('en-US', { weekday: 'long' });
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    
    let partOfDay = 'night';
    if (localHour >= 5 && localHour < 12) partOfDay = 'morning';
    else if (localHour >= 12 && localHour < 17) partOfDay = 'afternoon';
    else if (localHour >= 17 && localHour < 21) partOfDay = 'evening';
    
    const currentDate = now.getDate();
    let daysUntilPayday = 0;
    if (currentDate <= 15) {
      daysUntilPayday = 15 - currentDate;
    } else {
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      daysUntilPayday = lastDay - currentDate;
    }
    
    const month = now.getMonth();
    let season = 'winter';
    if (month >= 2 && month <= 4) season = 'spring';
    else if (month >= 5 && month <= 7) season = 'summer';
    else if (month >= 8 && month <= 10) season = 'autumn';
    
    return {
      temperature_celsius: null,
      weather_condition: null,
      humidity: null,
      local_hour: localHour,
      local_day: localDay,
      part_of_day: partOfDay,
      is_weekend: isWeekend,
      days_until_payday: daysUntilPayday,
      is_near_payday: daysUntilPayday <= 3,
      season: season
    };
  }
}

const utmParams = getUTMParams();

// Main tracking function - only runs after consent is given
function initializeTracking() {
  console.log("✅ Analytics consent granted - initializing FSD Tracker");

  // Generate or retrieve persistent user ID
  let userId = localStorage.getItem("fsd_user_id");
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem("fsd_user_id", userId);
  }

  // Always generate a new session ID for each page load/session
  const sessionId = crypto.randomUUID();
  sessionStorage.setItem("fsd_session_id", sessionId);

  // Track if this is a returning user
  const isReturning = !!localStorage.getItem("fsd_last_seen");

  // Initialize Supabase client
  let supabaseClient = null;
  let supabaseReady = false;

  // Queue for events that occur before Supabase is ready
  const eventQueue = [];

  // Store location and weather data
  let locationData = null;
  let weatherData = null;

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
      // Get location and weather data
      locationData = await getLocationData();
      if (locationData.latitude && locationData.longitude) {
        weatherData = await getWeatherData(locationData.latitude, locationData.longitude);
      } else {
        weatherData = await getWeatherData(null, null);
      }

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

      // Create session record with location and weather data
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
        currency: fsd.shopify.currency,
        // Location data
        country: locationData?.country,
        region: locationData?.region,
        city: locationData?.city,
        postal_code: locationData?.postal_code,
        timezone: locationData?.timezone,
        // Weather and temporal data
        temperature_celsius: weatherData?.temperature_celsius,
        weather_condition: weatherData?.weather_condition,
        humidity: weatherData?.humidity,
        local_hour: weatherData?.local_hour,
        local_day: weatherData?.local_day,
        part_of_day: weatherData?.part_of_day,
        is_weekend: weatherData?.is_weekend,
        days_until_payday: weatherData?.days_until_payday,
        is_near_payday: weatherData?.is_near_payday,
        season: weatherData?.season
      };

      const { error: sessionError } = await supabaseClient
        .from("fsd_sessions")
        .insert([sessionData]);

      if (sessionError) {
        console.error("❌ Failed to create session:", sessionError);
      } else {
        console.log("✅ Session record created");
        console.log("📍 Location:", locationData?.city, locationData?.country);
        console.log("🌤️ Weather:", weatherData?.temperature_celsius + "°C", weatherData?.weather_condition);
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
  window.__fsd_locationData = locationData;
  window.__fsd_weatherData = weatherData;
  console.log("✅ FSD Tracker v3 Initialized");
}

// Start the tracker only after consent is given
waitForConsent(initializeTracking);

// Log that we're waiting for consent
console.log("⏳ FSD Tracker loaded - waiting for analytics consent via Pandectes");
