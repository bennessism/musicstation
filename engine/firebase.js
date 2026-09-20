import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD61vOfnwsbYKA-3waF_u1dqY1LPIOS6vQ",
  authDomain: "bennessism-stn.firebaseapp.com",
  projectId: "bennessism-stn",
  storageBucket: "bennessism-stn.firebasestorage.app",
  messagingSenderId: "446037644669",
  appId: "1:446037644669:web:cee356e46fe570ce8ae814",
  measurementId: "G-KM09PHJWHD",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
