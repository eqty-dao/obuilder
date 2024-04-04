import { Inject, Injectable, OnModuleInit, StreamableFile } from '@nestjs/common';
import { CreateUploadZipDto } from './dto/create-upload-zip.dto';
import { UpdateUploadZipDto } from './dto/update-upload-zip.dto';
import { ConfigService } from '../common/config/config.service';
import { rmSync, cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, createWriteStream, createReadStream } from 'fs';
import arrayToString from '../utils/arrayToString';
import JSZip from 'jszip';
import fileExists from '../utils/fileExists';
import path from 'path';
import { HttpService } from '@nestjs/axios';
// import { catchError, firstValueFrom } from 'rxjs';
// import { AxiosError } from 'axios';
import { Account, Binary, LTO, Transaction, Event, EventChain } from "@ltonetwork/lto";
import { exec } from 'child_process';
import chokidar from 'chokidar';
import { NftInfo, OwnableInfo } from '../interfaces/OwnableInfo';
import { TransactionIdData } from '../interfaces/TransactionIdData';
import { TypedPackage } from "../interfaces/TypedPackage";
import { NFTService } from '../nft/nft.service';
import { IEventChainJSON } from '@ltonetwork/lto/interfaces';
// import { json } from 'node:stream/consumers';
// import { stringify } from 'querystring';

