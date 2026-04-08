import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'nauti-sonar-secret-change-me-in-prod'
);
const COOKIE_NAME = 'nauti-session';

export async function createSession() {
  const token = await new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET);

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
}

export async function verifySession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return false;
    await jwtVerify(token, SECRET);
    return true;
  } catch {
    return false;
  }
}

export async function destroySession() {
  (await cookies()).delete(COOKIE_NAME);
}

/**
 * Parse users from AUTH_USERS env var (format: "user1:pass1,user2:pass2")
 * Falls back to AUTH_USERNAME/AUTH_PASSWORD for single-user setup.
 */
function getUsers(): { username: string; password: string }[] {
  const usersEnv = process.env.AUTH_USERS;
  if (usersEnv) {
    return usersEnv.split(',').map((entry) => {
      const [username, password] = entry.trim().split(':');
      return { username, password };
    });
  }
  // Fallback to single-user env vars
  return [{
    username: process.env.AUTH_USERNAME || 'admin',
    password: process.env.AUTH_PASSWORD || 'NautiSonar2024!',
  }];
}

export function validateCredentials(username: string, password: string): boolean {
  const users = getUsers();
  return users.some((u) => u.username === username && u.password === password);
}
