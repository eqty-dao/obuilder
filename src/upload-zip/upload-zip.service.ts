import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { CreateUploadZipDto } from './dto/create-upload-zip.dto';
import { UpdateUploadZipDto } from './dto/update-upload-zip.dto';
import { ConfigService } from '../common/config/config.service';
import * as fs from 'fs/promises';
import arrayToString from '../utils/arrayToString';

import JSZip from 'jszip';
import fileExists from '../utils/fileExists';
import path from 'path';
import { HttpService } from '@nestjs/axios';
import { catchError, firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { Account, Binary, LTO, Transaction, Event, EventChain } from "@ltonetwork/lto";
import { exec } from 'child_process';
import chokidar from 'chokidar';
import { NFTInfo, OwnableInfo } from '../interfaces/OwnableInfo';
import { TransactionIdData } from '../interfaces/TransactionIdData';
import { NftInfo, TypedPackage } from "../interfaces/TypedPackage";
import { NFTService } from '../nft/nft.service';

@Injectable()
export class UploadZipService implements OnModuleInit {
  private pathToRids: string;
  private pathToTemplates: string;
  private packageInfo: any;
  private ltoSessionSeed = 'test1 test2 test3 test4 test5 test6 test7 test8 test9 test10 test11 test12';
  private lto = new LTO('T');
  
  private readonly _ltoAccount?: Account = this.ltoSessionSeed ? this.lto.account({ seed: this.ltoSessionSeed }) : undefined;
  public readonly networkId = this.lto.networkId;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly zip: JSZip,
    private nft: NFTService,
    @Inject('IPFS') private readonly ipfs: IPFS,
  ) { }

  async onModuleInit() {
    this.packageInfo = require('../../package.json');
    this.pathToRids = this.packageInfo.ownableRidPath;
    this.pathToTemplates = this.packageInfo.ownableTemplatesPath;
    await fs.mkdir(this.pathToRids, { recursive: true });
  }

  public getLTOAccountAddress(): string {
    if (!!this._ltoAccount) return this._ltoAccount!.address;
    return '';
  }

  public async getLTOAccountBalance(address?: string) {
    if (!address) address = this.getLTOAccountAddress();
    const url = `https://testnet.lto.network/addresses/balance/${address}`;

    const response = await fetch(url);
    if (response.status == 200) {
      const data = await response.json();
      return data;
    } else { throw new Error(`Error fetching balance of address: ${address}`) }

  }

  public getLTOAccount(): Account {
    if (!this._ltoAccount) {
      throw new Error("Not logged in");
    }
    return this._ltoAccount;
  }

  async exists(rid: string): Promise<boolean> {
    return await fileExists(`${this.pathToRids}/${rid}`);
  }

  async existsRidTemplate(rid: string): Promise<boolean> {
    return await fileExists(`${this.pathToRids}/${rid}_template`);
  }


  private async checkLtoTransactionId(ltoTransactionId: string): Promise<TransactionIdData> {

    // FIRST WORKING METHOD
    const data = await this.httpService.axiosRef
    // .get(`https://nodes.lto.network/transactions/info/${ltoTransactionId}`)
    .get(`https://testnet.lto.network/transactions/info/${ltoTransactionId}`)
    .then((res) => res.data)
    .catch((err) => {
      throw new Error(
        err?.message + ': ' + JSON.stringify(err?.response?.data),
      );
    });
    // SECOND WORKING METHOD
    // const { data } = await firstValueFrom(
    //   this.httpService.get(`https://nodes.lto.network/transactions/info/${ltoTransactionId}`).pipe(
    //     catchError((error: AxiosError) => {
    //       //this.logger.error(error.response.data);
    //       throw 'An error happened!';
    //     }),
    //   ),
    // );

    // const url = `https://nodes.lto.network/transactions/info/${ltoTransactionId}`;
    // const response = await fetch(url);
    // const data = await response.json();
    console.log("data",data);
    // const thisServerAddress = "3JmZz5aaYXHCaXEnxGkoiM82Pu3tvjynBJE"; // test recipient address
    const thisServerAddress = this.getLTOAccountAddress();
    // Must be a transaction type
    if (data.type != 4) throw ('Wrong Transaction type');

    // txData.sender needs to be stored as allowed to claim the ownable
    // the sender will be able to claim the Ownable

    //check for correct amount and correct recipient (this servers' LTO wallet)
    if (data.amount < this.packageInfo.templateCost.template1) throw ('Wrong LTO amount for Template');
    if (data.recipient != thisServerAddress) throw ('Wrong recipient! Use Server LTO Wallet address');

    return {
      type: data.type,
      sender: data.sender,
      recipient: data.recipient,
      amount: data.amount,
    };
  }

  // const capabilitiesOwnable = {
  //   isDynamic: true,
  //   hasMetadata: false,
  //   hasWidgetState: false,
  //   isConsumable: false,
  //   isConsumer: false,
  //   isTransferable: true,
  // };

  private pkgOwnable:TypedPackage = {
    isDynamic: true,
    hasMetadata: false,
    hasWidgetState: false,
    isConsumable: false,
    isConsumer: false,
    isTransferable: true,
    title: "ownableTitle",
    name: "ownableName",
    description: "ownableDescription",
    cid: "",
    versions: [],
    keywords: []
  };
  
  private createEventChain(pkg: TypedPackage, nftNetworkString: string, nftId: number, nftLockService: string): EventChain {
    const chain = new EventChain(this._ltoAccount);
    let nftContractAddress = "";
    let nftNetwork = "";
    

    if(nftNetworkString === "Ethereum") {
      nftContractAddress="N/A";
      nftNetwork ="eip155:1";
    }else if(nftNetworkString === "Polygon") {
      // https://mumbai.polygonscan.com/address/0x0eb02E5382944EA6Bf3B79D3253b68289b5d7078#readContract
      nftContractAddress="0x0eb02E5382944EA6Bf3B79D3253b68289b5d7078"; // Mumbai Polygon
      nftNetwork ="eip155:2";
    }else if(nftNetworkString === "ArbitrumOne") {
      // https://sepolia.arbiscan.io/address/0x122aaFBA5668978378506417d75d4ef85CD55D61#readContract
      nftContractAddress="0x122aaFBA5668978378506417d75d4ef85CD55D61"; // Sepolia Arbitrum
      nftNetwork ="eip155:3";
    }
    else {
      throw("Unknown nft Network");
    }
   
    if (pkg.isDynamic) {
      const msg = {
        "@context": "instantiate_msg.json",
        ownable_id: chain.id,
        package: pkg.cid,
        network_id: this.networkId,
        keywords: pkg.keywords,
        nft: {
          network: nftNetwork, id: nftId.toString(), address: nftContractAddress, lock_service: nftLockService,
        },
      };

      new Event(msg)
        .addTo(chain)
        .signWith(this._ltoAccount);
    }

    return chain;
  }

  public getServerLTOwalletAddress(): string {
    return this.getLTOAccountAddress();
  }

  public templateCost(templateNumber: number) {
    if (templateNumber == 1)
      return this.packageInfo.templateCost.template1;
    throw ("Template Number does not exist");
  }

  private async readJsonFileFromZip(files: Map<string, Buffer>) {
    try {
      return JSON.parse(files.get('ownableData.json').toString())[0];
    } catch (error) {
      throw (`Failed to read JSON file ownableData.json`);
    }
  }

  // 1) unzip the files into memory (DONE)
  // 2) check for existing ownableData.json (DONE)
  // 3) read the ownableData.json file as jsonFile (DONE)
  // 4) TODO: checks on correct jsonFile content (not needed for PoC, also Colin can check the user input)
  // 4.1) check for the correct amount of LTO transferred in transactionID (DONE)
  // 4.2) provide GET request (REST-API) for Colin to get templateCost (DONE)
  // 4.3) create LTO Test Wallet for Ownable-NFT-Server (DONE)
  // 4.4) provide GET request (REST-API) for Colin to get LTO Server WalletAddress (DONE)
  // 5) Calculate the request ID based on the ownableData.json and Picture (DONE)
  // 6) cp -r the template of the Ownable into rid_template directory
  // 7) modify files inside accordingly
  // 8) execute Ownable creation
  // 9) create NFT on EVM Blockchain with input from 'jsonFile'
  // 10) generate "create Event" on Event chain (this adds the NFT ID to event chain)  (former import in ownable-sdk)
  // 10.1) Make Ownable claimable
  // 11) When Ownable claimed: transfer NFT ownership to ETH Test-Wallet (which will be in future the NFT_PUBLIC_USER_WALLET_ADDRESS)
  // 12) DONE.
  public async store(data: Uint8Array, verbose?: boolean): Promise<string> {
    try {    

      if (verbose) console.log("unzipping data...");
      const files = await this.unzip(data);

      if (verbose) console.log("checking for userOwnable.json existance...");
      if (!files.has('ownableData.json')) throw new Error("Invalid package: 'ownableData.json' is missing");

      if (verbose) console.log("reading JSON info data from zip for Ownable modification...");
      const jsonFile = await this.readJsonFileFromZip(files);
      // console.log("TX ID", jsonFile.OWNABLE_LTO_TRANSACTION_ID);

      
      
      if (verbose) console.log("LTO ACCOUNT:", this.getLTOAccountAddress());
      if (verbose) console.log("checking LTO transaction ID...");
      const transactionIdData:TransactionIdData = await this.checkLtoTransactionId(jsonFile.OWNABLE_LTO_TRANSACTION_ID);
      if (verbose) console.log("transactionIdData:", transactionIdData);
      
      if (verbose) console.log("getting request ID of input files...");
      const requestId = await this.getRid(files);
      
      if (verbose) console.log("checking for existance of already stored RID template...");
      // if (await this.existsRidTemplate(requestId)) return requestId;
      
      await this.storeFiles(requestId, files);
      await this.storeZip(requestId, data);
      
      return requestId;
      
      if (verbose) console.log("creating template with request ID and modifying files...");
      await this.copyTemplateAndModifyFiles(requestId, jsonFile);
      
      return "0";
      if (verbose) console.log("minting NFT on Arbitrum Sepolia testnet...");
      const nftOwner = jsonFile.NFT_PUBLIC_USER_WALLET_ADDRESS;
      const nftTokenURI = jsonFile.NFT_TOKEN_URI;      
      console.log("nftOwner",nftOwner);
      console.log("nftTokenURI",nftTokenURI);
      console.log("NFT_BLOCKCHAIN",jsonFile.NFT_BLOCKCHAIN);
      console.log("arbitrumsepolia", this.config.get('eth.contracts.arbitrum'));

      const nftcount = await this.nft.mintNFT(this.config.get('eth.contracts.arbitrum'), nftOwner, nftTokenURI);
      console.log("nftcount", nftcount);
      
      const chain = this.createEventChain(this.pkgOwnable,"ArbitrumOne", nftcount,"");
      console.log("chain", chain);
      console.log("chain1", chain.events[0].mediaType);
      console.log("chain2", chain.events[0].data);
      console.log("chain3", chain.events[0].hash);



    } catch (err) {
      throw (err);
    }
  }
  private async executeCommand(command: string) {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`error: ${error.message}`);
        throw new Error(`error: ${error.message}`);
      }
      if (stderr) {
        console.log(`stderr: ${stderr}`);
        throw new Error(`stderr: ${stderr}`);
      }
      console.log(`stdout: ${stdout}`);
    });
  }

  private async replaceLineInFile(file: string, key: string, value: string) {
    // console.log("file", file);
    // console.log("key", key);
    // console.log("value", value);
    const data = await fs.readFile(file, 'utf8');
    var formatted = data.replace(key, value);
    await fs.writeFile(file, formatted, 'utf8');
  }


  private async createOwnableZip(fileName: string) {
    
    const watcher = chokidar.watch(fileName).on('add', (event, path) => {
      // console.log("event", event); // Filename:  ../Ownables/ownable-sdk/ownables/ownable_first_create_ownable.zip
      // console.log("path", path);
      // console.log("Before unwatching", watcher.getWatched());
      
      // Filename.ZIP was created ! Code for Copy Zip File here!
      watcher.unwatch(fileName);
      // console.log("After unwatching", watcher.getWatched());
    });
  }


  private async copyTemplateAndModifyFiles(rid: string, jsonFile: any) {
    // await this.executeCommand("ls -la");
    await fs.mkdir(`${this.pathToRids}/${rid}_template`, { recursive: true });
    await fs.cp(`${this.pathToTemplates}/template1`, `${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}`, { "recursive": true });
    await fs.cp(`${this.pathToRids}/${rid}/${jsonFile.PLACEHOLDER2_IMG}`, `${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.PLACEHOLDER2_IMG}`);

    await this.replaceLineInFile(`${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(), "PLACEHOLDER1_NAME".toString(), `"${jsonFile.PLACEHOLDER1_NAME}"`.toString());
    await this.replaceLineInFile(`${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(), "PLACEHOLDER1_DESCRIPTION".toString(), `"${jsonFile.PLACEHOLDER1_DESCRIPTION}"`.toString());
    await this.replaceLineInFile(`${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(), "PLACEHOLDER1_VERSION".toString(), `"${jsonFile.PLACEHOLDER1_VERSION}"`.toString());
    await this.replaceLineInFile(`${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(), "PLACEHOLDER1_AUTHORS".toString(), `"${jsonFile.PLACEHOLDER1_AUTHORS}"`.toString());
    await this.replaceLineInFile(`${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(), "PLACEHOLDER1_KEYWORDS".toString(), arrayToString(jsonFile.PLACEHOLDER1_KEYWORDS));

    await this.replaceLineInFile(`${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/assets/index.html`.toString(), "PLACEHOLDER2_TITLE".toString(), `${jsonFile.PLACEHOLDER2_TITLE}`);
    await this.replaceLineInFile(`${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/assets/index.html`.toString(), "PLACEHOLDER2_IMG".toString(), `"${jsonFile.PLACEHOLDER2_IMG}"`.toString());

    await this.replaceLineInFile(`${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/examples/schema.rs`.toString(), "PLACEHOLDER3_MSG".toString(), `${jsonFile.PLACEHOLDER1_NAME}`);
    await this.replaceLineInFile(`${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/examples/schema.rs`.toString(), "PLACEHOLDER3_STATE".toString(), `${jsonFile.PLACEHOLDER1_NAME}`);

    await this.replaceLineInFile(`${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`.toString(), "PLACEHOLDER4_CONTRACT_NAME".toString(), `"crates.io:${jsonFile.PLACEHOLDER1_NAME}"`.toString());
    await this.replaceLineInFile(`${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`.toString(), "PLACEHOLDER4_TYPE".toString(), `"${jsonFile.PLACEHOLDER4_TYPE}"`.toString());
    await this.replaceLineInFile(`${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`.toString(), "PLACEHOLDER4_DESCRIPTION".toString(), `"${jsonFile.PLACEHOLDER4_DESCRIPTION}"`.toString());
    await this.replaceLineInFile(`${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`.toString(), "PLACEHOLDER4_NAME".toString(), `"${jsonFile.PLACEHOLDER4_NAME}"`.toString());

    await fs.cp(`${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}`, `../Ownables/ownable-sdk/ownables/${jsonFile.PLACEHOLDER1_NAME}`, { "recursive": true });

    await this.executeCommand(`cd ../Ownables/ownable-sdk/; npm run ownables:build --package=${jsonFile.PLACEHOLDER1_NAME}; cd ../../ownable-nft-server/`);
    await this.createOwnableZip(`../Ownables/ownable-sdk/ownables/${jsonFile.PLACEHOLDER1_NAME}.zip`);
    console.log("Ownable creation startet. Waiting for Zip File to be created...");

  }

  private async unzip(data: Uint8Array): Promise<Map<string, Buffer>> {
    const archive = await this.zip.loadAsync(data, { createFolders: true });

    const entries: Array<[string, Buffer]> = await Promise.all(
      Object.entries(archive.files)
        // .filter(([filename]) => filename !== 'chain.json')
        .map(async ([filename, file]) => [filename, await file.async('nodebuffer')]),
    );

    return new Map(entries);
  }

  private async getRid(files: Map<string, Buffer>): Promise<string> {
    const source = Array.from(files.entries()).map(([filename, content]) => ({
      path: `./${filename}`,
      content,
    }));

    for await (const entry of this.ipfs.addAll(source, { onlyHash: true, cidVersion: 1 })) {
      if (entry.path === entry.cid.toString() && !!entry.mode) return entry.cid.toString();
    }
    throw new Error('Failed to calculate directory CID: importer did not find a directory entry in the input files');
  }

  private async storeZip(cid: string, data: Uint8Array): Promise<void> {
    const file = path.join(this.pathToRids, `${cid}.zip`);
    await fs.writeFile(file, data);
  }
  private async storeFiles(cid: string, files: Map<string, Buffer>): Promise<void> {
    const packageDir = path.join(this.pathToRids, cid);
    await fs.mkdir(packageDir, { recursive: true });

    await Promise.all(
      Array.from(files.entries()).map(([filename, content]) => fs.writeFile(path.join(packageDir, filename), content)),
    );
  }
  uploadFile(file: Express.Multer.File) {
    return file;
  }
  create(createUploadZipDto: CreateUploadZipDto) {
    return 'This action adds a new uploadZip';
  }

  findAll() {
    return `This action returns all uploadZip`;
  }

  findOne(id: number) {
    return `This action returns a #${id} uploadZip`;
  }

  update(id: number, updateUploadZipDto: UpdateUploadZipDto) {
    return `This action updates a #${id} uploadZip`;
  }

  remove(id: number) {
    return `This action removes a #${id} uploadZip`;
  }
}
