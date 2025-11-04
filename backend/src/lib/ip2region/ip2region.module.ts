import { Global, Module } from '@nestjs/common';
import { IpLocationService } from './ip-location.service';

@Global()
@Module({
  providers: [IpLocationService],
  exports: [IpLocationService],
})
export class Ip2RegionModule {}
