import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateSubOrderItemDto } from './dto/create-sub_order_item.dto';
import { UpdateSubOrderItemDto } from './dto/update-sub_order_item.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { SubOrderItemEntity } from './entities/sub_order_item.entity';
import { Repository } from 'typeorm';

@Injectable()
export class SubOrderItemService {
  constructor(
    @InjectRepository(SubOrderItemEntity) private readonly itemRepo: Repository<SubOrderItemEntity>,
  ) {}

  async create(dto: CreateSubOrderItemDto): Promise<SubOrderItemEntity> {
    const item = this.itemRepo.create(dto);
    return this.itemRepo.save(item);
  }
  async removeBySubOrderId(subOrderId: string) {
    await this.itemRepo.delete({ subOrderId });
  }

  async findAll(): Promise<SubOrderItemEntity[]> {
    return this.itemRepo.find({ relations: ['product', 'subOrder'] });
  }

  async findOne(id: string): Promise<SubOrderItemEntity> {
    const item = await this.itemRepo.findOne({ where: { id }, relations: ['product', 'subOrder'] });
    if (!item) throw new NotFoundException('Article non trouvé');
    return item;
  }

  async update(id: string, dto: UpdateSubOrderItemDto): Promise<SubOrderItemEntity> {
    await this.findOne(id);
    await this.itemRepo.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.itemRepo.delete(id);
  }
}

