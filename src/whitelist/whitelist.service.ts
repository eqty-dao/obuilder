import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class WhitelistService implements OnModuleInit {
  private whitelistedAddresses: Map<string, boolean> = new Map();
  private adminAddresses: Map<string, boolean> = new Map();
  private whitelistPath: string;

  constructor(
    private readonly config: ConfigService,
  ) {
    // Set default whitelist path
    this.whitelistPath = 'data/whitelist.json';
  }

  async onModuleInit() {
    await this.loadWhitelist();
  }

  private async loadWhitelist() {
    try {
      const fileContent = await fs.readFile(this.whitelistPath, 'utf8');
      const whitelistData = JSON.parse(fileContent);
      
      // Reset maps
      this.whitelistedAddresses.clear();
      this.adminAddresses.clear();
      
      // Load whitelisted addresses
      if (whitelistData.whitelisted && Array.isArray(whitelistData.whitelisted)) {
        whitelistData.whitelisted.forEach((address: string) => {
          this.whitelistedAddresses.set(address, true);
        });
      }
      
      // Load admin addresses
      if (whitelistData.admins && Array.isArray(whitelistData.admins)) {
        whitelistData.admins.forEach((address: string) => {
          this.adminAddresses.set(address, true);
          // Admins are also whitelisted by default
          this.whitelistedAddresses.set(address, true);
        });
      }
    } catch (error) {
      // If file doesn't exist or is invalid, initialize with default data
      
      // Start with an empty list if we can't load existing data
      const initialAdmins: string[] = [];
      
      // Try to get an admin address from environment or config if available
      try {
        const nodeConfig = this.config.get('lto.node');
        if (nodeConfig && typeof nodeConfig.mainnet === 'string' && nodeConfig.mainnet.length > 0) {
          // Just as a placeholder - you should replace this with actual admin address
          initialAdmins.push(nodeConfig.mainnet);
        }
      } catch (err) {
        // Config path not found, use empty array
      }
      
      // Add admins and save
      initialAdmins.forEach(admin => {
        this.adminAddresses.set(admin, true);
        this.whitelistedAddresses.set(admin, true);
      });
      
      await this.saveWhitelist();
    }
  }

  private async saveWhitelist() {
    const whitelistData = {
      whitelisted: Array.from(this.whitelistedAddresses.keys()),
      admins: Array.from(this.adminAddresses.keys()),
    };
    
    // Ensure directory exists
    const dir = path.dirname(this.whitelistPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Write the file
    await fs.writeFile(this.whitelistPath, JSON.stringify(whitelistData, null, 2), 'utf8');
  }

  public isWhitelisted(address: string): boolean {
    return this.whitelistedAddresses.has(address);
  }

  public isAdmin(address: string): boolean {
    return this.adminAddresses.has(address);
  }

  public async addToWhitelist(address: string, adminAddress: string): Promise<boolean> {
    // Check if requester is admin
    if (!this.isAdmin(adminAddress)) {
      return false;
    }
    
    this.whitelistedAddresses.set(address, true);
    await this.saveWhitelist();
    return true;
  }

  public async removeFromWhitelist(address: string, adminAddress: string): Promise<boolean> {
    // Check if requester is admin
    if (!this.isAdmin(adminAddress)) {
      return false;
    }
    
    // Don't allow removing admins from whitelist
    if (this.isAdmin(address)) {
      return false;
    }
    
    this.whitelistedAddresses.delete(address);
    await this.saveWhitelist();
    return true;
  }

  public async addAdmin(address: string, requestingAdmin: string): Promise<boolean> {
    // Check if requester is admin
    if (!this.isAdmin(requestingAdmin)) {
      return false;
    }
    
    this.adminAddresses.set(address, true);
    this.whitelistedAddresses.set(address, true); // Admins are automatically whitelisted
    await this.saveWhitelist();
    return true;
  }

  public async removeAdmin(address: string, requestingAdmin: string): Promise<boolean> {
    // Check if requester is admin
    if (!this.isAdmin(requestingAdmin)) {
      return false;
    }
    
    // Don't allow removing self
    if (address === requestingAdmin) {
      return false;
    }
    
    this.adminAddresses.delete(address);
    await this.saveWhitelist();
    return true;
  }

  public getWhitelistedAddresses(): string[] {
    return Array.from(this.whitelistedAddresses.keys());
  }

  public getAdminAddresses(): string[] {
    return Array.from(this.adminAddresses.keys());
  }
} 