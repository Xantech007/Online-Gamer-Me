import { auth, db } from '/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, getDoc, getDocs, collection, setDoc, onSnapshot, increment } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Restore state from LocalStorage if available
let secondsPlayed = parseInt(localStorage.getItem('secondsPlayed')) || 0;
let sessionEarnings = parseFloat(localStorage.getItem('sessionEarnings')) || 0;
let rate = 0; // rate per second
let initialBalance = 0;
let initialGameTime = 0;
let timerInterval = null;
let userDocRef = null;

// Helper function to format time into secs, mins, or hrs string
function formatDisplayTime(totalSeconds) {
  if (totalSeconds < 60) {
    return `${totalSeconds} secs`;
  }
  const mins = Math.floor(totalSeconds / 60);
  if (mins < 60) {
    const secs = totalSeconds % 60;
    return secs > 0 ? `${mins} mins ${secs} secs` : `${mins} mins`;
  }
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs} hrs ${remMins} mins` : `${hrs} hrs`;
}

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
    min-width: 180px;
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
  <div class="stat"><span>Time:</span> <span id="ew-time" class="value">0 secs</span></div>
  <div class="stat"><span>Earned:</span> <span id="ew-earned" class="value earned">GHS 0.0000</span></div>
  <div class="stat"><span>Balance:</span> <span id="ew-balance" class="value balance">Loading...</span></div>
`;
document.body.appendChild(widget);

// Helper function to extract rate from any document snapshot
function parseRateFromDoc(docData) {
  if (!docData) return null;
  const rawRate = docData.rate ?? docData.value ?? docData.amount;
  if (rawRate !== undefined && rawRate !== null) {
    const parsed = parseFloat(rawRate);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

// Auth & Realtime Sync Setup
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = '../login.html';
    return;
  }

  userDocRef = doc(db, 'users', user.uid);

  // 1. Fetch earning rate from `games/settings/rate` collection or doc
  try {
    const rateColRef = collection(db, 'games', 'settings', 'rate');
    const rateColSnap = await getDocs(rateColRef);

    if (!rateColSnap.empty) {
      for (const docItem of rateColSnap.docs) {
        const foundRate = parseRateFromDoc(docItem.data());
        if (foundRate !== null) {
          rate = foundRate;
          console.log('Rate loaded from collection games/settings/rate:', rate);
          break;
        }
      }
    }

    if (rate === 0) {
      const docSnap = await getDoc(doc(db, 'games', 'settings'));
      if (docSnap.exists()) {
        const foundRate = parseRateFromDoc(docSnap.data());
        if (foundRate !== null) {
          rate = foundRate;
          console.log('Rate loaded from document games/settings:', rate);
        }
      }
    }

    if (rate <= 0) {
      console.warn('Firestore rate returned 0 or empty. Using default rate: 0.001');
      rate = 0.001; 
    }
  } catch (err) {
    console.error('Error fetching rate from Firestore, applying fallback rate:', err);
    rate = 0.001; 
  }

  // 2. Initial balance & gameTime load & listener
  let isFirstLoad = true;
  onSnapshot(userDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      const dbBalance = parseFloat(data.balance) || 0;
      const dbGameTime = parseInt(data.gameTime) || 0;

      if (isFirstLoad) {
        initialBalance = dbBalance;
        initialGameTime = dbGameTime;
        isFirstLoad = false;
      }
      document.getElementById('ew-balance').textContent = `GHS ${(initialBalance + sessionEarnings).toFixed(4)}`;
      document.getElementById('ew-time').textContent = formatDisplayTime(initialGameTime + secondsPlayed);
    } else {
      setDoc(userDocRef, { balance: 0, gameTime: 0 }, { merge: true });
      initialBalance = 0;
      initialGameTime = 0;
      document.getElementById('ew-balance').textContent = 'GHS 0.0000';
      document.getElementById('ew-time').textContent = '0 secs';
    }
  });

  // 3. Start gameplay timer & synchronization
  startEarningTimer();
});

function startEarningTimer() {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    if (document.hidden) return;

    secondsPlayed++;
    sessionEarnings = secondsPlayed * rate;

    // 1. UPDATE LOCAL STORAGE (Every 1 second)
    localStorage.setItem('secondsPlayed', secondsPlayed);
    localStorage.setItem('sessionEarnings', sessionEarnings.toFixed(4));

    // Format & Update UI Elements
    document.getElementById('ew-time').textContent = formatDisplayTime(initialGameTime + secondsPlayed);
    document.getElementById('ew-earned').textContent = `GHS ${sessionEarnings.toFixed(4)}`;
    document.getElementById('ew-balance').textContent = `GHS ${(initialBalance + sessionEarnings).toFixed(4)}`;

    // 2. UPDATE FIRESTORE (Every 10 seconds)
    if (rate > 0 && userDocRef && secondsPlayed % 10 === 0) {
      setDoc(userDocRef, {
        balance: increment(rate * 10),
        gameTime: increment(10)
      }, { merge: true }).catch(err => console.error('Firestore sync error:', err));
    }
  }, 1000);
}
