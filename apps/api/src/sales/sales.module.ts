import { Module } from '@nestjs/common';
import { SalesImportController } from './sales-import.controller';
import { SalesImportService } from './sales-import.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({ controllers: [SalesController, SalesImportController], providers: [SalesService, SalesImportService], exports: [SalesService] })
export class SalesModule {}
