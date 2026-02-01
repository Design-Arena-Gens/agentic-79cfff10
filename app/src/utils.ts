import type { CredentialRecord, MessageRecord, StrengthLevel } from "./types";

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const LETTERS_UPPER = LETTERS.toUpperCase();
const NUMBERS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?";

export const EMAIL_DOMAINS = [
  "guerrillamail.com",
  "mailinator.com",
  "tempmail.org",
  "10minutemail.com",
  "maildrop.cc",
  "inboxkitten.com",
  "dispostable.com",
  "temp-mail.io",
  "yopmail.com",
  "mintemail.com",
  "fakeinbox.com",
  "mailcatch.com"
];

const phoneticPrefixes = [
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "gamma",
  "helios",
  "ion",
  "juno",
  "kilo",
  "lima",
  "nova",
  "orion",
  "pluto",
  "quantum"
];

export const randomInt = (min: number, max: number): number => {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const range = max - min + 1;
  return min + (array[0] % range);
};

const randomChar = (source: string) => {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return source[array[0] % source.length];
};

export const generateRandomEmail = (): string => {
  const localLength = randomInt(8, 12);
  let local = phoneticPrefixes[randomInt(0, phoneticPrefixes.length - 1)];
  while (local.length < localLength) {
    const set = randomInt(0, 1) === 0 ? LETTERS : NUMBERS;
    local += randomChar(set);
  }
  return `${local}@${EMAIL_DOMAINS[randomInt(0, EMAIL_DOMAINS.length - 1)]}`;
};

const passwordHasRequirements = (password: string): boolean => {
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  return hasUpper && hasLower && hasNumber && hasSymbol;
};

export const generateSecurePassword = (): string => {
  const length = randomInt(12, 16);
  const allChars = LETTERS + LETTERS_UPPER + NUMBERS + SYMBOLS;
  let password = "";
  while (password.length < length) {
    password += randomChar(allChars);
  }
  if (!passwordHasRequirements(password)) {
    return generateSecurePassword();
  }
  return password;
};

export const evaluateStrength = (password: string): StrengthLevel => {
  let score = 0;
  const uniqueChars = new Set(password).size;
  if (password.length >= 12) score += 1;
  if (password.length >= 14) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^\w]/.test(password)) score += 1;
  if (uniqueChars >= password.length - 2) score += 1;

  if (score <= 3) return "weak";
  if (score <= 5) return "medium";
  return "strong";
};

export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  });
};

export const extractOtp = (text: string): string | null => {
  const match = text.match(/\b\d{4}\b|\b\d{6}\b|\b\d{8}\b/);
  return match ? match[0] : null;
};

export const calculateStorageUsage = (
  credentials: CredentialRecord[],
  messages: MessageRecord[]
): string => {
  const bytes =
    new Blob([JSON.stringify(credentials), JSON.stringify(messages)]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const normalizeText = (value: string): string =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
