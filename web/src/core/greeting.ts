// Time-of-day greeting, matching the Android app (ui/chat/Greeting.kt). Licensed under GPL-3.0.

export const MAX_NAME_LENGTH = 40;

export function greetingFor(hour: number, name: string): string {
  const n = name.trim();
  if (!n) return 'Welcome to 0x Sneaky Alpha.';
  if (hour >= 5 && hour <= 11) return `Good morning, ${n}`;
  if (hour >= 12 && hour <= 16) return `Good afternoon, ${n}`;
  if (hour >= 17 && hour <= 21) return `Good evening, ${n}`;
  return `Hey, ${n}`;
}

export function cleanName(value: string): string {
  return value.trim().slice(0, MAX_NAME_LENGTH);
}
