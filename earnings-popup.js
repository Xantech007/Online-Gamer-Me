import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, onSnapshot, updateDoc, increment, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Replace with your Firebase config credentials
const firebaseConfig = {
  apiKey: "AIzaSyDVK9uMHRCbxOkO7U696v7runiRB0MNXi0",
  authDomain: "gameware-emma.firebaseapp.com",
  projectId: "gameware-emma",
  storageBucket: "gameware-emma.firebasestorage.app",
  messagingSenderId: "476632021558",
  appId: "1:476632021558:web:d27c0bfe7ad590e9ca7697",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

(function () {
  console.log("Earnings Popup Initializing...");

  // Inject UI Styles directly into page
  const style = document.createElement('style');
  style.textContent = `
    #earnings-widget {
      position: fixed;
      top: 15px;
      right: 15px;
      z-index: 999999;
      background: rgba(18, 18, 18, 0.95);
      border: 1px solid #333;
      border-left: 4px solid greenyellow;
      border-radius: 8px;
      padding: 12px 16px;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(6px);
      min-width: 180px;
      display: none;
      user-select: none;
    }
    #earnings-widget .title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #888;
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #earnings-widget .status-dot {
      width: 8px;
      height: 8px;
      background-color: greenyellow;
      border-radius: 50%;
      box-shadow: 0 0 8px greenyellow;
    }
    #earnings-widget .status-dot.paused {
      background-color: #ff4d4d;
      box-shadow: 0 0 8px #ff4d4d;
    }
    #earnings-widget .stat-row {
      display: flex;
      justify-content: space-between;
      margin-top: 4px;
      font-size: 13px;
    }
    #earnings-widget .stat-value {
      font-weight: 700;
      color: greenyellow;
      font-family: monospace;
    }
  `;
  document.head.appendChild(style);

  // Inject Widget DOM Elements
  const widget = document.createElement('div');
  widget.id = 'earnings-widget';
  widget.innerHTML = `
    <div class="title">
      <span>Live Earnings</span>
      <span id="status-indicator" class="status-dot"></span>
    </div>
    <div class="stat-row">
      <span>Session:</span>
      <span id="session-earned" class="stat-value">$0.0000</span>
    </div>
    <div class="stat-row">
      <span>Balance:</span>
      <span id="total-balance" class="stat-value">$0.0000</span>
    </div>
    <div class="stat-row" style="font-size: 11px; color: #888; margin-top: 4px;">
      <span>Time:</span>
      <span id="played-time" style="color: #ccc;">0s</span>
    </div>
  `;
  document.body.appendChild(widget);

  // State Variables
  let currentUser = null;
  let ratePerSecond = 0.001; // Default fallback ($0.001/sec) to ensure timer starts
  let activeSeconds = 0;
  let sessionEarnings = 0;
  let baseBalance = 0;
  let isTabActive = true;
  let timerInterval = null;
  let unsubscribeUser = null;

  const sessionEarnedEl = document.getElementById('session-earned');
  const totalBalanceEl = document.getElementById('total-balance');
  const timeEl = document.getElementById('played-time');
  const statusDot = document.getElementById('status-indicator');

  // Try multiple Firestore paths for the rate to ensure compatibility
  async function fetchEarningRate() {
    try {
      // Check Path 1: games/settings/rate
      let rateDocRef = doc(db, 'games', 'settings', 'rate');
      let rateSnap = await getDoc(rateDocRef);

      if (rateSnap.exists() && rateSnap.data().rate !== undefined) {
        ratePerSecond = parseFloat(rateSnap.data().rate) || ratePerSecond;
        console.log("Rate loaded from games/settings/rate:", ratePerSecond);
        return;
      }

      // Check Path 2: games/settings (where 'rate' is a field inside 'settings')
      rateDocRef = doc(db, 'games', 'settings');
      rateSnap = await getDoc(rateDocRef);

      if (rateSnap.exists() && rateSnap.data().rate !== undefined) {
        ratePerSecond = parseFloat(rateSnap.data().rate) || ratePerSecond;
        console.log("Rate loaded from games/settings:", ratePerSecond);
        return;
      }

      console.warn("Could not locate rate in Firestore. Using fallback rate:", ratePerSecond);
    } catch (err) {
      console.error("Error fetching rate, defaulting to fallback:", err);
    }
  }

  // Monitor Window Focus
  document.addEventListener('visibilitychange', () => {
    isTabActive = !document.hidden;
    if (statusDot) statusDot.classList.toggle('paused', !isTabActive);
  });

  // Start Realtime Counter
  function startTracking() {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
      if (!isTabActive || !currentUser) return;

      activeSeconds++;
      sessionEarnings += ratePerSecond;

      // Update UI
      if (timeEl) timeEl.textContent = `${activeSeconds}s`;
      if (sessionEarnedEl) sessionEarnedEl.textContent = `$${sessionEarnings.toFixed(4)}`;
      if (totalBalanceEl) totalBalanceEl.textContent = `$${(baseBalance + sessionEarnings).toFixed(4)}`;

      // Sync with Firestore every 5 seconds
      if (activeSeconds % 5 === 0) {
        syncToDatabase(ratePerSecond * 5);
      }
    }, 1000);
  }

  // Safe Database Update
  async function syncToDatabase(amountToIncrement) {
    if (!currentUser) return;
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      // Use setDoc with merge: true so it creates fields if they don't exist yet
      await setDoc(userRef, {
        balance: increment(amountToIncrement),
        timeSpent: increment(5)
      }, { merge: true });
    } catch (err) {
      console.error('Failed to sync live earnings:', err);
    }
  }

  // Auth Listener
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("Auth user confirmed:", user.uid);
      currentUser = user;
      widget.style.display = 'block';

      await fetchEarningRate();

      // Realtime User Balance Listener
      const userRef = doc(db, 'users', currentUser.uid);
      unsubscribeUser = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          baseBalance = parseFloat(data.balance) || 0;
          if (totalBalanceEl) {
            totalBalanceEl.textContent = `$${(baseBalance + sessionEarnings).toFixed(4)}`;
          }
        }
      });

      startTracking();
    } else {
      console.warn("User logged out. Hiding popup.");
      widget.style.display = 'none';
      if (timerInterval) clearInterval(timerInterval);
      if (unsubscribeUser) unsubscribeUser();
    }
  });
})();
