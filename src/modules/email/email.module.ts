import { Module } from "@nestjs/common";
import { EmailService } from "./email.service";

/**
 * Email Module
 * Provides email sending functionality
 * Note: Queue processing is now handled by QueueModule
 */
@Module({
    providers: [EmailService],
    exports: [EmailService], // Export for use in queue processors
})
export class EmailModule {}
