import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private productRepo: Repository<Product>,

    @InjectRepository(CompanyEntity)
    private companyRepo: Repository<CompanyEntity>,

    @InjectRepository(CategoryEntity)
    private categoryRepo: Repository<CategoryEntity>,
  ) { }

  // Création d'un produit
  async create(createProductDto: CreateProductDto, imagePath?: string): Promise<Product> {
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

    // Création du produit avec l'image
    const product = this.productRepo.create({
      ...data,
      company,
      category,
      image: imagePath, // Si une image est téléchargée, son chemin est stocké
    });

    return this.productRepo.save(product);
  }

  // Récupérer tous les produits
  async findAll(): Promise<Product[]> {
    return this.productRepo.find({
      relations: ['company', 'category'], // Inclure les relations avec l'entreprise et la catégorie
    });
  }

  // Récupérer un produit par son ID
  async findOne(id: string): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['company', 'category'], // Inclure les relations avec l'entreprise et la catégorie
    });

    if (!product) {
      throw new NotFoundException(`Produit introuvable avec l'ID: ${id}`);
    }

    return product;
  }

  async findByType(type: string): Promise<Product[]> {
    const products = await this.productRepo.find({
      where: { type },
      relations: ['company', 'category'],
    });

    if (products.length === 0) {
      throw new NotFoundException(`Aucun produit trouvé pour le type : ${type}`);
    }

    return products;
  }

  async groupByType(): Promise<Record<string, Product[]>> {
    const products = await this.productRepo.find({ relations: ['company', 'category'] });

    const grouped = products.reduce((acc, product) => {
      if (!acc[product.type]) {
        acc[product.type] = [];
      }
      acc[product.type].push(product);
      return acc;
    }, {} as Record<string, Product[]>);

    return grouped;
  }

  // Méthode pour mettre à jour un produit
  async update(id: string, createProductDto: CreateProductDto, imagePath?: string): Promise<Product> {
    const { companyId, categoryId, ...data } = createProductDto;

    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Produit non trouvé');

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

    // Mise à jour du produit
    product.name = data.name || product.name;
    product.description = data.description || product.description;
    product.price = data.price || product.price;
    product.type = data.type || product.type;
    product.durationInMinutes = data.durationInMinutes || product.durationInMinutes;
    product.carModel = data.carModel || product.carModel;
    product.licensePlate = data.licensePlate || product.licensePlate;
    product.ingredients = data.ingredients || product.ingredients;
    product.stockQuantity = data.stockQuantity || product.stockQuantity;
    product.company = company;
    product.category = category;
    product.image = imagePath || product.image;  // Met à jour l'image si une nouvelle est fournie

    return this.productRepo.save(product);
  }

  // Supprimer un produit
  async remove(id: string): Promise<void> {
    const product = await this.findOne(id);
    await this.productRepo.remove(product);
  }
}
