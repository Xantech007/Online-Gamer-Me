import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, getDoc, setDoc, onSnapshot, increment } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

let secondsPlayed = 0;
let rate = 0; // rate per second
let sessionEarnings = 0;
let currentBalance = 0;
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
  <div class="stat"><span>Earned:</span> <span id="ew-earned" class="value earned">0.00</span></div>
  <div class="stat"><span>Balance:</span> <span id="ew-balance" class="value balance">Loading...</span></div>
`;
document.body.appendChild(widget);

// Auth & Realtime Sync Setup (Observes the active shared login session)
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = '../login.html';
    return;
  }

  userDocRef = doc(db, 'users', user.uid);

  // 1. Fetch earning rate from games/settings/rate
  try {
    const rateSnap = await getDoc(doc(db, 'games', 'settings', 'rate', 'default'));
    if (rateSnap.exists()) {
      rate = rateSnap.data().rate || 0;
    } else {
      // Fallback: search doc if stored as settings/rate directly
      const fallbackSnap = await getDoc(doc(db, 'games', 'settings'));
      rate = fallbackSnap.exists() ? (fallbackSnap.data().rate || 0) : 0;
    }
  } catch (err) {
    console.error('Error fetching rate:', err);
  }

  // 2. Realtime listener for User Balance in Firestore
  onSnapshot(userDocRef, (docSnap) => {
    if (docSnap.exists()) {
      currentBalance = docSnap.data().balance || 0;
    } else {
      // Create user document if missing
      setDoc(userDocRef, { balance: 0 }, { merge: true });
      currentBalance = 0;
    }
    document.getElementById('ew-balance').textContent = currentBalance.toFixed(2);
  });

  // 3. Start gameplay timer & balance synchronization
  startEarningTimer();
});

function startEarningTimer() {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    secondsPlayed++;
    sessionEarnings = secondsPlayed * rate;

    // Update Widget UI
    const mins = String(Math.floor(secondsPlayed / 60)).padStart(2, '0');
    const secs = String(secondsPlayed % 60).padStart(2, '0');
    document.getElementById('ew-time').textContent = `${mins}:${secs}`;
    document.getElementById('ew-earned').textContent = sessionEarnings.toFixed(4);

    // Sync incremental earnings to Firestore realtime every second if rate > 0
    if (rate > 0 && userDocRef) {
      setDoc(userDocRef, {
        balance: increment(rate)
      }, { merge: true }).catch(err => console.error('Realtime sync error:', err));
    }
  }, 1000);
}
