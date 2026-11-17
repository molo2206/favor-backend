// import { NestFactory } from '@nestjs/core';
// import { AppModule } from 'src/app.module';
// import { ProductService } from 'src/products/products.service';

// async function bootstrap() {
//     console.log('🚀 Backfill IMAGE_PRODUCT_ENTITY — Mode RAPIDE\n');

//     const app = await NestFactory.createApplicationContext(AppModule);
//     const productService = app.get(ProductService);

//     let skip = 0;
//     const batchSize = 2000;        // ⬅️ 2000 d'un coup
//     let totalUpdated = 0;
//     let totalFailed = 0;
//     let batchCount = 0;
//     const startTime = Date.now();

//     while (true) {
//         batchCount++;
//         const batchStart = Date.now();

//         const result = await productService.backfillImageEntitySignatures('fr', {
//             batchSize,
//             skip,
//             dryRun: false,
//         });

//         const elapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
//         console.log(
//             `📦 Lot #${batchCount} (skip=${skip}) — ` +
//             `✅ ${result.data.updated} OK, ❌ ${result.data.failed} — ` +
//             `${elapsed}s — Restant: ${result.data.remaining}`
//         );

//         totalUpdated += result.data.updated;
//         totalFailed += result.data.failed;

//         if (!result.data.hasMore) break;
//         skip = result.data.nextSkip;
//         await new Promise((r) => setTimeout(r, 500));
//     }

//     const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
//     console.log(`\n🎉 Terminé en ${totalTime} min`);
//     console.log(`   ✅ ${totalUpdated} mis à jour`);
//     console.log(`   ❌ ${totalFailed} échoués`);

//     await app.close();
// }

// bootstrap();