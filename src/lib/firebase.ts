// src/lib/firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
// import { getAnalytics } from 'firebase/analytics'; // Uncomment if you enabled Analytics
import { getAuth } from 'firebase/auth';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDjZJCpcOWPmWp00TIbZ_NR6dVqLsoo0Ho",
  authDomain: "gg-poc-ca3b8.firebaseapp.com",
  projectId: "gg-poc-ca3b8",
  storageBucket: "gg-poc-ca3b8.firebasestorage.app",
  messagingSenderId: "395766765015",
  appId: "1:395766765015:web:d7a16c23740af231a96792"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app); // Uncomment if you enabled Analytics
const auth = getAuth(app);
// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);

export { db, app, auth };