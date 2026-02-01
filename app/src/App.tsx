import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import type {
  AppSettings,
  CredentialRecord,
  MessageRecord,
  StrengthLevel,
  ThemeMode,
  ToastState
} from "./types";
import {
  EMAIL_DOMAINS,
  calculateStorageUsage,
  extractOtp,
  formatTimestamp,
  generateRandomEmail,
  generateSecurePassword,
  normalizeText,
  randomInt,
  evaluateStrength
} from "./utils";
import {
  loadCredentials,
  loadMessages,
  persistCredential,
  persistMessage
} from "./db";
import { languageList, translate } from "./translations";
import type { LanguageCode, TranslationKey } from "./types";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type MessageTemplate = {
  sender: string;
  subjects: string[];
  bodies: string[];
};

type ChatMessage = {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: number;
};

const OTP_LENGTHS = [4, 6, 8];

const messageTemplates: MessageTemplate[] = [
  {
    sender: "Google",
    subjects: [
      "Google verification code %CODE%",
      "Google security PIN %CODE%"
    ],
    bodies: [
      "Your Google verification code is %CODE%. Enter this code within 10 minutes to continue.",
      "Google account sign-in attempt detected. Use code %CODE% to verify it's you."
    ]
  },
  {
    sender: "Facebook",
    subjects: [
      "Facebook login code %CODE%",
      "Facebook password reset %CODE%"
    ],
    bodies: [
      "Someone tried to sign in to Facebook. Use %CODE% to confirm it was you.",
      "Reset your Facebook password with code %CODE%. It expires soon."
    ]
  },
  {
    sender: "WhatsApp",
    subjects: ["WhatsApp code %CODE%", "WhatsApp secure login %CODE%"],
    bodies: [
      "Your WhatsApp verification code is %CODE%. Never forward this OTP.",
      "WhatsApp code: %CODE%. Only use this code for the official app."
    ]
  },
  {
    sender: "Instagram",
    subjects: [
      "Instagram confirmation %CODE%",
      "Instagram login help %CODE%"
    ],
    bodies: [
      "Enter %CODE% on Instagram to finish signing in.",
      "We received a login request. Use code %CODE% if it was you."
    ]
  },
  {
    sender: "Twitter",
    subjects: [
      "Twitter security code %CODE%",
      "Twitter login verification %CODE%"
    ],
    bodies: [
      "Use %CODE% as your security code for Twitter. Do not share it.",
      "Enter %CODE% to confirm access to your Twitter account."
    ]
  },
  {
    sender: "LinkedIn",
    subjects: ["LinkedIn login code %CODE%", "LinkedIn security alert %CODE%"],
    bodies: [
      "Use %CODE% to finish signing in to LinkedIn.",
      "LinkedIn security check: enter code %CODE% to continue."
    ]
  },
  {
    sender: "Amazon",
    subjects: [
      "Amazon verification %CODE%",
      "Amazon account protection %CODE%"
    ],
    bodies: [
      "Amazon one-time password: %CODE%. Keep your account secure.",
      "Enter %CODE% to confirm recent activity on Amazon."
    ]
  },
  {
    sender: "Apple",
    subjects: ["Apple ID sign in %CODE%", "Apple security code %CODE%"],
    bodies: [
      "Use %CODE% as your Apple ID verification code.",
      "Apple verification code %CODE%. It will expire shortly."
    ]
  },
  {
    sender: "Microsoft",
    subjects: [
      "Microsoft account code %CODE%",
      "Microsoft security alert %CODE%"
    ],
    bodies: [
      "Here is your Microsoft account code: %CODE%.",
      "Microsoft security warning: enter %CODE% if you recognize this sign in."
    ]
  },
  {
    sender: "PayPal",
    subjects: ["PayPal confirmation %CODE%", "PayPal secure code %CODE%"],
    bodies: [
      "Use %CODE% to approve recent activity on your PayPal account.",
      "PayPal code %CODE% will expire in 5 minutes."
    ]
  },
  {
    sender: "Netflix",
    subjects: ["Netflix access code %CODE%", "Netflix login help %CODE%"],
    bodies: [
      "Netflix verification code: %CODE%.",
      "We detected a new login. Use %CODE% if this was you."
    ]
  },
  {
    sender: "Uber",
    subjects: ["Uber verification %CODE%", "Uber ride security %CODE%"],
    bodies: [
      "Enter %CODE% in Uber to complete your sign in.",
      "Uber security check: code %CODE%."
    ]
  },
  {
    sender: "Slack",
    subjects: ["Slack login code %CODE%", "Slack workspace access %CODE%"],
    bodies: [
      "Slack verification code: %CODE%.",
      "Use %CODE% to access your Slack workspace."
    ]
  },
  {
    sender: "Zoom",
    subjects: ["Zoom meeting code %CODE%", "Zoom account security %CODE%"],
    bodies: [
      "Secure your Zoom account with code %CODE%.",
      "Zoom verification: %CODE%. Never share it."
    ]
  },
  {
    sender: "Dropbox",
    subjects: ["Dropbox sign-in code %CODE%", "Dropbox device alert %CODE%"],
    bodies: [
      "Dropbox code %CODE% keeps your files secure.",
      "Someone tried to access Dropbox. Use %CODE% if it was you."
    ]
  },
  {
    sender: "GitHub",
    subjects: ["GitHub 2FA code %CODE%", "GitHub security check %CODE%"],
    bodies: [
      "Your GitHub authentication code is %CODE%.",
      "GitHub security: use %CODE% to finish signing in."
    ]
  },
  {
    sender: "Snapchat",
    subjects: [
      "Snapchat login code %CODE%",
      "Snapchat recovery code %CODE%"
    ],
    bodies: [
      "Enter %CODE% to access Snapchat on your device.",
      "Snapchat recovery code: %CODE%."
    ]
  },
  {
    sender: "Telegram",
    subjects: ["Telegram code %CODE%", "Telegram sign-in %CODE%"],
    bodies: [
      "Telegram login code: %CODE%.",
      "Use %CODE% to confirm Telegram access."
    ]
  },
  {
    sender: "Stripe",
    subjects: ["Stripe verification %CODE%", "Stripe alert %CODE%"],
    bodies: [
      "Stripe security code: %CODE%.",
      "Enter %CODE% to verify your recent Stripe activity."
    ]
  },
  {
    sender: "Airbnb",
    subjects: ["Airbnb confirmation %CODE%", "Airbnb login %CODE%"],
    bodies: [
      "Use %CODE% to confirm your Airbnb booking.",
      "Airbnb login security code: %CODE%."
    ]
  },
  {
    sender: "Spotify",
    subjects: ["Spotify access code %CODE%", "Spotify sign in %CODE%"],
    bodies: [
      "Spotify verification code: %CODE%.",
      "Enter %CODE% to continue with Spotify."
    ]
  },
  {
    sender: "Discord",
    subjects: ["Discord login code %CODE%", "Discord security %CODE%"],
    bodies: [
      "Discord verification: %CODE%.",
      "Discord code %CODE% prevents unauthorized access."
    ]
  }
];

