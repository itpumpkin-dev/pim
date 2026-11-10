<?php

namespace App\Services\Marketplace\Listings;

use App\Events\ProductDataChanged;
use App\Models\Attribute;
use App\Models\AuditLog;
use App\Models\MarketplaceListing;
use App\Models\MarketplaceListingDetail;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\User;
use App\Services\Catalog\AttributeAccessPolicy;
use App\Services\Catalog\EffectiveFamilyAttributeResolver;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Phase 2 of "นำเข้าข้อมูลจาก {platform}" — the listing's images (detail.images,
 * from the platform API) into the PIM gallery (`pgallery`, a JSON list of
 * public-disk paths). Images are DOWNLOADED into storage/public/
 * product-attributes (same place + 4 MB image limit as the edit page's upload,
 * ProductController::uploadAttributeFile()) instead of storing the platform's
 * CDN URLs, which can expire / be hotlink-blocked and are what push re-uploads
 * anyway. Only URLs present in the cached detail are accepted (no arbitrary
 * fetches). Written as the global value (channel NULL, locale NULL) — that's
 * how every existing gallery row is stored and what the push reads; `pimage`
 * (legacy single image) gets the first image when it is still empty. Same
 * audit / no-auto-sync behaviour as ListingImportService.
 */
class ListingImageImportService
{
    public const GALLERY = 'pgallery';

    public const SINGLE = 'pimage';

    private const MAX_BYTES = 4 * 1024 * 1024;

