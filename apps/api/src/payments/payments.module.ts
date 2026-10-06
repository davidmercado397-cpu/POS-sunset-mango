import { Global, Module } from '@nestjs/common';
import { BoldService } from './bold.service';

@Global()
@Module({ providers: [BoldService], exports: [BoldService] })
export class PaymentsModule {}
