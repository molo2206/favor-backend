export function sanitizeUser(user: any) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}
