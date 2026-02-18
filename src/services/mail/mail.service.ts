// mail.service.ts
import { Injectable } from '@nestjs/common';
import { InjectResend } from 'nest-resend';
import { Resend, ResendService } from 'nestjs-resend';
@Injectable()
export class MailService {
  constructor(
    @InjectResend() private readonly resend: Resend, // Inject specifically for 'nest-resend'
  ) {}
  async sendVerificationEmail(email: string, token: string) {
    console.log('Sending verification email to:', email);
    const url = `http://localhost:3000/verify-email?token=${token}`;
    await this.resend.emails.send({
      from: 'maina.mathengeg@gmail.com',
      to: email,
      subject: 'Verify your email',
      html: `<p>Click <a href="${url}">here</a> to verify your email.</p>`,
    });
  }
}
