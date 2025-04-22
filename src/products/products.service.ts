import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { ImageProductEntity } from './entities/imageProduct.entity';

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
  async create(createProductDto: CreateProductDto, files: Express.Multer.File[]): Promise<Product> {
    const { companyId, categoryId, ...data } = createProductDto;

    // Recherche de l'entreprise
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Entreprise non trouvée');

    // Recherche de la catégorie (si fournie)
    let category: CategoryEntity | undefined = undefined;
    if (categoryId) {
      const foundCategory = await this.categoryRepo.findOne({ where: { id: categoryId } });
      if (!foundCategory) throw new NotFoundException('Catégorie non trouvée');
      category = foundCategory;
    }

    let imageUrl: string | undefined = undefined;
    if (files && files.length > 0) {
      imageUrl = await this.cloudinary.handleUploadImage(files[0], 'product');
    }

    // Création du produit avec l'image principale
    const product = this.productRepo.create({
      ...data,
      company,
      category,
      image: imageUrl,
    });

    await this.productRepo.save(product); // On sauvegarde ici avant d'associer les images secondaires

    if (files && files.length > 0) {
      const newImages: ImageProductEntity[] = [];

      for (const file of files) {
        const uploaded = await this.cloudinary.handleUploadImage(file, 'product');

        const imageEntity = new ImageProductEntity();
        imageEntity.url = uploaded;
        imageEntity.product = product;

        newImages.push(imageEntity);
      }

      await this.imageRepository.save(newImages);
      product.images = newImages;
    }
    return product;
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

  async update(id: string, updateProductDto: CreateProductDto, files: Express.Multer.File[]): Promise<Product> {
    const { companyId, categoryId, ...data } = updateProductDto;

    // Récupération du produit existant
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['images'],
    });
    if (!product) throw new NotFoundException('Produit non trouvé');

    // Mise à jour des champs de base
    Object.assign(product, data);

    // Mise à jour de l'entreprise si changée
    if (companyId) {
      const company = await this.companyRepo.findOne({ where: { id: companyId } });
      if (!company) throw new NotFoundException('Entreprise non trouvée');
      product.company = company;
    }

    // Mise à jour de la catégorie si fournie
    if (categoryId) {
      const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Catégorie non trouvée');
      product.category = category;
    }

    if (files && files.length > 0) {
      // 🔥 Supprimer l'image principale précédente (si elle existe)
      if (product.image) {
        await this.cloudinary.handleDeleteImage(product.image);
      }

      // 🔥 Supprimer toutes les anciennes images secondaires de Cloudinary
      if (product.images && product.images.length > 0) {
        for (const img of product.images) {
          await this.cloudinary.handleDeleteImage(img.url);
        }
      }

      // 🔥 Supprimer les entrées en base liées aux anciennes images
      await this.imageRepository.delete({ product: { id: product.id } });

      // 🖼️ Upload de la nouvelle image principale
      const uploadedMainImage = await this.cloudinary.handleUploadImage(files[0], 'product');
      product.image = uploadedMainImage;

      // 🖼️ Upload des nouvelles images secondaires (le reste)
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

    return this.productRepo.save(product);
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
