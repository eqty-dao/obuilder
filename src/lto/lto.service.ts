import { Injectable, OnModuleInit } from '@nestjs/common';
import { Account, LTO } from "@ltonetwork/lto";
import { ConfigService } from '../config/config.service';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class LtoService implements OnModuleInit {
    public ltoMainnet: LTO;
    public ltoTestnet: LTO;
    public ltoAccountMainnet: Account;
    public ltoAccountTestnet: Account;

    constructor(
        private readonly config: ConfigService,
        private readonly httpService: HttpService
    ) {
        //INFO: If ConfigService is added to the lto.module (or other modules) as provider, the Config module is not initialized yet !
        // then use onModuleInit with the await config.load() function
        // Initialize LTO instances for Mainnet and Testnet
        this.ltoMainnet = new LTO('L');
        this.ltoTestnet = new LTO('T');
        // Initialize the accounts using seeds from the config service
        this.ltoAccountMainnet = this.ltoMainnet.account({ seed: this.config.get('lto.account.seed.mainnet') });
        this.ltoAccountTestnet = this.ltoTestnet.account({ seed: this.config.get('lto.account.seed.testnet') });
    }
    async onModuleInit() {
        await this.config.load();  // Explicitly ensure config is loaded before using it   

    }

    public getLTOAccountAddress(ltoNetworkId: 'L' | 'T'): string {
        return ltoNetworkId === 'L'
            ? this.ltoAccountMainnet?.address
            : this.ltoAccountTestnet?.address;

    }
    public isValidLtoAddress(address: string): string {
        const isValidMainnet = this.ltoMainnet.isValidAddress(address);
        const isValidTestnet = this.ltoTestnet.isValidAddress(address);
        if (isValidMainnet) return "L";
        if (isValidTestnet) return "T";
        return "false";
    }
    public async getLTOAccountBalance(ltoNetworkId: 'L' | 'T') {
        const address = this.getLTOAccountAddress(ltoNetworkId);
        console.log("address1", address);
        let url: string;
        if (ltoNetworkId === 'L') {
            url = `${this.config.get('lto.node.mainnet')}/addresses/balance/${address}`;      
        } else {
            url = `${this.config.get('lto.node.testnet')}/addresses/balance/${address}`;
        }

        // console.log("url1", url)

        const data = await this.httpService.axiosRef
            .get(url)
            .then((res) => res.data)
            .catch((err) => {
                throw new Error(
                    err?.message + ': ' + JSON.stringify(err?.response?.data),
                );
            });
        // console.log("data1", data)
        return data;
    }
}
