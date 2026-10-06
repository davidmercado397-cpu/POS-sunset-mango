import { Global, Module } from '@nestjs/common';
import { KitchenController } from './kitchen.controller';
import { KitchenGateway } from './kitchen.gateway';
import { KitchenService } from './kitchen.service';

@Global()
@Module({ controllers: [KitchenController], providers: [KitchenGateway, KitchenService], exports: [KitchenService] })
export class KitchenModule {}
