// FSD Tracker v4 - AI-Optimized with Behavior Aggregation & Enhanced Analytics
// Includes GDPR compliance via Google Consent Mode/Pandectes

// Helper functions
function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
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
    try {
      const consentState = window.dataLayer?.find(item => 
        item[0] === 'consent' && item[1] === 'default'
      );
      
      if (consentState && consentState[2]?.analytics_storage === 'granted') {
        return true;
      }
      
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
  
  // Fallback to Pandectes
  if (window.Pandectes) {
    return window.Pandectes.getConsent('analytics') === true || 
           window.Pandectes.getConsent('statistics') === true;
  }
  
  // Cookie fallback
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

// Wait for consent
function waitForConsent(callback) {
  if (hasAnalyticsConsent()) {
    callback();
  } else {
    // Listen for Google Consent Mode updates
    let originalPush = window.dataLayer.push;
    window.dataLayer.push = function() {
      originalPush.apply(window.dataLayer, arguments);
      
      const args = arguments[0];
      if (args && args[0] === 'consent' && args[1] === 'update') {
        if (args[2]?.analytics_storage === 'granted') {
          window.dataLayer.push = originalPush;
          callback();
        }
      }
    };
    
    // Pandectes event listener
    window.addEventListener('pandectes:consent-given', function(e) {
      if (e.detail && (e.detail.analytics || e.detail.statistics)) {
        callback();
      }
    });
    
    // Periodic check
    let checkCount = 0;
    const checkInterval = setInterval(() => {
      checkCount++;
      if (hasAnalyticsConsent()) {
        clearInterval(checkInterval);
        callback();
      } else if (checkCount > 20) {
        clearInterval(checkInterval);
      }
    }, 500);
  }
}

// Location and Weather API functions
async function getLocationData() {
  try {
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
    const API_KEY = 'd74971d78c4f001281fe256e8078fc87';
    const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${API_KEY}`);
    
    if (!response.ok) {
      console.error(`Weather API error: ${response.status} ${response.statusText}`);
      throw new Error(`Weather API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    const now = new Date();
    const localHour = now.getHours();
    const localDay = now.toLocaleDateString('en-US', { weekday: 'long' });
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    
    let partOfDay = 'night';
    if (localHour >= 5 && localHour < 12) partOfDay = 'morning';
    else if (localHour >= 12 && localHour < 17) partOfDay = 'afternoon';
    else if (localHour >= 17 && localHour < 21) partOfDay = 'evening';
    
    // Calculate days until payday (last Friday of month)
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
      daysUntilPayday = Math.ceil((lastFriday - now) / (1000 * 60 * 60 * 24));
    } else {
      daysUntilPayday = Math.ceil((nextMonthLastFriday - now) / (1000 * 60 * 60 * 24));
    }
    
    const isNearPayday = daysUntilPayday <= 3;
    
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
    const now = new Date();
    const localHour = now.getHours();
    const localDay = now.toLocaleDateString('en-US', { weekday: 'long' });
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    
    let partOfDay = 'night';
    if (localHour >= 5 && localHour < 12) partOfDay = 'morning';
    else if (localHour >= 12 && localHour < 17) partOfDay = 'afternoon';
    else if (localHour >= 17 && localHour < 21) partOfDay = 'evening';
    
    return {
      temperature_celsius: null,
      weather_condition: null,
      humidity: null,
      local_hour: localHour,
      local_day: localDay,
      part_of_day: partOfDay,
      is_weekend: isWeekend,
      days_until_payday: null,
      is_near_payday: null,
      season: null
    };
  }
}

const utmParams = getUTMParams();

