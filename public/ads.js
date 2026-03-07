// ============================================================
// BlockDoku - Ad Integration Module
// ============================================================
// Config-driven. Set your AdSense publisher ID below and ads go live.
// No publisher ID = no ads loaded, zero impact on game.
//
// SETUP:
// 1. Go to adsense.google.com, sign in with your AdMob Google account
// 2. Add your domain, get approved
// 3. Create ad units: one "Display" (banner) + one "In-article" or "Multiplex"
// 4. Paste your ca-pub-XXXXX and ad slot IDs below
// ============================================================

const ADS_CONFIG = {
  // Set this to your AdSense publisher ID (e.g., "ca-pub-1234567890123456")
  publisherId: "ca-pub-2624738239425269",

  // Ad unit slot IDs from your AdSense dashboard
  bannerSlot: "",       // Bottom anchor banner
  interstitialSlot: "", // Between-game interstitial

  // How often to show interstitial (every N game overs)
  interstitialFrequency: 2,

  // Minimum seconds between interstitials
  interstitialCooldown: 60,
};

// ============================================================
// Internal state
// ============================================================
let adsLoaded = false;
let gameOverCount = 0;
let lastInterstitialTime = 0;

// ============================================================
// Initialize AdSense
// ============================================================
function initAds() {
  if (!ADS_CONFIG.publisherId) {
    console.log("[Ads] No publisher ID configured. Ads disabled.");
    return;
  }

  // Load AdSense script
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS_CONFIG.publisherId}`;
  script.crossOrigin = "anonymous";
  script.onload = () => {
    adsLoaded = true;
    console.log("[Ads] AdSense loaded successfully.");
    showBannerAd();
  };
  script.onerror = () => {
    console.log("[Ads] AdSense failed to load (ad blocker?).");
  };
  document.head.appendChild(script);
}

// ============================================================
// Bottom Banner Ad
// ============================================================
function showBannerAd() {
  if (!adsLoaded || !ADS_CONFIG.bannerSlot) return;

  const container = document.getElementById("ad-banner-container");
  if (!container) return;

  container.innerHTML = "";
  container.classList.remove("hidden");

  const ins = document.createElement("ins");
  ins.className = "adsbygoogle";
  ins.style.display = "block";
  ins.dataset.adClient = ADS_CONFIG.publisherId;
  ins.dataset.adSlot = ADS_CONFIG.bannerSlot;
  ins.dataset.adFormat = "horizontal";
  ins.dataset.fullWidthResponsive = "false";
  container.appendChild(ins);

  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (e) {
    console.log("[Ads] Banner push error:", e);
  }
}

// ============================================================
// Interstitial Ad (between games)
// ============================================================
function tryShowInterstitial() {
  if (!adsLoaded || !ADS_CONFIG.interstitialSlot) return false;

  gameOverCount++;

  // Respect frequency cap
  if (gameOverCount % ADS_CONFIG.interstitialFrequency !== 0) return false;

  // Respect cooldown
  const now = Date.now();
  if (now - lastInterstitialTime < ADS_CONFIG.interstitialCooldown * 1000) return false;

  lastInterstitialTime = now;
  showInterstitialAd();
  return true;
}

function showInterstitialAd() {
  const overlay = document.getElementById("ad-interstitial-overlay");
  const container = document.getElementById("ad-interstitial-container");
  if (!overlay || !container) return;

  container.innerHTML = "";

  const ins = document.createElement("ins");
  ins.className = "adsbygoogle";
  ins.style.display = "block";
  ins.style.width = "300px";
  ins.style.height = "250px";
  ins.style.margin = "0 auto";
  ins.dataset.adClient = ADS_CONFIG.publisherId;
  ins.dataset.adSlot = ADS_CONFIG.interstitialSlot;
  container.appendChild(ins);

  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (e) {
    console.log("[Ads] Interstitial push error:", e);
  }

  overlay.classList.remove("hidden");

  // Auto-dismiss after 5 seconds, or let user close
  const closeBtn = document.getElementById("ad-interstitial-close");
  const timer = document.getElementById("ad-interstitial-timer");
  let countdown = 5;
  timer.textContent = countdown;
  closeBtn.disabled = true;
  closeBtn.style.opacity = "0.4";

  const interval = setInterval(() => {
    countdown--;
    timer.textContent = countdown;
    if (countdown <= 0) {
      clearInterval(interval);
      closeBtn.disabled = false;
      closeBtn.style.opacity = "1";
      timer.textContent = "";
    }
  }, 1000);

  closeBtn.onclick = () => {
    if (!closeBtn.disabled) {
      clearInterval(interval);
      overlay.classList.add("hidden");
    }
  };
}

// ============================================================
// Export for game.js to call
// ============================================================
window.BlockDokuAds = {
  init: initAds,
  tryShowInterstitial: tryShowInterstitial,
};
