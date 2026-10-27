export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Local development only: prints messages (including reset links) to the
 * Wrangler console. Never used when ENVIRONMENT is "production".
 */
export class ConsoleMailer implements Mailer {
  async send({ to, subject, text }: MailMessage) {
    console.info(`[dev-mail] to=${to} subject=${subject}\n${text}`);
  }
}

/** Collects messages in memory so tests can read password-reset links. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage) {
    this.sent.push(message);
  }
}

/**
 * Production fails closed until a real provider is configured (backlog item
 * before private beta). Better than silently dropping reset emails.
 */
class UnconfiguredMailer implements Mailer {
  async send(): Promise<void> {
    throw new Error("Email delivery is not configured for this environment");
  }
}

export function mailerFor(env: Pick<Env, "ENVIRONMENT">): Mailer {
  return env.ENVIRONMENT === "production" ? new UnconfiguredMailer() : new ConsoleMailer();
}