// Main tracking function
function initializeTracking() {
  console.log("✅ Analytics consent granted - initializing FSD Tracker v4");

  // User and session management
  let userId = localStorage.getItem("fsd_user_id");
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem("fsd_user_id", userId);
  }

  // Always generate new session ID
  const sessionId = crypto.randomUUID();
  sessionStorage.setItem("fsd_session_id", sessionId);

  const isReturning = !!localStorage.getItem("fsd_last_seen");
  const sessionStartTime = Date.now();

  // Initialize Supabase
  let supabaseClient = null;
  let supabaseReady = false;

  // Event queue for timeline events
  const eventQueue = [];

  // Location and weather data
  let locationData = null;
  let weatherData = null;

  // Behavior aggregation data structure
  const behaviorData = {
    // Scroll behavior
    scroll: {
      total_distance: 0,
      max_depth_percent: 0,
      direction_changes: 0,
      velocity_samples: [],
      slow_scroll_time: 0,
      fast_scroll_time: 0,
      scroll_patterns: [],
      sections_viewed: {}
    },
    
    // Mouse/touch behavior
    mouse: {
      total_distance: 0,
      velocity_samples: [],
      acceleration_events: 0,
      hover_events: {},
      click_positions: [],
      rage_clicks: 0,
      dead_clicks: 0
    },
    
    // Attention metrics
    attention: {
      total_engaged_time: 0,
      idle_time: 0,
      active_time: 0,
      reading_time: 0,
      time_to_first_interaction: null,
      viewport_attention: {},
      element_visibility: {}
    },
    
    // Interaction patterns
    interactions: {
      total_clicks: 0,
      total_hovers: 0,
      form_interactions: 0,
      form_abandonments: 0,
      copy_events: 0,
      paste_events: 0,
      selection_events: 0,
      zoom_events: 0
    },
    
    // E-commerce specific
    ecommerce: {
      product_views: [],
      cart_interactions: [],
      cart_value_timeline: [],
      add_remove_patterns: [],
      checkout_progress: 0,
      price_checks: 0,
      size_guide_views: 0,
      review_interactions: 0
    },
    
    // Content engagement
    content: {
      images_viewed: {},
      videos_played: {},
      links_clicked: [],
      external_link_clicks: 0,
      internal_navigation: []
    },
    
    // Technical metrics
    technical: {
      fps_samples: [],
      load_time: 0,
      time_to_interactive: 0,
      connection_speed: null,
      battery_level: null,
      memory_usage: null
    },
    
    // Behavioral flags
    flags: {
      is_engaged: false,
      is_frustrated: false,
      is_comparison_shopping: false,
      is_research_mode: false,
      shows_purchase_intent: false,
      is_price_sensitive: false
    }
  };

  // Track mouse position and movement
  let lastMouseX = 0, lastMouseY = 0, mouseDistance = 0;
  let lastMouseTime = Date.now();
  
  const handleMouseMove = throttle((e) => {
    const currentTime = Date.now();
    const timeDelta = currentTime - lastMouseTime;
    
    if (lastMouseX && lastMouseY && timeDelta > 0) {
      const distance = Math.sqrt(
        Math.pow(e.clientX - lastMouseX, 2) + 
        Math.pow(e.clientY - lastMouseY, 2)
      );
      
      mouseDistance += distance;
      behaviorData.mouse.total_distance += distance;
      
      // Calculate velocity
      const velocity = distance / timeDelta;
      behaviorData.mouse.velocity_samples.push({
        velocity: velocity,
        timestamp: currentTime
      });
      
      // Keep only last 50 samples
      if (behaviorData.mouse.velocity_samples.length > 50) {
        behaviorData.mouse.velocity_samples.shift();
      }
      
      // Detect sudden acceleration (potential frustration)
      if (velocity > 2 && behaviorData.mouse.velocity_samples.length > 1) {
        const prevVelocity = behaviorData.mouse.velocity_samples[behaviorData.mouse.velocity_samples.length - 2].velocity;
        if (velocity > prevVelocity * 2) {
          behaviorData.mouse.acceleration_events++;
        }
      }
    }
    
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    lastMouseTime = currentTime;
  }, 50);

  // Enhanced scroll tracking
  let lastScrollY = window.scrollY;
  let lastScrollTime = Date.now();
  let scrollSamples = [];
  
  const handleScroll = throttle(() => {
    const currentScrollY = window.scrollY;
    const currentTime = Date.now();
    const timeDelta = currentTime - lastScrollTime;
    
    if (timeDelta > 0) {
      const distance = Math.abs(currentScrollY - lastScrollY);
      const velocity = distance / timeDelta;
      
      behaviorData.scroll.total_distance += distance;
      
      // Track direction changes
      if ((currentScrollY > lastScrollY && lastScrollY < window.scrollY) ||
          (currentScrollY < lastScrollY && lastScrollY > window.scrollY)) {
        behaviorData.scroll.direction_changes++;
      }
      
      // Categorize scroll speed
      if (velocity < 0.5) {
        behaviorData.scroll.slow_scroll_time += timeDelta;
      } else if (velocity > 2) {
        behaviorData.scroll.fast_scroll_time += timeDelta;
      }
      
      // Track scroll patterns
      scrollSamples.push({
        position: currentScrollY,
        velocity: velocity,
        timestamp: currentTime
      });
      
      // Detect patterns every 10 samples
      if (scrollSamples.length >= 10) {
        const pattern = analyzeScrollPattern(scrollSamples);
        behaviorData.scroll.scroll_patterns.push(pattern);
        scrollSamples = [];
      }
      
      // Update max scroll depth
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = Math.round((currentScrollY / docHeight) * 100);
      behaviorData.scroll.max_depth_percent = Math.max(behaviorData.scroll.max_depth_percent, scrollPercent);
    }
    
    lastScrollY = currentScrollY;
    lastScrollTime = currentTime;
  }, 100);

  // Analyze scroll patterns
  function analyzeScrollPattern(samples) {
    const avgVelocity = samples.reduce((sum, s) => sum + s.velocity, 0) / samples.length;
    const velocityVariance = samples.reduce((sum, s) => sum + Math.pow(s.velocity - avgVelocity, 2), 0) / samples.length;
    
    let pattern = 'normal';
    if (avgVelocity > 3) pattern = 'skimming';
    else if (avgVelocity < 0.3) pattern = 'reading';
    else if (velocityVariance > 2) pattern = 'searching';
    else if (samples.filter(s => s.velocity > 5).length > 3) pattern = 'rage_scrolling';
    
    return {
      type: pattern,
      avg_velocity: avgVelocity,
      variance: velocityVariance,
      duration: samples[samples.length - 1].timestamp - samples[0].timestamp
    };
  }

  // Intersection Observer for element visibility
  const visibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const element = entry.target;
      const identifier = element.dataset.trackingId;
      
      // Skip if no tracking ID set
      if (!identifier) return;
      
      if (!behaviorData.attention.element_visibility[identifier]) {
        behaviorData.attention.element_visibility[identifier] = {
          first_seen: null,
          total_visible_time: 0,
          last_visible_start: null,
          view_count: 0
        };
      }
      
      const tracking = behaviorData.attention.element_visibility[identifier];
      
      if (entry.isIntersecting) {
        if (!tracking.first_seen) {
          tracking.first_seen = Date.now();
        }
        tracking.last_visible_start = Date.now();
        tracking.view_count++;
      } else if (tracking.last_visible_start) {
        tracking.total_visible_time += Date.now() - tracking.last_visible_start;
        tracking.last_visible_start = null;
      }
    });
  }, {
    threshold: [0, 0.25, 0.5, 0.75, 1.0]
  });

  // Track key elements
  const trackElements = () => {
    // Define what elements to track with meaningful identifiers
    const elementsToTrack = [
      // Product elements
      { selector: '.product-card', id: 'product_card' },
      { selector: '.product-image', id: 'product_image' },
      { selector: '.product-price, .floatprice', id: 'price' },
      { selector: '.product-title', id: 'product_title' },
      
      // CTAs
      { selector: '.add-to-cart, .orderbtn, [data-add-to-cart]', id: 'add_to_cart' },
      { selector: '.checkout, .checkout-button', id: 'checkout' },
      { selector: '.buy-now', id: 'buy_now' },
      
      // Content sections
      { selector: '.hero, #hero', id: 'hero_section' },
      { selector: '.features, #features', id: 'features_section' },
      { selector: '.testimonials, #testimonials, .reviews', id: 'reviews_section' },
      { selector: '.pricing, #pricing', id: 'pricing_section' },
      
      // E-commerce specific
      { selector: '.size-guide, .sizing-chart', id: 'size_guide' },
      { selector: '.shipping-info', id: 'shipping_info' },
      { selector: '.product-description', id: 'product_description' },
      { selector: '.product-specifications', id: 'specifications' }
    ];
    
    elementsToTrack.forEach(({ selector, id }) => {
      document.querySelectorAll(selector).forEach((el, index) => {
        // Set a meaningful tracking ID
        el.dataset.trackingId = index > 0 ? `${id}_${index}` : id;
        visibilityObserver.observe(el);
      });
    });
  };

  // Enhanced click tracking
  let lastClickTime = 0;
  let clicksInSameArea = 0;
  let lastClickX = 0, lastClickY = 0;
  
  const handleClick = (e) => {
    const currentTime = Date.now();
    const timeSinceLastClick = currentTime - lastClickTime;
    
    behaviorData.interactions.total_clicks++;
    
    // Track click position
    behaviorData.mouse.click_positions.push({
      x: e.clientX,
      y: e.clientY,
      target: e.target.tagName,
      timestamp: currentTime
    });
    
    // Detect rage clicks (multiple clicks in same area within 1 second)
    const clickDistance = Math.sqrt(
      Math.pow(e.clientX - lastClickX, 2) + 
      Math.pow(e.clientY - lastClickY, 2)
    );
    
    if (timeSinceLastClick < 1000 && clickDistance < 50) {
      clicksInSameArea++;
      if (clicksInSameArea >= 3) {
        behaviorData.mouse.rage_clicks++;
        behaviorData.flags.is_frustrated = true;
      }
    } else {
      clicksInSameArea = 1;
    }
    
    // Detect dead clicks (clicks with no effect)
    const target = e.target;
    if (!target.href && !target.onclick && !target.closest('a, button, input, select, textarea')) {
      behaviorData.mouse.dead_clicks++;
    }
    
    lastClickTime = currentTime;
    lastClickX = e.clientX;
    lastClickY = e.clientY;
  };

  // Track hover events with category aggregation
  const hoverTracking = new Map();
  
  // Define hover categories
  function getHoverCategory(element) {
    // Check for specific important elements
    if (element.closest('.add-to-cart, .orderbtn, [data-add-to-cart]')) return 'add_to_cart';
    if (element.closest('.price, .product-price')) return 'price';
    if (element.closest('.product-image')) return 'product_image';
    if (element.closest('.size-guide, .sizing-chart')) return 'size_guide';
    if (element.closest('.checkout, .checkout-button')) return 'checkout';
    if (element.closest('a')) return 'links';
    if (element.closest('button')) return 'buttons';
    
    // Ignore everything else
    return null;
  }
  
  const handleMouseOver = (e) => {
    const target = e.target;
    const category = getHoverCategory(target);
    
    // Skip if not a tracked category
    if (!category) return;
    
    if (!hoverTracking.has(target)) {
      hoverTracking.set(target, {
        category: category,
        startTime: Date.now()
      });
    }
    
    const tracking = hoverTracking.get(target);
    tracking.startTime = Date.now();
  };
  
  const handleMouseOut = (e) => {
    const target = e.target;
    const tracking = hoverTracking.get(target);
    
    if (tracking && tracking.startTime) {
      const hoverTime = Date.now() - tracking.startTime;
      
      // Initialize category if doesn't exist
      if (!behaviorData.mouse.hover_events[tracking.category]) {
        behaviorData.mouse.hover_events[tracking.category] = {
          count: 0,
          total_time: 0,
          avg_time: 0,
          max_time: 0
        };
      }
      
      const hoverData = behaviorData.mouse.hover_events[tracking.category];
      hoverData.count++;
      hoverData.total_time += hoverTime;
      hoverData.avg_time = Math.round(hoverData.total_time / hoverData.count);
      hoverData.max_time = Math.max(hoverData.max_time, hoverTime);
      
      behaviorData.interactions.total_hovers++;
      
      // Set flags based on hover patterns
      if (tracking.category === 'add_to_cart' && hoverTime > 2000) {
        behaviorData.flags.shows_purchase_intent = true;
      }
      
      if (tracking.category === 'price' && hoverData.count > 3) {
        behaviorData.flags.is_price_sensitive = true;
      }
      
      // Clean up tracking
      hoverTracking.delete(target);
    }
  };

  // Track copy/paste events
  document.addEventListener('copy', () => {
    behaviorData.interactions.copy_events++;
    behaviorData.flags.is_research_mode = true;
  });
  
  document.addEventListener('paste', () => {
    behaviorData.interactions.paste_events++;
  });
  
  // Track text selection
  document.addEventListener('selectionchange', debounce(() => {
    const selection = window.getSelection();
    if (selection.toString().length > 0) {
      behaviorData.interactions.selection_events++;
    }
  }, 500));

  // Track zoom events
  let lastScale = 1;
  window.visualViewport?.addEventListener('resize', () => {
    const currentScale = window.visualViewport.scale;
    if (currentScale !== lastScale) {
      behaviorData.interactions.zoom_events++;
      lastScale = currentScale;
    }
  });

  // Performance monitoring
  const performanceObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'measure' && entry.name === 'fsd-fps') {
        behaviorData.technical.fps_samples.push({
          fps: Math.round(1000 / entry.duration),
          timestamp: Date.now()
        });
      }
    }
  });
  performanceObserver.observe({ entryTypes: ['measure'] });

  // FPS tracking
  let lastFrameTime = performance.now();
  const trackFPS = () => {
    const currentTime = performance.now();
    performance.measure('fsd-fps', {
      start: lastFrameTime,
      end: currentTime
    });
    lastFrameTime = currentTime;
    requestAnimationFrame(trackFPS);
  };
  requestAnimationFrame(trackFPS);

  // Attention and idle tracking
  let idleTimer = null;
  let lastActivityTime = Date.now();
  
  const resetIdleTimer = () => {
    const now = Date.now();
    const idleTime = now - lastActivityTime;
    
    if (idleTime > 100) {
      behaviorData.attention.idle_time += idleTime;
    } else {
      behaviorData.attention.active_time += idleTime;
    }
    
    lastActivityTime = now;
    behaviorData.flags.is_engaged = true;
    
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      behaviorData.flags.is_engaged = false;
    }, 30000); // 30 seconds of inactivity = not engaged
  };

  // Set up event listeners
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('scroll', handleScroll);
  document.addEventListener('click', handleClick);
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('mouseout', handleMouseOut);
  
  ['mousedown', 'keydown', 'touchstart', 'scroll'].forEach(event => {
    document.addEventListener(event, resetIdleTimer);
  });

  // E-commerce specific tracking
  const trackEcommerce = () => {
    // Track cart value changes
    const pollCart = async () => {
      try {
        const response = await fetch('/cart.js');
        const cart = await response.json();
        
        behaviorData.ecommerce.cart_value_timeline.push({
          timestamp: Date.now(),
          value: cart.total_price,
          item_count: cart.items.length
        });
        
        // Detect add/remove patterns
        if (behaviorData.ecommerce.cart_value_timeline.length > 1) {
          const prev = behaviorData.ecommerce.cart_value_timeline[behaviorData.ecommerce.cart_value_timeline.length - 2];
          const curr = behaviorData.ecommerce.cart_value_timeline[behaviorData.ecommerce.cart_value_timeline.length - 1];
          
          if (curr.item_count > prev.item_count) {
            behaviorData.ecommerce.add_remove_patterns.push({ type: 'add', timestamp: Date.now() });
            behaviorData.flags.shows_purchase_intent = true;
          } else if (curr.item_count < prev.item_count) {
            behaviorData.ecommerce.add_remove_patterns.push({ type: 'remove', timestamp: Date.now() });
          }
        }
      } catch (err) {
        console.error('Cart polling error:', err);
      }
    };
    
    // Poll cart every 10 seconds
    setInterval(pollCart, 10000);
    pollCart();
    
    // Track product views
    const productElements = document.querySelectorAll('[data-product-id]');
    productElements.forEach(el => {
      visibilityObserver.observe(el);
    });
  };

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
        eventQueue.push(...events);
      }
    } catch (err) {
      console.error("❌ Error processing event queue:", err);
      eventQueue.push(...events);
    }
  }

  // Log significant timeline events only
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

  // Update behavior data in session record
  async function updateBehaviorData() {
    if (!supabaseReady || !supabaseClient) return;
    
    try {
      // Calculate derived metrics
      const totalTime = Date.now() - sessionStartTime;
      behaviorData.attention.total_engaged_time = behaviorData.attention.active_time;
      behaviorData.attention.reading_time = behaviorData.scroll.slow_scroll_time;
      
      // Update flags based on behavior
      if (behaviorData.mouse.rage_clicks > 2 || behaviorData.mouse.acceleration_events > 10) {
        behaviorData.flags.is_frustrated = true;
      }
      
      // Price sensitivity based on hover patterns
      const priceHovers = behaviorData.mouse.hover_events.price;
      if (priceHovers && (priceHovers.count > 3 || priceHovers.total_time > 5000)) {
        behaviorData.flags.is_price_sensitive = true;
      }
      
      if (behaviorData.interactions.copy_events > 0 || behaviorData.interactions.selection_events > 5) {
        behaviorData.flags.is_research_mode = true;
      }
      
      // Comparison shopping if multiple product hovers
      const productHovers = behaviorData.mouse.hover_events.product_image;
      if (productHovers && productHovers.count > 5) {
        behaviorData.flags.is_comparison_shopping = true;
      }
      
      // Clean up empty visibility data before saving
      Object.keys(behaviorData.attention.element_visibility).forEach(key => {
        const data = behaviorData.attention.element_visibility[key];
        if (data.view_count === 0 || data.total_visible_time === 0) {
          delete behaviorData.attention.element_visibility[key];
        }
      });
      
      // Limit FPS samples to last 20
      if (behaviorData.technical.fps_samples.length > 20) {
        behaviorData.technical.fps_samples = behaviorData.technical.fps_samples.slice(-20);
      }
      
      // Limit mouse velocity samples to last 20
      if (behaviorData.mouse.velocity_samples.length > 20) {
        behaviorData.mouse.velocity_samples = behaviorData.mouse.velocity_samples.slice(-20);
      }
      
      // Update session with behavior data
      const { error } = await supabaseClient
        .from("fsd_sessions")
        .update({
          behavior_data: behaviorData,
          last_behavior_update: new Date().toISOString()
        })
        .eq("session_id", sessionId);
      
      if (error) {
        console.error("❌ Failed to update behavior data:", error);
      } else {
        console.log("✅ Behavior data updated");
      }
    } catch (err) {
      console.error("❌ Error updating behavior data:", err);
    }
  }

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

      // Device capabilities
      if (navigator.getBattery) {
        const battery = await navigator.getBattery();
        behaviorData.technical.battery_level = battery.level;
      }
      
      if (navigator.connection) {
        behaviorData.technical.connection_speed = navigator.connection.effectiveType;
      }
      
      if (performance.memory) {
        behaviorData.technical.memory_usage = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;
      }

      // Create or update user record
      const userData = {
        user_id: userId,
        last_seen: new Date().toISOString(),
        is_returning: isReturning,
        device_type: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
        os: navigator.platform,
        browser: navigator.userAgent,
        language: navigator.language || "en",
        screen_width: window.innerWidth,
        screen_height: window.innerHeight,
        currency: window.Shopify?.currency?.active || "USD"
      };

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
        timestamp: new Date().toISOString(),
        referrer: document.referrer || null,
        utm_source: utmParams.utm_source,
        utm_medium: utmParams.utm_medium,
        utm_campaign: utmParams.utm_campaign,
        utm_term: utmParams.utm_term,
        utm_content: utmParams.utm_content,
        product_viewed: window.location.pathname,
        product_tags: window.meta?.product?.tags || [],
        collection_viewed: window.location.pathname.includes("/collections/") 
          ? window.location.pathname.split("/")[window.location.pathname.split("/").indexOf("collections") + 1] || null 
          : null,
        last_session_cart_status: localStorage.getItem("fsd_last_cart_status") || null,
        pages_viewed_last_session: JSON.parse(localStorage.getItem("fsd_last_pages") || "[]"),
        device_type: userData.device_type,
        os: userData.os,
        browser: userData.browser,
        language: userData.language,
        screen_width: userData.screen_width,
        screen_height: userData.screen_height,
        currency: userData.currency,
        country: locationData?.country,
        region: locationData?.region,
        city: locationData?.city,
        postal_code: locationData?.postal_code,
        timezone: locationData?.timezone,
        temperature_celsius: weatherData?.temperature_celsius,
        weather_condition: weatherData?.weather_condition,
        humidity: weatherData?.humidity,
        local_hour: weatherData?.local_hour,
        local_day: weatherData?.local_day,
        part_of_day: weatherData?.part_of_day,
        is_weekend: weatherData?.is_weekend,
        days_until_payday: weatherData?.days_until_payday,
        is_near_payday: weatherData?.is_near_payday,
        season: weatherData?.season,
        behavior_data: behaviorData
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
        
        // Start behavior data updates
        setInterval(updateBehaviorData, 30000); // Update every 30 seconds
      }

    } catch (err) {
      console.error("❌ Supabase initialization error:", err);
    }
  }

  // Log significant events only
  logEvent("session_start", `Session started on ${window.location.pathname}`, {
    utm_params: utmParams,
    referrer: document.referrer
  });

  // Track page visibility
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      logEvent("visibility", "Tab hidden");
    } else {
      logEvent("visibility", "Tab became active");
    }
  });

  // Track significant clicks
  document.addEventListener("click", (e) => {
    const target = e.target;
    
    // Only log clicks on important elements
    if (target.closest('.add-to-cart, .checkout, .buy-now, .product-option')) {
      logEvent("click", `Clicked: ${target.textContent || target.className}`, {
        element: target.tagName,
        class: target.className,
        id: target.id
      });
    }
  });

  // Track cart changes
  let lastCartState = null;
  const trackCartChanges = async () => {
    try {
      const response = await fetch('/cart.js');
      const cart = await response.json();
      const cartState = JSON.stringify(cart.items.map(item => `${item.id}-${item.quantity}`));
      
      if (lastCartState && cartState !== lastCartState) {
        logEvent("cart_update", "Cart contents changed", {
          item_count: cart.items.length,
          total_price: cart.total_price
        });
      }
      
      lastCartState = cartState;
    } catch (err) {
      console.error("Cart tracking error:", err);
    }
  };
  
  setInterval(trackCartChanges, 5000);

  // Clean up before unload
  window.addEventListener("beforeunload", () => {
    // Final behavior data update
    updateBehaviorData();
    
    // Save state
    localStorage.setItem("fsd_last_pages", JSON.stringify([window.location.pathname]));
    localStorage.setItem("fsd_last_cart_status", lastCartState ? "has_items" : "empty");
    localStorage.setItem("fsd_last_seen", new Date().toISOString());
    
    // Log session end
    logEvent("session_end", "User leaving site", {
      session_duration: Math.round((Date.now() - sessionStartTime) / 1000),
      max_scroll_depth: behaviorData.scroll.max_depth_percent,
      total_clicks: behaviorData.interactions.total_clicks,
      engagement_score: calculateEngagementScore()
    });
  });

  // Calculate engagement score
  function calculateEngagementScore() {
    let score = 0;
    
    // Time-based engagement
    if (behaviorData.attention.active_time > 30000) score += 20;
    if (behaviorData.attention.reading_time > 10000) score += 15;
    
    // Interaction-based engagement
    if (behaviorData.interactions.total_clicks > 5) score += 10;
    if (behaviorData.interactions.total_hovers > 10) score += 5;
    
    // Depth of exploration
    if (behaviorData.scroll.max_depth_percent > 50) score += 10;
    if (behaviorData.scroll.max_depth_percent > 80) score += 10;
    
    // E-commerce signals
    if (behaviorData.flags.shows_purchase_intent) score += 20;
    if (behaviorData.ecommerce.cart_value_timeline.length > 0) score += 10;
    
    // Negative signals
    if (behaviorData.flags.is_frustrated) score -= 15;
    if (behaviorData.mouse.rage_clicks > 0) score -= 10;
    
    return Math.max(0, Math.min(100, score));
  }

  // Initialize tracking
  if (document.readyState === 'complete') {
    initializeSupabase();
    trackElements();
    trackEcommerce();
  } else {
    window.addEventListener('load', () => {
      initializeSupabase();
      trackElements();
      trackEcommerce();
    });
  }

  // Expose for debugging
  window.__fsd = {
    userId,
    sessionId,
    behaviorData,
    locationData,
    weatherData,
    getEngagementScore: calculateEngagementScore,
    logEvent
  };
  
  console.log("✅ FSD Tracker v4 Initialized - AI-Optimized");
}

// Start tracking after consent
waitForConsent(initializeTracking);
console.log("⏳ FSD Tracker v4 loaded - waiting for analytics consent");
