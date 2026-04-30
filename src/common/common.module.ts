import { Module, Global } from '@nestjs/common';
import { ResponseService } from './services/response-service';

@Global() // Makes this module available to all modules without explicit imports
@Module({
    providers: [ResponseService],
    exports: [ResponseService],
})
export class CommonModule { }
