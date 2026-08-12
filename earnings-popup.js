import { auth, db } from '/firebase.js'; // Points to root firebase.js
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, getDoc, setDoc, onSnapshot, increment } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

let secondsPlayed = 0;
let rate = 0; // rate per second
let sessionEarnings = 0;
let initialBalance = 0;
let timerInterval = null;
let userDocRef = null;

// Inject CSS styles for floating widget
const style = document.createElement('style');
style.innerHTML = `
  #earnings-widget {
    position: fixed;
    top: 15px;
    right: 15px;
    background: rgba(0, 0, 0, 0.85);
    border: 2px solid greenyellow;
    border-radius: 8px;
    color: white;
    padding: 10px 15px;
    font-family: sans-serif;
    font-size: 13px;
    z-index: 999999;
    box-shadow: 0 4px 10px rgba(0,0,0,0.5);
    min-width: 160px;
    user-select: none;
  }
  #earnings-widget .title {
    color: greenyellow;
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 5px;
    border-bottom: 1px solid #333;
    padding-bottom: 3px;
  }
  #earnings-widget .stat {
    display: flex;
    justify-content: space-between;
    margin: 4px 0;
  }
  #earnings-widget .value {
    font-weight: bold;
    font-family: monospace;
  }
  #earnings-widget .earned { color: #50fa7b; }
  #earnings-widget .balance { color: #f1fa8c; }
`;
document.head.appendChild(style);

// Create Widget UI Element
const widget = document.createElement('div');
widget.id = 'earnings-widget';
widget.innerHTML = `
  <div class="title">Live Earnings</div>
  <div class="stat"><span>Time:</span> <span id="ew-time" class="value">00:00</span></div>
  <div class="stat"><span>Earned:</span> <span id="ew-earned" class="value earned">0.0000</span></div>
  <div class="stat"><span>Balance:</span> <span id="ew-balance" class="value balance">Loading...</span></div>
`;
document.body.appendChild(widget);

// Auth & Realtime Sync Setup
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = '../login.html';
    return;
  }

  userDocRef = doc(db, 'users', user.uid);

  // 1. Fetch earning rate from Firestore
  try {
    // Try games/settings/rate/default
    let rateSnap = await getDoc(doc(db, 'games', 'settings', 'rate', 'default'));
    if (rateSnap.exists()) {
      rate = rateSnap.data().rate || 0;
    } else {
      // Fallback 1: games/settings/rate
      rateSnap = await getDoc(doc(db, 'games', 'settings', 'rate'));
      if (rateSnap.exists()) {
        rate = rateSnap.data().rate || 0;
      } else {
        // Fallback 2: games/settings
        rateSnap = await getDoc(doc(db, 'games', 'settings'));
        rate = rateSnap.exists() ? (rateSnap.data().rate || 0) : 0;
      }
    }
  } catch (err) {
    console.error('Error fetching rate:', err);
  }

  // 2. Initial balance load & listener
  let isFirstLoad = true;
  onSnapshot(userDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const dbBalance = docSnap.data().balance || 0;
      if (isFirstLoad) {
        initialBalance = dbBalance;
        isFirstLoad = false;
      }
      // Keep total balance display consistent (Initial DB Balance + Session Earned)
      document.getElementById('ew-balance').textContent = (initialBalance + sessionEarnings).toFixed(4);
    } else {
      setDoc(userDocRef, { balance: 0 }, { merge: true });
      initialBalance = 0;
      document.getElementById('ew-balance').textContent = '0.0000';
    }
  });

  // 3. Start gameplay timer & synchronization
  startEarningTimer();
});

function startEarningTimer() {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    // Stop tracking time if user switches tabs
    if (document.hidden) return;

    secondsPlayed++;
    sessionEarnings = secondsPlayed * rate;

    // Format & Update UI Elements
    const mins = String(Math.floor(secondsPlayed / 60)).padStart(2, '0');
    const secs = String(secondsPlayed % 60).padStart(2, '0');
    
    document.getElementById('ew-time').textContent = `${mins}:${secs}`;
    document.getElementById('ew-earned').textContent = sessionEarnings.toFixed(4);
    document.getElementById('ew-balance').textContent = (initialBalance + sessionEarnings).toFixed(4);

    // Sync to Firestore every 5 seconds to prevent rate-limit throttling
    if (rate > 0 && userDocRef && secondsPlayed % 5 === 0) {
      setDoc(userDocRef, {
        balance: increment(rate * 5),
        timeSpent: increment(5)
      }, { merge: true }).catch(err => console.error('Firestore sync error:', err));
    }
  }, 1000);
}
