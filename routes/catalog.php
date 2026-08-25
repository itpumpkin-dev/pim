<?php

use App\Http\Controllers\Catalog\AttributeController;
use App\Http\Controllers\Catalog\AttributeFamilyController;
use App\Http\Controllers\Catalog\AttributeGroupController;
use App\Http\Controllers\Catalog\AttributeOptionController;
use App\Http\Controllers\Catalog\BrandController;
use App\Http\Controllers\Catalog\CategoryController;
use App\Http\Controllers\Catalog\CategoryFieldController;
use App\Http\Controllers\Catalog\ChannelController;
use App\Http\Controllers\Catalog\ProductController;
use App\Http\Controllers\Catalog\SalesPlatformController;
use App\Http\Controllers\Catalog\LazadaAttributeMappingController;
use App\Http\Controllers\Catalog\MarketplaceAttributeMappingController;
use App\Http\Controllers\Catalog\TikTokAttributeMappingController;
use App\Http\Controllers\Catalog\ShopeeAttributeMappingController;
use App\Http\Controllers\Catalog\WooCommerceAttributeMappingController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware(['auth'])->prefix('catalog')->name('catalog.')->group(function () {
    // Static hub linking to the missing-translations list and the
    // Categories/Brands marketplace-sync pages — those routes already
    // enforce their own permissions, so this needs no middleware of its
    // own beyond auth; the frontend hides tiles the user can't reach.
    Route::get('management', fn () => Inertia::render('catalog/management/index'))->name('management');
    Route::get('management/marketplace', fn () => Inertia::render('catalog/management/marketplace'))->name('management.marketplace');
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
    Route::put('products/{product}', [ProductController::class, 'update'])->name('products.update')->middleware('permission:products,edit_products');
    Route::delete('products/{product}', [ProductController::class, 'destroy'])->name('products.destroy')->middleware('permission:products,delete_products');
    Route::post('products/{product}/duplicate', [ProductController::class, 'duplicate'])->name('products.duplicate')->middleware('permission:products,create_products');
    Route::get('products/{product}/attribute-values', [ProductController::class, 'attributeValues'])->name('products.attributeValues')->middleware('permission:products,edit_products');
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
    Route::get('attributes/marketplace-mapping', [MarketplaceAttributeMappingController::class, 'index'])->name('attributes.marketplaceMapping')->middleware('permission:attributes,edit_attributes');
    Route::get('attributes/marketplace-mapping/export', [MarketplaceAttributeMappingController::class, 'export'])->name('attributes.marketplaceMapping.export')->middleware('permission:attributes,edit_attributes');
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
    // Must be registered before the {option} route below, otherwise "batch" would be swallowed as an {option} id.
    Route::put('attributes/{attribute}/options/batch', [AttributeOptionController::class, 'batchUpdate'])->name('attributes.options.batchUpdate')->middleware('permission:attributes,edit_attributes');
    Route::put('attributes/{attribute}/options/{option}', [AttributeOptionController::class, 'update'])->name('attributes.options.update')->middleware('permission:attributes,edit_attributes');
    Route::delete('attributes/{attribute}/options/{option}', [AttributeOptionController::class, 'destroy'])->name('attributes.options.destroy')->middleware('permission:attributes,edit_attributes');

    Route::get('brands', [BrandController::class, 'index'])->name('brands.index')->middleware('permission:brands,list_brands');
    Route::post('brands', [BrandController::class, 'store'])->name('brands.store')->middleware('permission:brands,edit_brands');
    Route::get('brands/{brand}/edit', [BrandController::class, 'edit'])->name('brands.edit')->middleware('permission:brands,edit_brands');
    Route::put('brands/{brand}', [BrandController::class, 'update'])->name('brands.update')->middleware('permission:brands,edit_brands');
    Route::delete('brands/{brand}', [BrandController::class, 'destroy'])->name('brands.destroy')->middleware('permission:brands,edit_brands');

    Route::get('brands/marketplace-sync', [BrandController::class, 'marketplaceSync'])->name('brands.marketplaceSync')->middleware('permission:brands,edit_brands');
    Route::post('brands/sync-shopee', [BrandController::class, 'syncShopeeBrands'])->name('brands.syncShopee')->middleware('permission:brands,edit_brands');
    // No GET brands/shopee-mapping page anymore — Shopee brand mapping now
    // lives on categories/shopee-mapping.tsx (get_brand_list is
    // category-scoped, so mapping right where you're already looking at the
    // category made more sense than a separate global brand list). The POST
    // below is unchanged and still does the actual save; the search-pim/
    // shopee-brands-for-category endpoints it now works alongside live under
    // the categories/ group below.
    Route::post('brands/shopee-mapping', [BrandController::class, 'bulkMapShopeeBrand'])->name('brands.bulkMapShopee')->middleware('permission:brands,edit_brands');
    Route::get('brands/search-pim', [BrandController::class, 'searchPimBrands'])->name('brands.searchPim')->middleware('permission:brands,edit_brands');
    Route::post('brands/sync-woocommerce', [BrandController::class, 'syncWoocommerceBrands'])->name('brands.syncWoocommerce')->middleware('permission:brands,edit_brands');
    Route::get('brands/search-woocommerce', [BrandController::class, 'searchWoocommerceBrands'])->name('brands.searchWoocommerce')->middleware('permission:brands,edit_brands');
    Route::get('brands/woocommerce-mapping', [BrandController::class, 'woocommerceMapping'])->name('brands.woocommerceMapping')->middleware('permission:brands,edit_brands');
    Route::post('brands/woocommerce-mapping', [BrandController::class, 'bulkMapWoocommerceBrand'])->name('brands.bulkMapWoocommerce')->middleware('permission:brands,edit_brands');
    Route::post('brands/sync-lazada', [BrandController::class, 'syncLazadaBrands'])->name('brands.syncLazada')->middleware('permission:brands,edit_brands');
    Route::get('brands/search-lazada', [BrandController::class, 'searchLazadaBrands'])->name('brands.searchLazada')->middleware('permission:brands,edit_brands');
    Route::get('brands/lazada-mapping', [BrandController::class, 'lazadaMapping'])->name('brands.lazadaMapping')->middleware('permission:brands,edit_brands');
    Route::post('brands/lazada-mapping', [BrandController::class, 'bulkMapLazadaBrand'])->name('brands.bulkMapLazada')->middleware('permission:brands,edit_brands');
    Route::post('brands/sync-tiktok', [BrandController::class, 'syncTiktokBrands'])->name('brands.syncTiktok')->middleware('permission:brands,edit_brands');
    Route::get('brands/search-tiktok', [BrandController::class, 'searchTiktokBrands'])->name('brands.searchTiktok')->middleware('permission:brands,edit_brands');
    Route::get('brands/tiktok-mapping', [BrandController::class, 'tiktokMapping'])->name('brands.tiktokMapping')->middleware('permission:brands,edit_brands');
    Route::post('brands/tiktok-mapping', [BrandController::class, 'bulkMapTiktokBrand'])->name('brands.bulkMapTiktok')->middleware('permission:brands,edit_brands');
    // Generic status/cancel for any queued brand-sync job (Shopee, Lazada,
    // TikTok, ...) — not platform-specific, so the route path names the
    // concept ("sync-jobs"), not one platform.
    Route::get('brands/sync-jobs/{jobTracker}/status', [BrandController::class, 'brandSyncStatus'])->name('brands.syncStatus')->middleware('permission:brands,edit_brands');
    Route::post('brands/sync-jobs/{jobTracker}/cancel', [BrandController::class, 'cancelBrandSync'])->name('brands.syncCancel')->middleware('permission:brands,edit_brands');

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
    Route::get('categories', [CategoryController::class, 'index'])->name('categories.index')->middleware('permission:categories,list_categories');
    Route::get('categories/export', [CategoryController::class, 'exportCategories'])->name('categories.export')->middleware('permission:categories,list_categories');
    Route::get('categories/create', [CategoryController::class, 'create'])->name('categories.create')->middleware('permission:categories,create_categories');
    Route::post('categories', [CategoryController::class, 'store'])->name('categories.store')->middleware('permission:categories,create_categories');
    Route::get('categories/{category}/edit', [CategoryController::class, 'edit'])->name('categories.edit')->middleware('permission:categories,edit_categories');
    Route::put('categories/{category}', [CategoryController::class, 'update'])->name('categories.update')->middleware('permission:categories,edit_categories');
    Route::delete('categories/{category}', [CategoryController::class, 'destroy'])->name('categories.destroy')->middleware('permission:categories,delete_categories');
    Route::get('categories/{category}/history', [CategoryController::class, 'history'])->name('categories.history')->middleware('permission:categories,view_history');
    Route::get('categories/marketplace-sync', [CategoryController::class, 'marketplaceSync'])->name('categories.marketplaceSync')->middleware('permission:categories,edit_categories');
    Route::post('categories/sync-lazada', [CategoryController::class, 'syncLazadaCategories'])->name('categories.syncLazada')->middleware('permission:categories,edit_categories');
    Route::post('categories/sync-shopee', [CategoryController::class, 'syncShopeeCategories'])->name('categories.syncShopee')->middleware('permission:categories,edit_categories');
    Route::post('categories/sync-tiktok', [CategoryController::class, 'syncTikTokCategories'])->name('categories.syncTiktok')->middleware('permission:categories,edit_categories');
    Route::get('categories/search-lazada', [CategoryController::class, 'searchLazadaCategories'])->name('categories.searchLazada')->middleware('permission:categories,edit_categories');
    Route::get('categories/{category}/products', [CategoryController::class, 'categoryProducts'])->name('categories.products')->middleware('permission:categories,edit_categories');
    Route::get('categories/lazada-mapping', [CategoryController::class, 'lazadaMapping'])->name('categories.lazadaMapping')->middleware('permission:categories,edit_categories');
    Route::post('categories/lazada-mapping', [CategoryController::class, 'bulkMapLazada'])->name('categories.bulkMapLazada')->middleware('permission:categories,edit_categories');
    Route::get('categories/search-shopee', [CategoryController::class, 'searchShopeeCategories'])->name('categories.searchShopee')->middleware('permission:categories,edit_categories');
    Route::get('categories/shopee-mapping', [CategoryController::class, 'shopeeMapping'])->name('categories.shopeeMapping')->middleware('permission:categories,edit_categories');
    Route::post('categories/shopee-mapping', [CategoryController::class, 'bulkMapShopee'])->name('categories.bulkMapShopee')->middleware('permission:categories,edit_categories');
    // Brand-side actions embedded in the same page (see BrandController's
    // docblocks on these two) — gated on brands,edit_brands rather than
    // categories,edit_categories since they read/write brand data, even
    // though they're reached from the categories/shopee-mapping.tsx table.
    Route::post('categories/shopee-mapping/sync-brands', [BrandController::class, 'syncShopeeBrandsForCategory'])->name('categories.shopeeMapping.syncBrands')->middleware('permission:brands,edit_brands');
    Route::get('categories/{shopeeCategoryId}/shopee-brands', [BrandController::class, 'shopeeBrandsForCategory'])->name('categories.shopeeBrandsForCategory')->middleware('permission:brands,edit_brands');
    // Same idea, attribute-domain instead of brand-domain — see
    // ShopeeAttributeMappingController's docblocks on these two.
    Route::post('categories/shopee-mapping/sync-attributes', [ShopeeAttributeMappingController::class, 'syncShopeeAttributesForCategory'])->name('categories.shopeeMapping.syncAttributes')->middleware('permission:attributes,edit_attributes');
    Route::get('categories/{shopeeCategoryId}/shopee-attributes', [ShopeeAttributeMappingController::class, 'shopeeAttributesForCategory'])->name('categories.shopeeAttributesForCategory')->middleware('permission:attributes,edit_attributes');
    Route::get('categories/search-tiktok', [CategoryController::class, 'searchTikTokCategories'])->name('categories.searchTiktok')->middleware('permission:categories,edit_categories');
    Route::get('categories/tiktok-mapping', [CategoryController::class, 'tiktokMapping'])->name('categories.tiktokMapping')->middleware('permission:categories,edit_categories');
    Route::post('categories/tiktok-mapping', [CategoryController::class, 'bulkMapTiktok'])->name('categories.bulkMapTiktok')->middleware('permission:categories,edit_categories');
    Route::post('categories/sync-woocommerce', [CategoryController::class, 'syncWoocommerceCategories'])->name('categories.syncWoocommerce')->middleware('permission:categories,edit_categories');
    Route::get('categories/search-woocommerce', [CategoryController::class, 'searchWoocommerceCategories'])->name('categories.searchWoocommerce')->middleware('permission:categories,edit_categories');
    Route::get('categories/woocommerce-mapping', [CategoryController::class, 'woocommerceMapping'])->name('categories.woocommerceMapping')->middleware('permission:categories,edit_categories');
    Route::post('categories/woocommerce-mapping', [CategoryController::class, 'bulkMapWoocommerce'])->name('categories.bulkMapWoocommerce')->middleware('permission:categories,edit_categories');
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
});
