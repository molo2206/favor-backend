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
import { MeasureEntity } from 'src/measure/entities/measure.entity';

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

    private readonly cloudinary: CloudinaryService,

    @InjectRepository(MeasureEntity)
    private readonly measureRepo: Repository<MeasureEntity>
  ) { }

  // Création d'un produit
  async create(
    createProductDto: CreateProductDto,
    files: Express.Multer.File[],
    user: UserEntity,
  ): Promise<{ message: string; data: Product }> {
    const { categoryId, status, measureId, ...data } = createProductDto;

    // ✅ Vérification du nombre d'images (obligatoire : min 2, max 4)
    if (!files || files.length < 2 || files.length > 4) {
      throw new BadRequestException('Vous devez fournir entre 2 et 4 images');
    }

    // Vérification de l'entreprise active de l'utilisateur
    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active trouvée pour cet utilisateur');
    }

    const company = await this.companyRepo.findOne({
      where: { id: user.activeCompanyId },
    });

    if (!company) {
      throw new NotFoundException('Entreprise active introuvable');
    }

    // Gestion de la catégorie
    let category: CategoryEntity | null | undefined = undefined;
    if (categoryId) {
      category = await this.categoryRepo.findOne({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Catégorie non trouvée');
    }

    // Gestion de la mesure
    let measure: MeasureEntity | null | undefined = undefined;
    if (measureId) {
      measure = await this.measureRepo.findOne({ where: { id: measureId } });
      if (!measure) throw new NotFoundException('Mesure non trouvée');
    }

    // ✅ Téléchargement de la première image (image principale)
    const mainImage = await this.cloudinary.handleUploadImage(files[0], 'product');

    const productStatus = status || ProductStatus.PENDING;

    // Création du produit
    const product = this.productRepo.create({
      ...data,
      company,
      category,
      measure,
      image: mainImage,
      type: company.typeCompany,
      status: productStatus,
    });

    await this.productRepo.save(product);

    // ✅ Téléchargement des images secondaires (y compris la principale à nouveau si souhaité)
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
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure');

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
  async findByActiveCompanyForUser(user: UserEntity): Promise<any> {
    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active trouvée pour cet utilisateur');
    }

    const company = await this.companyRepo.findOne({
      where: { id: user.activeCompanyId },
    });

    if (!company) {
      throw new NotFoundException(`Entreprise avec l'ID ${user.activeCompanyId} introuvable`);
    }

    const products = await this.productRepo.find({
      where: { company: { id: user.activeCompanyId } },
      relations: ['category', 'images', 'measure'],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    const { products: _, ...companyData } = company as any;

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
    const { categoryId, status, measureId, ...data } = updateProductDto;  // Extraction du statut et de measureId

    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['images'],
    });
    if (!product) throw new NotFoundException('Produit non trouvé');

    // Mise à jour du statut si fourni
    if (status) {
      product.status = status;
    }

    // Mise à jour des autres données du produit
    Object.assign(product, data);

    const company = await this.companyRepo.findOne({
      where: { id: user.activeCompanyId },
    });
    if (!company) throw new NotFoundException('Entreprise active non trouvée');
    product.company = company;
    product.type = company.typeCompany;

    // Mise à jour de la catégorie si fournie
    if (categoryId) {
      const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Catégorie non trouvée');
      product.category = category;
    } else {
      product.category = undefined;
    }

    // Mise à jour de la mesure si un measureId est fourni
    if (measureId) {
      const measure = await this.measureRepo.findOne({ where: { id: measureId } });
      if (!measure) throw new NotFoundException('Mesure non trouvée');
      product.measure = measure;
    } else {
      product.measure = undefined;  // Si aucun measureId n'est fourni, on supprime la mesure
    }

    // Gestion des fichiers et des images
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

    // Sauvegarder les modifications du produit
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
