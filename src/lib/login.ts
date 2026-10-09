export function loginEmail(identifier: string) {
  const value = identifier.trim();
  return value.toLowerCase() === "admin" ? "admin@trip.local" : value;
}
