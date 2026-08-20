<?php

namespace App\Services\WordPress;

use App\Models\Product;
use App\Models\SalesPlatformShop;
use App\Services\Marketplace\ResolvesProductAttributeValues;
use Illuminate\Support\Facades\DB;

/**
 * Fills English translations into TranslatePress's own dictionary table
 * for products already pushed to WooCommerce — TranslatePress has no REST
 * API of its own, so this talks to the WordPress site's MySQL database
 * directly (see WordPressDatabase/WordPressTunnel).
 *
 * Deliberately conservative: only fills in a translation for a product
 * whose *current* WooCommerce title already has a matching row in
 * `wp_trp_original_strings` — confirmed live this session that
 * TranslatePress only learns a string once it's actually been rendered on
 * a real page view (the table isn't populated upfront), and that some
 * untranslated originals are stored post-HTML-render (e.g. containing
 * `&#47;&nbsp;`), not as the raw DB field — so guessing a matching string
 * for a product TranslatePress has never seen risks writing a translation
 * that silently never displays. Everything else is skipped, not guessed.
 */
class TranslatePressTranslationSyncService
{
    use ResolvesProductAttributeValues;

    public function __construct(private readonly WordPressDatabase $db)
    {
    }

    /**
     * @return array{considered: int, upserted: int, skipped_no_english_name: int, skipped_not_tracked: int, skipped_product_missing: int, errors: array<int, string>}
     */
    public function fillMissingProductNameTranslations(): array
    {
        $stats = [
            'considered' => 0,
            'upserted' => 0,
            'skipped_no_english_name' => 0,
            'skipped_not_tracked' => 0,
            'skipped_product_missing' => 0,
            'errors' => [],
        ];

        $mappings = $this->liveWooCommerceMappings();
        $stats['considered'] = $mappings->count();

        $products = Product::whereIn('id', $mappings->keys())->get()->keyBy('id');

        foreach ($mappings as $productId => $wpPostId) {
            $product = $products->get($productId);
            if (!$product) {
                // A product_platform_shops row surviving its Product being
                // deleted (orphaned pivot data) — counted explicitly so
                // "considered" always reconciles against the sum of every
                // other outcome below, instead of silently going missing.
                $stats['skipped_product_missing']++;

                continue;
            }

            try {
                $this->fillOne($product, $wpPostId, $stats);
            } catch (\Throwable $e) {
                $stats['errors'][] = "Product #{$product->id} (SKU {$product->sku}): {$e->getMessage()}";
            }
        }

        return $stats;
    }

    /**
     * On-demand single-product version — used by the product edit page's
     * "push translation" button, as opposed to fillMissingProductNameTranslations()'s
     * whole-catalog batch run. Resolves its own product→WooCommerce mapping
     * rather than reusing liveWooCommerceMappings() (that one's built for
     * scanning the whole catalog at once, not a single lookup).
     *
     * @return array{status: 'upserted'|'skipped_no_english_name'|'skipped_not_tracked'|'not_live_on_woocommerce'|'error', message?: string}
     */
    public function fillOneProduct(Product $product): array
    {
        $wpPostId = $this->liveWooCommercePostIdFor($product);
        if ($wpPostId === null) {
            return ['status' => 'not_live_on_woocommerce'];
        }

        $stats = ['upserted' => 0, 'skipped_no_english_name' => 0, 'skipped_not_tracked' => 0, 'errors' => []];

        try {
            $this->fillOne($product, $wpPostId, $stats);
        } catch (\Throwable $e) {
            return ['status' => 'error', 'message' => $e->getMessage()];
        }

        return match (true) {
            $stats['upserted'] > 0 => ['status' => 'upserted'],
            $stats['skipped_no_english_name'] > 0 => ['status' => 'skipped_no_english_name'],
            default => ['status' => 'skipped_not_tracked'],
        };
    }

