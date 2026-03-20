import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// KHUNG CẤU HÌNH FIREBASE (Vui lòng điền thông tin của bạn vào đây)
// Lưu ý: Thay thế các giá trị dưới đây bằng thông tin từ Firebase Console của bạn.
const firebaseConfig = {
  apiKey: "AIzaSyBgY6TWckIzxdWH4d7AOFtwSy8zIb58Dxs",
  authDomain: "o-chu-ky-dieu-6.firebaseapp.com",
  databaseURL: "https://o-chu-ky-dieu-6-default-rtdb.asia-southeast1.firebasedatabase.app", 
  projectId: "o-chu-ky-dieu-6",
  storageBucket: "o-chu-ky-dieu-6.firebasestorage.app",
  messagingSenderId: "497810863603",
  appId: "1:497810863603:web:f3f4ae2cdaf28e1794ce86"
};

export const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

// Khởi tạo Firebase (chỉ khi đã cấu hình)
const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;

// Khởi tạo Realtime Database
export const db = app ? getDatabase(app) : null;

