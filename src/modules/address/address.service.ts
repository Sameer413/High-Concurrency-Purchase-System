import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Address } from './entities/address.entity';
import { CreateAddressDto } from './dto/create-address-dto';
import { UpdateAddressDto } from './dto/update-address-dto';


@Injectable()
export class AddressService {
  constructor(
    @InjectRepository(Address)
    private readonly addressRepo: Repository<Address>,
  ) {}

  async create(userId: string, dto: CreateAddressDto): Promise<Address> {
    if (dto.isDefault) {
      await this.clearDefault(userId);
    }

    const address = this.addressRepo.create({
      ...dto,
      userId,
    });

    return this.addressRepo.save(address);
  }

  async findAll(userId: string): Promise<Address[]> {
    return this.addressRepo.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(userId: string, id: string): Promise<Address> {
    const address = await this.addressRepo.findOne({
      where: { id, userId },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    return address;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<Address> {
    const address = await this.findOne(userId, id);

    if (dto.isDefault) {
      await this.clearDefault(userId);
    }

    Object.assign(address, dto);

    return this.addressRepo.save(address);
  }

  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    const address = await this.findOne(userId, id);

    await this.addressRepo.remove(address);

    return { deleted: true };
  }

  async setDefault(userId: string, id: string): Promise<Address> {
    await this.clearDefault(userId);

    const address = await this.findOne(userId, id);
    address.isDefault = true;

    return this.addressRepo.save(address);
  }

  private async clearDefault(userId: string): Promise<void> {
    await this.addressRepo.update(
      { userId, isDefault: true },
      { isDefault: false },
    );
  }
}
