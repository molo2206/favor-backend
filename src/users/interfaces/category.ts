import { CategoryEntity } from "src/category/entities/category.entity";

export interface CategoryWithPagination {
    categories: CategoryEntity[];
    pagination: {
        totalItems: number;
        currentPage: number;
        totalPages: number;
        itemsPerPage: number;
    };
}