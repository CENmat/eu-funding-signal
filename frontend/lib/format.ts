function parseIsoDate(value: string) {
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  if (!match) {
    return undefined;
  }
  const parsed = new Date(`${match[0]}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function formatDate(value: string) {
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-GB", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function getDaysToDeadline(value: string) {
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return undefined;
  }
  const currentDate = new Date();
  const today = Date.UTC(
    currentDate.getUTCFullYear(),
    currentDate.getUTCMonth(),
    currentDate.getUTCDate(),
  );
  const target = Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
  );
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

export function formatDeadlineStatus(value: string) {
  const days = getDaysToDeadline(value);
  if (days === undefined) {
    return "Deadline unavailable";
  }
  if (days < 0) {
    return "Deadline passed";
  }
  if (days === 0) {
    return "Due today";
  }
  if (days === 1) {
    return "1 day left";
  }
  return `${days} days left`;
}
