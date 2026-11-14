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
use App\Services\Catalog\LocaleFallback;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Phase 2 of "นำเข้าข้อมูลจาก {platform}" — the listing's images (detail.images,
 * from the platform API) into the PIM gallery (`pgallery`, a JSON list of
 * public-disk paths). Images are DOWNLOADED into storage/public/
 * product-attributes (same place + 4 MB image limit as the edit page's upload,
 * ProductController::uploadAttributeFile()) instead of storing the platform's
 * CDN URLs, which can expire / be hotlink-blocked and are what push re-uploads
 * anyway. Only URLs present in the cached detail are accepted (no arbitrary
 * fetches). Written as the base value (channel NULL, locale th for a locale-based attribute / NULL otherwise — LocaleFallback::baseLocaleIdFor()) — that's
 * how every existing gallery row is stored and what the push reads; `pimage`
 * (legacy single image) gets the first image when it is still empty. Same
 * audit / no-auto-sync behaviour as ListingImportService.
 */
class ListingImageImportService
{
    public const GALLERY = 'pgallery';

    public const SINGLE = 'pimage';

    /**
     * same cap as the edit page (ProductController::MAX_GALLERY_IMAGES) — the gallery is shared by every
     * platform, so it follows the strictest one: Lazada 8 (Shopee / TikTok take 9)
     */
    public const MAX_IMAGES = 8;

    /** where uploads (ProductController::uploadAttributeFile) and downloads land on the public disk */
    private const UPLOAD_DIR = 'product-attributes/';

    private const MAX_BYTES = 4 * 1024 * 1024;

    /** same floor as ProductController::MIN_IMAGE_DIMENSION (the upload endpoint's check) */
    private const MIN_DIMENSION = 300;

    /** a gallery-editor upload must be added (saveGallery) within this long after it was uploaded */
    private const UPLOAD_MAX_AGE_SECONDS = 24 * 3600;

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
        $base = ['status' => 'ready', 'reason' => null, 'attribute' => $attribute?->code, 'max' => self::MAX_IMAGES, 'current' => [], 'source' => $source, 'default_mode' => 'replace'];

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

        $room = $mode === 'append' ? self::MAX_IMAGES - count($plan['current']) : self::MAX_IMAGES;
        if (count(array_unique($urls)) > $room) {
            throw ValidationException::withMessages(['urls' => $mode === 'append'
                ? 'แกลเลอรีมีได้ไม่เกิน '.self::MAX_IMAGES.' รูป — มีอยู่แล้ว '.count($plan['current']).' รูป ต่อท้ายได้อีก '.max($room, 0).' รูป'
                : 'แกลเลอรีมีได้ไม่เกิน '.self::MAX_IMAGES.' รูป — เลือกไว้ '.count(array_unique($urls)).' รูป']);
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
                ['product_id' => $product->id, 'attribute_id' => $gallery->id, 'attribute_group_id' => $groupId, 'channel_id' => null, 'locale_id' => LocaleFallback::baseLocaleIdFor($gallery)],
                ['value' => json_encode($newPaths)],
            );