    private function fillOne(Product $product, int $wpPostId, array &$stats): void
    {
        $shop = $this->shopForProduct($product);
        $englishName = $this->attributeValue($product, 'pname', $shop?->channel_id, localeCode: 'en');

        if ($englishName === null || trim($englishName) === '') {
            $stats['skipped_no_english_name']++;

            return;
        }

        $post = $this->db->fetchOne(
            "SELECT post_title FROM wp_posts WHERE ID = ? AND post_type = 'product'",
            [(string) $wpPostId],
        );

        if ($post === null) {
            $stats['skipped_not_tracked']++;

            return;
        }

        $thaiTitle = $post['post_title'];

        // BINARY forces an exact, case-sensitive comparison — the column's
        // default collation (utf8mb4_unicode_520_ci) is case-INsensitive,
        // which could otherwise match a different row that only differs by
        // case (no ORDER BY to make that deterministic either). TranslatePress
        // itself matches rendered strings exactly at runtime, so a
        // case-insensitive match here risks linking the translation to a
        // string that doesn't actually appear on the page.
        $original = $this->db->fetchOne(
            'SELECT id, original FROM wp_trp_original_strings WHERE BINARY original = ?',
            [$thaiTitle],
        );

        if ($original === null) {
            $stats['skipped_not_tracked']++;

            return;
        }

        $originalId = (int) $original['id'];
        // The exact string TranslatePress itself has on file for this id —
        // not $thaiTitle again, so the dictionary row stays byte-for-byte
        // consistent with wp_trp_original_strings even in the (should be
        // impossible post-BINARY-match, but not guaranteed) case they differ.
        $canonicalOriginal = $original['original'];

        $existing = $this->db->fetchOne(
            'SELECT id FROM wp_trp_dictionary_th_en_us WHERE original_id = ?',
            [(string) $originalId],
        );

        if ($existing !== null) {
            $this->db->execute(
                'UPDATE wp_trp_dictionary_th_en_us SET translated = ?, status = 1 WHERE id = ?',
                [$englishName, (string) $existing['id']],
            );
        } else {
            $this->db->execute(
                'INSERT INTO wp_trp_dictionary_th_en_us (original, translated, status, block_type, original_id) VALUES (?, ?, 1, 0, ?)',
                [$canonicalOriginal, $englishName, (string) $originalId],
            );
        }

        $stats['upserted']++;
    }

    /**
     * product_id => WooCommerce post id (int), for every product currently
     * confirmed live on the woocommerce platform — same join
     * ProductController::checkLiveStatus() already uses for this table.
     *
     * @return \Illuminate\Support\Collection<int, int>
     */
    private function liveWooCommerceMappings(): \Illuminate\Support\Collection
    {
        return DB::table('product_platform_shops')
            ->join('sales_platform_shops', 'sales_platform_shops.id', '=', 'product_platform_shops.sales_platform_shop_id')
            ->join('sales_platforms', 'sales_platforms.id', '=', 'sales_platform_shops.sales_platform_id')
            ->where('sales_platforms.code', 'woocommerce')
            ->where('product_platform_shops.status', 'live')
            ->whereNotNull('product_platform_shops.platform_item_id')
            ->pluck('product_platform_shops.platform_item_id', 'product_platform_shops.product_id')
            ->map(fn ($id) => (int) $id);
    }

    private function liveWooCommercePostIdFor(Product $product): ?int
    {
        $id = DB::table('product_platform_shops')
            ->join('sales_platform_shops', 'sales_platform_shops.id', '=', 'product_platform_shops.sales_platform_shop_id')
            ->join('sales_platforms', 'sales_platforms.id', '=', 'sales_platform_shops.sales_platform_id')
            ->where('sales_platforms.code', 'woocommerce')
            ->where('product_platform_shops.status', 'live')
            ->where('product_platform_shops.product_id', $product->id)
            ->whereNotNull('product_platform_shops.platform_item_id')
            ->value('product_platform_shops.platform_item_id');

        return $id !== null ? (int) $id : null;
    }

    private function shopForProduct(Product $product): ?SalesPlatformShop
    {
        $shopId = DB::table('product_platform_shops')
            ->join('sales_platform_shops', 'sales_platform_shops.id', '=', 'product_platform_shops.sales_platform_shop_id')
            ->join('sales_platforms', 'sales_platforms.id', '=', 'sales_platform_shops.sales_platform_id')
            ->where('sales_platforms.code', 'woocommerce')
            ->where('product_platform_shops.product_id', $product->id)
            ->value('sales_platform_shops.id');

        return $shopId ? SalesPlatformShop::find($shopId) : null;
    }
}
