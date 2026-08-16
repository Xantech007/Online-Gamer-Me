import { auth, db } from '/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, getDoc, getDocs, collection, setDoc, onSnapshot, increment } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

let secondsPlayed = 0;
let sessionEarnings = 0;

// Track pending unsynced units separately
let unsyncedSeconds = 0;
let unsyncedEarnings = 0;

let rate = 0; 
let currentDbBalance = 0;
let currentDbGameTime = 0;
let timerInterval = null;
let userDocRef = null;

function formatDisplayTime(totalSeconds) {
  if (totalSeconds < 60) return `${totalSeconds} secs`;
  const mins = Math.floor(totalSeconds / 60);
  if (mins < 60) {
    const secs = totalSeconds % 60;
    return secs > 0 ? `${mins} mins ${secs} secs` : `${mins} mins`;
  }
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs} hrs ${remMins} mins` : `${hrs} hrs`;
}

// Inject CSS Styles
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
  #earnings-widget-body.minimized { display: none; }
`;
document.head.appendChild(style);

// Build Widget UI
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

// Widget UI Action Listeners
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
  syncToFirestoreSync();
  window.location.href = '../index.html';
});

// Dragging Logic
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
  let newLeft = Math.max(0, Math.min(clientX - offsetX, window.innerWidth - widget.offsetWidth));
  let newTop = Math.max(0, Math.min(clientY - offsetY, window.innerHeight - widget.offsetHeight));
  widget.style.left = `${newLeft}px`;
  widget.style.top = `${newTop}px`;
}

function stopDrag() { isDragging = false; }

header.addEventListener('mousedown', startDrag);
document.addEventListener('mousemove', moveDrag);
document.addEventListener('mouseup', stopDrag);
header.addEventListener('touchstart', startDrag, { passive: true });
document.addEventListener('touchmove', moveDrag, { passive: true });
document.addEventListener('touchend', stopDrag);

function parseRateFromDoc(docData) {
  if (!docData) return null;
  const rawRate = docData.rate ?? docData.value ?? docData.amount;
  if (rawRate !== undefined && rawRate !== null) {
    const parsed = parseFloat(rawRate);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

// Sync execution helper
async function syncToFirestoreSync() {
  if (!userDocRef || unsyncedSeconds <= 0) return;

  const secondsToSync = unsyncedSeconds;
  const earningsToSync = unsyncedEarnings;

  // Deduct before async call to avoid double syncing
  unsyncedSeconds -= secondsToSync;
  unsyncedEarnings -= earningsToSync;

  try {
    await setDoc(userDocRef, {
      balance: increment(earningsToSync),
      gameTime: increment(secondsToSync)
    }, { merge: true });
  } catch (err) {
    console.error('Firestore sync error:', err);
    // Restore unsynced delta on failure
    unsyncedSeconds += secondsToSync;
    unsyncedEarnings += earningsToSync;
  }
}

// Ensure pending progress syncs before window closes
window.addEventListener('beforeunload', () => {
  syncToFirestoreSync();
});

// Auth & Realtime Setup
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = '../login.html';
    return;
  }

  userDocRef = doc(db, 'users', user.uid);

  // 1. Fetch Rate
  try {
    const rateColRef = collection(db, 'games', 'settings', 'rate');
    const rateColSnap = await getDocs(rateColRef);

    if (!rateColSnap.empty) {
      for (const docItem of rateColSnap.docs) {
        const foundRate = parseRateFromDoc(docItem.data());
        if (foundRate !== null) {
          rate = foundRate;
          break;
        }
      }
    }

    if (rate === 0) {
      const docSnap = await getDoc(doc(db, 'games', 'settings'));
      if (docSnap.exists()) {
        const foundRate = parseRateFromDoc(docSnap.data());
        if (foundRate !== null) rate = foundRate;
      }
    }

    if (rate <= 0) rate = 1.37; // Default rate
  } catch (err) {
    console.error('Error fetching rate, applying fallback rate:', err);
    rate = 1.37;
  }

  // 2. Real-time Firestore Snapshot
  onSnapshot(userDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      currentDbBalance = parseFloat(data.balance) || 0;
      currentDbGameTime = parseInt(data.gameTime) || 0;
    } else {
      setDoc(userDocRef, { balance: 0, gameTime: 0 }, { merge: true });
      currentDbBalance = 0;
      currentDbGameTime = 0;
    }
    updateUI();
  });

  // 3. Start Timer
  startEarningTimer();
});

function updateUI() {
  const displayBalance = currentDbBalance + unsyncedEarnings;
  const displayTime = currentDbGameTime + unsyncedSeconds;

  document.getElementById('ew-balance').textContent = `GHS ${displayBalance.toFixed(4)}`;
  document.getElementById('ew-time').textContent = formatDisplayTime(displayTime);
  document.getElementById('ew-earned').textContent = `GHS ${sessionEarnings.toFixed(4)}`;
}

function startEarningTimer() {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    if (document.hidden) return;

    secondsPlayed++;
    unsyncedSeconds++;

    sessionEarnings += rate;
    unsyncedEarnings += rate;

    updateUI();

    // Sync to Firestore every 10 seconds
    if (unsyncedSeconds >= 10) {
      syncToFirestoreSync();
    }
  }, 1000);
}
