import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import { exec } from 'child_process';

@Injectable()
export class UsersService {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(createUserDto: Prisma.UserCreateInput) {
    return await this.databaseService.user.create({
      data: createUserDto
    })
  }

  async findAll(role?: typeof Role.INTERN | typeof Role.ENGINEER | typeof Role.ADMIN) {
    exec("cd ../Ownables/ownable-sdk/ownables;ls -la", (error, stdout, stderr) => {
      if (error) {
          console.log(`error: ${error.message}`);
          return;
      }
      if (stderr) {
          console.log(`stderr: ${stderr}`);
          return;
      }
      console.log(`stdout: ${stdout}`);
  });
    if(role) return await this.databaseService.user.findMany({
      where: {
        // role: role
        role,
      }
    })
    return this.databaseService.user.findMany({})
  }

  async findOne(id: number) {
    const maxID = await this.databaseService.user.aggregate({
      _max: { id: true },
    })

    const ids = await this.databaseService.user.findUnique({
      where: {
        // id: id
        id,
      }
    })
    
    if(ids) return ids;
    
    return `User related to ID ${id} not found. MaxID is: ${maxID._max.id}`
  }

  async update(id: number, updateUserDto: Prisma.UserUpdateInput) {
    return await this.databaseService.user.update({
      where: {
        // id: id
        id,
      },
      data: updateUserDto
    })
    
  }

  async delete(id: number) {
    return await this.databaseService.user.delete({
      where: {
        // id: id
        id,
      },
    })
  }
}
