export type StrengthLevel = "weak" | "medium" | "strong";

export type CredentialRecord = {
  id: string;
  email: string;
  password: string;
  strength: StrengthLevel;
  timestamp: number;
};

export type MessageRecord = {
  id: string;
  sender: string;
  subject: string;
  body: string;
  otp: string | null;
  timestamp: number;
};

export type ThemeMode = "light" | "dark";

export type AppSettings = {
  theme: ThemeMode;
  language: LanguageCode;
  notifications: boolean;
};

export type ToastState = {
  message: string;
  visible: boolean;
};

export type TranslationKey =
  | "appTitle"
  | "generatorTitle"
  | "emailLabel"
  | "passwordLabel"
  | "strengthLabel"
  | "generateButton"
  | "copyEmail"
  | "copyPassword"
  | "otpInbox"
  | "refresh"
  | "loadMore"
  | "search"
  | "searchPlaceholder"
  | "close"
  | "menu"
  | "dashboard"
  | "totalEmails"
  | "totalMessages"
  | "storageUsage"
  | "history"
  | "credentialsHistory"
  | "messagesHistory"
  | "settings"
  | "theme"
  | "language"
  | "notifications"
  | "enableNotifications"
  | "disableNotifications"
  | "privacyPolicy"
  | "chatbot"
  | "chatbotPlaceholder"
  | "send"
  | "toastCopied"
  | "strengthWeak"
  | "strengthMedium"
  | "strengthStrong"
  | "addToHomeScreen"
  | "install"
  | "otpCopied"
  | "searchEmpty"
  | "lastGenerated"
  | "lastMessage"
  | "newMessage";

export type LanguageCode =
  | "en"
  | "hi"
  | "es"
  | "fr"
  | "de"
  | "it"
  | "pt"
  | "ru"
  | "zh"
  | "ja"
  | "ko"
  | "ar"
  | "tr"
  | "vi"
  | "id"
  | "th"
  | "fa"
  | "bn"
  | "sw"
  | "ta";
