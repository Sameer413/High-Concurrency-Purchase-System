import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';
import { Product } from './modules/product/entities/product.entity';

const TOTAL_PRODUCTS = 100;
const BATCH_SIZE = 100;
// const TOTAL_PRODUCTS = 10000;
// const BATCH_SIZE = 1000;

const adjectives = [
  'Premium',
  'Classic',
  'Modern',
  'Urban',
  'Essential',
  'Luxury',
  'Vintage',
  'Sport',
  'Minimal',
  'Comfort',
  'Elite',
  'Bold',
  'Smart',
  'Casual',
  'Relaxed',
];

const productTypes = [
  'T-Shirt',
  'Shirt',
  'Hoodie',
  'Sweatshirt',
  'Jacket',
  'Polo',
  'Jeans',
  'Joggers',
  'Shorts',
  'Sweater',
  'Cardigan',
  'Blazer',
];

const categories = [
  'T-Shirts',
  'Shirts',
  'Jackets',
  'Pants',
  'Hoodies',
  'Accessories',
];

const colorSets = [
  ['Black', 'White'],
  ['Black', 'White', 'Navy'],
  ['Gray', 'White', 'Beige'],
  ['Olive', 'Black', 'Navy'],
  ['Brown', 'Black'],
  ['Blue', 'Gray'],
];

const sizeSets = [
  ['S', 'M', 'L', 'XL'],
  ['XS', 'S', 'M', 'L', 'XL'],
  ['M', 'L', 'XL', '2X'],
];

const descriptions = [
  'Made with premium fabric for daily comfort and long-lasting durability.',
  'Modern fit with breathable material and clean finish.',
  'Designed for comfort, movement, and all-day wear.',
  'Soft-touch fabric with premium stitching and refined details.',
  'Versatile style suitable for casual and smart-casual outfits.',
];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateProductName(index: number): string {
  return `${randomElement(adjectives)} ${randomElement(productTypes)} ${index}`;
}

async function seedProducts() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const dataSource = app.get<DataSource>(DataSource);
    const productRepo = dataSource.getRepository(Product);

    console.log('🌱 Starting large product seeding...');

    await productRepo.createQueryBuilder().delete().from(Product).execute();

    console.log('🗑️ Existing products deleted');

    let created = 0;

    for (let start = 1; start <= TOTAL_PRODUCTS; start += BATCH_SIZE) {
      const batch: Partial<Product>[] = [];

      for (let i = start; i < start + BATCH_SIZE && i <= TOTAL_PRODUCTS; i++) {
        const basePrice = randomNumber(299, 4999);
        const hasOriginalPrice = Math.random() > 0.45;

        batch.push({
          name: generateProductName(i),
          description: randomElement(descriptions),
          price: basePrice,
          originalPrice: hasOriginalPrice
            ? basePrice + randomNumber(100, 1200)
            : null,
          image: `/products/product-${((i - 1) % 20) + 1}.jpg`,
          category: randomElement(categories),
          colors: randomElement(colorSets),
          sizes: randomElement(sizeSets),
          rating: Math.round((Math.random() * 2 + 3) * 10) / 10, // 3.0 - 5.0
          reviews: randomNumber(1, 2500),
          isNew: Math.random() > 0.85,
          stock: randomNumber(0, 1000),
          isActive: true,
        });
      }

      await productRepo.save(batch);

      created += batch.length;
      console.log(`✅ Inserted ${created}/${TOTAL_PRODUCTS}`);
    }

    console.log(`🎉 Done! Created ${created} products`);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await app.close();
  }
}

seedProducts();
