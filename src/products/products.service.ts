import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { ImageProductEntity } from './entities/imageProduct.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { ProductStatus } from 'src/users/utility/common/product.status.enum';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private productRepo: Repository<Product>,

    @InjectRepository(CompanyEntity)
    private companyRepo: Repository<CompanyEntity>,

    @InjectRepository(CategoryEntity)
    private categoryRepo: Repository<CategoryEntity>,

    @InjectRepository(ImageProductEntity)
    private imageRepository: Repository<ImageProductEntity>,

    private readonly cloudinary: CloudinaryService
  ) { }

  // Création d'un produit
  async create(
    createProductDto: CreateProductDto,
    files: Express.Multer.File[],
    user: UserEntity,
  ): Promise<{ message: string; data: Product }> {
    const { categoryId, status, ...data } = createProductDto;

    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active trouvée pour cet utilisateur');
    }

    const company = await this.companyRepo.findOne({
      where: { id: user.activeCompanyId },
    });

    if (!company) {
      throw new NotFoundException('Entreprise active introuvable');
    }

    let category: CategoryEntity | null | undefined = undefined;
    if (categoryId) {
      category = await this.categoryRepo.findOne({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Catégorie non trouvée');
    }

    let imageUrl: string | undefined = undefined;
    if (files?.length > 0) {
      imageUrl = await this.cloudinary.handleUploadImage(files[0], 'product');
    }

    const productStatus = status || ProductStatus.PENDING; // Utiliser `PENDING` par défaut

    const product = this.productRepo.create({
      ...data,
      company,
      category,
      image: imageUrl,
      type: company.typeCompany,
      status: productStatus,
    });

    await this.productRepo.save(product);

    if (files?.length > 0) {
      const secondaryImages: ImageProductEntity[] = [];

      for (const file of files) {
        const uploaded = await this.cloudinary.handleUploadImage(file, 'product');
        const imageEntity = new ImageProductEntity();
        imageEntity.url = uploaded;
        imageEntity.product = product;
        secondaryImages.push(imageEntity);
      }

      await this.imageRepository.save(secondaryImages);
      product.images = secondaryImages;
    }

    return {
      message: 'Produit créé avec succès',
      data: product,
    };
  }



  // Récupérer un produit par son ID
  async findOne(id: string): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['company', 'category', 'images'], // Inclure les relations avec l'entreprise et la catégorie
    });

    if (!product) {
      throw new NotFoundException(`Produit introuvable avec l'ID: ${id}`);
    }

    return product;
  }

  async findByType(type?: string): Promise<Product[]> {
    const queryBuilder = this.productRepo.createQueryBuilder('product')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.images', 'images');

    if (type) {
      queryBuilder.where('product.type = :type', { type });
    }

    const products = await queryBuilder.getMany();

    if (products.length === 0) {
      throw new NotFoundException(`Aucun produit trouvé${type ? ` pour le type : ${type}` : ''}`);
    }

    return products;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findByCompany(companyId: string): Promise<any> {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },

    });

    if (!company) {
      throw new NotFoundException(`Entreprise avec l'ID ${companyId} introuvable`);
    }

    const products = await this.productRepo.find({
      where: { company: { id: companyId } },
      relations: ['category', 'images'],
    });

    // Fusionner les champs de la company + products
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { products: _, ...companyData } = company; // exclude old `products` if exists
    return {
      ...companyData,
      products,
    };
  }

  async groupByType(): Promise<Record<string, Product[]>> {
    const products = await this.productRepo.find({
      relations: ['company', 'category', 'images'],
    });

    const grouped = products.reduce((acc, product) => {
      const type = product.type;

      if (!acc[type]) {
        acc[type] = [];
      }

      acc[type].push(product);
      return acc;
    }, {} as Record<string, Product[]>);

    return grouped;
  }
  async findAllGroupedByCategory(categoryId?: string): Promise<{ data: (CategoryEntity & { products: Product[] })[] }> {
    const whereCondition = categoryId ? { category: { id: categoryId } } : {};

    const products = await this.productRepo.find({
      where: whereCondition,
      relations: ['company', 'category', 'images'],
    });

    if (products.length === 0) {
      throw new NotFoundException('Aucun produit trouvé');
    }

    const grouped = new Map<string, CategoryEntity & { products: Product[] }>();

    for (const product of products) {
      const category = product.category || { name: 'Aucune catégorie' } as CategoryEntity;
      const categoryKey = product.category?.id || 'no-category';

      if (!grouped.has(categoryKey)) {
        grouped.set(categoryKey, { ...category, products: [] });
      }

      grouped.get(categoryKey)!.products.push(product);
    }

    const result = Array.from(grouped.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    return { data: result };
  }

  async groupByType_First_Product(): Promise<Record<string, Product>> {
    const products = await this.productRepo.find({
      relations: ['company', 'category', 'images'],
      order: { createdAt: 'ASC' }, // pour s'assurer que le "premier" est bien le plus ancien
    });

    const grouped: Record<string, Product> = {};

    for (const product of products) {
      if (!grouped[product.type]) {
        grouped[product.type] = product; // ajouter seulement le premier pour chaque type
      }
    }

    return grouped;
  }

  async update(
    id: string,
    updateProductDto: CreateProductDto,
    files: Express.Multer.File[],
    user: UserEntity,
  ): Promise<{ message: string; data: Product }> {
    const { categoryId, status, ...data } = updateProductDto;  // Extraction du statut

    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['images'],
    });
    if (!product) throw new NotFoundException('Produit non trouvé');

    // Mise à jour des données, y compris le statut si fourni
    if (status) {
      product.status = status;
    }

    Object.assign(product, data);

    const company = await this.companyRepo.findOne({
      where: { id: user.activeCompanyId },
    });
    if (!company) throw new NotFoundException('Entreprise active non trouvée');
    product.company = company;
    product.type = company.typeCompany;

    if (categoryId) {
      const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Catégorie non trouvée');
      product.category = category;
    } else {
      product.category = undefined;
    }

    if (files && files.length > 0) {
      if (product.image) {
        await this.cloudinary.handleDeleteImage(product.image);
      }

      if (product.images?.length) {
        for (const img of product.images) {
          await this.cloudinary.handleDeleteImage(img.url);
        }
      }

      await this.imageRepository.delete({ product: { id: product.id } });

      const uploadedMainImage = await this.cloudinary.handleUploadImage(files[0], 'product');
      product.image = uploadedMainImage;

      const newImages: ImageProductEntity[] = [];
      for (const file of files.slice(1)) {
        const uploaded = await this.cloudinary.handleUploadImage(file, 'product');
        const imageEntity = new ImageProductEntity();
        imageEntity.url = uploaded;
        imageEntity.product = product;
        newImages.push(imageEntity);
      }

      await this.imageRepository.save(newImages);
      product.images = newImages;
    }

    const updatedProduct = await this.productRepo.save(product);

    return {
      message: 'Produit mis à jour avec succès',
      data: updatedProduct,
    };
  }





  async searchProducts(search: string) {
    const qb = this.productRepo.createQueryBuilder('product')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.images', 'images');

    if (search) {
      qb.where('product.name LIKE :search', { search: `%${search}%` })
        .orWhere('product.type LIKE :search', { search: `%${search}%` })
        .orWhere('category.name LIKE :search', { search: `%${search}%` })
        .orWhere('company.companyName LIKE :search', { search: `%${search}%` });
    }

    const results = await qb.getMany();

    return results;
  }

  // Supprimer un produit
  async remove(id: string): Promise<void> {
    const product = await this.findOne(id);
    await this.productRepo.remove(product);
  }
}
