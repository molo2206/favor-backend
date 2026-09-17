import { Module } from "@nestjs/common";
import { InvoiceService } from "./invoice.util";

@Module({
    providers: [InvoiceService],
    exports: [InvoiceService], // ← essentiel pour qu’il soit accessible ailleurs
  })
  export class InvoiceModule {}
  