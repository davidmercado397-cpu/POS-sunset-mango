import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { OnlineController, PublicStoreController } from './online.controller';
import { OnlineService } from './online.service';

@Module({ imports: [SalesModule], controllers: [PublicStoreController, OnlineController], providers: [OnlineService] })
export class OnlineModule {}
