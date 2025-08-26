// firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBPHNPB2k5YYoCnCsny2sp9YAB5Ss5pxWQ",
  authDomain: "runcheck-567a3.firebaseapp.com",
  projectId: "runcheck-567a3",
  storageBucket: "runcheck-567a3.firebasestorage.app",
  messagingSenderId: "1070301079584",
  appId: "1:1070301079584:web:6a304a79776bc6ca493445",
  measurementId: "G-8XEHJJF8TY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
