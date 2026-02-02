import { Module } from '@nestjs/common';
import { EqtyService } from './eqty.service';
import { ConfigModule } from '../config/config.module';

@Module({
    imports: [ConfigModule],
    providers: [EqtyService],
    exports: [EqtyService],
})
export class EqtyModule { }