    private const MIME_EXT = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];

    public function __construct(
        private readonly EffectiveFamilyAttributeResolver $families,
        private readonly AttributeAccessPolicy $access,
    ) {}

    /**
     * @return array{status: string, reason: ?string, attribute: ?string, current: list<array{path: string, url: string}>, source: list<string>, default_mode: string}
     */
    public function plan(Product $product, MarketplaceListingDetail $detail, ?User $user): array
    {
        $source = array_values(array_filter((array) ($detail->images ?? []), fn ($u) => is_string($u) && preg_match('~^https?://~i', $u)));
        $attribute = Attribute::where('code', self::GALLERY)->first();
        $base = ['status' => 'ready', 'reason' => null, 'attribute' => $attribute?->code, 'current' => [], 'source' => $source, 'default_mode' => 'replace'];

        if ($attribute === null || $attribute->type !== 'gallery') {
            return ['status' => 'unsupported', 'reason' => 'ไม่พบ attribute แกลเลอรี (pgallery) ใน PIM'] + $base;
        }
        $groupId = $this->families->primaryGroupIdFor($attribute->id, $this->families->effectiveFamilyIds($product));
        if ($groupId === null) {
            return ['status' => 'not_in_family', 'reason' => 'attribute แกลเลอรีไม่อยู่ในตระกูล (family) ของสินค้า'] + $base;
        }
        if (! $this->access->canEditAttributeAcrossFamilies($user, $attribute)) {
            return ['status' => 'no_permission', 'reason' => 'ไม่มีสิทธิ์แก้ไขรูปภาพของสินค้า'] + $base;
        }

        $current = array_map(fn (string $path) => ['path' => $path, 'url' => Storage::disk('public')->url($path)], $this->currentPaths($product, $attribute, $groupId));
        $base['current'] = $current;
        // gallery ยังว่าง = แทนที่, มีรูปอยู่แล้ว = ต่อท้าย (ผู้ใช้เปลี่ยนได้)
        $base['default_mode'] = $current === [] ? 'replace' : 'append';

        if ($source === []) {
            return ['status' => 'empty', 'reason' => 'listing นี้ไม่มีรูปภาพ'] + $base;
        }

        return $base;
    }

    /**
     * @param  list<string>  $urls  chosen images, in the order they should appear
     * @param  'replace'|'append'  $mode
     * @return array{written: int, failed: list<string>}
     */
    public function apply(Product $product, MarketplaceListing $listing, MarketplaceListingDetail $detail, array $urls, string $mode, ?User $user): array
    {
        $plan = $this->plan($product, $detail, $user);
        if ($plan['status'] !== 'ready') {
            return ['written' => 0, 'failed' => $urls];
        }

        $allowed = array_flip($plan['source']);
        $paths = [];
        $failed = [];
        foreach (array_values(array_unique($urls)) as $url) {
            if (! isset($allowed[$url])) {
                $failed[] = $url;

                continue;
            }
            $path = $this->download($url);
            $path === null ? $failed[] = $url : $paths[] = $path;
        }
        if ($paths === []) {
            return ['written' => 0, 'failed' => $failed];
        }

        $gallery = Attribute::where('code', self::GALLERY)->first();
        $familyIds = $this->families->effectiveFamilyIds($product);
        $groupId = $this->families->primaryGroupIdFor($gallery->id, $familyIds);
        $currentPaths = $this->currentPaths($product, $gallery, $groupId);
        $newPaths = $mode === 'append' ? array_values(array_unique([...$currentPaths, ...$paths])) : $paths;

        DB::transaction(function () use ($product, $listing, $gallery, $groupId, $familyIds, $currentPaths, $newPaths, $user) {
            $old = [self::GALLERY => $currentPaths === [] ? null : json_encode($currentPaths)];
            $new = [self::GALLERY => json_encode($newPaths)];
            ProductValue::updateOrCreate(
                ['product_id' => $product->id, 'attribute_id' => $gallery->id, 'attribute_group_id' => $groupId, 'channel_id' => null, 'locale_id' => null],
                ['value' => json_encode($newPaths)],
            );

            // legacy single image — fill only when empty (never overwrite a chosen one)
            $single = Attribute::where('code', self::SINGLE)->first();
            if ($single && $this->access->canEditAttributeAcrossFamilies($user, $single)) {
                $keys = ['product_id' => $product->id, 'attribute_id' => $single->id, 'attribute_group_id' => $this->families->primaryGroupIdFor($single->id, $familyIds), 'channel_id' => null, 'locale_id' => null];
                if (trim((string) ProductValue::where($keys)->value('value')) === '') {
                    ProductValue::updateOrCreate($keys, ['value' => $newPaths[0]]);
                    $old[self::SINGLE] = null;
                    $new[self::SINGLE] = $newPaths[0];
                }
            }

            AuditLog::record('marketplace_listing_images_imported', $product, $old, $new + [
                '_source' => "{$listing->shop->name} · item {$listing->item_id}",
            ]);
            $product->touch();
        });

        event(new ProductDataChanged($product->id, (bool) $product->enabled, skipMarketplaceAutoSync: true));

        return ['written' => count($paths), 'failed' => $failed];
    }

    /** @return list<string> */
    private function currentPaths(Product $product, Attribute $gallery, ?int $groupId): array
    {
        $raw = ProductValue::where('product_id', $product->id)->where('attribute_id', $gallery->id)
            ->where('attribute_group_id', $groupId)->whereNull('channel_id')->whereNull('locale_id')
            ->value('value');
        $paths = json_decode((string) $raw, true);

        return is_array($paths) ? array_values(array_filter($paths, 'is_string')) : [];
    }

    /** downloads one platform image into the public disk; null when it isn't a real image ≤ 4 MB */
    private function download(string $url): ?string
    {
        try {
            $response = Http::timeout(20)->retry(1, 500, throw: false)->get($url);
        } catch (\Throwable) {
            return null;
        }
        if (! $response->successful()) {
            return null;
        }

        $body = $response->body();
        if ($body === '' || strlen($body) > self::MAX_BYTES) {
            return null;
        }
        $info = @getimagesizefromstring($body);
        $ext = $info ? (self::MIME_EXT[$info['mime']] ?? null) : null;
        if ($ext === null) {
            return null;
        }

        $path = 'product-attributes/'.Str::random(40).'.'.$ext;

        return Storage::disk('public')->put($path, $body) ? $path : null;
    }
}
