import { Injectable, OnModuleInit } from '@nestjs/common';
import { ethers } from 'ethers';
import { ConfigService } from '../config/config.service';
import { NftInfo } from '../interfaces/OwnableInfo';
import { DataError } from '../interfaces/error';
import * as abis from './abi';

@Injectable()
export class EthersService implements OnModuleInit {
  constructor(private config: ConfigService) {}

  onModuleInit(): void {}

  // public signMessage(message: string | Uint8Array): Promise<string> {
  //   return this.signer.signMessage(message);
  // }
  private async getBalance(
    ltoNetworkId: 'L' | 'T',
    evmNetworkName: string,
  ): Promise<string> {
    const alchemyProvider = new ethers.AlchemyProvider(
      ...this.getNetwork(ltoNetworkId, evmNetworkName),
    );
    const signer: ethers.HDNodeWallet = this.getSigner(
      ltoNetworkId,
      evmNetworkName,
    );
    const balance = ethers
      .formatUnits(await alchemyProvider.getBalance(signer.address), 'ether')
      .toString();
    return balance;
  }
  private getSigner(
    ltoNetworkId: 'L' | 'T',
    evmNetworkName: string,
  ): ethers.HDNodeWallet {
    const alchemyProvider = new ethers.AlchemyProvider(
      ...this.getNetwork(ltoNetworkId, evmNetworkName),
    );
    let signer: ethers.HDNodeWallet;
    if (ltoNetworkId === 'L') {
      signer = ethers.Wallet.fromPhrase(
        this.config.get('eth.account.mnemonic.mainnet'),
        alchemyProvider,
      );
    } else {
      signer = ethers.Wallet.fromPhrase(
        this.config.get('eth.account.mnemonic.testnet'),
        alchemyProvider,
      );
    }
    return signer;
  }

  private getNetwork(
    ltoNetworkId: 'L' | 'T',
    evmNetworkName: string,
  ): [ethers.Networkish, string] {
    // https://docs.ethers.org/v6/api/providers/thirdparty/#AlchemyProvider

    // const networkId = this.config.get('lto.networkId');
    switch (evmNetworkName) {
      case 'ethereum':
        if (ltoNetworkId === 'T')
          return [
            { name: 'sepolia', chainId: 11155111 },
            this.config.get('eth.account.eth_alchemy_api_key'),
          ];
        // Sepolia Testnet
        else
          return [
            { name: 'mainnet', chainId: 1 },
            this.config.get('eth.account.eth_alchemy_api_key'),
          ]; // Ethereum Mainnet
      case 'arbitrum':
        if (ltoNetworkId === 'T')
          // Arbitrum Sepolia Testnet
          return [
            { name: 'arbitrum-sepolia', chainId: 421614 },
            this.config.get('eth.account.arbitrum_alchemy_api_key'),
          ];
        else
          return [
            { name: 'arbitrum', chainId: 42161 },
            this.config.get('eth.account.arbitrum_alchemy_api_key'),
          ]; // Arbitrum Mainnet
      case 'polygon':
        if (ltoNetworkId === 'T')
          return [
            { name: 'matic-amoy', chainId: 80002 },
            this.config.get('eth.account.polygon_alchemy_api_key'),
          ];
        // Polygon Amoy Testnet
        else
          return [
            { name: 'matic', chainId: 137 },
            this.config.get('eth.account.polygon_alchemy_api_key'),
          ]; // Polygon mainnet
      case 'base':
        if (ltoNetworkId === 'T')
          return [
            { name: 'base-sepolia', chainId: 84532 },
            this.config.get('eth.account.arbitrum_alchemy_api_key'),
          ];
        // Base Sepolia Testnet
        else
          return [
            { name: 'base', chainId: 8453 },
            this.config.get('eth.account.arbitrum_alchemy_api_key'),
          ]; // Base mainnet
    }
  }

  private getContract(
    ltoNetworkId: 'L' | 'T',
    type: keyof typeof abis,
    networkName: string,
    address: string,
  ): ethers.Contract {
    if (!(type in abis)) throw new Error(`No ABI for ${type}`);

    let signer: ethers.HDNodeWallet;
    signer = this.getSigner(ltoNetworkId, networkName);

    const normalizedContractAddress = ethers.getAddress(address.trim());

    const nftContract: ethers.Contract = new ethers.Contract(
      normalizedContractAddress,
      abis[type],
      signer,
    );
    return nftContract;
  }

