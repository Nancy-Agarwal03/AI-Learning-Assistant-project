import { IEmailProvider } from './types';

export class ConsoleEmailProvider implements IEmailProvider {
  async sendPasswordResetEmail(email: string, resetToken: string, resetUrl: string): Promise<boolean> {
    console.log(`[EmailProvider] Password reset email sent to: ${email}`);
    console.log(`[EmailProvider] Reset Token: ${resetToken}`);
    console.log(`[EmailProvider] Reset URL: ${resetUrl}`);
    return true;
  }
}

export class SMTPEmailProvider implements IEmailProvider {
  async sendPasswordResetEmail(email: string, _resetToken: string, _resetUrl: string): Promise<boolean> {
    // SMTP transport implementation stub
    console.log(`[SMTPEmailProvider] Dispatched SMTP message to ${email}`);
    return true;
  }
}

export function getEmailProvider(): IEmailProvider {
  const provider = (process.env.EMAIL_PROVIDER || 'console').toLowerCase();
  if (provider === 'smtp') {
    return new SMTPEmailProvider();
  }
  return new ConsoleEmailProvider();
}
