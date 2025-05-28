(function () {
  async function fsdTrack() {
    const sessionId = localStorage.getItem('extracted_session_id') || crypto.randomUUID();
    localStorage.setItem('extracted_session_id', sessionId);

    const timestamp = new Date().toISOString();
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const userAgent = navigator.userAgent;
    const isMobile = /Mobi|Android/i.test(userAgent);
    const utms = new URLSearchParams(window.location.search);
    const referrer = document.referrer;

    const isReturning = !!localStorage.getItem('visited_before');
    const lastSeen = localStorage.getItem('last_seen') || null;
    localStorage.setItem('visited_before', 'true');
    localStorage.setItem('last_seen', timestamp);

    const cartRes = await fetch('/cart.js');
    const cart = await cartRes.json();

    // Scroll depth tracker
    let maxScroll = 0;
    window.addEventListener('scroll', () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const percent = Math.round((scrollTop / docHeight) * 100);
      if (percent > maxScroll) maxScroll = percent;
    });

    // Idle timer tracker
    let idleSeconds = 0;
    setInterval(() => idleSeconds++, 1000);
    ['mousemove', 'keydown', 'scroll', 'touchstart'].forEach(evt =>
      document.addEventListener(evt, () => (idleSeconds = 0))
    );

    // Wait 4s for scroll + idle to stabilise
    await new Promise(r => setTimeout(r, 4000));

    const session_context = {
      session_id: sessionId,
      timestamp,
      traffic: {
        utm_source: utms.get('utm_source'),
        utm_medium: utms.get('utm_medium'),
        utm_campaign: utms.get('utm_campaign'),
        utm_term: utms.get('utm_term'),
        referrer
      },
      device: {
        device_type: isMobile ? 'mobile' : 'desktop',
        os: navigator.platform,
        browser: userAgent,
        screen_width: screenWidth,
        screen_height: screenHeight
      },
      shopify: {
        product_viewed: window.location.pathname,
        product_tags: window.product_tags || [],
        collection_viewed: window.collection_title || null,
        cart_status: cart.items.length > 0 ? "has_items" : "empty",
        currency: window.Shopify?.currency?.active || 'GBP',
        language: navigator.language
      },
      behavior: {
        scroll_depth_percent: maxScroll,
        idle_seconds: idleSeconds,
        clicked_add_to_cart: false,
        hovered_cta: false,
        viewed_pages: [window.location.pathname]
      },
      user_history: {
        is_returning: isReturning,
        last_seen,
        pages_viewed_last_session: [],
        last_session_cart_status: null
      }
    };

    console.log("📊 Extracted FSD:", session_context);
  }

  fsdTrack();
})();