  public getEvmWalletAddresses(networkName: string): [string, string] {
    let signer_L: ethers.HDNodeWallet;
    let signer_T: ethers.HDNodeWallet;
    signer_L = this.getSigner('L', networkName);
    signer_T = this.getSigner('T', networkName);

    return [signer_L.address.toString(), signer_T.address.toString()];
  }
  public isEVMAddress(_address: string): boolean {
    return ethers.isAddress(_address);
  }
  public async getNFTcount(
    ltoNetworkId: 'L' | 'T',
    nft: NftInfo,
  ): Promise<string> {
    const nftContract = this.getContract(
      ltoNetworkId,
      'OBridgeNFT',
      nft.network,
      nft.address,
    );

    return (await nftContract.getNftCount()).toString();
  }
  public async getOwnerOfNFT(
    ltoNetworkId: 'L' | 'T',
    nft: NftInfo,
  ): Promise<string> {
    const nftContract = this.getContract(
      ltoNetworkId,
      'OBridgeNFT',
      nft.network,
      nft.address,
    );
    return (await nftContract.ownerOf(nft.id.toString())).toString();
  }
  public async isBridge(
    ltoNetworkId: 'L' | 'T',
    bridgeAddress: string,
    nft: NftInfo,
  ): Promise<boolean> {
    const nftContract = this.getContract(
      ltoNetworkId,
      'OBridgeNFT',
      nft.network,
      nft.address,
    );
    const normalizedAddress = ethers.getAddress(bridgeAddress);
    return await nftContract.isBridge(normalizedAddress);
  }
  public async getBridgeBaseURI(
    ltoNetworkId: 'L' | 'T',
    bridgeAddress: string,
    nft: NftInfo,
  ): Promise<string> {
    const nftContract = this.getContract(
      ltoNetworkId,
      'OBridgeNFT',
      nft.network,
      nft.address,
    );
    const normalizedAddress = ethers.getAddress(bridgeAddress);
    return await nftContract.getBridgeBaseURI(normalizedAddress);
  }
  public async getServerETHBalance(
    ltoNetworkId: 'L' | 'T',
    networkName: string,
  ): Promise<string> {
    return await this.getBalance(ltoNetworkId, networkName);
  }

