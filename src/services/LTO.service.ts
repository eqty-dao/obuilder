import { Account, LTO } from "@ltonetwork/lto"
// import { ConfigService } from '../common/config/config.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

// export const lto = new LTO(process.env.REACT_APP_LTO_NETWORK_ID)
// if (process.env.REACT_APP_LTO_API_URL) lto.nodeAddress = process.env.REACT_APP_LTO_API_URL;
export const ltoMainnet = new LTO('L');
export const ltoTestnet = new LTO('T');

// const sessionSeed = SessionStorageService.get('@seed');
// const sessionSeed = "";

export class LTOService {

  // public readonly ltoAccountMainnet: Account = ltoMainnet.account({ seed: this.config.get('lto.account.seed.mainnet') });
  // public readonly ltoAccountTestnet: Account = ltoTestnet.account({ seed: this.config.get('lto.account.seed.testnet') });
  public readonly ltoAccountMainnet: Account = ltoMainnet.account({ seed: process.env.LTO_ACCOUNT_SEED_L });
  public readonly ltoAccountTestnet: Account = ltoTestnet.account({ seed: process.env.LTO_ACCOUNT_SEED_T });

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService
  ) { }

  
  public getLTOAccountAddress(ltoNetworkId: 'L' | 'T'): string {
    return ltoNetworkId === 'L'
      ? this.ltoAccountMainnet?.address
      : this.ltoAccountTestnet?.address;

  }
  public isValidLtoAddress(address: string): string {
    const isValidMainnet = ltoMainnet.isValidAddress(address);
    const isValidTestnet = ltoTestnet.isValidAddress(address);
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

    console.log("url1", url)

    const data = await this.httpService.axiosRef
      .get(url)
      .then((res) => res.data)
      .catch((err) => {
        throw new Error(
          err?.message + ': ' + JSON.stringify(err?.response?.data),
        );
      });
    console.log("data1", data)
    return data;
  }
  // public static get account(): Account {
  //   if (!this._account) {
  //     throw new Error("Not logged in");
  //   }

  //   return this._account;
  // }

  //   public static get address(): string {
  //     if (!!this._account) return this._account!.address;

  //     const [encryptedAccount] = LocalStorageService.get('@accountData') || [];
  //     if (encryptedAccount) return encryptedAccount.address;

  //     return '';
  //   }

  //   public static storeAccount(nickname: string, password: string): void {
  //     if (!this._account) {
  //       throw new Error("Account not created");
  //     }

  //     LocalStorageService.set('@accountData', [{
  //       nickname: nickname,
  //       address: this._account.address,
  //       seed: this._account.encryptSeed(password),
  //     }]);

  //     SessionStorageService.set('@seed', this._account.seed);
  //   }


  // private static apiUrl(path: string): string {
  //   return lto.nodeAddress.replace(/\/$/g, '') + path;
  // }

  // public static async getBalance(address?: string) {
  //   if (!address) address = this.account.address;

  //   try {
  //     const url = this.apiUrl(`/addresses/balance/details/${address}`);
  //     const response = await fetch(url);
  //     return response.json();
  //   } catch (error) {
  //     throw new Error('Error fetching account details');
  //   }
  // }

  // public static async broadcast(transaction: Transaction) {
  //   const url = this.apiUrl('/transactions/broadcast');
  //   const response = await fetch(url, {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json'
  //     },
  //     body: JSON.stringify(transaction)
  //   });

  //   if (response.status >= 400) throw new Error('Broadcast transaction failed: ' + await response.text());
  // }

  // public static async anchor(...anchors: Array<{ key: Binary, value: Binary }> | Array<Binary>): Promise<void> {
  //   await lto.anchor(this.account, ...anchors as Array<Binary>);
  //   // if (anchors[0] instanceof Uint8Array) {
  //   //   await lto.anchor(this.account, ...anchors as Array<Binary>);
  //   // } else {
  //   //   await lto.mappedAnchor(this.account, ...anchors as Array<{key: Binary, value: Binary}>);
  //   // }
  // }

  // public static async verifyAnchors(...anchors: Array<{ key: Binary, value: Binary }> | Array<Binary>): Promise<any> {
  //   const data = anchors[0] instanceof Uint8Array
  //     ? (anchors as Array<Binary>).map(anchor => anchor.hex)
  //     : Object.fromEntries((anchors as Array<{ key: Binary, value: Binary }>).map(({ key, value }) => (
  //       [key.hex, value.hex]
  //     )));

  //   const url = this.apiUrl('/index/hash/verify?encoding=hex');
  //   const response = await fetch(url, {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json'
  //     },
  //     body: JSON.stringify(data),
  //   });

  //   return await response.json();
  // }

  // public static isValidAddress(address: string): boolean {
  //   try {
  //     return lto.isValidAddress(address);
  //   } catch (e) {
  //     return false;
  //   }
  // }

  // public static accountOf(publicKey: Binary | string): string {
  //   return lto.account({ publicKey: publicKey instanceof Binary ? publicKey.base58 : publicKey }).address;
  // }
}
