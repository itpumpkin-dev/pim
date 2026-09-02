<?php

use App\Http\Controllers\Catalog\AttributeController;
use App\Http\Controllers\Catalog\AttributeFamilyController;
use App\Http\Controllers\Catalog\AttributeGroupController;
use App\Http\Controllers\Catalog\AttributeOptionController;
use App\Http\Controllers\Catalog\BaseUnitController;
use App\Http\Controllers\Catalog\BrandController;
use App\Http\Controllers\Catalog\BusinessTypeController;
use App\Http\Controllers\Catalog\CategoryController;
use App\Http\Controllers\Catalog\CategoryFieldController;
use App\Http\Controllers\Catalog\ChannelController;
use App\Http\Controllers\Catalog\CommissionGroupController;
use App\Http\Controllers\Catalog\CurrencyController;
use App\Http\Controllers\Catalog\PointController;
use App\Http\Controllers\Catalog\ProductController;
use App\Http\Controllers\Catalog\ProductGroupController;
use App\Http\Controllers\Catalog\SubcategoryController;
use App\Http\Controllers\Catalog\SalesPlatformController;
use App\Http\Controllers\Catalog\LazadaAttributeMappingController;
use App\Http\Controllers\Catalog\MarketplaceAttributeMappingController;
use App\Http\Controllers\Catalog\TikTokAttributeMappingController;
use App\Http\Controllers\Catalog\ShopeeAttributeMappingController;
use App\Http\Controllers\Catalog\WooCommerceAttributeMappingController;
use App\Http\Controllers\Catalog\VendorController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware(['auth'])->prefix('catalog')->name('catalog.')->group(function () {
    // หน้ารวม static ที่ลิงก์ไปหน้ารายการคำแปลที่ขาดหาย และหน้า
    // marketplace-sync ของ Categories/Brands — route พวกนั้นมีการเช็คสิทธิ์
    // ของตัวเองอยู่แล้ว หน้ารวมนี้เลยไม่ต้องมี middleware อะไรเพิ่มนอกจาก auth
    // ฝั่ง frontend จะซ่อน tile ที่ user คนนั้นเข้าไม่ได้เองอยู่แล้ว
    Route::get('management', fn () => Inertia::render('catalog/management/index'))->name('management');
    Route::get('products', [ProductController::class, 'index'])->name('products.index')->middleware('permission:products,list_products');
    Route::get('products/summary', [ProductController::class, 'summary'])->name('products.summary')->middleware('permission:products,list_products');
    Route::get('products/search', [ProductController::class, 'search'])->name('products.search')->middleware('permission:products,list_products');
    Route::get('products/category-path', [ProductController::class, 'categoryPathBySku'])->name('products.categoryPath')->middleware('permission:products,list_products');
    Route::get('products/quick-export', [ProductController::class, 'quickExport'])->name('products.quickExport')->middleware('permission:products,list_products');
    Route::post('products/push-bulk', [ProductController::class, 'pushBulk'])->name('products.pushBulk')->middleware('permission:products,edit_products');
    Route::post('products/deactivate-bulk', [ProductController::class, 'deactivateBulk'])->name('products.deactivateBulk')->middleware('permission:products,edit_products');
    Route::get('product-translations', [ProductController::class, 'missingTranslations'])->name('products.missingTranslations')->middleware('permission:product_translations,list_product_translations');
    Route::post('product-translations/queue-bulk', [ProductController::class, 'queueMissingTranslationsBulk'])->name('products.queueMissingTranslationsBulk')->middleware('permission:product_translations,edit_product_translations');
    Route::post('products/{product}/queue-missing-translations', [ProductController::class, 'queueMissingTranslations'])->name('products.queueMissingTranslations')->middleware('permission:product_translations,edit_product_translations');
    Route::get('products/create', [ProductController::class, 'create'])->name('products.create')->middleware('permission:products,create_products');
    Route::post('products', [ProductController::class, 'store'])->name('products.store')->middleware('permission:products,create_products');
    Route::get('products/{product}/edit', [ProductController::class, 'edit'])->name('products.edit')->middleware('permission:products,edit_products');
    Route::get('products/{product}', [ProductController::class, 'show'])->name('products.show')->middleware('permission:products,list_products');
    Route::put('products/{product}', [ProductController::class, 'update'])->name('products.update')->middleware('permission:products,edit_products');
    // Per-panel saves on the edit screen — each persists just its own slice so
    // the user doesn't have to submit the whole product form to save one card.
    Route::put('products/{product}/categories', [ProductController::class, 'updateCategories'])->name('products.updateCategories')->middleware('permission:products,edit_products');
    Route::put('products/{product}/brand', [ProductController::class, 'updateBrand'])->name('products.updateBrand')->middleware('permission:products,edit_products');
    Route::put('products/{product}/channels', [ProductController::class, 'updateChannels'])->name('products.updateChannels')->middleware('permission:products,edit_products');
    Route::delete('products/{product}', [ProductController::class, 'destroy'])->name('products.destroy')->middleware('permission:products,delete_products');
    Route::post('products/{product}/duplicate', [ProductController::class, 'duplicate'])->name('products.duplicate')->middleware('permission:products,create_products');
    Route::get('products/{product}/attribute-values', [ProductController::class, 'attributeValues'])->name('products.attributeValues')->middleware('permission:products,edit_products');
    Route::post('products/{product}/upload-description-image', [ProductController::class, 'uploadDescriptionImage'])->name('products.uploadDescriptionImage')->middleware('permission:products,edit_products');
    Route::get('products/{product}/history', [ProductController::class, 'history'])->name('products.history')->middleware('permission:products,view_history');
    Route::post('products/{product}/push-lazada/{shop}', [ProductController::class, 'pushToLazada'])->name('products.pushLazada')->middleware('permission:products,edit_products');
    Route::post('products/{product}/deactivate-lazada/{shop}', [ProductController::class, 'deactivateLazada'])->name('products.deactivateLazada')->middleware('permission:products,edit_products');
    Route::get('products/{product}/lazada-status/{shop}', [ProductController::class, 'checkLazadaStatus'])->name('products.checkLazadaStatus')->middleware('permission:products,edit_products');
    Route::post('products/{product}/push-shopee/{shop}', [ProductController::class, 'pushToShopee'])->name('products.pushShopee')->middleware('permission:products,edit_products');
    Route::post('products/{product}/deactivate-shopee/{shop}', [ProductController::class, 'deactivateShopee'])->name('products.deactivateShopee')->middleware('permission:products,edit_products');
    Route::post('products/{product}/delete-shopee/{shop}', [ProductController::class, 'deleteFromShopee'])->name('products.deleteFromShopee')->middleware('permission:products,edit_products');
    Route::get('products/{product}/shopee-status/{shop}', [ProductController::class, 'checkShopeeStatus'])->name('products.checkShopeeStatus')->middleware('permission:products,edit_products');
    Route::post('products/{product}/push-tiktok/{shop}', [ProductController::class, 'pushToTikTok'])->name('products.pushTiktok')->middleware('permission:products,edit_products');
    Route::post('products/{product}/deactivate-tiktok/{shop}', [ProductController::class, 'deactivateTikTok'])->name('products.deactivateTiktok')->middleware('permission:products,edit_products');
    Route::get('products/{product}/tiktok-status/{shop}', [ProductController::class, 'checkTikTokStatus'])->name('products.checkTiktokStatus')->middleware('permission:products,edit_products');
    Route::post('products/{product}/push-woocommerce/{shop}', [ProductController::class, 'pushToWoocommerce'])->name('products.pushWoocommerce')->middleware('permission:products,edit_products');
    Route::post('products/{product}/deactivate-woocommerce/{shop}', [ProductController::class, 'deactivateWoocommerce'])->name('products.deactivateWoocommerce')->middleware('permission:products,edit_products');
    Route::get('products/{product}/woocommerce-status/{shop}', [ProductController::class, 'checkWoocommerceStatus'])->name('products.checkWoocommerceStatus')->middleware('permission:products,edit_products');
    Route::post('products/{product}/fill-woocommerce-translations', [ProductController::class, 'fillWoocommerceTranslationsForProduct'])->name('products.fillWoocommerceTranslations')->middleware('permission:products,edit_products');
    Route::get('products/{product}/sync-jobs/{syncJob}', [ProductController::class, 'marketplaceSyncJobStatus'])->name('products.marketplaceSyncJobStatus')->middleware('permission:products,edit_products');
    Route::post('products/{product}/check-live-status', [ProductController::class, 'checkLiveStatus'])->name('products.checkLiveStatus')->middleware('permission:products,edit_products');

    Route::get('attributes', [AttributeController::class, 'index'])->name('attributes.index')->middleware('permission:attributes,list_attributes');
    Route::get('attributes/export', [AttributeController::class, 'export'])->name('attributes.export')->middleware('permission:attributes,list_attributes');
    Route::get('attributes/create', [AttributeController::class, 'create'])->name('attributes.create')->middleware('permission:attributes,create_attributes');
    // แยกเป็นคนละ action/URL/หน้ากันจริงๆ ต่อแพลตฟอร์มแล้ว (เคยรวมเป็นหน้าเดียว
    // มี Tabs สลับ ก่อนแยกจริงตามที่ user ขอ) — ดู docblock ของ
    // MarketplaceAttributeMappingController อยู่ใต้ path prefix "marketplace/"
    // ไม่ใช่ "attributes/" (ต่างจากตอนแรกที่ทำ) เพราะ nav-secondary.tsx ไฮไลต์
    // เมนู active ด้วยการเทียบ prefix ของ pathname — ถ้าอยู่ใต้ "attributes/"
    // จะโดนเมนู "แอตทริบิวต์" (url: /catalog/attributes) highlight ผิดไปด้วย
    // เพราะ /catalog/attributes/... ก็ขึ้นต้นด้วย /catalog/attributes เหมือนกัน
    Route::get('marketplace/attribute-mapping/export', [MarketplaceAttributeMappingController::class, 'export'])->name('marketplace.attributeMapping.export')->middleware('permission:attributes,edit_attributes');
    Route::get('marketplace/woocommerce/attribute-mapping', [MarketplaceAttributeMappingController::class, 'woocommerce'])->name('marketplace.woocommerce.attributeMapping')->middleware('permission:attributes,edit_attributes');
    Route::get('marketplace/shopee/attribute-mapping', [MarketplaceAttributeMappingController::class, 'shopee'])->name('marketplace.shopee.attributeMapping')->middleware('permission:attributes,edit_attributes');
    Route::get('marketplace/lazada/attribute-mapping', [MarketplaceAttributeMappingController::class, 'lazada'])->name('marketplace.lazada.attributeMapping')->middleware('permission:attributes,edit_attributes');
    Route::get('marketplace/tiktok/attribute-mapping', [MarketplaceAttributeMappingController::class, 'tiktok'])->name('marketplace.tiktok.attributeMapping')->middleware('permission:attributes,edit_attributes');
    Route::post('attributes/woocommerce-mapping', [WooCommerceAttributeMappingController::class, 'update'])->name('attributes.saveWoocommerceMapping')->middleware('permission:attributes,edit_attributes');
    Route::post('attributes/woocommerce-mapping/sync', [WooCommerceAttributeMappingController::class, 'syncWoocommerceAttributes'])->name('attributes.syncWoocommerceAttributes')->middleware('permission:attributes,edit_attributes');
    Route::post('attributes/shopee-mapping', [ShopeeAttributeMappingController::class, 'update'])->name('attributes.saveShopeeMapping')->middleware('permission:attributes,edit_attributes');
    Route::post('attributes/shopee-mapping/sync', [ShopeeAttributeMappingController::class, 'syncShopeeAttributes'])->name('attributes.syncShopeeAttributes')->middleware('permission:attributes,edit_attributes');
    Route::get('attributes/search-pim', [ShopeeAttributeMappingController::class, 'searchPimAttributes'])->name('attributes.searchPim')->middleware('permission:attributes,edit_attributes');
    Route::post('attributes/lazada-mapping', [LazadaAttributeMappingController::class, 'update'])->name('attributes.saveLazadaMapping')->middleware('permission:attributes,edit_attributes');
    Route::post('attributes/lazada-mapping/sync', [LazadaAttributeMappingController::class, 'syncLazadaAttributes'])->name('attributes.syncLazadaAttributes')->middleware('permission:attributes,edit_attributes');
    Route::post('attributes/tiktok-mapping', [TikTokAttributeMappingController::class, 'update'])->name('attributes.saveTiktokMapping')->middleware('permission:attributes,edit_attributes');
    Route::post('attributes/tiktok-mapping/sync', [TikTokAttributeMappingController::class, 'syncTikTokAttributes'])->name('attributes.syncTikTokAttributes')->middleware('permission:attributes,edit_attributes');
    Route::post('attributes', [AttributeController::class, 'store'])->name('attributes.store')->middleware('permission:attributes,create_attributes');
    Route::get('attributes/{attribute}/edit', [AttributeController::class, 'edit'])->name('attributes.edit')->middleware('permission:attributes,edit_attributes');
    Route::put('attributes/{attribute}', [AttributeController::class, 'update'])->name('attributes.update')->middleware('permission:attributes,edit_attributes');
    Route::delete('attributes/{attribute}', [AttributeController::class, 'destroy'])->name('attributes.destroy')->middleware('permission:attributes,delete_attributes');
    Route::get('attributes/{attribute}/history', [AttributeController::class, 'history'])->name('attributes.history')->middleware('permission:attributes,view_history');
    Route::post('attributes/{attribute}/options', [AttributeOptionController::class, 'store'])->name('attributes.options.store')->middleware('permission:attributes,edit_attributes');
    // ต้อง register route นี้ไว้ก่อน route {option} ด้านล่าง ไม่งั้นคำว่า "batch" จะถูกตีความเป็น {option} id ไปแทน
    Route::put('attributes/{attribute}/options/batch', [AttributeOptionController::class, 'batchUpdate'])->name('attributes.options.batchUpdate')->middleware('permission:attributes,edit_attributes');
    Route::put('attributes/{attribute}/options/{option}', [AttributeOptionController::class, 'update'])->name('attributes.options.update')->middleware('permission:attributes,edit_attributes');
    Route::delete('attributes/{attribute}/options/{option}', [AttributeOptionController::class, 'destroy'])->name('attributes.options.destroy')->middleware('permission:attributes,edit_attributes');

    Route::get('brands', [BrandController::class, 'index'])->name('brands.index')->middleware('permission:brands,list_brands');
    Route::get('brands/create', [BrandController::class, 'create'])->name('brands.create')->middleware('permission:brands,edit_brands');
    Route::post('brands', [BrandController::class, 'store'])->name('brands.store')->middleware('permission:brands,edit_brands');
    Route::get('brands/{brand}/edit', [BrandController::class, 'edit'])->name('brands.edit')->middleware('permission:brands,edit_brands');
    Route::put('brands/{brand}', [BrandController::class, 'update'])->name('brands.update')->middleware('permission:brands,edit_brands');
    Route::delete('brands/{brand}', [BrandController::class, 'destroy'])->name('brands.destroy')->middleware('permission:brands,edit_brands');

    // ไม่มีหน้ารวม GET brands/marketplace-sync แล้ว — props ทั้งสองตัวของมัน
    // (lastSyncedAt/activeSyncJobs) และทุก action ที่มันลิงก์ไปย้ายไปอยู่ที่
    // categories/marketplace-sync.tsx แล้ว (ดู docblock ของ
    // CategoryController::marketplaceSync())
    Route::post('brands/sync-shopee', [BrandController::class, 'syncShopeeBrands'])->name('brands.syncShopee')->middleware('permission:brands,edit_brands');
    // ไม่มีหน้า GET brands/shopee-mapping แล้ว — การจับคู่แบรนด์ Shopee ย้ายไป
    // อยู่ที่ categories/shopee-mapping.tsx แทน (เพราะ get_brand_list ผูกกับ
    // category อยู่แล้ว การจับคู่ตรงจุดที่กำลังดู category อยู่พอดีเลยสมเหตุสมผล
    // กว่าแยกเป็นหน้ารายชื่อแบรนด์แบบ global ต่างหาก) route POST ด้านล่างนี้
    // ยังเหมือนเดิม ยังคงทำหน้าที่บันทึกข้อมูลจริงอยู่ ส่วน endpoint search-pim/
    // shopee-brands-for-category ที่มันทำงานคู่กันด้วยตอนนี้ย้ายไปอยู่ใน
    // กลุ่ม categories/ ด้านล่างแล้ว
    Route::post('brands/shopee-mapping', [BrandController::class, 'bulkMapShopeeBrand'])->name('brands.bulkMapShopee')->middleware('permission:brands,edit_brands');
    Route::get('brands/search-pim', [BrandController::class, 'searchPimBrands'])->name('brands.searchPim')->middleware('permission:brands,edit_brands');
    Route::get('marketplace-brands/{platform}/search', [BrandController::class, 'marketplaceBrandSearch'])->name('marketplaceBrands.search')->middleware('permission:brands,list_brands');
    Route::get('marketplace-brands/{platform}/lookup', [BrandController::class, 'marketplaceBrandLookup'])->name('marketplaceBrands.lookup')->middleware('permission:brands,list_brands');
    Route::post('brands/sync-woocommerce', [BrandController::class, 'syncWoocommerceBrands'])->name('brands.syncWoocommerce')->middleware('permission:brands,edit_brands');
    // ไม่มีหน้า GET brands/woocommerce-mapping หรือ endpoint
    // brands/search-woocommerce แล้ว — ย้ายแบบเดียวกับของ Lazada ด้านบน
    // การจัดการแบรนด์ WooCommerce ตอนนี้ย้ายไปอยู่ที่ categories/woocommerce-mapping.tsx
    Route::post('brands/woocommerce-mapping', [BrandController::class, 'bulkMapWoocommerceBrand'])->name('brands.bulkMapWoocommerce')->middleware('permission:brands,edit_brands');
    Route::post('brands/sync-lazada', [BrandController::class, 'syncLazadaBrands'])->name('brands.syncLazada')->middleware('permission:brands,edit_brands');
    // ไม่มีหน้า GET brands/lazada-mapping หรือ endpoint brands/search-lazada
    // แล้ว — การจัดการแบรนด์ Lazada ตอนนี้ย้ายไปอยู่ที่ categories/lazada-mapping.tsx
    // โดยจับคู่กันคนละทิศทาง (ดู docblock ของหน้านั้นและของ
    // BrandController::lazadaBrandsList()) route POST ด้านล่างนี้ยังเหมือนเดิม
    // ยังคงทำหน้าที่บันทึกข้อมูลจริงอยู่
    Route::post('brands/lazada-mapping', [BrandController::class, 'bulkMapLazadaBrand'])->name('brands.bulkMapLazada')->middleware('permission:brands,edit_brands');
    Route::post('brands/sync-tiktok', [BrandController::class, 'syncTiktokBrands'])->name('brands.syncTiktok')->middleware('permission:brands,edit_brands');
    // ไม่มีหน้า GET brands/tiktok-mapping หรือ endpoint brands/search-tiktok
    // แล้ว — ย้ายแบบเดียวกับของ Lazada/WooCommerce ด้านบน การจัดการแบรนด์
    // TikTok ตอนนี้ย้ายไปอยู่ที่ categories/tiktok-mapping.tsx
    Route::post('brands/tiktok-mapping', [BrandController::class, 'bulkMapTiktokBrand'])->name('brands.bulkMapTiktok')->middleware('permission:brands,edit_brands');
    // route สำหรับเช็คสถานะ/ยกเลิก brand-sync job ที่อยู่ใน queue แบบทั่วไป
    // (ใช้ได้ทั้ง Shopee, Lazada, TikTok, ...) — ไม่ได้ผูกกับแพลตฟอร์มไหนโดยเฉพาะ
    // path ของ route เลยตั้งชื่อตามแนวคิด ("sync-jobs") ไม่ใช่ชื่อแพลตฟอร์มใดแพลตฟอร์มหนึ่ง
    Route::get('brands/sync-jobs/{jobTracker}/status', [BrandController::class, 'brandSyncStatus'])->name('brands.syncStatus')->middleware('permission:brands,edit_brands');
    Route::post('brands/sync-jobs/{jobTracker}/cancel', [BrandController::class, 'cancelBrandSync'])->name('brands.syncCancel')->middleware('permission:brands,edit_brands');

    // "หน่วยนับพื้นฐาน" (Base Units) — หน้าจัดการ master สไตล์เดียวกับ Brands
    // ที่แก้แถว AttributeOption ของ attribute `pbaseunit` โดยตรง (ดู docblock
    // ของ BaseUnitController) จึงมีสิทธิ์ resource ของตัวเอง `base_units` แยก
    // จาก `attributes` — backfill ให้ role เดิมผ่าน migration
    // backfill_base_units_permission เหมือนที่ Brands ทำ
    Route::get('base-units', [BaseUnitController::class, 'index'])->name('baseUnits.index')->middleware('permission:base_units,list_base_units');
    Route::get('base-units/create', [BaseUnitController::class, 'create'])->name('baseUnits.create')->middleware('permission:base_units,edit_base_units');
    Route::post('base-units', [BaseUnitController::class, 'store'])->name('baseUnits.store')->middleware('permission:base_units,edit_base_units');
    Route::get('base-units/{baseUnit}/edit', [BaseUnitController::class, 'edit'])->name('baseUnits.edit')->middleware('permission:base_units,edit_base_units');
    Route::put('base-units/{baseUnit}', [BaseUnitController::class, 'update'])->name('baseUnits.update')->middleware('permission:base_units,edit_base_units');
    Route::delete('base-units/{baseUnit}', [BaseUnitController::class, 'destroy'])->name('baseUnits.destroy')->middleware('permission:base_units,edit_base_units');

    Route::get('attributeGroups', [AttributeGroupController::class, 'index'])->name('attributeGroups.index')->middleware('permission:attribute_groups,list_attribute_groups');
    Route::get('attributeGroups/create', [AttributeGroupController::class, 'create'])->name('attributeGroups.create')->middleware('permission:attribute_groups,create_attribute_groups');
    Route::post('attributeGroups', [AttributeGroupController::class, 'store'])->name('attributeGroups.store')->middleware('permission:attribute_groups,create_attribute_groups');
    Route::get('attributeGroups/{attributeGroup}/edit', [AttributeGroupController::class, 'edit'])->name('attributeGroups.edit')->middleware('permission:attribute_groups,edit_attribute_groups');
    Route::put('attributeGroups/{attributeGroup}', [AttributeGroupController::class, 'update'])->name('attributeGroups.update')->middleware('permission:attribute_groups,edit_attribute_groups');
    Route::delete('attributeGroups/{attributeGroup}', [AttributeGroupController::class, 'destroy'])->name('attributeGroups.destroy')->middleware('permission:attribute_groups,delete_attribute_groups');
    Route::get('attributeGroups/{attributeGroup}/history', [AttributeGroupController::class, 'history'])->name('attributeGroups.history')->middleware('permission:attribute_groups,view_history');

    Route::get('attributeFamilies', [AttributeFamilyController::class, 'index'])->name('attributeFamilies.index')->middleware('permission:attribute_families,list_attribute_families');
    Route::get('attributeFamilies/create', [AttributeFamilyController::class, 'create'])->name('attributeFamilies.create')->middleware('permission:attribute_families,create_attribute_families');
    Route::post('attributeFamilies', [AttributeFamilyController::class, 'store'])->name('attributeFamilies.store')->middleware('permission:attribute_families,create_attribute_families');
    Route::get('attributeFamilies/{attributeFamily}/edit', [AttributeFamilyController::class, 'edit'])->name('attributeFamilies.edit')->middleware('permission:attribute_families,edit_attribute_families');
    Route::put('attributeFamilies/{attributeFamily}', [AttributeFamilyController::class, 'update'])->name('attributeFamilies.update')->middleware('permission:attribute_families,edit_attribute_families');
    Route::delete('attributeFamilies/{attributeFamily}', [AttributeFamilyController::class, 'destroy'])->name('attributeFamilies.destroy')->middleware('permission:attribute_families,delete_attribute_families');
    Route::get('attributeFamilies/{attributeFamily}/history', [AttributeFamilyController::class, 'history'])->name('attributeFamilies.history')->middleware('permission:attribute_families,view_history');

    Route::get('categories/tree', [CategoryController::class, 'tree'])->name('categories.tree')->middleware('permission:categories,list_categories');
    Route::get('categories/search', [CategoryController::class, 'searchCategories'])->name('categories.search')->middleware('permission:categories,edit_categories');
    Route::get('marketplace-categories/{platform}/children', [CategoryController::class, 'marketplaceCategoryChildren'])->name('marketplaceCategories.children')->middleware('permission:categories,list_categories');
    Route::get('marketplace-categories/{platform}/path', [CategoryController::class, 'marketplaceCategoryPath'])->name('marketplaceCategories.path')->middleware('permission:categories,list_categories');
    Route::get('marketplace-categories/{platform}/search', [CategoryController::class, 'marketplaceCategorySearch'])->name('marketplaceCategories.search')->middleware('permission:categories,list_categories');
    Route::get('categories', [CategoryController::class, 'index'])->name('categories.index')->middleware('permission:categories,list_categories');
    Route::get('categories/export', [CategoryController::class, 'exportCategories'])->name('categories.export')->middleware('permission:categories,list_categories');
    Route::get('categories/create', [CategoryController::class, 'create'])->name('categories.create')->middleware('permission:categories,create_categories');
    Route::post('categories', [CategoryController::class, 'store'])->name('categories.store')->middleware('permission:categories,create_categories');
    Route::get('categories/{category}/edit', [CategoryController::class, 'edit'])->name('categories.edit')->middleware('permission:categories,edit_categories');
    Route::put('categories/{category}', [CategoryController::class, 'update'])->name('categories.update')->middleware('permission:categories,edit_categories');
    Route::delete('categories/{category}', [CategoryController::class, 'destroy'])->name('categories.destroy')->middleware('permission:categories,delete_categories');
    Route::get('categories/{category}/history', [CategoryController::class, 'history'])->name('categories.history')->middleware('permission:categories,view_history');

    // Product Groups (กลุ่มสินค้า) — CRUD over the leaf level of the category
    // tree. `{category}` route-model-binds to Category; the controller 404s
    // any row that isn't a depth-3 node.
    Route::get('product-groups', [ProductGroupController::class, 'index'])->name('productGroups.index')->middleware('permission:product_groups,list_product_groups');
    Route::get('product-groups/create', [ProductGroupController::class, 'create'])->name('productGroups.create')->middleware('permission:product_groups,create_product_groups');
    Route::post('product-groups', [ProductGroupController::class, 'store'])->name('productGroups.store')->middleware('permission:product_groups,create_product_groups');
    Route::get('product-groups/{category}/edit', [ProductGroupController::class, 'edit'])->name('productGroups.edit')->middleware('permission:product_groups,edit_product_groups');
    Route::put('product-groups/{category}', [ProductGroupController::class, 'update'])->name('productGroups.update')->middleware('permission:product_groups,edit_product_groups');
    Route::delete('product-groups/{category}', [ProductGroupController::class, 'destroy'])->name('productGroups.destroy')->middleware('permission:product_groups,delete_product_groups');
    Route::get('product-groups/{category}/history', [ProductGroupController::class, 'history'])->name('productGroups.history')->middleware('permission:product_groups,view_history');

    // Subcategories (หมวดหมู่ย่อย) — depth-2 of the `categories` tree, its own
    // admin surface (see SubcategoryController). `{subcategory}` route-model-
    // binds to Category; the controller 404s any row that isn't exactly one
    // level below a real root. Own `subcategories.*` permissions, backfilled
    // from `categories.*` by backfill_subcategories_permissions.
    Route::get('subcategories', [SubcategoryController::class, 'index'])->name('subcategories.index')->middleware('permission:subcategories,list_subcategories');
    Route::get('subcategories/create', [SubcategoryController::class, 'create'])->name('subcategories.create')->middleware('permission:subcategories,create_subcategories');
    Route::post('subcategories', [SubcategoryController::class, 'store'])->name('subcategories.store')->middleware('permission:subcategories,create_subcategories');
    Route::get('subcategories/{subcategory}/edit', [SubcategoryController::class, 'edit'])->name('subcategories.edit')->middleware('permission:subcategories,edit_subcategories');
    Route::put('subcategories/{subcategory}', [SubcategoryController::class, 'update'])->name('subcategories.update')->middleware('permission:subcategories,edit_subcategories');
    Route::delete('subcategories/{subcategory}', [SubcategoryController::class, 'destroy'])->name('subcategories.destroy')->middleware('permission:subcategories,delete_subcategories');
    Route::get('subcategories/{subcategory}/history', [SubcategoryController::class, 'history'])->name('subcategories.history')->middleware('permission:subcategories,view_history');

    // "คะแนน" (Points) master — own `points` table (point_type + point_ratio),
    // own `points.*` permissions backfilled from `categories.*` by
    // backfill_points_permissions. `edit_points` covers every write.
    Route::get('points', [PointController::class, 'index'])->name('points.index')->middleware('permission:points,list_points');
    Route::get('points/create', [PointController::class, 'create'])->name('points.create')->middleware('permission:points,edit_points');
    Route::post('points', [PointController::class, 'store'])->name('points.store')->middleware('permission:points,edit_points');
    Route::get('points/{point}/edit', [PointController::class, 'edit'])->name('points.edit')->middleware('permission:points,edit_points');
    Route::put('points/{point}', [PointController::class, 'update'])->name('points.update')->middleware('permission:points,edit_points');
    Route::delete('points/{point}', [PointController::class, 'destroy'])->name('points.destroy')->middleware('permission:points,edit_points');

    // "กลุ่มคอมมิชชั่น" (Commission Groups) master — own `commission_groups`
    // table (code + group_id_1 + divisor_start/divisor_secondary + is_active
    // + remark), own `commission_groups.*` permissions backfilled from
    // `categories.*`. `edit_commission_groups` covers every write.
    Route::get('commission-groups', [CommissionGroupController::class, 'index'])->name('commissionGroups.index')->middleware('permission:commission_groups,list_commission_groups');
    Route::get('commission-groups/create', [CommissionGroupController::class, 'create'])->name('commissionGroups.create')->middleware('permission:commission_groups,edit_commission_groups');
    Route::post('commission-groups', [CommissionGroupController::class, 'store'])->name('commissionGroups.store')->middleware('permission:commission_groups,edit_commission_groups');
    Route::get('commission-groups/{commissionGroup}/edit', [CommissionGroupController::class, 'edit'])->name('commissionGroups.edit')->middleware('permission:commission_groups,edit_commission_groups');
    Route::put('commission-groups/{commissionGroup}', [CommissionGroupController::class, 'update'])->name('commissionGroups.update')->middleware('permission:commission_groups,edit_commission_groups');
    Route::delete('commission-groups/{commissionGroup}', [CommissionGroupController::class, 'destroy'])->name('commissionGroups.destroy')->middleware('permission:commission_groups,edit_commission_groups');

    // "ประเภทธุรกิจ" (Business Types) master — own `business_types` table
    // (name + description + status), own `business_types.*` permissions
    // backfilled from `categories.*`. `edit_business_types` covers every
    // write.
    Route::get('business-types', [BusinessTypeController::class, 'index'])->name('businessTypes.index')->middleware('permission:business_types,list_business_types');
    Route::get('business-types/create', [BusinessTypeController::class, 'create'])->name('businessTypes.create')->middleware('permission:business_types,edit_business_types');
    Route::post('business-types', [BusinessTypeController::class, 'store'])->name('businessTypes.store')->middleware('permission:business_types,edit_business_types');
    Route::get('business-types/{businessType}/edit', [BusinessTypeController::class, 'edit'])->name('businessTypes.edit')->middleware('permission:business_types,edit_business_types');
    Route::put('business-types/{businessType}', [BusinessTypeController::class, 'update'])->name('businessTypes.update')->middleware('permission:business_types,edit_business_types');
    Route::delete('business-types/{businessType}', [BusinessTypeController::class, 'destroy'])->name('businessTypes.destroy')->middleware('permission:business_types,edit_business_types');

    // "เวนเดอร์" (Vendors) master — own `vendors` table, own `vendors.*`
    // permissions backfilled from `categories.*`. `edit_vendors` covers
    // every write.
    Route::get('vendors', [VendorController::class, 'index'])->name('vendors.index')->middleware('permission:vendors,list_vendors');
    Route::get('vendors/create', [VendorController::class, 'create'])->name('vendors.create')->middleware('permission:vendors,edit_vendors');
    Route::post('vendors', [VendorController::class, 'store'])->name('vendors.store')->middleware('permission:vendors,edit_vendors');
    Route::get('vendors/{vendor}/edit', [VendorController::class, 'edit'])->name('vendors.edit')->middleware('permission:vendors,edit_vendors');
    Route::put('vendors/{vendor}', [VendorController::class, 'update'])->name('vendors.update')->middleware('permission:vendors,edit_vendors');
    Route::delete('vendors/{vendor}', [VendorController::class, 'destroy'])->name('vendors.destroy')->middleware('permission:vendors,edit_vendors');

    // "สกุลเงิน" (Currencies) master — the existing `currencies` table
    // (already used by Channels' currency picker and Vendor's main-currency
    // field), own `currencies.*` permissions backfilled from `categories.*`.
    // `edit_currencies` covers every write.
    Route::get('currencies', [CurrencyController::class, 'index'])->name('currencies.index')->middleware('permission:currencies,list_currencies');
    Route::get('currencies/create', [CurrencyController::class, 'create'])->name('currencies.create')->middleware('permission:currencies,edit_currencies');
    Route::post('currencies', [CurrencyController::class, 'store'])->name('currencies.store')->middleware('permission:currencies,edit_currencies');
    Route::get('currencies/{currency}/edit', [CurrencyController::class, 'edit'])->name('currencies.edit')->middleware('permission:currencies,edit_currencies');
    Route::put('currencies/{currency}', [CurrencyController::class, 'update'])->name('currencies.update')->middleware('permission:currencies,edit_currencies');
    Route::delete('currencies/{currency}', [CurrencyController::class, 'destroy'])->name('currencies.destroy')->middleware('permission:currencies,edit_currencies');
    Route::get('categories/marketplace-sync', [CategoryController::class, 'marketplaceSync'])->name('categories.marketplaceSync')->middleware('permission:categories,edit_categories');
    Route::post('categories/sync-lazada', [CategoryController::class, 'syncLazadaCategories'])->name('categories.syncLazada')->middleware('permission:categories,edit_categories');
    Route::post('categories/sync-shopee', [CategoryController::class, 'syncShopeeCategories'])->name('categories.syncShopee')->middleware('permission:categories,edit_categories');
    Route::post('categories/sync-tiktok', [CategoryController::class, 'syncTikTokCategories'])->name('categories.syncTiktok')->middleware('permission:categories,edit_categories');
    Route::get('categories/search-lazada', [CategoryController::class, 'searchLazadaCategories'])->name('categories.searchLazada')->middleware('permission:categories,edit_categories');
    Route::get('categories/{category}/products', [CategoryController::class, 'categoryProducts'])->name('categories.products')->middleware('permission:categories,edit_categories');
    Route::get('categories/lazada-mapping', [CategoryController::class, 'lazadaMapping'])->name('categories.lazadaMapping')->middleware('permission:categories,edit_categories');
    Route::post('categories/lazada-mapping', [CategoryController::class, 'bulkMapLazada'])->name('categories.bulkMapLazada')->middleware('permission:categories,edit_categories');
    // action ฝั่งแบรนด์ที่ฝังอยู่ในหน้าเดียวกัน (ดู docblock ของ
    // BrandController::lazadaBrandsList()) — เช็คสิทธิ์ด้วย brands,edit_brands
    // แทนที่จะเป็น categories,edit_categories เพราะมันอ่าน/เขียนข้อมูลแบรนด์
    // แม้ว่าจะถูกเรียกจากตาราง categories/lazada-mapping.tsx ก็ตาม ไม่ได้ผูกกับ
    // category (ต่างจากของ Shopee) — แคตตาล็อกแบรนด์ของ Lazada ไม่มีมิติเรื่อง
    // category เลย เลยไม่มี {lazadaCategoryId} ใน path นี้
    Route::get('categories/lazada-mapping/lazada-brands', [BrandController::class, 'lazadaBrandsList'])->name('categories.lazadaMapping.lazadaBrands')->middleware('permission:brands,edit_brands');
    // แนวคิดเดียวกัน แต่เป็นฝั่ง attribute แทนฝั่งแบรนด์ — ดู docblock ของ
    // LazadaAttributeMappingController สำหรับสอง route นี้ schema attribute
    // ของ Lazada ผูกกับ category จริงๆ (/category/attributes/get) คู่ route นี้
    // เลยมีรูปแบบเหมือนกับ {shopeeCategoryId} ของ Shopee เป๊ะๆ
    Route::post('categories/lazada-mapping/sync-attributes', [LazadaAttributeMappingController::class, 'syncLazadaAttributesForCategory'])->name('categories.lazadaMapping.syncAttributes')->middleware('permission:attributes,edit_attributes');
    Route::get('categories/{lazadaCategoryId}/lazada-attributes', [LazadaAttributeMappingController::class, 'lazadaAttributesForCategory'])->name('categories.lazadaAttributesForCategory')->middleware('permission:attributes,edit_attributes');
    Route::get('categories/search-shopee', [CategoryController::class, 'searchShopeeCategories'])->name('categories.searchShopee')->middleware('permission:categories,edit_categories');
    Route::get('categories/shopee-mapping', [CategoryController::class, 'shopeeMapping'])->name('categories.shopeeMapping')->middleware('permission:categories,edit_categories');
    Route::post('categories/shopee-mapping', [CategoryController::class, 'bulkMapShopee'])->name('categories.bulkMapShopee')->middleware('permission:categories,edit_categories');
    // action ฝั่งแบรนด์ที่ฝังอยู่ในหน้าเดียวกัน (ดู docblock ของ BrandController
    // สำหรับสอง route นี้) — เช็คสิทธิ์ด้วย brands,edit_brands แทนที่จะเป็น
    // categories,edit_categories เพราะมันอ่าน/เขียนข้อมูลแบรนด์ แม้ว่าจะถูกเรียก
    // จากตาราง categories/shopee-mapping.tsx ก็ตาม
    Route::post('categories/shopee-mapping/sync-brands', [BrandController::class, 'syncShopeeBrandsForCategory'])->name('categories.shopeeMapping.syncBrands')->middleware('permission:brands,edit_brands');
    Route::get('categories/{shopeeCategoryId}/shopee-brands', [BrandController::class, 'shopeeBrandsForCategory'])->name('categories.shopeeBrandsForCategory')->middleware('permission:brands,edit_brands');
    // แนวคิดเดียวกัน แต่เป็นฝั่ง attribute แทนฝั่งแบรนด์ — ดู docblock ของ
    // ShopeeAttributeMappingController สำหรับสอง route นี้
    Route::post('categories/shopee-mapping/sync-attributes', [ShopeeAttributeMappingController::class, 'syncShopeeAttributesForCategory'])->name('categories.shopeeMapping.syncAttributes')->middleware('permission:attributes,edit_attributes');
    Route::get('categories/{shopeeCategoryId}/shopee-attributes', [ShopeeAttributeMappingController::class, 'shopeeAttributesForCategory'])->name('categories.shopeeAttributesForCategory')->middleware('permission:attributes,edit_attributes');
    Route::get('categories/search-tiktok', [CategoryController::class, 'searchTikTokCategories'])->name('categories.searchTiktok')->middleware('permission:categories,edit_categories');
    Route::get('categories/tiktok-mapping', [CategoryController::class, 'tiktokMapping'])->name('categories.tiktokMapping')->middleware('permission:categories,edit_categories');
    Route::post('categories/tiktok-mapping', [CategoryController::class, 'bulkMapTiktok'])->name('categories.bulkMapTiktok')->middleware('permission:categories,edit_categories');
    // action ฝั่งแบรนด์ที่ฝังอยู่ในหน้าเดียวกัน (ดู docblock ของ
    // BrandController::tiktokBrandsList()) — ไม่ได้ผูกกับ category
    // (เหมือนของ Lazada/WooCommerce ต่างจากของ Shopee) เลยไม่มี
    // {tiktokCategoryId} ใน path นี้
    Route::get('categories/tiktok-mapping/tiktok-brands', [BrandController::class, 'tiktokBrandsList'])->name('categories.tiktokMapping.tiktokBrands')->middleware('permission:brands,edit_brands');
    // ส่วนที่เทียบเท่าฝั่ง attribute — endpoint Get Attributes ของ TikTok
    // ผูกกับ category จริงๆ (เรียกทีละ category_id) คู่ route นี้เลยมีรูปแบบ
    // เหมือนกับ {xCategoryId} ของ Shopee/Lazada
    Route::post('categories/tiktok-mapping/sync-attributes', [TikTokAttributeMappingController::class, 'syncTikTokAttributesForCategory'])->name('categories.tiktokMapping.syncAttributes')->middleware('permission:attributes,edit_attributes');
    Route::get('categories/{tiktokCategoryId}/tiktok-attributes', [TikTokAttributeMappingController::class, 'tiktokAttributesForCategory'])->name('categories.tiktokAttributesForCategory')->middleware('permission:attributes,edit_attributes');
    Route::post('categories/sync-woocommerce', [CategoryController::class, 'syncWoocommerceCategories'])->name('categories.syncWoocommerce')->middleware('permission:categories,edit_categories');
    Route::get('categories/search-woocommerce', [CategoryController::class, 'searchWoocommerceCategories'])->name('categories.searchWoocommerce')->middleware('permission:categories,edit_categories');
    Route::get('categories/woocommerce-mapping', [CategoryController::class, 'woocommerceMapping'])->name('categories.woocommerceMapping')->middleware('permission:categories,edit_categories');
    Route::post('categories/woocommerce-mapping', [CategoryController::class, 'bulkMapWoocommerce'])->name('categories.bulkMapWoocommerce')->middleware('permission:categories,edit_categories');
    // action ฝั่งแบรนด์ที่ฝังอยู่ในหน้าเดียวกัน (ดู docblock ของ
    // BrandController::woocommerceBrandsList()) — ไม่ได้ผูกกับ category
    // เหตุผลเดียวกับของ Lazada/TikTok ด้านบน
    Route::get('categories/woocommerce-mapping/woocommerce-brands', [BrandController::class, 'woocommerceBrandsList'])->name('categories.woocommerceMapping.woocommerceBrands')->middleware('permission:brands,edit_brands');
    Route::get('categories/export-woocommerce', [CategoryController::class, 'exportWoocommerceCategories'])->name('categories.exportWoocommerce')->middleware('permission:categories,edit_categories');
    Route::post('categories/import-woocommerce', [CategoryController::class, 'importFromWoocommerce'])->name('categories.importWoocommerce')->middleware('permission:categories,edit_categories');

    Route::get('categoryFields', [CategoryFieldController::class, 'index'])->name('categoryFields.index')->middleware('permission:category_fields,list_category_fields');
    Route::get('categoryFields/create', [CategoryFieldController::class, 'create'])->name('categoryFields.create')->middleware('permission:category_fields,create_category_fields');
    Route::post('categoryFields', [CategoryFieldController::class, 'store'])->name('categoryFields.store')->middleware('permission:category_fields,create_category_fields');
    Route::get('categoryFields/{categoryField}/edit', [CategoryFieldController::class, 'edit'])->name('categoryFields.edit')->middleware('permission:category_fields,edit_category_fields');
    Route::put('categoryFields/{categoryField}', [CategoryFieldController::class, 'update'])->name('categoryFields.update')->middleware('permission:category_fields,edit_category_fields');
    Route::delete('categoryFields/{categoryField}', [CategoryFieldController::class, 'destroy'])->name('categoryFields.destroy')->middleware('permission:category_fields,delete_category_fields');
    Route::get('categoryFields/{categoryField}/history', [CategoryFieldController::class, 'history'])->name('categoryFields.history')->middleware('permission:category_fields,view_history');

    Route::get('channels', [ChannelController::class, 'index'])->name('channels.index')->middleware('permission:channels,list_channels');
    Route::get('channels/create', [ChannelController::class, 'create'])->name('channels.create')->middleware('permission:channels,create_channels');
    Route::post('channels', [ChannelController::class, 'store'])->name('channels.store')->middleware('permission:channels,create_channels');
    Route::get('channels/{channel}/edit', [ChannelController::class, 'edit'])->name('channels.edit')->middleware('permission:channels,edit_channels');
    Route::put('channels/{channel}', [ChannelController::class, 'update'])->name('channels.update')->middleware('permission:channels,edit_channels');
    Route::delete('channels/{channel}', [ChannelController::class, 'destroy'])->name('channels.destroy')->middleware('permission:channels,delete_channels');
    Route::get('channels/{channel}/history', [ChannelController::class, 'history'])->name('channels.history')->middleware('permission:channels,view_history');

    Route::get('sales-platforms', [SalesPlatformController::class, 'index'])->name('salesPlatforms.index')->middleware('permission:sales_platforms,list_sales_platforms');
    Route::get('sales-platforms/api-usage', [SalesPlatformController::class, 'apiUsage'])->name('salesPlatforms.apiUsage')->middleware('permission:sales_platforms,list_sales_platforms');
    Route::post('sales-platforms', [SalesPlatformController::class, 'storePlatform'])->name('salesPlatforms.store')->middleware('permission:sales_platforms,create_sales_platforms');
    Route::put('sales-platforms/{salesPlatform}', [SalesPlatformController::class, 'updatePlatform'])->name('salesPlatforms.update')->middleware('permission:sales_platforms,edit_sales_platforms');
    Route::delete('sales-platforms/{salesPlatform}', [SalesPlatformController::class, 'destroyPlatform'])->name('salesPlatforms.destroy')->middleware('permission:sales_platforms,delete_sales_platforms');
    Route::post('sales-platforms/sync-lazada', [SalesPlatformController::class, 'syncLazadaShops'])->name('salesPlatforms.syncLazada')->middleware('permission:sales_platforms,edit_sales_platforms');
    Route::post('sales-platforms/sync-shopee', [SalesPlatformController::class, 'syncShopeeShops'])->name('salesPlatforms.syncShopee')->middleware('permission:sales_platforms,edit_sales_platforms');
    Route::post('sales-platforms/sync-tiktok', [SalesPlatformController::class, 'syncTikTokShops'])->name('salesPlatforms.syncTikTok')->middleware('permission:sales_platforms,edit_sales_platforms');
    Route::post('sales-platforms/sync-live-status', [SalesPlatformController::class, 'syncLiveStatus'])->name('salesPlatforms.syncLiveStatus')->middleware('permission:sales_platforms,edit_sales_platforms');
    Route::post('sales-platforms/shops/{shop}/sync-live-status', [SalesPlatformController::class, 'syncShopLiveStatus'])->name('salesPlatforms.syncShopLiveStatus')->middleware('permission:sales_platforms,edit_sales_platforms');
    Route::post('sales-platforms/{salesPlatform}/shops', [SalesPlatformController::class, 'storeShop'])->name('salesPlatforms.shops.store')->middleware('permission:sales_platforms,edit_sales_platforms');
    Route::put('sales-platforms/shops/{shop}', [SalesPlatformController::class, 'updateShop'])->name('salesPlatforms.shops.update')->middleware('permission:sales_platforms,edit_sales_platforms');
    Route::delete('sales-platforms/shops/{shop}', [SalesPlatformController::class, 'destroyShop'])->name('salesPlatforms.shops.destroy')->middleware('permission:sales_platforms,edit_sales_platforms');

    // ── Master-data screens reserved but not yet built ────────────────────
    // Each renders the shared catalog/placeholder page with its own nav
    // title key. They have a sidebar entry now so the intended IA is
    // visible; when a feature ships for real, repoint its route at a real
    // controller/page. Gated on products,list_products (an existing
    // resource) — same rationale as the `management` hub route above: keep
    // them visible to the Catalog audience without minting a permission
    // resource per stub.
    $stub = fn (string $titleKey) => fn () => Inertia::render('catalog/placeholder', ['titleKey' => $titleKey]);

    Route::middleware('permission:products,list_products')->group(function () use ($stub) {
        Route::get('bom', $stub('bom'))->name('bom.index');
        Route::get('product-grades', $stub('productGrades'))->name('productGrades.index');

        Route::get('marketplace/connect/{platform}', fn (string $platform) => Inertia::render('catalog/placeholder', [
            'titleKey' => 'marketplaceConnect',
            'subtitle' => ucfirst($platform),
        ]))->whereIn('platform', ['shopee', 'lazada', 'tiktok', 'woocommerce'])->name('marketplace.connect');

        // "category" (รวม brand-mapping กลับเข้าไปแล้วเหมือนเดิม) reached straight
        // from the sidebar at its real URL (/catalog/categories/{platform}-mapping),
        // and "push" (แมปฟิวส่งข้อมูล) now reaches its own real attribute-mapping
        // page at /catalog/marketplace/{platform}/attribute-mapping — no more
        // placeholder stub for either of them.
    });
});
