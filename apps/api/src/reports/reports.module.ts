import { Module } from '@nestjs/common';
import { MonthlyController } from './monthly.controller';
import { MonthlyService } from './monthly.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({ controllers: [ReportsController, MonthlyController], providers: [ReportsService, MonthlyService] })
export class ReportsModule {}
