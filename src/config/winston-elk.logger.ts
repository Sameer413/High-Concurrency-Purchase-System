import winston, { createLogger, format, transports } from "winston"

export const winstonElkLogger = createLogger({
    level: "info",
    format: format.json(),
    transports: [
        new transports.Console({
            format: format.combine(
                format.timestamp(),
                format.colorize(),
                format.simple()
            ),
        }),
        new winston.transports.File({ filename: 'logs/app.log' }),
    ],
})