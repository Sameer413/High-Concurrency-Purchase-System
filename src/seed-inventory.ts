import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';
import { Product } from './modules/product/entities/product.entity';
import { Inventory } from './modules/inventory/entities/inventory.entity';

const BATCH_SIZE = 100;
// const BATCH_SIZE = 1000;

/**
 * Generate inventory stock levels based on product characteristics
 */
function generateStockLevel(product: Product): {
  totalStock: number;
  reservedStock: number;
  soldStock: number;
} {
  // Base stock level depends on category
  let baseStock = 0;

  switch (product.category) {
    case 'T-Shirts':
      baseStock = Math.floor(Math.random() * 500) + 200; // 200-700
      break;
    case 'Shirts':
      baseStock = Math.floor(Math.random() * 400) + 150; // 150-550
      break;
    case 'Jackets':
      baseStock = Math.floor(Math.random() * 200) + 50; // 50-250
      break;
    case 'Pants':
      baseStock = Math.floor(Math.random() * 300) + 100; // 100-400
      break;
    case 'Hoodies':
      baseStock = Math.floor(Math.random() * 350) + 150; // 150-500
      break;
    case 'Accessories':
      baseStock = Math.floor(Math.random() * 600) + 300; // 300-900
      break;
    default:
      baseStock = Math.floor(Math.random() * 400) + 100; // 100-500
  }

  // Multiply by number of sizes and colors available
  const sizeMultiplier = product.sizes?.length || 1;
  const colorMultiplier = product.colors?.length || 1;
  const totalStock = baseStock * Math.min(sizeMultiplier, 4) * Math.min(colorMultiplier, 3);

  // Popular items (high rating, many reviews) have more sold stock
  const popularityFactor = product.rating >= 4.5 && product.reviews > 1000 ? 1.5 : 1;
  // const soldStock = Math.floor(
  //   (Math.random() * totalStock * 0.3 + totalStock * 0.1) * popularityFactor,
  // );
  const soldStock = 0;

  // Reserved stock is 0 when seeding (no active reservations)
  const reservedStock = 0;

  return {
    totalStock: totalStock - soldStock, // Current total stock (after sales)
    reservedStock: 0, // No reserved stock when seeding
    // soldStock: Math.max(0, soldStock),
    soldStock: Math.max(0, soldStock),
  };
}

async function seedInventory() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const dataSource = app.get<DataSource>(DataSource);
    const productRepo = dataSource.getRepository(Product);
    const inventoryRepo = dataSource.getRepository(Inventory);

    console.log('🌱 Starting inventory seeding...');

    // Clear existing inventory
    await inventoryRepo.createQueryBuilder().delete().from(Inventory).execute();
    console.log('🗑️  Existing inventory deleted');

    // Get all products
    const totalProducts = await productRepo.count();
    console.log(`📦 Found ${totalProducts} products to create inventory for`);

    let processed = 0;
    let created = 0;

    // Process in batches
    for (let skip = 0; skip < totalProducts; skip += BATCH_SIZE) {
      const products = await productRepo.find({
        take: BATCH_SIZE,
        skip,
        order: { createdAt: 'ASC' },
      });

      const inventoryBatch: Partial<Inventory>[] = [];

      for (const product of products) {
        const stockLevels = generateStockLevel(product);

        // Create inventory record
        inventoryBatch.push({
          productId: product.id,
          totalStock: stockLevels.totalStock,
          reservedStock: stockLevels.reservedStock,
          soldStock: stockLevels.soldStock,
        });

        // Update product.stock to match inventory.totalStock
        product.stock = stockLevels.totalStock;
      }

      // Save inventory records
      await inventoryRepo.save(inventoryBatch);

      // Update product stock fields
      await productRepo.save(products);

      processed += products.length;
      created += inventoryBatch.length;
      console.log(`✅ Processed ${processed}/${totalProducts} products`);
    }

    console.log(`🎉 Done! Created ${created} inventory records`);

    // Show some statistics
    const stats = await inventoryRepo
      .createQueryBuilder('inv')
      .select('SUM(inv.totalStock)', 'totalStock')
      .addSelect('SUM(inv.reservedStock)', 'reservedStock')
      .addSelect('SUM(inv.soldStock)', 'soldStock')
      .addSelect('AVG(inv.totalStock)', 'avgStock')
      .getRawOne();

    console.log('\n📊 Inventory Statistics:');
    console.log(`   Total Stock: ${parseInt(stats.totalStock).toLocaleString()}`);
    console.log(`   Reserved Stock: ${parseInt(stats.reservedStock).toLocaleString()}`);
    console.log(`   Sold Stock: ${parseInt(stats.soldStock).toLocaleString()}`);
    console.log(`   Average Stock per Product: ${Math.round(stats.avgStock)}`);

    // Show low stock items
    const lowStockCount = await inventoryRepo
      .createQueryBuilder('inv')
      .where('inv.totalStock - inv.reservedStock < 50')
      .getCount();

    console.log(`   Low Stock Items (< 50 available): ${lowStockCount}`);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await app.close();
  }
}

seedInventory();
