// components/GoogleAnalytics.js
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function GoogleAnalytics() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('config', 'G-7YCB9J8HTQ', {
        page_path: location.pathname + location.search,
      });
    }
  }, [location]);

  return null;
}

/**
 * Track CTA button clicks in GA4.
 * @param {string} ctaLabel - e.g. "hero_get_leads", "banner_get_leads", "navbar_get_started"
 * @param {string} [location] - e.g. "hero", "navbar", "banner", "mid_page", "three_block"
 */
export function trackCTA(ctaLabel, location = 'unknown') {
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'cta_click', {
      event_category: 'conversion',
      event_label: ctaLabel,
      cta_location: location,
    });
  }
}

export default GoogleAnalytics;
