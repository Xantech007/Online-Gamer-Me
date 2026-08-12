// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDVK9uMHRCbxOkO7U696v7runiRB0MNXi0",
  authDomain: "gameware-emma.firebaseapp.com",
  projectId: "gameware-emma",
  storageBucket: "gameware-emma.firebasestorage.app",
  messagingSenderId: "476632021558",
  appId: "1:476632021558:web:d27c0bfe7ad590e9ca7697",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize & Export Auth and Firestore services
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