  public async getTokenURI(
    ltoNetworkId: 'L' | 'T',
    nft: NftInfo,
  ): Promise<string> {
    const nftContract = this.getContract(
      ltoNetworkId,
      'OBridgeNFT',
      nft.network,
      nft.address,
    );
    return await nftContract.getTokenURI(nft.id);
  }
  public async mintNFT(
    ltoNetworkId: 'L' | 'T',
    nftReceiverAddress: string,
    nftTokenURI: string,
    nft: NftInfo,
  ): Promise<number> {
    const nftContract = this.getContract(
      ltoNetworkId,
      'OBridgeNFT',
      nft.network,
      nft.address,
    );

    const signer = this.getSigner(ltoNetworkId, nft.network);

    try {
      const expectedOBuilder = await nftContract.oBuilder();
      const signerAddress = signer.address;

      console.log(
        `[NFT Mint] Network: ${nft.network}, Contract: ${nft.address}`,
      );
      console.log(`[NFT Mint] Signer: ${signerAddress}`);
      console.log(`[NFT Mint] Expected oBuilder: ${expectedOBuilder}`);
      console.log(`[NFT Mint] Receiver: ${nftReceiverAddress}`);

      const normalizedAddress = ethers.getAddress(nftReceiverAddress);

      console.log(`[NFT Mint] Initiating mint transaction...`);
      const response = await nftContract.mint(normalizedAddress, nftTokenURI);
      console.log(`[NFT Mint] Transaction hash: ${response.hash}`);
      await response.wait();
      const nftcount = await nftContract.getNftCount();
      console.log(`[NFT Mint] Success - Total NFTs: ${nftcount.toString()}`);
      return Number(nftcount.toString());
    } catch (err) {
      if (
        err.code === 'INSUFFICIENT_FUNDS' ||
        err.info?.error?.message?.includes('insufficient funds')
      ) {
        const balance = err.info?.error?.message?.match(/have (\d+)/)?.[1];
        const needed = err.info?.error?.message?.match(/want (\d+)/)?.[1];
        const balanceETH = balance ? ethers.formatEther(balance) : 'unknown';
        const neededETH = needed ? ethers.formatEther(needed) : 'unknown';
        throw new DataError(
          `Insufficient funds to mint NFT. Wallet balance: ${balanceETH} ETH, Required: ${neededETH} ETH. Please fund the wallet ${signer.address} on ${nft.network}.`,
        );
      }

      if (err.data) {
        try {
          const parsedError = nftContract.interface.parseError(err.data);
          if (parsedError) {
            if (parsedError.name === 'OnlyOBuilderAllowed') {
              const [msgSender, obuilder] = parsedError.args;
            } else if (parsedError.name === 'MintingOnlyToBridge') {
            }
          }
        } catch (decodeErr) {}
      }
      throw new DataError(err);
    }
  }
  public async getBridgeCount(
    ltoNetworkId: 'L' | 'T',
    nft: NftInfo,
  ): Promise<number> {
    const nftContract = this.getContract(
      ltoNetworkId,
      'OBridgeNFT',
      nft.network,
      nft.address,
    );
    return await nftContract.getBridgeCount();
  }
  public async getBridges(
    ltoNetworkId: 'L' | 'T',
    nft: NftInfo,
  ): Promise<[string[], string[]]> {
    const nftContract = this.getContract(
      ltoNetworkId,
      'OBridgeNFT',
      nft.network,
      nft.address,
    );
    return await nftContract.getBridges();
  }
  public async getListOfNftIdsPerAddress(
    ltoNetworkId: 'L' | 'T',
    evmNetwork: string,
    walletAddress: string,
  ): Promise<number[]> {
    let smartContractAddress: string;
    if (evmNetwork === 'ethereum') {
      if (ltoNetworkId === 'L') {
        smartContractAddress = this.config.get(
          'eth.contracts.ethereum.mainnet',
        );
      } else {
        smartContractAddress = this.config.get(
          'eth.contracts.ethereum.testnet',
        );
      }
    } else if (evmNetwork === 'arbitrum') {
      if (ltoNetworkId === 'L') {
        smartContractAddress = this.config.get(
          'eth.contracts.arbitrum.mainnet',
        );
      } else {
        smartContractAddress = this.config.get(
          'eth.contracts.arbitrum.testnet',
        );
      }
    } else if (evmNetwork === 'polygon') {
      if (ltoNetworkId === 'L') {
        smartContractAddress = this.config.get('eth.contracts.polygon.mainnet');
      } else {
        smartContractAddress = this.config.get('eth.contracts.polygon.testnet');
      }
    } else if (evmNetwork === 'base') {
      if (ltoNetworkId === 'L') {
        smartContractAddress = this.config.get('eth.contracts.base.mainnet');
      } else {
        smartContractAddress = this.config.get('eth.contracts.base.testnet');
      }
    } else {
      throw new DataError(
        `Unknown EVM Network ${evmNetwork}. Possible options: ethereum, arbitrum, polygon, or base`,
      );
    }
    const nftContract = this.getContract(
      ltoNetworkId,
      'OBridgeNFT',
      evmNetwork,
      smartContractAddress,
    );
    const normalizedAddress = ethers.getAddress(walletAddress);
    return await nftContract.getListOfNftIdsPerAddress(normalizedAddress);
  }

  public async transferNFT(
    ltoNetworkId: 'L' | 'T',
    nftReceiverAddress: string,
    nft: NftInfo,
  ): Promise<string> {
    const nftContract = this.getContract(
      ltoNetworkId,
      'OBridgeNFT',
      nft.network,
      nft.address,
    );
    let signer: ethers.HDNodeWallet;
    signer = this.getSigner(ltoNetworkId, nft.network);
    try {
      const normalizedAddress = ethers.getAddress(nftReceiverAddress);

      const response = await nftContract.transferFrom(
        signer.address,
        normalizedAddress,
        nft.id,
      );
      await response.wait();
      return (await nftContract.ownerOf(nft.id.toString())).toString();
    } catch (err) {
      throw new DataError(err);
    }
  }
}
