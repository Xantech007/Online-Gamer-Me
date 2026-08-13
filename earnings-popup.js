import { auth, db } from '/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, getDoc, getDocs, collection, setDoc, onSnapshot, increment } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Reset session state on EVERY page load (Start from 0)
localStorage.removeItem('secondsPlayed');
localStorage.removeItem('sessionEarnings');

let secondsPlayed = 0;
let sessionEarnings = 0;
let sessionEarningsSinceLastSync = 0; // Tracks unsynced earnings for UI balance

let rate = 0; // rate per second
let currentDbBalance = 0;
let currentDbGameTime = 0;
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

// Inject CSS styles for floating widget, draggable header, and controls
const style = document.createElement('style');
style.innerHTML = `
  #earnings-widget {
    position: fixed;
    top: 15px;
    right: 15px;
    background: rgba(0, 0, 0, 0.90);
    border: 2px solid greenyellow;
    border-radius: 8px;
    color: white;
    padding: 10px 12px;
    font-family: sans-serif;
    font-size: 13px;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.6);
    min-width: 190px;
    user-select: none;
    touch-action: none;
  }
  #earnings-widget-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: move;
    border-bottom: 1px solid #333;
    padding-bottom: 6px;
    margin-bottom: 8px;
  }
  #earnings-widget .title {
    color: greenyellow;
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
    pointer-events: none;
  }
  #earnings-widget .controls {
    display: flex;
    gap: 6px;
  }
  #earnings-widget .btn-ctrl {
    background: #222;
    border: 1px solid #444;
    color: #ccc;
    font-size: 10px;
    border-radius: 3px;
    cursor: pointer;
    padding: 2px 6px;
    line-height: 1;
    transition: all 0.2s ease;
  }
  #earnings-widget .btn-ctrl:hover {
    background: greenyellow;
    color: black;
    border-color: greenyellow;
  }
  #earnings-widget .btn-exit {
    border-color: #ff4d4d;
    color: #ff4d4d;
  }
  #earnings-widget .btn-exit:hover {
    background: #ff4d4d;
    color: white;
    border-color: #ff4d4d;
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
  #earnings-widget-body.minimized {
    display: none;
  }
`;
document.head.appendChild(style);

// Create Widget UI Element with Controls
const widget = document.createElement('div');
widget.id = 'earnings-widget';
widget.innerHTML = `
  <div id="earnings-widget-header">
    <span class="title">Live Earnings</span>
    <div class="controls">
      <button id="ew-min-btn" class="btn-ctrl" title="Minimize / Expand">—</button>
      <button id="ew-exit-btn" class="btn-ctrl btn-exit" title="Exit Game">Exit</button>
    </div>
  </div>
  <div id="earnings-widget-body">
    <div class="stat"><span>Time:</span> <span id="ew-time" class="value">0 secs</span></div>
    <div class="stat"><span>Earned:</span> <span id="ew-earned" class="value">GHS 0.0000</span></div>
    <div class="stat"><span>Balance:</span> <span id="ew-balance" class="value balance">Loading...</span></div>
  </div>
`;
document.body.appendChild(widget);

// Minimize & Exit Actions
const minBtn = document.getElementById('ew-min-btn');
const exitBtn = document.getElementById('ew-exit-btn');
const widgetBody = document.getElementById('earnings-widget-body');

minBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  widgetBody.classList.toggle('minimized');
  minBtn.textContent = widgetBody.classList.contains('minimized') ? '+' : '—';
});

exitBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  window.location.href = '../index.html';
});

// Drag and Drop Logic (Mouse & Touch support)
let isDragging = false;
let offsetX = 0;
let offsetY = 0;

const header = document.getElementById('earnings-widget-header');

function startDrag(e) {
  isDragging = true;
  const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
  const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
  
  const rect = widget.getBoundingClientRect();
  offsetX = clientX - rect.left;
  offsetY = clientY - rect.top;
  
  widget.style.right = 'auto';
  widget.style.left = `${rect.left}px`;
  widget.style.top = `${rect.top}px`;
}

function moveDrag(e) {
  if (!isDragging) return;
  const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
  const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

  let newLeft = clientX - offsetX;
  let newTop = clientY - offsetY;

  const maxLeft = window.innerWidth - widget.offsetWidth;
  const maxTop = window.innerHeight - widget.offsetHeight;

  newLeft = Math.max(0, Math.min(newLeft, maxLeft));
  newTop = Math.max(0, Math.min(newTop, maxTop));

  widget.style.left = `${newLeft}px`;
  widget.style.top = `${newTop}px`;
}

function stopDrag() {
  isDragging = false;
}

header.addEventListener('mousedown', startDrag);
document.addEventListener('mousemove', moveDrag);
document.addEventListener('mouseup', stopDrag);

header.addEventListener('touchstart', startDrag, { passive: true });
document.addEventListener('touchmove', moveDrag, { passive: true });
document.addEventListener('touchend', stopDrag);

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

  // 2. Initial balance & gameTime load & realtime listener
  onSnapshot(userDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      currentDbBalance = parseFloat(data.balance) || 0;
      currentDbGameTime = parseInt(data.gameTime) || 0;

      // Update UI incorporating unsynced session additions
      document.getElementById('ew-balance').textContent = `GHS ${(currentDbBalance + sessionEarningsSinceLastSync).toFixed(4)}`;
      document.getElementById('ew-time').textContent = formatDisplayTime(currentDbGameTime + secondsPlayed);
    } else {
      setDoc(userDocRef, { balance: 0, gameTime: 0 }, { merge: true });
      currentDbBalance = 0;
      currentDbGameTime = 0;
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
    const addedValue = rate;
    sessionEarnings += addedValue;
    sessionEarningsSinceLastSync += addedValue;

    // 1. UPDATE LOCAL STORAGE FOR REFERENCE
    localStorage.setItem('secondsPlayed', secondsPlayed);
    localStorage.setItem('sessionEarnings', sessionEarnings.toFixed(4));

    // Update UI Elements dynamically
    document.getElementById('ew-time').textContent = formatDisplayTime(currentDbGameTime + secondsPlayed);
    document.getElementById('ew-earned').textContent = `GHS ${sessionEarnings.toFixed(4)}`;
    document.getElementById('ew-balance').textContent = `GHS ${(currentDbBalance + sessionEarningsSinceLastSync).toFixed(4)}`;

    // 2. SYNC TO FIRESTORE (Every 10 seconds)
    if (rate > 0 && userDocRef && secondsPlayed % 10 === 0) {
      const batchEarnings = rate * 10;
      
      setDoc(userDocRef, {
        balance: increment(batchEarnings),
        gameTime: increment(10)
      }, { merge: true })
      .then(() => {
        // Reset unsynced earnings batch once acknowledged
        sessionEarningsSinceLastSync = Math.max(0, sessionEarningsSinceLastSync - batchEarnings);
      })
      .catch(err => console.error('Firestore sync error:', err));
    }
  }, 1000);
}