const chatbotKnowledge = [
  {
    keywords: ["otp", "code", "sms"],
    reply:
      "OTPs refresh automatically every few seconds. Use the Refresh button for an instant message."
  },
  {
    keywords: ["email", "password", "generate"],
    reply:
      "Use the Generate button to create a fresh disposable email and secure password instantly."
  },
  {
    keywords: ["notify", "notification", "alert"],
    reply:
      "Enable desktop alerts from Settings so you never miss a new OTP notification."
  },
  {
    keywords: ["theme", "dark", "light"],
    reply:
      "Switch between light and dark themes using the toggle in the header or in Settings."
  },
  {
    keywords: ["language", "translate", "locale"],
    reply:
      "Choose from 20 languages via the selector in the header. All labels update immediately."
  }
];

const defaultChatbotReply =
  "I'm here to help! Ask about OTPs, email generation, notifications, or settings.";

const initialChatMessage = (): ChatMessage => ({
  id: crypto.randomUUID(),
  sender: "bot",
  text: "Welcome! Need help using your secure inbox?",
  timestamp: Date.now()
});

const getInitialSettings = (): AppSettings => {
  if (typeof window === "undefined") {
    return { theme: "dark", language: "en", notifications: true };
  }
  const notificationPermission =
    "Notification" in window ? window.Notification.permission : "default";
  const storedTheme = window.localStorage.getItem("temp-inbox-theme") as
    | ThemeMode
    | null;
  const storedLanguage = window.localStorage.getItem(
    "temp-inbox-language"
  ) as LanguageCode | null;
  const storedNotifications =
    window.localStorage.getItem("temp-inbox-notifications");

  return {
    theme: storedTheme ?? "dark",
    language: storedLanguage ?? "en",
    notifications: storedNotifications
      ? storedNotifications === "true"
      : notificationPermission === "granted"
  };
};

