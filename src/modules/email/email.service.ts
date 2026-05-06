import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from 'nodemailer';

/**
 * Email Service
 * Handles actual email sending via SMTP
 * Note: Email queuing is now handled by QueueModule
 */
@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);
    private readonly transporter: nodemailer.Transporter;
    private readonly enabled: boolean;

    constructor(private readonly cfg: ConfigService) {
        this.transporter = nodemailer.createTransport({
            host: cfg.get<string>('email.host', 'smtp.gmail.com'),
            port: cfg.get<number>('email.port', 587),
            secure: cfg.get<boolean>('email.secure', false), // true for 465, false for other ports
            auth: {
                user: cfg.get<string>('email.auth.user'),
                pass: cfg.get<string>('email.auth.pass')
            },
        });
        this.enabled = this.cfg.get<boolean>('email.enabled', true);
        
        // Log configuration for debugging (without sensitive data)
        this.logger.log(`Email service initialized: ${cfg.get<string>('email.host')}:${cfg.get<number>('email.port')} | Enabled: ${this.enabled}`);
    }

    /**
     * Send email directly via SMTP
     * Called by queue processor
     */
    async sendMail(to: string, subject: string, html: string): Promise<void> {
        // If the flag is off, skip sending
        if (!this.enabled) {
            this.logger.warn(`Email disabled - skipping: ${subject} to ${to}`);
            return;
        }

        try {
            const fromName = this.cfg.get<string>('email.fromName', 'Clothing Store');
            const fromEmail = this.cfg.get<string>('email.from');
            
            await this.transporter.sendMail({
                from: `"${fromName}" <${fromEmail}>`,
                to,
                subject,
                html,
            });
            
            this.logger.log(`Email sent successfully → ${to} | ${subject}`);
        } catch (error) {
            this.logger.error(`Failed to send email to ${to} (${subject}):`, error);
            throw error; // Re-throw to trigger queue retry
        }
    }
}