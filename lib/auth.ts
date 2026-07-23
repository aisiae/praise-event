import { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";

export async function requireAdmin(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new Error("관리자 로그인이 필요합니다.");

  const decoded = await getAdminAuth().verifyIdToken(token);
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!decoded.email || !allowed.includes(decoded.email.toLowerCase())) {
    throw new Error("관리자 권한이 없습니다.");
  }
  return decoded;
}
