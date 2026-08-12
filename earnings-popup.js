import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, getDoc, onSnapshot, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

(function () {
  // Inject CSS Styles for Floating Widget
  const style = document.createElement('style');
  style.textContent = `
    #earnings-widget {
      position: fixed;
      top: 15px;
      right: 15px;
      z-index: 99999;
      background: rgba(18, 18, 18, 0.92);
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

  // Create UI Container
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
  let ratePerSecond = 0; // Default rate
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

  // Fetch Earning Rate from Firestore document: games/settings/rate
  async function fetchEarningRate() {
    try {
      const rateDocRef = doc(db, 'games', 'settings', 'rate');
      const rateSnap = await getDoc(rateDocRef);
      if (rateSnap.exists() && rateSnap.data().rate) {
        ratePerSecond = parseFloat(rateSnap.data().rate) || 0;
      } else {
        console.warn('Earning rate document not found or missing "rate" field.');
      }
    } catch (err) {
      console.error('Error fetching rate:', err);
    }
  }

  // Handle Tab Focus & Visibility (Stop earning when tab is inactive)
  document.addEventListener('visibilitychange', () => {
    isTabActive = !document.hidden;
    updateStatusIndicator();
  });
  window.addEventListener('blur', () => {
    isTabActive = false;
    updateStatusIndicator();
  });
  window.addEventListener('focus', () => {
    isTabActive = true;
    updateStatusIndicator();
  });

  function updateStatusIndicator() {
    if (isTabActive) {
      statusDot.classList.remove('paused');
    } else {
      statusDot.classList.add('paused');
    }
  }

  // Start Realtime Session Tracker
  function startTracking() {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(async () => {
      if (!isTabActive || !currentUser || ratePerSecond <= 0) return;

      activeSeconds++;
      sessionEarnings += ratePerSecond;

      // Update UI Display
      sessionEarnedEl.textContent = `$${sessionEarnings.toFixed(4)}`;
      totalBalanceEl.textContent = `$${(baseBalance + sessionEarnings).toFixed(4)}`;
      timeEl.textContent = `${activeSeconds}s`;

      // Sync with Firestore every 5 seconds or immediately on first second
      if (activeSeconds % 5 === 0) {
        syncToDatabase(ratePerSecond * 5);
      }
    }, 1000);
  }

  // Realtime Sync to Firestore User Document
  async function syncToDatabase(amountToIncrement) {
    if (!currentUser) return;
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        balance: increment(amountToIncrement),
        timeSpent: increment(5)
      });
    } catch (err) {
      console.error('Failed to sync earnings:', err);
    }
  }

  // Auth Listener
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      widget.style.display = 'block';

      await fetchEarningRate();

      // Realtime listener for User's Balance in Firestore
      const userRef = doc(db, 'users', currentUser.uid);
      unsubscribeUser = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          baseBalance = parseFloat(data.balance) || 0;
          totalBalanceEl.textContent = `$${(baseBalance + sessionEarnings).toFixed(4)}`;
        }
      });

      startTracking();
    } else {
      // Hide widget if user is logged out
      widget.style.display = 'none';
      if (timerInterval) clearInterval(timerInterval);
      if (unsubscribeUser) unsubscribeUser();
    }
  });
})();