@Injectable()
export class UploadZipService implements OnModuleInit {
  private pathToRids: string;
  private pathToCids: string;
  private pathToTemplates: string;
  private packageInfo: any;
  // private watcherBool: boolean;
  private lto = new LTO(this.config.get('lto.networkId'));
  private readonly _ltoAccount?: Account = this.lto.account({ seed: this.config.get('lto.account.seed') });
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
    this.pathToCids = this.packageInfo.ownableCidPath;
    this.pathToTemplates = this.packageInfo.ownableTemplatesPath;
    mkdirSync(this.pathToRids, { recursive: true });
    mkdirSync(this.pathToCids, { recursive: true });
  }

  public async GetServerETHBalance(): Promise<string> {
    console.log("nft");
    return await this.nft.GetServerETHBalance();
  }
  public getLTOAccountAddress(): string {
    if (!!this._ltoAccount) return this._ltoAccount!.address;
    return '';
  }

  public async getLTOAccountBalance(address?: string) {
    if (!address) address = this.getLTOAccountAddress();
    const url = `${this.config.get('lto.node')}/addresses/balance/${address}`;

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

  async existsRid(rid: string): Promise<boolean> {
    return await fileExists(`${this.pathToRids}/${rid}`);
  }

  async existsRidTemplate(rid: string): Promise<boolean> {
    return await fileExists(`${this.pathToRids}/${rid}/${rid}_template`);
  }
  async existsCid(cid: string): Promise<boolean> {
    return await fileExists(`${this.pathToCids}/${cid}/${cid}.zip`);
  }

  private async checkLtoTransactionId(ltoTransactionId: string, templateId: number, chain: String): Promise<TransactionIdData> {

    // FIRST WORKING METHOD
    const data = await this.httpService.axiosRef
      .get(`${this.config.get('lto.node')}/transactions/info/${ltoTransactionId}`)
      .then((res) => res.data)
      .catch((err) => {
        throw new Error(
          err?.message + ': ' + JSON.stringify(err?.response?.data),
        );
      });
    // SECOND WORKING METHOD
    // const { data } = await firstValueFrom(
    //   this.httpService.get(`${this.config.get('lto.node')}/transactions/info/${ltoTransactionId}`).pipe(
    //     catchError((error: AxiosError) => {
    //       //this.logger.error(error.response.data);
    //       throw 'An error happened!';
    //     }),
    //   ),
    // );

    // THIRD WORKING METHOD - requires node >= v18
    // const url = `${this.config.get('lto.node')}/transactions/info/${ltoTransactionId}`;
    // const response = await fetch(url);
    // const data = await response.json();
    const thisServerAddress = this.getLTOAccountAddress();
    
    // for debugging...
    // const data = {
    //   type: 4,
    //   sender: "3N5vwNey9aFkyrQ5KUzMt3qfuwg5jKKzrLB",
    //   recipient: thisServerAddress,
    //   amount: this.packageInfo.templateCost.template1,
    // };
    
    // Must be a transaction type
    if (data.type != 4) throw ('Wrong Transaction type');

    if (this.packageInfo.templateCost.chain[templateId] === undefined) throw (`Undefined templateCost for chain ${chain}`);
    //check for correct amount and correct recipient (this servers' LTO wallet)
    if (data.amount < this.packageInfo.templateCost.chain[templateId]) throw ('Wrong LTO amount for Template');
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
  async getCIDs() {
    let cids: string[] = new Array();
    try {
      const files = readdirSync(`${this.pathToCids}/`);
      files.forEach(file => {
        if (file.match(/.json$/g)) {
          cids.push(file.replace(".json", ""))
        }
      })

    } catch (err) {
      console.log(err);

    }
    return cids;
  }
  async getRequestIDs() {
    let requestIDs: string[] = new Array();
    try {
      const files = readdirSync(`${this.pathToRids}/`);
      files.forEach(file => {
        if (file.match(/.zip$/g)) {
          requestIDs.push(file.replace(".zip", ""))
        }
      })

    } catch (err) {
      console.log(err);

    }
    return requestIDs;
  }

  private async createEventChain(pkg: TypedPackage, nftInfo: NftInfo, sender: string): Promise<Buffer> {
    const chain = new EventChain(this._ltoAccount);
    var buf: Buffer;
    if (pkg.isDynamic) {
      const msg = {
        "@context": "instantiate_msg.json",
        ownable_id: chain.id,
        package: pkg.cid,
        network_id: this.networkId,
        keywords: pkg.keywords,
        nft: {
          network: nftInfo.network, id: nftInfo.id.toString(), address: nftInfo.contractAddress, lock_service: nftInfo.lock_service,
        },
      };

      new Event(msg)
        .addTo(chain)
        .signWith(this._ltoAccount);

      new Event({ "@context": 'execute_msg.json', transfer: { to: sender } }).addTo(chain).signWith(this._ltoAccount);
      // console.log("CHAIN2:", JSON.stringify(chain));
      // console.log("CHAIN3:", chain);

      // IMPORTANT: THIS NEEDS TO BE ENABLED !
      // const appendedEvents = chain.startingWith(chain.events[0]);
      // const anchorMap1 = appendedEvents.anchorMap;
      // await this.lto.anchor(this._ltoAccount, ...anchorMap1);

      chain.validate();
      const genesisSigner = this.lto.account(chain.events[0].signKey);
      if (!chain.isCreatedBy(genesisSigner))
        throw new Error('Event chain hijacking: genesis event not signed by chain creator');
      else {
        console.log("All good! Genesis signer correct")
      }

      writeFileSync(`${this.pathToCids}/${pkg.cid}.json`, JSON.stringify(chain));

      const file = readFileSync(`${this.pathToCids}/${pkg.cid}.json`, { encoding: 'utf8' });
      buf = Buffer.from(file, 'utf8');

      // Checking the import of the EvenChain json if this still works (e.g. for ownable-sdk)
      const data: IEventChainJSON = JSON.parse(JSON.stringify(chain));
      const chain1 = EventChain.from(data);
      chain1.validate();
      if (!chain1.isCreatedBy(genesisSigner))
        throw new Error('Event chain hijacking: genesis event not signed by chain creator');
      else {
        console.log("All good! Genesis signer correct")
      }
    }

    return buf;
  }


  public getServerLTOwalletAddress(): string {
    return this.getLTOAccountAddress();
  }

  public templateCost(templateId: number, chain:string) {
    if (this.packageInfo.templateCost[chain][templateId] === undefined) {
      throw (`Undefined Template cost for template number ${templateId} and chain: ${chain}`);
    }
    console.log("templateId", templateId, " cost: ", this.packageInfo.templateCost[chain][templateId]);
    return {
      'ethereum': (this.packageInfo.templateCost.ethereum[templateId]).toString(),
      'arbitrum': (this.packageInfo.templateCost.arbitrum[templateId]).toString(),
      'matic': (this.packageInfo.templateCost.matic[templateId]).toString()
    }

  }

  private async readJsonFileFromZip(files: Map<string, Buffer>) {
    try {
      return JSON.parse(files.get('ownableData.json').toString())[0];
    } catch (error) {
      throw (`Failed to read JSON file ownableData.json`);
    }
  }

  private async mintNewNft(jsonFile: any, verbose: boolean): Promise<NftInfo> {
    let nftNetwork: string;
    let nftContractAddress: string;
    if (jsonFile.NFT_BLOCKCHAIN === 'ethereum') {
      nftContractAddress = this.config.get('eth.contracts.ethereum');
      nftNetwork = "eip155:1"; // Sven TODO These need to be checked as testnets have other IDs !
    } else if (jsonFile.NFT_BLOCKCHAIN === 'arbitrum') {
      nftContractAddress = this.config.get('eth.contracts.arbitrum');
      nftNetwork = "eip155:2";
    } else if (jsonFile.NFT_BLOCKCHAIN === 'matic') {
      nftContractAddress = this.config.get('eth.contracts.matic');
      nftNetwork = "eip155:3";
    } else {
      throw (`Unsupported Blockchain: ${jsonFile.NFT_BLOCKCHAIN}`);
    }
    if (verbose) console.log(`minting via NFT contract at: ${nftContractAddress} `);

    const nftOwner = jsonFile.NFT_PUBLIC_USER_WALLET_ADDRESS;
    const nftTokenURI = jsonFile.NFT_TOKEN_URI;
    if (verbose) console.log("nftOwner", nftOwner);
    if (verbose) console.log("nftTokenURI", nftTokenURI);
    if (verbose) console.log("NFT_BLOCKCHAIN", jsonFile.NFT_BLOCKCHAIN);

    const nftcount = 78;
    // const nftcount = await this.nft.mintNFT(nftContractAddress, nftOwner, nftTokenURI);
    if (verbose) console.log("nftcount", nftcount);

    return {
      network: nftNetwork,    // eip155:1
      contractAddress: nftContractAddress,  // 0x341...
      id: nftcount, // 1, 2, 3
      lock_service: "",
    }

  }

  public async store(data: Uint8Array, verbose?: boolean): Promise<string> {
    try {

      if (verbose) console.log("unzipping data...");
      const requestIdFiles = await this.unzip(data);

      if (verbose) console.log("checking for userOwnable.json existance...");
      if (!requestIdFiles.has('ownableData.json')) throw new Error("Invalid package: 'ownableData.json' is missing");

      if (verbose) console.log("reading JSON info data from zip for Ownable modification...");
      const jsonFile = await this.readJsonFileFromZip(requestIdFiles);
      if (verbose) console.log("ownableData.json", jsonFile);

      if (verbose) console.log("LTO ACCOUNT:", this.getLTOAccountAddress());
      if (verbose) console.log("checking LTO transaction ID...", jsonFile.OWNABLE_LTO_TRANSACTION_ID);

      const transactionIdData: TransactionIdData = await this.checkLtoTransactionId(jsonFile.OWNABLE_LTO_TRANSACTION_ID, 1, "arbitrum");
      if (verbose) console.log("transactionIdData:", transactionIdData);

      if (verbose) console.log("getting request ID of input requestIdFiles...");
      const requestId = await this.getUniqueId(requestIdFiles);

      // if (verbose) console.log("checking for existance of already stored RID template...");
      // if (await this.existsRidTemplate(requestId)) return requestId;

      if (!(await this.existsRid(requestId))) {
        await this.storeFiles(this.pathToRids, requestId, requestIdFiles);
        await this.storeZip(this.pathToRids, requestId, data);
      }

      // Before creating the Ownable a new NFT is minted with NFT id and the user NFT input data is checked
      const nftInfo: NftInfo = await this.mintNewNft(jsonFile, verbose);

      if (verbose) console.log(`creating template with request ID ${requestId} and modifying requestIdFiles...`);
      await this.startOwnableCreation(requestId, jsonFile, nftInfo, transactionIdData.sender, verbose);

      return requestId;

    } catch (err) {
      throw (err);
    }
  }
  private async executeCommand(command: string) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.log(`error: ${error.message}`);
          throw new Error(`error: ${error.message}`);
        }
        resolve(stdout ? stdout : stderr);
      });
    });
  }

  private async replaceLineInFile(file: string, key: string, value: string) {
    // console.log("file", file);
    // console.log("key", key);
    // console.log("value", value);
    // const data = readFileSync(file, 'utf8');
    // var formatted = data.replace(key, value);
    // writeFileSync(file, formatted, 'utf8');
    const data = readFileSync(file, 'utf8');
    var formatted = data.replace(key, value);
    writeFileSync(file, formatted, 'utf8');
  }


  private async watchFileCreation(fileName: string, jsonFile: any, nftInfo: NftInfo, sender: string, verbose: boolean) {
    console.log("watching for file creation ", fileName);
    const watcher = chokidar.watch(fileName).on('add', async (event, path1) => {
      console.log("Watcher: created Ownable Zip File done:", event);
      // console.log("event", event); // Filename:  ../ownable-sdk/ownables/ownable_first_create_ownable.zip
      // console.log("path", path);
      const ownableZip = `${this.pathToCids}/created_ownable.zip`;
      // console.log("cpSync", ownableZip);
      cpSync(event, ownableZip);
      // rmSync(event);
      if (verbose) console.log("unzipping the created ownable to produce unique cid...");
      const cidFiles = await this.unzip(ownableZip);

      if (verbose) console.log("getting unique chain ID from created ownable zip files...");
      const cid = await this.getUniqueId(cidFiles);


      // Creating the EventChain ...
      const pkgOwnable: TypedPackage = {
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
      pkgOwnable.cid = `${cid}`;
      pkgOwnable.keywords = jsonFile.PLACEHOLDER1_KEYWORDS;

      const chainBuffer: Buffer = await this.createEventChain(pkgOwnable, nftInfo, sender); // sender from TX ID is new ownable owner
      //adding eventChain to cidFiles
      cidFiles.set('chain.json', chainBuffer);



      // const file = path.join(this.pathToCids, `${cid}_claim.zip`);
      // if (verbose) console.log("checking for existance of already stored RID template...");
      // if (await this.existsCid(cid) == false) {
      await this.storeFiles(this.pathToCids, cid, cidFiles);
      cpSync(ownableZip, `${this.pathToCids}/${cid}.zip`);
      rmSync(ownableZip);
      console.log("PATH", `${this.pathToCids}/${cid}`);

      var new_zip = new JSZip();

      const zipFile: Buffer = readFileSync(`${this.pathToCids}/${cid}.zip`)
      await new_zip.loadAsync(zipFile);

      const eventChainJsonFile: Buffer = readFileSync(`${this.pathToCids}/${pkgOwnable.cid}.json`)
      new_zip.file('eventChain.json', eventChainJsonFile);

      const claimFileName = `${this.pathToCids}/${cid}_claim.zip`;


      const content = await new_zip.generateAsync({ type: "uint8array" });
      console.log("claimFile", claimFileName)
      console.log("cid", cid)
      writeFileSync(claimFileName, content);

      watcher.unwatch(fileName);
    });
  }


  private async startOwnableCreation(rid: string, jsonFile: any, nftInfo: NftInfo, sender: string, verbose: boolean) {
    // await this.executeCommand("ls -la");

    mkdirSync(`${this.pathToRids}/${rid}_template`, { recursive: true });

    cpSync(`${this.pathToTemplates}/template1`, `${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}`, { "recursive": true });
    cpSync(`${this.pathToRids}/${rid}/${jsonFile.PLACEHOLDER2_IMG}`, `${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.PLACEHOLDER2_IMG}`);

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

    cpSync(`${this.pathToRids}/${rid}_template/${jsonFile.PLACEHOLDER1_NAME}`, `../ownable-sdk/ownables/${jsonFile.PLACEHOLDER1_NAME}`, { "recursive": true });

    console.log("Building Ownable...");
    await this.executeCommand(`cd ../ownable-sdk/; npm run ownables:build --package=${jsonFile.PLACEHOLDER1_NAME}; cd ../ownable-nft-server/`);
    await this.watchFileCreation(`../ownable-sdk/ownables/${jsonFile.PLACEHOLDER1_NAME}.zip`, jsonFile, nftInfo, sender, verbose);

    console.log("Ownable creation startet. Waiting for Zip File to be created...");

  }

  private async unzip(data: Uint8Array | string): Promise<Map<string, Buffer>> {
    let archive: JSZip;
    if (typeof data === "string") {
      const data1 = readFileSync(data);
      archive = await this.zip.loadAsync(data1, { createFolders: true });

    } else {
      archive = await this.zip.loadAsync(data, { createFolders: true });
    }

    // const archive = await this.zip.loadAsync(data, { createFolders: true });

    const entries: Array<[string, Buffer]> = await Promise.all(
      Object.entries(archive.files)
        // .filter(([filename]) => filename !== 'chain.json')
        .map(async ([filename, file]) => [filename, await file.async('nodebuffer')]),
    );

    return new Map(entries);
  }

  private async getUniqueId(files: Map<string, Buffer>): Promise<string> {
    const source = Array.from(files.entries()).map(([filename, content]) => ({
      path: `./${filename}`,
      content,
    }));

    for await (const entry of this.ipfs.addAll(source, { onlyHash: true, cidVersion: 1 })) {
      if (entry.path === entry.cid.toString() && !!entry.mode) return entry.cid.toString();
    }
    throw new Error('Failed to calculate directory CID: importer did not find a directory entry in the input files');
  }

  private async storeZip(destPath: string, cid: string, data: Uint8Array): Promise<void> {
    const file = path.join(destPath, `${cid}.zip`);
    writeFileSync(file, data);
  }


  async claim(requestId: string, signer?: Account): Promise<StreamableFile> {
    console.log("chainId", requestId);

    if (!(await fileExists(`${this.pathToCids}/${requestId}_claim.zip`))) {
      throw (`Request ID ${requestId} does not have a claimable Ownable`);
    }

    const file = createReadStream(`${this.pathToCids}/${requestId}_claim.zip`);
    return new StreamableFile(file);


  }

  async zipped(cid: string): Promise<JSZip> {
    const data = readFileSync(`${this.pathToCids}/${cid}.zip`, 'utf8');
    return await this.zip.loadAsync(data, { createFolders: true });
  }

  private async storeFiles(destPath: string, cid: string, files: Map<string, Buffer>): Promise<void> {
    const packageDir = path.join(destPath, cid);
    mkdirSync(packageDir, { recursive: true });

    await Promise.all(
      Array.from(files.entries()).map(([filename, content]) => writeFileSync(path.join(packageDir, filename), content)),
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