            // legacy single image — fill only when empty (never overwrite a chosen one)
            $single = Attribute::where('code', self::SINGLE)->first();
            if ($single && $this->access->canEditAttributeAcrossFamilies($user, $single)) {
                $keys = ['product_id' => $product->id, 'attribute_id' => $single->id, 'attribute_group_id' => $this->families->primaryGroupIdFor($single->id, $familyIds), 'channel_id' => null, 'locale_id' => LocaleFallback::baseLocaleIdFor($single)];
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

    /**
     * The PIM gallery as the step's gallery editor sees it — works without a matched listing.
     *
     * @return array{status: string, reason: ?string, attribute_id: ?int, max: int, current: list<array{path: string, url: string, width: ?int, height: ?int, bytes: ?int}>}
     */
    public function gallery(Product $product, ?User $user): array
    {
        $attribute = Attribute::where('code', self::GALLERY)->first();
        $base = ['status' => 'ready', 'reason' => null, 'attribute_id' => $attribute?->id, 'max' => self::MAX_IMAGES, 'current' => []];

        if ($attribute === null || $attribute->type !== 'gallery') {
            return ['status' => 'unsupported', 'reason' => 'ไม่พบ attribute แกลเลอรี (pgallery) ใน PIM'] + $base;
        }
        $groupId = $this->families->primaryGroupIdFor($attribute->id, $this->families->effectiveFamilyIds($product));
        if ($groupId === null) {
            return ['status' => 'not_in_family', 'reason' => 'attribute แกลเลอรีไม่อยู่ในตระกูล (family) ของสินค้า'] + $base;
        }
        $base['current'] = array_map(
            fn (string $path) => $this->describe($path),
            $this->currentPaths($product, $attribute, $groupId),
        );
        if (! $this->access->canEditAttributeAcrossFamilies($user, $attribute)) {
            return ['status' => 'no_permission', 'reason' => 'ไม่มีสิทธิ์แก้ไขรูปภาพของสินค้า'] + $base;
        }

        return $base;
    }

    /**
     * Saves the gallery editor's result (reorder / remove / newly uploaded) as the whole new
     * `pgallery` list. A path is accepted only if it's already in the gallery or is a file that
     * exists in the upload dir (uploaded via ProductController::uploadAttributeFile()) — so the
     * request can't point the gallery at arbitrary files. Same write/audit shape as apply().
     *
     * @param  list<string>  $paths
     * @return array{saved: int}
     */
    public function saveGallery(Product $product, array $paths, ?User $user): array
    {
        $state = $this->gallery($product, $user);
        if ($state['status'] !== 'ready') {
            throw ValidationException::withMessages(['paths' => $state['reason']]);
        }

        $gallery = Attribute::where('code', self::GALLERY)->first();
        $familyIds = $this->families->effectiveFamilyIds($product);
        $groupId = $this->families->primaryGroupIdFor($gallery->id, $familyIds);
        $currentPaths = $this->currentPaths($product, $gallery, $groupId);

        $newPaths = array_values(array_unique($paths));
        if (count($newPaths) > self::MAX_IMAGES) {
            throw ValidationException::withMessages(['paths' => 'แกลเลอรีมีได้ไม่เกิน '.self::MAX_IMAGES.' รูป']);
        }
        foreach ($newPaths as $path) {
            if (! in_array($path, $currentPaths, true) && ! $this->isFreshImageUpload($path)) {
                throw ValidationException::withMessages(['paths' => 'มีรูปที่ไม่ได้อยู่ในแกลเลอรีหรือยังอัปโหลดไม่สำเร็จ — โหลดใหม่แล้วลองอีกครั้ง']);
            }
        }
        if ($newPaths === $currentPaths) {
            return ['saved' => count($newPaths)];
        }

        DB::transaction(function () use ($product, $gallery, $groupId, $familyIds, $currentPaths, $newPaths, $user) {
            $old = [self::GALLERY => $currentPaths === [] ? null : json_encode($currentPaths)];
            $new = [self::GALLERY => $newPaths === [] ? null : json_encode($newPaths)];
            $keys = ['product_id' => $product->id, 'attribute_id' => $gallery->id, 'attribute_group_id' => $groupId, 'channel_id' => null, 'locale_id' => LocaleFallback::baseLocaleIdFor($gallery)];
            $newPaths === []
                ? ProductValue::where($keys)->delete()
                : ProductValue::updateOrCreate($keys, ['value' => json_encode($newPaths)]);

            // legacy single image — fill only when empty (never overwrite a chosen one), same as apply()
            $single = Attribute::where('code', self::SINGLE)->first();
            if ($newPaths !== [] && $single && $this->access->canEditAttributeAcrossFamilies($user, $single)) {
                $singleKeys = ['product_id' => $product->id, 'attribute_id' => $single->id, 'attribute_group_id' => $this->families->primaryGroupIdFor($single->id, $familyIds), 'channel_id' => null, 'locale_id' => LocaleFallback::baseLocaleIdFor($single)];
                if (trim((string) ProductValue::where($singleKeys)->value('value')) === '') {
                    ProductValue::updateOrCreate($singleKeys, ['value' => $newPaths[0]]);
                    $old[self::SINGLE] = null;
                    $new[self::SINGLE] = $newPaths[0];
                }
            }

            AuditLog::record('product_gallery_edited', $product, $old, $new + ['_source' => 'Product Mapping · แกลเลอรี']);
            $product->touch();
        });

        event(new ProductDataChanged($product->id, (bool) $product->enabled, skipMarketplaceAutoSync: true));

        return ['saved' => count($newPaths)];
    }

    /**
     * A path the gallery editor may add that isn't in the gallery yet: a file just uploaded through
     * ProductController::uploadAttributeFile() — so it must sit in the upload dir, be a real image
     * (same type / ≤ 4 MB / ≥ 300px rules as that endpoint) and be recent. Uploads aren't tied to a
     * product, so the age limit is what stops pointing this gallery at another product's old file.
     */
    private function isFreshImageUpload(string $path): bool
    {
        $disk = Storage::disk('public');
        if (! str_starts_with($path, self::UPLOAD_DIR) || str_contains($path, '..') || ! $disk->exists($path)) {
            return false;
        }
        if ($disk->size($path) > self::MAX_BYTES || $disk->lastModified($path) < time() - self::UPLOAD_MAX_AGE_SECONDS) {
            return false;
        }
        $info = @getimagesize($disk->path($path));

        return $info !== false
            && isset(self::MIME_EXT[$info['mime']])
            && $info[0] >= self::MIN_DIMENSION
            && $info[1] >= self::MIN_DIMENSION;
    }

    /**
     * url + pixel size + bytes of one gallery file, so the editor can check it against each
     * platform's image rules (Lazada 330–6500px ≤ 6 MB, Shopee 1:1 / 3:4, TikTok ≥ 300px)
     *
     * @return array{path: string, url: string, width: ?int, height: ?int, bytes: ?int}
     */
    private function describe(string $path): array
    {
        $disk = Storage::disk('public');
        $width = $height = $bytes = null;
        if ($disk->exists($path)) {
            $bytes = $disk->size($path);
            $info = @getimagesize($disk->path($path));
            if ($info) {
                [$width, $height] = $info;
            }
        }

        return ['path' => $path, 'url' => $disk->url($path), 'width' => $width, 'height' => $height, 'bytes' => $bytes];
    }

    /** @return list<string> */
    private function currentPaths(Product $product, Attribute $gallery, ?int $groupId): array
    {
        $query = ProductValue::where('product_id', $product->id)->where('attribute_id', $gallery->id)
            ->where('attribute_group_id', $groupId)->whereNull('channel_id');
        $raw = ($gallery->is_locale_based ? $query->inLocale(LocaleFallback::baseLocaleId()) : $query->whereNull('locale_id'))
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
