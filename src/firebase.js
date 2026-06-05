import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; 

const firebaseConfig = {
  apiKey: "AIzaSyDucdRrkYezPjjzZ250pqZUovb3B8MO5lg",
  authDomain: "pyidline2crew-41022.firebaseapp.com",
  projectId: "pyidline2crew-41022",
  storageBucket: "pyidline2crew-41022.firebasestorage.app",
  messagingSenderId: "783173298649",
  appId: "1:783173298649:web:f3283c39f648a6481c51c8",
  measurementId: "G-MZ63RZPQD2"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);