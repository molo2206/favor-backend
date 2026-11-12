import { Module } from '@nestjs/common';
import { TicketsModule } from './tickets/tickets.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { SlaModule } from './sla/sla.module';

@Module({
    imports: [TicketsModule, ComplaintsModule, SlaModule],
    exports: [TicketsModule, ComplaintsModule, SlaModule],
})
export class ServiceClientModule { }