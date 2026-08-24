<?php

namespace App\Services\Catalog;

/**
 * Static inventory of every external marketplace API operation this
 * codebase actually calls, grouped by platform — backs the "API Usage"
 * view under Sales Channels > Sales Platforms (SalesPlatformController::
 * apiUsage()). This is documentation-as-data, not a live health check: it
 * describes what the integration *does*, sourced from the real
 * *Client/*ProductSyncService classes, and is meant to be updated by hand
 * whenever a new API call is added to one of those classes.
 *
 * Deliberately never calls any of these APIs itself — several are
 * real, customer-visible writes (create/update/deactivate a listing), so a
 * page whose whole point is "what do we call" must never call them just to
 * render.
 */
class MarketplaceApiCatalog
{
    /**
     * @return array<string, array{
     *     label: string,
     *     baseUrl: string,
     *     auth: string,
     *     tokenSource: string,
     *     groups: array<int, array{
     *         label: string,
     *         operations: array<int, array{method: string, endpoint: string, purpose: string, source: string, write: bool}>,
     *     }>,
     * }>
     */
    public static function platforms(): array
    {
        return [
            'shopee' => [
                'label' => 'Shopee',
                'baseUrl' => 'partner.shopeemobile.com',
                'auth' => 'HMAC-SHA256 request signing (partner_id/access_token/shop_id/sign)',
                'tokenSource' => "Read-only from n8n's shopee_tokens table — n8n owns the OAuth flow and token refresh",
                'groups' => [
                    [
                        'label' => 'Category & attribute schema',
                        'operations' => [
                            ['method' => 'GET', 'endpoint' => '/api/v2/product/get_category', 'purpose' => 'Sync Shopee\'s category tree', 'source' => 'ShopeeClient::getCategoryTree() → CategoryController::syncShopeeCategories()', 'write' => false],
                            ['method' => 'GET', 'endpoint' => '/api/v2/product/get_attribute_tree', 'purpose' => 'Sync mandatory/optional attribute schema per category', 'source' => 'ShopeeClient::getAttributeTree() → ShopeeAttributeMappingController::syncShopeeAttributes()', 'write' => false],
                        ],
                    ],
                    [
                        'label' => 'Brand & logistics setup',
                        'operations' => [
                            ['method' => 'GET', 'endpoint' => '/api/v2/product/get_brand_list', 'purpose' => 'Brand list per category, required by add_item', 'source' => 'ShopeeClient::getBrandList() → ShopeeProductSyncService::resolveBrand(), BrandController::syncShopeeBrands()', 'write' => false],
                            ['method' => 'GET', 'endpoint' => '/api/v2/logistics/get_channel_list', 'purpose' => 'Shop\'s enabled shipping channels for add_item.logistic_info', 'source' => 'ShopeeClient::getChannelList() → ShopeeProductSyncService::enabledLogisticsChannelIds()', 'write' => false],
                        ],
                    ],
                    [
                        'label' => 'Media upload',
                        'operations' => [
                            ['method' => 'POST', 'endpoint' => '/api/v2/media_space/upload_image', 'purpose' => 'Upload product image bytes (Shopee rejects external URLs)', 'source' => 'ShopeeClient::uploadImage() → ShopeeProductSyncService::uploadImagesToShopee()', 'write' => true],
                            ['method' => 'POST', 'endpoint' => '/api/v2/media/init_video_upload → upload_video_part → complete_video_upload → get_video_upload_result', 'purpose' => '4-step video upload for the product video field', 'source' => 'ShopeeClient::uploadVideo() → ShopeeProductSyncService::uploadVideoToShopee()', 'write' => true],
                        ],
                    ],
                    [
                        'label' => 'Listing push & status',
                        'operations' => [
                            ['method' => 'POST', 'endpoint' => '/api/v2/product/add_item', 'purpose' => 'Create a new live listing', 'source' => 'ShopeeClient::addItem() → ShopeeProductSyncService::push() → ProductController::pushToShopee()', 'write' => true],
                            ['method' => 'POST', 'endpoint' => '/api/v2/product/update_item', 'purpose' => 'Update an existing live listing', 'source' => 'ShopeeClient::updateItem() → ShopeeProductSyncService::push()', 'write' => true],
                            ['method' => 'GET', 'endpoint' => '/api/v2/product/get_item_base_info', 'purpose' => 'Check one item\'s live status/detail', 'source' => 'ShopeeClient::getItemBaseInfo() → ShopeeProductSyncService::checkLiveStatus()', 'write' => false],
                            ['method' => 'GET', 'endpoint' => '/api/v2/product/get_item_list', 'purpose' => 'Bulk list of the shop\'s own items, for live-status sync', 'source' => 'ShopeeClient::getItemList() → ShopeeProductSyncService::syncLiveStatus()', 'write' => false],
                            ['method' => 'POST', 'endpoint' => '/api/v2/product/unlist_item', 'purpose' => 'Deactivate/hide a listing', 'source' => 'ShopeeClient::unlistItem() → ShopeeProductSyncService::deactivate() → ProductController::deactivateShopee()', 'write' => true],
                        ],
                    ],
                ],
            ],
            'lazada' => [
                'label' => 'Lazada',
                'baseUrl' => 'api.lazada.co.th/rest',
                'auth' => 'HMAC-SHA256 request signing (app_key/[access_token]/sign)',
                'tokenSource' => "Read-only from n8n's lazada_tokens table — n8n owns the OAuth flow and token refresh",
                'groups' => [
                    [
                        'label' => 'Category & attribute schema',
                        'operations' => [
                            ['method' => 'GET', 'endpoint' => '/category/tree/get', 'purpose' => 'Sync Lazada\'s category tree (no-auth "system tools" endpoint)', 'source' => 'LazadaClient::getCategoryTree() → CategoryController::syncLazadaCategories()', 'write' => false],
                            ['method' => 'GET', 'endpoint' => '/category/attributes/get', 'purpose' => 'Sync category attribute schema', 'source' => 'LazadaClient::getCategoryAttributes() → LazadaAttributeMappingController::syncLazadaAttributes()', 'write' => false],
                        ],
                    ],
                    [
                        'label' => 'Brand setup',
                        'operations' => [
                            ['method' => 'GET/POST', 'endpoint' => '/category/brands/query', 'purpose' => 'Paginated brand list', 'source' => 'LazadaClient::queryBrands() → BrandController::syncLazadaBrands()', 'write' => false],
                        ],
                    ],
                    [
                        'label' => 'Media upload',
                        'operations' => [
                            ['method' => 'POST', 'endpoint' => '/image/upload', 'purpose' => 'Upload product image bytes (Lazada rejects non-Lazada URLs)', 'source' => 'LazadaClient::uploadImage() → LazadaProductSyncService::uploadImagesToLazada()', 'write' => true],
                            ['method' => 'POST', 'endpoint' => '/media/video/block/create → block/upload → block/commit', 'purpose' => '3-step Media Center video upload', 'source' => 'LazadaClient::uploadVideo() → LazadaProductSyncService::uploadVideoToLazada()', 'write' => true],
                        ],
                    ],
                    [
                        'label' => 'Listing push & status',
                        'operations' => [
                            ['method' => 'POST', 'endpoint' => '/product/create', 'purpose' => 'Create a new live listing', 'source' => 'LazadaClient::createProduct() → LazadaProductSyncService::push() → ProductController::pushToLazada()', 'write' => true],
                            ['method' => 'POST', 'endpoint' => '/product/update', 'purpose' => 'Update an existing live listing', 'source' => 'LazadaClient::updateProduct() → LazadaProductSyncService::push()', 'write' => true],
                            ['method' => 'GET', 'endpoint' => '/products/get (filter=live)', 'purpose' => 'Bulk list of the shop\'s own live listings, for live-status sync', 'source' => 'LazadaClient::getLiveProducts() → LazadaProductSyncService::syncLiveStatus() → SalesPlatformController::syncLiveStatus()', 'write' => false],
                            ['method' => 'GET', 'endpoint' => '/products/get (filter=all, sku_seller_list)', 'purpose' => 'Find one product by our SKU, for a single-item status check', 'source' => 'LazadaClient::findProductBySku() → LazadaProductSyncService::checkLiveStatus() → ProductController::checkLazadaStatus()', 'write' => false],
                            ['method' => 'POST', 'endpoint' => '/product/deactivate', 'purpose' => 'Deactivate/hide a listing', 'source' => 'LazadaClient::deactivateProduct() → LazadaProductSyncService::deactivate() → ProductController::deactivateLazada()', 'write' => true],
                        ],
                    ],
                ],
            ],
            'tiktok' => [
                'label' => 'TikTok Shop',
                'baseUrl' => 'open-api.tiktokglobalshop.com',
                'auth' => 'HMAC-SHA256 request signing + x-tts-access-token header',
                'tokenSource' => "Read-only from n8n's tiktok_tokens table — n8n owns the OAuth flow and token refresh",
                'groups' => [
                    [
                        'label' => 'Category & attribute schema',
                        'operations' => [
                            ['method' => 'GET', 'endpoint' => '/product/{v}/categories', 'purpose' => 'Sync TikTok Shop\'s category tree', 'source' => 'TikTokClient::getCategoryTree() → CategoryController::syncTikTokCategories()', 'write' => false],
                            ['method' => 'GET', 'endpoint' => '/product/{v}/categories/{id}/attributes', 'purpose' => 'Sync sales/product-property attribute schema per category', 'source' => 'TikTokClient::getAttributes() → TikTokAttributeMappingController::syncTikTokAttributes()', 'write' => false],
                            ['method' => 'GET', 'endpoint' => '/product/{v}/categories/{id}/rules', 'purpose' => 'Category compliance/certification requirements (available, not yet wired into the push flow)', 'source' => 'TikTokClient::getCategoryRules()', 'write' => false],
                        ],
                    ],
                    [
                        'label' => 'Brand & logistics setup',
                        'operations' => [
                            ['method' => 'GET', 'endpoint' => '/product/{v}/brands', 'purpose' => 'Cursor-paginated brand list', 'source' => 'TikTokClient::getBrands() → BrandController::syncTiktokBrands()', 'write' => false],
                            ['method' => 'GET', 'endpoint' => '/logistics/{v}/warehouses', 'purpose' => 'Shop\'s sales/return warehouses, needed for SKU inventory', 'source' => 'TikTokClient::getWarehouseList() → TikTokProductSyncService::resolveWarehouseId()', 'write' => false],
                            ['method' => 'GET', 'endpoint' => '/logistics/{v}/global_warehouses', 'purpose' => 'Global/cross-border warehouses (available, not currently used)', 'source' => 'TikTokClient::getGlobalSellerWarehouse()', 'write' => false],
                        ],
                    ],
                    [
                        'label' => 'Media upload',
                        'operations' => [
                            ['method' => 'POST', 'endpoint' => '/product/{v}/images/upload', 'purpose' => 'Upload product image bytes', 'source' => 'TikTokClient::uploadImage() → TikTokProductSyncService::uploadImagesToTikTok()', 'write' => true],
                            ['method' => 'POST', 'endpoint' => '/product/{v}/files/upload', 'purpose' => 'Upload certification PDFs / video', 'source' => 'TikTokClient::uploadFile() → TikTokProductSyncService::uploadVideoToTikTok()', 'write' => true],
                        ],
                    ],
                    [
                        'label' => 'Listing push & status',
                        'operations' => [
                            ['method' => 'POST', 'endpoint' => '/product/{v}/products', 'purpose' => 'Create a new live listing', 'source' => 'TikTokClient::createProduct() → TikTokProductSyncService::push() → ProductController::pushToTikTok()', 'write' => true],
                            ['method' => 'PUT', 'endpoint' => '/product/{v}/products/{id}', 'purpose' => 'Update an existing live listing (non-additive SKUs — omitted SKUs get deleted)', 'source' => 'TikTokClient::updateProduct() → TikTokProductSyncService::push()', 'write' => true],
                            ['method' => 'GET', 'endpoint' => '/product/{v}/products/{id}', 'purpose' => 'Check one product\'s live status/detail', 'source' => 'TikTokClient::getProduct() → TikTokProductSyncService::checkLiveStatus() → ProductController::checkTikTokStatus()', 'write' => false],
                            ['method' => 'POST', 'endpoint' => '/product/{v}/products/search', 'purpose' => 'Bulk product search (available, no bulk live-status sync wired yet)', 'source' => 'TikTokClient::searchProducts()', 'write' => false],
                            ['method' => 'POST', 'endpoint' => '/product/{v}/products/activate', 'purpose' => 'Activate listing(s) (available, no controller call yet)', 'source' => 'TikTokClient::activateProducts()', 'write' => true],
                            ['method' => 'POST', 'endpoint' => '/product/{v}/products/deactivate', 'purpose' => 'Deactivate listing(s)', 'source' => 'TikTokClient::deactivateProducts() → TikTokProductSyncService::deactivate() → ProductController::deactivateTikTok()', 'write' => true],
                        ],
                    ],
                ],
            ],
            'woocommerce' => [
                'label' => 'WooCommerce',
                'baseUrl' => '{WOOCOMMERCE_URL}/wp-json',
                'auth' => 'WooCommerce REST: HTTP Basic Auth (consumer_key/consumer_secret) · Media upload: separate WordPress Application Password',
                'tokenSource' => 'Static credentials from config/services.php (WOOCOMMERCE_URL / _CONSUMER_KEY / _CONSUMER_SECRET env vars) — no OAuth refresh needed',
                'groups' => [
                    [
                        'label' => 'Category, brand & attribute schema',
                        'operations' => [
                            ['method' => 'GET', 'endpoint' => '/wc/v3/products/categories', 'purpose' => 'Sync WooCommerce\'s category tree', 'source' => 'WooCommerceClient::getCategories() → CategoryController::syncWoocommerceCategories()', 'write' => false],
                            ['method' => 'GET', 'endpoint' => '/wc/v3/products/brands', 'purpose' => 'Sync the native Product Brands taxonomy', 'source' => 'WooCommerceClient::getBrands() → BrandController::syncWoocommerceBrands()', 'write' => false],
                            ['method' => 'GET', 'endpoint' => '/wc/v3/products/attributes', 'purpose' => 'Sync the global attribute taxonomy', 'source' => 'WooCommerceClient::getAttributes() → WooCommerceAttributeMappingController::syncWoocommerceAttributes()', 'write' => false],
                        ],
                    ],
                    [
                        'label' => 'Media upload',
                        'operations' => [
                            ['method' => 'POST', 'endpoint' => '/wp/v2/media', 'purpose' => 'Upload image bytes directly (bypasses WordPress\'s SSRF-blocked URL-sideload) — uses WP Application Password, not the WooCommerce key', 'source' => 'WooCommerceClient::uploadMedia() → WooCommerceProductSyncService::uploadImagesToWooCommerce()', 'write' => true],
                        ],
                    ],
                    [
                        'label' => 'Listing push & status',
                        'operations' => [
                            ['method' => 'GET', 'endpoint' => '/wc/v3/products?sku={sku}', 'purpose' => 'Find an existing listing by SKU — decides create vs. update, also used for live-status', 'source' => 'WooCommerceClient::findProductBySku() → WooCommerceProductSyncService::createOrRecoverProduct()/checkLiveStatus()', 'write' => false],
                            ['method' => 'GET', 'endpoint' => '/wc/v3/products/{id}', 'purpose' => 'Get one product by ID', 'source' => 'WooCommerceClient::getProduct()', 'write' => false],
                            ['method' => 'POST', 'endpoint' => '/wc/v3/products', 'purpose' => 'Create a new live listing', 'source' => 'WooCommerceClient::createProduct() → WooCommerceProductSyncService::push() → ProductController::pushToWoocommerce()', 'write' => true],
                            ['method' => 'PUT', 'endpoint' => '/wc/v3/products/{id}', 'purpose' => 'Update an existing listing, also used to deactivate (status: draft)', 'source' => 'WooCommerceClient::updateProduct() → WooCommerceProductSyncService::push()/deactivate()', 'write' => true],
                        ],
                    ],
                    [
                        'label' => 'Content translation (TranslatePress — not a REST call)',
                        'operations' => [
                            ['method' => 'SQL', 'endpoint' => 'wp_posts / wp_trp_original_strings / wp_trp_dictionary_th_en_us (via SSH-tunneled MySQL)', 'purpose' => 'Push the PIM\'s English product name into TranslatePress\'s dictionary so the storefront\'s EN version shows it', 'source' => 'WordPressTunnel + WordPressDatabase → TranslatePressTranslationSyncService::fillMissingProductNameTranslations() → ProductController::fillWoocommerceTranslationsForProduct()', 'write' => true],
                        ],
                    ],
                ],
            ],
        ];
    }
}
