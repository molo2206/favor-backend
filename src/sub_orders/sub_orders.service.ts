import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateSubOrderDto } from './dto/create-sub_order.dto';
import { UpdateSubOrderDto } from './dto/update-sub_order.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { SubOrderEntity } from './entities/sub_order.entity';
import { Repository } from 'typeorm';
import { SubOrderItemService } from 'src/sub_order_items/sub_order_items.service';
import { UserEntity } from 'src/users/entities/user.entity';

@Injectable()
export class SubOrderService {
  constructor(
    @InjectRepository(SubOrderEntity) private readonly subOrderRepo: Repository<SubOrderEntity>,
    private readonly itemService: SubOrderItemService,
  ) { }

  async create(dto: CreateSubOrderDto, user: UserEntity): Promise<SubOrderEntity> {
    const subOrder = this.subOrderRepo.create({
      ...dto,
      createdBy: user, // ✅ on injecte l'entité utilisateur complète ici
    });

    return this.subOrderRepo.save(subOrder);
  }

  async removeByOrderId(orderId: string) {
    await this.subOrderRepo.delete({ orderId });
  }
  async findAll(): Promise<SubOrderEntity[]> {
    return this.subOrderRepo.find({ relations: ['order', 'items'] });
  }

  async findOne(id: string): Promise<SubOrderEntity> {
    const sub = await this.subOrderRepo.findOne({ where: { id }, relations: ['order', 'items'] });
    if (!sub) throw new NotFoundException('Sous-commande non trouvée');
    return sub;
  }

  async update(id: string, dto: UpdateSubOrderDto): Promise<SubOrderEntity> {
    await this.findOne(id);
    await this.subOrderRepo.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.subOrderRepo.delete(id);
  }
}
