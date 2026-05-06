import { registerAs } from "@nestjs/config";

export default registerAs('email', () => ({
    enabled: process.env.EMAIL_ENABLED === 'true',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    fromName: process.env.EMAIL_FROM_NAME || 'Clothing Store',
}));