"use client";

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "good morning";
  if (hour >= 12 && hour < 17) return "good afternoon";
  if (hour >= 17 && hour < 21) return "good evening";
  return "good night";
}

export function TimeGreeting() {
  const hour = new Date().getHours();
  return <span>{getGreeting(hour)}</span>;
}
