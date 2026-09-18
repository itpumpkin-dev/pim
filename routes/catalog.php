<?php

use App\Http\Controllers\Catalog\AttributeController;
use App\Http\Controllers\Catalog\AttributeFamilyController;
use App\Http\Controllers\Catalog\AttributeGroupController;
use App\Http\Controllers\Catalog\AttributeOptionController;
use App\Http\Controllers\Catalog\BaseUnitController;
use App\Http\Controllers\Catalog\BomController;
use App\Http\Controllers\Catalog\BrandController;
use App\Http\Controllers\Catalog\BusinessTypeController;
use App\Http\Controllers\Catalog\CategoryController;
use App\Http\Controllers\Catalog\CategoryFieldController;
use App\Http\Controllers\Catalog\ChannelController;
use App\Http\Controllers\Catalog\CommissionGroupController;
use App\Http\Controllers\Catalog\CurrencyController;
use App\Http\Controllers\Catalog\PointController;
use App\Http\Controllers\Catalog\ProductController;
use App\Http\Controllers\Catalog\ProductGradeController;
use App\Http\Controllers\Catalog\ProductGroupController;
use App\Http\Controllers\Catalog\ProductTypeController;
use App\Http\Controllers\Catalog\RawMaterialController;
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
    // Cascading lookup for the "Master Categories" panel's หมวดหมู่ย่อย/กลุ่มสินค้า
    // fields (edit.tsx) — fetches just the children of a given parent code
    // on demand instead of shipping all ~1,100 options up front on every
    // Edit Product load. See ProductController::masterCategoryOptions().
    Route::get('products/master-category-options', [ProductController::class, 'masterCategoryOptions'])->name('products.masterCategoryOptions')->middleware('permission:products,edit_products');
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
    // The old Categories/Brand panels here were removed in favor of the
    // Master pages + the pcatname/psubcatname/productgroupname "Master
    // Categories" panel below, which gained its own save route back (see its
    // docblock in products/edit.tsx).
    // Sales Channels panel (edit.tsx) — ทั้งการ toggle assignment (updateChannels)
    // และปุ่ม push/deactivate/delete-listing/สถานะทุกแพลตฟอร์มด้านล่างนี้ ล้วน
    // เป็นการกระทำที่มาจากแผงเดียวกันนี้ทั้งหมด — แยกออกมาเป็นสิทธิ์ของตัวเอง
    // (sales_channels) แทนที่จะพ่วงไปกับ products,edit_products แบบเดิม เพื่อให้
    // จำกัดสิทธิ์แก้ไข/ดู Sales Channels แยกจากสิทธิ์แก้ไขสินค้าทั่วไปได้ (ดู
    // ProductController::buildProductFormProps()'s canViewSalesChannels/
    // canEditSalesChannels) — endpoint แบบอ่านอย่างเดียว (เช็คสถานะ) ใช้
    // view_sales_channels พอ ส่วนที่ push/deactivate/toggle จริงต้อง
    // edit_sales_channels
    Route::put('products/{product}/channels', [ProductController::class, 'updateChannels'])->name('products.updateChannels')->middleware('permission:sales_channels,edit_sales_channels');
    // Toggle ร้านเดียว — ปลอดภัยให้เรียกจากหน้าที่รู้ scope แค่ platform เดียว
    // (marketplace hub ของแต่ละ platform) ต่างจาก updateChannels() ด้านบนตรงที่
    // ไม่ sync() ทั้งชุด (ดู ProductController::toggleShopPublished()'s docblock)
    Route::post('products/{product}/shops/{shop}/toggle-published', [ProductController::class, 'toggleShopPublished'])->name('products.toggleShopPublished')->middleware('permission:sales_channels,edit_sales_channels');
    // ปุ่ม "Publish" ของ toolbar หน้า Edit — ตั้ง enabled=true + sync/push
    // Sales Channels ในคำขอเดียว ใช้สิทธิ์เดียวกับ endpoint อื่นๆ ของแผงนี้
    // ด้านล่าง (sales_channels,edit_sales_channels) — ส่วน products,edit_products
    // การันตีอยู่แล้วโดยอัตโนมัติเพราะต้องมีสิทธิ์นั้นถึงจะมาถึงหน้า Edit ได้
    // ตั้งแต่แรก (เหมือน push-lazada/deactivate-lazada/... ด้านล่างที่ไม่ได้
    // เช็คซ้ำเหมือนกัน)
    Route::post('products/{product}/publish', [ProductController::class, 'publish'])->name('products.publish')->middleware('permission:sales_channels,edit_sales_channels');
    // Master Categories panel (edit.tsx) — แยกออกมาเป็นสิทธิ์ของตัวเอง
    // (master_categories) แบบเดียวกับ Sales Channels ด้านบน แทนที่จะพ่วงไปกับ
    // products,edit_products แบบเดิม เพื่อให้จำกัดสิทธิ์แก้ไขหมวดหมู่-หมวดหมู่ย่อย-
    // กลุ่มสินค้าแยกจากสิทธิ์แก้ไขสินค้าทั่วไปได้ (ดู
    // ProductController::buildProductFormProps()'s canEditMasterCategories —
    // ไม่มี canViewMasterCategories คู่กัน เพราะแผงนี้ไม่มี endpoint แบบอ่านอย่างเดียว
    // ให้แยกสิทธิ์ view ออกจาก edit เหมือน Sales Channels)
    Route::put('products/{product}/master-categories', [ProductController::class, 'updateMasterCategories'])->name('products.updateMasterCategories')->middleware('permission:master_categories,edit_master_categories');
    // ให้หน้า mapping ของทั้ง 4 marketplace (Section 1, Category Mapping) กำหนด
    // PIM category ได้จากหน้านั้นเลยตอนสินค้ายังไม่มีหมวดหมู่ — ไม่งั้นปุ่ม "บันทึก
    // Category Mapping" จะเงียบๆ ไม่มีผลอะไร (activeProduct.master_category ยัง
    // null อยู่) โดยไม่บอกเหตุผลใดๆ ให้แอดมินรู้เลย — ดู
    // ProductController::assignCategory()'s docblock ว่าทำไมแยกจาก
    // updateMasterCategories() ด้านบน (คนละกลไกกัน: id-based ตรงๆ ผ่าน
    // CategoryPicker ไม่ใช่ code-based ผ่าน 3 legacy attributes)
    Route::post('products/{product}/assign-category', [ProductController::class, 'assignCategory'])->name('products.assignCategory')->middleware('permission:master_categories,edit_master_categories');
    Route::delete('products/{product}', [ProductController::class, 'destroy'])->name('products.destroy')->middleware('permission:products,delete_products');
    Route::post('products/{product}/duplicate', [ProductController::class, 'duplicate'])->name('products.duplicate')->middleware('permission:products,create_products');
    Route::get('products/{product}/attribute-values', [ProductController::class, 'attributeValues'])->name('products.attributeValues')->middleware('permission:products,edit_products');
    Route::post('products/{product}/upload-description-image', [ProductController::class, 'uploadDescriptionImage'])->name('products.uploadDescriptionImage')->middleware('permission:products,edit_products');
    Route::get('products/{product}/history', [ProductController::class, 'history'])->name('products.history')->middleware('permission:products,view_history');
    Route::get('products/{product}/timeline', [ProductController::class, 'timeline'])->name('products.timeline')->middleware('permission:products,view_history');
    Route::post('products/{product}/push-lazada/{shop}', [ProductController::class, 'pushToLazada'])->name('products.pushLazada')->middleware('permission:marketplace_lazada,push_products_lazada');
    Route::post('products/{product}/deactivate-lazada/{shop}', [ProductController::class, 'deactivateLazada'])->name('products.deactivateLazada')->middleware('permission:marketplace_lazada,push_products_lazada');
    Route::get('products/{product}/lazada-status/{shop}', [ProductController::class, 'checkLazadaStatus'])->name('products.checkLazadaStatus')->middleware('permission:marketplace_lazada,push_products_lazada');
    Route::post('products/{product}/push-shopee/{shop}', [ProductController::class, 'pushToShopee'])->name('products.pushShopee')->middleware('permission:marketplace_shopee,push_products_shopee');
    Route::post('products/{product}/deactivate-shopee/{shop}', [ProductController::class, 'deactivateShopee'])->name('products.deactivateShopee')->middleware('permission:marketplace_shopee,push_products_shopee');
    Route::post('products/{product}/delete-shopee/{shop}', [ProductController::class, 'deleteFromShopee'])->name('products.deleteFromShopee')->middleware('permission:marketplace_shopee,push_products_shopee');
    Route::get('products/{product}/shopee-status/{shop}', [ProductController::class, 'checkShopeeStatus'])->name('products.checkShopeeStatus')->middleware('permission:marketplace_shopee,push_products_shopee');
    Route::post('products/{product}/push-tiktok/{shop}', [ProductController::class, 'pushToTikTok'])->name('products.pushTiktok')->middleware('permission:marketplace_tiktok,push_products_tiktok');
    Route::post('products/{product}/deactivate-tiktok/{shop}', [ProductController::class, 'deactivateTikTok'])->name('products.deactivateTiktok')->middleware('permission:marketplace_tiktok,push_products_tiktok');
    Route::get('products/{product}/tiktok-status/{shop}', [ProductController::class, 'checkTikTokStatus'])->name('products.checkTiktokStatus')->middleware('permission:marketplace_tiktok,push_products_tiktok');
    Route::post('products/{product}/push-woocommerce/{shop}', [ProductController::class, 'pushToWoocommerce'])->name('products.pushWoocommerce')->middleware('permission:marketplace_woocommerce,push_products_woocommerce');
    Route::post('products/{product}/deactivate-woocommerce/{shop}', [ProductController::class, 'deactivateWoocommerce'])->name('products.deactivateWoocommerce')->middleware('permission:marketplace_woocommerce,push_products_woocommerce');
    Route::get('products/{product}/woocommerce-status/{shop}', [ProductController::class, 'checkWoocommerceStatus'])->name('products.checkWoocommerceStatus')->middleware('permission:marketplace_woocommerce,push_products_woocommerce');
    Route::post('products/{product}/fill-woocommerce-translations', [ProductController::class, 'fillWoocommerceTranslationsForProduct'])->name('products.fillWoocommerceTranslations')->middleware('permission:marketplace_woocommerce,push_products_woocommerce');
    Route::get('products/{product}/sync-jobs/{syncJob}', [ProductController::class, 'marketplaceSyncJobStatus'])->name('products.marketplaceSyncJobStatus')->middleware('permission:sales_channels,view_sales_channels');
    Route::post('products/{product}/check-live-status', [ProductController::class, 'checkLiveStatus'])->name('products.checkLiveStatus')->middleware('permission:sales_channels,view_sales_channels');

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
    Route::get('marketplace/woocommerce/attribute-mapping', [MarketplaceAttributeMappingController::class, 'woocommerce'])->name('marketplace.woocommerce.attributeMapping')->middleware('permission:marketplace_woocommerce,edit_attribute_mapping_woocommerce');
    Route::get('marketplace/woocommerce/products', [WooCommerceAttributeMappingController::class, 'woocommerceProducts'])->name('marketplace.woocommerce.products')->middleware('permission:products,list_products');
    Route::get('marketplace/shopee/attribute-mapping', [MarketplaceAttributeMappingController::class, 'shopee'])->name('marketplace.shopee.attributeMapping')->middleware('permission:marketplace_shopee,edit_attribute_mapping_shopee');
    Route::get('marketplace/lazada/products', [LazadaAttributeMappingController::class, 'lazadaProducts'])->name('marketplace.lazada.products')->middleware('permission:products,list_products');
    Route::get('marketplace/lazada/products/{product}/detail', [LazadaAttributeMappingController::class, 'productDetail'])->name('marketplace.lazada.products.detail')->middleware('permission:products,list_products');
    // ปุ่ม "แนะนำหมวดหมู่จาก Lazada" ของ Section 1 (Category Mapping) —
    // สิทธิ์เดียวกับที่ใช้บันทึกการแมป (categories,edit_categories) เพราะเป็น
    // ส่วนหนึ่งของ workflow เดียวกัน ไม่ใช่แค่ดูข้อมูล
    Route::get('marketplace/lazada/products/{product}/category-suggestions', [LazadaAttributeMappingController::class, 'categorySuggestions'])->name('marketplace.lazada.products.categorySuggestions')->middleware('permission:marketplace_lazada,edit_category_mapping_lazada');
    Route::get('marketplace/shopee/products', [ShopeeAttributeMappingController::class, 'shopeeProducts'])->name('marketplace.shopee.products')->middleware('permission:products,list_products');
    Route::get('marketplace/shopee/products/{product}/detail', [ShopeeAttributeMappingController::class, 'productDetail'])->name('marketplace.shopee.products.detail')->middleware('permission:products,list_products');
    // ปุ่ม "แนะนำหมวดหมู่จาก Shopee" ของ Section 1 (Category Mapping) — mirror
    // ของ marketplace.lazada.products.categorySuggestions เป๊ะ เหตุผลสิทธิ์
    // เดียวกัน (เป็นส่วนหนึ่งของ workflow แมปหมวดหมู่ ไม่ใช่แค่ดูข้อมูล)
    Route::get('marketplace/shopee/products/{product}/category-suggestions', [ShopeeAttributeMappingController::class, 'categorySuggestions'])->name('marketplace.shopee.products.categorySuggestions')->middleware('permission:marketplace_shopee,edit_category_mapping_shopee');
    Route::get('marketplace/lazada/attribute-mapping', [MarketplaceAttributeMappingController::class, 'lazada'])->name('marketplace.lazada.attributeMapping')->middleware('permission:marketplace_lazada,edit_attribute_mapping_lazada');
    Route::get('marketplace/tiktok/attribute-mapping', [MarketplaceAttributeMappingController::class, 'tiktok'])->name('marketplace.tiktok.attributeMapping')->middleware('permission:marketplace_tiktok,edit_attribute_mapping_tiktok');
    Route::get('marketplace/tiktok/products', [TikTokAttributeMappingController::class, 'tiktokProducts'])->name('marketplace.tiktok.products')->middleware('permission:products,list_products');
    Route::get('marketplace/tiktok/products/{product}/detail', [TikTokAttributeMappingController::class, 'productDetail'])->name('marketplace.tiktok.products.detail')->middleware('permission:products,list_products');
    // ปุ่ม "แนะนำหมวดหมู่จาก TikTok" ของ Section 1 (Category Mapping) — mirror
    // ของ marketplace.lazada/shopee.products.categorySuggestions เป๊ะ
    Route::get('marketplace/tiktok/products/{product}/category-suggestions', [TikTokAttributeMappingController::class, 'categorySuggestions'])->name('marketplace.tiktok.products.categorySuggestions')->middleware('permission:marketplace_tiktok,edit_category_mapping_tiktok');
    Route::post('attributes/woocommerce-mapping', [WooCommerceAttributeMappingController::class, 'update'])->name('attributes.saveWoocommerceMapping')->middleware('permission:marketplace_woocommerce,edit_attribute_mapping_woocommerce');
    Route::post('attributes/woocommerce-mapping/sync', [WooCommerceAttributeMappingController::class, 'syncWoocommerceAttributes'])->name('attributes.syncWoocommerceAttributes')->middleware('permission:marketplace_woocommerce,edit_attribute_mapping_woocommerce');
    Route::get('attributes/woocommerce-mapping/attributes-list', [WooCommerceAttributeMappingController::class, 'woocommerceAttributesList'])->name('attributes.woocommerceAttributesList')->middleware('permission:marketplace_woocommerce,edit_attribute_mapping_woocommerce');
    Route::get('attributes/woocommerce-mapping/payload-fields', [WooCommerceAttributeMappingController::class, 'payloadFieldMappings'])->name('attributes.woocommercePayloadFieldMappings')->middleware('permission:marketplace_woocommerce,edit_attribute_mapping_woocommerce');
    Route::get('attributes/woocommerce-mapping/timeline', [WooCommerceAttributeMappingController::class, 'timeline'])->name('attributes.woocommerceMappingTimeline')->middleware('permission:marketplace_woocommerce,view_attribute_mapping_history_woocommerce');
    Route::post('attributes/shopee-mapping', [ShopeeAttributeMappingController::class, 'update'])->name('attributes.saveShopeeMapping')->middleware('permission:marketplace_shopee,edit_attribute_mapping_shopee');
    Route::post('attributes/shopee-mapping/sync', [ShopeeAttributeMappingController::class, 'syncShopeeAttributes'])->name('attributes.syncShopeeAttributes')->middleware('permission:marketplace_shopee,edit_attribute_mapping_shopee');
    Route::post('attributes/shopee-mapping/options', [ShopeeAttributeMappingController::class, 'updateOptionMappings'])->name('attributes.saveShopeeOptionMapping')->middleware('permission:marketplace_shopee,edit_attribute_mapping_shopee');
    Route::get('attributes/shopee-mapping/payload-fields', [ShopeeAttributeMappingController::class, 'payloadFieldMappings'])->name('attributes.shopeePayloadFieldMappings')->middleware('permission:marketplace_shopee,edit_attribute_mapping_shopee');
    Route::post('attributes/shopee-mapping/attribute-family', [ShopeeAttributeMappingController::class, 'syncAttributeFamily'])->name('attributes.shopeeSyncAttributeFamily')->middleware('permission:marketplace_shopee,edit_attribute_mapping_shopee');
    Route::get('attributes/shopee-mapping/timeline', [ShopeeAttributeMappingController::class, 'timeline'])->name('attributes.shopeeMappingTimeline')->middleware('permission:marketplace_shopee,view_attribute_mapping_history_shopee');
    Route::get('attributes/search-pim', [ShopeeAttributeMappingController::class, 'searchPimAttributes'])->name('attributes.searchPim')->middleware('permission:attributes,edit_attributes');
    // ปุ่ม "ดู attributes ทั้งหมด" ใน PimAttributePicker — ดู
    // ShopeeAttributeMappingController::listAllPimAttributes()'s docblock
    Route::get('attributes/list-all-pim', [ShopeeAttributeMappingController::class, 'listAllPimAttributes'])->name('attributes.listAllPim')->middleware('permission:attributes,edit_attributes');
    Route::post('attributes/lazada-mapping', [LazadaAttributeMappingController::class, 'update'])->name('attributes.saveLazadaMapping')->middleware('permission:marketplace_lazada,edit_attribute_mapping_lazada');
    Route::post('attributes/lazada-mapping/sync', [LazadaAttributeMappingController::class, 'syncLazadaAttributes'])->name('attributes.syncLazadaAttributes')->middleware('permission:marketplace_lazada,edit_attribute_mapping_lazada');
    Route::post('attributes/lazada-mapping/options', [LazadaAttributeMappingController::class, 'updateOptionMappings'])->name('attributes.saveLazadaOptionMapping')->middleware('permission:marketplace_lazada,edit_attribute_mapping_lazada');
    Route::get('attributes/lazada-mapping/payload-fields', [LazadaAttributeMappingController::class, 'payloadFieldMappings'])->name('attributes.lazadaPayloadFieldMappings')->middleware('permission:marketplace_lazada,edit_attribute_mapping_lazada');
    Route::post('attributes/lazada-mapping/attribute-family', [LazadaAttributeMappingController::class, 'syncAttributeFamily'])->name('attributes.lazadaSyncAttributeFamily')->middleware('permission:marketplace_lazada,edit_attribute_mapping_lazada');
    Route::get('attributes/lazada-mapping/timeline', [LazadaAttributeMappingController::class, 'timeline'])->name('attributes.lazadaMappingTimeline')->middleware('permission:marketplace_lazada,view_attribute_mapping_history_lazada');
    Route::post('attributes/tiktok-mapping', [TikTokAttributeMappingController::class, 'update'])->name('attributes.saveTiktokMapping')->middleware('permission:marketplace_tiktok,edit_attribute_mapping_tiktok');
    Route::post('attributes/tiktok-mapping/sync', [TikTokAttributeMappingController::class, 'syncTikTokAttributes'])->name('attributes.syncTikTokAttributes')->middleware('permission:marketplace_tiktok,edit_attribute_mapping_tiktok');
    Route::post('attributes/tiktok-mapping/options', [TikTokAttributeMappingController::class, 'updateOptionMappings'])->name('attributes.saveTikTokOptionMapping')->middleware('permission:marketplace_tiktok,edit_attribute_mapping_tiktok');
    Route::get('attributes/tiktok-mapping/payload-fields', [TikTokAttributeMappingController::class, 'payloadFieldMappings'])->name('attributes.tiktokPayloadFieldMappings')->middleware('permission:marketplace_tiktok,edit_attribute_mapping_tiktok');
    Route::post('attributes/tiktok-mapping/attribute-family', [TikTokAttributeMappingController::class, 'syncAttributeFamily'])->name('attributes.tiktokSyncAttributeFamily')->middleware('permission:marketplace_tiktok,edit_attribute_mapping_tiktok');
    Route::get('attributes/tiktok-mapping/timeline', [TikTokAttributeMappingController::class, 'timeline'])->name('attributes.tiktokMappingTimeline')->middleware('permission:marketplace_tiktok,view_attribute_mapping_history_tiktok');
    Route::post('attributes', [AttributeController::class, 'store'])->name('attributes.store')->middleware('permission:attributes,create_attributes');
    Route::get('attributes/{attribute}/edit', [AttributeController::class, 'edit'])->name('attributes.edit')->middleware('permission:attributes,edit_attributes');
    Route::put('attributes/{attribute}', [AttributeController::class, 'update'])->name('attributes.update')->middleware('permission:attributes,edit_attributes');
    Route::delete('attributes/{attribute}', [AttributeController::class, 'destroy'])->name('attributes.destroy')->middleware('permission:attributes,delete_attributes');
    Route::get('attributes/{attribute}/history', [AttributeController::class, 'history'])->name('attributes.history')->middleware('permission:attributes,view_history');
    Route::get('attributes/{attribute}/options-list', [AttributeOptionController::class, 'listForMapping'])->name('attributes.options.listForMapping')->middleware('permission:attributes,edit_attributes');
    Route::post('attributes/{attribute}/options', [AttributeOptionController::class, 'store'])->name('attributes.options.store')->middleware('permission:attributes,edit_attributes');
    // เส้นทางเดียวกันเป๊ะกับด้านบน (AttributeOptionController::store() ตัวเดิม
    // ไม่ได้แก้อะไรเลย) แค่แยกสิทธิ์ออกมาต่างหาก — ใช้โดย QuickAddOptionDialog
    // บนหน้าแก้ไขสินค้าเท่านั้น (เพิ่ม option ทีละตัวแบบเร็วๆ ไม่ออกจากฟอร์ม
    // สินค้า) เดิม dialog นี้ยิงไป route เดียวกับหน้า options CRUD เต็มรูปแบบ
    // เลยต้องมีสิทธิ์ attributes.edit_attributes ทั้งที่ผู้ใช้ไม่จำเป็นต้องมีสิทธิ์
    // แก้ไขตัว attribute เองเลยก็ได้ — แยกเป็น attributes.quick_add_options
    // ต่างหาก (ดู migration split_quick_add_options_permission_from_attributes)
    Route::post('attributes/{attribute}/options/quick-add', [AttributeOptionController::class, 'store'])->name('attributes.options.quickAdd')->middleware('permission:attributes,quick_add_options');
    // ต้อง register route นี้ไว้ก่อน route {option} ด้านล่าง ไม่งั้นคำว่า "batch" จะถูกตีความเป็น {option} id ไปแทน
    Route::put('attributes/{attribute}/options/batch', [AttributeOptionController::class, 'batchUpdate'])->name('attributes.options.batchUpdate')->middleware('permission:attributes,edit_attributes');
    Route::put('attributes/{attribute}/options/{option}', [AttributeOptionController::class, 'update'])->name('attributes.options.update')->middleware('permission:attributes,edit_attributes');
    Route::delete('attributes/{attribute}/options/{option}', [AttributeOptionController::class, 'destroy'])->name('attributes.options.destroy')->middleware('permission:attributes,edit_attributes');
    // "ยกเลิก custom" ตัวเลือกหนึ่งตัว แล้วดึงค่ากลับจาก master — เฉพาะ
    // attribute ที่ผูก master_source ไว้เท่านั้น (ดู AttributeOptionController::resetToMaster())
    Route::post('attributes/{attribute}/options/{option}/reset-to-master', [AttributeOptionController::class, 'resetToMaster'])->name('attributes.options.resetToMaster')->middleware('permission:attributes,edit_attributes');

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
    Route::post('brands/sync-shopee', [BrandController::class, 'syncShopeeBrands'])->name('brands.syncShopee')->middleware('permission:marketplace_shopee,edit_brand_mapping_shopee');
    // ไม่มีหน้า GET brands/shopee-mapping แล้ว — การจับคู่แบรนด์ Shopee ย้ายไป
    // อยู่ที่ categories/shopee-mapping.tsx แทน (เพราะ get_brand_list ผูกกับ
    // category อยู่แล้ว การจับคู่ตรงจุดที่กำลังดู category อยู่พอดีเลยสมเหตุสมผล
    // กว่าแยกเป็นหน้ารายชื่อแบรนด์แบบ global ต่างหาก) route POST ด้านล่างนี้
    // ยังเหมือนเดิม ยังคงทำหน้าที่บันทึกข้อมูลจริงอยู่ ส่วน endpoint search-pim/
    // shopee-brands-for-category ที่มันทำงานคู่กันด้วยตอนนี้ย้ายไปอยู่ใน
    // กลุ่ม categories/ ด้านล่างแล้ว
    Route::post('brands/shopee-mapping', [BrandController::class, 'bulkMapShopeeBrand'])->name('brands.bulkMapShopee')->middleware('permission:marketplace_shopee,edit_brand_mapping_shopee');
    Route::get('brands/search-pim', [BrandController::class, 'searchPimBrands'])->name('brands.searchPim')->middleware('permission:brands,edit_brands');
    Route::get('marketplace-brands/{platform}/search', [BrandController::class, 'marketplaceBrandSearch'])->name('marketplaceBrands.search')->middleware('permission:brands,list_brands');
    Route::get('marketplace-brands/{platform}/lookup', [BrandController::class, 'marketplaceBrandLookup'])->name('marketplaceBrands.lookup')->middleware('permission:brands,list_brands');
    Route::post('brands/sync-woocommerce', [BrandController::class, 'syncWoocommerceBrands'])->name('brands.syncWoocommerce')->middleware('permission:marketplace_woocommerce,edit_brand_mapping_woocommerce');
    // ไม่มีหน้า GET brands/woocommerce-mapping หรือ endpoint
    // brands/search-woocommerce แล้ว — ย้ายแบบเดียวกับของ Lazada ด้านบน
    // การจัดการแบรนด์ WooCommerce ตอนนี้ย้ายไปอยู่ที่ categories/woocommerce-mapping.tsx
    Route::post('brands/woocommerce-mapping', [BrandController::class, 'bulkMapWoocommerceBrand'])->name('brands.bulkMapWoocommerce')->middleware('permission:marketplace_woocommerce,edit_brand_mapping_woocommerce');
    Route::post('brands/sync-lazada', [BrandController::class, 'syncLazadaBrands'])->name('brands.syncLazada')->middleware('permission:marketplace_lazada,edit_brand_mapping_lazada');
    // ไม่มีหน้า GET brands/lazada-mapping หรือ endpoint brands/search-lazada
    // แล้ว — การจัดการแบรนด์ Lazada ตอนนี้ย้ายไปอยู่ที่ categories/lazada-mapping.tsx
    // โดยจับคู่กันคนละทิศทาง (ดู docblock ของหน้านั้นและของ
    // BrandController::lazadaBrandsList()) route POST ด้านล่างนี้ยังเหมือนเดิม
    // ยังคงทำหน้าที่บันทึกข้อมูลจริงอยู่
    Route::post('brands/lazada-mapping', [BrandController::class, 'bulkMapLazadaBrand'])->name('brands.bulkMapLazada')->middleware('permission:marketplace_lazada,edit_brand_mapping_lazada');
    Route::post('brands/sync-tiktok', [BrandController::class, 'syncTiktokBrands'])->name('brands.syncTiktok')->middleware('permission:marketplace_tiktok,edit_brand_mapping_tiktok');
    // ไม่มีหน้า GET brands/tiktok-mapping หรือ endpoint brands/search-tiktok
    // แล้ว — ย้ายแบบเดียวกับของ Lazada/WooCommerce ด้านบน การจัดการแบรนด์
    // TikTok ตอนนี้ย้ายไปอยู่ที่ categories/tiktok-mapping.tsx
    Route::post('brands/tiktok-mapping', [BrandController::class, 'bulkMapTiktokBrand'])->name('brands.bulkMapTiktok')->middleware('permission:marketplace_tiktok,edit_brand_mapping_tiktok');
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
    // ทำสำเนา — ถือเป็นการ "สร้าง" ตระกูลใหม่ (โค้ดใหม่, id ใหม่) เลยใช้สิทธิ์
    // create_attribute_families ตัวเดียวกับปุ่ม "Create" แทนที่จะแยกสิทธิ์ของตัว
    // เอง — เหมือนแพทเทิร์นเดียวกับ ProductController::duplicate() ที่ใช้
    // permission:products,create_products
    Route::post('attributeFamilies/{attributeFamily}/duplicate', [AttributeFamilyController::class, 'duplicate'])->name('attributeFamilies.duplicate')->middleware('permission:attribute_families,create_attribute_families');
    // ปุ่ม "ตั้งเป็นค่าเริ่มต้นให้ทุกกลุ่มสินค้า" แยกออกมาเป็นสิทธิ์ของตัวเอง
    // (attribute_families,assign_default_family) จาก edit_attribute_families
    // ทั่วไป — เพราะเป็น action ที่ทับ default family ของ "ทุก" กลุ่มสินค้าใน
    // ระบบพร้อมกันทีเดียว ต่างจากการแก้ไข attribute family ทีละตัวตามปกติ อยาก
    // ให้แยกสิทธิ์ทำ mass-overwrite นี้ออกจากสิทธิ์แก้ไขทั่วไปได้ (ดู migration
    // backfill_attribute_family_assign_default_permission ที่ copy สิทธิ์นี้ไป
    // ให้ทุก role ที่มี edit_attribute_families อยู่แล้วตอน deploy)
    Route::post('attributeFamilies/{attributeFamily}/set-default-for-all-groups', [AttributeFamilyController::class, 'setDefaultForAllGroups'])->name('attributeFamilies.setDefaultForAllGroups')->middleware('permission:attribute_families,assign_default_family');
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

    // "ประเภทสินค้า" (Product Types) master — own `product_types` table
    // (name + description + status), mirrors into the `producttype`
    // attribute's options via `master_source`. Own `product_types.*`
    // permissions backfilled from `categories.*`. `edit_product_types`
    // covers every write.
    Route::get('product-types', [ProductTypeController::class, 'index'])->name('productTypes.index')->middleware('permission:product_types,list_product_types');
    Route::get('product-types/create', [ProductTypeController::class, 'create'])->name('productTypes.create')->middleware('permission:product_types,edit_product_types');
    Route::post('product-types', [ProductTypeController::class, 'store'])->name('productTypes.store')->middleware('permission:product_types,edit_product_types');
    Route::get('product-types/{productType}/edit', [ProductTypeController::class, 'edit'])->name('productTypes.edit')->middleware('permission:product_types,edit_product_types');
    Route::put('product-types/{productType}', [ProductTypeController::class, 'update'])->name('productTypes.update')->middleware('permission:product_types,edit_product_types');
    Route::delete('product-types/{productType}', [ProductTypeController::class, 'destroy'])->name('productTypes.destroy')->middleware('permission:product_types,edit_product_types');

    Route::get('product-grades', [ProductGradeController::class, 'index'])->name('productGrades.index')->middleware('permission:product_grades,list_product_grades');
    Route::get('product-grades/create', [ProductGradeController::class, 'create'])->name('productGrades.create')->middleware('permission:product_grades,edit_product_grades');
    Route::post('product-grades', [ProductGradeController::class, 'store'])->name('productGrades.store')->middleware('permission:product_grades,edit_product_grades');
    Route::get('product-grades/{productGrade}/edit', [ProductGradeController::class, 'edit'])->name('productGrades.edit')->middleware('permission:product_grades,edit_product_grades');
    Route::put('product-grades/{productGrade}', [ProductGradeController::class, 'update'])->name('productGrades.update')->middleware('permission:product_grades,edit_product_grades');
    Route::delete('product-grades/{productGrade}', [ProductGradeController::class, 'destroy'])->name('productGrades.destroy')->middleware('permission:product_grades,edit_product_grades');

    // "วัตถุดิบ" (Raw Materials / RM) master — ไม่ใช่สินค้าแบบใหม่ แค่หน้าจอ
    // ติ๊ก/เลือกว่าสินค้าที่มีอยู่แล้วตัวไหนใช้เป็นวัตถุดิบได้บ้าง
    // (products.is_raw_material) ไม่มี edit เพราะไม่มีอะไรให้แก้ นอกจาก
    // เพิ่ม (store) / เอาออก (destroy) ดู RawMaterialController
    Route::get('raw-materials', [RawMaterialController::class, 'index'])->name('rawMaterials.index')->middleware('permission:raw_materials,list_raw_materials');
    Route::post('raw-materials', [RawMaterialController::class, 'store'])->name('rawMaterials.store')->middleware('permission:raw_materials,edit_raw_materials');
    Route::delete('raw-materials/{product}', [RawMaterialController::class, 'destroy'])->name('rawMaterials.destroy')->middleware('permission:raw_materials,edit_raw_materials');

    // "BOM" (Bill of Materials) master — แทนที่ placeholder stub เดิม (เอาบรรทัด
    // 'bom' ออกจากกลุ่ม $stub ด้านล่างแล้ว) สร้างโดยเลือก SKU สินค้าที่มีอยู่แล้ว
    // แล้วค่อยเพิ่มรายการวัตถุดิบ (จำกัดแค่สินค้าที่อยู่ในลิสต์ราวัตถุดิบด้านบน)
    // จากหน้าแก้ไข ดู BomController
    Route::get('bom', [BomController::class, 'index'])->name('bom.index')->middleware('permission:bom,list_bom');
    Route::get('bom/create', [BomController::class, 'create'])->name('bom.create')->middleware('permission:bom,edit_bom');
    Route::post('bom', [BomController::class, 'store'])->name('bom.store')->middleware('permission:bom,edit_bom');
    Route::get('bom/{bom}/edit', [BomController::class, 'edit'])->name('bom.edit')->middleware('permission:bom,edit_bom');
    Route::put('bom/{bom}', [BomController::class, 'update'])->name('bom.update')->middleware('permission:bom,edit_bom');
    Route::delete('bom/{bom}', [BomController::class, 'destroy'])->name('bom.destroy')->middleware('permission:bom,edit_bom');

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
    Route::post('categories/sync-lazada', [CategoryController::class, 'syncLazadaCategories'])->name('categories.syncLazada')->middleware('permission:marketplace_lazada,edit_category_mapping_lazada');
    Route::post('categories/sync-shopee', [CategoryController::class, 'syncShopeeCategories'])->name('categories.syncShopee')->middleware('permission:marketplace_shopee,edit_category_mapping_shopee');
    Route::post('categories/sync-tiktok', [CategoryController::class, 'syncTikTokCategories'])->name('categories.syncTiktok')->middleware('permission:marketplace_tiktok,edit_category_mapping_tiktok');
    Route::get('categories/search-lazada', [CategoryController::class, 'searchLazadaCategories'])->name('categories.searchLazada')->middleware('permission:marketplace_lazada,edit_category_mapping_lazada');
    Route::get('categories/{category}/products', [CategoryController::class, 'categoryProducts'])->name('categories.products')->middleware('permission:categories,edit_categories');
    Route::get('categories/lazada-mapping', [CategoryController::class, 'lazadaMapping'])->name('categories.lazadaMapping')->middleware('permission:marketplace_lazada,edit_category_mapping_lazada');
    Route::post('categories/lazada-mapping', [CategoryController::class, 'bulkMapLazada'])->name('categories.bulkMapLazada')->middleware('permission:marketplace_lazada,edit_category_mapping_lazada');
    // ปุ่ม "ล้าง Category Mapping" ในหน้า lazada-products.tsx's Object Page —
    // รับ product_id แทน category_id ตรงๆ (ดู CategoryController::
    // clearProductMarketplaceCategory()'s docblock ว่าทำไมถึงต้องแยกจาก
    // bulkMapLazada() ด้านบน)
    Route::post('categories/lazada-mapping/clear-for-product', [CategoryController::class, 'clearProductLazadaMapping'])->name('categories.lazadaMapping.clearForProduct')->middleware('permission:marketplace_lazada,edit_category_mapping_lazada');
    // action ฝั่งแบรนด์ที่ฝังอยู่ในหน้าเดียวกัน (ดู docblock ของ
    // BrandController::lazadaBrandsList()) — เช็คสิทธิ์ด้วย brands,edit_brands
    // แทนที่จะเป็น categories,edit_categories เพราะมันอ่าน/เขียนข้อมูลแบรนด์
    // แม้ว่าจะถูกเรียกจากตาราง categories/lazada-mapping.tsx ก็ตาม ไม่ได้ผูกกับ
    // category (ต่างจากของ Shopee) — แคตตาล็อกแบรนด์ของ Lazada ไม่มีมิติเรื่อง
    // category เลย เลยไม่มี {lazadaCategoryId} ใน path นี้
    Route::get('categories/lazada-mapping/lazada-brands', [BrandController::class, 'lazadaBrandsList'])->name('categories.lazadaMapping.lazadaBrands')->middleware('permission:marketplace_lazada,edit_brand_mapping_lazada');
    // แนวคิดเดียวกัน แต่เป็นฝั่ง attribute แทนฝั่งแบรนด์ — ดู docblock ของ
    // LazadaAttributeMappingController สำหรับสอง route นี้ schema attribute
    // ของ Lazada ผูกกับ category จริงๆ (/category/attributes/get) คู่ route นี้
    // เลยมีรูปแบบเหมือนกับ {shopeeCategoryId} ของ Shopee เป๊ะๆ
    Route::post('categories/lazada-mapping/sync-attributes', [LazadaAttributeMappingController::class, 'syncLazadaAttributesForCategory'])->name('categories.lazadaMapping.syncAttributes')->middleware('permission:marketplace_lazada,edit_attribute_mapping_lazada');
    Route::get('categories/{lazadaCategoryId}/lazada-attributes', [LazadaAttributeMappingController::class, 'lazadaAttributesForCategory'])->name('categories.lazadaAttributesForCategory')->middleware('permission:marketplace_lazada,edit_attribute_mapping_lazada');
    Route::get('categories/search-shopee', [CategoryController::class, 'searchShopeeCategories'])->name('categories.searchShopee')->middleware('permission:marketplace_shopee,edit_category_mapping_shopee');
    Route::get('categories/shopee-mapping', [CategoryController::class, 'shopeeMapping'])->name('categories.shopeeMapping')->middleware('permission:marketplace_shopee,edit_category_mapping_shopee');
    Route::post('categories/shopee-mapping', [CategoryController::class, 'bulkMapShopee'])->name('categories.bulkMapShopee')->middleware('permission:marketplace_shopee,edit_category_mapping_shopee');
    // เหมือนกับ categories.lazadaMapping.clearForProduct ด้านบน แต่ใช้กับ Shopee
    Route::post('categories/shopee-mapping/clear-for-product', [CategoryController::class, 'clearProductShopeeMapping'])->name('categories.shopeeMapping.clearForProduct')->middleware('permission:marketplace_shopee,edit_category_mapping_shopee');
    // action ฝั่งแบรนด์ที่ฝังอยู่ในหน้าเดียวกัน (ดู docblock ของ BrandController
    // สำหรับสอง route นี้) — เช็คสิทธิ์ด้วย brands,edit_brands แทนที่จะเป็น
    // categories,edit_categories เพราะมันอ่าน/เขียนข้อมูลแบรนด์ แม้ว่าจะถูกเรียก
    // จากตาราง categories/shopee-mapping.tsx ก็ตาม
    Route::post('categories/shopee-mapping/sync-brands', [BrandController::class, 'syncShopeeBrandsForCategory'])->name('categories.shopeeMapping.syncBrands')->middleware('permission:marketplace_shopee,edit_brand_mapping_shopee');
    Route::get('categories/{shopeeCategoryId}/shopee-brands', [BrandController::class, 'shopeeBrandsForCategory'])->name('categories.shopeeBrandsForCategory')->middleware('permission:marketplace_shopee,edit_brand_mapping_shopee');
    // แนวคิดเดียวกัน แต่เป็นฝั่ง attribute แทนฝั่งแบรนด์ — ดู docblock ของ
    // ShopeeAttributeMappingController สำหรับสอง route นี้
    Route::post('categories/shopee-mapping/sync-attributes', [ShopeeAttributeMappingController::class, 'syncShopeeAttributesForCategory'])->name('categories.shopeeMapping.syncAttributes')->middleware('permission:marketplace_shopee,edit_attribute_mapping_shopee');
    Route::get('categories/{shopeeCategoryId}/shopee-attributes', [ShopeeAttributeMappingController::class, 'shopeeAttributesForCategory'])->name('categories.shopeeAttributesForCategory')->middleware('permission:marketplace_shopee,edit_attribute_mapping_shopee');
    Route::get('categories/search-tiktok', [CategoryController::class, 'searchTikTokCategories'])->name('categories.searchTiktok')->middleware('permission:marketplace_tiktok,edit_category_mapping_tiktok');
    Route::get('categories/tiktok-mapping', [CategoryController::class, 'tiktokMapping'])->name('categories.tiktokMapping')->middleware('permission:marketplace_tiktok,edit_category_mapping_tiktok');
    Route::post('categories/tiktok-mapping', [CategoryController::class, 'bulkMapTiktok'])->name('categories.bulkMapTiktok')->middleware('permission:marketplace_tiktok,edit_category_mapping_tiktok');
    // เหมือนกับ categories.lazadaMapping.clearForProduct ด้านบน แต่ใช้กับ TikTok
    Route::post('categories/tiktok-mapping/clear-for-product', [CategoryController::class, 'clearProductTiktokMapping'])->name('categories.tiktokMapping.clearForProduct')->middleware('permission:marketplace_tiktok,edit_category_mapping_tiktok');
    // action ฝั่งแบรนด์ที่ฝังอยู่ในหน้าเดียวกัน (ดู docblock ของ
    // BrandController::tiktokBrandsList()) — ไม่ได้ผูกกับ category
    // (เหมือนของ Lazada/WooCommerce ต่างจากของ Shopee) เลยไม่มี
    // {tiktokCategoryId} ใน path นี้
    Route::get('categories/tiktok-mapping/tiktok-brands', [BrandController::class, 'tiktokBrandsList'])->name('categories.tiktokMapping.tiktokBrands')->middleware('permission:marketplace_tiktok,edit_brand_mapping_tiktok');
    // ส่วนที่เทียบเท่าฝั่ง attribute — endpoint Get Attributes ของ TikTok
    // ผูกกับ category จริงๆ (เรียกทีละ category_id) คู่ route นี้เลยมีรูปแบบ
    // เหมือนกับ {xCategoryId} ของ Shopee/Lazada
    Route::post('categories/tiktok-mapping/sync-attributes', [TikTokAttributeMappingController::class, 'syncTikTokAttributesForCategory'])->name('categories.tiktokMapping.syncAttributes')->middleware('permission:marketplace_tiktok,edit_attribute_mapping_tiktok');
    Route::get('categories/{tiktokCategoryId}/tiktok-attributes', [TikTokAttributeMappingController::class, 'tiktokAttributesForCategory'])->name('categories.tiktokAttributesForCategory')->middleware('permission:marketplace_tiktok,edit_attribute_mapping_tiktok');
    Route::post('categories/sync-woocommerce', [CategoryController::class, 'syncWoocommerceCategories'])->name('categories.syncWoocommerce')->middleware('permission:marketplace_woocommerce,edit_category_mapping_woocommerce');
    Route::get('categories/search-woocommerce', [CategoryController::class, 'searchWoocommerceCategories'])->name('categories.searchWoocommerce')->middleware('permission:marketplace_woocommerce,edit_category_mapping_woocommerce');
    Route::get('categories/woocommerce-mapping', [CategoryController::class, 'woocommerceMapping'])->name('categories.woocommerceMapping')->middleware('permission:marketplace_woocommerce,edit_category_mapping_woocommerce');
    Route::post('categories/woocommerce-mapping', [CategoryController::class, 'bulkMapWoocommerce'])->name('categories.bulkMapWoocommerce')->middleware('permission:marketplace_woocommerce,edit_category_mapping_woocommerce');
    // action ฝั่งแบรนด์ที่ฝังอยู่ในหน้าเดียวกัน (ดู docblock ของ
    // BrandController::woocommerceBrandsList()) — ไม่ได้ผูกกับ category
    // เหตุผลเดียวกับของ Lazada/TikTok ด้านบน
    Route::get('categories/woocommerce-mapping/woocommerce-brands', [BrandController::class, 'woocommerceBrandsList'])->name('categories.woocommerceMapping.woocommerceBrands')->middleware('permission:marketplace_woocommerce,edit_brand_mapping_woocommerce');
    Route::get('categories/export-woocommerce', [CategoryController::class, 'exportWoocommerceCategories'])->name('categories.exportWoocommerce')->middleware('permission:marketplace_woocommerce,edit_category_mapping_woocommerce');
    Route::post('categories/import-woocommerce', [CategoryController::class, 'importFromWoocommerce'])->name('categories.importWoocommerce')->middleware('permission:marketplace_woocommerce,edit_category_mapping_woocommerce');

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

    // ── มาสเตอร์ > มาร์เก็ตเพลส > {แพลตฟอร์ม} ────────────────────────────
    // เดิมทั้ง 4 แพลตฟอร์มแชร์สิทธิ์เดียวกัน (products,list_products) ทั้งที่
    // ไม่เกี่ยวกับ Products โดยตรง — แยกเป็นสิทธิ์ของตัวเองต่อแพลตฟอร์มแทน
    // (marketplace_shopee/lazada/tiktok/woocommerce) เพื่อให้กำหนด role ที่เห็น
    // แค่บาง platform ได้ (เช่น ทีมดูแล Shopee อย่างเดียว ไม่ต้องเห็นเมนู Lazada)
    // — คุมทั้งหน้า hub (มาสเตอร์ > มาร์เก็ตเพลส > {แพลตฟอร์ม}) และหน้าตั้งค่า
    // การเชื่อมต่อ (marketplace/connect/{platform}) ที่ hub นั้นลิงก์ไป ส่วนการ์ด
    // "จับคู่หมวดหมู่"/"จับคู่ข้อมูลส่ง" ในหน้า hub ยังคุมด้วยสิทธิ์ของตัวเองแยก
    // ต่างหากเหมือนเดิม (categories,edit_categories / attributes,edit_attributes)
    // ไม่ผูกกับสิทธิ์ใหม่นี้ — ดู migration backfill_marketplace_platform_permissions
    // ที่ให้สิทธิ์นี้ย้อนหลังกับทุก role ที่เคยมี products,list_products มาก่อน
    // (รักษาสิทธิ์เข้าถึงเดิมไว้ ไม่ให้ใครหลุดออกจากเมนูที่เคยเห็นอยู่แล้ว) แล้ว
    // รัน `php artisan permissions:sync` เพื่อขึ้นทะเบียนสิทธิ์ใหม่นี้ในหน้า Roles
    // (auto-generate จาก route scan — ดู PermissionCatalog) ให้ Administrator ด้วย
    foreach (['shopee', 'lazada', 'tiktok', 'woocommerce'] as $platform) {
        Route::middleware("permission:marketplace_{$platform},list_marketplace_{$platform}")->group(function () use ($platform) {
            // เดิมเป็นแค่ placeholder ("under construction") — ตอนนี้เป็นขั้นแรกจริง
            // (ตารางร้านค้าของแพลตฟอร์มนี้) ดู SalesPlatformController::connectionSettings()
            // — เรียกผ่าน closure แทนที่จะผูก route กับ [Controller::class, 'method']
            // ตรงๆ เพราะ path ของแต่ละ loop iteration เป็น literal segment
            // ("marketplace/connect/shopee") ไม่ใช่ {platform} wildcard แล้ว จึงไม่มี
            // route parameter ให้ Laravel inject เข้า connectionSettings(string
            // $platform) เองอัตโนมัติ — ส่ง $platform ของ iteration นี้เข้าไปตรงๆ แทน
            Route::get("marketplace/connect/{$platform}", fn () => app(SalesPlatformController::class)->connectionSettings($platform))
                ->name("marketplace.connect.{$platform}");

            // Hub page ของแพลตฟอร์มนี้ (มาสเตอร์ > มาร์เก็ตเพลส > {แพลตฟอร์ม}) — grid
            // การ์ด 3 ใบพาไปหน้าจับคู่หมวดหมู่/จับคู่ข้อมูลส่ง/ตั้งค่าการเชื่อมต่อของ
            // แพลตฟอร์มนั้น (ดู resources/js/pages/catalog/marketplace/platform-hub.tsx)
            // เป็นแค่หน้า launcher ไม่มี business logic ของตัวเอง เลย render ตรงนี้
            // แบบเดียวกับ marketplace/connect/{platform} ด้านบน ไม่ต้องมี controller แยก
            Route::get("marketplace/{$platform}", fn () => Inertia::render('catalog/marketplace/platform-hub', [
                'platform' => $platform,
            ]))->name("marketplace.hub.{$platform}");
        });
    }

    // "category" (รวม brand-mapping กลับเข้าไปแล้วเหมือนเดิม) reached straight
    // from the sidebar at its real URL (/catalog/categories/{platform}-mapping),
    // and "push" (แมปฟิวส่งข้อมูล) now reaches its own real attribute-mapping page
    // at /catalog/marketplace/{platform}/attribute-mapping — neither lives under
    // this foreach; each keeps its own existing permission (see their route
    // definitions above).
});
