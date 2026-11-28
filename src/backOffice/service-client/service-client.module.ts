import { Module } from '@nestjs/common';
import { TicketsModule } from './tickets/tickets.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { SlaModule } from './sla/sla.module';
import { ServiceClientContactsModule } from './contacts/contacts.module';

@Module({
    imports: [TicketsModule, ComplaintsModule, SlaModule, ServiceClientContactsModule],
    exports: [TicketsModule, ComplaintsModule, SlaModule, ServiceClientContactsModule],
})
export class ServiceClientModule { }