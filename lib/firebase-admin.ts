import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`환경변수 ${name}이 설정되지 않았습니다.`);
  return value;
}

function getAdminApp() {
  return (
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: required("FIREBASE_PROJECT_ID"),
        clientEmail: required("FIREBASE_CLIENT_EMAIL"),
        privateKey: required("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
      }),
    })
  );
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}