const CopyButton = ({
  value,
  label,
  onCopy
}: {
  value: string;
  label: string;
  onCopy: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopy();
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Swallow copy failure silently to avoid console noise
    }
  };

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    []
  );

  return (
    <button className="copy-button" onClick={handleCopy} type="button">
      <span className="copy-icon" aria-hidden>
        {copied ? "✓" : "📋"}
      </span>
      <span>{label}</span>
    </button>
  );
};

const StrengthMeter = ({
  level,
  title,
  value
}: {
  level: StrengthLevel;
  title: string;
  value: string;
}) => (
  <div className="strength-meter">
    <div className="strength-header">
      <span className="strength-title">{title}</span>
      <span className="strength-value">{value}</span>
    </div>
    <div className="strength-track">
      <div className={`strength-indicator strength-${level}`} />
    </div>
  </div>
);

const useToast = () => {
  const [toast, setToast] = useState<ToastState>({ message: "", visible: false });
  const timeoutRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true });
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(
      () => setToast({ message: "", visible: false }),
      2000
    );
  }, []);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    []
  );

  return { toast, showToast };
};

const App = () => {
  const [settings, setSettings] = useState<AppSettings>(() => getInitialSettings());
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [currentCredential, setCurrentCredential] =
    useState<CredentialRecord | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [visibleMessages, setVisibleMessages] = useState(10);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [chatbotOpen, setChatbotOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [chatLog, setChatLog] = useState<ChatMessage[]>(() => [
    initialChatMessage()
  ]);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [a2hsVisible, setA2hsVisible] = useState(false);
  const [isNotificationSupported, setIsNotificationSupported] = useState(false);

  const generatorTimeout = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const { toast, showToast } = useToast();

  const t = useCallback(
    (key: TranslationKey) => translate(settings.language, key),
    [settings.language]
  );

  const applyTheme = useCallback(
    (theme: ThemeMode) => {
      document.documentElement.dataset.theme = theme;
    },
    []
  );

  useEffect(() => {
    applyTheme(settings.theme);
    window.localStorage.setItem("temp-inbox-theme", settings.theme);
  }, [settings.theme, applyTheme]);

  useEffect(() => {
    window.localStorage.setItem("temp-inbox-language", settings.language);
  }, [settings.language]);

  useEffect(() => {
    window.localStorage.setItem(
      "temp-inbox-notifications",
      settings.notifications ? "true" : "false"
    );
  }, [settings.notifications]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported = "Notification" in window;
    setIsNotificationSupported(supported);
    if (supported) {
      window.Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          setSettings((prev) => ({ ...prev, notifications: true }));
        }
      });
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [storedCredentials, storedMessages] = await Promise.all([
          loadCredentials(),
          loadMessages()
        ]);
        if (!active) return;
        setCredentials(storedCredentials);
        if (storedCredentials[0]) {
          setCurrentCredential(storedCredentials[0]);
        }
        setMessages(storedMessages);
      } catch {
        // ignore storage errors silently
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const showNotification = useCallback(
    (record: MessageRecord) => {
      if (!isNotificationSupported) return;
      if (!settings.notifications) return;
      if (window.Notification.permission !== "granted") return;
      const notification = new window.Notification(
        record.otp ? `${record.sender}: ${record.otp}` : record.sender,
        {
          body: record.subject
        }
      );
      notification.onclick = () => window.focus();
    },
    [isNotificationSupported, settings.notifications]
  );

  const createMessageRecord = useCallback((): MessageRecord => {
    const template =
      messageTemplates[randomInt(0, messageTemplates.length - 1)];
    const otpLength = OTP_LENGTHS[randomInt(0, OTP_LENGTHS.length - 1)];
    let otp = "";
    for (let i = 0; i < otpLength; i += 1) {
      otp += randomInt(0, 9).toString();
    }
    const subjectTemplate =
      template.subjects[randomInt(0, template.subjects.length - 1)];
    const bodyTemplate =
      template.bodies[randomInt(0, template.bodies.length - 1)];

    const subject = subjectTemplate.replace(/%CODE%/g, otp);
    const body = bodyTemplate.replace(/%CODE%/g, otp);
    const detectedOtp = extractOtp(body) ?? otp;

    return {
      id: crypto.randomUUID(),
      sender: template.sender,
      subject,
      body,
      otp: detectedOtp,
      timestamp: Date.now()
    };
  }, []);

  const pushMessage = useCallback(
    (record: MessageRecord) => {
      setMessages((prev) => {
        const next = [record, ...prev];
        return next.slice(0, 150);
      });
      void persistMessage(record).catch(() => undefined);
      showNotification(record);
    },
    [showNotification]
  );

  const scheduleNextMessage = useCallback(() => {
    if (generatorTimeout.current) {
      window.clearTimeout(generatorTimeout.current);
    }
    const delay = randomInt(10, 30) * 1000;
    generatorTimeout.current = window.setTimeout(() => {
      const record = createMessageRecord();
      pushMessage(record);
      scheduleNextMessage();
    }, delay);
  }, [createMessageRecord, pushMessage]);

  useEffect(() => {
    scheduleNextMessage();
    return () => {
      if (generatorTimeout.current) {
        window.clearTimeout(generatorTimeout.current);
      }
    };
  }, [scheduleNextMessage]);

  const handleGenerateCredential = useCallback(() => {
    const email = generateRandomEmail();
    const password = generateSecurePassword();
    const strength = evaluateStrength(password);
    const record: CredentialRecord = {
      id: crypto.randomUUID(),
      email,
      password,
      strength,
      timestamp: Date.now()
    };
    setCurrentCredential(record);
    setCredentials((prev) => {
      const next = [record, ...prev];
      return next.slice(0, 150);
    });
    void persistCredential(record).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!currentCredential) {
      handleGenerateCredential();
    }
  }, [currentCredential, handleGenerateCredential]);

  const handleRefreshMessages = () => {
    const record = createMessageRecord();
    pushMessage(record);
    scheduleNextMessage();
  };

  const filteredCredentials = useMemo(() => {
    if (!searchQuery) return credentials;
    const normalized = normalizeText(searchQuery);
    return credentials.filter((item) =>
      `${normalizeText(item.email)} ${normalizeText(item.password)}`.includes(
        normalized
      )
    );
  }, [credentials, searchQuery]);

  const filteredMessages = useMemo(() => {
    if (!searchQuery) return messages;
    const normalized = normalizeText(searchQuery);
    return messages.filter((item) =>
      `${normalizeText(item.sender)} ${normalizeText(
        item.subject
      )} ${normalizeText(item.body)}`.includes(normalized)
    );
  }, [messages, searchQuery]);

  const storageUsage = useMemo(
    () => calculateStorageUsage(credentials, messages),
    [credentials, messages]
  );

  const handleInstallPrompt = async () => {
    if (!deferredPrompt) return;
    setA2hsVisible(false);
    deferredPrompt.prompt();
    try {
      const result = await deferredPrompt.userChoice;
      if (result.outcome === "accepted") {
        showToast(t("install"));
      }
    } catch {
      // ignore install failure
    }
    setDeferredPrompt(null);
  };

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setA2hsVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleSettingsChange = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    const shortcutHandler = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && key === "k") {
        event.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (modifier && key === "g") {
        event.preventDefault();
        handleGenerateCredential();
        showToast(t("lastGenerated"));
      }
      if (key === "escape") {
        setSearchOpen(false);
        setMenuOpen(false);
        setPrivacyOpen(false);
        setChatbotOpen(false);
      }
    };
    window.addEventListener("keydown", shortcutHandler);
    return () => window.removeEventListener("keydown", shortcutHandler);
  }, [handleGenerateCredential, t, showToast]);

  useEffect(() => {
    const onFocus = () => {
      if (settings.theme === "dark" || settings.theme === "light") {
        applyTheme(settings.theme);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [applyTheme, settings.theme]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleNextMessage();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [scheduleNextMessage]);

  useEffect(() => {
    if (a2hsVisible) {
      showToast(t("addToHomeScreen"));
    }
  }, [a2hsVisible, showToast, t]);

  const submitChatbot = (input: string) => {
    if (!input.trim()) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sender: "user",
      text: input,
      timestamp: Date.now()
    };
    setChatLog((prev) => [...prev, userMessage]);
    const lower = input.toLowerCase();
    const knowledge =
      chatbotKnowledge.find((item) =>
        item.keywords.some((keyword) => lower.includes(keyword))
      )?.reply ?? defaultChatbotReply;
    const botMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sender: "bot",
      text: knowledge,
      timestamp: Date.now() + 100
    };
    setTimeout(() => {
      setChatLog((prev) => [...prev, botMessage]);
    }, 200);
  };

  const latestMessage = messages[0];

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand">
          <span className="brand-logo">OTP</span>
          <span className="brand-title">{t("appTitle")}</span>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="icon-button"
            onClick={() => setSearchOpen(true)}
            aria-label={t("search")}
          >
            ⌘K
          </button>
          <select
            className="language-select"
            value={settings.language}
            onChange={(event) =>
              handleSettingsChange(
                "language",
                event.target.value as LanguageCode
              )
            }
          >
            {languageList.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-button"
            onClick={() =>
              handleSettingsChange(
                "theme",
                settings.theme === "dark" ? "light" : "dark"
              )
            }
          >
            {settings.theme === "dark" ? "🌙" : "☀️"}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setMenuOpen(true)}
          >
            ☰
          </button>
        </div>
      </header>

      <main className="app-main">
        <section className="panel generator-panel">
          <header className="panel-header">
            <h2>{t("generatorTitle")}</h2>
            <button
              type="button"
              className="primary-button"
              onClick={handleGenerateCredential}
            >
              {t("generateButton")}
            </button>
          </header>

          <div className="generator-body">
            <div className="field-row">
              <div className="field">
                <span className="field-label">{t("emailLabel")}</span>
                <p className="field-value">{currentCredential?.email ?? "—"}</p>
              </div>
              <CopyButton
                value={currentCredential?.email ?? ""}
                label={t("copyEmail")}
                onCopy={() => showToast(t("toastCopied"))}
              />
            </div>
            <div className="field-row">
              <div className="field">
                <span className="field-label">{t("passwordLabel")}</span>
                <p className="field-value">
                  {currentCredential?.password ?? "—"}
                </p>
              </div>
              <CopyButton
                value={currentCredential?.password ?? ""}
                label={t("copyPassword")}
                onCopy={() => showToast(t("toastCopied"))}
              />
            </div>
            {currentCredential && (
              <StrengthMeter
                level={currentCredential.strength}
                title={t("strengthLabel")}
                value={
                  currentCredential.strength === "weak"
                    ? t("strengthWeak")
                    : currentCredential.strength === "medium"
                    ? t("strengthMedium")
                    : t("strengthStrong")
                }
              />
            )}
            <ul className="domain-list">
              {EMAIL_DOMAINS.map((domain) => (
                <li key={domain}>{domain}</li>
              ))}
            </ul>
          </div>

          <section className="dashboard">
            <header>
              <h3>{t("dashboard")}</h3>
              <span className="dashboard-meta">
                {t("lastMessage")}:{" "}
                {latestMessage ? formatTimestamp(latestMessage.timestamp) : "—"}
              </span>
            </header>
            <div className="dashboard-grid">
              <div className="stat-card">
                <span className="stat-label">{t("totalEmails")}</span>
                <span className="stat-value">{credentials.length}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t("totalMessages")}</span>
                <span className="stat-value">{messages.length}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t("storageUsage")}</span>
                <span className="stat-value">{storageUsage}</span>
              </div>
            </div>
          </section>

          <section className="history">
            <header>
              <h3>{t("history")}</h3>
            </header>
            <div className="history-columns">
              <div>
                <span className="history-title">{t("credentialsHistory")}</span>
                <ul>
                  {credentials.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      <span>{item.email}</span>
                      <span className="history-meta">
                        {formatTimestamp(item.timestamp)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="history-title">{t("messagesHistory")}</span>
                <ul>
                  {messages.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      <span>{item.sender}</span>
                      <span className="history-meta">
                        {formatTimestamp(item.timestamp)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </section>

        <section className="panel inbox-panel">
          <header className="panel-header">
            <h2>{t("otpInbox")}</h2>
            <div className="panel-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={handleRefreshMessages}
              >
                {t("refresh")}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setVisibleMessages((count) => count + 5)
                }
              >
                {t("loadMore")}
              </button>
            </div>
          </header>
          <div className="message-list">
            {messages.slice(0, visibleMessages).map((message) => (
              <article className="message-card" key={message.id}>
                <header>
                  <div>
                    <span className="message-sender">{message.sender}</span>
                    <span className="message-subject">{message.subject}</span>
                  </div>
                  <time className="message-time">
                    {formatTimestamp(message.timestamp)}
                  </time>
                </header>
                <p className="message-body">{message.body}</p>
                {message.otp && (
                  <div className="otp-chip">
                    <span>{message.otp}</span>
                    <CopyButton
                      value={message.otp}
                      label={t("copyPassword")}
                      onCopy={() => showToast(t("otpCopied"))}
                    />
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      </main>

      <button
        type="button"
        className="floating-button"
        onClick={() => setChatbotOpen(true)}
      >
        🤖 {t("chatbot")}
      </button>

      {a2hsVisible && (
        <div className="a2hs-banner">
          <span>{t("addToHomeScreen")}</span>
          <button type="button" onClick={handleInstallPrompt}>
            {t("install")}
          </button>
        </div>
      )}

      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <h3>{t("menu")}</h3>
          <button
            type="button"
            className="icon-button"
            onClick={() => setMenuOpen(false)}
          >
            ✕
          </button>
        </div>
        <div className="sidebar-content">
          <section className="sidebar-section">
            <h4>{t("settings")}</h4>
            <div className="setting-row">
              <span>{t("theme")}</span>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  handleSettingsChange(
                    "theme",
                    settings.theme === "dark" ? "light" : "dark"
                  )
                }
              >
                {settings.theme === "dark" ? "🌙" : "☀️"}
              </button>
            </div>
            <div className="setting-row">
              <span>{t("language")}</span>
              <span className="setting-value">
                {languageList.find((item) => item.code === settings.language)
                  ?.label ?? settings.language}
              </span>
            </div>
            {isNotificationSupported && (
              <div className="setting-row">
                <span>{t("notifications")}</span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    handleSettingsChange("notifications", !settings.notifications)
                  }
                >
                  {settings.notifications
                    ? t("disableNotifications")
                    : t("enableNotifications")}
                </button>
              </div>
            )}
          </section>
          <section className="sidebar-section">
            <h4>{t("privacyPolicy")}</h4>
            <p>
              Disposable email and OTP content is stored locally in your browser
              using IndexedDB for quick access. Only the latest 100 records are
              retained.
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setPrivacyOpen(true)}
            >
              {t("privacyPolicy")}
            </button>
          </section>
        </div>
      </aside>
      {menuOpen && <div className="overlay" onClick={() => setMenuOpen(false)} />}

      {searchOpen && (
        <div className="search-overlay">
          <div className="search-dialog">
            <header>
              <h3>{t("search")}</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setSearchOpen(false)}
              >
                ✕
              </button>
            </header>
            <input
              ref={searchInputRef}
              type="search"
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <section>
              <h4>{t("credentialsHistory")}</h4>
              <ul className="search-results">
                {filteredCredentials.length === 0 && (
                  <li className="empty-state">{t("searchEmpty")}</li>
                )}
                {filteredCredentials.slice(0, 10).map((item) => (
                  <li key={item.id}>
                    <strong>{item.email}</strong>
                    <span>{formatTimestamp(item.timestamp)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h4>{t("messagesHistory")}</h4>
              <ul className="search-results">
                {filteredMessages.length === 0 && (
                  <li className="empty-state">{t("searchEmpty")}</li>
                )}
                {filteredMessages.slice(0, 10).map((item) => (
                  <li key={item.id}>
                    <strong>
                      {item.sender} · {item.subject}
                    </strong>
                    <span>{formatTimestamp(item.timestamp)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}

      {privacyOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <header>
              <h3>{t("privacyPolicy")}</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setPrivacyOpen(false)}
              >
                ✕
              </button>
            </header>
            <div className="modal-content">
              <p>
                This application runs entirely on-device. Emails, passwords, and
                OTP messages never leave your browser. IndexedDB persists your
                last 100 generated credentials and messages. Clearing your
                browser storage removes all data permanently.
              </p>
              <p>
                Desktop notifications are triggered locally and only after you
                grant permission. Service worker caching keeps the interface
    responsive even when offline.
              </p>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => setPrivacyOpen(false)}
            >
              {t("close")}
            </button>
          </div>
        </div>
      )}

      {chatbotOpen && (
        <div className="chatbot-overlay">
          <div className="chatbot">
            <header>
              <h3>{t("chatbot")}</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setChatbotOpen(false)}
              >
                ✕
              </button>
            </header>
            <div className="chat-log">
              {chatLog.map((entry) => (
                <div
                  key={entry.id}
                  className={`chat-entry chat-${entry.sender}`}
                >
                  <span>{entry.text}</span>
                </div>
              ))}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const value = chatInputRef.current?.value ?? "";
                submitChatbot(value);
                if (chatInputRef.current) {
                  chatInputRef.current.value = "";
                }
              }}
            >
              <input
                ref={chatInputRef}
                type="text"
                placeholder={t("chatbotPlaceholder")}
              />
              <button type="submit">{t("send")}</button>
            </form>
          </div>
        </div>
      )}

      {toast.visible && (
        <div className="toast">
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default App;
