// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAErOMhI2wWc7gyFlExOb7DXLgSsAlQW3Y",
  authDomain: "online-gamer-me.firebaseapp.com",
  projectId: "online-gamer-me",
  storageBucket: "online-gamer-me.firebasestorage.app",
  messagingSenderId: "717118566143",
  appId: "1:717118566143:web:f227c8a43a2c1ad2d0e6ca"
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize & Export Auth and Firestore services
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
