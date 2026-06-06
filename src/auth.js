import { createHash } from "node:crypto";

export function hashPassword(password) {
  return createHash("sha256").update(`pitchpick:${password}`).digest("hex");
}

export function defaultPasswordForRole(role) {
  return role === "ADMIN" ? "admin123" : "player123";
}

export function ensureUserPassword(user) {
  if (!user.passwordHash) {
    user.passwordHash = hashPassword(defaultPasswordForRole(user.role));
  }
  return user;
}

export function verifyPassword(user, password) {
  ensureUserPassword(user);
  return user.passwordHash === hashPassword(password);
}
